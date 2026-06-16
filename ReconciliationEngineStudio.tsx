import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const ReconciliationEngineStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  // Form State
  const [reconciliationName, setReconciliationName] = useState('');
  const [reconciliationCategory, setReconciliationCategory] = useState('DATA_COMPARE');
  const [sourceDatasetName, setSourceDatasetName] = useState('');
  const [targetDatasetName, setTargetDatasetName] = useState('');
  const [description, setDescription] = useState('');
  const [applicationPackageId, setApplicationPackageId] = useState('');
  const [matchingRules, setMatchingRules] = useState([
    { source_field: '', target_field: '', match_type: 'EXACT', tolerance_value: '', fuzzy_score_cutoff: '', pre_calculation_token: '', business_rule_token: '' }
  ]);

  // Data Fetching
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['recon-templates'],
    queryFn: async () => (await apiClient.get('/reconciliation/templates')).data
  });

  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });

  const { data: rulesData } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => (await apiClient.get('/rules/')).data
  });

  const { data: calcData } = useQuery({
    queryKey: ['calculations'],
    queryFn: async () => (await apiClient.get('/calculations/')).data
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        reconciliation_name: reconciliationName,
        reconciliation_category: reconciliationCategory,
        source_dataset_name: sourceDatasetName,
        target_dataset_name: targetDatasetName,
        description,
        application_package_id: applicationPackageId || null,
        matching_rules: matchingRules.filter(r => r.source_field && r.target_field).map(r => ({
          ...r,
          tolerance_value: r.match_type === 'TOLERANCE' && r.tolerance_value ? parseFloat(r.tolerance_value) : null,
          fuzzy_score_cutoff: r.match_type === 'FUZZY' && r.fuzzy_score_cutoff ? parseInt(r.fuzzy_score_cutoff, 10) : null,
          pre_calculation_token: r.pre_calculation_token || null,
          business_rule_token: r.business_rule_token || null
        }))
      };
      return (await apiClient.post('/reconciliation/templates', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recon-templates'] });
      setIsCreating(false);
      resetForm();
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'An error occurred while saving.');
    }
  });

  const resetForm = () => {
    setReconciliationName('');
    setReconciliationCategory('DATA_COMPARE');
    setSourceDatasetName('');
    setTargetDatasetName('');
    setDescription('');
    setApplicationPackageId('');
    setMatchingRules([{ source_field: '', target_field: '', match_type: 'EXACT', tolerance_value: '', fuzzy_score_cutoff: '', pre_calculation_token: '', business_rule_token: '' }]);
  };

  const handleAddRule = () => {
    setMatchingRules([...matchingRules, { source_field: '', target_field: '', match_type: 'EXACT', tolerance_value: '', fuzzy_score_cutoff: '', pre_calculation_token: '', business_rule_token: '' }]);
  };

  const handleRuleChange = (index: number, field: string, value: any) => {
    const newRules: any = [...matchingRules];
    newRules[index][field] = value;
    setMatchingRules(newRules);
  };

  return (
    <div className="flex gap-6 h-[750px] animate-fade-in">
      {/* Left List */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Reconciliation Templates</h2>
            <p className="text-xs text-slate-500 mt-0.5">High-speed data matching blueprints.</p>
          </div>
          <button onClick={() => { setIsCreating(true); setSelectedTemplate(null); resetForm(); }} className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors">
            + New Template
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div>
          ) : templatesData?.templates?.map((t: any) => (
            <div key={t.reconciliation_template_id} onClick={() => { setSelectedTemplate(t); setIsCreating(false); }} className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedTemplate?.reconciliation_template_id === t.reconciliation_template_id ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}>
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800 truncate">{t.reconciliation_name}</div>
                <div className="text-[9px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold border border-blue-100">{t.reconciliation_category}</div>
              </div>
              <div className="text-[10px] text-slate-500 line-clamp-1">{t.source_dataset_name} ↔ {t.target_dataset_name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Canvas */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!isCreating && !selectedTemplate && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select a Reconciliation Template or create a new one.</p>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Design Reconciliation Template</h2>
              <p className="text-xs text-slate-500 mt-1">Configure combinatorial match patterns, tolerances, and pre-processing formulas.</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Template Name</label><input type="text" value={reconciliationName} onChange={(e) => setReconciliationName(e.target.value)} placeholder="e.g., End of Day CHIPS Settlement" className="w-full text-[13px] font-semibold border border-slate-300 rounded p-2.5 outline-none focus:border-[#0176D3]" /></div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Category</label>
                  <select value={reconciliationCategory} onChange={(e) => setReconciliationCategory(e.target.value)} className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none focus:border-[#0176D3] bg-white">
                    <option value="DATA_COMPARE">General Data Compare</option>
                    <option value="NOSTRO_VOSTRO">Nostro-Vostro (Ledger)</option>
                    <option value="MIGRATION">Legacy Data Migration</option>
                    <option value="FILE_TO_FILE">File to File Recon</option>
                    <option value="SYSTEM_TO_SYSTEM">System to System</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Application Scope</label>
                  <select value={applicationPackageId} onChange={(e) => setApplicationPackageId(e.target.value)} className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none focus:border-[#0176D3] bg-white">
                    <option value="">Global (All Packages)</option>
                    {packagesData?.packages?.map((pkg: any) => (<option key={pkg.package_id} value={pkg.package_id}>{pkg.package_name}</option>))}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 border border-slate-200 rounded">
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Source Dataset Alias (Left)</label><input type="text" value={sourceDatasetName} onChange={(e) => setSourceDatasetName(e.target.value)} placeholder="e.g., Inbound_MT103_Data" className="w-full text-[13px] font-mono border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" /></div>
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Target Dataset Alias (Right)</label><input type="text" value={targetDatasetName} onChange={(e) => setTargetDatasetName(e.target.value)} placeholder="e.g., Core_Ledger_Extract" className="w-full text-[13px] font-mono border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" /></div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                  <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">Combinatorial Matching Rules</label>
                  <button onClick={handleAddRule} className="text-[#0176D3] text-[11px] font-bold hover:underline">+ Add Match Rule</button>
                </div>
                <div className="space-y-4">
                  {matchingRules.map((rule, idx) => (
                    <div key={idx} className="bg-slate-50 border border-slate-200 p-4 rounded shadow-sm relative">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-3"><label className="block text-[10px] font-bold text-slate-500 mb-1">Source Key (Left)</label><input type="text" value={rule.source_field} onChange={(e) => handleRuleChange(idx, 'source_field', e.target.value)} placeholder="e.g., amount_usd" className="w-full text-[12px] font-mono border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" /></div>
                        <div className="col-span-2 text-center text-slate-400 mt-4">
                          <select value={rule.match_type} onChange={(e) => handleRuleChange(idx, 'match_type', e.target.value)} className="text-[11px] font-bold text-slate-700 bg-white border border-slate-300 rounded p-1 outline-none text-center w-full">
                            <option value="EXACT">EXACT (=)</option>
                            <option value="TOLERANCE">TOLERANCE (±)</option>
                            <option value="FUZZY">FUZZY (~)</option>
                          </select>
                        </div>
                        <div className="col-span-3"><label className="block text-[10px] font-bold text-slate-500 mb-1">Target Key (Right)</label><input type="text" value={rule.target_field} onChange={(e) => handleRuleChange(idx, 'target_field', e.target.value)} placeholder="e.g., settlement_amt" className="w-full text-[12px] font-mono border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" /></div>
                        
                        <div className="col-span-4">
                          {rule.match_type === 'TOLERANCE' && (
                            <><label className="block text-[10px] font-bold text-amber-600 mb-1">Absolute Tolerance (±)</label><input type="number" step="0.01" value={rule.tolerance_value} onChange={(e) => handleRuleChange(idx, 'tolerance_value', e.target.value)} placeholder="e.g., 0.05" className="w-full text-[12px] font-mono border border-amber-300 rounded p-2 outline-none focus:border-amber-500 bg-amber-50" /></>
                          )}
                          {rule.match_type === 'FUZZY' && (
                            <><label className="block text-[10px] font-bold text-indigo-600 mb-1">Fuzzy Confidence Cutoff (0-100)</label><input type="number" value={rule.fuzzy_score_cutoff} onChange={(e) => handleRuleChange(idx, 'fuzzy_score_cutoff', e.target.value)} placeholder="e.g., 85" className="w-full text-[12px] font-mono border border-indigo-300 rounded p-2 outline-none focus:border-indigo-500 bg-indigo-50" /></>
                          )}
                        </div>
                      </div>

                      {/* Advanced Hooks */}
                      <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><svg className="w-3 h-3 text-[#0176D3]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> Pre-Match Calculation Formula</label>
                          <select value={rule.pre_calculation_token} onChange={(e) => handleRuleChange(idx, 'pre_calculation_token', e.target.value)} className="w-full text-[11px] font-mono border border-slate-300 rounded p-1.5 outline-none bg-white text-[#0176D3]"><option value="">No pre-calculation</option>{calcData?.formulas?.map((f: any) => (<option key={f.token_code} value={f.token_code}>{f.token_code} - {f.business_name}</option>))}</select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Pre-Requisite Business Rule</label>
                          <select value={rule.business_rule_token} onChange={(e) => handleRuleChange(idx, 'business_rule_token', e.target.value)} className="w-full text-[11px] font-mono border border-slate-300 rounded p-1.5 outline-none bg-white text-emerald-600"><option value="">No prerequisite rule</option>{rulesData?.map((r: any) => (<option key={r.token_code} value={r.token_code}>{r.token_code} - {r.business_name}</option>))}</select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={createTemplateMutation.isPending || !reconciliationName || !sourceDatasetName || !targetDatasetName} onClick={() => createTemplateMutation.mutate()} className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors disabled:opacity-50">
                {createTemplateMutation.isPending ? 'Saving...' : 'Deploy Template'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};