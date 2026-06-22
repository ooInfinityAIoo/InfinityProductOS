// WHY THIS FILE EXISTS (E4 commit 1/N — TRANSACTION_SCREEN_DESIGN.md §4):
// Reversal (saga compensation) can fail: the compensating API times out, the DB
// snapshot can't be restored, the event broadcast fails. When it does, the
// transaction lands in REVERSAL_FAILED state. ReversionRecoveryQueue is the ops
// dashboard for managing those failed reversals — retry, mark force-reversed,
// escalate, or roll back to a known-good state.
//
// WHAT BREAKS IF REMOVED: Failed reversals have no recovery path; operators
// can't manually intervene, and transactions get stuck forever.

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export interface RecoveryQueueItem {
  queue_entry_id: string;
  instance_id: string;
  node_id: string;
  node_title: string;
  landed_at: string;
  last_error: string;
  assigned_to?: string;
}

export const ReversionRecoveryQueue: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'unassigned' | 'assigned'>('unassigned');

  // Fetch reversal recovery queue items (when reversals have failed)
  // WHY: If a reversal fails, the transaction goes into REVERSAL_FAILED state
  // and lands here. Ops staff can see what failed, why, and take manual action.
  const { data: queueResponse, isLoading, error } = useQuery({
    queryKey: ['reversal-recovery-queue', statusFilter],
    queryFn: async () => {
      const response = await apiClient.get('/workflows/reversal-recovery-queue', {
        params: {
          assigned: statusFilter === 'assigned' ? 'true' : statusFilter === 'unassigned' ? 'false' : undefined,
        },
      });
      return response.data;
    },
  });

  const items: RecoveryQueueItem[] = queueResponse?.items || [];

  return (
    <div className="w-full flex flex-col gap-4 p-6">
      <div className="glass-card rounded-2xl p-6 bg-white/85 backdrop-blur-md border border-white/30 shadow-glass">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-extrabold text-slate-800">
              Reversal Recovery Queue
            </h1>
            <p className="text-[12px] text-slate-500 mt-1">
              Failed reversals awaiting manual intervention
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold text-red-600">{items.length}</div>
            <div className="text-[11px] text-slate-500">in queue</div>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 mb-4">
          {(['all', 'unassigned', 'assigned'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                statusFilter === status
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                  : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-150'
              }`}
            >
              {status === 'all' ? 'All' : status === 'unassigned' ? 'Unassigned' : 'Assigned'}
            </button>
          ))}
        </div>

        {/* Queue list */}
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          {isLoading ? (
            <div className="p-6 text-center text-slate-500 text-[12px]">
              Loading reversal recovery queue...
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-600 text-[12px]">
              Error loading queue. Check backend connectivity.
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-[12px]">
              No failed reversals. All reversals completed successfully.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => (
                <div
                  key={item.queue_entry_id}
                  className="px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-slate-900">
                        {item.node_title}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        <span className="font-mono">
                          {item.instance_id}
                        </span>
                        {' · '}
                        {new Date(item.landed_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      {item.last_error && (
                        <div className="text-[10px] text-red-700 bg-red-50 px-2 py-1 rounded mt-2 font-mono">
                          {item.last_error}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.assigned_to && (
                        <div className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold">
                          👤 {item.assigned_to}
                        </div>
                      )}
                      <button className="text-[11px] px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors font-semibold opacity-0 group-hover:opacity-100">
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-50/40 border border-blue-200/50 text-[11px] text-blue-900">
          <span className="font-bold">E4 commit 1/N:</span> Reversal Recovery Queue view.
          Displays failed reversals with error details. Operators can click to view,
          retry, or escalate. Backend endpoint: GET /workflows/reversal-recovery-queue.
        </div>
      </div>
    </div>
  );
};
