// WHY THIS COMPONENT EXISTS:
// The Calculation Program Designer Studio. Replaces the old single-expression React Flow
// canvas with a sequential, stateful program editor — the direct replacement for Python
// scripts, MS Access macros, and User-Defined Tables that analytics teams currently
// maintain as black boxes.
//
// DOMAIN SCOPING (compliance requirement):
// The domain is DERIVED from the active Package — never chosen by the user.
// A Payments ops user inside "Payment Hub" must never see CLO waterfall formulas.
// A Structured Finance user must never see FEDWIRE calculations.
// The Package's business_domain field is the domain boundary for this studio.
// Only globalAdminDesignerMode users can see across all domains.
//
// Layout: 3-panel
//   Left   — My Programs list + Formula Registry (pre-filtered to package domain)
//   Center — Step editor + form (domain auto-set from package, read-only)
//   Right  — Inputs panel + Live Test execution trace
//
// Data contract: /api/v1/calculations/programs (CRUD + /execute + /clone)

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';
import { ProductSubProductPicker } from '../../components/ProductSubProductPicker';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalcStep {
  seq: number;
  var_name: string;
  expression: string;
  description: string;
  is_output: boolean;
  output_token: string;
}

interface CalcInput {
  name: string;
  source_type: string;   // ISO_FIELD | RATE_FEED | POLICY_CONSTANT | FORMULA_TOKEN | RUNTIME_INPUT | DAY_COUNT
  iso_field_id: string;
  value: string;
  feed_code: string;
  token_ref: string;
  convention: string;    // for DAY_COUNT
  description: string;
}

// Maps ProductApplicationPackage.business_domain → our Calculation Engine domain codes.
// WHY: Package.business_domain is the authoritative domain boundary. The user never
// picks the domain — the Package they're working inside determines it.
const PACKAGE_DOMAIN_MAP: Record<string, string> = {
  'Payments': 'PAYMENTS',
  'PAYMENTS': 'PAYMENTS',
  'Treasury': 'TREASURY',
  'TREASURY': 'TREASURY',
  'Structured Finance': 'STRUCTURED_FINANCE',
  'STRUCTURED_FINANCE': 'STRUCTURED_FINANCE',
  'Credit Risk': 'CREDIT_RISK',
  'CREDIT_RISK': 'CREDIT_RISK',
  'Investment Banking': 'INVESTMENT_BANKING',
  'INVESTMENT_BANKING': 'INVESTMENT_BANKING',
  'Retail Banking': 'RETAIL_BANKING',
  'RETAIL_BANKING': 'RETAIL_BANKING',
  'Corporate Banking': 'CORPORATE_BANKING',
  'CORPORATE_BANKING': 'CORPORATE_BANKING',
};

const DOMAIN_LABELS: Record<string, string> = {
  PAYMENTS: 'Payments',
  STRUCTURED_FINANCE: 'Structured Finance',
  CREDIT_RISK: 'Credit Risk',
  TREASURY: 'Treasury',
  INVESTMENT_BANKING: 'Investment Banking',
  RETAIL_BANKING: 'Retail Banking',
  CORPORATE_BANKING: 'Corporate Banking',
};

const SOURCE_TYPES = [
  { code: 'RUNTIME_INPUT', label: 'Runtime Input', desc: 'Provided per-record at execution (e.g. collateral value)' },
  { code: 'POLICY_CONSTANT', label: 'Policy Constant', desc: 'Fixed numeric constant (e.g. senior fee rate 0.015)' },
  { code: 'ISO_FIELD', label: 'ISO 20022 Field', desc: 'ISO field from the semantic registry' },
  { code: 'RATE_FEED', label: 'Rate Feed', desc: 'Market rate (e.g. SOFR_ON, LIBOR_3M)' },
  { code: 'FORMULA_TOKEN', label: 'Formula Token', desc: 'Calculated field output from another Formula' },
  { code: 'DAY_COUNT', label: 'Day Count Fraction', desc: 'Computed from start/end dates per convention' },
];

const DAY_COUNT_OPTIONS = [
  { code: 'ACT_360', label: 'Actual/360 — US money market (T-Bills, commercial paper)' },
  { code: 'ACT_365', label: 'Actual/365 — UK gilt and sterling markets' },
  { code: '30_360', label: '30/360 US — US corporate bonds (NASD)' },
  { code: '30E_360', label: '30E/360 — Eurobond / EU convention' },
  { code: 'ACT_ACT', label: 'Actual/Actual ICMA — US Treasuries, sovereign debt' },
];

const FUNCTION_SNIPPETS = ['MIN(a, b)', 'MAX(a, b)', 'IF(condition, true_val, false_val)', 'ABS(x)', 'ROUND(x, 2)', 'FLOOR(x)', 'CEIL(x)', 'POWER(base, exp)', 'LOG(x)', 'NORM_CDF(x)'];

// ---------------------------------------------------------------------------
// Empty state factories
// ---------------------------------------------------------------------------

const makeStep = (seq: number): CalcStep => ({
  seq,
  var_name: '',
  expression: '',
  description: '',
  is_output: false,
  output_token: '',
});

