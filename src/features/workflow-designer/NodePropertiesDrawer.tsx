import React, { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

interface NodePropertiesDrawerProps {
  node: Node | null;
  onClose: () => void;
  onUpdateData: (updatedData: any) => void;
}

export const NodePropertiesDrawer: React.FC<NodePropertiesDrawerProps> = ({ node, onClose, onUpdateData }) => {
  const { 
    setActiveModule, 
    setWorkflowReturnStepId,
    activeWorkflowProductContext,
    activeWorkflowSubproductContext
  } = usePlatformStore();

  const [title, setTitle] = useState('');
  const [seq, setSeq] = useState<number>(0);
  const [stpEnabled, setStpEnabled] = useState(false);
  const [slaDuration, setSlaDuration] = useState('00:00:00:00');
  
  // SLA precise fields
  const [slaDays, setSlaDays] = useState('00');
  const [slaHours, setSlaHours] = useState('00');
  const [slaMins, setSlaMins] = useState('00');
  const [slaSecs, setSlaSecs] = useState('00');

  const [orchestrationSteps, setOrchestrationSteps] = useState<any[]>([]);
  const [screenTemplate, setScreenTemplate] = useState<string>('');
  const [requiredDocuments, setRequiredDocuments] = useState<any[]>([]);
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('UPLOAD');
  const [newDocMandatory, setNewDocMandatory] = useState(true);

  // Transitions
  const [transitions, setTransitions] = useState<any[]>([]);
  const [newOutcome, setNewOutcome] = useState('SUCCESS');
  const [newTargetStatus, setNewTargetStatus] = useState('AUTHORIZED');
  const [newNextStep, setNewNextStep] = useState('');

  // Hydrate local state when a node is selected
  useEffect(() => {
    if (node) {
      setTitle(node.data.title || '');
      setSeq(node.data.seq || 0);
      setStpEnabled(node.data.stpEnabled || false);
      
      const dur = node.data.slaDuration || '00:01:00:00';
      setSlaDuration(dur);
      const parts = dur.split(':');
      if (parts.length === 4) {
        setSlaDays(parts[0]);
        setSlaHours(parts[1]);
        setSlaMins(parts[2]);
        setSlaSecs(parts[3]);
      } else {
        setSlaDays(String(node.data.slaDays || 0).padStart(2, '0'));
      }

      setOrchestrationSteps(node.data.orchestration_steps || []);
      setScreenTemplate(node.data.screen_template || '');
      setRequiredDocuments(node.data.required_documents || []);
      setTransitions(node.data.transitions || []);
    }
  }, [node]);

  // Sync SLA fields changes to composite state string
  useEffect(() => {
    setSlaDuration(`${slaDays.padStart(2, '0')}:${slaHours.padStart(2, '0')}:${slaMins.padStart(2, '0')}:${slaSecs.padStart(2, '0')}`);
  }, [slaDays, slaHours, slaMins, slaSecs]);

  // --- FETCH NEURAL CONNECTIONS (OTHER STUDIOS) ---
  const { data: rulesData } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => (await apiClient.get('/rules/')).data
  });
  const { data: calcData } = useQuery({
    queryKey: ['calculations'],
    queryFn: async () => (await apiClient.get('/calculations/')).data
  });
  const { data: apiData } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await apiClient.get('/integrations/')).data
  });
  const { data: screenData } = useQuery({
    queryKey: ['screens'],
    queryFn: async () => (await apiClient.get('/screens/')).data
  });
  const { data: docsData } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await apiClient.get('/documents/')).data
  });
  const { data: workflowsData } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => (await apiClient.get('/workflows/')).data
  });
  const { data: reconData } = useQuery({
    queryKey: ['recon-templates'],
    queryFn: async () => (await apiClient.get('/reconciliation/templates')).data
  });

  if (!node) return null;

  // Filter core documents by active Product & Subproduct context if set
  const filteredDocuments = docsData?.filter((d: any) => {
    if (!activeWorkflowProductContext) return true;
    // Context matching simulation
    return true;
  }) || [];

  const handleInvoke = (moduleName: any) => {
    // Save current step so return banner can restore active context
    setWorkflowReturnStepId(node.id);
    setActiveModule(moduleName);
  };

  const handleSaveAll = () => {
    onUpdateData({
      title,
      seq,
      stpEnabled,
      slaDuration,
      orchestration_steps: orchestrationSteps,
      screen_template: screenTemplate,
      required_documents: requiredDocuments,
      transitions
    });
    onClose();
  };

  const handleAddStep = () => {
    setOrchestrationSteps([
      ...orchestrationSteps, 
      { sequence_number: (orchestrationSteps.length + 1) * 10, step_type: 'BUSINESS_RULE', target_token: '' }
    ]);
  };

  const handleStepChange = (index: number, field: string, value: any) => {
    const newSteps = [...orchestrationSteps];
    newSteps[index][field] = value;
    if (field === 'step_type') {
       newSteps[index].target_token = '';
    }
    setOrchestrationSteps(newSteps);
  };

  const handleAddDocument = () => {
    if (newDocName.trim()) {
      setRequiredDocuments([
        ...requiredDocuments, 
        { 
          document_name: newDocName.trim(), 
          checklist_category: newDocCategory, 
          is_mandatory: newDocMandatory
        }
      ]);
      setNewDocName('');
    }
  };

  const handleAddTransition = () => {
    if (newNextStep) {
      setTransitions([
        ...transitions,
        { outcome: newOutcome, target_status: newTargetStatus, next_step: newNextStep }
      ]);
      setNewNextStep('');
    }
  };

  return (
    <div className="absolute top-0 right-0 w-[425px] h-full bg-white/95 backdrop-blur-lg shadow-2xl border-l border-slate-200/50 z-50 flex flex-col animate-slide-in-right">
      <div className="flex justify-between items-center px-6 py-4.5 border-b border-slate-100 bg-slate-50/50">
        <div>
          <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Workflow Step Properties</h2>
          <span className="text-[10px] text-slate-400 font-mono">Node Context: {node.id}</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* STEP NAME & SEQUENCE */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Workflow Step Name</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full text-[13px] font-semibold text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all bg-white" />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Sequence</label>
            <input type="number" value={seq} onChange={(e) => setSeq(Number(e.target.value))} className="w-full text-[13px] text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 outline-none bg-white" />
          </div>
        </div>

        {/* PROCESSING & SLA MODE */}
        <div className="pt-5 border-t border-slate-100">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Processing & SLA Mode</label>
          <div className="flex items-center gap-2 mb-3">
            <input 
              type="checkbox" 
              id="stpToggle" 
              checked={stpEnabled} 
              onChange={(e) => setStpEnabled(e.target.checked)} 
              className="rounded text-indigo-600 focus:ring-indigo-500" 
            />
            <label htmlFor="stpToggle" className="text-[12px] font-bold text-slate-650 cursor-pointer">
              Straight-Through Processing (Real-time / STP)
            </label>
          </div>

          {!stpEnabled && (
            <div className="bg-slate-50 border border-slate-200/50 p-3 rounded-xl flex flex-col gap-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase">SLA Bound (DD : HH : MM : SS)</span>
              <div className="flex items-center gap-2 font-mono text-xs text-slate-700">
                <input type="text" maxLength={2} value={slaDays} onChange={(e) => setSlaDays(e.target.value)} className="w-10 text-center border rounded p-1" placeholder="DD" /> :
                <input type="text" maxLength={2} value={slaHours} onChange={(e) => setSlaHours(e.target.value)} className="w-10 text-center border rounded p-1" placeholder="HH" /> :
                <input type="text" maxLength={2} value={slaMins} onChange={(e) => setSlaMins(e.target.value)} className="w-10 text-center border rounded p-1" placeholder="MM" /> :
                <input type="text" maxLength={2} value={slaSecs} onChange={(e) => setSlaSecs(e.target.value)} className="w-10 text-center border rounded p-1" placeholder="SS" />
              </div>
            </div>
          )}
        </div>

        {/* DOCUMENT GATEKEEPERS */}
        <div className="pt-5 border-t border-slate-100">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Document Gatekeepers</label>
          <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">Required documents matching Product context.</p>
          
          <div className="space-y-2 mb-3">
            {requiredDocuments.map((doc, idx) => (
              <div key={idx} className="flex justify-between items-center bg-slate-50 border border-slate-150 px-3 py-2 rounded-xl text-[11px] font-semibold text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold uppercase bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{doc.checklist_category}</span>
                  <span>{doc.document_name}</span>
                  {doc.is_mandatory && <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">MANDATORY</span>}
                </div>
                <button onClick={() => setRequiredDocuments(requiredDocuments.filter((_, i) => i !== idx))} className="text-rose-600 hover:text-rose-900 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <select value={newDocName} onChange={(e) => setNewDocName(e.target.value)} className="flex-1 text-[11px] border border-slate-200 rounded-xl p-2 outline-none focus:border-indigo-500 bg-white">
              <option value="">Select Document...</option>
              {filteredDocuments.map((d: any) => (
                <option key={d.document_id} value={d.document_name}>{d.document_name}</option>
              ))}
            </select>
            <select value={newDocCategory} onChange={(e) => setNewDocCategory(e.target.value)} className="w-24 text-[11px] border border-slate-200 rounded-xl p-2 outline-none focus:border-indigo-500 bg-white">
              <option value="UPLOAD">UPLOAD</option>
              <option value="DOWNLOAD">DOWNLOAD</option>
            </select>
          </div>

          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer">
              <input type="checkbox" checked={newDocMandatory} onChange={(e) => setNewDocMandatory(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" /> Mandatory Check
            </label>
            <button disabled={!newDocName} onClick={handleAddDocument} className="bg-slate-850 hover:bg-slate-950 text-white px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-sm disabled:opacity-50">Add Document</button>
          </div>
        </div>

        {/* PRESENTATION LAYER */}
        <div className="pt-5 border-t border-slate-100 flex flex-col gap-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">User Screen Designer</label>
          <div className="flex gap-2">
            <select 
               value={screenTemplate} 
               onChange={(e) => setScreenTemplate(e.target.value)} 
               className="flex-1 text-[12px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 outline-none bg-white"
            >
              <option value="">No Screen (Background Task)</option>
              {screenData?.screens?.map((s: any) => (
                <option key={s.screen_id} value={s.screen_id}>{s.screen_name}</option>
              ))}
            </select>
            <button 
              onClick={() => handleInvoke('screen-designer')}
              className="bg-indigo-50 text-indigo-650 hover:bg-indigo-600 hover:text-white border border-indigo-200 text-[10px] font-bold px-3 rounded-xl transition-all shadow-sm active:scale-[0.98]"
            >
              Invoke
            </button>
          </div>
        </div>

        {/* DECISION & INTEGRATION LAYER */}
        <div className="pt-5 border-t border-slate-100 space-y-4">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Automated Orchestration Steps</label>
          
          <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-xl space-y-3 shadow-inner">
            {orchestrationSteps.length === 0 && (
               <p className="text-[11px] text-slate-400 italic text-center">No logic assets attached.</p>
            )}

            {orchestrationSteps.map((step, idx) => (
              <div key={idx} className="bg-white border border-slate-100 p-2.5 rounded-xl flex gap-2 items-center shadow-sm relative">
                 <select 
                   value={step.step_type} 
                   onChange={(e) => handleStepChange(idx, 'step_type', e.target.value)} 
                   className="w-24 text-[10px] font-bold border border-slate-200 rounded-lg p-1.5 outline-none bg-slate-50 text-slate-600"
                 >
                   <option value="BUSINESS_RULE">Rule</option>
                   <option value="CALCULATION">Math</option>
                   <option value="API_CALL">API</option>
                   <option value="SUB_WORKFLOW">Sub-Flow</option>
                   <option value="RECONCILIATION">Recon</option>
                 </select>
                 
                 <select 
                   value={step.target_token} 
                   onChange={(e) => handleStepChange(idx, 'target_token', e.target.value)} 
                   className="flex-1 text-[10px] border border-slate-200 rounded-lg p-1.5 outline-none font-mono text-indigo-650"
                 >
                   <option value="" disabled>Select Asset...</option>
                   {step.step_type === 'BUSINESS_RULE' && rulesData?.map((r: any) => <option key={r.token_code} value={r.token_code}>{r.token_code}</option>)}
                   {step.step_type === 'CALCULATION' && calcData?.formulas?.map((f: any) => <option key={f.token_code} value={f.token_code}>{f.token_code}</option>)}
                   {step.step_type === 'API_CALL' && apiData?.integrations?.map((a: any) => <option key={a.api_id} value={a.api_id}>{a.api_name}</option>)}
                   {step.step_type === 'SUB_WORKFLOW' && workflowsData?.map((w: any) => <option key={w.workflow_id} value={w.workflow_id}>{w.workflow_name}</option>)}
                   {step.step_type === 'RECONCILIATION' && reconData?.templates?.map((t: any) => <option key={t.reconciliation_template_id} value={t.reconciliation_template_id}>{t.reconciliation_name}</option>)}
                 </select>

                 <button 
                   onClick={() => {
                     if (step.step_type === 'BUSINESS_RULE') handleInvoke('business-rules');
                     if (step.step_type === 'CALCULATION') handleInvoke('calculation-engine');
                     if (step.step_type === 'API_CALL') handleInvoke('api-designer');
                     if (step.step_type === 'RECONCILIATION') handleInvoke('reconciliation-engine');
                   }}
                   className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-1 rounded hover:bg-indigo-600 hover:text-white transition-colors"
                 >
                   Invoke
                 </button>

                 <button onClick={() => setOrchestrationSteps(orchestrationSteps.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                 </button>
              </div>
            ))}

            <button onClick={handleAddStep} className="text-[10px] font-bold text-indigo-650 bg-white border border-indigo-150 hover:bg-indigo-50 px-3 py-1.5 rounded-xl transition-all w-full shadow-sm">
              + Add Orchestration Step
            </button>
          </div>
        </div>

        {/* STATE TRANSITION CONDITIONS */}
        <div className="pt-5 border-t border-slate-100 space-y-3">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">State Transition Conditions</label>
          
          <div className="space-y-2">
            {transitions.map((t, idx) => (
              <div key={idx} className="flex justify-between items-center bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-[10px] font-mono">
                <div>
                  <span className="font-bold text-slate-500">Outcome:</span> <span className="text-indigo-600 font-bold">{t.outcome}</span> <br/>
                  <span className="font-bold text-slate-500">Status:</span> <span className="text-emerald-600 font-bold">{t.target_status}</span> <br/>
                  <span className="font-bold text-slate-500">Next Step:</span> <span className="text-slate-800 font-bold">{t.next_step}</span>
                </div>
                <button onClick={() => setTransitions(transitions.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select value={newOutcome} onChange={(e) => setNewOutcome(e.target.value)} className="text-[10px] border border-slate-200 rounded-xl p-2 outline-none bg-white">
              <option value="SUCCESS">On SUCCESS</option>
              <option value="FAILURE">On FAILURE</option>
              <option value="HOLD">On HOLD</option>
            </select>
            <select value={newTargetStatus} onChange={(e) => setNewTargetStatus(e.target.value)} className="text-[10px] border border-slate-200 rounded-xl p-2 outline-none bg-white">
              <option value="AUTHORIZED">AUTHORIZED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="EXCEPTION_HOLD">EXCEPTION_HOLD</option>
            </select>
          </div>

          <div className="flex gap-2">
            <select value={newNextStep} onChange={(e) => setNewNextStep(e.target.value)} className="flex-1 text-[10px] border border-slate-200 rounded-xl p-2 outline-none bg-white">
              <option value="">Select Next Step Step...</option>
              {workflowsData?.map((w: any) => (
                <optgroup key={w.workflow_id} label={w.workflow_name}>
                  {w.nodes?.map((n: any) => (
                    <option key={n.node_id} value={n.node_id}>{n.node_title} ({n.node_id})</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button onClick={handleAddTransition} disabled={!newNextStep} className="bg-slate-850 hover:bg-slate-950 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl disabled:opacity-50">
              Add Link
            </button>
          </div>
        </div>

      </div>

      <div className="p-4.5 border-t border-slate-150 bg-slate-50/50 flex justify-end gap-3">
        <button onClick={onClose} className="px-5 py-2.5 text-[13px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-[0.98] shadow-sm">Cancel</button>
        <button onClick={handleSaveAll} className="px-5 py-2.5 text-[13px] font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl hover:from-indigo-750 hover:to-indigo-800 transition-all active:scale-[0.98] shadow-md shadow-indigo-600/10">Save Changes</button>
      </div>
    </div>
  );
};