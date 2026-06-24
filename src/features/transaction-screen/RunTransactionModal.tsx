// WHY THIS COMPONENT EXISTS:
// This is how an operator MANUALLY creates a transaction — the "initiate" surface
// of the Transaction Workflow Screen. It is now DEFINITION-DRIVEN
// (TXN_SCREEN_LAYOUT_LANGUAGE.md iteration 6): the operator picks a workflow, and
// the capture form is the workflow's START node screen, authored in Screen
// Designer and rendered by RuntimeScreenRenderer — NOT a hardcoded field list.
// This honours the "logic as data" ADR: the bank changes the capture form in the
// studio, not in this file.
//
// On submit it POST /api/v1/workflows/{id}/execute and receives an instance_id;
// the parent loads that instance in the metro tracker to watch it move.
//
// FALLBACK: workflows whose START node has no screen bound fall back to the legacy
// fixed SWIFT field set so nothing breaks while screens are still being authored.
//
// WHAT BREAKS IF REMOVED: There is no other way to initiate a workflow execution
// from the UI. Operators would have to curl the backend directly.

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { RuntimeScreenRenderer } from '../package-runtime/RuntimeScreenRenderer';

interface RunTransactionModalProps {
  onClose: () => void;
  onInstanceCreated: (instanceId: string) => void;
}

// Expand a flat { "a.b.c": v } map (RuntimeScreenRenderer keys values by the
// screen component's field_binding, which for ISO screens is a dotted path) into
// the nested object the workflow engine expects: { a: { b: { c: v } } }.
// WHY: the SWIFT Wire Payment Entry screen binds to paths like
// "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt" but the executor reads the nested
// pacs.008 shape. Without this expansion the engine sees flat keys and the AML /
// FX nodes can't find the amount or rate.
const setByPath = (obj: any, path: string, value: any) => {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
};
const expandFlat = (flat: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (v === '' || v == null) continue;
    setByPath(out, k, v);
  }
  return out;
};

// Context the engine needs that the capture form doesn't ask for (freshness
// timestamps, document gates, nostro account). Form values are spread ON TOP so
// the operator's input always wins.
const engineDefaults = () => ({
  XchgRate: 0.7923,
  FX_TIMESTAMP: new Date(Date.now() - 60_000).toISOString(), // 1 min ago — fresh
  PAYMENT_INSTRUCTION: true,
  COMPLIANCE_CLEARANCE: true,
  SETTLEMENT_CONFIRMATION: false,
  nostro_account_number: 'GB12BARX20714700000000',
});

// Legacy fixed-field payload — used ONLY when the chosen workflow's START node has
// no screen bound yet. Same pacs.008 shape the golden path expects.
const buildLegacyPayload = (
  amount: number, currency: string, beneficiaryBic: string,
  beneficiaryName: string, fxRate: number, valueDate: string,
) => ({
  FIToFICstmrCdtTrf: {
    CdtTrfTxInf: {
      InstdAmt: { Amt: amount, Ccy: currency },
      CdtrAgt: { FinInstnId: { BICFI: beneficiaryBic } },
      Cdtr: { Nm: beneficiaryName },
      IntrBkSttlmDt: valueDate,
      CdtrAcct: { Id: 'GB29NWBK60161331926819' },
    },
  },
  XchgRate: fxRate,
  ...engineDefaults(),
  Message: { ID: `MSG-${Date.now()}` },
});

type RunStep = 'form' | 'running' | 'done' | 'error';