const makeInput = (): CalcInput => ({
  name: '',
  source_type: 'RUNTIME_INPUT',
  iso_field_id: '',
  value: '',
  feed_code: '',
  token_ref: '',
  convention: 'ACT_360',
  description: '',
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FieldPicker — inline search popover for inserting Field Registry tokens into
// an expression. WHY THIS EXISTS: Users cannot free-type field names. Every field
// reference in a formula must resolve to a registered field (ISO_20022, BANK_CUSTOM,
// or CALCULATED). This picker enforces that governance rule at the point of authoring.
// Inserting a field adds its technical_sys_name (the stable machine-readable identifier)
// into the expression at the cursor — not the display name, which can change.
// ---------------------------------------------------------------------------
const FieldPicker: React.FC<{
  packageDomain: string;
  onInsert: (technicalName: string) => void;
}> = ({ packageDomain, onInsert }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['field-picker', packageDomain, search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (search) params.set('search', search);
      if (packageDomain) params.set('domain_category', packageDomain);
      return (await apiClient.get(`/fields/registry/?${params}`)).data;
    },
    enabled: open,
  });

  const fields: any[] = data?.fields ?? [];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-[10px] font-bold text-indigo-600 border border-indigo-200 rounded-lg px-2 py-1 hover:bg-indigo-50 whitespace-nowrap"
        title="Insert a registered field token into the expression"
      >+ Field</button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-2 space-y-1.5">
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Field Registry..."
              className="flex-1 text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"
            />
            <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-500 font-bold text-[14px] leading-none px-1">×</button>
          </div>
          {isLoading && <div className="text-[10px] text-slate-400 text-center py-3">Searching...</div>}
          {!isLoading && fields.length === 0 && (
            <div className="text-[10px] text-slate-400 text-center py-3 italic">No fields found.</div>
          )}
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {fields.map((f: any) => (
              <button
                key={f.field_id}
                type="button"
                onClick={() => { onInsert(f.technical_sys_name); setOpen(false); setSearch(''); }}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold text-indigo-700 truncate flex-1">{f.technical_sys_name}</span>
                  {/* Source badge: shows whether field is ISO standard, bank custom, or a calculated formula output */}
                  <span className={`text-[8px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${
                    f.field_source === 'CALCULATED' ? 'bg-emerald-100 text-emerald-700' :
                    f.field_source === 'BANK_CUSTOM' ? 'bg-amber-100 text-amber-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{f.field_source === 'ISO_20022' ? 'ISO' : f.field_source === 'BANK_CUSTOM' ? 'CUSTOM' : 'CALC'}</span>
                </div>
                <div className="text-[9px] text-slate-400 truncate">{f.client_business_name}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Step row in the formula editor
const StepRow: React.FC<{
  step: CalcStep;
  index: number;
  total: number;
  packageDomain: string;
  onChange: (field: keyof CalcStep, val: any) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = ({ step, index, total, packageDomain, onChange, onRemove, onMoveUp, onMoveDown }) => {
  // Ref to the expression input so FieldPicker can insert at cursor position
  const exprRef = React.useRef<HTMLInputElement>(null);

  const insertField = (token: string) => {
    const el = exprRef.current;
    if (!el) {
      onChange('expression', step.expression + token);
      return;
    }
    const start = el.selectionStart ?? step.expression.length;
    const end = el.selectionEnd ?? step.expression.length;
    const next = step.expression.slice(0, start) + token + step.expression.slice(end);
    onChange('expression', next);
    // Restore cursor after the inserted token
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
  <div className={`border rounded-xl p-3 ${step.is_output ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-start gap-2">
      {/* Seq badge + move controls */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5 flex-shrink-0">
        <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">{step.seq}</div>
        <button onClick={onMoveUp} disabled={index === 0} className="text-slate-300 hover:text-slate-500 disabled:opacity-20 text-[10px] leading-none">▲</button>
        <button onClick={onMoveDown} disabled={index === total - 1} className="text-slate-300 hover:text-slate-500 disabled:opacity-20 text-[10px] leading-none">▼</button>
      </div>

      {/* Core fields */}
      <div className="flex-1 grid grid-cols-12 gap-2">
        {/* var_name */}
        <div className="col-span-3">
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Result Name</label>
          <input
            type="text"
            value={step.var_name}
            onChange={e => onChange('var_name', e.target.value.toUpperCase().replace(/\s/g, '_'))}
            placeholder="e.g. TOTAL_FEE"
            className="w-full text-[11px] font-mono font-bold text-indigo-700 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-slate-50"
          />
        </div>

        {/* expression + field picker */}
        <div className="col-span-6">
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Expression</label>
            {/* FieldPicker enforces governance: all field references must come from the Field Registry */}
            <FieldPicker packageDomain={packageDomain} onInsert={insertField} />
          </div>
          <input
            ref={exprRef}
            type="text"
            value={step.expression}
            onChange={e => onChange('expression', e.target.value)}
            placeholder="e.g. ADMIN_FEE + TRANSACTION_FEE"
            className="w-full text-[11px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white"
          />
        </div>

        {/* description */}
        <div className="col-span-3">
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Description</label>
          <input
            type="text"
            value={step.description}
            onChange={e => onChange('description', e.target.value)}
            placeholder="What does this compute?"
            className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white"
          />
        </div>
      </div>

      {/* Output toggle + remove */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <button
          onClick={onRemove}
          className="text-slate-300 hover:text-rose-400 text-[12px] font-bold leading-none"
          title="Remove step"
        >×</button>
        <label className="flex items-center gap-1 cursor-pointer" title="Mark as published output token">
          <input
            type="checkbox"
            checked={step.is_output}
            onChange={e => onChange('is_output', e.target.checked)}
            className="w-3 h-3 accent-emerald-500"
          />
          <span className="text-[9px] font-bold text-slate-500 uppercase">Output</span>
        </label>
        {step.is_output && (
          <input
            type="text"
            value={step.output_token}
            onChange={e => onChange('output_token', e.target.value.toUpperCase().replace(/\s/g, '_'))}
            placeholder="TOKEN_NAME"
            className="text-[9px] font-mono font-bold text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 w-24 outline-none focus:border-emerald-400 bg-white"
          />
        )}
      </div>
    </div>
  </div>
  );
};

// Single input row in the Inputs panel
const InputRow: React.FC<{
  input: CalcInput;
  onChange: (field: keyof CalcInput, val: string) => void;
  onRemove: () => void;
}> = ({ input, onChange, onRemove }) => (
  <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-2">
    <div className="flex items-center gap-2">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Variable Name</label>
          <input
            type="text"
            value={input.name}
            onChange={e => onChange('name', e.target.value.toUpperCase().replace(/\s/g, '_'))}
            placeholder="e.g. OUTSTANDING_BAL"
            className="w-full text-[10px] font-mono font-bold text-indigo-700 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-slate-50"
          />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Source Type</label>
          <select
            value={input.source_type}
            onChange={e => onChange('source_type', e.target.value)}
            className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white font-semibold"
          >
            {SOURCE_TYPES.map(s => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      <button onClick={onRemove} className="text-slate-300 hover:text-rose-400 text-[14px] font-bold flex-shrink-0">×</button>
    </div>

    {/* Conditional fields per source type */}
    {input.source_type === 'POLICY_CONSTANT' && (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Constant Value</label>
          <input type="number" value={input.value} onChange={e => onChange('value', e.target.value)}
            placeholder="0.015"
            className="w-full text-[10px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Description</label>
          <input type="text" value={input.description} onChange={e => onChange('description', e.target.value)}
            placeholder="e.g. Senior fee rate 1.5%"
            className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white" />
        </div>
      </div>
    )}
    {input.source_type === 'RATE_FEED' && (
      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Feed Code</label>
        <input type="text" value={input.feed_code} onChange={e => onChange('feed_code', e.target.value.toUpperCase())}
          placeholder="e.g. SOFR_ON, LIBOR_3M, FED_FUNDS"
          className="w-full text-[10px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white" />
      </div>
    )}
    {input.source_type === 'FORMULA_TOKEN' && (
      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Source Token Code</label>
        <input type="text" value={input.token_ref} onChange={e => onChange('token_ref', e.target.value.toUpperCase())}
          placeholder="e.g. CP-SF-001"
          className="w-full text-[10px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white" />
      </div>
    )}
    {input.source_type === 'DAY_COUNT' && (
      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Day Count Convention</label>
        <select value={input.convention} onChange={e => onChange('convention', e.target.value)}
          className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white">
          {DAY_COUNT_OPTIONS.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
        </select>
        <p className="text-[9px] text-slate-400 mt-1">Provide <code className="bg-slate-100 px-1 rounded">{input.name}_START</code> and <code className="bg-slate-100 px-1 rounded">{input.name}_END</code> in runtime values.</p>
      </div>
    )}
    {(input.source_type === 'RUNTIME_INPUT' || input.source_type === 'ISO_FIELD') && (
      <div>
        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Description</label>
        <input type="text" value={input.description} onChange={e => onChange('description', e.target.value)}
          placeholder="e.g. Outstanding principal balance per collateral record"
          className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white" />
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Main Studio
// ---------------------------------------------------------------------------

export const CalculationEngineStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeProductContext, activeCoreProductId, activeCoreSubProductId, globalAdminDesignerMode } = usePlatformStore();

  // --- View state ---
  const [activeTab, setActiveTab] = useState<'programs' | 'registry'>('programs');
  const [registrySearch, setRegistrySearch] = useState('');
  const [showAllDomains, setShowAllDomains] = useState(false); // admin-only override
  const [programsSearch, setProgramsSearch] = useState('');
  const [rightPanel, setRightPanel] = useState<'inputs' | 'test'>('inputs');

  // --- Selected / form state ---
  const [selectedProgram, setSelectedProgram] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form-level fields (domain is NOT user-controlled — derived from package)
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTier, setFormTier] = useState('T1');
  const [formSteps, setFormSteps] = useState<CalcStep[]>([makeStep(1)]);
  const [formInputs, setFormInputs] = useState<CalcInput[]>([makeInput()]);
  const [formProductId, setFormProductId] = useState('');
  const [formSubProductId, setFormSubProductId] = useState('');

  // Test execution state
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  // --- Package resolution ---
  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data,
    enabled: !!activeProductContext,
  });
  const currentPackage = packagesData?.packages?.find((p: any) => p.package_name === activeProductContext);
  const packageId = currentPackage?.package_id ?? null;

  // WHY: Domain is derived from the Package's business_domain — never chosen by the user.
  // A Payments ops user must never see CLO waterfall formulas. A Structured Finance analyst
  // must never see FEDWIRE calculations. The Package IS the domain boundary.
  const packageDomain = PACKAGE_DOMAIN_MAP[currentPackage?.business_domain ?? ''] ?? '';
  // registryDomain: normally locked to packageDomain; admin mode can override
  const registryDomain = (globalAdminDesignerMode && showAllDomains) ? '' : packageDomain;

  // --- Programs list (user programs, not templates, scoped to this package) ---
  const { data: programsData, isLoading: programsLoading } = useQuery({
    queryKey: ['calc-programs', packageId, activeCoreProductId, programsSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ is_template: 'false', limit: '100' });
      if (packageId) params.set('package_id', packageId);
      if (activeCoreProductId) params.set('product_id', activeCoreProductId);
      if (programsSearch) params.set('search', programsSearch);
      return (await apiClient.get(`/calculations/programs?${params}`)).data;
    },
  });

  // --- Formula Registry (templates, domain-scoped to this package by default) ---
  const { data: registryData, isLoading: registryLoading } = useQuery({
    queryKey: ['calc-registry', registryDomain, registrySearch],
    queryFn: async () => {
      const params = new URLSearchParams({ is_template: 'true', limit: '100' });
      if (registryDomain) params.set('domain', registryDomain);
      if (registrySearch) params.set('search', registrySearch);
      return (await apiClient.get(`/calculations/programs?${params}`)).data;
    },
  });

  // --- Mutations ---
  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        program_code: formCode,
        business_name: formName,
        description: formDescription,
        domain: packageDomain || null,   // always use package domain, never user input
        tier: formTier,
        is_template: false,
        locked_steps: false,
        steps: formSteps.filter(s => s.var_name && s.expression),
        inputs: formInputs.filter(i => i.name),
        application_package_id: packageId,
        product_id: formProductId === 'ALL' ? null : formProductId || null,
        subproduct_id: formSubProductId || null,
      };
      return (await apiClient.post('/calculations/programs', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calc-programs'] });
      resetForm();
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (programId: string) => (await apiClient.post(`/calculations/programs/${programId}/clone`)).data,
    onSuccess: (cloned) => {
      queryClient.invalidateQueries({ queryKey: ['calc-programs'] });
      setActiveTab('programs');
      openProgram(cloned);
    },
  });

  // --- Helpers ---
  const resetForm = () => {
    setIsCreating(false);
    setIsEditing(false);
    setFormName('');
    setFormCode('');
    setFormDescription('');
    setFormTier('T1');
    setFormSteps([makeStep(1)]);
    setFormInputs([makeInput()]);
    setFormProductId('');
    setFormSubProductId('');
    setTestValues({});
    setTestResult(null);
  };

  const openProgram = (prog: any) => {
    setSelectedProgram(prog);
    setIsCreating(false);
    setIsEditing(false);
    setTestResult(null);
    // Pre-populate test values from RUNTIME_INPUT and POLICY_CONSTANT inputs
    const initialTestVals: Record<string, string> = {};
    (prog.inputs || []).forEach((inp: any) => {
      if (inp.source_type === 'RUNTIME_INPUT') initialTestVals[inp.name] = '';
      if (inp.source_type === 'POLICY_CONSTANT') initialTestVals[inp.name] = String(inp.value ?? '');
    });
    setTestValues(initialTestVals);
  };

  const addStep = () => {
    const nextSeq = Math.max(...formSteps.map(s => s.seq), 0) + 1;
    setFormSteps(prev => [...prev, makeStep(nextSeq)]);
  };

  const updateStep = (index: number, field: keyof CalcStep, val: any) => {
    setFormSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: val } : s));
  };

  const removeStep = (index: number) => {
    setFormSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, seq: i + 1 })));
  };

  const moveStep = (index: number, dir: 'up' | 'down') => {
    setFormSteps(prev => {
      const arr = [...prev];
      const swapIdx = dir === 'up' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= arr.length) return arr;
      [arr[index], arr[swapIdx]] = [arr[swapIdx], arr[index]];
      return arr.map((s, i) => ({ ...s, seq: i + 1 }));
    });
  };

  const updateInput = (index: number, field: keyof CalcInput, val: string) => {
    setFormInputs(prev => prev.map((inp, i) => i === index ? { ...inp, [field]: val } : inp));
  };

  const runTest = async () => {
    if (!selectedProgram) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await apiClient.post(`/calculations/programs/${selectedProgram.program_id}/execute`, {
        runtime_values: Object.fromEntries(
          Object.entries(testValues).map(([k, v]) => [k, parseFloat(v) || v])
        ),
      });
      setTestResult(res.data);
    } catch (e: any) {
      setTestResult({ status: 'ERROR', error: e.response?.data?.detail || e.message });
    } finally {
      setTestLoading(false);
    }
  };

  const canSave = formName && formCode && formProductId && formSteps.some(s => s.var_name && s.expression);

  // --- Domain badge color ---
  const domainColor: Record<string, string> = {
    PAYMENTS: 'bg-indigo-100 text-indigo-700',
    STRUCTURED_FINANCE: 'bg-purple-100 text-purple-700',
    CREDIT_RISK: 'bg-rose-100 text-rose-700',
    TREASURY: 'bg-amber-100 text-amber-700',
    INVESTMENT_BANKING: 'bg-blue-100 text-blue-700',
    RETAIL_BANKING: 'bg-green-100 text-green-700',
    CORPORATE_BANKING: 'bg-orange-100 text-orange-700',
  };

  const tierBadge: Record<string, string> = {
    T1: 'bg-emerald-100 text-emerald-700',
    T2: 'bg-amber-100 text-amber-700',
    T3: 'bg-red-100 text-red-700',
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col w-full h-[900px]">
      <CockpitLockBanner />
      <InfinityAIHelper studioKey="calculation-engine" />

      <div className="flex gap-5 flex-1 min-h-0">

        {/* ================================================================
            LEFT PANEL — My Formulas list + Formula Library browser
        ================================================================ */}
        <div className="w-[300px] glass-card rounded-2xl flex flex-col overflow-hidden flex-shrink-0">
          {/* Tab switcher */}
          <div className="flex border-b border-slate-100 bg-slate-50/50">
            <button
              onClick={() => setActiveTab('programs')}
              className={`flex-1 px-3 py-2.5 text-[11px] font-bold transition-colors ${activeTab === 'programs' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
            >My Formulas</button>
            <button
              onClick={() => setActiveTab('registry')}
              className={`flex-1 px-3 py-2.5 text-[11px] font-bold transition-colors ${activeTab === 'registry' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
            >📚 Registry</button>
          </div>

          {activeTab === 'programs' && (
            <>
              <div className="p-3 border-b border-slate-100 flex gap-2 items-center">
                <input
                  type="text"
                  value={programsSearch}
                  onChange={e => setProgramsSearch(e.target.value)}
                  placeholder="Search formulas..."
                  className="flex-1 text-[11px] border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 bg-white"
                />
                <button
                  onClick={() => {
                    setSelectedProgram(null); setIsEditing(false);
                    setFormName(''); setFormCode(''); setFormDescription(''); setFormTier('T1');
                    setFormSteps([makeStep(1)]); setFormInputs([makeInput()]);
                    setFormProductId(''); setFormSubProductId('');
                    setTestValues({}); setTestResult(null);
                    setIsCreating(true);
                  }}
                  className="bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold shadow-sm flex-shrink-0"
                >+ New</button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {programsLoading && <div className="text-[10px] text-slate-400 text-center py-8">Loading...</div>}
                {!programsLoading && (programsData?.programs ?? []).length === 0 && (
                  <div className="text-[10px] text-slate-400 text-center py-8 italic">No formulas yet.<br/>Click + New to create one.</div>
                )}
                {(programsData?.programs ?? []).map((prog: any) => (
                  <div
                    key={prog.program_id}
                    onClick={() => openProgram(prog)}
                    className={`p-3 border rounded-xl cursor-pointer transition-all ${selectedProgram?.program_id === prog.program_id && !isCreating ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-white/80'}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-[12px] font-bold text-slate-800 leading-tight">{prog.business_name}</div>
                      {prog.tier && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${tierBadge[prog.tier] || 'bg-slate-100 text-slate-600'}`}>{prog.tier}</span>}
                    </div>
                    <div className="text-[9px] font-mono text-indigo-500 mt-0.5">{prog.program_code}</div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {prog.domain && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${domainColor[prog.domain] || 'bg-slate-100 text-slate-600'}`}>{prog.domain.replace(/_/g, ' ')}</span>}
                      <span className="text-[9px] text-slate-400">{(prog.steps || []).length} step{(prog.steps || []).length !== 1 ? 's' : ''}</span>
                      <span className={`text-[9px] font-bold ml-auto ${prog.status === 'ACTIVE' ? 'text-emerald-600' : 'text-slate-400'}`}>{prog.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'registry' && (
            <>
              <div className="p-3 border-b border-slate-100 space-y-2">
                <input
                  type="text"
                  value={registrySearch}
                  onChange={e => setRegistrySearch(e.target.value)}
                  placeholder="Search 293 formulas..."
                  className="w-full text-[11px] border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 bg-white"
                />
                {/* Domain is locked to the active package — compliance boundary */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Domain:</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${domainColor[packageDomain] || 'bg-slate-100 text-slate-600'}`}>
                      {DOMAIN_LABELS[packageDomain] || packageDomain || 'All'}
                    </span>
                    {!packageDomain && <span className="text-[9px] text-slate-400 italic">— select a package first</span>}
                  </div>
                  {/* Admin-only: override domain lock to browse all templates across packages */}
                  {globalAdminDesignerMode && (
                    <button
                      onClick={() => setShowAllDomains(v => !v)}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-colors ${showAllDomains ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-600'}`}
                    >{showAllDomains ? '🔓 Showing All' : '🔒 Admin: Show All'}</button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {registryLoading && <div className="text-[10px] text-slate-400 text-center py-8">Loading registry...</div>}
                {!registryLoading && (registryData?.programs ?? []).length === 0 && (
                  <div className="text-[10px] text-slate-400 text-center py-8 italic">No templates found.</div>
                )}
                {(registryData?.programs ?? []).map((tmpl: any) => (
                  <div
                    key={tmpl.program_id}
                    className="p-3 border border-slate-200 rounded-xl bg-white hover:border-indigo-200 cursor-pointer"
                    onClick={() => openProgram(tmpl)}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-[11px] font-bold text-slate-800 leading-tight">{tmpl.business_name}</div>
                      {tmpl.tier && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${tierBadge[tmpl.tier] || 'bg-slate-100 text-slate-600'}`}>{tmpl.tier}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {tmpl.domain && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${domainColor[tmpl.domain] || 'bg-slate-100 text-slate-600'}`}>{tmpl.domain.replace(/_/g, ' ')}</span>}
                      <span className="text-[9px] text-slate-400">{(tmpl.steps || []).length} steps</span>
                      {tmpl.locked_steps && <span className="text-[9px] text-rose-500 font-bold ml-auto">🔒 T3 Locked</span>}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); cloneMutation.mutate(tmpl.program_id); }}
                      className="mt-2 w-full text-[10px] font-bold text-indigo-600 border border-indigo-200 rounded-lg py-1 hover:bg-indigo-50 transition-colors"
                    >Use Template →</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ================================================================
            CENTER PANEL — Formula editor (steps + form) OR detail view
        ================================================================ */}
        <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden min-w-0">

          {/* Empty state */}
          {!isCreating && !selectedProgram && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <span className="text-5xl">🧮</span>
              <p className="text-[13px] font-bold text-slate-500">Select a formula or create a new one</p>
              <p className="text-[11px] text-slate-400 max-w-sm text-center">Build formulas using fields from the Field Registry. Each step creates a named result others can reference — including Business Rules and Workflow conditions.</p>
            </div>
          )}

          {/* View mode — selected program */}
          {selectedProgram && !isCreating && !isEditing && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-100 bg-white flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-[15px] font-extrabold text-slate-800">{selectedProgram.business_name}</h2>
                    <span className="text-[10px] font-mono text-indigo-500 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">{selectedProgram.program_code}</span>
                    {selectedProgram.tier && <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${tierBadge[selectedProgram.tier] || ''}`}>{selectedProgram.tier}</span>}
                    {selectedProgram.domain && <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${domainColor[selectedProgram.domain] || ''}`}>{selectedProgram.domain.replace(/_/g, ' ')}</span>}
                    {selectedProgram.is_template && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">📚 Template</span>}
                  </div>
                  {selectedProgram.description && <p className="text-[11px] text-slate-500 mt-1">{selectedProgram.description}</p>}
                </div>
                <div className="flex gap-2">
                  {selectedProgram.is_template && (
                    <button onClick={() => cloneMutation.mutate(selectedProgram.program_id)}
                      className="px-3 py-1.5 text-[11px] font-bold text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50">
                      {cloneMutation.isPending ? 'Cloning...' : 'Use Template'}
                    </button>
                  )}
                  {!selectedProgram.locked_steps && (
                    <button onClick={() => { setIsEditing(true); setFormName(selectedProgram.business_name); setFormCode(selectedProgram.program_code); setFormDescription(selectedProgram.description || ''); setFormTier(selectedProgram.tier || 'T1'); setFormSteps(selectedProgram.steps?.length ? selectedProgram.steps : [makeStep(1)]); setFormInputs(selectedProgram.inputs?.length ? selectedProgram.inputs : [makeInput()]); setFormProductId(selectedProgram.product_id || ''); setFormSubProductId(selectedProgram.subproduct_id || ''); }}
                      className="px-3 py-1.5 text-[11px] font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Steps display */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Steps ({(selectedProgram.steps || []).length})</div>
                {(selectedProgram.steps || []).map((step: CalcStep, i: number) => (
                  <div key={i} className={`border rounded-xl p-3 ${step.is_output ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/40'}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">{step.seq}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono font-bold text-indigo-700">{step.var_name}</span>
                          <span className="text-[10px] text-slate-400">=</span>
                          <span className="text-[11px] font-mono text-slate-700 flex-1">{step.expression}</span>
                          {step.is_output && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded flex-shrink-0">↑ {step.output_token}</span>}
                        </div>
                        {step.description && <div className="text-[10px] text-slate-400 mt-0.5">{step.description}</div>}
                      </div>
                    </div>
                  </div>
                ))}

                {(selectedProgram.inputs || []).length > 0 && (
                  <>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-4 mb-2">Variable Inputs ({(selectedProgram.inputs || []).length})</div>
                    {(selectedProgram.inputs || []).map((inp: CalcInput, i: number) => (
                      <div key={i} className="flex items-center gap-3 border border-slate-200 rounded-xl p-2.5 bg-white">
                        <span className="text-[11px] font-mono font-bold text-slate-700 w-36 flex-shrink-0 truncate">{inp.name}</span>
                        <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{inp.source_type}</span>
                        {inp.source_type === 'POLICY_CONSTANT' && <span className="text-[10px] font-mono text-emerald-700">{inp.value}</span>}
                        {inp.source_type === 'RATE_FEED' && <span className="text-[10px] font-mono text-amber-700">{inp.feed_code}</span>}
                        {inp.source_type === 'DAY_COUNT' && <span className="text-[10px] font-mono text-blue-700">{inp.convention}</span>}
                        {inp.description && <span className="text-[10px] text-slate-400 truncate">{inp.description}</span>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Create / Edit form */}
          {(isCreating || isEditing) && (
            <div className="flex flex-col h-full">
              {/* Form header */}
              <div className="p-4 border-b border-slate-100 bg-white z-10">
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Formula Name *</label>
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Total Fee Calculation" className="w-full text-[12px] font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Formula Code *</label>
                    <input type="text" value={formCode} onChange={e => setFormCode(e.target.value.toUpperCase())} placeholder="e.g. FML-PAY-001" className="w-full text-[12px] font-mono font-bold text-indigo-700 border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Domain</label>
                    {/* Read-only — derived from the active Package, never user-selectable (compliance boundary) */}
                    <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${domainColor[packageDomain] || 'bg-slate-100 text-slate-500'}`}>
                        {DOMAIN_LABELS[packageDomain] || packageDomain || '—'}
                      </span>
                      <span className="text-[9px] text-slate-400 truncate">from {activeProductContext || 'package'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Complexity Tier</label>
                    <select value={formTier} onChange={e => setFormTier(e.target.value)} className="w-full text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 bg-white">
                      <option value="T1">T1 — Simple (1–2 steps)</option>
                      <option value="T2">T2 — Guided (3–8 steps)</option>
                      <option value="T3">T3 — Complex (9+ steps)</option>
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Description</label>
                  <input type="text" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="What does this program compute? Who uses it?" className="w-full text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400" />
                </div>
                <ProductSubProductPicker
                  packageId={packageId}
                  selectedProductId={formProductId}
                  selectedSubProductId={formSubProductId}
                  onProductChange={setFormProductId}
                  onSubProductChange={setFormSubProductId}
                  compact
                />
              </div>

              {/* Step editor */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Execution Steps</span>
                  <div className="flex items-center gap-2">
                    {/* Function snippets picker */}
                    <select
                      defaultValue=""
                      onChange={e => { if (e.target.value) navigator.clipboard?.writeText(e.target.value); e.target.value = ''; }}
                      className="text-[10px] border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400 bg-white"
                    >
                      <option value="">📋 Copy function...</option>
                      {FUNCTION_SNIPPETS.map(fn => <option key={fn} value={fn}>{fn}</option>)}
                    </select>
                    <button onClick={addStep} className="text-[11px] font-bold text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50">+ Add Step</button>
                  </div>
                </div>

                {formSteps.map((step, i) => (
                  <StepRow
                    key={i}
                    step={step}
                    index={i}
                    total={formSteps.length}
                    packageDomain={packageDomain}
                    onChange={(field, val) => updateStep(i, field, val)}
                    onRemove={() => removeStep(i)}
                    onMoveUp={() => moveStep(i, 'up')}
                    onMoveDown={() => moveStep(i, 'down')}
                  />
                ))}

                {formSteps.length === 0 && (
                  <div className="text-[11px] text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-xl">
                    No steps yet. Click <strong>+ Add Step</strong> to begin.
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-slate-100 bg-white flex justify-end gap-2">
                <button onClick={resetForm} className="px-4 py-1.5 text-[12px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!canSave || createMutation.isPending}
                  className="px-4 py-1.5 text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm disabled:opacity-40"
                >
                  {createMutation.isPending ? 'Saving...' : (isEditing ? 'Save Changes' : 'Create Program')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================
            RIGHT PANEL — Inputs mapper + Live Test
        ================================================================ */}
        <div className="w-[300px] glass-card rounded-2xl flex flex-col overflow-hidden flex-shrink-0">
          {/* Tab bar */}
          <div className="flex border-b border-slate-100 bg-slate-50/50">
            <button
              onClick={() => setRightPanel('inputs')}
              className={`flex-1 px-3 py-2.5 text-[11px] font-bold transition-colors ${rightPanel === 'inputs' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
            >Inputs</button>
            <button
              onClick={() => setRightPanel('test')}
              className={`flex-1 px-3 py-2.5 text-[11px] font-bold transition-colors ${rightPanel === 'test' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-white' : 'text-slate-400 hover:text-slate-600'}`}
            >▶ Live Test</button>
          </div>

          {/* Inputs panel — only in create/edit mode */}
          {rightPanel === 'inputs' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {!isCreating && !isEditing ? (
                <div className="text-[10px] text-slate-400 text-center py-8 italic">Open a program in edit mode<br/>to configure its variable sources.</div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Variable Sources</span>
                    <button onClick={() => setFormInputs(prev => [...prev, makeInput()])} className="text-[10px] font-bold text-indigo-600 border border-indigo-200 rounded-lg px-2 py-0.5 hover:bg-indigo-50">+ Add</button>
                  </div>
                  {formInputs.map((inp, i) => (
                    <InputRow key={i} input={inp} onChange={(f, v) => updateInput(i, f, v)} onRemove={() => setFormInputs(prev => prev.filter((_, j) => j !== i))} />
                  ))}
                  {formInputs.length === 0 && (
                    <div className="text-[10px] text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl italic">
                      No inputs declared.<br/>Add variable sources above.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Live Test panel */}
          {rightPanel === 'test' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {!selectedProgram ? (
                <div className="text-[10px] text-slate-400 text-center py-8 italic">Select a program to test it.</div>
              ) : (
                <>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sample Input Values</div>
                  <div className="space-y-2">
                    {(selectedProgram.inputs || []).filter((inp: any) => ['RUNTIME_INPUT', 'ISO_FIELD', 'RATE_FEED', 'FORMULA_TOKEN'].includes(inp.source_type)).map((inp: any, i: number) => (
                      <div key={i}>
                        <label className="text-[9px] font-bold text-slate-500 block mb-0.5">{inp.name} <span className="font-normal text-slate-400">({inp.source_type})</span></label>
                        <input
                          type="number"
                          value={testValues[inp.name] ?? ''}
                          onChange={e => setTestValues(prev => ({ ...prev, [inp.name]: e.target.value }))}
                          placeholder="Enter test value..."
                          className="w-full text-[11px] font-mono border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"
                        />
                      </div>
                    ))}
                    {(selectedProgram.inputs || []).filter((inp: any) => inp.source_type === 'DAY_COUNT').map((inp: any, i: number) => (
                      <div key={`dc-${i}`} className="space-y-1">
                        <div className="text-[9px] font-bold text-slate-500">{inp.name} — {inp.convention}</div>
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <label className="text-[8px] text-slate-400 block">Start Date</label>
                            <input type="date" value={testValues[`${inp.name}_START`] ?? ''} onChange={e => setTestValues(prev => ({ ...prev, [`${inp.name}_START`]: e.target.value }))}
                              className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-1 outline-none focus:border-indigo-400" />
                          </div>
                          <div>
                            <label className="text-[8px] text-slate-400 block">End Date</label>
                            <input type="date" value={testValues[`${inp.name}_END`] ?? ''} onChange={e => setTestValues(prev => ({ ...prev, [`${inp.name}_END`]: e.target.value }))}
                              className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-1 outline-none focus:border-indigo-400" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={runTest}
                    disabled={testLoading}
                    className="w-full py-2 text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm disabled:opacity-40"
                  >
                    {testLoading ? 'Running...' : '▶ Run Test'}
                  </button>

                  {/* Step-by-step results */}
                  {testResult && (
                    <div className="space-y-2">
                      <div className={`text-[10px] font-bold px-2 py-1 rounded ${testResult.status === 'SUCCESS' ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
                        {testResult.status} {testResult.execution_time_ms ? `— ${testResult.execution_time_ms}ms` : ''}
                      </div>
                      {testResult.error && <div className="text-[10px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{testResult.error}</div>}
                      {(testResult.step_results || []).map((s: any) => (
                        <div key={s.seq} className={`border rounded-lg p-2 ${s.is_output ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black text-indigo-600 w-4">#{s.seq}</span>
                            <span className="text-[10px] font-mono font-bold text-slate-700">{s.var_name}</span>
                            <span className="text-[9px] text-slate-400">=</span>
                            <span className="text-[11px] font-mono font-bold text-emerald-700 ml-auto">{typeof s.result === 'number' ? s.result.toLocaleString(undefined, { maximumFractionDigits: 6 }) : s.result}</span>
                            {s.is_output && <span className="text-[8px] font-bold text-emerald-600">↑</span>}
                          </div>
                          <div className="text-[8px] text-slate-400 font-mono mt-0.5 truncate">{s.expression}</div>
                        </div>
                      ))}
                      {testResult.outputs && Object.keys(testResult.outputs).length > 0 && (
                        <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50">
                          <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-2">Published Outputs</div>
                          {Object.entries(testResult.outputs).map(([token, val]: [string, any]) => (
                            <div key={token} className="flex justify-between items-center py-0.5">
                              <span className="text-[10px] font-mono font-bold text-slate-700">{token}</span>
                              <span className="text-[11px] font-mono font-black text-emerald-700">{typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 6 }) : val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
