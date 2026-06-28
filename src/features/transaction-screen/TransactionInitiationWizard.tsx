import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { RuntimeScreenRenderer } from '../package-runtime/RuntimeScreenRenderer';

interface TransactionInitiationWizardProps {
  onClose: () => void;
  onInstanceCreated: (instanceId: string) => void;
}

const setByPath = (obj: any, path: string, value: any) => {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
};

const expandFlat = (flat: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (v === '' || v == null) continue;
    setByPath(out, k, v);
  }
  return out;
};

const engineDefaults = () => ({
  XchgRate: 0.7923,
  FX_TIMESTAMP: new Date(Date.now() - 60_000).toISOString(),
  PAYMENT_INSTRUCTION: true,
  COMPLIANCE_CLEARANCE: true,
  SETTLEMENT_CONFIRMATION: false,
  nostro_account_number: 'GB12BARX20714700000000',
});

type RunStep = 'form' | 'running' | 'error';

export const TransactionInitiationWizard: React.FC<TransactionInitiationWizardProps> = ({
  onClose, onInstanceCreated,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedSubproductId, setSelectedSubproductId] = useState<string>('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [step, setStep] = useState<RunStep>('form');
  const [errMsg, setErrMsg] = useState('');

  // 1. Fetch Products
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products-list'],
    queryFn: async () => (await apiClient.get('/masters/products')).data,
  });
  const products: any[] = productsData?.products ?? [];

  // 2. Fetch Subproducts based on Product
  const { data: subproductsData, isLoading: subproductsLoading } = useQuery({
    queryKey: ['subproducts-list', selectedProductId],
    queryFn: async () => (await apiClient.get(`/masters/subproducts?product_id=${selectedProductId}`)).data,
    enabled: !!selectedProductId,
  });
  const subproducts: any[] = subproductsData?.subproducts ?? [];

  // 3. Fetch workflows matching Product (and Sub-Product, if selected)
  const { data: workflowsData, isLoading: workflowsLoading } = useQuery({
    queryKey: ['workflows-for-product-subproduct', selectedProductId, selectedSubproductId],
    queryFn: async () => {
      let url = `/workflows/?product_id=${selectedProductId}`;
      if (selectedSubproductId) {
        url += `&subproduct_id=${selectedSubproductId}`;
      }
      return (await apiClient.get(url)).data;
    },
    enabled: !!selectedProductId,
  });

  const workflows: any[] = workflowsData ?? [];

  // Filter list to only show workflows (allow all statuses for simulation)
  const liveWorkflows = useMemo(() => {
    return workflows;
  }, [workflows]);

  // Auto-select workflow if exactly 1 exists
  useEffect(() => {
    if (liveWorkflows.length === 1) {
      setSelectedWorkflowId(liveWorkflows[0].workflow_id);
    } else {
      if (selectedWorkflowId && !liveWorkflows.find(w => w.workflow_id === selectedWorkflowId)) {
        setSelectedWorkflowId('');
      }
    }
  }, [liveWorkflows]);

  const selectedWorkflow = useMemo(() => {
    return liveWorkflows.find(w => w.workflow_id === selectedWorkflowId) || null;
  }, [liveWorkflows, selectedWorkflowId]);

  const workflowId = selectedWorkflowId;

  // 4. Fetch the selected workflow's detail to get the START node screen
  const { data: workflowDetail } = useQuery({
    queryKey: ['workflow-detail-for-run', workflowId],
    queryFn: async () => (await apiClient.get(`/workflows/${workflowId}`)).data,
    enabled: !!workflowId,
  });

  const startNode = useMemo(() => {
    const nodes = workflowDetail?.nodes ?? [];
    if (!nodes.length) return null;
    return [...nodes].sort((a: any, b: any) => a.sequence_number - b.sequence_number)[0];
  }, [workflowDetail]);
  const startScreenTemplate: string | undefined = startNode?.screen_template;

  // 5. Load the authored capture screen
  const { data: captureScreen, isLoading: screenLoading } = useQuery({
    queryKey: ['capture-screen', startScreenTemplate],
    queryFn: async () => (await apiClient.get(`/screens/${startScreenTemplate}`)).data,
    enabled: !!startScreenTemplate,
  });

  const executeMutation = useMutation({
    mutationFn: async (payload: any) =>
      (await apiClient.post(`/workflows/${workflowId}/execute`, payload)).data,
    onSuccess: (data) => {
      onInstanceCreated(data.instance_id);
    },
    onError: (err: any) => {
      setErrMsg(err?.response?.data?.detail || String(err));
      setStep('error');
    },
  });

  const handleScreenSubmit = (values: Record<string, any>, action: string) => {
    if (action === 'CANCEL_SESSION') { onClose(); return; }
    if (!workflowId) return;
    
    const payload = {
      ...engineDefaults(),
      ...expandFlat(values),
      Message: { ID: `MSG-${Date.now()}` },
    };
    setStep('running');
    executeMutation.mutate(payload);
  };

  return (
    <div className="w-full flex flex-col h-full bg-slate-50 relative">
      <div className="px-8 py-6 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Initiate Transaction</h2>
          <p className="text-sm text-slate-500 mt-1">Select a Product to determine the template and capture requirements.</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm font-medium px-4 py-2 border border-slate-200 rounded-lg shadow-sm bg-white hover:bg-slate-50 transition-colors">
          Cancel
        </button>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Selection Panel: Product, Sub-Product, and Workflow */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Product <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedProductId}
                onChange={e => {
                  setSelectedProductId(e.target.value);
                  setSelectedSubproductId('');
                  setSelectedWorkflowId('');
                }}
                className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-shadow bg-slate-50/50 hover:bg-white"
              >
                <option value="">-- Select Product --</option>
                {products.map(p => (
                  <option key={p.product_id} value={p.product_id}>{p.product_name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Sub-Product (Optional)
              </label>
              <select
                value={selectedSubproductId}
                onChange={e => {
                  setSelectedSubproductId(e.target.value);
                  setSelectedWorkflowId('');
                }}
                disabled={!selectedProductId || subproductsLoading}
                className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-shadow bg-slate-50/50 hover:bg-white disabled:opacity-50"
              >
                <option value="">-- Select Sub-Product --</option>
                {subproducts.map(sp => (
                  <option key={sp.subproduct_id} value={sp.subproduct_id}>{sp.subproduct_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Workflow Template <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedWorkflowId}
                onChange={e => setSelectedWorkflowId(e.target.value)}
                disabled={!selectedProductId || workflowsLoading}
                className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-shadow bg-slate-50/50 hover:bg-white disabled:opacity-50"
              >
                <option value="">-- Select Workflow --</option>
                {liveWorkflows.map(w => (
                  <option key={w.workflow_id} value={w.workflow_id}>
                    {w.workflow_name} ({w.workflow_id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Error Banner */}
          {errMsg && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
              <div className="flex items-center">
                <div className="text-red-500 mr-3">✕</div>
                <div className="text-sm font-medium text-red-800">{errMsg}</div>
              </div>
            </div>
          )}

          {/* Resolving State Messages */}
          {selectedProductId && workflowsLoading && (
            <div className="text-sm text-slate-400 text-center py-10 animate-pulse">Resolving workflows...</div>
          )}

          {selectedProductId && !workflowsLoading && liveWorkflows.length === 0 && (
             <div className="text-sm text-slate-400 text-center py-10 bg-white rounded-xl border border-dashed border-slate-200">
               No live workflows are configured for the selected criteria.
             </div>
          )}

          {selectedWorkflow && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Resolved Workflow</div>
                  <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {selectedWorkflow.workflow_name} <span className="text-slate-400 font-normal">({selectedWorkflow.workflow_id})</span>
                  </div>
                </div>
                {startNode && (
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Entry Step</div>
                    <div className="text-sm text-slate-600 font-medium">
                      {startNode.node_title}
                      {startScreenTemplate ? <span className="text-slate-400 ml-1 font-normal">({startScreenTemplate})</span> : null}
                    </div>
                  </div>
                )}
              </div>

              {/* Planned Execution Route */}
              <div className="bg-white px-6 py-4 border-b border-slate-100 overflow-x-auto">
                <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3">Planned Execution Route</div>
                <div className="flex items-center gap-2 text-xs">
                  {selectedWorkflow.nodes
                    ?.sort((a: any, b: any) => a.sequence_number - b.sequence_number)
                    .map((n: any, idx: number, arr: any[]) => (
                      <React.Fragment key={n.node_id}>
                        <div className={`px-3 py-1.5 rounded-full border whitespace-nowrap font-medium ${
                          idx === 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}>
                          {n.sequence_number}. {n.node_title}
                        </div>
                        {idx < arr.length - 1 && (
                          <div className="text-slate-300">→</div>
                        )}
                      </React.Fragment>
                    ))}
                </div>
              </div>
              
              <div className="p-6">
                {step === 'running' ? (
                  <div className="text-center py-12 flex flex-col items-center justify-center">
                    <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                    <div className="text-sm font-semibold text-slate-700">Initiating transaction...</div>
                  </div>
                ) : startScreenTemplate ? (
                  screenLoading ? (
                    <div className="text-sm text-slate-400 text-center py-12 animate-pulse">Loading capture screen...</div>
                  ) : captureScreen ? (
                    <RuntimeScreenRenderer
                      screenName={captureScreen.screen_name}
                      definition={captureScreen.definition}
                      onSubmit={handleScreenSubmit}
                    />
                  ) : (
                    <div className="text-sm text-red-500 py-6 text-center bg-red-50 rounded-lg">Could not load the capture screen for this workflow start node.</div>
                  )
                ) : (
                  <div className="p-8 text-center bg-amber-50/50 border border-amber-200 rounded-xl max-w-2xl mx-auto my-6">
                    <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4 text-xl font-bold">⚠</div>
                    <h4 className="text-sm font-bold text-slate-800 mb-1">No Start Screen Configured</h4>
                    <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto leading-relaxed">
                      The starting step of this workflow does not have an entry screen template associated with it. 
                      In accordance with the system design architecture, transactions must be initiated via dynamic forms defined in the Screen Designer and Workflow Studio.
                    </p>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Workflow ID: {workflowId} · Node: {startNode?.node_title || 'Start Node'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
};
