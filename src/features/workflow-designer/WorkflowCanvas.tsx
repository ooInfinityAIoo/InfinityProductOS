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
  Edge,
  MarkerType,
  ControlButton,
  updateEdge
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { WorkflowNode } from './WorkflowNode';
import { apiClient } from '../../api/client';
import { NodePropertiesDrawer } from './NodePropertiesDrawer';
import { EdgePropertiesDrawer } from './EdgePropertiesDrawer';
import { usePlatformStore } from '../../store/usePlatformStore';
import { DecisionNode } from './DecisionNode';
import { EventNode } from './EventNode';
import { GatewayNode } from './GatewayNode';
import { WorkflowSidebar } from './WorkflowSidebar';
import { ReactFlowProvider, useReactFlow } from 'reactflow';

import { StudioNode } from './StudioNode';

const nodeTypes = { 
  customBankingNode: WorkflowNode, 
  decisionNode: DecisionNode,
  eventNode: EventNode,
  gatewayNode: GatewayNode,
  studioNode: StudioNode
};

// Dynamic, automatic flowchart sequencing helper
const computeSequences = (nodes: Node[], edges: Edge[]) => {
  const sequenceMap: Record<string, string> = {};
  
  const incomingCount: Record<string, number> = {};
  nodes.forEach(n => { incomingCount[n.id] = 0; });
  edges.forEach(e => {
    if (incomingCount[e.target] !== undefined) {
      incomingCount[e.target]++;
    }
  });

  const sortedNodes = [...nodes].sort((a, b) => {
    if (Math.abs(a.position.y - b.position.y) > 20) {
      return a.position.y - b.position.y;
    }
    return (a.data.seq || 0) - (b.data.seq || 0);
  });

  let rootCounter = 1;
  
  const traverse = (nodeId: string, currentSeq: number[]) => {
    sequenceMap[nodeId] = currentSeq.join('.');
    
    const outgoing = edges.filter(e => e.source === nodeId).map(e => e.target);
    const outgoingNodes = sortedNodes.filter(n => outgoing.includes(n.id));
    
    const nodeData = sortedNodes.find(n => n.id === nodeId)?.data;
    const isSourceSubWorkflow = nodeData?.title?.toLowerCase().includes('sub-workflow') || 
                                nodeData?.type === 'SUB_WORKFLOW';
    
    outgoingNodes.forEach((targetNode, index) => {
      if (sequenceMap[targetNode.id]) return;
      
      const targetNodeData = targetNode.data;
      const isTargetSubWorkflow = targetNodeData?.title?.toLowerCase().includes('sub-workflow') || 
                                  targetNodeData?.type === 'SUB_WORKFLOW';
      const isBranching = outgoingNodes.length > 1;

      let nextSeq: number[];
      
      if (isBranching) {
        // Branching always adds a depth level. e.g. 2 -> 2.1, 2.2
        nextSeq = [...currentSeq, index + 1];
      } else if (isTargetSubWorkflow || isSourceSubWorkflow) {
        // Sub-workflows automatically create a new depth level grouping
        // e.g. 2 -> 2.1 (Sub-Workflow) -> 2.1.1 (Next Step)
        nextSeq = [...currentSeq, 1];
      } else {
        // Single outgoing edge between regular steps, just increment the last number
        nextSeq = [...currentSeq];
        nextSeq[nextSeq.length - 1] += 1;
      }
      
      traverse(targetNode.id, nextSeq);
    });
  };

  const roots = sortedNodes.filter(n => incomingCount[n.id] === 0);
  roots.forEach(root => {
    if (!sequenceMap[root.id]) {
      traverse(root.id, [rootCounter++]);
    }
  });

  sortedNodes.forEach(node => {
    if (!sequenceMap[node.id]) {
      sequenceMap[node.id] = String(rootCounter++);
    }
  });

  return sequenceMap;
};

