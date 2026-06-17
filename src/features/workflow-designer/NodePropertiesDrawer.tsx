import React, { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface NodePropertiesDrawerProps {
  node: Node | null;
  onClose: () => void;
}

export const NodePropertiesDrawer: React.FC<NodePropertiesDrawerProps> = ({ node, onClose }) => {
  const [orchestrationSteps, setOrchestrationSteps] = useState<any[]>([]);
  const [screenTemplate, setScreenTemplate] = useState<string>('');
  const [requiredDocuments, setRequiredDocuments] = useState<any[]>([]);
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('UPLOAD');
  const [newDocMandatory, setNewDocMandatory] = useState(true);
  const [newDocRule, setNewDocRule] = useState('');

  // Hydrate local state when a new node is selected
  useEffect(() => {
    if (node) {
      setOrchestrationSteps(node.data.orchestration_steps || []);
      setScreenTemplate(node.data.screen_template || '');
      // Handle legacy string arrays vs new object arrays
      const docs = node.data.required_documents || [];
      const normalizedDocs = docs.map((doc: any) => {
        if (typeof doc === 'string') {
          return { document_name: doc, checklist_category: 'UPLOAD', is_mandatory: true, linked_covenant_rule: null };
        }
        return doc;
      });
      setRequiredDocuments(normalizedDocs);
    }
  }, [node]);

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
  
  // --- SYNAPTIC LINK: Fetch Live Event Dictionary ---
  const { data: eventStatus } = useQuery({
    queryKey: ['event-status'],
    queryFn: async () => (await apiClient.get('/events/status')).data
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
  const eventTypes = eventStatus ? Object.keys(eventStatus.listeners) : [];

  if (!node) return null;

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
       newSteps[index].target_token = ''; // Reset target when type changes
       newSteps[index].target_event_type = '';
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
          is_mandatory: newDocMandatory, 
          linked_covenant_rule: newDocCategory === 'COVENANT' ? newDocRule : null 
        }
      ]);
      setNewDocName('');
      setNewDocRule('');
    }
  };

  return (
    <div className="absolute top-0 right-0 w-[420px] h-full bg-white/95 backdrop-blur-lg shadow-2xl border-l border-slate-200/50 z-50 flex flex-col animate-slide-in-right">
      <div className="flex justify-between items-center px-6 py-4.5 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight font-display">Node Properties</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Node ID</label>
          <div className="text-xs font-mono bg-slate-50/80 p-3 rounded-xl text-slate-600 border border-slate-200/50">{node.id}</div>
        </div>
        
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Node Title</label>
          <input type="text" defaultValue={node.data.title} className="w-full text-[13px] font-semibold text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm bg-white/60" />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Sequence</label>
            <input type="number" defaultValue={node.data.seq} className="w-full text-[13px] text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm bg-white/60" />
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">SLA (Days)</label>
            <input type="number" defaultValue={node.data.slaDays} className="w-full text-[13px] text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm bg-white/60" />
          </div>
        </div>

        {/* DOCUMENT PREREQUISITES */}
        <div className="pt-5 border-t border-slate-100">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Document Checklists</label>
          <p className="text-[10px] text-slate-450 mb-3.5 leading-relaxed">Define Upload, Download, and Covenant prerequisites.</p>
          <div className="space-y-2 mb-3">
            {requiredDocuments.map((doc, idx) => (
              <div key={idx} className="flex flex-col bg-amber-50/40 border border-amber-100/50 px-4 py-2.5 rounded-xl text-[11px] font-bold text-amber-800 relative shadow-sm">
                <button onClick={() => setRequiredDocuments(requiredDocuments.filter((_, i) => i !== idx))} className="absolute top-2.5 right-2.5 text-amber-600 hover:text-red-500 transition-colors"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                <div className="flex items-center gap-2 mb-1.5"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg> {doc.document_name}</div>
                <div className="flex gap-2 text-[9px] font-mono">
                  <span className="bg-amber-100/60 px-1.5 py-0.5 rounded-md">{doc.checklist_category}</span>
                  <span className={doc.is_mandatory ? 'text-rose-600' : 'text-slate-500'}>{doc.is_mandatory ? 'MANDATORY' : 'OPTIONAL'}</span>
                  {doc.linked_covenant_rule && <span className="text-indigo-600">Rule: {doc.linked_covenant_rule}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <select value={newDocName} onChange={(e) => setNewDocName(e.target.value)} className="text-[11px] border border-slate-200 rounded-xl p-2 outline-none focus:border-indigo-500 bg-white">
              <option value="" disabled>Select Core Document...</option>
              {docsData?.map((d: any) => (
                <option key={d.document_id} value={d.document_name}>{d.document_name} ({d.document_format})</option>
              ))}
            </select>
            <select value={newDocCategory} onChange={(e) => setNewDocCategory(e.target.value)} className="text-[11px] border border-slate-200 rounded-xl p-2 outline-none focus:border-indigo-500 bg-white">
              <option value="UPLOAD">UPLOAD</option>
              <option value="DOWNLOAD">DOWNLOAD</option>
              <option value="COVENANT">COVENANT</option>
            </select>
          </div>
          {newDocCategory === 'COVENANT' && (
            <div className="mb-2">
              <select value={newDocRule} onChange={(e) => setNewDocRule(e.target.value)} className="w-full text-[11px] border border-slate-200 rounded-xl p-2 outline-none focus:border-indigo-500 bg-white">
                <option value="">Select Covenant Rule (Optional)...</option>
                {rulesData?.map((r: any) => (<option key={r.token_code} value={r.token_code}>{r.business_name} ({r.token_code})</option>))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer"><input type="checkbox" checked={newDocMandatory} onChange={(e) => setNewDocMandatory(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" /> Mandatory Check</label>
            <button disabled={!newDocName} onClick={handleAddDocument} className="bg-slate-850 hover:bg-slate-950 text-white px-3.5 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm active:scale-[0.97] disabled:opacity-50">Add Document</button>
          </div>
        </div>

        {/* THE SCREEN DESIGNER SYNAPSE */}
        <div className="pt-5 border-t border-slate-100">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Assigned User Interface (Screen Canva)</label>
          <select 
             value={screenTemplate} 
             onChange={(e) => setScreenTemplate(e.target.value)} 
             className="w-full text-[13px] text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 outline-none bg-white"
          >
            <option value="">No UI Screen Required (Background Task)</option>
            {screenData?.screens?.map((s: any) => (
              <option key={s.screen_id} value={s.screen_id}>{s.screen_name}</option>
            ))}
          </select>
        </div>

        {/* THE ORCHESTRATION SYNAPSE */}
        <div className="pt-5 border-t border-slate-100">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Layer 4 Orchestration Steps</label>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/50 p-4 rounded-xl space-y-3 shadow-inner">
            
            {orchestrationSteps.length === 0 && (
               <p className="text-[11px] text-slate-400 italic text-center">No logic assets attached.</p>
            )}

            {orchestrationSteps.map((step, idx) => (
              <div key={idx} className="bg-white border border-slate-100 p-2.5 rounded-xl flex gap-2 items-center shadow-sm hover:border-slate-200 transition-colors">
                 <span className="text-[9px] font-bold text-slate-400 bg-slate-100 p-1.5 rounded-lg shrink-0">{step.sequence_number}</span>
                 <select 
                   value={step.step_type} 
                   onChange={(e) => handleStepChange(idx, 'step_type', e.target.value)} 
                   className="w-28 text-[10px] font-bold border border-slate-200/60 rounded-lg p-1.5 outline-none bg-slate-50 text-slate-600 focus:border-indigo-500"
                 >
                   <option value="BUSINESS_RULE">Rule Engine</option>
                   <option value="CALCULATION">Math Engine</option>
                   <option value="API_CALL">API Webhook</option>
                   <option value="SUB_WORKFLOW">Sub-Workflow</option>
                   <option value="RECONCILIATION">Recon Engine</option>
                   <option value="EVENT_BROADCAST">Fire Event</option>
                 </select>
                 
                 {step.step_type === 'EVENT_BROADCAST' ? (
                   <input type="text" placeholder="e.g., TX_FAILED" value={step.target_event_type || ''} onChange={(e) => handleStepChange(idx, 'target_event_type', e.target.value)} className="flex-1 text-[10px] border border-slate-250 rounded-lg p-1.5 outline-none font-mono text-amber-600 focus:border-indigo-500 bg-white" />
                 ) : (
                   <select 
                     value={step.target_token} 
                     onChange={(e) => handleStepChange(idx, 'target_token', e.target.value)} 
                     className="flex-1 text-[10px] border border-slate-250 rounded-lg p-1.5 outline-none font-mono text-indigo-600 focus:border-indigo-500 bg-white"
                   >
                     <option value="" disabled>Select Asset...</option>
                     {step.step_type === 'BUSINESS_RULE' && rulesData?.map((r: any) => <option key={r.token_code} value={r.token_code}>{r.token_code}</option>)}
                     {step.step_type === 'CALCULATION' && calcData?.formulas?.map((f: any) => <option key={f.token_code} value={f.token_code}>{f.token_code}</option>)}
                     {step.step_type === 'API_CALL' && apiData?.integrations?.map((a: any) => <option key={a.api_id} value={a.api_id}>{a.api_name}</option>)}
                     {step.step_type === 'SUB_WORKFLOW' && workflowsData?.map((w: any) => <option key={w.workflow_id} value={w.workflow_id}>{w.workflow_name}</option>)}
                     {step.step_type === 'RECONCILIATION' && reconData?.templates?.map((t: any) => <option key={t.reconciliation_template_id} value={t.reconciliation_template_id}>{t.reconciliation_name}</option>)}
                   </select>
                 )}
              </div>
            ))}

            <button onClick={handleAddStep} className="text-[11px] font-bold text-indigo-650 bg-white border border-indigo-200/80 hover:bg-indigo-600 hover:text-white px-4 py-2 rounded-xl transition-all w-full shadow-sm active:scale-[0.98] mt-2">
              + Add Orchestration Step
            </button>
          </div>
        </div>
      </div>
      
      <datalist id="event-types-list">
        {eventTypes.map(et => <option key={et} value={et} />)}
      </datalist>

      <div className="p-4.5 border-t border-slate-150 bg-slate-50/50 flex justify-end gap-3 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.03)]">
        <button onClick={onClose} className="px-5 py-2.5 text-[13px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-[0.98] shadow-sm">Cancel</button>
        <button className="px-5 py-2.5 text-[13px] font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl hover:from-indigo-750 hover:to-indigo-800 transition-all active:scale-[0.98] shadow-md shadow-indigo-600/10">Save Changes</button>
      </div>
    </div>
  );
};