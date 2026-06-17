import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const CalculationEngineStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFormula, setSelectedFormula] = useState<any>(null);

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [tokenCode, setTokenCode] = useState('');
  const [financialDomain, setFinancialDomain] = useState('Credit Risk');
  const [targetOutputField, setTargetOutputField] = useState('');
  const [mathematicalExpression, setMathematicalExpression] = useState('');
  const [description, setDescription] = useState('');

  // --- DYNAMIC API BINDINGS ---
  
  // 1. Fetch Existing Calculation Formulas
  const { data: formulasData, isLoading: isLoadingFormulas } = useQuery({
    queryKey: ['calculations'],
    queryFn: async () => (await apiClient.get('/calculations/')).data
  });

  // 2. Fetch ISO Field Registry (For target output dropdowns)
  const { data: fieldsData } = useQuery({
    queryKey: ['fields-all'],
    queryFn: async () => (await apiClient.get('/fields/registry?limit=1000')).data
  });

  // 3. Mutation to Save a New Formula
  const createFormulaMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        business_name: businessName,
        token_code: tokenCode,
        financial_domain: financialDomain,
        target_output_field: targetOutputField,
        mathematical_expression: mathematicalExpression,
        description: description
      };
      const res = await apiClient.post('/calculations/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calculations'] });
      setIsCreating(false);
      
      // Reset form
      setBusinessName('');
      setTokenCode('');
      setTargetOutputField('');
      setMathematicalExpression('');
      setDescription('');
    }
  });

  return (
    <div className="flex gap-6 h-[750px]">
      
      {/* Left Column: List of Formulas */}
      <div className="w-[400px] glass-card rounded-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Formula Library</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Symbolic math assets</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedFormula(null); }}
            className="bg-indigo-600 hover:bg-indigo-750 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98]"
          >
            + New Formula
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
            <svg className="w-16 h-16 mb-4 opacity-50 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
            <p className="text-xs font-semibold text-slate-400">Select a Formula Asset or create a new one.</p>
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
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Mathematical Expression</h3>
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
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-[16px] font-extrabold text-slate-800 font-display">Design New Symbolic Formula</h2>
              <p className="text-[11px] text-slate-400 mt-1">Define isolated mathematical logic blocks to be invoked by the Workflow or Rules Engine.</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Business Name</label>
                  <input 
                    type="text" 
                    value={businessName} 
                    onChange={(e) => setBusinessName(e.target.value)} 
                    placeholder="e.g., Risk Adjusted Margin" 
                    className="w-full text-[13px] font-semibold text-slate-850 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Token Code</label>
                  <input 
                    type="text" 
                    value={tokenCode} 
                    onChange={(e) => setTokenCode(e.target.value.toUpperCase())} 
                    placeholder="e.g., CALC-RISK-01" 
                    className="w-full text-[13px] font-mono text-indigo-650 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none uppercase transition-all shadow-sm" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Output ISO Field</label>
                  <select 
                    value={targetOutputField} 
                    onChange={(e) => setTargetOutputField(e.target.value)} 
                    className="w-full text-[13px] text-slate-800 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-sm font-semibold text-slate-850"
                  >
                    <option value="" disabled>Select Target Field...</option>
                    {fieldsData?.fields?.map((f: any) => (
                      <option key={f.technical_sys_name} value={f.technical_sys_name}>{f.preferred_business_name} ({f.technical_sys_name})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Financial Domain</label>
                  <select 
                    value={financialDomain} 
                    onChange={(e) => setFinancialDomain(e.target.value)} 
                    className="w-full text-[13px] text-slate-800 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-sm font-semibold text-slate-850"
                  >
                    <option value="Credit Risk">Credit Risk</option>
                    <option value="Treasury">Treasury</option>
                    <option value="Payments">Payments</option>
                    <option value="Fees">Fees & Billing</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Mathematical Expression (Python AST Syntax)</label>
                <textarea 
                  value={mathematicalExpression} 
                  onChange={(e) => setMathematicalExpression(e.target.value)} 
                  rows={4}
                  placeholder="e.g., (of_fintax_bal_01 * of_fintax_rate_05) / 365" 
                  className="w-full text-[13px] font-mono text-slate-800 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none shadow-inner"
                />
                <p className="text-[10px] text-slate-400 mt-1">Use the exact technical names from the ISO Registry for variables.</p>
              </div>
              
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  rows={2} 
                  placeholder="Explain what this calculation achieves..." 
                  className="w-full text-[13px] text-slate-850 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none" 
                />
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
              <button 
                onClick={() => setIsCreating(false)} 
                className="px-5 py-2.5 text-[13px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm active:scale-[0.98]"
              >
                Cancel
              </button>
              <button 
                disabled={createFormulaMutation.isPending || !businessName || !tokenCode || !mathematicalExpression || !targetOutputField} 
                onClick={() => createFormulaMutation.mutate()} 
                className="px-5 py-2.5 text-[13px] font-bold text-white bg-indigo-600 hover:bg-indigo-750 rounded-xl transition-all shadow-md shadow-indigo-650/15 disabled:opacity-50 active:scale-[0.98]"
              >
                {createFormulaMutation.isPending ? 'Saving...' : 'Save Formula'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};