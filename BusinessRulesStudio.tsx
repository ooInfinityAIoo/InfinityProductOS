import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const BusinessRulesStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedRuleSet, setSelectedRuleSet] = useState<any>(null);

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [tokenCode, setTokenCode] = useState('');
  const [description, setDescription] = useState('');
  
  // Simplified state for a single rule with one condition and one action for the MVP UI
  const [conditionField, setConditionField] = useState('');
  const [conditionOperator, setConditionOperator] = useState('EQUAL_TO');
  const [conditionValue, setConditionValue] = useState('');
  const [actionTargetField, setActionTargetField] = useState('');
  const [actionValue, setActionValue] = useState('');

  // --- DYNAMIC API BINDINGS ---
  
  // 1. Fetch Existing Rule Sets
  const { data: rulesData, isLoading: isLoadingRules } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => (await apiClient.get('/rules/')).data
  });

  // 2. Fetch ISO Field Registry (For the dropdowns!)
  const { data: fieldsData } = useQuery({
    queryKey: ['fields-all'],
    queryFn: async () => (await apiClient.get('/fields/registry?limit=1000')).data
  });

  const createRuleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        business_name: businessName,
        token_code: tokenCode,
        description: description,
        rules: [
          {
            priority: 100,
            conditions: [
              {
                left_hand_side: { source_fields: [conditionField] },
                operator: conditionOperator,
                right_hand_side: { static_value: conditionValue }
              }
            ],
            actions: [
              {
                action_type: 'SET_VALUE',
                target_field: actionTargetField,
                value: actionValue
              }
            ]
          }
        ]
      };
      const res = await apiClient.post('/rules/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      setIsCreating(false);
      
      // Reset form
      setBusinessName('');
      setTokenCode('');
      setDescription('');
      setConditionField('');
      setConditionValue('');
      setActionTargetField('');
      setActionValue('');
    }
  });

  return (
    <div className="flex gap-6 h-[750px]">
      
      {/* Left Column: List of Rule Sets */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Rules Library</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configured logic manifests.</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedRuleSet(null); }}
            className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors"
          >
            + New Rule Set
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoadingRules ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div>
          ) : rulesData?.map((ruleSet: any) => (
            <div 
              key={ruleSet.token_code} 
              onClick={() => { setSelectedRuleSet(ruleSet); setIsCreating(false); }}
              className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedRuleSet?.token_code === ruleSet.token_code ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800">{ruleSet.business_name}</div>
                <div className="text-[10px] font-mono text-[#0176D3] bg-blue-50 px-1.5 py-0.5 rounded">{ruleSet.token_code}</div>
              </div>
              <div className="text-[11px] text-slate-500 line-clamp-1">{ruleSet.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!isCreating && !selectedRuleSet && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select a Rule Set or create a new one.</p>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Design New Business Rule Set</h2>
              <p className="text-xs text-slate-500 mt-1">Visually construct conditional logic to govern state transitions.</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Business Name</label>
                  <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g., VIP Account Threshold" className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Token Code</label>
                  <input type="text" value={tokenCode} onChange={(e) => setTokenCode(e.target.value.toUpperCase())} placeholder="e.g., BRE-VIP-001" className="w-full text-[13px] font-mono text-[#0176D3] border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none uppercase" />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded p-5 space-y-4">
                <h3 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-wider">IF Condition</h3>
                <div className="flex gap-4 items-center">
                  <select value={conditionField} onChange={(e) => setConditionField(e.target.value)} className="flex-1 text-[12px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white">
                    <option value="" disabled>Select Target ISO Field...</option>
                    {fieldsData?.fields?.map((f: any) => (
                      <option key={f.technical_sys_name} value={f.technical_sys_name}>{f.preferred_business_name} ({f.technical_sys_name})</option>
                    ))}
                  </select>
                  <select value={conditionOperator} onChange={(e) => setConditionOperator(e.target.value)} className="w-40 text-[12px] font-bold text-[#0176D3] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white">
                    <option value="EQUAL_TO">Equals (==)</option>
                    <option value="NOT_EQUAL_TO">Not Equals (!=)</option>
                    <option value="GREATER_THAN">Greater Than (&gt;)</option>
                    <option value="LESS_THAN">Less Than (&lt;)</option>
                  </select>
                  <input type="text" placeholder="Static Value" value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} className="flex-1 text-[12px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" />
                </div>
              </div>

              <div className="bg-[#F0F7FF] border border-[#CCE0FF] rounded p-5 space-y-4">
                <h3 className="text-[12px] font-extrabold text-[#0052CC] uppercase tracking-wider">THEN Action (SET VALUE)</h3>
                <div className="flex gap-4 items-center">
                  <select value={actionTargetField} onChange={(e) => setActionTargetField(e.target.value)} className="flex-1 text-[12px] border border-[#CCE0FF] rounded p-2 outline-none focus:border-[#0176D3] bg-white">
                    <option value="" disabled>Select Output ISO Field...</option>
                    {fieldsData?.fields?.map((f: any) => (
                      <option key={f.technical_sys_name} value={f.technical_sys_name}>{f.preferred_business_name} ({f.technical_sys_name})</option>
                    ))}
                  </select>
                  <span className="text-slate-400 font-bold text-[12px]">=</span>
                  <input type="text" placeholder="New Static Value" value={actionValue} onChange={(e) => setActionValue(e.target.value)} className="flex-1 text-[12px] border border-[#CCE0FF] rounded p-2 outline-none focus:border-[#0176D3]" />
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={createRuleMutation.isPending || !businessName || !tokenCode || !conditionField} onClick={() => createRuleMutation.mutate()} className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">{createRuleMutation.isPending ? 'Saving...' : 'Save Rule Set'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};