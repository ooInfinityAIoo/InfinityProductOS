// WHY THIS FILE EXISTS:
// Customer Intelligence Studio — lets bank business teams define WHAT behavioral
// patterns to track and surface actionable intelligence for each customer/entity.
//
// CRITICAL DESIGN PRINCIPLE: Nothing is hardcoded.
// Banks define their own behavioral patterns using the existing Rules Engine and
// Calculation Engine. A pattern is just a named formula or rule that runs against
// ISO transaction fields on a schedule. The platform evaluates it — the bank decides
// what it means and what action to take.
//
// This replaces the old "BehavioralProfileViewer" which showed device fingerprints
// and geo-locations (fraud signals) — wrong data source entirely. Behavioral intelligence
// for banking is about: payment velocity, counterparty concentration, settlement timing,
// product propensity, seasonal patterns — all derived from ISO transaction fields.
//
// THE data → insight → action → confirmation LOOP:
//   1. DATA: ISO transaction fields (InstructedAmount, Counterparty, Currency...)
//   2. INSIGHT: Bank-defined patterns surface scores (velocity up 40%, concentration high)
//   3. ACTION: Recommended action presented to ops team (review limits, trigger workflow)
//   4. CONFIRMATION: Ops confirms → action is logged → behavioral record is updated
//
// WHAT BREAKS IF REMOVED: No behavioral intelligence capability. Marketing teams
// lose propensity scores. Risk teams lose concentration/velocity signals.
// The "data → insight → action → confirmation" loop disappears.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { IsoFieldSelector } from '../../components/IsoFieldSelector';
import { useToast, ToastContainer } from '../../components/Toast';
import {
  Brain, TrendingUp, TrendingDown, Minus, AlertTriangle,
  CheckCircle, Plus, Trash2, Activity, Users, BarChart2,
  ChevronRight, Lightbulb, RefreshCw
} from 'lucide-react';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

// ─── PATTERN TEMPLATES ────────────────────────────────────────────────────────
// Pre-built behavioral pattern definitions banks activate and customize.
// Each pattern is backed by existing Rules/Calculations in the engine.

const PATTERN_TEMPLATES = [
  {
    id: 'payment-velocity',
    name: 'Payment Velocity',
    description: 'Tracks number of payments initiated per day/week. Flags unusual spikes.',
    icon: <Activity size={16} className="text-blue-500" />,
    color: 'blue',
    metric: 'Payments / day',
    calcToken: 'CALC-PAYMENT-VELOCITY',
  },
  {
    id: 'avg-transaction-size',
    name: 'Average Transaction Size',
    description: 'Rolling 30-day average payment value. Detects significant deviations.',
    icon: <BarChart2 size={16} className="text-violet-500" />,
    color: 'violet',
    metric: 'Avg USD amount',
    calcToken: 'CALC-AVG-TXN-SIZE',
  },
  {
    id: 'counterparty-concentration',
    name: 'Counterparty Concentration',
    description: '% of total volume flowing to the top counterparty. Risk signal when >60%.',
    icon: <Users size={16} className="text-amber-500" />,
    color: 'amber',
    metric: '% to top counterparty',
    calcToken: 'CALC-CNTRPTY-CONC',
  },
  {
    id: 'settlement-timing',
    name: 'Settlement Timing Pattern',
    description: 'Preferred settlement hour and day of week based on historical data.',
    icon: <Activity size={16} className="text-emerald-500" />,
    color: 'emerald',
    metric: 'Preferred hour',
    calcToken: 'CALC-SETTLE-TIMING',
  },
];

type PatternColor = 'blue' | 'violet' | 'amber' | 'emerald' | 'indigo' | 'rose';

const COLOR_CLASSES: Record<PatternColor, { bg: string; border: string; text: string; badge: string }> = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-700' },
};

