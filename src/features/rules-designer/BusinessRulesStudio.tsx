// WHY THIS FILE EXISTS:
// Business Rules Studio — lets business ops define IF-THEN logic that governs
// payment routing, AML checks, approval thresholds, FX validation, and more.
// Rules are stored as JSON and evaluated at runtime by the Rules Engine
// (services/business_rule_engine.py) — no redeployment needed when a threshold changes.
//
// WHAT BREAKS IF REMOVED: All conditional logic stops working. AML thresholds,
// approval gates, and routing conditions all require rules. The Workflow Engine
// and Insights Factory both reference rule tokens.
//
// KEY UPGRADE: Multi-condition AND/OR groups + multiple actions per rule.
// A real banking rule is never "IF amount > X THEN flag".
// It's "IF amount > X AND counterparty is FLAGGED AND currency is NOT USD THEN block + notify".

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';
import { ProductSubProductPicker } from '../../components/ProductSubProductPicker';
import { IsoFieldSelector } from '../../components/IsoFieldSelector';
import { useToast, ToastContainer } from '../../components/Toast';
import { Plus, Trash2, GitBranch } from 'lucide-react';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

// A Condition is one IF clause: [field] [operator] [value]
interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

// An Action is one THEN clause: what happens when ALL conditions pass
interface Action {
  id: string;
  actionType: string;
  targetField: string;
  value: string;
  calculationToken: string;
}

const OPERATORS = [
  { v: 'EQUAL_TO', label: 'Equals (==)' },
  { v: 'NOT_EQUAL_TO', label: 'Not Equals (!=)' },
  { v: 'GREATER_THAN', label: 'Greater Than (>)' },
  { v: 'LESS_THAN', label: 'Less Than (<)' },
  { v: 'GREATER_THAN_OR_EQUAL', label: '>= (at least)' },
  { v: 'LESS_THAN_OR_EQUAL', label: '<= (at most)' },
  { v: 'CONTAINS', label: 'Contains (text)' },
  { v: 'IS_NULL', label: 'Is Empty' },
  { v: 'IS_NOT_NULL', label: 'Is Not Empty' },
];

const makeCondition = (): Condition => ({ id: `c-${Date.now()}`, field: '', operator: 'GREATER_THAN', value: '' });
const makeAction = (): Action => ({ id: `a-${Date.now()}`, actionType: 'FLAG', targetField: '', value: '', calculationToken: '' });

