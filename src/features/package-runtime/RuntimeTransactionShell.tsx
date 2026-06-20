// WHY THIS COMPONENT EXISTS (WS-11):
// This is the bank operator's transaction processing UI — the runtime executor shell.
// When a bank deploys Payment Hub, operators don't use Canva studios. They use THIS to:
//   1. Select a live workflow (e.g., "SWIFT Cross-Border Payment")
//   2. Enter transaction data (ISO-bound fields)
//   3. See the workflow progress in real-time (which step passed, which is current)
//   4. Action human-in-loop steps (approve/reject) from the node's attached screen
//   5. Review the execution trace (audit log of what each engine did)
//
// Architecture:
//   - POST /workflows/{id}/execute → starts or resumes; returns result or PAUSED with instance_id
//   - POST /workflows/{id}/resume/{instance_id} → operator supplies decision + context
//   - GET /workflows/instances/list → shows existing PAUSED transactions (queue)
//   - WorkflowExecutionInstance.current_node_id + execution_trace drive the stepper
//
// WHAT BREAKS IF REMOVED:
// Bank operators have no way to process live transactions through the deployed workflows.
// The entire "product launch" concept (design → approve → LIVE → execute) loses its endpoint.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { RuntimeScreenRenderer } from './RuntimeScreenRenderer';

interface Workflow {
  workflow_id: string;
  workflow_name: string;
  description?: string;
  nodes?: WorkflowNode[];
}

interface WorkflowNode {
  node_id: string;
  node_title: string;
  sequence_number: number;
  screen_template?: string;
  is_stp?: boolean;
}

interface ExecutionInstance {
  instance_id: string;
  workflow_id: string;
  current_node_id: string;
  status: 'PAUSED' | 'COMPLETED' | 'FAILED';
  current_context: Record<string, any>;
  execution_trace: string[];
  created_at: string;
  updated_at?: string;
}

type ShellView = 'queue' | 'launcher' | 'running';

