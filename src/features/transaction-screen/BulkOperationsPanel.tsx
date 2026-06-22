// WHY THIS FILE EXISTS (E6 commit 2/N — TRANSACTION_SCREEN_DESIGN.md §7):
// Operators processing high-volume payment runs often need to act on tens or
// hundreds of similar transactions in one go — e.g. approve all PAUSED wires
// that are waiting for a 4-eye sign-off after a batch upload. Doing this one
// at a time through the metro tracker would take hours.
//
// BulkOperationsPanel lets the operator:
//   1. See all PAUSED / RETRYING / AWAITING_REPAIR instances in one table
//   2. Select them with checkboxes (individually or select-all)
//   3. Fire a single bulk action (Approve / Cancel / Retry) against all selected
//
// Each action is dispatched as an individual POST /workflows/{id}/resume call
// in sequence. Progress is tracked per-row: pending → success / error.
//
// WHAT BREAKS IF REMOVED: Operators doing batch payment runs have no way to
// act on multiple transactions simultaneously — a 500-payment batch that all
// paused for approval would require 500 individual clicks.

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

// The statuses that make sense for bulk operator action.
// COMPLETED/REJECTED/CANCELLED are terminal — no bulk action applies.
const BULK_ELIGIBLE_STATUSES = ['PAUSED', 'RETRYING', 'AWAITING_REPAIR', 'FAILED_TECHNICAL'];

type BulkAction = 'approve' | 'retry' | 'cancel';

interface RowResult {
  instance_id: string;
  state: 'pending' | 'running' | 'success' | 'error';
  error?: string;
}

interface BulkOperationsPanelProps {
  onClose: () => void;
}