export const BusinessRulesStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeProductContext, activeCoreProductId } = usePlatformStore();
  const { toasts, showToast, dismissToast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedRuleSet, setSelectedRuleSet] = useState<any>(null);

  // Header fields
  const [businessName, setBusinessName] = useState('');
  const [tokenCode, setTokenCode] = useState('');
  const [description, setDescription] = useState('');

  // Form-level product scope — independent from the header filter.
  // '' = not yet selected (blocks save); 'ALL' = applies to all products (null in DB)
  const [formProductId, setFormProductId] = useState('');
  const [formSubProductId, setFormSubProductId] = useState('');

  // Multi-condition AND/OR group
  const [conditionLogic, setConditionLogic] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<Condition[]>([makeCondition()]);

  // Multi-action list
  const [actions, setActions] = useState<Action[]>([makeAction()]);

  // --- DYNAMIC API BINDINGS ---
  
  // Fetch Packages -> Products for the Cockpit Selector
  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });
  const currentPackage = packagesData?.packages?.find((p: any) => p.package_name === activeProductContext);
  const packageId = currentPackage?.package_id;

  // 1. Fetch Existing Rule Sets
  const { data: rulesData, isLoading: isLoadingRules } = useQuery({
    queryKey: ['rules', packageId, activeCoreProductId],
    queryFn: async () => (await apiClient.get(`/rules/?package_id=${packageId}&product_id=${activeCoreProductId}`)).data,
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

  // 3. Fetch Calculations (For the Execution actions)
  const { data: calcData } = useQuery({
    queryKey: ['calculations', packageId, activeCoreProductId],
    queryFn: async () => {
      if (!packageId || !activeCoreProductId) return [];
      return (await apiClient.get(`/calculations/?package_id=${packageId}&product_id=${activeCoreProductId}`)).data.formulas || [];
    },
    enabled: !!packageId && !!activeCoreProductId
  });

  const resetForm = () => {
    setBusinessName(''); setTokenCode(''); setDescription('');
    setFormProductId(''); setFormSubProductId('');
    setConditionLogic('AND');
    setConditions([makeCondition()]);
    setActions([makeAction()]);
  };

  const updateCondition = (id: string, updates: Partial<Condition>) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const updateAction = (id: string, updates: Partial<Action>) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const createRuleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        business_name: businessName,
        token_code: tokenCode,
        description: description,
        financial_domain: activeProductContext,
        // 'ALL' means package-wide → stored as null in DB
        core_product_id: formProductId === 'ALL' ? null : formProductId || null,
        core_subproduct_id: formSubProductId || null,
        condition_logic: conditionLogic,
        rules: [
          {
            priority: 100,
            conditions: conditions.filter(c => c.field).map(c => ({
              left_hand_side: { source_fields: [c.field] },
              operator: c.operator,
              right_hand_side: { static_value: c.value },
            })),
            actions: actions.map(a => ({
              action_type: a.actionType,
              target_field: a.actionType === 'SET_VALUE' ? a.targetField : undefined,
              value: ['SET_VALUE', 'FLAG', 'BLOCK', 'ALERT', 'ROUTE'].includes(a.actionType) ? a.value : undefined,
              calculation_token: a.actionType === 'EXECUTE_CALCULATION' ? a.calculationToken : undefined,
            })),
          }
        ],
      };
      const res = await apiClient.post('/rules/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      showToast(`Rule "${businessName}" saved successfully.`, 'success');
      setIsCreating(false);
      resetForm();
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || 'Failed to save rule.', 'error');
    },
  });

  return (
    <div className="flex flex-col w-full h-[800px] animate-fade-in">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <InfinityAIHelper studioKey="business-rules" />
      <CockpitLockBanner />
      <div className="flex gap-6 flex-1 min-h-0">
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
              <h2 className="text-[16px] font-extrabold text-slate-800 font-display">Design Business Rule Set</h2>
              <p className="text-[11px] text-slate-400 mt-1">Build multi-condition IF-THEN logic. All conditions evaluated together using AND / OR.</p>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Product Scope Picker — where this rule applies */}
              <ProductSubProductPicker
                packageId={packageId ?? null}
                selectedProductId={formProductId}
                selectedSubProductId={formSubProductId}
                onProductChange={setFormProductId}
                onSubProductChange={setFormSubProductId}
              />

              {/* Header: name + auto token */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Rule Business Name *</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={e => {
                      setBusinessName(e.target.value);
                      setTokenCode(`BRE-${e.target.value.replace(/\s+/g,'-').toUpperCase().slice(0,14)}`);
                    }}
                    placeholder="e.g., AML High Value Threshold"
                    className="w-full text-[13px] font-semibold border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-400 outline-none shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Token Code (auto-generated)</label>
                  <div className="text-[12px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl p-2.5">{tokenCode || 'Enter name above...'}</div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Business Purpose</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What does this rule enforce and why is it required?"
                  className="w-full text-[13px] border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-400 outline-none shadow-sm"
                />
              </div>

              {/* IF Conditions */}
              <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <h3 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <GitBranch size={13} className="text-slate-400" /> IF Conditions
                  </h3>
                  <div className="flex items-center gap-2">
                    {/* AND/OR toggle — how conditions combine */}
                    <span className="text-[10px] text-slate-400 font-bold">Combine with:</span>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                      {(['AND', 'OR'] as const).map(logic => (
                        <button
                          key={logic}
                          onClick={() => setConditionLogic(logic)}
                          className={`px-3 py-1 text-[11px] font-bold transition-all ${
                            conditionLogic === logic
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >{logic}</button>
                      ))}
                    </div>
                    <button
                      onClick={() => setConditions(prev => [...prev, makeCondition()])}
                      className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-all"
                    >
                      <Plus size={11} /> Add Condition
                    </button>
                  </div>
                </div>

                {conditions.map((cond, idx) => (
                  <div key={cond.id} className="flex gap-3 items-center">
                    {/* AND/OR badge between conditions */}
                    {idx > 0 && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg flex-shrink-0">
                        {conditionLogic}
                      </span>
                    )}
                    {idx === 0 && <span className="text-[10px] font-bold text-slate-400 w-8 flex-shrink-0">IF</span>}
                    <div className="flex-1">
                      <IsoFieldSelector
                        value={cond.field}
                        onChange={val => updateCondition(cond.id, { field: val })}
                        placeholder="Select ISO field..."
                      />
                    </div>
                    <select
                      value={cond.operator}
                      onChange={e => updateCondition(cond.id, { operator: e.target.value })}
                      className="text-[11px] font-bold text-indigo-700 border border-slate-200 bg-white rounded-xl p-2 outline-none w-44"
                    >
                      {OPERATORS.map(op => <option key={op.v} value={op.v}>{op.label}</option>)}
                    </select>
                    {!['IS_NULL', 'IS_NOT_NULL'].includes(cond.operator) && (
                      <input
                        type="text"
                        value={cond.value}
                        onChange={e => updateCondition(cond.id, { value: e.target.value })}
                        placeholder="Value"
                        className="flex-1 text-[12px] border border-slate-200 bg-white rounded-xl p-2 outline-none focus:border-indigo-400 font-mono"
                      />
                    )}
                    {conditions.length > 1 && (
                      <button onClick={() => setConditions(prev => prev.filter(c => c.id !== cond.id))} className="text-slate-300 hover:text-rose-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* THEN Actions */}
              <div className="bg-indigo-50/30 border border-indigo-100 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <h3 className="text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider">THEN Actions</h3>
                  <button
                    onClick={() => setActions(prev => [...prev, makeAction()])}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-all"
                  >
                    <Plus size={11} /> Add Action
                  </button>
                </div>

                {actions.map((action, idx) => (
                  <div key={action.id} className="flex gap-3 items-center">
                    <span className="text-[10px] font-bold text-indigo-400 w-8 flex-shrink-0">{idx === 0 ? 'DO' : 'AND'}</span>
                    <select
                      value={action.actionType}
                      onChange={e => updateAction(action.id, { actionType: e.target.value })}
                      className="text-[11px] font-bold text-indigo-700 border border-indigo-100 bg-white rounded-xl p-2 outline-none w-44"
                    >
                      <option value="FLAG">FLAG for Review</option>
                      <option value="BLOCK">BLOCK — reject</option>
                      <option value="SET_VALUE">SET field value</option>
                      <option value="EXECUTE_CALCULATION">Run Calculation</option>
                      <option value="ALERT">FIRE Alert Event</option>
                      <option value="ROUTE">ROUTE to workflow path</option>
                    </select>

                    {action.actionType === 'SET_VALUE' && (
                      <>
                        <div className="flex-1">
                          <IsoFieldSelector
                            value={action.targetField}
                            onChange={val => updateAction(action.id, { targetField: val })}
                            placeholder="Output field..."
                          />
                        </div>
                        <span className="text-slate-400 font-bold text-[12px]">=</span>
                        <input
                          type="text"
                          value={action.value}
                          onChange={e => updateAction(action.id, { value: e.target.value })}
                          placeholder="New value"
                          className="flex-1 text-[12px] border border-indigo-100 bg-white rounded-xl p-2 outline-none font-mono"
                        />
                      </>
                    )}

                    {action.actionType === 'EXECUTE_CALCULATION' && (
                      <select
                        value={action.calculationToken}
                        onChange={e => updateAction(action.id, { calculationToken: e.target.value })}
                        className="flex-1 text-[11px] font-mono text-indigo-700 border border-indigo-100 bg-white rounded-xl p-2 outline-none"
                      >
                        <option value="" disabled>Select formula token...</option>
                        {calcData?.map?.((f: any) => (
                          <option key={f.token_code} value={f.token_code}>{f.business_name} — {f.token_code}</option>
                        ))}
                      </select>
                    )}

                    {['FLAG', 'BLOCK', 'ALERT', 'ROUTE'].includes(action.actionType) && (
                      <input
                        type="text"
                        value={action.value}
                        onChange={e => updateAction(action.id, { value: e.target.value })}
                        placeholder={action.actionType === 'ROUTE' ? 'Workflow path token...' : 'Optional reason / event code'}
                        className="flex-1 text-[12px] border border-indigo-100 bg-white rounded-xl p-2 outline-none font-mono text-amber-700"
                      />
                    )}

                    {actions.length > 1 && (
                      <button onClick={() => setActions(prev => prev.filter(a => a.id !== action.id))} className="text-slate-300 hover:text-rose-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
              <button onClick={() => { setIsCreating(false); resetForm(); }} className="px-5 py-2.5 text-[13px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-[0.98]">
                Cancel
              </button>
              <button
                disabled={createRuleMutation.isPending || !businessName || !formProductId || conditions.filter(c => c.field).length === 0}
                onClick={() => createRuleMutation.mutate()}
                className="px-5 py-2.5 text-[13px] font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/15 disabled:opacity-50 active:scale-[0.98]"
              >
                {createRuleMutation.isPending ? 'Saving...' : 'Save Rule Set'}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};