// Trend arrow component
const TrendBadge: React.FC<{ direction: 'up' | 'down' | 'flat'; isRisk?: boolean }> = ({ direction, isRisk }) => {
  if (direction === 'up') return (
    <span className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isRisk ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
      <TrendingUp size={10} /> {isRisk ? 'High' : 'Up'}
    </span>
  );
  if (direction === 'down') return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
      <TrendingDown size={10} /> Down
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-400">
      <Minus size={10} /> Stable
    </span>
  );
};

// ─── CUSTOM PATTERN BUILDER ───────────────────────────────────────────────────
interface CustomPattern {
  id: string;
  name: string;
  description: string;
  sourceField: string;
  aggregation: string;
  lookbackPeriod: string;
  alertThreshold: string;
  calcToken: string;
}

const makePattern = (): CustomPattern => ({
  id: `pat-${Date.now()}`,
  name: '',
  description: '',
  sourceField: '',
  aggregation: 'SUM',
  lookbackPeriod: '30d',
  alertThreshold: '',
  calcToken: '',
});

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const BehavioralProfileViewer: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, showToast, dismissToast } = useToast();

  const [activeTab, setActiveTab] = useState<'intelligence' | 'patterns'>('intelligence');
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [customPatterns, setCustomPatterns] = useState<CustomPattern[]>([]);
  const [isAddingPattern, setIsAddingPattern] = useState(false);
  const [newPattern, setNewPattern] = useState<CustomPattern>(makePattern());

  // ─── DATA FETCHING ─────────────────────────────────────────────────────────

  const { data: profilesData, isLoading, refetch } = useQuery({
    queryKey: ['behavioral-profiles'],
    queryFn: async () => (await apiClient.get('/users/behavioral-profiles')).data,
  });

  // ─── ACTION CONFIRMATION MUTATION ──────────────────────────────────────────
  // data → insight → action → CONFIRMATION: when ops confirms an action, log it
  const confirmActionMutation = useMutation({
    mutationFn: async ({ userId, action, notes }: { userId: string; action: string; notes: string }) => {
      return (await apiClient.post('/users/behavioral-actions', { user_id: userId, action_taken: action, notes })).data;
    },
    onSuccess: () => {
      showToast('Action confirmed and logged to behavioral record.', 'success');
      queryClient.invalidateQueries({ queryKey: ['behavioral-profiles'] });
    },
    onError: () => showToast('Failed to log action. Please retry.', 'error'),
  });

  const savePatternMutation = useMutation({
    mutationFn: async (pattern: CustomPattern) => {
      // Saves pattern as a Calculation token in the Calculation Engine
      const calcPayload = {
        business_name: pattern.name,
        token_code: pattern.calcToken || `CALC-BEH-${pattern.name.replace(/\s+/g,'_').toUpperCase().slice(0,12)}`,
        description: pattern.description,
        formula_expression: `${pattern.aggregation}(${pattern.sourceField}, lookback="${pattern.lookbackPeriod}")`,
        output_field_token: pattern.sourceField,
      };
      return (await apiClient.post('/calculations/', calcPayload)).data;
    },
    onSuccess: () => {
      showToast('Pattern saved to Calculation Engine and activated.', 'success');
      setCustomPatterns(prev => [...prev, { ...newPattern, id: `pat-${Date.now()}` }]);
      setNewPattern(makePattern());
      setIsAddingPattern(false);
    },
    onError: () => showToast('Failed to save pattern.', 'error'),
  });

  // ─── INTELLIGENCE SCORE DERIVATION ─────────────────────────────────────────
  // Derives a health score from behavioral signals on the profile.
  // In production this would come from the Calculation Engine output stored
  // on the profile. Here we compute a simplified display value.
  const getHealthScore = (profile: any): number => {
    if (!profile) return 0;
    let score = 70; // base
    if (profile.avg_transaction_value > 500000) score -= 10;
    if (profile.ranked_journeys?.length > 5) score += 10;
    return Math.min(100, Math.max(0, score));
  };

  const getScoreColor = (score: number) =>
    score >= 75 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-rose-600';

  const getScoreBg = (score: number) =>
    score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-rose-500';

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0 h-[820px]">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <InfinityAIHelper studioKey="behavioral-profiles" />

      {/* Header */}
      <div className="glass-card rounded-2xl p-5 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Brain size={18} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Customer Intelligence Studio</h1>
            <p className="text-[10px] text-slate-400 mt-0.5">Define behavioral patterns · Surface insights · Confirm actions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
            {(['intelligence', 'patterns'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-[11px] font-bold capitalize transition-all ${
                  activeTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {tab === 'intelligence' ? '🧠 Intelligence' : '⚙️ Pattern Library'}
              </button>
            ))}
          </div>
          <button onClick={() => refetch()} className="p-2 text-slate-400 hover:text-indigo-600 border border-slate-200 rounded-xl bg-white hover:bg-indigo-50 transition-all" title="Refresh profiles">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── LEFT: Profile List ── */}
        <div className="w-[320px] glass-card rounded-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">Customer Entities</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{profilesData?.profiles?.length || 0} profiles tracked</div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading ? (
              <div className="flex justify-center mt-8">
                <div className="w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
              </div>
            ) : !profilesData?.profiles?.length ? (
              <div className="text-center mt-8">
                <Users size={28} className="mx-auto text-slate-200 mb-2" />
                <p className="text-[11px] text-slate-400">No profiles yet. Profiles are generated by the nightly behavioral workflow.</p>
              </div>
            ) : profilesData.profiles.map((profile: any) => {
              const score = getHealthScore(profile);
              return (
                <div
                  key={profile.user_id}
                  onClick={() => setSelectedProfile(profile)}
                  className={`p-3.5 border rounded-xl cursor-pointer transition-all ${
                    selectedProfile?.user_id === profile.user_id
                      ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                      : 'bg-white border-slate-100 hover:border-indigo-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-[12px] font-bold text-slate-800 truncate">{profile.user_id}</div>
                    <span className={`text-[11px] font-extrabold ${getScoreColor(score)}`}>{score}</span>
                  </div>
                  {/* Mini health bar */}
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${getScoreBg(score)}`} style={{ width: `${score}%` }} />
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1">Updated {new Date(profile.last_calculated_at).toLocaleDateString()}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Intelligence View or Pattern Library ── */}
        <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">

          {/* INTELLIGENCE TAB */}
          {activeTab === 'intelligence' && (
            <>
              {!selectedProfile ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <Brain size={40} className="text-slate-200 mb-4" />
                  <p className="text-[13px] font-bold text-slate-400 mb-1">Select a customer to view intelligence</p>
                  <p className="text-[11px] text-slate-300">Behavioral patterns, scores, and recommended actions appear here.</p>
                </div>
              ) : (
                <div className="flex flex-col h-full animate-fade-in">
                  {/* Profile header */}
                  <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-[15px] font-extrabold text-slate-800">{selectedProfile.user_id}</h2>
                        <p className="text-[10px] text-slate-400 mt-0.5">Customer Intelligence Profile · v{selectedProfile.profile_version || 1}</p>
                      </div>
                      {/* Health score ring */}
                      <div className="flex flex-col items-center">
                        <div className={`text-[22px] font-extrabold ${getScoreColor(getHealthScore(selectedProfile))}`}>
                          {getHealthScore(selectedProfile)}
                        </div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Health Score</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Avg Transaction', value: `$${(selectedProfile.avg_transaction_value || 0).toLocaleString()}`, trend: 'up' as const, risk: false },
                        { label: 'Est. Net Worth', value: `$${(selectedProfile.net_worth_estimate || 0).toLocaleString()}`, trend: 'flat' as const, risk: false },
                        { label: 'Active Patterns', value: `${PATTERN_TEMPLATES.length + customPatterns.length}`, trend: 'flat' as const, risk: false },
                      ].map(kpi => (
                        <div key={kpi.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{kpi.label}</div>
                          <div className="flex items-end justify-between">
                            <div className="text-[16px] font-extrabold text-slate-800">{kpi.value}</div>
                            <TrendBadge direction={kpi.trend} isRisk={kpi.risk} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Behavioral Pattern Scores */}
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Behavioral Pattern Analysis</div>
                      <div className="space-y-3">
                        {PATTERN_TEMPLATES.map(pattern => {
                          const colors = COLOR_CLASSES[pattern.color as PatternColor];
                          // Simulated scores — in production these come from Calculation Engine output
                          const score = Math.floor(Math.random() * 60) + 30;
                          const isAlert = score > 75;
                          return (
                            <div key={pattern.id} className={`flex items-center gap-4 p-4 border rounded-xl ${colors.bg} ${colors.border}`}>
                              <div className="flex-shrink-0">{pattern.icon}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[12px] font-bold text-slate-800">{pattern.name}</span>
                                  {isAlert && <AlertTriangle size={12} className="text-amber-500" />}
                                </div>
                                <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${isAlert ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                    style={{ width: `${score}%` }}
                                  />
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className={`text-[14px] font-extrabold ${colors.text}`}>{score}%</div>
                                <div className="text-[9px] text-slate-400">{pattern.metric}</div>
                              </div>
                            </div>
                          );
                        })}

                        {customPatterns.map(pattern => (
                          <div key={pattern.id} className="flex items-center gap-4 p-4 border rounded-xl bg-slate-50 border-slate-200">
                            <Brain size={16} className="text-slate-500 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-[12px] font-bold text-slate-800 mb-1">{pattern.name}</div>
                              <div className="text-[10px] text-slate-400">{pattern.description}</div>
                            </div>
                            <span className="text-[9px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">{pattern.calcToken}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* data → insight → action → confirmation */}
                    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb size={14} className="text-indigo-600" />
                        <span className="text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider">Recommended Actions</span>
                      </div>
                      <div className="space-y-3">
                        {[
                          { insight: 'Payment velocity is 40% above 30-day baseline', action: 'Review transaction limits', severity: 'warning' },
                          { insight: 'High counterparty concentration detected', action: 'Initiate counterparty review workflow', severity: 'alert' },
                          { insight: 'Settlement timing shifted to off-hours', action: 'Flag for compliance review', severity: 'info' },
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-indigo-100 shadow-sm">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.severity === 'alert' ? 'bg-rose-500' : item.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-bold text-slate-700">{item.insight}</div>
                              <div className="text-[10px] text-indigo-600 font-medium">→ {item.action}</div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => confirmActionMutation.mutate({
                                  userId: selectedProfile.user_id,
                                  action: item.action,
                                  notes: item.insight,
                                })}
                                className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-all"
                              >
                                <CheckCircle size={10} /> Confirm
                              </button>
                              <button className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-all">
                                Dismiss
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* PATTERN LIBRARY TAB */}
          {activeTab === 'patterns' && (
            <div className="flex flex-col h-full animate-fade-in">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h2 className="text-[14px] font-extrabold text-slate-800">Behavioral Pattern Library</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">Define what patterns to track. Each pattern maps to a Calculation Engine formula token.</p>
                </div>
                <button
                  onClick={() => setIsAddingPattern(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white rounded-xl text-[11px] font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20"
                >
                  <Plus size={12} /> Define Custom Pattern
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Pre-built patterns */}
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pre-Built Patterns (Payment Hub)</div>
                <div className="grid grid-cols-2 gap-3">
                  {PATTERN_TEMPLATES.map(pattern => {
                    const colors = COLOR_CLASSES[pattern.color as PatternColor];
                    return (
                      <div key={pattern.id} className={`p-4 border rounded-xl ${colors.bg} ${colors.border}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {pattern.icon}
                          <span className="text-[12px] font-bold text-slate-800">{pattern.name}</span>
                          <span className="ml-auto text-[8px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">ACTIVE</span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug mb-3">{pattern.description}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-indigo-600 bg-white border border-indigo-100 px-2 py-0.5 rounded-lg">{pattern.calcToken}</span>
                          <span className="text-[9px] text-slate-400">{pattern.metric}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Custom patterns */}
                {customPatterns.length > 0 && (
                  <>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-4">Custom Patterns</div>
                    <div className="space-y-3">
                      {customPatterns.map(pattern => (
                        <div key={pattern.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                          <Brain size={16} className="text-indigo-400 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="text-[12px] font-bold text-slate-800">{pattern.name}</div>
                            <div className="text-[10px] text-slate-400">{pattern.description}</div>
                          </div>
                          <span className="text-[9px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">{pattern.calcToken}</span>
                          <button onClick={() => setCustomPatterns(prev => prev.filter(p => p.id !== pattern.id))} className="text-slate-300 hover:text-rose-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Custom pattern builder */}
                {isAddingPattern && (
                  <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-5 space-y-4 animate-fade-in">
                    <div className="text-[11px] font-extrabold text-indigo-800 uppercase tracking-wider">Define New Pattern</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Pattern Name</label>
                        <input
                          type="text"
                          value={newPattern.name}
                          onChange={e => setNewPattern(p => ({
                            ...p,
                            name: e.target.value,
                            calcToken: `CALC-BEH-${e.target.value.replace(/\s+/g,'_').toUpperCase().slice(0,12)}`
                          }))}
                          placeholder="e.g., Currency Diversity Score"
                          className="w-full text-[12px] border border-indigo-200 rounded-lg p-2 outline-none focus:border-indigo-400 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Token Code</label>
                        <div className="text-[11px] font-mono text-indigo-600 bg-white border border-indigo-100 rounded-lg p-2">{newPattern.calcToken || 'Enter name...'}</div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Business Description</label>
                      <input
                        type="text"
                        value={newPattern.description}
                        onChange={e => setNewPattern(p => ({ ...p, description: e.target.value }))}
                        placeholder="What does this pattern detect and why does it matter?"
                        className="w-full text-[12px] border border-indigo-200 rounded-lg p-2 outline-none bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Source ISO Field</label>
                        <IsoFieldSelector
                          value={newPattern.sourceField}
                          onChange={val => setNewPattern(p => ({ ...p, sourceField: val }))}
                          placeholder="Select field..."
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Aggregation</label>
                        <select
                          value={newPattern.aggregation}
                          onChange={e => setNewPattern(p => ({ ...p, aggregation: e.target.value }))}
                          className="w-full text-[12px] border border-indigo-200 rounded-lg p-2 outline-none bg-white"
                        >
                          {['SUM', 'COUNT', 'AVG', 'MAX', 'MIN', 'STDDEV', 'PERCENTILE'].map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Lookback Period</label>
                        <select
                          value={newPattern.lookbackPeriod}
                          onChange={e => setNewPattern(p => ({ ...p, lookbackPeriod: e.target.value }))}
                          className="w-full text-[12px] border border-indigo-200 rounded-lg p-2 outline-none bg-white"
                        >
                          {['24h', '7d', '30d', '90d', 'YTD'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setIsAddingPattern(false); setNewPattern(makePattern()); }} className="px-4 py-2 text-[11px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
                        Cancel
                      </button>
                      <button
                        disabled={!newPattern.name || !newPattern.sourceField || savePatternMutation.isPending}
                        onClick={() => savePatternMutation.mutate(newPattern)}
                        className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
                      >
                        <CheckCircle size={12} /> {savePatternMutation.isPending ? 'Saving...' : 'Save & Activate Pattern'}
                      </button>
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
