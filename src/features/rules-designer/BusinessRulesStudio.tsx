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
  const [actionType, setActionType] = useState('SET_VALUE');
  const [actionTargetField, setActionTargetField] = useState('');
  const [actionValue, setActionValue] = useState('');
  const [calculationToken, setCalculationToken] = useState('');

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

  // 3. Fetch Calculations (For the Execution actions)
  const { data: calcData } = useQuery({
    queryKey: ['calculations'],
    queryFn: async () => (await apiClient.get('/calculations/')).data
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
                action_type: actionType,
                target_field: actionType === 'SET_VALUE' ? actionTargetField : undefined,
                value: actionType === 'SET_VALUE' ? actionValue : undefined,
                calculation_token: actionType === 'EXECUTE_CALCULATION' ? calculationToken : undefined
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
      setActionType('SET_VALUE');
      setActionTargetField('');
      setActionValue('');
      setCalculationToken('');
    }
  });

  return (
    <div className="flex gap-6 h-[750px]">
      
      {/* Left Column: List of Rule Sets */}
      <div className="w-[400px] glass-card rounded-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Rules Library</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Configured logic manifests</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedRuleSet(null); }}
            className="bg-indigo-600 hover:bg-indigo-750 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98]"
          >
            + New Rule Set
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoadingRules ? (
            <div className="text-center text-slate-400 text-xs mt-10 font-bold animate-pulse">Loading blueprints...</div>
          ) : rulesData?.map((ruleSet: any) => (
            <div 
              key={ruleSet.token_code} 
              onClick={() => { setSelectedRuleSet(ruleSet); setIsCreating(false); }}
              className={`p-4 border rounded-2xl cursor-pointer transition-all duration-300 shadow-sm ${
                selectedRuleSet?.token_code === ruleSet.token_code 
                  ? 'bg-indigo-50/40 border-indigo-200/80 shadow-glow-indigo' 
                  : 'bg-white/50 border-slate-150 hover:border-indigo-400/50 hover:bg-white/80'
              }`}
            >
              <div className="flex justify-between items-start mb-2.5">
                <div className="text-[13px] font-bold text-slate-800 tracking-tight">{ruleSet.business_name}</div>
                <div className="text-[9px] font-mono text-indigo-650 bg-indigo-50/60 border border-indigo-100/30 px-2 py-0.5 rounded-lg font-bold">{ruleSet.token_code}</div>
              </div>
              <div className="text-[10px] text-slate-400 font-medium line-clamp-1">{ruleSet.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden relative">
        {!isCreating && !selectedRuleSet && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
            <p className="text-xs font-semibold text-slate-400">Select a Rule Set or create a new one.</p>
          </div>
        )}

        {selectedRuleSet && !isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right p-6 overflow-y-auto space-y-6">
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-base font-extrabold text-slate-800 font-display">{selectedRuleSet.business_name}</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Business Rule Details</p>
                </div>
                <span className="font-mono text-xs text-indigo-650 bg-indigo-50/80 border border-indigo-100/50 px-2.5 py-1 rounded-lg font-bold">{selectedRuleSet.token_code}</span>
              </div>
              <p className="text-xs text-slate-500 mt-4 bg-slate-50/50 border border-slate-100 p-4 rounded-2xl leading-relaxed">{selectedRuleSet.description || 'No description provided.'}</p>
            </div>

            {selectedRuleSet.rules?.map((rule: any, ruleIdx: number) => (
              <div key={ruleIdx} className="space-y-4 border-t border-slate-100 pt-6 animate-fade-in">
                <div>
                  <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-3">Rule Specifications (Priority {rule.priority})</h3>
                  <div className="bg-slate-50/30 border border-slate-100 p-4 rounded-2xl space-y-3 shadow-inner">
                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">IF Conditions</div>
                    {rule.conditions?.map((cond: any, condIdx: number) => (
                      <div key={condIdx} className="flex gap-2.5 items-center text-xs text-slate-700">
                        <span className="font-mono text-indigo-600 font-bold bg-white border border-slate-200/50 px-2.5 py-1 rounded-lg shadow-sm">{cond.left_hand_side?.source_fields?.join(', ')}</span>
                        <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">{cond.operator.replace('_', ' ')}</span>
                        <span className="font-mono text-emerald-600 font-bold bg-white border border-slate-200/50 px-2.5 py-1 rounded-lg shadow-sm">{cond.right_hand_side?.static_value || cond.right_hand_side?.source_field}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-indigo-50/20 border border-indigo-100/50 p-4 rounded-2xl space-y-3">
                  <div className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest">THEN Actions</div>
                  {rule.actions?.map((act: any, actIdx: number) => (
                    <div key={actIdx} className="flex gap-2.5 items-center text-xs text-slate-700">
                      {act.action_type === 'SET_VALUE' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">Set output</span>
                          <span className="font-mono text-indigo-600 font-bold bg-white border border-indigo-100/30 px-2.5 py-1 rounded-lg shadow-sm">{act.target_field}</span>
                          <span className="text-slate-500">to value</span>
                          <span className="font-mono text-emerald-600 font-bold bg-white border border-indigo-100/30 px-2.5 py-1 rounded-lg shadow-sm">{act.value}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">Execute formula code</span>
                          <span className="font-mono text-indigo-650 font-bold bg-white border border-indigo-100/30 px-2.5 py-1 rounded-lg shadow-sm">{act.calculation_token}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-[16px] font-extrabold text-slate-800 font-display">Design New Business Rule Set</h2>
              <p className="text-[11px] text-slate-400 mt-1">Visually construct conditional logic to govern state transitions.</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Business Name</label>
                  <input 
                    type="text" 
                    value={businessName} 
                    onChange={(e) => setBusinessName(e.target.value)} 
                    placeholder="e.g., VIP Account Threshold" 
                    className="w-full text-[13px] font-semibold text-slate-850 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Token Code</label>
                  <input 
                    type="text" 
                    value={tokenCode} 
                    onChange={(e) => setTokenCode(e.target.value.toUpperCase())} 
                    placeholder="e.g., BRE-VIP-001" 
                    className="w-full text-[13px] font-mono text-indigo-600 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none uppercase transition-all shadow-sm" 
                  />
                </div>
              </div>

              <div className="bg-slate-50/40 border border-slate-150/80 rounded-2xl p-5 space-y-4 shadow-sm">
                <h3 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-wider">IF Condition</h3>
                <div className="flex gap-4 items-center">
                  <select 
                    value={conditionField} 
                    onChange={(e) => setConditionField(e.target.value)} 
                    className="flex-1 text-[12px] border border-slate-200 bg-white rounded-xl p-2.5 outline-none focus:border-indigo-500 shadow-sm font-semibold text-slate-850"
                  >
                    <option value="" disabled>Select Target ISO Field...</option>
                    {fieldsData?.fields?.map((f: any) => (
                      <option key={f.technical_sys_name} value={f.technical_sys_name}>{f.preferred_business_name} ({f.technical_sys_name})</option>
                    ))}
                  </select>
                  <select 
                    value={conditionOperator} 
                    onChange={(e) => setConditionOperator(e.target.value)} 
                    className="w-48 text-[12px] font-bold text-indigo-600 border border-slate-200 bg-white rounded-xl p-2.5 outline-none focus:border-indigo-500 shadow-sm"
                  >
                    <option value="EQUAL_TO">Equals (==)</option>
                    <option value="NOT_EQUAL_TO">Not Equals (!=)</option>
                    <option value="GREATER_THAN">Greater Than (&gt;)</option>
                    <option value="LESS_THAN">Less Than (&lt;)</option>
                  </select>
                  <input 
                    type="text" 
                    placeholder="Static Value" 
                    value={conditionValue} 
                    onChange={(e) => setConditionValue(e.target.value)} 
                    className="flex-1 text-[12px] border border-slate-200 bg-white rounded-xl p-2.5 outline-none focus:border-indigo-500 shadow-inner" 
                  />
                </div>
              </div>

              <div className="bg-indigo-50/20 border border-indigo-100/50 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <h3 className="text-[12px] font-extrabold text-indigo-750 uppercase tracking-wider">THEN Action</h3>
                  <select 
                    value={actionType} 
                    onChange={(e) => setActionType(e.target.value)} 
                    className="text-[11px] font-bold text-indigo-600 border border-indigo-150 rounded-lg p-1.5 outline-none bg-white shadow-sm"
                  >
                    <option value="SET_VALUE">Set Static Value</option>
                    <option value="EXECUTE_CALCULATION">Execute Math Formula</option>
                  </select>
                </div>
                <div className="flex gap-4 items-center">
                  {actionType === 'SET_VALUE' ? (
                    <>
                      <select 
                        value={actionTargetField} 
                        onChange={(e) => setActionTargetField(e.target.value)} 
                        className="flex-1 text-[12px] border border-indigo-150 bg-white rounded-xl p-2.5 outline-none focus:border-indigo-500 shadow-sm text-slate-850"
                      >
                        <option value="" disabled>Select Output ISO Field...</option>
                        {fieldsData?.fields?.map((f: any) => (
                          <option key={f.technical_sys_name} value={f.technical_sys_name}>{f.preferred_business_name} ({f.technical_sys_name})</option>
                        ))}
                      </select>
                      <span className="text-slate-400 font-bold text-[12px]">=</span>
                      <input 
                        type="text" 
                        placeholder="New Static Value" 
                        value={actionValue} 
                        onChange={(e) => setActionValue(e.target.value)} 
                        className="flex-1 text-[12px] border border-indigo-150 bg-white rounded-xl p-2.5 outline-none focus:border-indigo-500 shadow-inner" 
                      />
                    </>
                  ) : (
                    <>
                      <select 
                        value={calculationToken} 
                        onChange={(e) => setCalculationToken(e.target.value)} 
                        className="flex-1 text-[12px] font-mono text-indigo-650 border border-indigo-150 bg-white rounded-xl p-2.5 outline-none focus:border-indigo-500 shadow-sm"
                      >
                        <option value="" disabled>Select Target Symbolic Formula...</option>
                        {calcData?.formulas?.map((f: any) => (
                          <option key={f.token_code} value={f.token_code}>{f.business_name} ({f.token_code})</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
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
                disabled={createRuleMutation.isPending || !businessName || !tokenCode || !conditionField} 
                onClick={() => createRuleMutation.mutate()} 
                className="px-5 py-2.5 text-[13px] font-bold text-white bg-indigo-600 hover:bg-indigo-750 rounded-xl transition-all shadow-md shadow-indigo-650/15 disabled:opacity-50 active:scale-[0.98]"
              >
                {createRuleMutation.isPending ? 'Saving...' : 'Save Rule Set'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};