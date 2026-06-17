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

// Register our custom banking node design with React Flow
const nodeTypes = { customBankingNode: WorkflowNode };

export const WorkflowCanvas: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // --- DYNAMIC API BINDING ---
  // Fetch live workflows from your FastAPI Core Engine
  const { data: workflows, isLoading, error } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await apiClient.get('/workflows/');
      return res.data;
    }
  });

  // Parse the backend schema into React Flow format
  useEffect(() => {
    if (workflows && workflows.length > 0) {
      const activeWorkflow = workflows[0]; // Demo: Grab the first seeded workflow
      
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
  }, [workflows]);

  // Handle dragging, selecting, and deleting nodes
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  
  // --- INTERACTIVITY HANDLERS ---
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  // Handle drawing new connections between nodes
  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366F1', strokeWidth: 2 } }, eds)), []);

  if (isLoading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center text-slate-500 font-semibold bg-white/50 backdrop-blur-md border border-white/20 rounded-2xl shadow-glass">
        <svg className="animate-spin mb-4 h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">Syncing with Core Engine...</span>
      </div>
    );
  }
  
  if (error) return <div className="flex h-full w-full items-center justify-center text-rose-500 font-bold bg-white/50 backdrop-blur-md rounded-2xl border border-white/20">Failed to load Blueprint Manifests.</div>;

  return (
    <div className="h-full w-full bg-[#FAFBFD] relative overflow-hidden animate-fade-in">
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
      
      {/* Conditionally render the slide-out drawer overlay */}
      <NodePropertiesDrawer node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
};