const PreviewWorkflowModal = ({ isOpen, onClose, nodes, edges, nodeTypes }: any) => {
  if (!isOpen) return null;
  
  const previewNodes: any[] = [];
  const previewEdges: any[] = [];
  
  nodes.forEach((node: any) => {
    previewNodes.push({ ...node, draggable: false });
    const steps = node.data.orchestration_steps || [];
    steps.forEach((step: any, idx: number) => {
       const stepNodeId = `${node.id}-step-${idx}`;
       previewNodes.push({
         id: stepNodeId,
         position: { x: node.position.x + 30, y: node.position.y + 120 + (idx * 60) },
         data: { label: `⚙️ ${step.step_type}: ${step.target_token || 'Unconfigured'}` },
         style: { background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px', fontSize: '10px', width: 200, fontWeight: 'bold', color: '#475569' },
         draggable: false,
       });
       previewEdges.push({
         id: `e-${node.id}-${stepNodeId}`,
         source: node.id,
         target: stepNodeId,
         type: 'smoothstep',
         animated: true,
         style: { stroke: '#94a3b8', strokeDasharray: '5,5', strokeWidth: 2 }
       });
    });
  });
  
  previewEdges.push(...edges.map((e: any) => ({ ...e, style: { ...e.style, strokeOpacity: 0.3 } })));

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in">
      <div className="bg-white w-full h-full rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/50">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
           <div>
             <h2 className="font-extrabold text-xl text-slate-800 flex items-center gap-2"><span>👁️</span> 360° Workflow Blueprint Preview</h2>
             <p className="text-xs text-slate-500 font-medium mt-1">An expanded view showing all hidden orchestration tasks, rules, and calculations.</p>
           </div>
           <button onClick={onClose} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95">Close 360° View</button>
        </div>
        <div className="flex-1 relative bg-slate-50/50">
          <ReactFlow nodes={previewNodes} edges={previewEdges} nodeTypes={nodeTypes} fitView minZoom={0.1}>
            <Background color="#CBD5E1" gap={20} size={1} />
            <Controls className="bg-white border-slate-200 shadow-sm rounded-xl overflow-hidden" />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};

const WorkflowCanvasInner: React.FC = () => {
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
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const reactFlowInstance = useReactFlow();

  const sequenceMap = computeSequences(nodes, edges);

  const [inboundTemplate, setInboundTemplate] = useState<string>('Fedwire_Pacs008_Import');
  const [associatedAgent, setAssociatedAgent] = useState<string>('Pacs008_Validator_Agent');
  const [outboundReport, setOutboundReport] = useState<string>('Daily_Ledger_Balance');

  const { data: productsData } = useQuery({
    queryKey: ['masters-products'],
    queryFn: async () => (await apiClient.get('/masters/products')).data
  });

  const { data: subproductsData } = useQuery({
    queryKey: ['masters-subproducts'],
    queryFn: async () => (await apiClient.get('/masters/subproducts')).data
  });

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => (await apiClient.get('/workflows/')).data
  });

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
    }
    // Removed auto-loading of workflows[0] so the canvas starts blank
    // The user prefers to load workflows explicitly via search/GUI instead of auto-populating.
  }, [workflowDraft]);

  const handleSaveDraftToDB = async (currentNodes: Node[], currentEdges: Edge[]) => {
    try {
      const payload = {
        workflow_name: `Draft - ${activeWorkflowProductContext || 'Untitled'}`,
        domain_scope: "CORE_BANKING",
        nodes: currentNodes.map(n => ({
          sequence_number: sequenceMap[n.id] ? parseInt(String(sequenceMap[n.id]).replace(/[^0-9]/g, '')) || 1 : 1,
          node_title: n.data.title || "Workflow Step",
          node_code: n.data.type || "STEP"
        })),
        edges: currentEdges.map(e => ({
          source_node_id: e.source,
          target_node_id: e.target
        }))
      };
      await apiClient.post('/workflows/', payload); // Simulate saving draft to DB using the same endpoint
      console.log('Draft saved successfully to DB');
    } catch (e) {
      console.error('Failed to save draft to DB', e);
    }
  };

  const handleSaveBlueprint = async () => {
    try {
      if (!activeWorkflowProductContext) {
        alert("Please select a Product Context first.");
        return;
      }
      
      const payload = {
        workflow_name: `Workflow Design - ${activeWorkflowProductContext}`,
        domain_scope: "CORE_BANKING",
        product_context: activeWorkflowProductContext,
        sub_product: activeWorkflowSubproductContext,
        description: "Visually designed workflow blueprint",
        nodes: nodes.map(n => ({
          sequence_number: sequenceMap[n.id] ? parseInt(String(sequenceMap[n.id]).replace(/[^0-9]/g, '')) || 1 : 1,
          node_title: n.data.title || "Workflow Step",
          node_code: n.data.type || "STEP",
          canvas_x_position: Math.round(n.position.x),
          canvas_y_position: Math.round(n.position.y),
          sla_days: n.data.slaDays || 1
        })),
        edges: edges.map(e => ({
          source_node_id: e.source,
          target_node_id: e.target,
          edge_condition: {
            condition: e.data?.label || e.label || '',
            preStatus: e.data?.preStatus || '',
            postStatus: e.data?.postStatus || ''
          }
        }))
      };

      await apiClient.post('/workflows/', payload);
      alert('Workflow Blueprint Published Successfully!');
    } catch (e) {
      console.error("Save Error", e);
      alert('Failed to publish workflow blueprint.');
    }
  };

  const saveDraft = (newNodes: Node[], newEdges: Edge[]) => {
    setWorkflowDraft({ nodes: newNodes, edges: newEdges });
    // Also trigger DB save asynchronously in the background
    handleSaveDraftToDB(newNodes, newEdges);
  };

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const updated = applyNodeChanges(changes, nodes);
    setNodes(updated);
    saveDraft(updated, edges);
  }, [nodes, edges, saveDraft]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const updated = applyEdgeChanges(changes, edges);
    setEdges(updated);
    saveDraft(nodes, updated);
  }, [nodes, edges, saveDraft]);

  // --- QUICK ADD HANDLER ---
  const handleQuickAddNode = useCallback((parentNodeId: string, position: string, sourceHandle: string, type: string, reactFlowType: string, label: string) => {
    const parentNode = nodes.find(n => n.id === parentNodeId);
    if (!parentNode) return;

    const id = `NODE-${Math.floor(Math.random() * 9000) + 1000}`;
    
    // Calculate new position based on direction with a small random jitter to prevent perfect stacking
    const offset = 200;
    const jitter = () => Math.random() * 40 - 20;
    let x = parentNode.position.x;
    let y = parentNode.position.y;

    if (position === 'right') { x += offset + 50 + jitter(); y += jitter(); }
    if (position === 'left') { x -= offset + 50 + jitter(); y += jitter(); }
    if (position === 'bottom') { y += offset + jitter(); x += jitter(); }
    if (position === 'top') { y -= offset + jitter(); x += jitter(); }

    let reactFlowTypeResolved = reactFlowType;
    let studioType;
    if (type.startsWith('STUDIO_')) {
      reactFlowTypeResolved = 'studioNode';
      studioType = type.replace('STUDIO_', '');
    }

    const newNode: Node = {
      id,
      type: reactFlowTypeResolved,
      position: { x, y },
      data: {
        id,
        seq: Object.keys(sequenceMap).length + 1,
        title: label,
        slaDays: 1,
        type: type,
        studioType: studioType,
      },
    };

    const oppositeHandle = {
      right: 'left',
      left: 'right',
      top: 'bottom',
      bottom: 'top'
    }[position] || 'left';

    const newEdge: Edge = {
      id: `e-${parentNodeId}-${id}`,
      source: parentNodeId,
      target: id,
      sourceHandle: sourceHandle,
      targetHandle: oppositeHandle,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#94A3B8', strokeWidth: 2 }
    };

    const updatedNodes = nodes.concat(newNode);
    const updatedEdges = edges.concat(newEdge);
    
    setNodes(updatedNodes);
    setEdges(updatedEdges);
    saveDraft(updatedNodes, updatedEdges);
  }, [nodes, edges, sequenceMap, setNodes, setEdges, saveDraft]);


  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    setContextMenu(null);
  }, []);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    setContextMenu(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    setContextMenu({
      id: node.id,
      top: event.clientY,
      left: event.clientX,
    });
  }, []);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => {
      const updated = addEdge({ 
        ...params, 
        type: 'step', 
        updatable: true,
        focusable: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' }, 
        style: { stroke: '#6366F1', strokeWidth: 2 } 
      }, eds);
      saveDraft(nodes, updated);
      return updated;
    });
  }, [nodes]);

  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      setEdges((els) => {
        const updated = updateEdge(oldEdge, newConnection, els);
        saveDraft(nodes, updated);
        return updated;
      });
    },
    [nodes]
  );

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    if (window.confirm("Delete this connection?")) {
      setEdges((eds) => {
        const updated = eds.filter(e => e.id !== edge.id);
        saveDraft(nodes, updated);
        return updated;
      });
      if (selectedEdge?.id === edge.id) setSelectedEdge(null);
    }
  }, [nodes, edges, selectedEdge]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const id = `NODE-${Math.floor(Math.random() * 9000) + 1000}`;
      
      let reactFlowType = 'customBankingNode';
      let studioType;
      if (type === 'SUB_WORKFLOW') reactFlowType = 'customBankingNode';
      else if (type === 'DECISION') reactFlowType = 'decisionNode';
      else if (type === 'START_EVENT' || type === 'END_EVENT' || type === 'TIMER_EVENT' || type === 'SYSTEM_TASK') reactFlowType = 'eventNode';
      else if (type === 'PARALLEL_GATEWAY') reactFlowType = 'gatewayNode';
      else if (type.startsWith('STUDIO_')) {
        reactFlowType = 'studioNode';
        studioType = type.replace('STUDIO_', '');
      }

      const newNode: Node = {
        id,
        type: reactFlowType,
        position,
        data: {
          id,
          seq: Object.keys(sequenceMap).length + 1,
          title: label || 'New Node',
          slaDays: 1,
          type: type,
          studioType: studioType,
          orchestration_steps: type === 'SUB_WORKFLOW' ? [{ sequence_number: 10, step_type: 'SUB_WORKFLOW', target_token: '' }] : [],
        },
      };

      setNodes((nds) => {
        const updated = nds.concat(newNode);
        
        if (type === 'SUB_WORKFLOW' && selectedNode) {
          const newEdge: Edge = {
            id: `e-${selectedNode.id}-${id}`,
            source: selectedNode.id,
            target: id,
            sourceHandle: 'right',
            targetHandle: 'left',
            type: 'step',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' },
            style: { stroke: '#6366F1', strokeWidth: 2 }
          };
          setEdges((eds) => {
            const updatedEdges = eds.concat(newEdge);
            saveDraft(updated, updatedEdges);
            return updatedEdges;
          });
        } else {
          saveDraft(updated, edges);
        }
        return updated;
      });
    },
    [reactFlowInstance, sequenceMap, edges, selectedNode]
  );

  const handleAddNewNode = (type: 'STEP' | 'DECISION') => {
    const id = `NODE-${Math.floor(Math.random() * 9000) + 1000}`;
    const seq = (nodes.length + 1) * 10;
    
    let title = 'New Step Name';
    if (type === 'DECISION') title = 'Branch Condition';

    const newNode: Node = {
      id,
      type: type === 'DECISION' ? 'decisionNode' : 'customBankingNode',
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

  const sortedSteps = [...nodes].sort((a, b) => (a.data.seq || 0) - (b.data.seq || 0));

  return (
    <div className="w-full flex flex-col gap-6 p-6">
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

      <div className={`flex flex-col lg:flex-row gap-6 items-stretch w-full ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-50 overflow-hidden p-0' : 'relative min-h-[500px]'}`}>
        <div className={`flex-1 flex flex-col gap-6 min-w-0 ${isFullscreen ? 'w-full h-full absolute inset-0' : 'h-full'}`}>
          <div className={`w-full flex bg-white/85 backdrop-blur-md border border-white/30 rounded-2xl shadow-glass overflow-hidden ${isFullscreen ? 'h-full rounded-none border-none relative' : 'h-[450px] relative'}`}>
            <div className={isFullscreen ? `absolute top-4 left-4 bottom-4 z-40 transition-transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[150%]'}` : ''}>
              <WorkflowSidebar selectedNode={selectedNode} />
            </div>
            
            <div className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
              <ReactFlow
              nodes={nodes.map(n => ({
                ...n,
                selected: selectedNode?.id === n.id,
                data: {
                  ...n.data,
                  seq: sequenceMap[n.id] || n.data.seq,
                  onTitleChange: (newTitle: string) => handleUpdateNodeData(n.id, { title: newTitle }),
                  onQuickAdd: handleQuickAddNode
                }
              }))}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onEdgeUpdate={onEdgeUpdate}
              onEdgeContextMenu={onEdgeContextMenu}
              onPaneClick={onPaneClick}
              onNodeContextMenu={onNodeContextMenu}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-right"
            >
              <Background color="#6366f1" gap={16} style={{ opacity: 0.03 }} />
              <Controls className="bg-white/80 backdrop-blur-md border border-slate-200/50 shadow-glass rounded-xl overflow-hidden">
                <ControlButton onClick={() => setIsFullscreen(!isFullscreen)} title="Toggle Full Screen">
                  <span className="text-lg leading-none font-bold text-slate-700">{isFullscreen ? '↙' : '↗'}</span>
                </ControlButton>
                {isFullscreen && (
                  <>
                    <ControlButton onClick={() => setIsSidebarOpen(!isSidebarOpen)} title="Toggle Sidebar">
                      <span className="text-lg leading-none font-bold text-indigo-600">🧰</span>
                    </ControlButton>
                    <ControlButton onClick={() => setIsPropertiesOpen(!isPropertiesOpen)} title="Toggle Properties">
                      <span className="text-lg leading-none font-bold text-indigo-600">⚙️</span>
                    </ControlButton>
                  </>
                )}
              </Controls>
              <MiniMap nodeStrokeWidth={3} zoomable pannable className="border border-slate-200/40 shadow-glass rounded-xl bg-white/80" />
            </ReactFlow>

            {contextMenu && (
              <div 
                className="fixed z-50 bg-white shadow-xl border border-slate-200 rounded-lg w-48 overflow-hidden animate-fade-in"
                style={{ top: contextMenu.top, left: contextMenu.left }}
              >
                <button 
                  onClick={() => {
                    if (contextMenu) handleDeleteNode(contextMenu.id);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2.5 text-[12px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <span>🗑️</span> Delete Step
                </button>
              </div>
            )}
            </div>
            <div className={`absolute top-4 z-40 bg-white/90 backdrop-blur-md border border-indigo-100 p-2 rounded-xl shadow-lg flex items-center gap-2 text-[10px] font-bold text-indigo-700 pointer-events-none transition-all duration-300 ${isFullscreen && isSidebarOpen ? 'left-[290px]' : 'left-4'}`}>
              <span>💡</span> Drag shapes to canvas
            </div>
            <div className={`absolute top-4 z-40 flex items-center gap-2 transition-all duration-300 ${isFullscreen && isPropertiesOpen ? 'right-[420px]' : 'right-4'}`}>
              <button 
                onClick={() => setIsPreviewOpen(true)}
                className="bg-white/90 hover:bg-white text-indigo-700 border border-indigo-100 font-bold text-[12px] px-4 py-2 rounded-xl shadow-lg transition-all flex items-center gap-2"
              >
                <span>👁️</span> 360° Preview
              </button>
              <button 
                onClick={() => saveDraft(nodes, edges)}
                className="bg-white/90 hover:bg-white text-slate-700 border border-slate-200 font-bold text-[12px] px-4 py-2 rounded-xl shadow-lg transition-all flex items-center gap-2"
              >
                <span>💾</span> Save Draft
              </button>
              <button 
                onClick={handleSaveBlueprint}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-[12px] px-4 py-2 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
              >
                <span>🚀</span> Publish Blueprint
              </button>
            </div>
          </div>

          {!isFullscreen && (
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
                          <td className="py-3 px-3 font-mono font-bold text-slate-400">{sequenceMap[step.id] || step.data.seq}</td>
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
                                <span key={idx} className="bg-slate-100 text-slate-650 px-1.5 py-0.5 rounded font-mono text-[9px]">
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
          )}
        </div>
        <div className={
          isFullscreen 
            ? `absolute top-4 right-4 bottom-4 z-40 transition-transform h-auto bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden flex flex-col ${isPropertiesOpen ? 'translate-x-0' : 'translate-x-[150%]'}` 
            : ((selectedNode || selectedEdge) ? "w-full lg:w-[425px] flex-shrink-0 animate-slide-in-right bg-white rounded-2xl shadow-glass border border-slate-200/50 flex flex-col" : "hidden")
        }>
          <div className="h-full overflow-y-auto overflow-x-hidden">
            {selectedNode && (
              <NodePropertiesDrawer 
                node={selectedNode} 
                onClose={() => setSelectedNode(null)} 
                onUpdateData={(updated) => selectedNode && handleUpdateNodeData(selectedNode.id, updated)} 
              />
            )}
            {selectedEdge && (
              <EdgePropertiesDrawer 
                selectedEdge={selectedEdge} 
                setEdges={setEdges} 
                saveDraft={() => saveDraft(nodes, edges)} 
                onClose={() => setSelectedEdge(null)} 
              />
            )}
          </div>
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
              <p className="text-[11px] text-slate-500 mt-1 max-w-[600px] leading-relaxed">
                Review the cognitive building blocks allocated to this step. Missing elements will be highlighted to ensure execution engine compliance before you publish.
              </p>
            </div>
            <button 
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-slate-600 font-bold text-[11px] px-3 py-1.5 hover:bg-slate-50 rounded-lg transition-all"
            >
              Close Workspace
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
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

      <PreviewWorkflowModal 
        isOpen={isPreviewOpen} 
        onClose={() => setIsPreviewOpen(false)} 
        nodes={nodes} 
        edges={edges} 
        nodeTypes={nodeTypes}
      />

    </div>
  );
};

export const WorkflowCanvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
};