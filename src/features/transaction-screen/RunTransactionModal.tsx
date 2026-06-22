// WHY THIS COMPONENT EXISTS:
// This is the "fire the gun" button for the entire InfinityProductOS platform.
// It lets an operator pick any workflow template, fill in the core ISO 20022 fields,
// and submit a real execution — proving that every studio (Rules, Calc, API, Approval,
// Reconciliation) is actually wired together and fires in tandem, not just in isolation.
//
// On submit it POST /api/v1/workflows/{id}/execute and receives an instance_id.
// The parent component immediately loads that instance_id in the metro tracker so
// the operator can watch the transaction move in real-time: green nodes as each step
// completes, amber at approval pauses, red if a rule blocks.
//
// WHAT BREAKS IF REMOVED: There is no other way to initiate a workflow execution
// from the UI. Operators would have to curl the backend directly.

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface RunTransactionModalProps {
  onClose: () => void;
  onInstanceCreated: (instanceId: string) => void;
}

// Pre-built payload templates per workflow type so the operator doesn't have to
// know the ISO 20022 field structure. Each template is the minimum valid context
// the workflow engine needs to run without missing-field warnings.
const buildPayload = (
  workflowId: string,
  amount: number,
  currency: string,
  beneficiaryBic: string,
  beneficiaryName: string,
  fxRate: number,
  valueDate: string,
) => {
  // Core ISO 20022 pacs.008 structure — the golden path and most Payment Hub
  // workflows expect this shape. Non-payment workflows receive it as a no-op.
  const base = {
    FIToFICstmrCdtTrf: {
      CdtTrfTxInf: {
        InstdAmt:          { Amt: amount, Ccy: currency },
        CdtrAgt:           { FinInstnId: { BICFI: beneficiaryBic } },
        Cdtr:              { Nm: beneficiaryName },
        IntrBkSttlmDt:     valueDate,
        CdtrAcct:          { Id: `GB29NWBK60161331926819` }, // demo IBAN
      },
    },
    // FX fields for the FX Rate Enrichment node
    XchgRate:            fxRate,
    FX_TIMESTAMP:        new Date(Date.now() - 60_000).toISOString(), // 1 min ago — fresh
    // Document gates
    PAYMENT_INSTRUCTION: true,
    COMPLIANCE_CLEARANCE: true,
    SETTLEMENT_CONFIRMATION: false, // only present after NODE-05 fires
    // Misc context
    Message: { ID: `MSG-${Date.now()}` },
    nostro_account_number: 'GB12BARX20714700000000',
  };
  return base;
};

type RunStep = 'form' | 'running' | 'done' | 'error';

