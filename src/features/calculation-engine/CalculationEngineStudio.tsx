import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import { apiClient } from '../../api/client';
import { VariableNode, ConstantNode, OperatorNode } from './CalculationNodes';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';
import { IsoFieldSelector } from '../../components/IsoFieldSelector';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

const nodeTypes = {
  variableNode: VariableNode,
  constantNode: ConstantNode,
  operatorNode: OperatorNode
};

// Server-driven searchable ISO variable list for the sidebar
const ISOVariableList: React.FC<{ search: string; domain: string; onDragStart: (e: React.DragEvent, type: string, data: any) => void }> = ({ search, domain, onDragStart }) => {
  const [debounced, setDebounced] = React.useState(search);
  React.useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  const params = new URLSearchParams({ limit: '20' });
  if (debounced) params.set('q', debounced);
  if (domain) params.set('domain_category', domain);
  const { data, isLoading } = useQuery({
    queryKey: ['calc-iso-vars', debounced, domain],
    queryFn: async () => (await apiClient.get(`/fields/registry/search?${params.toString()}`)).data,
    staleTime: 30000,
  });
  const fields = data?.fields || [];
  if (isLoading) return <div className="text-[10px] text-slate-400 text-center py-3">Loading...</div>;
  if (fields.length === 0) return <div className="text-[10px] text-slate-400 text-center py-3 italic">No fields found</div>;
  return (
    <div className="space-y-1.5 max-h-[240px] overflow-y-auto custom-scrollbar">
      {fields.map((f: any) => (
        <div
          key={f.field_id}
          draggable
          onDragStart={(e) => onDragStart(e, 'variableNode', {
            label: f.display_preference === 'CLIENT' && f.client_business_name ? f.client_business_name : f.iso_business_name,
            technical_name: f.technical_sys_name
          })}
          className="bg-indigo-50 border border-indigo-100 hover:border-indigo-300 p-2 rounded-lg cursor-grab shadow-sm active:cursor-grabbing"
        >
          <div className="text-[10px] font-bold text-indigo-900 leading-tight truncate">
            {f.display_preference === 'CLIENT' && f.client_business_name ? f.client_business_name : f.iso_business_name}
          </div>
          <div className="text-[8px] font-mono text-indigo-400 mt-0.5 truncate">{f.technical_sys_name}</div>
        </div>
      ))}
      {(data?.total_count ?? 0) > 20 && (
        <div className="text-[9px] text-slate-400 text-center pt-1">+{(data?.total_count ?? 0) - 20} more — refine search</div>
      )}
    </div>
  );
};