export const RuntimeTransactionShell: React.FC = () => {
  const { activeProductContext } = usePlatformStore();
  const qc = useQueryClient();

  const [view, setView] = useState<ShellView>('queue');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [activeInstance, setActiveInstance] = useState<ExecutionInstance | null>(null);
  const [activeNode, setActiveNode] = useState<WorkflowNode | null>(null);
  const [activeScreen, setActiveScreen] = useState<any | null>(null);
  const [launchPayload, setLaunchPayload] = useState<Record<string, string>>({});
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamValue, setNewParamValue] = useState('');
  const [resumeDecision, setResumeDecision] = useState('APPROVED');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch all live workflows (for the workflow picker)
  const { data: workflowsData, isLoading: wfLoading } = useQuery({
    queryKey: ['live-workflows'],
    queryFn: async () => {
      const res = await apiClient.get('/workflows/');
      return res.data as Workflow[];
    },
  });

  // Fetch paused and recent instances (the transaction queue)
  const { data: instancesData, isLoading: instLoading } = useQuery({
    queryKey: ['workflow-instances'],
    queryFn: async () => {
      const res = await apiClient.get('/workflows/instances/list', { params: { limit: 30 } });
      return res.data.instances as ExecutionInstance[];
    },
  });

  // Execute (start) a workflow
  const executeMut = useMutation({
    mutationFn: async ({ workflowId, payload }: { workflowId: string; payload: any }) => {
      const res = await apiClient.post(`/workflows/${workflowId}/execute`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workflow-instances'] });
      if (data.status === 'PAUSED') {
        // Workflow paused at a human-in-loop node — need operator decision
        loadInstance(data);
      } else {
        // Completed in one shot (STP path)
        setActiveInstance({ ...data, status: data.status });
        setView('running');
        setErrorMsg(null);
      }
    },
    onError: (e: any) => setErrorMsg(e.response?.data?.detail ?? 'Execution failed'),
  });

  // Resume a paused workflow instance
  const resumeMut = useMutation({
    mutationFn: async ({ workflowId, instanceId, payload }: { workflowId: string; instanceId: string; payload: any }) => {
      const res = await apiClient.post(`/workflows/${workflowId}/resume/${instanceId}`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workflow-instances'] });
      setActiveInstance(prev => prev ? { ...prev, ...data } : data);
      if (data.status !== 'PAUSED') {
        setActiveNode(null);
        setActiveScreen(null);
      }
    },
    onError: (e: any) => setErrorMsg(e.response?.data?.detail ?? 'Resume failed'),
  });

  // Load a screen for the current node (if the node has screen_template)
  const loadInstance = async (instanceData: any) => {
    setActiveInstance(instanceData);
    setView('running');
    setErrorMsg(null);

    // Find which node is current in the selected workflow
    const currentNode = selectedWorkflow?.nodes?.find(n => n.node_id === instanceData.current_node_id);
    setActiveNode(currentNode ?? null);

    if (currentNode?.screen_template) {
      try {
        const res = await apiClient.get(`/screens/${currentNode.screen_template}`);
        setActiveScreen(res.data);
      } catch {
        setActiveScreen(null);
      }
    } else {
      setActiveScreen(null);
    }
  };

  const openInstance = async (inst: ExecutionInstance) => {
    const wf = workflowsData?.find(w => w.workflow_id === inst.workflow_id);
    setSelectedWorkflow(wf ?? null);
    await loadInstance(inst);
  };

  const addParam = () => {
    if (newParamKey.trim()) {
      setLaunchPayload(prev => ({ ...prev, [newParamKey.trim()]: newParamValue.trim() }));
      setNewParamKey('');
      setNewParamValue('');
    }
  };

  const removeParam = (key: string) => {
    setLaunchPayload(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleLaunch = () => {
    if (!selectedWorkflow) return;
    setErrorMsg(null);
    executeMut.mutate({ workflowId: selectedWorkflow.workflow_id, payload: launchPayload });
  };

  const handleResume = (values: Record<string, any>, action: string) => {
    if (!activeInstance || !selectedWorkflow) return;
    const decision = action === 'SUBMIT' ? resumeDecision : (action === 'CANCEL_SESSION' ? 'REJECTED' : action);
    resumeMut.mutate({
      workflowId: selectedWorkflow.workflow_id,
      instanceId: activeInstance.instance_id,
      payload: { decision, context_update: values },
    });
  };

  const STATUS_COLORS: Record<string, string> = {
    PAUSED: 'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-emerald-100 text-emerald-700',
    FAILED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Runtime Transaction Shell</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Execute live workflows and process transactions in {activeProductContext ?? 'the active package'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('queue')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
              view === 'queue'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            📋 Queue
          </button>
          <button
            onClick={() => { setView('launcher'); setSelectedWorkflow(null); setLaunchPayload({}); }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
              view === 'launcher'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            ▶ New Transaction
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* Queue View — shows PAUSED and recent instances */}
      {view === 'queue' && (
        <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 text-sm">Transaction Queue</h3>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['workflow-instances'] })}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              ↻ Refresh
            </button>
          </div>

          {instLoading ? (
            <div className="text-center text-slate-400 py-12 text-sm">Loading instances…</div>
          ) : !instancesData?.length ? (
            <div className="text-center text-slate-400 py-12">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm font-medium">No transactions yet</p>
              <p className="text-xs text-slate-300 mt-1">Start a new transaction with the ▶ button above</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-6 py-3 text-left">Instance</th>
                  <th className="px-4 py-3 text-left">Workflow</th>
                  <th className="px-4 py-3 text-left">Current Node</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {instancesData.map(inst => (
                  <tr key={inst.instance_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-slate-600">{inst.instance_id.slice(0, 16)}…</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {workflowsData?.find(w => w.workflow_id === inst.workflow_id)?.workflow_name ?? inst.workflow_id}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{inst.current_node_id}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[inst.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {inst.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {inst.created_at ? new Date(inst.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inst.status === 'PAUSED' && (
                        <button
                          onClick={() => openInstance(inst)}
                          className="px-3 py-1 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                          Action →
                        </button>
                      )}
                      {inst.status !== 'PAUSED' && (
                        <button
                          onClick={() => openInstance(inst)}
                          className="px-3 py-1 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Launcher View — pick workflow + set initial payload */}
      {view === 'launcher' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Workflow picker */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-700 text-sm">1. Select Workflow</h3>
            </div>
            <div className="p-4 space-y-2">
              {wfLoading && <div className="text-sm text-slate-400 py-4 text-center">Loading workflows…</div>}
              {workflowsData?.map(wf => (
                <button
                  key={wf.workflow_id}
                  onClick={() => setSelectedWorkflow(wf)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                    selectedWorkflow?.workflow_id === wf.workflow_id
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-800">{wf.workflow_name}</div>
                  {wf.description && (
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{wf.description}</div>
                  )}
                  <div className="text-xs text-slate-400 mt-1">
                    {wf.nodes?.length ?? 0} nodes
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Payload builder + launch */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-700 text-sm">2. Transaction Context</h3>
              <p className="text-xs text-slate-400 mt-0.5">ISO field values injected into the workflow context</p>
            </div>
            <div className="p-4 space-y-3">
              {/* Existing params */}
              {Object.entries(launchPayload).length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {Object.entries(launchPayload).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
                      <span className="font-mono text-indigo-600 font-semibold">{k}</span>
                      <span className="text-slate-400">=</span>
                      <span className="text-slate-700 flex-1 truncate">{v}</span>
                      <button onClick={() => removeParam(k)} className="text-slate-400 hover:text-red-500 text-xs ml-1">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add param form */}
              <div className="flex gap-2">
                <input
                  value={newParamKey}
                  onChange={e => setNewParamKey(e.target.value)}
                  placeholder="field_name"
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 font-mono"
                />
                <input
                  value={newParamValue}
                  onChange={e => setNewParamValue(e.target.value)}
                  placeholder="value"
                  onKeyDown={e => e.key === 'Enter' && addParam()}
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                />
                <button
                  onClick={addParam}
                  className="px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors"
                >
                  + Add
                </button>
              </div>

              {/* Launch button */}
              <div className="pt-3 border-t border-slate-100 mt-4">
                <button
                  onClick={handleLaunch}
                  disabled={!selectedWorkflow || executeMut.isPending}
                  className="w-full py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {executeMut.isPending ? '⟳ Executing…' : '▶ Execute Transaction'}
                </button>
                {!selectedWorkflow && (
                  <p className="text-xs text-slate-400 text-center mt-2">Select a workflow first</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Running View — shows execution state, trace, and current node screen */}
      {view === 'running' && activeInstance && (
        <div className="space-y-4">
          {/* Status banner */}
          <div className={`rounded-2xl border px-6 py-4 flex items-center justify-between ${
            activeInstance.status === 'PAUSED'
              ? 'bg-amber-50 border-amber-200'
              : activeInstance.status === 'COMPLETED'
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {activeInstance.status === 'PAUSED' ? '⏸' : activeInstance.status === 'COMPLETED' ? '✅' : '❌'}
                </span>
                <span className={`text-sm font-bold ${
                  activeInstance.status === 'PAUSED' ? 'text-amber-800'
                    : activeInstance.status === 'COMPLETED' ? 'text-emerald-800' : 'text-red-800'
                }`}>
                  {activeInstance.status === 'PAUSED'
                    ? 'Awaiting operator action'
                    : activeInstance.status === 'COMPLETED'
                    ? 'Transaction completed'
                    : 'Execution failed'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">{activeInstance.instance_id}</p>
            </div>
            <div className="flex gap-2">
              {activeInstance.status === 'PAUSED' && (
                <select
                  value={resumeDecision}
                  onChange={e => setResumeDecision(e.target.value)}
                  className="text-xs border border-amber-300 rounded-lg px-2 py-1.5 bg-white text-amber-800 font-semibold"
                >
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="ESCALATED">ESCALATED</option>
                </select>
              )}
              <button
                onClick={() => setView('queue')}
                className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
              >
                ← Back to Queue
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Left: current node screen or completion message */}
            <div className="col-span-2 bg-white/85 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-700 text-sm">
                  {activeNode ? `📋 ${activeNode.node_title}` : 'Execution Result'}
                </h3>
                {activeNode && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Step {activeNode.sequence_number} • {activeNode.is_stp ? 'STP (auto-processed)' : 'Human-in-loop'}
                  </p>
                )}
              </div>
              <div className="p-6">
                {activeScreen ? (
                  <RuntimeScreenRenderer
                    screenName={activeScreen.screen_name}
                    definition={activeScreen.definition}
                    initialValues={activeInstance.current_context}
                    onSubmit={handleResume}
                    readOnly={activeInstance.status !== 'PAUSED'}
                  />
                ) : (
                  <div className="space-y-3">
                    {/* Show context key-value pairs when no screen */}
                    {Object.entries(activeInstance.current_context ?? {}).length > 0 ? (
                      <div className="divide-y divide-slate-100">
                        {Object.entries(activeInstance.current_context).map(([k, v]) => (
                          <div key={k} className="flex items-start justify-between py-2.5 gap-4">
                            <span className="text-xs font-mono font-semibold text-indigo-600 min-w-0 break-all">{k}</span>
                            <span className="text-xs text-slate-700 text-right break-all">
                              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-8">No screen configured for this node.</p>
                    )}

                    {activeInstance.status === 'PAUSED' && (
                      <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                        <button
                          onClick={() => handleResume({}, 'REJECTED')}
                          disabled={resumeMut.isPending}
                          className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleResume({}, 'APPROVED')}
                          disabled={resumeMut.isPending}
                          className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {resumeMut.isPending ? '⟳ Processing…' : 'Approve & Continue'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: execution trace */}
            <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="font-semibold text-slate-700 text-xs uppercase tracking-wide">Execution Trace</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-96">
                {(activeInstance.execution_trace ?? []).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">No trace yet</p>
                ) : (
                  (activeInstance.execution_trace as string[]).map((line, i) => (
                    <div
                      key={i}
                      className={`text-[10px] font-mono rounded px-2 py-1 leading-relaxed ${
                        line.startsWith('[WARN]')
                          ? 'bg-amber-50 text-amber-700'
                          : line.startsWith('✓')
                          ? 'bg-emerald-50 text-emerald-700'
                          : line.startsWith('❌') || line.includes('ERROR')
                          ? 'bg-red-50 text-red-700'
                          : 'bg-slate-50 text-slate-600'
                      }`}
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
