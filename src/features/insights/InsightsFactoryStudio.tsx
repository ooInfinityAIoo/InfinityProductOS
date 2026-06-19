// WHY THIS FILE EXISTS:
// Insights Factory Studio — where business users define analytical intelligence
// without writing code. An "insight" is a question the platform answers automatically:
//   "Which products generated the most revenue this month?"
//   "Did any payment exceed the AML threshold in the last 24 hours?"
//   "What is this counterparty's payment velocity trend?"
//
// KEY CAPABILITY: Users can define the rules and calculations that power an insight
// DIRECTLY INSIDE this studio — they don't need to pre-build them in the Rules or
// Calculations studio first. The inline builders create rule/calculation tokens that
// are saved to their respective engines AND bound to this insight automatically.
//
// THREE OUTPUT MODES (all self-contained, no workflow dependency yet):
//   1. DASHBOARD WIDGET — surfaces on a specific role's dashboard
//   2. NOTIFICATION ALERT — fires email/SMS when threshold is breached
//   3. SCREEN PANEL — embeds as a live intelligence panel inside a screen
//
// WHAT BREAKS IF REMOVED: Banks have no way to define automated intelligence.
// Dashboards show no metrics. No alerts fire on anomalies. Screens have no
// real-time context panels.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { IsoFieldSelector } from '../../components/IsoFieldSelector';
import { useToast, ToastContainer } from '../../components/Toast';
import {
  Lightbulb, Plus, ChevronRight, Clock, Zap, BarChart2, Bell, Monitor,
  Code, Calculator, CheckCircle, Trash2, ChevronDown, ChevronUp, BookOpen, X
} from 'lucide-react';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type TriggerType = 'SCHEDULED' | 'EVENT' | 'MANUAL';
type OutputMode = 'DASHBOARD_WIDGET' | 'NOTIFICATION' | 'SCREEN_PANEL';
type AnalysisStepType = 'BUSINESS_RULE' | 'CALCULATION' | 'REF_EXISTING_RULE' | 'REF_EXISTING_CALC';
type WizardStep = 1 | 2 | 3 | 4;

interface InlineRule {
  id: string;
  businessName: string;
  tokenCode: string;
  conditionField: string;
  operator: string;
  conditionValue: string;
  actionType: string;
  actionValue: string;
}

interface InlineCalc {
  id: string;
  businessName: string;
  tokenCode: string;
  formula: string;
  outputField: string;
}

interface AnalysisStep {
  id: string;
  stepType: AnalysisStepType;
  sequenceNumber: number;
  // For inline rule creation
  inlineRule?: InlineRule;
  // For inline calculation creation
  inlineCalc?: InlineCalc;
  // For referencing existing tokens
  existingToken?: string;
}

// ─── PRE-BUILT TEMPLATES ──────────────────────────────────────────────────────
// Industry templates banks can activate and customize. Banks get a head start
// instead of building from scratch — differentiator vs. custom coding.

const PREBUILT_TEMPLATES = [
  {
    id: 'tpl-settlement-summary',
    name: 'Daily Settlement Summary',
    description: 'Aggregates all settled payments and surfaces KPIs for ops managers.',
    category: 'Payment Hub',
    icon: '📊',
    triggerType: 'SCHEDULED' as TriggerType,
    triggerCron: '0 18 * * 1-5',
    outputMode: 'DASHBOARD_WIDGET' as OutputMode,
    dashboardCategory: '360_BUSINESS',
    applicableRoles: ['ADMIN', 'C_LEVEL'],
  },
  {
    id: 'tpl-high-value-alert',
    name: 'High-Value Payment Alert',
    description: 'Fires when any single payment exceeds a configurable threshold.',
    category: 'Payment Hub',
    icon: '🚨',
    triggerType: 'EVENT' as TriggerType,
    triggerEvent: 'PAYMENT_SUBMITTED',
    outputMode: 'NOTIFICATION' as OutputMode,
    applicableRoles: ['ADMIN', 'RISK'],
  },
  {
    id: 'tpl-counterparty-concentration',
    name: 'Counterparty Concentration Risk',
    description: 'Detects when >60% of volume flows to a single counterparty in 7 days.',
    category: 'Payment Hub',
    icon: '⚠️',
    triggerType: 'SCHEDULED' as TriggerType,
    triggerCron: '0 9 * * 1',
    outputMode: 'DASHBOARD_WIDGET' as OutputMode,
    dashboardCategory: '360_BUSINESS',
    applicableRoles: ['RISK', 'C_LEVEL'],
  },
  {
    id: 'tpl-fx-breach',
    name: 'FX Rate Breach Alert',
    description: 'Notifies treasury when FX rate moves beyond the configured tolerance.',
    category: 'Payment Hub',
    icon: '💱',
    triggerType: 'EVENT' as TriggerType,
    triggerEvent: 'FX_RATE_UPDATED',
    outputMode: 'NOTIFICATION' as OutputMode,
    applicableRoles: ['ADMIN', 'RISK'],
  },
  {
    id: 'tpl-counterparty-intel',
    name: 'Counterparty Intelligence Panel',
    description: 'Live panel embedded in screens showing payment history for the selected counterparty.',
    category: 'Payment Hub',
    icon: '🔍',
    triggerType: 'MANUAL' as TriggerType,
    outputMode: 'SCREEN_PANEL' as OutputMode,
    applicableRoles: ['ADMIN', 'OPERATOR'],
  },
];

