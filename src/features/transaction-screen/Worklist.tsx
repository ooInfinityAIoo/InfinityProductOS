// WHY THIS COMPONENT EXISTS (TXN_SCREEN_LAYOUT_LANGUAGE.md iteration 7):
// Real transaction-banking operators don't live in a single record — they live in
// QUEUES. This is the worklist landing for the Transaction Workflow Screen: the
// operator lands here, picks a queue (Pending approval / Repair / Rejected /
// Completed / All), and opens a row to drill into the record workspace. It is the
// "Back to My Deals" surface from the StructuredFlow layout language, adapted to us.
//
// WHAT BREAKS IF REMOVED: the screen opens straight into one hardcoded instance and
// there is no way to see, triage, or pick from the live transaction population.

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface WorklistProps {
  onSelect: (instanceId: string) => void;
  onNewTransaction: () => void;
  onOpenSearch: () => void;
}

// Status → badge styling (light table context — mirrors the metro-tracker urgency
// language: green done · amber in-motion · red blocked · purple cancel).
const STATUS_PILL: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-700 border-amber-200',
  RUNNING: 'bg-amber-50 text-amber-700 border-amber-200',
  RETRYING: 'bg-amber-50 text-amber-700 border-amber-200',
  AWAITING_REPAIR: 'bg-orange-50 text-orange-700 border-orange-200',
  FAILED_TECHNICAL: 'bg-red-50 text-red-700 border-red-200',
  BLOCKED: 'bg-red-50 text-red-700 border-red-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-violet-50 text-violet-700 border-violet-200',
  REVERSED: 'bg-amber-50 text-amber-700 border-amber-200',
};

// The queues an operator triages by. Each maps to a set of instance statuses.
const QUEUES: { id: string; label: string; statuses: string[] | null }[] = [
  { id: 'pending', label: 'Pending approval', statuses: ['PAUSED'] },
  { id: 'repair', label: 'Repair / exceptions', statuses: ['AWAITING_REPAIR', 'FAILED_TECHNICAL', 'RETRYING', 'BLOCKED'] },
  { id: 'rejected', label: 'Rejected / cancelled', statuses: ['REJECTED', 'CANCELLED', 'REVERSED'] },
  { id: 'completed', label: 'Completed', statuses: ['COMPLETED'] },
  { id: 'all', label: 'All', statuses: null },
];

// Pull a display amount out of the (nested pacs.008) context, tolerant of shape.
const getAmount = (ctx: any): string => {
  const amt = ctx?.FIToFICstmrCdtTrf?.CdtTrfTxInf?.InstdAmt?.Amt ?? ctx?.amount;
  const ccy = ctx?.FIToFICstmrCdtTrf?.CdtTrfTxInf?.InstdAmt?.Ccy ?? ctx?.currency ?? '';
  if (amt == null || amt === '') return '—';
  const n = Number(amt);
  const formatted = isNaN(n) ? String(amt) : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${ccy} ${formatted}`.trim();
};

export const Worklist: React.FC<WorklistProps> = ({ onSelect, onNewTransaction, onOpenSearch }) => {
  const [activeQueue, setActiveQueue] = useState('pending');

  const { data: instances, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['worklist-instances'],
    queryFn: async () => {
      const res = await apiClient.get('/workflows/instances/list', { params: { limit: 200 } });
      return res.data.instances as any[];
    },
    refetchInterval: 15_000, // operators see new arrivals without manual refresh
  });

  const { data: workflows } = useQuery({
    queryKey: ['worklist-workflows'],
    queryFn: async () => (await apiClient.get('/workflows/')).data as any[],
  });
  const wfName = (id: string) => workflows?.find((w: any) => w.workflow_id === id)?.workflow_name ?? id;

  // Count per queue (computed once over the full set) + the active queue's rows.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const q of QUEUES) {
      c[q.id] = q.statuses === null
        ? (instances?.length ?? 0)
        : (instances?.filter(i => q.statuses!.includes(i.status)).length ?? 0);
    }
    return c;
  }, [instances]);

  const rows = useMemo(() => {
    const q = QUEUES.find(x => x.id === activeQueue)!;
    const list = instances ?? [];
    return q.statuses === null ? list : list.filter(i => q.statuses!.includes(i.status));
  }, [instances, activeQueue]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Dark header band — same layout language as the record workspace. */}
      <div className="bg-[#1c2230] px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-bold text-white">Transaction worklist</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">Triage live transactions by queue · open a row to action it</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onNewTransaction}
            className="px-3 py-1.5 rounded-lg border border-emerald-400/40 text-emerald-300 bg-emerald-400/10 text-[11px] font-bold hover:bg-emerald-400/20 transition-colors"
          >
            ▶ New transaction
          </button>
          <button
            onClick={onOpenSearch}
            className="px-3 py-1.5 rounded-lg border border-sky-400/40 text-sky-300 text-[11px] font-semibold hover:bg-sky-400/10 transition-colors"
          >
            🔍 Search ⌘K
          </button>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-lg border border-white/15 text-slate-200 text-[11px] font-semibold hover:bg-white/10 transition-colors"
          >
            {isFetching ? '↻ …' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Queue tabs with live counts */}
      <div className="flex flex-wrap gap-1 px-4 pt-3 border-b border-slate-100">
        {QUEUES.map(q => (
          <button
            key={q.id}
            onClick={() => setActiveQueue(q.id)}
            className={`px-3 py-2 text-[11px] font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeQueue === q.id
                ? 'border-indigo-500 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {q.label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${activeQueue === q.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
              {counts[q.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center text-slate-400 py-12 text-[12px]">Loading worklist…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-slate-400 py-14">
          <div className="text-2xl mb-2">✓</div>
          <p className="text-[12px] font-medium">This queue is empty</p>
          <p className="text-[11px] text-slate-300 mt-1">Nothing to action here right now</p>
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100">
              <th className="px-6 py-3 text-left">Instance</th>
              <th className="px-4 py-3 text-left">Workflow</th>
              <th className="px-4 py-3 text-left">Current step</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Started</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(inst => (
              <tr
                key={inst.instance_id}
                onClick={() => onSelect(inst.instance_id)}
                className="border-b border-slate-50 hover:bg-indigo-50/40 cursor-pointer transition-colors"
              >
                <td className="px-6 py-3 font-mono text-[11px] text-slate-500">{inst.instance_id.slice(0, 18)}…</td>
                <td className="px-4 py-3 text-slate-700 font-medium">{wfName(inst.workflow_id)}</td>
                <td className="px-4 py-3 text-slate-500 text-[11px]">{inst.current_node_id}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">{getAmount(inst.current_context)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_PILL[inst.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {inst.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-400">
                  {inst.created_at ? new Date(inst.created_at).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="px-3 py-1 text-[11px] font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">
                    Open →
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