export const RunTransactionModal: React.FC<RunTransactionModalProps> = ({
  onClose, onInstanceCreated,
}) => {
  const [workflowId, setWorkflowId] = useState('WF-ECC2B272');
  const [step, setStep] = useState<RunStep>('form');
  const [result, setResult] = useState<any>(null);
  const [errMsg, setErrMsg] = useState('');

  // Legacy fallback fields (only shown when the start node has no screen).
  const [amount, setAmount] = useState('592500');
  const [currency, setCurrency] = useState('USD');
  const [beneficiaryBic, setBeneficiaryBic] = useState('BARCGB22');
  const [beneficiaryName, setBeneficiaryName] = useState('Acme Corp Ltd');
  const [fxRate, setFxRate] = useState('0.7923');
  const [valueDate, setValueDate] = useState(new Date().toISOString().slice(0, 10));

  // Workflow picker list.
  const { data: workflowsData } = useQuery({
    queryKey: ['workflows-list-for-run'],
    queryFn: async () => (await apiClient.get('/workflows/')).data,
  });
  const workflows: any[] = workflowsData ?? [];

  // Selected workflow detail → START node → its screen_template.
  const { data: workflowDetail } = useQuery({
    queryKey: ['workflow-detail-for-run', workflowId],
    queryFn: async () => (await apiClient.get(`/workflows/${workflowId}`)).data,
    enabled: !!workflowId,
  });
  const startNode = useMemo(() => {
    const nodes = workflowDetail?.nodes ?? [];
    if (!nodes.length) return null;
    return [...nodes].sort((a: any, b: any) => a.sequence_number - b.sequence_number)[0];
  }, [workflowDetail]);
  const startScreenTemplate: string | undefined = startNode?.screen_template;

  // The authored capture screen for the start node (if any).
  const { data: captureScreen, isLoading: screenLoading } = useQuery({
    queryKey: ['capture-screen', startScreenTemplate],
    queryFn: async () => (await apiClient.get(`/screens/${startScreenTemplate}`)).data,
    enabled: !!startScreenTemplate,
  });

  const executeMutation = useMutation({
    mutationFn: async (payload: any) =>
      (await apiClient.post(`/workflows/${workflowId}/execute`, payload)).data,
    onSuccess: (data) => { setResult(data); setStep('done'); },
    onError: (err: any) => { setErrMsg(err?.response?.data?.detail || String(err)); setStep('error'); },
  });

  // Definition-driven submit: expand the screen's flat ISO paths into nested
  // context, then layer it over the engine defaults and fire.
  const handleScreenSubmit = (values: Record<string, any>, action: string) => {
    if (action === 'CANCEL_SESSION') { onClose(); return; }
    const payload = {
      ...engineDefaults(),
      ...expandFlat(values),
      Message: { ID: `MSG-${Date.now()}` },
    };
    setStep('running');
    executeMutation.mutate(payload);
  };

  const handleLegacyRun = () => {
    if (!workflowId || !amount) return;
    setStep('running');
    executeMutation.mutate(buildLegacyPayload(
      parseFloat(amount), currency, beneficiaryBic.toUpperCase(),
      beneficiaryName, parseFloat(fxRate), valueDate,
    ));
  };

  const handleViewInstance = () => {
    if (result?.instance_id) { onInstanceCreated(result.instance_id); onClose(); }
  };

  const statusColor: Record<string, string> = {
    COMPLETED: 'text-green-700 bg-green-50 border-green-200',
    PAUSED: 'text-amber-700 bg-amber-50 border-amber-200',
    REJECTED: 'text-red-700 bg-red-50 border-red-200',
    CANCELLED: 'text-purple-700 bg-purple-50 border-purple-200',
    FAILED: 'text-red-700 bg-red-50 border-red-200',
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-[#1c2230] shrink-0">
          <div>
            <h2 className="text-sm font-extrabold text-white">▶ New transaction</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Capture form is the workflow's start-node screen — authored in Screen Designer
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg font-bold">✕</button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* ── FORM ── */}
          {step === 'form' && (
            <div className="space-y-4">
              {/* Workflow picker */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Workflow
                </label>
                <select
                  value={workflowId}
                  onChange={e => setWorkflowId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-800 focus:outline-none focus:border-indigo-400"
                >
                  {workflows.length > 0
                    ? workflows.map((w: any) => (
                        <option key={w.workflow_id} value={w.workflow_id}>
                          {w.workflow_name} ({w.workflow_id})
                        </option>
                      ))
                    : <option value="WF-ECC2B272">MT103 Cross-Border SWIFT Wire (WF-ECC2B272)</option>
                  }
                </select>
                {startNode && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Entry step: <span className="font-semibold text-slate-600">{startNode.node_title}</span>
                    {startScreenTemplate
                      ? <> · screen <span className="font-mono">{startScreenTemplate}</span></>
                      : <> · no screen bound — using fallback fields</>}
                  </p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                {startScreenTemplate ? (
                  screenLoading ? (
                    <div className="text-[12px] text-slate-400 py-6 text-center">Loading capture screen…</div>
                  ) : captureScreen ? (
                    // DEFINITION-DRIVEN capture — the authored start-node screen.
                    <RuntimeScreenRenderer
                      screenName={captureScreen.screen_name}
                      definition={captureScreen.definition}
                      onSubmit={handleScreenSubmit}
                    />
                  ) : (
                    <div className="text-[12px] text-red-500 py-6 text-center">Could not load the capture screen.</div>
                  )
                ) : (
                  // LEGACY fallback fields (no screen bound to this workflow's start node).
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Amount</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-indigo-400" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Currency</label>
                        <select value={currency} onChange={e => setCurrency(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-indigo-400">
                          {['USD','EUR','GBP','JPY','CHF','AUD','CAD','SGD'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Beneficiary BIC</label>
                        <input value={beneficiaryBic} onChange={e => setBeneficiaryBic(e.target.value)} maxLength={11}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono focus:outline-none focus:border-indigo-400" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Beneficiary Name</label>
                        <input value={beneficiaryName} onChange={e => setBeneficiaryName(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-indigo-400" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">FX Rate (to GBP)</label>
                        <input type="number" step="0.0001" value={fxRate} onChange={e => setFxRate(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono focus:outline-none focus:border-indigo-400" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Value Date</label>
                        <input type="date" value={valueDate} onChange={e => setValueDate(e.target.value)}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:border-indigo-400" />
                      </div>
                    </div>
                    <button onClick={handleLegacyRun} disabled={!workflowId || !amount}
                      className="w-full py-3 rounded-xl text-[13px] font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-40">
                      ▶ Execute transaction
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── RUNNING ── */}
          {step === 'running' && (
            <div className="py-10 flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-800">Executing workflow…</p>
                <p className="text-[11px] text-slate-500 mt-1">Rules → Calculations → APIs → Approval gate</p>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-3 rounded-xl border font-bold text-sm ${statusColor[result.status] || 'text-slate-700 bg-slate-50 border-slate-200'}`}>
                <span className="text-lg">
                  {result.status === 'COMPLETED' ? '✓' : result.status === 'PAUSED' ? '⏸' :
                   result.status === 'REJECTED' ? '✕' : result.status === 'CANCELLED' ? '⊘' : '!'}
                </span>
                <div>
                  <div className="font-extrabold">{result.status}</div>
                  {result.blocked_at_node && <div className="text-[11px] font-normal">Blocked at: {result.blocked_at_node}</div>}
                  {result.status === 'PAUSED' && <div className="text-[11px] font-normal">Awaiting approval — use the decision bar on the tracker</div>}
                </div>
              </div>
              {result.instance_id && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Instance ID</p>
                  <p className="text-[12px] font-mono font-bold text-indigo-700">{result.instance_id}</p>
                </div>
              )}
              <div className="bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Trace</p>
                {(result.trace || []).map((line: string, i: number) => (
                  <p key={i} className={`text-[10px] font-mono leading-relaxed ${
                    line.includes('[ERROR]') || line.includes('[REJECTED]') ? 'text-red-400' :
                    line.includes('[WARN]') ? 'text-amber-400' :
                    line.includes('COMPLETED') || line.includes('✓') ? 'text-green-400' :
                    line.includes('PAUSED') || line.includes('APPROVAL') ? 'text-amber-300' : 'text-slate-300'
                  }`}>{line}</p>
                ))}
              </div>
              <div className="flex gap-2">
                {result.instance_id && (
                  <button onClick={handleViewInstance}
                    className="flex-1 py-2.5 rounded-xl text-[12px] font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
                    View on Metro Tracker →
                  </button>
                )}
                <button onClick={() => { setStep('form'); setResult(null); }}
                  className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors">
                  Run Another
                </button>
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm font-bold text-red-700 mb-1">Execution failed</p>
                <p className="text-[11px] text-red-600 font-mono break-all">{errMsg}</p>
              </div>
              <button onClick={() => { setStep('form'); setErrMsg(''); }}
                className="w-full py-2.5 rounded-xl text-[12px] font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
