// WHY THIS FILE EXISTS:
// API Designer Studio — lets business ops configure outbound API integrations
// without writing code. Every external system call (SWIFT GPI, Core Banking,
// RTGS, Sanctions screening) is defined here as a blueprint.
//
// CRITICAL: These are not just URL configs. Each integration enforces:
//   - Rate limiting (token bucket, prevents vendor throttling)
//   - Circuit breaking (stops cascade failures when external API goes down)
//   - PII masking (auto-strips sensitive fields before sending outbound)
//
// WHY SLIDERS not number inputs: A bank ops user doesn't know what "10 rps" means
// in isolation. A slider with labeled presets (Conservative / Standard / Aggressive)
// gives context. The number is shown alongside the slider for precision.
//
// WHAT BREAKS IF REMOVED: The Workflow Engine has no way to call external APIs.
// SWIFT payment tracking, core banking settlement confirmation, sanctions screening
// — all of these are API calls configured here. Remove this and payments cannot settle.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';
import { useToast, ToastContainer } from '../../components/Toast';
import { Zap, Shield, Clock, CheckCircle, Activity } from 'lucide-react';

// Labeled slider — replaces bare number inputs for rate limit and circuit breaker.
// Shows the value + a contextual label so a non-technical user understands the setting.
const LabeledSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit: string;
  presets: { v: number; label: string }[];
  helpText: string;
  icon: React.ReactNode;
}> = ({ label, value, min, max, step, onChange, unit, presets, helpText, icon }) => {
  const pct = ((value - min) / (max - min)) * 100;
  const activePreset = presets.find(p => p.v === value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          {icon}{label}
        </label>
        <div className="flex items-center gap-2">
          {activePreset && (
            <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{activePreset.label}</span>
          )}
          <span className="text-[13px] font-extrabold text-slate-800">{value}<span className="text-[10px] font-bold text-slate-400 ml-0.5">{unit}</span></span>
        </div>
      </div>

      {/* Track + thumb */}
      <div className="relative h-6 flex items-center">
        <div className="relative w-full h-1.5 bg-slate-100 rounded-full">
          <div className="absolute h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute w-full h-full opacity-0 cursor-pointer"
        />
        {/* Thumb indicator */}
        <div
          className="absolute w-4 h-4 bg-indigo-600 rounded-full border-2 border-white shadow-md pointer-events-none transition-all"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>

      {/* Preset labels */}
      <div className="flex justify-between">
        {presets.map(p => (
          <button
            key={p.v}
            onClick={() => onChange(p.v)}
            className={`text-[9px] font-bold transition-colors ${value === p.v ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}
          >{p.label}</button>
        ))}
      </div>

      <p className="text-[10px] text-slate-400">{helpText}</p>
    </div>
  );
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  POST: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PUT: 'bg-amber-50 text-amber-700 border-amber-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
  PATCH: 'bg-violet-50 text-violet-700 border-violet-200',
};

export const ApiDesignerStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeCoreProductId } = usePlatformStore();
  const { toasts, showToast, dismissToast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedApi, setSelectedApi] = useState<any>(null);

  // Form State
  const [apiName, setApiName] = useState('');
  const [httpMethod, setHttpMethod] = useState('POST');
  const [urlTemplate, setUrlTemplate] = useState('');
  const [description, setDescription] = useState('');
  const [rateLimitRps, setRateLimitRps] = useState(10);
  const [circuitBreakerThreshold, setCircuitBreakerThreshold] = useState(5);
  const [circuitBreakerTimeout, setCircuitBreakerTimeout] = useState(60);
  const [maskPiiInBody, setMaskPiiInBody] = useState(true);

  const { data: integrationsData, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await apiClient.get('/integrations/')).data,
  });

  const resetForm = () => {
    setApiName(''); setHttpMethod('POST'); setUrlTemplate(''); setDescription('');
    setRateLimitRps(10); setCircuitBreakerThreshold(5); setCircuitBreakerTimeout(60);
    setMaskPiiInBody(true);
  };

  const createApiMutation = useMutation({
    mutationFn: async () => {
      const payload = { api_name: apiName, http_method: httpMethod, url_template: urlTemplate, description, rate_limit_rps: rateLimitRps, circuit_breaker_threshold: circuitBreakerThreshold, circuit_breaker_timeout_sec: circuitBreakerTimeout, mask_pii_in_body: maskPiiInBody };
      return (await apiClient.post('/integrations/', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      showToast(`Integration "${apiName}" saved successfully.`, 'success');
      setIsCreating(false);
      resetForm();
    },
    onError: (err: any) => showToast(err.response?.data?.detail || 'Failed to save integration.', 'error'),
  });

  return (
    <div className="flex flex-col w-full h-[800px]">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <CockpitLockBanner />
      <div className={`flex gap-6 flex-1 min-h-0 transition-all duration-300 ${!activeCoreProductId ? 'opacity-30 pointer-events-none grayscale' : ''}`}>

        {/* ── LEFT: API List ── */}
        <div className="w-[380px] glass-card rounded-2xl flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight">Integration Hub</h2>
              <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">Outbound API blueprints</p>
            </div>
            <button
              onClick={() => { setIsCreating(true); setSelectedApi(null); resetForm(); }}
              className="bg-indigo-600 text-white px-3.5 py-1.5 rounded-xl text-[11px] font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-[0.97]"
            >
              + New Integration
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading ? (
              <div className="flex justify-center mt-10">
                <div className="w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
              </div>
            ) : integrationsData?.integrations?.map((api: any) => (
              <div
                key={api.api_id}
                onClick={() => { setSelectedApi(api); setIsCreating(false); }}
                className={`p-4 border rounded-xl cursor-pointer transition-all ${
                  selectedApi?.api_id === api.api_id
                    ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="text-[12px] font-bold text-slate-800 leading-snug">{api.api_name}</div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ml-2 ${METHOD_COLORS[api.http_method] || METHOD_COLORS.GET}`}>
                    {api.http_method}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">{api.url_template}</div>
                <div className="flex items-center gap-3 mt-2">
                  <span className="flex items-center gap-1 text-[9px] text-slate-400"><Zap size={9} />{api.rate_limit_rps || 10} rps</span>
                  <span className="flex items-center gap-1 text-[9px] text-slate-400"><Activity size={9} />trips at {api.circuit_breaker_threshold || 5} fails</span>
                  {api.mask_pii_in_body && <span className="flex items-center gap-1 text-[9px] text-emerald-600"><Shield size={9} />PII masked</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Canvas ── */}
        <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">

          {/* Empty state */}
          {!isCreating && !selectedApi && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4 shadow-inner">
                <Zap size={28} className="text-indigo-300" />
              </div>
              <p className="text-[13px] font-bold text-slate-500 mb-1">Configure an API Integration</p>
              <p className="text-[11px] text-slate-400">Select an existing integration or create a new one.</p>
            </div>
          )}

          {/* View existing */}
          {!isCreating && selectedApi && (
            <div className="flex flex-col h-full animate-fade-in">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-[15px] font-extrabold text-slate-800">{selectedApi.api_name}</h2>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${METHOD_COLORS[selectedApi.http_method] || METHOD_COLORS.GET}`}>
                      {selectedApi.http_method}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-indigo-600">{selectedApi.url_template}</div>
                </div>
                <button
                  onClick={() => { setIsCreating(true); setSelectedApi(null); }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[12px] font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20"
                >
                  Edit
                </button>
              </div>
              <div className="p-6 flex-1 overflow-y-auto space-y-4">
                {selectedApi.description && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Purpose</div>
                    <p className="text-[13px] text-slate-700">{selectedApi.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Rate Limit', value: `${selectedApi.rate_limit_rps} rps`, icon: <Zap size={14} className="text-indigo-500" /> },
                    { label: 'Circuit Trips At', value: `${selectedApi.circuit_breaker_threshold} fails`, icon: <Activity size={14} className="text-amber-500" /> },
                    { label: 'Cooldown', value: `${selectedApi.circuit_breaker_timeout_sec}s`, icon: <Clock size={14} className="text-blue-500" /> },
                  ].map(kv => (
                    <div key={kv.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">{kv.icon}<span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kv.label}</span></div>
                      <div className="text-[16px] font-extrabold text-slate-800">{kv.value}</div>
                    </div>
                  ))}
                </div>
                {selectedApi.mask_pii_in_body && (
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <Shield size={16} className="text-emerald-600" />
                    <div>
                      <div className="text-[12px] font-bold text-emerald-800">Dynamic PII Masking Active</div>
                      <div className="text-[10px] text-emerald-600">ISO-tagged PII fields are automatically stripped from outbound payloads before transmission.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Create form */}
          {isCreating && (
            <div className="flex flex-col h-full animate-slide-in-right">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-[15px] font-extrabold text-slate-800">Design API Integration</h2>
                <p className="text-[11px] text-slate-400 mt-1">Configure endpoint, fault-tolerance guardrails, and PII protection.</p>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-6">
                {/* Endpoint */}
                <div className="grid grid-cols-[1fr_120px] gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Integration Name *</label>
                    <input
                      type="text"
                      value={apiName}
                      onChange={e => setApiName(e.target.value)}
                      placeholder="e.g., SWIFT GPI Payment Tracker"
                      className="w-full text-[13px] font-semibold border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-400 outline-none shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">HTTP Method</label>
                    <select
                      value={httpMethod}
                      onChange={e => setHttpMethod(e.target.value)}
                      className="w-full text-[12px] font-bold border border-slate-200 bg-white rounded-xl p-2.5 outline-none"
                    >
                      {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Endpoint URL Template</label>
                  <input
                    type="text"
                    value={urlTemplate}
                    onChange={e => setUrlTemplate(e.target.value)}
                    placeholder="https://api.swift.com/v1/gpi/payments/{InstructedAmount}"
                    className="w-full font-mono text-[12px] text-indigo-700 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-400 outline-none shadow-sm"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Use {'{ISO_field_name}'} to inject live values from the ISO Registry at runtime.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Business Purpose</label>
                  <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What does this integration do and when is it called?"
                    className="w-full text-[13px] border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-400 outline-none shadow-sm"
                  />
                </div>

                {/* Fault Tolerance sliders */}
                <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-5 space-y-6">
                  <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Enterprise Fault-Tolerance Guardrails</div>

                  <LabeledSlider
                    label="Rate Limit"
                    value={rateLimitRps}
                    min={1} max={200} step={1}
                    onChange={setRateLimitRps}
                    unit=" req/s"
                    icon={<Zap size={10} />}
                    presets={[
                      { v: 1, label: 'Conservative' },
                      { v: 10, label: 'Standard' },
                      { v: 50, label: 'High' },
                      { v: 200, label: 'Aggressive' },
                    ]}
                    helpText="Maximum requests per second. Enforced via token bucket across all Celery workers. Prevents vendor throttling."
                  />

                  <LabeledSlider
                    label="Circuit Breaker — Opens After"
                    value={circuitBreakerThreshold}
                    min={1} max={20} step={1}
                    onChange={setCircuitBreakerThreshold}
                    unit=" fails"
                    icon={<Activity size={10} />}
                    presets={[
                      { v: 2, label: 'Sensitive' },
                      { v: 5, label: 'Standard' },
                      { v: 10, label: 'Tolerant' },
                      { v: 20, label: 'Permissive' },
                    ]}
                    helpText="Circuit opens after this many consecutive failures. Protects internal thread pools from cascading downstream outages."
                  />

                  <LabeledSlider
                    label="Circuit Cooldown Period"
                    value={circuitBreakerTimeout}
                    min={10} max={300} step={10}
                    onChange={setCircuitBreakerTimeout}
                    unit="s"
                    icon={<Clock size={10} />}
                    presets={[
                      { v: 10, label: '10s' },
                      { v: 60, label: '1 min' },
                      { v: 120, label: '2 min' },
                      { v: 300, label: '5 min' },
                    ]}
                    helpText="How long the circuit stays open before attempting a half-open probe request to test recovery."
                  />
                </div>

                {/* PII toggle */}
                <button
                  onClick={() => setMaskPiiInBody(!maskPiiInBody)}
                  className={`w-full flex items-center gap-4 p-4 border-2 rounded-xl transition-all text-left ${
                    maskPiiInBody
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${maskPiiInBody ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    <Shield size={18} className={maskPiiInBody ? 'text-emerald-600' : 'text-slate-400'} />
                  </div>
                  <div className="flex-1">
                    <div className={`text-[13px] font-bold ${maskPiiInBody ? 'text-emerald-800' : 'text-slate-600'}`}>
                      Dynamic PII Masking {maskPiiInBody ? '— ENABLED' : '— DISABLED'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      When enabled, ISO-tagged PII fields are automatically redacted from outbound request bodies before transmission. Required for compliance.
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full transition-all flex-shrink-0 ${maskPiiInBody ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm m-0.5 transition-all ${maskPiiInBody ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                <button onClick={() => { setIsCreating(false); resetForm(); }} className="px-5 py-2.5 text-[13px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-[0.98]">
                  Cancel
                </button>
                <button
                  disabled={createApiMutation.isPending || !apiName || !urlTemplate}
                  onClick={() => createApiMutation.mutate()}
                  className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 active:scale-[0.98]"
                >
                  {createApiMutation.isPending ? 'Saving...' : <><CheckCircle size={14} /> Save Integration</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