export const BulkOperationsPanel: React.FC<BulkOperationsPanelProps> = ({ onClose }) => {
  const [statusFilter, setStatusFilter] = useState<string>('PAUSED');
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [action, setAction]             = useState<BulkAction>('approve');
  const [results, setResults]           = useState<RowResult[] | null>(null);
  const [running, setRunning]           = useState(false);

  // Fetch instances eligible for bulk action
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['bulk-instances', statusFilter],
    queryFn: async () => {
      const res = await apiClient.get('/workflows/instances/list', {
        params: { instance_status: statusFilter, limit: 100 },
      });
      return res.data;
    },
  });

  const instances: any[] = data?.instances ?? [];

  const toggleAll = () => {
    if (selected.size === instances.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(instances.map((i: any) => i.instance_id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // Execute the chosen action against each selected instance sequentially.
  // WHY sequential not parallel: avoids hammering the backend and gives the
  // operator a clear per-row progress indicator as each completes.
  const handleRun = async () => {
    if (selected.size === 0 || running) return;

    const ids = [...selected];
    // Initialise all rows as "pending"
    const init: RowResult[] = ids.map(id => ({ instance_id: id, state: 'pending' }));
    setResults(init);
    setRunning(true);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      // Mark this row as running
      setResults(prev => prev!.map(r => r.instance_id === id ? { ...r, state: 'running' } : r));

      try {
        const instance = instances.find((inst: any) => inst.instance_id === id);
        const workflowId = instance?.workflow_id;
        if (!workflowId) throw new Error('workflow_id not found');

        const body =
          action === 'approve' ? { decision: 'approve', approver_id: 'bulk_operator' } :
          action === 'retry'   ? { action: 'retry' } :
                                 { action: 'cancel_transaction', reason: 'Bulk cancel by operator' };

        await apiClient.post(`/workflows/${workflowId}/resume/${id}`, body);
        setResults(prev => prev!.map(r => r.instance_id === id ? { ...r, state: 'success' } : r));
      } catch (err: any) {
        const msg = err?.response?.data?.detail || String(err);
        setResults(prev => prev!.map(r => r.instance_id === id ? { ...r, state: 'error', error: msg } : r));
      }
    }

    setRunning(false);
    refetch(); // Refresh the list after bulk operation
  };

  const successCount = results?.filter(r => r.state === 'success').length ?? 0;
  const errorCount   = results?.filter(r => r.state === 'error').length ?? 0;
  const isComplete   = results !== null && !running;

  return (
    <div className="glass-card rounded-2xl p-6 bg-white/85 backdrop-blur-md border border-white/30 shadow-glass">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-extrabold text-slate-800">Bulk Operations</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Select multiple transactions and apply a single action to all
          </p>
        </div>
        <button
          onClick={onClose}
          disabled={running}
          className="text-slate-400 hover:text-slate-700 text-lg font-bold leading-none disabled:opacity-30"
        >
          ✕
        </button>
      </div>

      {/* Controls — status filter + action picker (disabled while running) */}
      {!results && (
        <div className="flex flex-wrap gap-3 mb-4 pb-4 border-b border-slate-200/60">
          {/* Status filter */}
          <div className="flex gap-1.5">
            {BULK_ELIGIBLE_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setSelected(new Set()); }}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-colors ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Action picker */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Action:</span>
            <select
              value={action}
              onChange={e => setAction(e.target.value as BulkAction)}
              className="text-[11px] border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-none focus:border-indigo-400"
            >
              <option value="approve">Approve all selected</option>
              <option value="retry">Retry all selected</option>
              <option value="cancel">Cancel all selected</option>
            </select>
          </div>
        </div>
      )}

      {/* Results summary banner (after run) */}
      {isComplete && (
        <div className={`mb-4 p-3 rounded-lg text-[11px] font-semibold border ${
          errorCount === 0
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          {successCount} succeeded · {errorCount} failed
          {errorCount === 0 && ' — all operations completed successfully.'}
          <button
            onClick={() => { setResults(null); setSelected(new Set()); }}
            className="ml-3 underline text-[10px]"
          >
            Start over
          </button>
        </div>
      )}

      {/* Instance list */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white mb-4">
        {/* List header */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-50/60 border-b border-slate-100">
          {!results && (
            <input
              type="checkbox"
              checked={selected.size === instances.length && instances.length > 0}
              onChange={toggleAll}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
          )}
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-1">
            {isLoading ? 'Loading…' : `${instances.length} ${statusFilter} transaction${instances.length !== 1 ? 's' : ''}`}
          </span>
          {!results && selected.size > 0 && (
            <span className="text-[10px] font-bold text-indigo-600">{selected.size} selected</span>
          )}
        </div>

        {/* Rows */}
        {isLoading && (
          <div className="p-6 text-center text-slate-400 text-[12px]">Loading…</div>
        )}
        {!isLoading && instances.length === 0 && (
          <div className="p-6 text-center text-slate-400 text-[12px]">
            No {statusFilter} transactions found.
          </div>
        )}
        {!isLoading && instances.length > 0 && (
          <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
            {instances.map((inst: any) => {
              const row = results?.find(r => r.instance_id === inst.instance_id);
              return (
                <div key={inst.instance_id} className="flex items-center gap-3 px-4 py-2.5">
                  {/* Checkbox (hidden during / after run; replaced by status icon) */}
                  {!results ? (
                    <input
                      type="checkbox"
                      checked={selected.has(inst.instance_id)}
                      onChange={() => toggleOne(inst.instance_id)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                  ) : (
                    <span className="w-4 text-center text-[12px]">
                      {!row || row.state === 'pending' ? '○' :
                       row.state === 'running'         ? '…' :
                       row.state === 'success'         ? '✓' : '✕'}
                    </span>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-mono font-bold text-indigo-700 truncate">
                      {inst.instance_id}
                    </div>
                    {row?.state === 'error' && (
                      <div className="text-[10px] text-red-600 mt-0.5 truncate font-mono">
                        {row.error}
                      </div>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400">
                    {new Date(inst.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>

                  {/* Row state colour */}
                  {row && (
                    <span className={`text-[10px] font-bold w-16 text-right ${
                      row.state === 'success' ? 'text-green-600' :
                      row.state === 'error'   ? 'text-red-600' :
                      row.state === 'running' ? 'text-indigo-500' : 'text-slate-300'
                    }`}>
                      {row.state === 'success' ? 'Done' :
                       row.state === 'error'   ? 'Error' :
                       row.state === 'running' ? 'Running…' : '—'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Run button */}
      {!results && (
        <div className="flex justify-end">
          <button
            onClick={handleRun}
            disabled={selected.size === 0 || running}
            className={`px-5 py-2.5 rounded-xl text-[12px] font-extrabold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
              action === 'cancel'
                ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
            }`}
          >
            {running
              ? `Running ${action}…`
              : `${action === 'approve' ? 'Approve' : action === 'retry' ? 'Retry' : 'Cancel'} ${selected.size} transaction${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
};
