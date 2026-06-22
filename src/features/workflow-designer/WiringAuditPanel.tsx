// WHY THIS COMPONENT EXISTS:
// Every studio in InfinityProductOS (Business Rules, Calculation Engine, API Designer,
// Reconciliation, Reports) produces named artifacts with token codes. Workflow nodes
// reference those artifacts via orchestration_steps — "at this node, invoke THIS rule."
// Without wiring, a step fires as a no-op: the executor logs [WARN] and walks past it.
//
// ~35 seeded RTP/FedNow workflows have steps typed as INVOKE_RULE or INVOKE_API with
// no target set. This panel gives designers a single view of every such gap across
// all workflows, with inline dropdowns to assign the target and one "Apply Wiring"
// button to persist all changes at once.
//
// WHAT BREAKS IF REMOVED: Designers have no way to discover which workflow nodes are
// silently no-ops. They would have to click every node in every workflow manually.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface UnwiredStep {
  node_id:     string;
  node_title:  string;
  step_index:  number;
  action:      string;
  step_kind:   'RULE' | 'FORMULA' | 'API' | 'WORKFLOW';
  description: string;
}

interface UnwiredWorkflow {
  workflow_id:   string;
  workflow_name: string;
  unwired_steps: UnwiredStep[];
}

interface AuditData {
  workflows:     UnwiredWorkflow[];
  total_unwired: number;
  options: {
    rules:     { value: string; label: string }[];
    formulas:  { value: string; label: string }[];
    apis:      { value: string; label: string }[];
    workflows: { value: string; label: string }[];
  };
}

// Patch state: keyed by `${node_id}::${step_index}`, value = chosen target token/name
type PatchMap = Record<string, string>;

const STEP_KIND_COLOR: Record<string, string> = {
  RULE:     'bg-violet-50 text-violet-700 border-violet-200',
  FORMULA:  'bg-blue-50 text-blue-700 border-blue-200',
  API:      'bg-amber-50 text-amber-700 border-amber-200',
  WORKFLOW: 'bg-slate-50 text-slate-600 border-slate-200',
};

const STEP_KIND_LABEL: Record<string, string> = {
  RULE:     'Business Rule',
  FORMULA:  'Formula',
  API:      'API',
  WORKFLOW: 'Sub-Workflow',
};

interface WiringAuditPanelProps {
  onClose: () => void;
}

export const WiringAuditPanel: React.FC<WiringAuditPanelProps> = ({ onClose }) => {
  const [patches, setPatches] = useState<PatchMap>({});
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<AuditData>({
    queryKey: ['wiring-audit'],
    queryFn: async () => {
      const res = await apiClient.get('/workflows/wiring-audit');
      return res.data;
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      // Build the patches array from PatchMap
      const patchList = Object.entries(patches).map(([key, target]) => {
        const [node_id, step_index_str, step_kind] = key.split('::');
        return { node_id, step_index: parseInt(step_index_str), target, step_kind };
      });
      const res = await apiClient.patch('/workflows/wiring-audit/apply', patchList);
      return res.data;
    },
    onSuccess: (result) => {
      setSavedCount(result.applied);
      setPatches({});
      queryClient.invalidateQueries({ queryKey: ['wiring-audit'] });
    },
  });

  const patchKey = (step: UnwiredStep) => `${step.node_id}::${step.step_index}::${step.step_kind}`;

  const pendingCount = Object.keys(patches).length;
  const totalRemaining = (data?.total_unwired ?? 0) - pendingCount;

  const getOptions = (kind: string) => {
    if (!data) return [];
    if (kind === 'RULE')    return data.options.rules;
    if (kind === 'FORMULA') return data.options.formulas;
    if (kind === 'API')     return data.options.apis;
    return data.options.workflows;
  };

  return (
    <div className="glass-card rounded-2xl bg-white/90 backdrop-blur-md border border-white/30 shadow-glass overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-800 to-slate-700">
        <div>
          <h2 className="text-sm font-extrabold text-white">🔗 Wiring Audit</h2>
          <p className="text-[10px] text-slate-300 mt-0.5">
            Steps that need a target before they can fire at runtime
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
      </div>

      {/* Summary bar */}
      {data && (
        <div className="flex items-center gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[11px] font-bold text-slate-700">
              {data.total_unwired} unwired step{data.total_unwired !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-slate-300 text-[10px]">across</span>
          <span className="text-[11px] font-bold text-slate-700">
            {data.workflows.length} workflow{data.workflows.length !== 1 ? 's' : ''}
          </span>
          {pendingCount > 0 && (
            <>
              <span className="ml-auto text-[11px] font-bold text-indigo-600">
                {pendingCount} pending
              </span>
              <button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold shadow transition-colors disabled:opacity-50"
              >
                {applyMutation.isPending ? 'Saving…' : '✓ Apply Wiring'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Success banner */}
      {savedCount !== null && (
        <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-[11px] font-semibold text-green-800">
          ✓ {savedCount} step{savedCount !== 1 ? 's' : ''} wired and saved.{' '}
          <button className="underline text-[10px]" onClick={() => setSavedCount(null)}>Dismiss</button>
        </div>
      )}

      {/* Content */}
      <div className="overflow-y-auto max-h-[600px] p-5 space-y-4">
        {isLoading && (
          <div className="text-center py-10 text-slate-400 text-[12px]">Scanning all workflows…</div>
        )}
        {isError && (
          <div className="text-center py-6 text-red-500 text-[12px]">Failed to load audit. Is the backend running?</div>
        )}
        {data && data.workflows.length === 0 && (
          <div className="text-center py-10">
            <div className="text-2xl mb-2">✅</div>
            <p className="text-sm font-bold text-green-700">All workflow steps are wired!</p>
            <p className="text-[11px] text-slate-500 mt-1">Every rule, formula, and API step has a target assigned.</p>
          </div>
        )}
        {data?.workflows.map((wf) => (
          <div key={wf.workflow_id} className="border border-slate-200 rounded-xl overflow-hidden">
            {/* Workflow header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <div>
                <span className="text-[12px] font-extrabold text-slate-800">{wf.workflow_name}</span>
                <span className="ml-2 text-[10px] font-mono text-slate-400">{wf.workflow_id}</span>
              </div>
              <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                {wf.unwired_steps.length} unwired
              </span>
            </div>

            {/* Steps */}
            <div className="divide-y divide-slate-50">
              {wf.unwired_steps.map((step) => {
                const key = patchKey(step);
                const chosen = patches[key] ?? '';
                const options = getOptions(step.step_kind);
                return (
                  <div key={key} className="flex items-center gap-3 px-4 py-3">
                    {/* Step kind badge */}
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border whitespace-nowrap ${STEP_KIND_COLOR[step.step_kind]}`}>
                      {STEP_KIND_LABEL[step.step_kind]}
                    </span>

                    {/* Node + description */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold text-slate-700 truncate">{step.node_title}</div>
                      {step.description && (
                        <div className="text-[10px] text-slate-400 truncate">{step.description}</div>
                      )}
                    </div>

                    {/* Target picker */}
                    <select
                      value={chosen}
                      onChange={e => {
                        const val = e.target.value;
                        if (val) setPatches(prev => ({ ...prev, [key]: val }));
                        else {
                          const next = { ...patches };
                          delete next[key];
                          setPatches(next);
                        }
                      }}
                      className={`text-[10px] border rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400 min-w-[180px] max-w-[220px] ${
                        chosen ? 'border-indigo-400 text-indigo-700 bg-indigo-50' : 'border-slate-200 text-slate-500 bg-white'
                      }`}
                    >
                      <option value="">— select target —</option>
                      {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