const OPERATORS = ['EQUAL_TO', 'NOT_EQUAL_TO', 'GREATER_THAN', 'LESS_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'CONTAINS', 'IS_NULL', 'IS_NOT_NULL'];
const ROLES = ['ADMIN', 'OPERATOR', 'RISK', 'SALES', 'C_LEVEL', 'AUDITOR'];

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

// Inline Rule Builder — creates a business rule in context without leaving the factory
const InlineRuleBuilder: React.FC<{
  rule: InlineRule;
  onChange: (rule: InlineRule) => void;
  rulesData: any[];
}> = ({ rule, onChange, rulesData }) => {
  const autoToken = rule.businessName
    ? `BRE-INS-${rule.businessName.replace(/\s+/g, '-').toUpperCase().slice(0, 12)}`
    : '';

  return (
    <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Code size={13} className="text-amber-600" />
        <span className="text-[11px] font-extrabold text-amber-800 uppercase tracking-wider">Inline Rule Builder</span>
        <span className="text-[9px] text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">Saved to Rules Engine automatically</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] font-bold text-amber-700 uppercase tracking-wider mb-1">Rule Business Name</label>
          <input
            type="text"
            value={rule.businessName}
            onChange={e => onChange({ ...rule, businessName: e.target.value, tokenCode: `BRE-INS-${e.target.value.replace(/\s+/g, '-').toUpperCase().slice(0,12)}` })}
            placeholder="e.g., AML High Value Check"
            className="w-full text-[12px] font-semibold border border-amber-200 rounded-lg p-2 outline-none focus:border-amber-400 bg-white"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-amber-700 uppercase tracking-wider mb-1">Token Code (auto-generated)</label>
          <div className="text-[11px] font-mono text-amber-700 bg-amber-100 border border-amber-200 rounded-lg p-2 truncate">
            {autoToken || 'Enter name above...'}
          </div>
        </div>
      </div>

      <div className="bg-white border border-amber-100 rounded-lg p-3 space-y-2">
        <div className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-2">IF Condition</div>
        <div className="grid grid-cols-3 gap-2">
          <IsoFieldSelector
            value={rule.conditionField}
            onChange={val => onChange({ ...rule, conditionField: val })}
            placeholder="Select field..."
          />
          <select
            value={rule.operator}
            onChange={e => onChange({ ...rule, operator: e.target.value })}
            className="text-[11px] border border-amber-200 rounded-lg p-2 outline-none bg-white text-amber-800 font-bold"
          >
            {OPERATORS.map(op => <option key={op} value={op}>{op.replace(/_/g, ' ')}</option>)}
          </select>
          <input
            type="text"
            value={rule.conditionValue}
            onChange={e => onChange({ ...rule, conditionValue: e.target.value })}
            placeholder="Value (e.g. 1000000)"
            className="text-[11px] border border-amber-200 rounded-lg p-2 outline-none focus:border-amber-400 bg-white font-mono"
          />
        </div>
        <div className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mt-2 mb-1">THEN Action</div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={rule.actionType}
            onChange={e => onChange({ ...rule, actionType: e.target.value })}
            className="text-[11px] border border-amber-200 rounded-lg p-2 outline-none bg-white text-amber-800 font-bold"
          >
            <option value="FLAG">FLAG for Review</option>
            <option value="SET_VALUE">SET field value</option>
            <option value="BLOCK">BLOCK — reject payment</option>
            <option value="ALERT">FIRE Alert Event</option>
          </select>
          {rule.actionType === 'SET_VALUE' && (
            <input
              type="text"
              value={rule.actionValue}
              onChange={e => onChange({ ...rule, actionValue: e.target.value })}
              placeholder="Set value..."
              className="text-[11px] border border-amber-200 rounded-lg p-2 outline-none bg-white font-mono"
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Inline Calculation Builder — creates a formula in context without leaving the factory
const InlineCalcBuilder: React.FC<{
  calc: InlineCalc;
  onChange: (calc: InlineCalc) => void;
}> = ({ calc, onChange }) => {
  const autoToken = calc.businessName
    ? `CALC-INS-${calc.businessName.replace(/\s+/g, '_').toUpperCase().slice(0, 12)}`
    : '';

  return (
    <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Calculator size={13} className="text-indigo-600" />
        <span className="text-[11px] font-extrabold text-indigo-800 uppercase tracking-wider">Inline Calculation Builder</span>
        <span className="text-[9px] text-indigo-600 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full">Saved to Calculation Engine automatically</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Calculation Name</label>
          <input
            type="text"
            value={calc.businessName}
            onChange={e => onChange({ ...calc, businessName: e.target.value, tokenCode: `CALC-INS-${e.target.value.replace(/\s+/g, '_').toUpperCase().slice(0,12)}` })}
            placeholder="e.g., 7-Day Payment Volume"
            className="w-full text-[12px] font-semibold border border-indigo-200 rounded-lg p-2 outline-none focus:border-indigo-400 bg-white"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Token Code (auto-generated)</label>
          <div className="text-[11px] font-mono text-indigo-700 bg-indigo-100 border border-indigo-200 rounded-lg p-2 truncate">
            {autoToken || 'Enter name above...'}
          </div>
        </div>
      </div>

      <div className="bg-white border border-indigo-100 rounded-lg p-3 space-y-3">
        <div>
          <label className="block text-[9px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Formula Expression</label>
          <input
            type="text"
            value={calc.formula}
            onChange={e => onChange({ ...calc, formula: e.target.value })}
            placeholder="e.g., InstructedAmount * FxRate  or  SUM(last_7d_payments)"
            className="w-full text-[12px] font-mono border border-indigo-200 rounded-lg p-2 outline-none focus:border-indigo-400 bg-white text-indigo-800"
          />
          <div className="text-[9px] text-indigo-400 mt-1">Use ISO field names as variables. Math operators: + - * / ( )</div>
        </div>
        <div>
          <label className="block text-[9px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Output Field (ISO key)</label>
          <IsoFieldSelector
            value={calc.outputField}
            onChange={val => onChange({ ...calc, outputField: val })}
            placeholder="Where does the result go?"
          />
        </div>
      </div>
    </div>
  );
};

// Step wizard progress bar
const WizardProgress: React.FC<{ current: WizardStep }> = ({ current }) => {
  const steps = [
    { n: 1, label: 'Trigger', icon: <Zap size={13} /> },
    { n: 2, label: 'Data Sources', icon: <BarChart2 size={13} /> },
    { n: 3, label: 'Analysis Logic', icon: <Code size={13} /> },
    { n: 4, label: 'Output & Delivery', icon: <Bell size={13} /> },
  ];
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${
            current === s.n ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' :
            current > s.n ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            'bg-slate-50 text-slate-400 border border-slate-200'
          }`}>
            {current > s.n ? <CheckCircle size={13} /> : s.icon}
            {s.label}
          </div>
          {i < steps.length - 1 && (
            <div className={`h-px flex-1 mx-1 ${current > s.n ? 'bg-emerald-300' : 'bg-slate-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const InsightsFactoryStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, showToast, dismissToast } = useToast();

  // View state
  const [isCreating, setIsCreating] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<any>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [showTemplates, setShowTemplates] = useState(false);

  // Form state — Step 1: Trigger
  const [insightName, setInsightName] = useState('');
  const [insightCode, setInsightCode] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('SCHEDULED');
  const [triggerCron, setTriggerCron] = useState('0 18 * * 1-5');
  const [triggerEvent, setTriggerEvent] = useState('PAYMENT_SUBMITTED');
  const [applicationPackageId, setApplicationPackageId] = useState('');

  // Form state — Step 2: Data Sources
  const [dataSourceFields, setDataSourceFields] = useState<string[]>([]);
  const [lookbackPeriod, setLookbackPeriod] = useState('7d');

  // Form state — Step 3: Analysis Logic (inline builders + existing refs)
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([]);

  // Form state — Step 4: Output & Delivery
  const [outputMode, setOutputMode] = useState<OutputMode>('DASHBOARD_WIDGET');
  const [dashboardCategory, setDashboardCategory] = useState('360_BUSINESS');
  const [applicableRoles, setApplicableRoles] = useState<string[]>(['ADMIN']);
  const [notificationChannels, setNotificationChannels] = useState<string[]>(['EMAIL']);
  const [linkedScreenId, setLinkedScreenId] = useState('');

  // ─── DATA FETCHING ─────────────────────────────────────────────────────────

  const { data: insightsData, isLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: async () => (await apiClient.get('/insights/')).data,
  });

  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data,
  });

  const { data: rulesData } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => (await apiClient.get('/rules/')).data,
  });

  const { data: calcData } = useQuery({
    queryKey: ['calculations'],
    queryFn: async () => (await apiClient.get('/calculations/')).data,
  });

  const { data: screensData } = useQuery({
    queryKey: ['screens'],
    queryFn: async () => (await apiClient.get('/screens/')).data,
  });

  // ─── MUTATIONS ─────────────────────────────────────────────────────────────

  // When user defines an inline rule inside the factory, save it to the Rules Engine first
  const saveInlineRuleMutation = useMutation({
    mutationFn: async (rule: InlineRule) => {
      const payload = {
        business_name: rule.businessName,
        token_code: rule.tokenCode,
        description: `Auto-created from Insights Factory: ${insightName}`,
        financial_domain: 'INSIGHTS',
        rules: [{
          priority: 100,
          conditions: [{
            left_hand_side: { source_fields: [rule.conditionField] },
            operator: rule.operator,
            right_hand_side: { static_value: rule.conditionValue },
          }],
          actions: [{ action_type: rule.actionType, value: rule.actionValue }],
        }],
      };
      return (await apiClient.post('/rules/', payload)).data;
    },
  });

  // When user defines an inline calculation, save it to the Calculation Engine first
  const saveInlineCalcMutation = useMutation({
    mutationFn: async (calc: InlineCalc) => {
      const payload = {
        business_name: calc.businessName,
        token_code: calc.tokenCode,
        description: `Auto-created from Insights Factory: ${insightName}`,
        formula_expression: calc.formula,
        output_field_token: calc.outputField,
      };
      return (await apiClient.post('/calculations/', payload)).data;
    },
  });

  const createInsightMutation = useMutation({
    mutationFn: async () => {
      // First save any inline rules/calcs
      const savedTokens: string[] = [];
      for (const step of analysisSteps) {
        if (step.stepType === 'BUSINESS_RULE' && step.inlineRule?.businessName) {
          await saveInlineRuleMutation.mutateAsync(step.inlineRule);
          savedTokens.push(step.inlineRule.tokenCode);
        }
        if (step.stepType === 'CALCULATION' && step.inlineCalc?.businessName) {
          await saveInlineCalcMutation.mutateAsync(step.inlineCalc);
          savedTokens.push(step.inlineCalc.tokenCode);
        }
      }

      const payload = {
        insight_name: insightName,
        insight_code: insightCode,
        description,
        trigger_type: triggerType,
        trigger_config: triggerType === 'SCHEDULED'
          ? { cron: triggerCron }
          : triggerType === 'EVENT'
          ? { event_type: triggerEvent }
          : { manual: true },
        application_package_id: applicationPackageId || null,
        data_source_fields: dataSourceFields,
        lookback_period: lookbackPeriod,
        analysis_steps: analysisSteps.map((s, i) => ({
          sequence_number: (i + 1) * 10,
          step_type: s.stepType === 'BUSINESS_RULE' || s.stepType === 'REF_EXISTING_RULE' ? 'BUSINESS_RULE' : 'CALCULATION',
          target_token: s.stepType === 'BUSINESS_RULE' ? s.inlineRule?.tokenCode
            : s.stepType === 'CALCULATION' ? s.inlineCalc?.tokenCode
            : s.existingToken,
        })),
        output_mode: outputMode,
        dashboard_category: outputMode === 'DASHBOARD_WIDGET' ? dashboardCategory : null,
        applicable_roles: applicableRoles,
        notification_channels: outputMode === 'NOTIFICATION' ? notificationChannels : [],
        linked_screen_id: outputMode === 'SCREEN_PANEL' ? linkedScreenId : null,
      };
      return (await apiClient.post('/insights/', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      showToast(`Insight "${insightName}" deployed successfully.`, 'success');
      resetForm();
    },
    onError: (err: any) => {
      showToast(err.response?.data?.detail || 'Failed to save insight.', 'error');
    },
  });

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  const resetForm = () => {
    setIsCreating(false);
    setSelectedInsight(null);
    setWizardStep(1);
    setInsightName(''); setInsightCode(''); setDescription('');
    setTriggerType('SCHEDULED'); setTriggerCron('0 18 * * 1-5');
    setDataSourceFields([]); setLookbackPeriod('7d');
    setAnalysisSteps([]);
    setOutputMode('DASHBOARD_WIDGET'); setApplicableRoles(['ADMIN']);
    setApplicationPackageId('');
  };

  const applyTemplate = (tpl: typeof PREBUILT_TEMPLATES[0]) => {
    setInsightName(tpl.name);
    setInsightCode(`INSIGHT-${tpl.id.toUpperCase().replace('TPL-', '')}`);
    setDescription(tpl.description);
    setTriggerType(tpl.triggerType);
    if ((tpl as any).triggerCron) setTriggerCron((tpl as any).triggerCron);
    if ((tpl as any).triggerEvent) setTriggerEvent((tpl as any).triggerEvent);
    setOutputMode(tpl.outputMode);
    setApplicableRoles(tpl.applicableRoles);
    setShowTemplates(false);
    setIsCreating(true);
    setWizardStep(1);
  };

  const addAnalysisStep = (type: AnalysisStepType) => {
    const id = `step-${Date.now()}`;
    const base: AnalysisStep = { id, stepType: type, sequenceNumber: (analysisSteps.length + 1) * 10 };
    if (type === 'BUSINESS_RULE') {
      base.inlineRule = { id, businessName: '', tokenCode: '', conditionField: '', operator: 'GREATER_THAN', conditionValue: '', actionType: 'FLAG', actionValue: '' };
    }
    if (type === 'CALCULATION') {
      base.inlineCalc = { id, businessName: '', tokenCode: '', formula: '', outputField: '' };
    }
    setAnalysisSteps(prev => [...prev, base]);
  };

  const updateAnalysisStep = (id: string, updates: Partial<AnalysisStep>) => {
    setAnalysisSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeAnalysisStep = (id: string) => {
    setAnalysisSteps(prev => prev.filter(s => s.id !== id));
  };

  const toggleRole = (role: string) => {
    setApplicableRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleChannel = (ch: string) => {
    setNotificationChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  };

  const canProceed = () => {
    if (wizardStep === 1) return insightName.length > 0;
    if (wizardStep === 2) return true; // data sources optional
    if (wizardStep === 3) return analysisSteps.length > 0;
    return true;
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-6 h-[820px]">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* ── LEFT: Insight List ── */}
      <div className="w-[380px] flex flex-col gap-0 bg-white/80 backdrop-blur-md border border-white/30 rounded-2xl shadow-glass overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white/60">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Lightbulb size={15} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight">Insights Factory</h2>
                <p className="text-[10px] text-slate-400 font-medium">Analytical intelligence engine</p>
              </div>
            </div>
            <button
              onClick={() => { resetForm(); setIsCreating(true); }}
              className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center gap-1.5 active:scale-[0.97]"
            >
              <Plus size={11} /> New Insight
            </button>
          </div>

          {/* Template Library Button */}
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="w-full flex items-center justify-between text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-xl hover:bg-indigo-100 transition-all"
          >
            <span className="flex items-center gap-1.5"><BookOpen size={11} /> Pre-built Templates (Payment Hub)</span>
            {showTemplates ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {showTemplates && (
            <div className="mt-2 space-y-1.5 animate-slide-up">
              {PREBUILT_TEMPLATES.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl)}
                  className="w-full flex items-start gap-3 text-left p-3 bg-white border border-indigo-100 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all group"
                >
                  <span className="text-base leading-none mt-0.5">{tpl.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-slate-800 group-hover:text-indigo-700 transition-colors">{tpl.name}</div>
                    <div className="text-[9px] text-slate-400 leading-snug mt-0.5">{tpl.description}</div>
                  </div>
                  <ChevronRight size={12} className="text-slate-300 group-hover:text-indigo-400 mt-1 flex-shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Insight List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="flex justify-center mt-10">
              <div className="w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
            </div>
          ) : insightsData?.insights?.length === 0 || !insightsData?.insights ? (
            <div className="text-center mt-10">
              <Lightbulb size={32} className="mx-auto text-slate-200 mb-3" />
              <p className="text-[11px] text-slate-400 font-medium">No insights yet.</p>
              <p className="text-[10px] text-slate-300">Use a template or create from scratch.</p>
            </div>
          ) : insightsData.insights.map((insight: any) => (
            <div
              key={insight.insight_id}
              onClick={() => { setSelectedInsight(insight); setIsCreating(false); }}
              className={`p-3.5 border rounded-xl cursor-pointer transition-all ${
                selectedInsight?.insight_id === insight.insight_id
                  ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                  : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-1.5">
                <div className="text-[12px] font-bold text-slate-800 leading-snug">{insight.insight_name}</div>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ml-2 ${
                  insight.trigger_type === 'SCHEDULED' ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : insight.trigger_type === 'EVENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>{insight.trigger_type}</span>
              </div>
              <div className="text-[10px] font-mono text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 inline-block">{insight.insight_code}</div>
              {insight.description && (
                <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{insight.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Canvas / Wizard / Viewer ── */}
      <div className="flex-1 bg-white/80 backdrop-blur-md border border-white/30 rounded-2xl shadow-glass flex flex-col overflow-hidden">

        {/* Empty state */}
        {!isCreating && !selectedInsight && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5 shadow-inner">
              <Lightbulb size={36} className="text-indigo-300" />
            </div>
            <p className="text-[14px] font-bold text-slate-500 mb-1">Build Your First Insight</p>
            <p className="text-[11px] text-slate-400 mb-6">Start from a pre-built template or design from scratch.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowTemplates(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-[12px] font-bold hover:bg-indigo-100 transition-all">
                <BookOpen size={13} /> Use Template
              </button>
              <button onClick={() => { resetForm(); setIsCreating(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[12px] font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20">
                <Plus size={13} /> Build from Scratch
              </button>
            </div>
          </div>
        )}

        {/* View selected insight */}
        {!isCreating && selectedInsight && (
          <div className="flex flex-col h-full animate-fade-in">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-[16px] font-extrabold text-slate-800">{selectedInsight.insight_name}</h2>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">ACTIVE</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">{selectedInsight.insight_code}</span>
                  <span className="text-[10px] text-slate-400">{selectedInsight.trigger_type} trigger</span>
                </div>
              </div>
              <button onClick={() => { setIsCreating(true); setSelectedInsight(null); }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[12px] font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20">
                Edit Insight
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              {selectedInsight.description && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Business Purpose</div>
                  <p className="text-[13px] text-slate-700">{selectedInsight.description}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Trigger', value: selectedInsight.trigger_type },
                  { label: 'Output', value: selectedInsight.output_mode || 'DASHBOARD_WIDGET' },
                  { label: 'Analysis Steps', value: `${selectedInsight.analysis_steps?.length || 0} steps` },
                ].map(kv => (
                  <div key={kv.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{kv.label}</div>
                    <div className="text-[13px] font-bold text-slate-800">{kv.value}</div>
                  </div>
                ))}
              </div>
              {selectedInsight.analysis_steps?.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Analysis Steps</div>
                  {selectedInsight.analysis_steps.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl mb-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                      <span className="text-[11px] font-bold text-slate-600">{s.step_type}</span>
                      <span className="text-[11px] font-mono text-indigo-600">{s.target_token}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create / Edit wizard */}
        {isCreating && (
          <div className="flex flex-col h-full animate-fade-in">
            {/* Wizard Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-[15px] font-extrabold text-slate-800">Design Analytical Insight</h2>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-all">
                  <X size={15} />
                </button>
              </div>
              <WizardProgress current={wizardStep} />
            </div>

            <div className="flex-1 overflow-y-auto p-6">

              {/* ── STEP 1: TRIGGER ── */}
              {wizardStep === 1 && (
                <div className="space-y-5 animate-fade-in">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Insight Name *</label>
                      <input
                        type="text"
                        value={insightName}
                        onChange={e => {
                          setInsightName(e.target.value);
                          setInsightCode(`INSIGHT-${e.target.value.replace(/\s+/g,'-').toUpperCase().slice(0,16)}`);
                        }}
                        placeholder="e.g., Daily Settlement Summary"
                        className="w-full text-[13px] font-semibold border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Token Code (auto)</label>
                      <div className="text-[12px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl p-2.5">{insightCode || 'Enter name...'}</div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Business Purpose</label>
                    <input
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="What question does this insight answer and why does it matter?"
                      className="w-full text-[13px] border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-400 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Application Package</label>
                    <select
                      value={applicationPackageId}
                      onChange={e => setApplicationPackageId(e.target.value)}
                      className="w-full text-[13px] border border-slate-200 rounded-xl p-2.5 outline-none bg-white"
                    >
                      <option value="">Global (all packages)</option>
                      {packagesData?.packages?.map((pkg: any) => (
                        <option key={pkg.package_id} value={pkg.package_id}>{pkg.package_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">When does this insight fire?</div>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { v: 'SCHEDULED', label: 'Scheduled', sub: 'Cron interval', icon: <Clock size={18} /> },
                        { v: 'EVENT', label: 'Event-Driven', sub: 'Reacts to system event', icon: <Zap size={18} /> },
                        { v: 'MANUAL', label: 'Manual', sub: 'Button on dashboard', icon: <Monitor size={18} /> },
                      ] as const).map(opt => (
                        <button
                          key={opt.v}
                          onClick={() => setTriggerType(opt.v)}
                          className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-all text-center ${
                            triggerType === opt.v
                              ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                              : 'border-slate-200 hover:border-indigo-200 bg-white'
                          }`}
                        >
                          <span className={triggerType === opt.v ? 'text-indigo-600' : 'text-slate-400'}>{opt.icon}</span>
                          <div className="text-[12px] font-bold text-slate-800">{opt.label}</div>
                          <div className="text-[10px] text-slate-400">{opt.sub}</div>
                        </button>
                      ))}
                    </div>

                    {triggerType === 'SCHEDULED' && (
                      <div className="animate-fade-in">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Cron Expression</label>
                        <input
                          type="text"
                          value={triggerCron}
                          onChange={e => setTriggerCron(e.target.value)}
                          className="w-full text-[13px] font-mono border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-400 bg-white text-indigo-700"
                        />
                        <div className="text-[10px] text-slate-400 mt-1">
                          Common: <button className="underline" onClick={() => setTriggerCron('0 18 * * 1-5')}>Weekdays 6pm</button> · <button className="underline" onClick={() => setTriggerCron('0 9 * * 1')}>Monday 9am</button> · <button className="underline" onClick={() => setTriggerCron('0 0 1 * *')}>Monthly</button>
                        </div>
                      </div>
                    )}

                    {triggerType === 'EVENT' && (
                      <div className="animate-fade-in">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">System Event Token</label>
                        <input
                          type="text"
                          value={triggerEvent}
                          onChange={e => setTriggerEvent(e.target.value.toUpperCase())}
                          placeholder="e.g., PAYMENT_SUBMITTED"
                          className="w-full text-[13px] font-mono border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-400 bg-white text-amber-700"
                        />
                        <div className="text-[10px] text-slate-400 mt-1">Common events: PAYMENT_SUBMITTED · SETTLEMENT_COMPLETE · AML_FLAG_RAISED · FX_RATE_UPDATED</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── STEP 2: DATA SOURCES ── */}
              {wizardStep === 2 && (
                <div className="space-y-5 animate-fade-in">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-1">What data does this insight read?</div>
                    <p className="text-[11px] text-slate-400 mb-4">Select ISO fields to scope the data this insight analyses. Leave empty to run across all data.</p>
                    <IsoFieldSelector
                      value={dataSourceFields}
                      onChange={setDataSourceFields}
                      multiSelect={true}
                      placeholder="Select ISO fields to analyse..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Lookback Period</label>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { v: '24h', label: 'Last 24 hours' },
                        { v: '7d', label: 'Last 7 days' },
                        { v: '30d', label: 'Last 30 days' },
                        { v: '90d', label: 'Last 90 days' },
                        { v: 'YTD', label: 'Year to date' },
                        { v: 'ALL', label: 'All time' },
                      ].map(opt => (
                        <button
                          key={opt.v}
                          onClick={() => setLookbackPeriod(opt.v)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                            lookbackPeriod === opt.v
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                          }`}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 3: ANALYSIS LOGIC ── */}
              {wizardStep === 3 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-[12px] font-extrabold text-slate-700">Analysis Logic</div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Build rules and calculations inline, or reference existing ones from your library.
                        Inline-created items are automatically saved to their respective studios.
                      </p>
                    </div>
                  </div>

                  {/* Add step buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => addAnalysisStep('BUSINESS_RULE')}
                      className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-[11px] font-bold hover:bg-amber-100 transition-all"
                    >
                      <Code size={12} /> + New Rule (inline)
                    </button>
                    <button
                      onClick={() => addAnalysisStep('CALCULATION')}
                      className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-[11px] font-bold hover:bg-indigo-100 transition-all"
                    >
                      <Calculator size={12} /> + New Calculation (inline)
                    </button>
                    <button
                      onClick={() => addAnalysisStep('REF_EXISTING_RULE')}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-bold hover:bg-slate-100 transition-all"
                    >
                      <BookOpen size={12} /> + Reference Existing Rule
                    </button>
                    <button
                      onClick={() => addAnalysisStep('REF_EXISTING_CALC')}
                      className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-bold hover:bg-slate-100 transition-all"
                    >
                      <BookOpen size={12} /> + Reference Existing Calc
                    </button>
                  </div>

                  {analysisSteps.length === 0 && (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                      <Code size={24} className="mx-auto text-slate-200 mb-2" />
                      <p className="text-[11px] text-slate-400">Add at least one analysis step above.</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    {analysisSteps.map((step, idx) => (
                      <div key={step.id} className="relative">
                        <div className="absolute -left-3 top-4 w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">{idx + 1}</div>
                        <div className="ml-4">
                          {/* Inline Rule */}
                          {step.stepType === 'BUSINESS_RULE' && step.inlineRule && (
                            <div className="relative">
                              <button
                                onClick={() => removeAnalysisStep(step.id)}
                                className="absolute top-3 right-3 text-slate-300 hover:text-rose-500 transition-colors z-10"
                              ><Trash2 size={12} /></button>
                              <InlineRuleBuilder
                                rule={step.inlineRule}
                                onChange={rule => updateAnalysisStep(step.id, { inlineRule: rule })}
                                rulesData={rulesData || []}
                              />
                            </div>
                          )}

                          {/* Inline Calc */}
                          {step.stepType === 'CALCULATION' && step.inlineCalc && (
                            <div className="relative">
                              <button
                                onClick={() => removeAnalysisStep(step.id)}
                                className="absolute top-3 right-3 text-slate-300 hover:text-rose-500 transition-colors z-10"
                              ><Trash2 size={12} /></button>
                              <InlineCalcBuilder
                                calc={step.inlineCalc}
                                onChange={calc => updateAnalysisStep(step.id, { inlineCalc: calc })}
                              />
                            </div>
                          )}

                          {/* Reference existing rule */}
                          {step.stepType === 'REF_EXISTING_RULE' && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                              <BookOpen size={14} className="text-slate-400 flex-shrink-0" />
                              <select
                                value={step.existingToken || ''}
                                onChange={e => updateAnalysisStep(step.id, { existingToken: e.target.value })}
                                className="flex-1 text-[12px] font-mono border border-slate-200 rounded-lg p-2 outline-none bg-white text-indigo-700"
                              >
                                <option value="" disabled>Select existing rule token...</option>
                                {rulesData?.map((r: any) => (
                                  <option key={r.token_code} value={r.token_code}>{r.business_name} — {r.token_code}</option>
                                ))}
                              </select>
                              <button onClick={() => removeAnalysisStep(step.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                            </div>
                          )}

                          {/* Reference existing calc */}
                          {step.stepType === 'REF_EXISTING_CALC' && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                              <BookOpen size={14} className="text-slate-400 flex-shrink-0" />
                              <select
                                value={step.existingToken || ''}
                                onChange={e => updateAnalysisStep(step.id, { existingToken: e.target.value })}
                                className="flex-1 text-[12px] font-mono border border-slate-200 rounded-lg p-2 outline-none bg-white text-indigo-700"
                              >
                                <option value="" disabled>Select existing calculation token...</option>
                                {calcData?.formulas?.map((f: any) => (
                                  <option key={f.token_code} value={f.token_code}>{f.business_name} — {f.token_code}</option>
                                ))}
                              </select>
                              <button onClick={() => removeAnalysisStep(step.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── STEP 4: OUTPUT & DELIVERY ── */}
              {wizardStep === 4 && (
                <div className="space-y-5 animate-fade-in">
                  <div>
                    <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider mb-3">Where does this insight surface?</div>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { v: 'DASHBOARD_WIDGET', label: 'Dashboard Widget', sub: 'Shows on role dashboard', icon: <BarChart2 size={18} /> },
                        { v: 'NOTIFICATION', label: 'Alert Notification', sub: 'Email or SMS on trigger', icon: <Bell size={18} /> },
                        { v: 'SCREEN_PANEL', label: 'Screen Panel', sub: 'Embedded in a screen', icon: <Monitor size={18} /> },
                      ] as const).map(opt => (
                        <button
                          key={opt.v}
                          onClick={() => setOutputMode(opt.v)}
                          className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl transition-all text-center ${
                            outputMode === opt.v
                              ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                              : 'border-slate-200 hover:border-indigo-200 bg-white'
                          }`}
                        >
                          <span className={outputMode === opt.v ? 'text-indigo-600' : 'text-slate-400'}>{opt.icon}</span>
                          <div className="text-[12px] font-bold text-slate-800">{opt.label}</div>
                          <div className="text-[10px] text-slate-400">{opt.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {outputMode === 'DASHBOARD_WIDGET' && (
                    <div className="space-y-4 animate-fade-in">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Target Dashboard</label>
                        <select
                          value={dashboardCategory}
                          onChange={e => setDashboardCategory(e.target.value)}
                          className="w-full text-[13px] border border-slate-200 rounded-xl p-2.5 outline-none bg-white"
                        >
                          <option value="GLOBAL">Global / Home Dashboard</option>
                          <option value="360_BUSINESS">Product 360° Business View</option>
                          <option value="TECHNICAL">Technical & API Dashboard</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {outputMode === 'NOTIFICATION' && (
                    <div className="space-y-3 animate-fade-in">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notification Channels</label>
                      <div className="flex gap-2">
                        {['EMAIL', 'SMS', 'SLACK', 'WEBHOOK'].map(ch => (
                          <button
                            key={ch}
                            onClick={() => toggleChannel(ch)}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                              notificationChannels.includes(ch)
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                            }`}
                          >{ch}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {outputMode === 'SCREEN_PANEL' && (
                    <div className="animate-fade-in">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Embed in Screen</label>
                      <select
                        value={linkedScreenId}
                        onChange={e => setLinkedScreenId(e.target.value)}
                        className="w-full text-[13px] border border-slate-200 rounded-xl p-2.5 outline-none bg-white"
                      >
                        <option value="">Select a screen...</option>
                        {screensData?.screens?.map((s: any) => (
                          <option key={s.screen_id} value={s.screen_id}>{s.screen_name}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">This insight will appear as a live panel inside the selected screen whenever it is opened.</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Visible to Roles</label>
                    <div className="flex gap-2 flex-wrap">
                      {ROLES.map(role => (
                        <button
                          key={role}
                          onClick={() => toggleRole(role)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                            applicableRoles.includes(role)
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                          }`}
                        >{role}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <button
                onClick={() => wizardStep > 1 ? setWizardStep(prev => (prev - 1) as WizardStep) : resetForm()}
                className="px-4 py-2 text-[12px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
              >
                {wizardStep === 1 ? 'Cancel' : '← Back'}
              </button>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">Step {wizardStep} of 4</span>
                {wizardStep < 4 ? (
                  <button
                    disabled={!canProceed()}
                    onClick={() => setWizardStep(prev => (prev + 1) as WizardStep)}
                    className="px-5 py-2 text-[12px] font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    Next <ChevronRight size={13} />
                  </button>
                ) : (
                  <button
                    disabled={createInsightMutation.isPending || !insightName}
                    onClick={() => createInsightMutation.mutate()}
                    className="px-5 py-2 text-[12px] font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-40 flex items-center gap-2"
                  >
                    {createInsightMutation.isPending ? 'Deploying...' : <><CheckCircle size={13} /> Deploy Insight</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
