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
  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#0176D3', strokeWidth: 2 } }, eds)), []);

  if (isLoading) return <div className="flex h-full w-full items-center justify-center text-slate-500 font-bold">Synchronizing with Core Engine...</div>;
  if (error) return <div className="flex h-full w-full items-center justify-center text-red-500 font-bold">Failed to load Blueprint Manifests.</div>;

  return (
    <div className="h-full w-full rounded bg-slate-50 relative overflow-hidden">
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
        <Background color="#ccc" gap={16} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable className="border border-slate-200 shadow-sm rounded-md" />
      </ReactFlow>
      
      {/* Conditionally render the slide-out drawer overlay */}
      <NodePropertiesDrawer node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
};