export const RunTransactionModal: React.FC<RunTransactionModalProps> = ({
  onClose, onInstanceCreated,
}) => {
  // ── form state ──────────────────────────────────────────────────────────
  const [workflowId,      setWorkflowId]      = useState('WF-ECC2B272');
  const [amount,          setAmount]          = useState('592500');
  const [currency,        setCurrency]        = useState('USD');
  const [beneficiaryBic,  setBeneficiaryBic]  = useState('BARCGB22');
  const [beneficiaryName, setBeneficiaryName] = useState('Acme Corp Ltd');
  const [fxRate,          setFxRate]          = useState('0.7923');
  const [valueDate,       setValueDate]       = useState(
    new Date().toISOString().slice(0, 10),
  );

  const [step,   setStep]   = useState<RunStep>('form');
  const [result, setResult] = useState<any>(null);
  const [errMsg, setErrMsg] = useState('');

  // Load available workflows for the picker
  const { data: workflowsData } = useQuery({
    queryKey: ['workflows-list-for-run'],
    queryFn: async () => {
      const res = await apiClient.get('/workflows/');
      return res.data;
    },
  });
  const workflows: any[] = workflowsData ?? [];

  const executeMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(
        workflowId,
        parseFloat(amount),
        currency,
        beneficiaryBic.toUpperCase(),
        beneficiaryName,
        parseFloat(fxRate),
        valueDate,
      );
      const res = await apiClient.post(`/workflows/${workflowId}/execute`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
    },
    onError: (err: any) => {
      setErrMsg(err?.response?.data?.detail || String(err));
      setStep('error');
    },
  });

  const handleRun = () => {
    if (!workflowId || !amount) return;
    setStep('running');
    executeMutation.mutate();
  };

  const handleViewInstance = () => {
    if (result?.instance_id) {
      onInstanceCreated(result.instance_id);
      onClose();
    }
  };

  // ── status colours matching metro tracker palette ────────────────────────
  const statusColor: Record<string, string> = {
    COMPLETED: 'text-green-700 bg-green-50 border-green-200',
    PAUSED:    'text-amber-700 bg-amber-50 border-amber-200',
    REJECTED:  'text-red-700 bg-red-50 border-red-200',
    CANCELLED: 'text-purple-700 bg-purple-50 border-purple-200',
    FAILED:    'text-red-700 bg-red-50 border-red-200',
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600">
          <div>
            <h2 className="text-sm font-extrabold text-white">▶ Run New Transaction</h2>
            <p className="text-[11px] text-indigo-100 mt-0.5">
              Execute a workflow end-to-end and watch it on the metro tracker
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg font-bold">✕</button>
        </div>

        <div className="p-6">
          {/* ── FORM ── */}
          {step === 'form' && (
            <div className="space-y-4">
              {/* Workflow picker */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Workflow Template
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
              </div>

              {/* Amount + Currency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Amount
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="592500"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-800 focus:outline-none focus:border-indigo-400"
                  />
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    &gt; 500,000 triggers AML rule · &gt; 500,000 pauses for 4-Eye approval
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-800 focus:outline-none focus:border-indigo-400"
                  >
                    {['USD','EUR','GBP','JPY','CHF','AUD','CAD','SGD'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Beneficiary */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Beneficiary BIC
                  </label>
                  <input
                    value={beneficiaryBic}
                    onChange={e => setBeneficiaryBic(e.target.value)}
                    placeholder="BARCGB22"
                    maxLength={11}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono text-slate-800 focus:outline-none focus:border-indigo-400"
                  />
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    Use OFAC-HIT-BIC to trigger OFAC block
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Beneficiary Name
                  </label>
                  <input
                    value={beneficiaryName}
                    onChange={e => setBeneficiaryName(e.target.value)}
                    placeholder="Acme Corp Ltd"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-800 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* FX Rate + Value Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    FX Rate (to GBP)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={fxRate}
                    onChange={e => setFxRate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-mono text-slate-800 focus:outline-none focus:border-indigo-400"
                  />
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    Used by FX_CONVERTED_AMOUNT formula
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Value Date
                  </label>
                  <input
                    type="date"
                    value={valueDate}
                    onChange={e => setValueDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] text-slate-800 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* Hint banner */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-[10px] text-indigo-700">
                <strong>What will fire:</strong> AML rule → OFAC screening → FX stale check →
                FX conversion calc → 4-Eye approval pause → SWIFT GPI API → RTGS settlement API
              </div>

              <button
                onClick={handleRun}
                disabled={!workflowId || !amount}
                className="w-full py-3 rounded-xl text-[13px] font-extrabold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] disabled:opacity-40"
              >
                ▶ Execute Transaction
              </button>
            </div>
          )}

          {/* ── RUNNING ── */}
          {step === 'running' && (
            <div className="py-10 flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-800">Executing workflow…</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Rules → Calculations → APIs → Approval gate
                </p>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && result && (
            <div className="space-y-4">
              {/* Status badge */}
              <div className={`flex items-center gap-3 p-3 rounded-xl border font-bold text-sm ${
                statusColor[result.status] || 'text-slate-700 bg-slate-50 border-slate-200'
              }`}>
                <span className="text-lg">
                  {result.status === 'COMPLETED' ? '✓' :
                   result.status === 'PAUSED'    ? '⏸' :
                   result.status === 'REJECTED'  ? '✕' :
                   result.status === 'CANCELLED' ? '⊘' : '!'}
                </span>
                <div>
                  <div className="font-extrabold">{result.status}</div>
                  {result.blocked_at_node && (
                    <div className="text-[11px] font-normal">Blocked at: {result.blocked_at_node}</div>
                  )}
                  {result.status === 'PAUSED' && (
                    <div className="text-[11px] font-normal">Awaiting 4-Eye approval — use Approve button in tracker</div>
                  )}
                </div>
              </div>

              {/* Instance ID */}
              {result.instance_id && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Instance ID</p>
                  <p className="text-[12px] font-mono font-bold text-indigo-700">{result.instance_id}</p>
                </div>
              )}

              {/* Execution trace preview */}
              <div className="bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Trace</p>
                {(result.trace || []).map((line: string, i: number) => (
                  <p key={i} className={`text-[10px] font-mono leading-relaxed ${
                    line.includes('[ERROR]') || line.includes('[REJECTED]') ? 'text-red-400' :
                    line.includes('[WARN]')                                 ? 'text-amber-400' :
                    line.includes('COMPLETED') || line.includes('✓')       ? 'text-green-400' :
                    line.includes('PAUSED') || line.includes('APPROVAL')   ? 'text-amber-300' :
                    'text-slate-300'
                  }`}>{line}</p>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {result.instance_id && (
                  <button
                    onClick={handleViewInstance}
                    className="flex-1 py-2.5 rounded-xl text-[12px] font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                  >
                    View on Metro Tracker →
                  </button>
                )}
                <button
                  onClick={() => { setStep('form'); setResult(null); }}
                  className="px-4 py-2.5 rounded-xl text-[12px] font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
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
                <p className="text-[11px] text-red-600 font-mono">{errMsg}</p>
              </div>
              <button
                onClick={() => { setStep('form'); setErrMsg(''); }}
                className="w-full py-2.5 rounded-xl text-[12px] font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