const CalculationEngineInner: React.FC = () => {
  const queryClient = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { project } = useReactFlow();

  const [isCreating, setIsCreating] = useState(false);
  const [selectedFormula, setSelectedFormula] = useState<any>(null);

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [tokenCode, setTokenCode] = useState('');
  const { activeProductContext, activeCoreProductId, setCoreProductId } = usePlatformStore();
  const financialDomain = activeProductContext || 'Global (Cross-Domain)';
  const [targetOutputField, setTargetOutputField] = useState('');
  const [description, setDescription] = useState('');
  const [fieldSearch, setFieldSearch] = useState('');

  // Graph State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Fetch Packages -> Products for the Cockpit Selector
  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });
  const currentPackage = packagesData?.packages?.find((p: any) => p.package_name === financialDomain);
  const packageId = currentPackage?.package_id;

  // API Bindings
  const { data: formulasData, isLoading: isLoadingFormulas } = useQuery({
    queryKey: ['calculations', packageId, activeCoreProductId],
    queryFn: async () => {
      if (!packageId || !activeCoreProductId) return { formulas: [] };
      return (await apiClient.get(`/calculations/?package_id=${packageId}&product_id=${activeCoreProductId}`)).data;
    },
    enabled: !!packageId && !!activeCoreProductId
  });



  const { data: productsData } = useQuery({
    queryKey: ['products', packageId],
    queryFn: async () => {
      if (!packageId) return [];
      const res = await apiClient.get(`/masters/products?package_id=${packageId}`);
      return res.data.products;
    },
    enabled: !!packageId
  });

  // Compiler: Graph -> Python AST String
  const compileGraphToAST = useCallback(() => {
    if (nodes.length === 0) return '';

    // Find the terminal node (a node with incoming edges but no outgoing edges)
    // Or just any node that is not a source.
    const outgoingSources = new Set(edges.map(e => e.source));
    const terminalNodes = nodes.filter(n => !outgoingSources.has(n.id));

    if (terminalNodes.length === 0) return '';
    const root = terminalNodes[0];

    const buildAST = (nodeId: string): string => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return '';

      if (node.type === 'variableNode') return node.data.technical_name;
      if (node.type === 'constantNode') return String(node.data.value || 0);
      
      if (node.type === 'operatorNode') {
        const edgeA = edges.find(e => e.target === nodeId && e.targetHandle === 'a');
        const edgeB = edges.find(e => e.target === nodeId && e.targetHandle === 'b');
        
        const left = edgeA ? buildAST(edgeA.source) : '0';
        const right = edgeB ? buildAST(edgeB.source) : '0';
        
        return `(${left} ${node.data.operator} ${right})`;
      }
      return '';
    };

    return buildAST(root.id);
  }, [nodes, edges]);

  const createFormulaMutation = useMutation({
    mutationFn: async () => {
      const ast = compileGraphToAST();
      const payload = {
        business_name: businessName,
        token_code: tokenCode,
        financial_domain: financialDomain,
        core_product_id: activeCoreProductId,
        target_output_field: targetOutputField,
        mathematical_expression: ast,
        description: description,
        // We could also save nodes/edges JSON here if backend schema supported it,
        // but for now we compile to AST for the execution engine.
      };
      const res = await apiClient.post('/calculations/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calculations'] });
      handleCancel();
    }
  });

  const handleCancel = () => {
    setIsCreating(false);
    setSelectedFormula(null);
    setBusinessName('');
    setTokenCode('');
    setTargetOutputField('');
    setDescription('');
    setNodes([]);
    setEdges([]);
  };

  // --- ReactFlow Handlers ---
  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds)), []);

  const handleNodeDataChange = (id: string, value: any) => {
    setNodes((nds) => nds.map((node) => {
      if (node.id === id) {
        return { ...node, data: { ...node.data, value } };
      }
      return node;
    }));
  };

  const onDragStart = (event: React.DragEvent, nodeType: string, nodeData: any) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/json', JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const type = event.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowWrapper.current) return;

    const dataStr = event.dataTransfer.getData('application/json');
    const incomingData = dataStr ? JSON.parse(dataStr) : {};

    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = project({
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    });

    const newNode: Node = {
      id: `MATH_${Math.random().toString(36).substr(2, 9)}`,
      type,
      position,
      data: { ...incomingData, onChange: handleNodeDataChange },
    };

    setNodes((nds) => nds.concat(newNode));
  }, [project]);

  return (
    <div className="flex flex-col w-full h-[800px]">
      <CockpitLockBanner />
      <InfinityAIHelper studioKey="calculation-engine" />
      <div className={`flex gap-6 flex-1 min-h-0 transition-all duration-300 ${!activeCoreProductId ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
      {/* Left Column: List of Formulas */}
      <div className="w-[350px] glass-card rounded-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Formula Library</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Symbolic math assets</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedFormula(null); setNodes([]); setEdges([]); }}
            className="bg-indigo-600 hover:bg-indigo-750 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98]"
          >
            + New
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoadingFormulas ? (
            <div className="text-center text-slate-400 text-xs mt-10 font-bold animate-pulse">Loading blueprints...</div>
          ) : formulasData?.formulas?.map((formula: any) => (
            <div 
              key={formula.asset_id} 
              onClick={() => { setSelectedFormula(formula); setIsCreating(false); }}
              className={`p-4 border rounded-2xl cursor-pointer transition-all duration-300 shadow-sm ${
                selectedFormula?.asset_id === formula.asset_id 
                  ? 'bg-indigo-50/40 border-indigo-200/80 shadow-glow-indigo' 
                  : 'bg-white/50 border-slate-150 hover:border-indigo-400/50 hover:bg-white/80'
              }`}
            >
              <div className="flex justify-between items-start mb-2.5">
                <div className="text-[13px] font-bold text-slate-800 tracking-tight">{formula.business_name}</div>
                <div className="text-[9px] font-mono text-indigo-650 bg-indigo-50/60 border border-indigo-100/30 px-2 py-0.5 rounded-lg font-bold">{formula.token_code}</div>
              </div>
              <div className="text-[10px] text-slate-400 font-mono bg-slate-50/80 border border-slate-100 p-2 rounded-xl line-clamp-1 truncate">{formula.mathematical_expression}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden relative">
        {!isCreating && !selectedFormula && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <span className="text-4xl mb-4 grayscale opacity-50">🧮</span>
            <p className="text-xs font-semibold text-slate-400">Select a Formula Asset or create a new one visually.</p>
          </div>
        )}

        {selectedFormula && !isCreating && (
          <div className="p-6 flex-1 overflow-y-auto animate-slide-in-right space-y-6">
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-base font-extrabold text-slate-800 font-display">{selectedFormula.business_name}</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Symbolic Math Asset Details</p>
                </div>
                <span className="font-mono text-xs text-indigo-650 bg-indigo-50/80 border border-indigo-100/50 px-2.5 py-1 rounded-lg font-bold">{selectedFormula.token_code}</span>
              </div>
              <p className="text-xs text-slate-500 mt-4 bg-slate-50/50 border border-slate-100 p-4 rounded-2xl leading-relaxed">{selectedFormula.description || 'No description provided.'}</p>
            </div>
            
            <div className="space-y-5">
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Compiled AST Expression</h3>
                <div className="bg-slate-900 border border-slate-800 text-emerald-400 font-mono p-4.5 rounded-2xl shadow-inner shadow-indigo-950/40 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedFormula.mathematical_expression}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6 pt-2">
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Target Output Field</h3>
                  <div className="font-mono text-indigo-600 font-bold text-xs bg-indigo-50/50 p-2.5 border border-indigo-100/40 rounded-xl w-max">{selectedFormula.target_output_field}</div>
                </div>
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Financial Domain</h3>
                  <div className="text-slate-700 text-xs font-semibold">{selectedFormula.financial_domain || 'N/A'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            {/* Header Form */}
            <div className="p-4 border-b border-slate-100 bg-white shadow-sm z-10 grid grid-cols-4 gap-4 items-end">
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Business Name</label>
                <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g., Margins" className="w-full text-xs font-semibold border rounded-lg p-2 outline-none focus:border-indigo-500" />
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Token Code</label>
                <input type="text" value={tokenCode} onChange={(e) => setTokenCode(e.target.value.toUpperCase())} placeholder="CALC-XX" className="w-full text-xs font-mono uppercase text-indigo-600 border rounded-lg p-2 outline-none focus:border-indigo-500" />
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Target Output</label>
                <IsoFieldSelector 
                  value={targetOutputField}
                  onChange={(val) => setTargetOutputField(val)}
                  placeholder="Select Target Output..."
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span>Domain Context</span>
                  <span className="text-rose-500" title="Locked to strict tenant/LOB compliance">🔒</span>
                </label>
                <div className="w-full text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 truncate">
                  {financialDomain}
                </div>
              </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 flex overflow-hidden">
              {/* Toolbox */}
              <div className="w-[250px] bg-slate-50 border-r border-slate-200 p-4 flex flex-col gap-6 overflow-y-auto">
                <div>
                  <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">Math Operators</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {['+', '-', '*', '/'].map((op) => (
                      <div 
                        key={op}
                        draggable
                        onDragStart={(e) => onDragStart(e, 'operatorNode', { operator: op })}
                        className="bg-white border border-slate-200 hover:border-indigo-400 p-2 rounded-lg text-center font-mono font-extrabold text-lg cursor-grab shadow-sm"
                      >
                        {op}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">Constants</h3>
                  <div 
                    draggable
                    onDragStart={(e) => onDragStart(e, 'constantNode', { value: 0 })}
                    className="bg-emerald-50 border border-emerald-200 hover:border-emerald-400 p-2 rounded-lg text-center font-mono font-bold text-emerald-700 cursor-grab shadow-sm"
                  >
                    Number Constant (0-9)
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Variables (ISO Registry)</h3>
                  <div className="relative mb-2">
                    <input
                      type="text"
                      value={fieldSearch}
                      onChange={(e) => setFieldSearch(e.target.value)}
                      placeholder="Search fields..."
                      className="w-full text-[11px] border border-slate-200 rounded-lg px-2.5 py-1.5 pl-7 outline-none focus:border-indigo-400 bg-white"
                    />
                    <svg className="w-3 h-3 text-slate-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <ISOVariableList search={fieldSearch} domain={financialDomain} onDragStart={onDragStart} />
                </div>
              </div>

              {/* ReactFlow Canvas */}
              <div className="flex-1 relative" ref={reactFlowWrapper} onDrop={onDrop} onDragOver={onDragOver}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  fitView
                >
                  <Background color="#cbd5e1" gap={16} />
                  <Controls className="bg-white/80 backdrop-blur border border-slate-200 shadow-sm rounded-xl overflow-hidden" />
                  <MiniMap nodeStrokeWidth={3} className="border border-slate-200 shadow-sm rounded-xl" />
                </ReactFlow>

                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur border border-slate-200 p-3 rounded-xl shadow-lg w-[280px]">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Live AST Compilation</div>
                  <div className="font-mono text-[10px] text-emerald-600 bg-slate-900 p-2 rounded-lg break-all">
                    {compileGraphToAST() || 'No valid connections...'}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer Action */}
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3 z-10">
              <button 
                onClick={handleCancel} 
                className="px-5 py-2 text-[12px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm active:scale-[0.98]"
              >
                Cancel
              </button>
              <button 
                disabled={createFormulaMutation.isPending || !businessName || !tokenCode || !targetOutputField || !compileGraphToAST()} 
                onClick={() => createFormulaMutation.mutate()} 
                className="px-5 py-2 text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50 active:scale-[0.98]"
              >
                {createFormulaMutation.isPending ? 'Publishing...' : 'Publish Formula Graph'}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export const CalculationEngineStudio: React.FC = () => (
  <ReactFlowProvider>
    <CalculationEngineInner />
  </ReactFlowProvider>
);