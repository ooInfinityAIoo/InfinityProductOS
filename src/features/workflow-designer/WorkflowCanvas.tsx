import React, { useCallback, useState, useEffect, useRef } from 'react';
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
import { LabeledEdge } from './LabeledEdge';
import { SwimlaneLabelNode } from './SwimlaneLabelNode';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

const nodeTypes = {
  customBankingNode: WorkflowNode,
  decisionNode: DecisionNode,
  eventNode: EventNode,
  gatewayNode: GatewayNode,
  studioNode: StudioNode,
  swimlaneLabelNode: SwimlaneLabelNode,
};

// Business-language labels auto-assigned from DECISION handle IDs.
// 'yes'/'right' handle = accept path; 'no'/'left' handle = reject path.
// Override stored in edge data.label for persistence.
const edgeTypes = {
  labeledEdge: LabeledEdge,
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
          <ReactFlow nodes={previewNodes} edges={previewEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView minZoom={0.1}>
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
    activeProductContext,
    activeCoreProductId,
    setCoreProductId,
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

  // ISO 20022 template picker state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateNetworkFilter, setTemplateNetworkFilter] = useState('ALL');
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [cloningTemplateId, setCloningTemplateId] = useState<string | null>(null);
  // Tracks the workflow_id of the workflow currently on the canvas (set after save/clone).
  // Used to scope the participant picker in NodePropertiesDrawer to the right workflow.
  const [savedWorkflowId, setSavedWorkflowId] = useState<string | null>(null);

  // Canvas view mode: 'flow' = free-form x/y positions; 'swimlane' = horizontal bands by participant.
  // Swimlane mode computes a display-only layout — the underlying nodes state (and DB) keeps Flow positions.
  const [viewMode, setViewMode] = useState<'flow' | 'swimlane'>('flow');

  // Parse Diagram — Claude vision upload state
  const [isParsing, setIsParsing] = useState(false);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const diagramInputRef = useRef<HTMLInputElement>(null);

  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });
  const currentPackage = packagesData?.packages?.find((p: any) => p.package_name === activeProductContext);
  const packageId = currentPackage?.package_id;

  const { data: productsData } = useQuery({
    queryKey: ['products', packageId],
    queryFn: async () => {
      if (!packageId) return [];
      const res = await apiClient.get(`/masters/products?package_id=${packageId}`);
      return res.data.products;
    },
    enabled: !!packageId
  });

  const { data: subproductsData } = useQuery({
    queryKey: ['masters-subproducts', activeCoreProductId],
    queryFn: async () => {
      if (!activeCoreProductId) return [];
      const res = await apiClient.get(`/masters/subproducts?product_id=${activeCoreProductId}`);
      return res.data.subproducts;
    },
    enabled: !!activeCoreProductId
  });

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => (await apiClient.get('/workflows/')).data
  });

  // Participants scoped to the current saved workflow — used by Swimlane View to build
  // horizontal bands. Only fetched when a workflow has been saved (savedWorkflowId is set).
  const { data: participantsData } = useQuery({
    queryKey: ['canvas-participants', savedWorkflowId],
    queryFn: async () => (await apiClient.get(`/workflows/${savedWorkflowId}/participants/`)).data,
    enabled: !!savedWorkflowId,
  });

  // Fetch all ISO 20022 workflow templates for the template picker modal.
  // Only fetched when the modal is open to avoid wasting bandwidth.
  const { data: isoTemplates } = useQuery({
    queryKey: ['iso-workflow-templates'],
    queryFn: async () => (await apiClient.get('/workflows/?is_template=true&limit=200')).data,
    enabled: showTemplateModal,
  });

  // Clone a template into a new user-owned workflow. Copies nodes and edges but
  // strips is_template so the copy appears in the regular workflow list.
  const handleCloneTemplate = async (tpl: any) => {
    // Clone a scenario template onto the canvas. Two things happen:
    // 1. A new user-owned workflow is persisted to the DB (is_template=false)
    // 2. The canvas is immediately populated with the template nodes so the bank
    //    can start editing without reloading — modularity preserved.
    if (!activeCoreProductId) return;
    setCloningTemplateId(tpl.workflow_id);
    try {
      const tplNodes: any[] = tpl.nodes || [];

      // Build React Flow nodes — carry ISO message identity in data so WorkflowNode card
      // shows the message type badge and From→To party labels immediately on the canvas.
      // Map node_type to React Flow node component type.
      // Gateway types (DECISION, PARALLEL_*) use the diamond decisionNode shape.
      const toRfType = (nodeType?: string) =>
        ['DECISION', 'PARALLEL_SPLIT', 'PARALLEL_JOIN'].includes(nodeType ?? '')
          ? 'decisionNode'
          : 'customBankingNode';

      const rfNodes: Node[] = tplNodes.map((n: any, idx: number) => ({
        id: n.node_id || `node-${idx}`,
        type: toRfType(n.node_type),
        position: { x: n.canvas_x_position ?? (100 + idx * 220), y: n.canvas_y_position ?? 200 },
        data: {
          title: n.node_title,
          slaDays: n.sla_days ?? 1,
          sla_config: n.sla_config ?? null,
          orchestration_steps: n.orchestration_steps ?? [],
          node_type: n.node_type ?? null,
          iso_message_type: n.iso_message_type ?? null,
          message_direction: n.message_direction ?? null,
          party_from: n.party_from ?? null,
          party_to: n.party_to ?? null,
        },
      }));

      // Build React Flow edges from the template edge list
      const rfEdges: Edge[] = (tpl.edges || []).map((e: any, idx: number) => ({
        id: e.edge_id || `edge-${idx}`,
        source: e.source_node_id,
        target: e.target_node_id,
        type: 'labeledEdge',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
        data: { label: e.edge_condition?.label ?? '' },
      }));

      // Persist to DB (so the bank's copy survives a page reload)
      const payload = {
        workflow_name: `${tpl.workflow_name} (Copy)`,
        domain_scope: tpl.domain_scope,
        product_context: activeProductContext || 'Default',
        description: tpl.description,
        is_template: false,
        clearing_network: tpl.clearing_network,
        template_category: tpl.template_category,
        product_id: activeCoreProductId,
        nodes: tplNodes.map((n: any, idx: number) => ({
          sequence_number: idx + 1,
          node_title: n.node_title,
          node_code: n.node_code || 'STEP',
          orchestration_steps: n.orchestration_steps ?? [],
          canvas_x_position: n.canvas_x_position ?? (100 + idx * 220),
          canvas_y_position: n.canvas_y_position ?? 200,
          node_type: n.node_type ?? null,
          iso_message_type: n.iso_message_type ?? null,
          message_direction: n.message_direction ?? null,
          party_from: n.party_from ?? null,
          party_to: n.party_to ?? null,
        })),
        edges: [],
      };
      const cloneResp = await apiClient.post('/workflows/', payload);
      if (cloneResp.data?.workflow_id) setSavedWorkflowId(cloneResp.data.workflow_id);

      // Load onto the canvas immediately
      setNodes(rfNodes);
      setEdges(rfEdges);
      setWorkflowDraft({ nodes: rfNodes, edges: rfEdges });
      setShowTemplateModal(false);
    } catch (e) {
      console.error('Failed to clone template', e);
    } finally {
      setCloningTemplateId(null);
    }
  };

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
        workflow_name: `Draft - ${activeCoreProductId || 'Untitled'}`,
        domain_scope: activeProductContext || "CORE_BANKING",
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
      if (!activeCoreProductId) {
        alert("Please select a Core Product first.");
        return;
      }

      const payload = {
        workflow_name: `Workflow Design - ${activeCoreProductId}`,
        domain_scope: activeProductContext || "CORE_BANKING",
        product_context: activeCoreProductId,
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

      const saveResp = await apiClient.post('/workflows/', payload);
      if (saveResp.data?.workflow_id) setSavedWorkflowId(saveResp.data.workflow_id);
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
      // Auto-label edges from DECISION node handles in business language.
      // sourceHandleId 'yes'/'right' = accept path; 'no'/'left' = reject path.
      const handleLabels: Record<string, string> = {
        yes: '✓ Accepted', no: '✗ Rejected',
        right: '✓ Accepted', left: '✗ Rejected',
        default: '→ Continue',
      };
      const autoLabel = params.sourceHandle ? handleLabels[params.sourceHandle] ?? '' : '';
      const updated = addEdge({
        ...params,
        type: 'labeledEdge',
        updatable: true,
        focusable: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' },
        style: { strokeWidth: 2 },
        data: { label: autoLabel },
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

  // ── Parse Diagram handler ──────────────────────────────────────────────────
  // Uploads an image to POST /workflows/parse-diagram, receives node/edge JSON
  // from Claude vision, and maps it directly onto the React Flow canvas.
  // The toRfType helper maps node_type → RF component type (same as template clone).
  const toRfTypeFromNodeType = (nodeType?: string) =>
    ['DECISION', 'PARALLEL_SPLIT', 'PARALLEL_JOIN'].includes(nodeType ?? '')
      ? 'decisionNode'
      : 'customBankingNode';

  const handleParseDiagram = async (file: File) => {
    if (!activeCoreProductId) {
      alert('Select a Core Product first before parsing a diagram.');
      return;
    }
    setIsParsing(true);
    setParseWarnings([]);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post('/workflows/parse-diagram', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const parsed = res.data;

      // Map Claude's node list → React Flow nodes
      const rfNodes: Node[] = (parsed.nodes || []).map((n: any, idx: number) => ({
        id: n.id || `PARSED-${idx + 1}`,
        type: toRfTypeFromNodeType(n.node_type),
        position: { x: n.x ?? (100 + idx * 220), y: n.y ?? 200 },
        data: {
          title: n.title || `Step ${idx + 1}`,
          node_type: n.node_type || null,
          slaDays: 1,
          sla_config: null,
          orchestration_steps: [],
          iso_message_type: null,
          message_direction: null,
          party_from: null,
          party_to: null,
        },
      }));

      // Map Claude's edge list → React Flow edges (labeled)
      const rfEdges: Edge[] = (parsed.edges || []).map((e: any, idx: number) => ({
        id: `pe-${idx}`,
        source: e.source,
        target: e.target,
        type: 'labeledEdge',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2 },
        data: { label: e.condition || '' },
      }));

      setNodes(rfNodes);
      setEdges(rfEdges);
      setWorkflowDraft({ nodes: rfNodes, edges: rfEdges });

      if (parsed.warnings?.length) setParseWarnings(parsed.warnings);
      if (parsed.confidence < 0.6) {
        setParseWarnings(prev => [
          ...prev,
          `Low confidence (${Math.round(parsed.confidence * 100)}%) — review all nodes carefully.`,
        ]);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Diagram parsing failed.';
      alert(`Parse Diagram error: ${msg}`);
    } finally {
      setIsParsing(false);
      if (diagramInputRef.current) diagramInputRef.current.value = '';
    }
  };

  // ── Swimlane layout computation ─────────────────────────────────────────────
  // Builds a display-only node list for Swimlane View. Never mutates the real `nodes` state.
  //
  // Layout rules:
  //   - One horizontal band per participant (ordered by sort_order) plus an "Unassigned" band at top
  //   - Band height: 280px. Content nodes placed at band_y + 60 spaced 220px apart on X axis
  //   - A SwimlaneLabelNode (non-interactive) is inserted to the left of each band
  //   - Nodes without a participant_id go into the Unassigned band
  const computeSwimlaneLayout = (contentNodes: Node[], participants: any[]): Node[] => {
    const BAND_HEIGHT = 280;
    const BAND_PAD_TOP = 60;
    const NODE_SPACING_X = 230;
    const LABEL_X = -200;

    const groups = [
      { id: null, name: 'Unassigned', role: '', color: '#94a3b8' },
      ...(participants || []).map((p: any) => ({
        id: p.participant_id,
        name: p.name,
        role: p.role || '',
        color: p.color || '#6366f1',
      })),
    ];

    // Bucket content nodes by participant_id
    const buckets: Record<string, Node[]> = {};
    groups.forEach(g => { buckets[g.id ?? '__none__'] = []; });
    contentNodes.forEach(n => {
      const pid = n.data?.participant_id ?? null;
      const key = pid && buckets[pid] !== undefined ? pid : '__none__';
      buckets[key].push(n);
    });

    const result: Node[] = [];
    groups.forEach((group, bandIdx) => {
      const bandY = bandIdx * BAND_HEIGHT;
      const key = group.id ?? '__none__';
      const bandNodes = buckets[key] || [];

      // Insert non-interactive label node
      result.push({
        id: `__sw_label_${key}`,
        type: 'swimlaneLabelNode',
        position: { x: LABEL_X, y: bandY + BAND_HEIGHT / 2 - 30 },
        data: { name: group.name, role: group.role, color: group.color, nodeCount: bandNodes.length },
        draggable: false,
        selectable: false,
        deletable: false,
        connectable: false,
      } as Node);

      // Position content nodes in a row within the band
      bandNodes.forEach((node, i) => {
        result.push({
          ...node,
          position: { x: i * NODE_SPACING_X + 60, y: bandY + BAND_PAD_TOP },
        });
      });
    });

    return result;
  };

  // Nodes passed to <ReactFlow>: swimlane layout when toggle is active, raw nodes otherwise.
  // onNodesChange / onEdgesChange still operate on the real `nodes` state so positions persist.
  const displayNodes = viewMode === 'swimlane'
    ? computeSwimlaneLayout(nodes, participantsData?.participants ?? [])
    : nodes;

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
      <InfinityAIHelper studioKey="workflow-designer" />
      {/* COCKPIT LOCK UI: Level 2 Core Product Selector */}
      <div className="glass-card rounded-2xl p-4 flex items-center justify-between shadow-sm border border-rose-200/50 bg-rose-50/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-100/50 flex items-center justify-center text-rose-500 font-extrabold text-lg shadow-inner">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
          </div>
          <div>
            <h2 className="text-[13px] font-extrabold text-slate-800 tracking-tight font-display">Two-Key Cockpit Lockdown</h2>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">Configuration is disabled until a Core Product (Level 2) is explicitly selected.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Level 1: Domain</span>
          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg mr-4">{activeProductContext || 'Global'}</span>

          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Level 2: Product Context</span>
          <select
            value={activeCoreProductId || ''}
            onChange={(e) => setCoreProductId(e.target.value || null)}
            className="text-[12px] font-bold text-slate-800 border-2 border-rose-200 bg-white rounded-xl p-2.5 outline-none focus:border-rose-400 shadow-sm min-w-[200px]"
          >
            <option value="">-- SELECT CORE PRODUCT --</option>
            {productsData?.map((p: any) => (
              <option key={p.product_id} value={p.product_id}>{p.product_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={`flex flex-col gap-6 transition-all duration-300 ${!activeCoreProductId ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/80 backdrop-blur-md border border-slate-200/50 rounded-2xl shadow-glass">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Subproduct Context:</span>
              <select
                value={activeWorkflowSubproductContext || ''}
                onChange={(e) => setWorkflowContexts(null, e.target.value || null)}
                className="text-[12px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
              >
                <option value="">-- Select Variation --</option>
                {subproductsData?.subproducts?.map((sp: any) => <option key={sp.subproduct_id} value={sp.subproduct_name}>{sp.subproduct_name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">
              Process Flow Studio Context
            </div>
            <div className="flex items-center gap-2">
              {/* Parse Diagram — upload a hand-drawn or digital workflow image;
                  Claude vision extracts nodes + edges and loads them onto the canvas */}
              <input
                ref={diagramInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleParseDiagram(file);
                }}
              />
              <button
                onClick={() => diagramInputRef.current?.click()}
                disabled={isParsing || !activeCoreProductId}
                title={!activeCoreProductId ? 'Select a Core Product first' : 'Upload a diagram image — Claude will extract nodes and edges'}
                className="text-[11px] font-bold px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isParsing ? (
                  <><span className="animate-spin inline-block">⟳</span> Parsing…</>
                ) : (
                  <>📷 Parse Diagram</>
                )}
              </button>
              {/* Opens the ISO 20022 message template library picker */}
              <button
                onClick={() => setShowTemplateModal(true)}
                className="text-[11px] font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
              >
                📋 New from Template
              </button>
            </div>
          </div>
        </div>

        {/* Parse warnings banner — shown after a successful parse with low confidence
            or ambiguous shapes. Dismissed automatically on next parse. */}
        {parseWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-3">
            <span className="text-amber-500 text-lg mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="text-[11px] font-bold text-amber-800 mb-1">Diagram Parser Warnings</p>
              <ul className="space-y-0.5">
                {parseWarnings.map((w, i) => (
                  <li key={i} className="text-[10px] text-amber-700">{w}</li>
                ))}
              </ul>
            </div>
            <button onClick={() => setParseWarnings([])} className="text-amber-400 hover:text-amber-600 text-xs font-bold">✕</button>
          </div>
        )}

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

        <div className={`flex flex-col lg:flex-row gap-6 items-stretch w-full ${isFullscreen ? 'fixed inset-0 z-[100] bg-slate-50/90 backdrop-blur-md overflow-hidden p-0' : 'relative min-h-[500px]'}`}>
          <div className={`flex-1 flex flex-col gap-6 min-w-0 ${isFullscreen ? 'w-full h-full absolute inset-0' : 'h-full'}`}>
            <div className={`w-full flex bg-white/85 backdrop-blur-md border border-white/30 rounded-2xl shadow-glass overflow-hidden ${isFullscreen ? 'h-full rounded-none border-none relative' : 'h-[450px] relative'}`}>
              <div className={isFullscreen ? `absolute top-4 left-4 bottom-4 z-40 transition-transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-[150%]'}` : ''}>
                <WorkflowSidebar selectedNode={selectedNode} />
              </div>

              <div className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
                {/* Swimlane band backgrounds — rendered as CSS stripes behind the React Flow canvas.
                    Positioned using fixed pixel bands matching computeSwimlaneLayout's BAND_HEIGHT=280.
                    Only visible in swimlane mode; invisible in flow mode. */}
                {viewMode === 'swimlane' && (
                  <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                    {[
                      { id: '__none__', name: 'Unassigned', color: '#94a3b8' },
                      ...(participantsData?.participants ?? []).map((p: any) => ({ id: p.participant_id, name: p.name, color: p.color || '#6366f1' })),
                    ].map((group, idx) => (
                      <div
                        key={group.id}
                        className="absolute left-0 right-0 border-b border-slate-100"
                        style={{
                          top: idx * 280,
                          height: 280,
                          background: idx % 2 === 0 ? 'rgba(248,250,252,0.7)' : 'rgba(241,245,249,0.7)',
                          borderLeft: `3px solid ${group.color}20`,
                        }}
                      >
                        <span
                          className="absolute top-2 left-3 text-[9px] font-bold uppercase tracking-widest opacity-30"
                          style={{ color: group.color }}
                        >
                          {group.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <ReactFlow
                  nodes={displayNodes.map(n => ({
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
                  edgeTypes={edgeTypes}
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
                {/* View mode toggle — Flow View (free-form x/y) vs Swimlane View (bands by participant).
                    Swimlane is only meaningful when participants have been defined and nodes assigned. */}
                <div className="bg-white/90 border border-slate-200 rounded-xl shadow-lg overflow-hidden flex text-[11px] font-bold">
                  <button
                    onClick={() => setViewMode('flow')}
                    className={`px-3 py-2 flex items-center gap-1.5 transition-colors ${viewMode === 'flow' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    title="Flow View — free-form canvas"
                  >
                    ⬡ Flow
                  </button>
                  <button
                    onClick={() => setViewMode('swimlane')}
                    className={`px-3 py-2 flex items-center gap-1.5 transition-colors border-l border-slate-200 ${viewMode === 'swimlane' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    title="Swimlane View — grouped by participant"
                  >
                    ☰ Lanes
                  </button>
                </div>
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
                              className={`border-b border-slate-55 hover:bg-slate-50/50 transition-colors cursor-pointer ${isNodeSelected ? 'bg-indigo-50/20 border-l-4 border-l-indigo-500' : ''
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
            `absolute top-4 right-4 bottom-4 z-40 transition-transform h-auto bg-white/40 backdrop-blur-3xl rounded-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] border border-white/50 w-[400px] overflow-hidden flex flex-col ${selectedNode || selectedEdge ? 'translate-x-0' : 'translate-x-[150%]'} pointer-events-auto`
          }>
            <div className="h-full overflow-y-auto overflow-x-hidden">
              {selectedNode && (
                <NodePropertiesDrawer
                  node={selectedNode}
                  workflowId={savedWorkflowId}
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
                      setActiveModule('doc-checklists');
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

        {/* ── ISO 20022 Template Picker Modal ─────────────────────────────
            Appears when the user clicks "New from Template".
            Queries /workflows/?is_template=true and displays results
            grouped by clearing network with full-text search.
            Cloning creates a new editable workflow from the selected template. */}
        {showTemplateModal && (
          <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowTemplateModal(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              {/* Modal header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">ISO 20022 Workflow Template Library</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select a message template to start a pre-built workflow. Covers pacs, camt, pain, admi — including FedNow and RTP.
                  </p>
                </div>
                <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">×</button>
              </div>

              {/* Filters */}
              <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3 flex-wrap">
                {/* Network tabs */}
                {['ALL', 'SWIFT', 'FEDNOW', 'RTP', 'CHIPS', 'SEPA', 'ACH'].map(net => (
                  <button
                    key={net}
                    onClick={() => setTemplateNetworkFilter(net)}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${templateNetworkFilter === net ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50'}`}
                  >
                    {net === 'ALL' ? '🌐 All Networks' : net === 'FEDNOW' ? '🏛 FedNow' : net === 'RTP' ? '⚡ RTP' : net === 'SWIFT' ? '🌍 SWIFT' : net === 'CHIPS' ? '💰 CHIPS' : net === 'SEPA' ? '🇪🇺 SEPA' : '🏦 ACH'}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  <select
                    value={templateCategoryFilter}
                    onChange={e => setTemplateCategoryFilter(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
                  >
                    <option value="">All Categories</option>
                    <option value="CLEARING_SETTLEMENT">Clearing & Settlement</option>
                    <option value="PAYMENT_INITIATION">Payment Initiation</option>
                    <option value="CASH_MANAGEMENT">Cash Management</option>
                    <option value="ADMINISTRATION">Administration</option>
                  </select>
                  <input
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-48 bg-white"
                    placeholder="Search message type or name…"
                    value={templateSearch}
                    onChange={e => setTemplateSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Template list */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {!isoTemplates && (
                  <div className="flex items-center justify-center h-32 text-slate-400 text-sm animate-pulse">Loading templates…</div>
                )}
                {isoTemplates && (() => {
                  // Filter templates based on selected network / category / search
                  const templates: any[] = Array.isArray(isoTemplates) ? isoTemplates : [];
                  const filtered = templates.filter(t => {
                    const netMatch = templateNetworkFilter === 'ALL' || t.clearing_network === templateNetworkFilter || t.clearing_network === 'ALL';
                    const catMatch = !templateCategoryFilter || t.template_category === templateCategoryFilter;
                    const q = templateSearch.toLowerCase();
                    const textMatch = !q || t.workflow_name?.toLowerCase().includes(q) || t.message_type?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
                    return netMatch && catMatch && textMatch;
                  });

                  if (filtered.length === 0) return (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                      <div className="text-3xl mb-2">📭</div>
                      <p className="text-sm">No templates match. Run <code className="bg-slate-100 px-1 rounded text-xs">python seed_iso_workflow_templates.py</code> to seed them.</p>
                    </div>
                  );

                  // Group by template_category for organised display
                  const CAT_LABELS: Record<string, string> = {
                    CLEARING_SETTLEMENT: '🔄 Clearing & Settlement',
                    PAYMENT_INITIATION:  '🚀 Payment Initiation',
                    CASH_MANAGEMENT:     '💵 Cash Management',
                    ADMINISTRATION:      '⚙️ Administration',
                  };
                  const NET_BADGE: Record<string, string> = {
                    SWIFT:   'bg-blue-100 text-blue-700',
                    FEDNOW:  'bg-green-100 text-green-700',
                    RTP:     'bg-violet-100 text-violet-700',
                    CHIPS:   'bg-amber-100 text-amber-700',
                    SEPA:    'bg-sky-100 text-sky-700',
                    ACH:     'bg-slate-100 text-slate-600',
                    ALL:     'bg-indigo-100 text-indigo-700',
                  };
                  const grouped: Record<string, any[]> = {};
                  filtered.forEach(t => {
                    const cat = t.template_category || 'OTHER';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(t);
                  });

                  return Object.entries(grouped).map(([cat, items]) => (
                    <div key={cat} className="mb-6">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                        {CAT_LABELS[cat] ?? cat} <span className="font-normal text-slate-400 normal-case">({items.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {items.map(tpl => (
                          <div key={tpl.workflow_id} className="border border-slate-200 rounded-xl p-3.5 bg-white hover:border-indigo-300 hover:shadow-sm transition-all">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold text-slate-800 leading-tight">{tpl.workflow_name}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  <code className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">{tpl.message_type}</code>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${NET_BADGE[tpl.clearing_network] ?? 'bg-slate-100 text-slate-600'}`}>{tpl.clearing_network}</span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed line-clamp-2">{tpl.description}</p>
                                {tpl.nodes?.length > 0 && (
                                  <div className="mt-1.5 flex gap-1 flex-wrap">
                                    {tpl.nodes.slice(0, 5).map((n: any) => (
                                      <span key={n.node_id ?? n.label} className="text-[9px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded font-medium">{n.label}</span>
                                    ))}
                                    {tpl.nodes.length > 5 && <span className="text-[9px] text-slate-400">+{tpl.nodes.length - 5} more</span>}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => handleCloneTemplate(tpl)}
                                disabled={cloningTemplateId === tpl.workflow_id || !activeCoreProductId}
                                className="shrink-0 text-[11px] font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                                title={!activeCoreProductId ? 'Select a Core Product first' : 'Clone this template into a new workflow'}
                              >
                                {cloningTemplateId === tpl.workflow_id ? '…' : '+ Use'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 rounded-b-2xl">
                {!activeCoreProductId && <span className="text-amber-600 font-semibold">⚠ Select a Core Product above before using a template.</span>}
                {activeCoreProductId && <span>Templates are cloned into your active product context. Edit the copy freely — the master template is never modified.</span>}
              </div>
            </div>
          </div>
        )}

      </div>
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