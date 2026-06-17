import React, { useCallback, useState, useEffect } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  addEdge, 
  applyNodeChanges, 
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  Node,
  Edge
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { WorkflowNode } from './WorkflowNode';
import { apiClient } from '../../api/client';
import { NodePropertiesDrawer } from './NodePropertiesDrawer';
import { usePlatformStore } from '../../store/usePlatformStore';

const nodeTypes = { customBankingNode: WorkflowNode };

export const WorkflowCanvas: React.FC = () => {
  const { 
    activeWorkflowProductContext,
    activeWorkflowSubproductContext,
    setWorkflowContexts,
    workflowDraft,
    setWorkflowDraft,
    workflowReturnStepId,
    setWorkflowReturnStepId,
    setActiveModule
  } = usePlatformStore();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Inbound & Outbound states
  const [inboundTemplate, setInboundTemplate] = useState<string>('Fedwire_Pacs008_Import');
  const [associatedAgent, setAssociatedAgent] = useState<string>('Pacs008_Validator_Agent');
  const [outboundReport, setOutboundReport] = useState<string>('Daily_Ledger_Balance');

  // Load products (L2) and subproducts (L3) context lists
  const { data: productsData } = useQuery({
    queryKey: ['masters-products'],
    queryFn: async () => (await apiClient.get('/masters/products')).data
  });

  const { data: subproductsData } = useQuery({
    queryKey: ['masters-subproducts'],
    queryFn: async () => (await apiClient.get('/masters/subproducts')).data
  });

  const { data: workflows, isLoading, error } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => (await apiClient.get('/workflows/')).data
  });

  // Fetch ingestion templates for Inbound Config
  const { data: ingestionTemplates } = useQuery({
    queryKey: ['ingestion-templates'],
    queryFn: async () => (await apiClient.get('/templates/')).data
  });

  // Fetch report templates for Outbound Config
  const { data: reportTemplates } = useQuery({
    queryKey: ['report-templates'],
    queryFn: async () => (await apiClient.get('/reporting/templates')).data
  });

  // Restore draft state or load backend state on mount
  useEffect(() => {
    if (workflowDraft) {
      setNodes(workflowDraft.nodes || []);
      setEdges(workflowDraft.edges || []);
      if (workflowReturnStepId) {
        const matchingNode = (workflowDraft.nodes || []).find((n: Node) => n.id === workflowReturnStepId);
        if (matchingNode) {
          setSelectedNode(matchingNode);
        }
        setWorkflowReturnStepId(null);
      }
    } else if (workflows && workflows.length > 0) {
      const activeWorkflow = workflows[0];
      
      const mappedNodes: Node[] = (activeWorkflow.nodes || []).map((n: any) => ({
        id: n.node_id,
        type: 'customBankingNode',
        position: { x: n.canvas_x_position || Math.random() * 300, y: n.canvas_y_position || Math.random() * 300 },
        data: { id: n.node_code, seq: n.sequence_number, title: n.node_title, slaDays: n.sla_days || 1, orchestration_steps: n.orchestration_steps, screen_template: n.screen_template, required_documents: n.required_documents }
      }));

      const mappedEdges: Edge[] = (activeWorkflow.edges || []).map((e: any) => ({
        id: e.edge_id,
        source: e.source_node_id,
        target: e.target_node_id,
        animated: true,
        style: { stroke: '#94A3B8', strokeWidth: 2 }
      }));

      setNodes(mappedNodes);
      setEdges(mappedEdges);
    }
  }, [workflows, workflowDraft]);

  // Save changes locally in Zustand draft store on modifications
  const saveDraft = (newNodes: Node[], newEdges: Edge[]) => {
    setWorkflowDraft({ nodes: newNodes, edges: newEdges });
  };

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      saveDraft(updated, edges);
      return updated;
    });
  }, [edges]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => {
      const updated = applyEdgeChanges(changes, eds);
      saveDraft(nodes, updated);
      return updated;
    });
  }, [nodes]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const updated = addEdge({ ...params, animated: true, style: { stroke: '#6366F1', strokeWidth: 2 } }, eds);
      saveDraft(nodes, updated);
      return updated;
    });
  }, [nodes]);

  // --- NODE MUTATIONS (ADD, DELETE, EDIT) ---
  const handleAddNewNode = (type: 'STEP' | 'SUB_WORKFLOW' | 'DECISION') => {
    const id = `NODE-${Math.floor(Math.random() * 9000) + 1000}`;
    const seq = (nodes.length + 1) * 10;
    
    let title = 'New Step Name';
    if (type === 'SUB_WORKFLOW') title = 'Nested Sub-Workflow';
    if (type === 'DECISION') title = 'Branch Condition';

    const newNode: Node = {
      id,
      type: 'customBankingNode',
      position: { x: 100 + (nodes.length * 40), y: 150 + (nodes.length * 20) },
      data: { 
        id, 
        seq, 
        title, 
        slaDays: 1, 
        orchestration_steps: [], 
        screen_template: '', 
        required_documents: [] 
      }
    };
    
    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes);
    saveDraft(updatedNodes, edges);
    setSelectedNode(newNode);
  };

  const handleDeleteNode = (id: string) => {
    const updatedNodes = nodes.filter(n => n.id !== id);
    const updatedEdges = edges.filter(e => e.source !== id && e.target !== id);
    setNodes(updatedNodes);
    setEdges(updatedEdges);
    saveDraft(updatedNodes, updatedEdges);
    if (selectedNode?.id === id) {
      setSelectedNode(null);
    }
  };

  const handleUpdateNodeData = (id: string, updatedData: any) => {
    const updatedNodes = nodes.map(n => {
      if (n.id === id) {
        return { ...n, data: { ...n.data, ...updatedData } };
      }
      return n;
    });
    setNodes(updatedNodes);
    saveDraft(updatedNodes, edges);
  };

  if (isLoading) {
    return (
      <div className="flex h-[600px] w-full flex-col items-center justify-center text-slate-500 font-semibold bg-white/50 backdrop-blur-md border border-white/20 rounded-2xl shadow-glass">
        <span className="animate-pulse text-xs font-bold tracking-widest uppercase text-slate-400">Loading Process Blueprint...</span>
      </div>
    );
  }

  // Sort nodes by sequence number for the textual grid view
  const sortedSteps = [...nodes].sort((a, b) => (a.data.seq || 0) - (b.data.seq || 0));

  return (
    <div className="w-full flex flex-col gap-6 p-6">
      
      {/* 📂 PRODUCT/SUBPRODUCT CONTEXT SELECTORS */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-2xl shadow-glass">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Product:</span>
            <select 
              value={activeWorkflowProductContext || ''} 
              onChange={(e) => setWorkflowContexts(e.target.value || null, activeWorkflowSubproductContext)}
              className="text-[12px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
            >
              <option value="">-- Select Core Product --</option>
              {productsData?.products?.map((p: any) => <option key={p.product_id} value={p.product_name}>{p.product_name}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subproduct:</span>
            <select 
              value={activeWorkflowSubproductContext || ''} 
              onChange={(e) => setWorkflowContexts(activeWorkflowProductContext, e.target.value || null)}
              className="text-[12px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
            >
              <option value="">-- Select Variation --</option>
              {subproductsData?.subproducts?.map((sp: any) => <option key={sp.subproduct_id} value={sp.subproduct_name}>{sp.subproduct_name}</option>)}
            </select>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">
          Process Flow Studio Context
        </div>
      </div>

      {/* 📥 INBOUND & OUTBOUND CONFIG GATES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-2xl shadow-glass flex flex-col gap-2.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">
            📥 Inbound Configuration Gate
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Import File Template</label>
              <select value={inboundTemplate} onChange={(e) => setInboundTemplate(e.target.value)} className="w-full text-[11px] border border-slate-200 rounded-lg p-2 outline-none focus:border-indigo-500 bg-white">
                <option value="Fedwire_Pacs008_Import">Fedwire Pacs008 XML Import</option>
                <option value="Swift_MT103_Import">Swift MT103 Text Import</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Validation Agent</label>
              <select value={associatedAgent} onChange={(e) => setAssociatedAgent(e.target.value)} className="w-full text-[11px] border border-slate-200 rounded-lg p-2 outline-none focus:border-indigo-500 bg-white">
                <option value="Pacs008_Validator_Agent">Pacs008 Intelligent Validator Agent</option>
                <option value="MT103_Field_Verifier">MT103 Schema Compliance Agent</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-2xl shadow-glass flex flex-col gap-2.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">
            📤 Outbound Reporting Gate
          </div>
          <div className="flex-1">
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Associated Report Template</label>
            <select value={outboundReport} onChange={(e) => setOutboundReport(e.target.value)} className="w-full text-[11px] border border-slate-200 rounded-lg p-2 outline-none focus:border-indigo-500 bg-white">
              <option value="Daily_Ledger_Balance">Daily Ledger Balances Summary</option>
              <option value="Audit_Trail_Report">Operational Audit Trail Report</option>
            </select>
          </div>
        </div>
      </div>

      {/* VISUAL CANVAS VIEWPORT */}
      <div className="h-[450px] w-full bg-white/85 backdrop-blur-md border border-white/30 rounded-2xl shadow-glass overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-right"
        >
          <Background color="#6366f1" gap={16} style={{ opacity: 0.03 }} />
          <Controls className="bg-white/80 backdrop-blur-md border border-slate-200/50 shadow-glass rounded-xl overflow-hidden" />
          <MiniMap nodeStrokeWidth={3} zoomable pannable className="border border-slate-200/40 shadow-glass rounded-xl bg-white/80" />
        </ReactFlow>

        {/* 🛠️ FLOATING VISUAL TOOLBAR */}
        <div className="absolute top-4 left-4 z-40 bg-white/95 backdrop-blur-md border border-slate-200/60 p-2 rounded-2xl shadow-xl flex flex-col gap-1.5">
          <button 
            onClick={() => handleAddNewNode('STEP')}
            className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:text-indigo-650 hover:bg-slate-50 rounded-xl transition-all"
          >
            <span>➕</span> Add Workflow Step
          </button>
          <button 
            onClick={() => handleAddNewNode('SUB_WORKFLOW')}
            className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:text-indigo-650 hover:bg-slate-50 rounded-xl transition-all border-t border-slate-100/60"
          >
            <span>🔄</span> Add Subworkflow Node
          </button>
          <button 
            onClick={() => handleAddNewNode('DECISION')}
            className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:text-indigo-650 hover:bg-slate-50 rounded-xl transition-all border-t border-slate-100/60"
          >
            <span>🔀</span> Add Decision Split
          </button>
        </div>

        {/* Selected Step Properties Drawer */}
        <NodePropertiesDrawer 
          node={selectedNode} 
          onClose={() => setSelectedNode(null)} 
          onUpdateData={(updated) => selectedNode && handleUpdateNodeData(selectedNode.id, updated)} 
        />
      </div>

      {/* 📊 TEXTUAL SEQUENCE BLUEPRINT GRID */}
      <div className="p-6 bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-2xl shadow-glass flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Textual Sequence Blueprint</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Auditing and managing workflow steps sequentially. Click "Modify" on a step to select it and view its details below.</p>
          </div>
          <button 
            onClick={() => handleAddNewNode('STEP')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold px-3.5 py-1.5 rounded-xl shadow-md shadow-indigo-600/10 active:scale-[0.98] transition-all"
          >
            + Add New Step
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                <th className="py-2.5 px-3">Seq</th>
                <th className="py-2.5 px-3">Step Name</th>
                <th className="py-2.5 px-3">SLA / STP Mode</th>
                <th className="py-2.5 px-3">Assigned User Interface</th>
                <th className="py-2.5 px-3">Assigned Rules</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSteps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">No workflow steps designed yet.</td>
                </tr>
              ) : (
                sortedSteps.map((step) => {
                  const isNodeSelected = selectedNode?.id === step.id;
                  return (
                    <tr 
                      key={step.id} 
                      className={`border-b border-slate-55 hover:bg-slate-50/50 transition-colors cursor-pointer ${
                        isNodeSelected ? 'bg-indigo-50/20 border-l-4 border-l-indigo-500' : ''
                      }`}
                      onClick={() => setSelectedNode(step)}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-slate-400">{step.data.seq}</td>
                      <td className="py-3 px-3 font-bold text-slate-800">{step.data.title}</td>
                      <td className="py-3 px-3">
                        {step.data.stpEnabled ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-100/50 px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider">STP (Realtime)</span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 border border-amber-100/50 px-2 py-0.5 rounded-md font-bold text-[10px]">{step.data.slaDuration || `${step.data.slaDays} Days`}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-indigo-650 text-[11px]">
                        {step.data.screen_template || <span className="text-slate-400 italic text-[11px]">None (Background Task)</span>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {step.data.orchestration_steps?.map((o: any, idx: number) => (
                            <span key={idx} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono text-[9px]">
                              {o.step_type === 'BUSINESS_RULE' ? `Rule:${o.target_token}` : o.step_type}
                            </span>
                          )) || <span className="text-slate-450 italic text-[11px]">None</span>}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => setSelectedNode(step)}
                            className="text-indigo-650 hover:text-indigo-900 font-bold text-[11px] px-2.5 py-1 hover:bg-indigo-50/50 rounded-lg transition-all"
                          >
                            Modify
                          </button>
                          <button 
                            onClick={() => handleDeleteNode(step.id)}
                            className="text-rose-600 hover:text-rose-950 font-bold text-[11px] px-2.5 py-1 hover:bg-rose-50/50 rounded-lg transition-all"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🛠️ STEP DETAIL WORKSPACE: SPLITTED TABLES FOR COGNITIVE BUILDING BLOCKS */}
      {selectedNode ? (
        <div className="p-6 bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-2xl shadow-glass flex flex-col gap-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Selected Step Configuration</span>
              <h3 className="text-[15px] font-extrabold text-slate-800 tracking-tight font-display">
                ⚙️ {selectedNode.data.title} <span className="font-mono text-slate-400 text-xs">(Seq: {selectedNode.data.seq})</span>
              </h3>
            </div>
            <button 
              onClick={() => setSelectedNode(null)} 
              className="text-slate-400 hover:text-slate-600 text-[11px] font-bold border border-slate-200 px-3 py-1 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Close Details
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* 🛡️ DECISION LOGIC & RULES TABLE */}
            <div className="bg-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:shadow-md hover:bg-slate-50/70 transition-all duration-300">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🛡️</span>
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase">Decision Policies & Rules</span>
                </div>
                <button 
                  onClick={() => {
                    setWorkflowReturnStepId(selectedNode.id);
                    setActiveModule('business-rules');
                  }} 
                  className="text-[10px] font-extrabold text-indigo-650 hover:underline bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg"
                >
                  Configure
                </button>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase tracking-wider text-[8px] border-b border-slate-100">
                      <th className="pb-1.5">Rule Token</th>
                      <th className="pb-1.5">Engine Target</th>
                      <th className="pb-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'BUSINESS_RULE').length === 0 ? (
                      <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic">No rules attached to this step.</td></tr>
                    ) : (
                      (selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'BUSINESS_RULE').map((r: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-50">
                          <td className="py-2 font-mono text-indigo-600 font-bold">{r.target_token}</td>
                          <td className="py-2 text-slate-500">Core Decision Engine</td>
                          <td className="py-2 text-right">
                            <button 
                              onClick={() => {
                                setWorkflowReturnStepId(selectedNode.id);
                                setActiveModule('business-rules');
                              }} 
                              className="text-indigo-650 hover:text-indigo-900 font-bold hover:underline"
                            >
                              Modify
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 🧮 CALCULATIONS & FORMULAS TABLE */}
            <div className="bg-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:shadow-md hover:bg-slate-50/70 transition-all duration-300">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🧮</span>
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase">Calculations & Formulas</span>
                </div>
                <button 
                  onClick={() => {
                    setWorkflowReturnStepId(selectedNode.id);
                    setActiveModule('calculation-engine');
                  }} 
                  className="text-[10px] font-extrabold text-emerald-650 hover:underline bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg"
                >
                  Configure
                </button>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase tracking-wider text-[8px] border-b border-slate-100">
                      <th className="pb-1.5">Formula Token</th>
                      <th className="pb-1.5">Calculation Target</th>
                      <th className="pb-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'CALCULATION').length === 0 ? (
                      <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic">No formulas attached to this step.</td></tr>
                    ) : (
                      (selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'CALCULATION').map((c: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-50">
                          <td className="py-2 font-mono text-emerald-650 font-bold">{c.target_token}</td>
                          <td className="py-2 text-slate-500">Math Calculator Engine</td>
                          <td className="py-2 text-right">
                            <button 
                              onClick={() => {
                                setWorkflowReturnStepId(selectedNode.id);
                                setActiveModule('calculation-engine');
                              }} 
                              className="text-emerald-650 hover:text-emerald-900 font-bold hover:underline"
                            >
                              Modify
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 🔌 EXTERNAL CONNECTORS TABLE */}
            <div className="bg-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:shadow-md hover:bg-slate-50/70 transition-all duration-300">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🔌</span>
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase">External Connectors & APIs</span>
                </div>
                <button 
                  onClick={() => {
                    setWorkflowReturnStepId(selectedNode.id);
                    setActiveModule('api-designer');
                  }} 
                  className="text-[10px] font-extrabold text-purple-650 hover:underline bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-lg"
                >
                  Configure
                </button>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase tracking-wider text-[8px] border-b border-slate-100">
                      <th className="pb-1.5">API Webhook</th>
                      <th className="pb-1.5">Description</th>
                      <th className="pb-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'API_CALL').length === 0 ? (
                      <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic">No webhooks attached to this step.</td></tr>
                    ) : (
                      (selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'API_CALL').map((a: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-50">
                          <td className="py-2 font-mono text-purple-650 font-bold">{a.target_token}</td>
                          <td className="py-2 text-slate-500">Outbound API trigger</td>
                          <td className="py-2 text-right">
                            <button 
                              onClick={() => {
                                setWorkflowReturnStepId(selectedNode.id);
                                setActiveModule('api-designer');
                              }} 
                              className="text-purple-650 hover:text-purple-900 font-bold hover:underline"
                            >
                              Modify
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 📋 DOCUMENT CHECKLIST GATES TABLE */}
            <div className="bg-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:shadow-md hover:bg-slate-50/70 transition-all duration-300">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">📋</span>
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase">Document Checklist Gates</span>
                </div>
                <button 
                  onClick={() => {
                    setWorkflowReturnStepId(selectedNode.id);
                    setActiveModule('document-master');
                  }} 
                  className="text-[10px] font-extrabold text-slate-650 hover:underline bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg"
                >
                  Configure
                </button>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase tracking-wider text-[8px] border-b border-slate-100">
                      <th className="pb-1.5">Document Required</th>
                      <th className="pb-1.5">Category</th>
                      <th className="pb-1.5 text-right">Requirement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedNode.data.required_documents || []).length === 0 ? (
                      <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic">No document checklists attached.</td></tr>
                    ) : (
                      (selectedNode.data.required_documents || []).map((d: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-50">
                          <td className="py-2 font-bold text-slate-750">{d.document_name}</td>
                          <td className="py-2 font-mono text-[9px] uppercase text-slate-500">{d.checklist_category}</td>
                          <td className="py-2 text-right">
                            <span className={d.is_mandatory ? 'text-rose-600 font-extrabold text-[9px] bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded' : 'text-slate-500 text-[9px] bg-slate-100 border border-slate-150 px-1.5 py-0.5 rounded'}>
                              {d.is_mandatory ? 'MANDATORY' : 'OPTIONAL'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 📊 BUSINESS REPORTS TABLE */}
            <div className="bg-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:shadow-md hover:bg-slate-50/70 transition-all duration-300">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">📊</span>
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase">Business Reports</span>
                </div>
                <button 
                  onClick={() => {
                    setWorkflowReturnStepId(selectedNode.id);
                    setActiveModule('report-designer');
                  }} 
                  className="text-[10px] font-extrabold text-indigo-650 hover:underline bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg"
                >
                  Configure
                </button>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase tracking-wider text-[8px] border-b border-slate-100">
                      <th className="pb-1.5">Report ID</th>
                      <th className="pb-1.5">Platform Layer</th>
                      <th className="pb-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'REPORT').length === 0 ? (
                      <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic">No reports attached to this step.</td></tr>
                    ) : (
                      (selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'REPORT').map((r: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-50">
                          <td className="py-2 font-mono text-indigo-600 font-bold">{r.target_token}</td>
                          <td className="py-2 text-slate-500">Business BI Engine</td>
                          <td className="py-2 text-right">
                            <button 
                              onClick={() => {
                                setWorkflowReturnStepId(selectedNode.id);
                                setActiveModule('report-designer');
                              }} 
                              className="text-indigo-650 hover:text-indigo-900 font-bold hover:underline"
                            >
                              Modify
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 🔔 EVENT SUBSCRIPTIONS TABLE */}
            <div className="bg-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:shadow-md hover:bg-slate-50/70 transition-all duration-300">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🔔</span>
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase">Events & Triggers</span>
                </div>
                <button 
                  onClick={() => {
                    setWorkflowReturnStepId(selectedNode.id);
                    setActiveModule('event-repository');
                  }} 
                  className="text-[10px] font-extrabold text-amber-650 hover:underline bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg"
                >
                  Configure
                </button>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase tracking-wider text-[8px] border-b border-slate-100">
                      <th className="pb-1.5">Event Type</th>
                      <th className="pb-1.5">Emmiter Module</th>
                      <th className="pb-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'EVENT').length === 0 ? (
                      <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic">No events emitted or consumed.</td></tr>
                    ) : (
                      (selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'EVENT').map((e: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-50">
                          <td className="py-2 font-mono text-amber-650 font-bold">{e.target_token}</td>
                          <td className="py-2 text-slate-500">Event Hub / PubSub</td>
                          <td className="py-2 text-right">
                            <button 
                              onClick={() => {
                                setWorkflowReturnStepId(selectedNode.id);
                                setActiveModule('event-repository');
                              }} 
                              className="text-amber-650 hover:text-amber-900 font-bold hover:underline"
                            >
                              Modify
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 🔄 SUB-WORKFLOW STEPS TABLE */}
            <div className="bg-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:shadow-md hover:bg-slate-50/70 transition-all duration-300">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🔄</span>
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase">Nested Sub-Flows</span>
                </div>
                <button 
                  onClick={() => {
                    setWorkflowReturnStepId(selectedNode.id);
                    setActiveModule('workflow-designer');
                  }} 
                  className="text-[10px] font-extrabold text-blue-650 hover:underline bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg"
                >
                  Configure
                </button>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase tracking-wider text-[8px] border-b border-slate-100">
                      <th className="pb-1.5">Sub-flow Link</th>
                      <th className="pb-1.5">Hierarchy</th>
                      <th className="pb-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'SUB_WORKFLOW').length === 0 ? (
                      <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic">No nested sub-workflows.</td></tr>
                    ) : (
                      (selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'SUB_WORKFLOW').map((s: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-50">
                          <td className="py-2 font-mono text-blue-600 font-bold">{s.target_token}</td>
                          <td className="py-2 text-slate-500">Child Process Layer</td>
                          <td className="py-2 text-right">
                            <button 
                              onClick={() => {
                                setWorkflowReturnStepId(selectedNode.id);
                                setActiveModule('workflow-designer');
                              }} 
                              className="text-blue-650 hover:text-blue-900 font-bold hover:underline"
                            >
                              Modify
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ⚖️ RECONCILIATION TASKS TABLE */}
            <div className="bg-slate-50/40 border border-slate-200/60 p-4 rounded-2xl shadow-sm flex flex-col gap-3 hover:shadow-md hover:bg-slate-50/70 transition-all duration-300">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">⚖️</span>
                  <span className="text-[11px] font-extrabold text-slate-700 uppercase">Reconciliations</span>
                </div>
                <button 
                  onClick={() => {
                    setWorkflowReturnStepId(selectedNode.id);
                    setActiveModule('reconciliation-engine');
                  }} 
                  className="text-[10px] font-extrabold text-cyan-650 hover:underline bg-cyan-50 border border-cyan-100 px-2 py-0.5 rounded-lg"
                >
                  Configure
                </button>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-slate-400 font-bold uppercase tracking-wider text-[8px] border-b border-slate-100">
                      <th className="pb-1.5">Recon ID</th>
                      <th className="pb-1.5">Auditing Target</th>
                      <th className="pb-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'RECONCILIATION').length === 0 ? (
                      <tr><td colSpan={3} className="py-4 text-center text-slate-400 italic">No recon templates assigned.</td></tr>
                    ) : (
                      (selectedNode.data.orchestration_steps || []).filter((o: any) => o.step_type === 'RECONCILIATION').map((rn: any, idx: number) => (
                        <tr key={idx} className="border-b border-slate-50">
                          <td className="py-2 font-mono text-cyan-650 font-bold">{rn.target_token}</td>
                          <td className="py-2 text-slate-500">Automated Recon engine</td>
                          <td className="py-2 text-right">
                            <button 
                              onClick={() => {
                                setWorkflowReturnStepId(selectedNode.id);
                                setActiveModule('reconciliation-engine');
                              }} 
                              className="text-cyan-650 hover:text-cyan-900 font-bold hover:underline"
                            >
                              Modify
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="p-6 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-center text-slate-400 text-xs italic">
          💡 Click on any workflow step node in the visual canvas or textual sequence blueprint above to inspect its dedicated logic configuration tables (Decision Rules, calculations, APIs, documents, reports, events).
        </div>
      )}

    </div>
  );
};