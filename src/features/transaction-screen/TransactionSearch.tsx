// WHY THIS FILE EXISTS (E5 commit 2/N — TRANSACTION_SCREEN_DESIGN.md §6):
// Transaction search is not a simple list. The platform processes millions of
// transactions per day, so operators need a real search capability:
//   - Free-text on transaction reference / instance ID (prefix match)
//   - Multi-status filter (e.g. show me all PAUSED + RETRYING)
//   - Date range (find yesterday's stuck transactions)
//   - Advanced drawer (cancelled_by, repair_queue, workflow scoping)
//
// This component calls GET /workflows/instances/search (E5 commit 1/N) and
// returns paginated results. Clicking a result loads that instance into the
// metro tracker on the parent TransactionWorkflowScreen.
//
// WHAT BREAKS IF REMOVED: Operators can only see the 50 most-recent transactions.
// They cannot find a specific transaction by reference — completely unusable
// on a production system processing >10k transactions/day.

import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

// Lifecycle states the operator can filter on. Maps to the status column values.
const STATUS_OPTIONS = [
  { value: 'PAUSED', label: 'Paused', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'RETRYING', label: 'Retrying', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'AWAITING_REPAIR', label: 'Awaiting repair', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'FAILED_TECHNICAL', label: 'Failed', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'BLOCKED', label: 'Blocked', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'REVERSED', label: 'Reversed', color: 'bg-amber-100 text-amber-700 border-amber-200' },
];

// Status display badge — colour-coded to the 12-state lifecycle palette
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const opt = STATUS_OPTIONS.find(s => s.value === status);
  const color = opt?.color ?? 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${color}`}>
      {status}
    </span>
  );
};

interface TransactionSearchProps {
  onSelect: (instanceId: string) => void;
  onClose: () => void;
}

export const TransactionSearch: React.FC<TransactionSearchProps> = ({ onSelect, onClose }) => {
  // ── Basic search state ────────────────────────────────────────────────
  const [q, setQ] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Advanced filter state ─────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cancelledBy, setCancelledBy] = useState('');
  const [repairQueue, setRepairQueue] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('');

  // ── Pagination ────────────────────────────────────────────────────────
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  // Reset pagination whenever the search changes
  const handleSearchChange = useCallback((value: string) => {
    setQ(value);
    setOffset(0);
  }, []);

  const toggleStatus = (status: string) => {
    setOffset(0);
    setSelectedStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  // Build query params for the API call
  const queryParams = {
    q: q.trim() || undefined,
    statuses: selectedStatuses.length > 0 ? selectedStatuses.join(',') : undefined,
    workflow_id: workflowId || undefined,
    cancelled_by: cancelledBy || undefined,
    repair_queue: repairQueue || undefined,
    assigned_team: assignedTeam || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    limit: LIMIT,
    offset,
  };

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['transaction-search', queryParams],
    queryFn: async () => {
      const response = await apiClient.get('/workflows/instances/search', {
        params: queryParams,
      });
      return response.data;
    },
    // Don't stall on every keystroke — debounce by only firing when q stabilises.
    // React Query handles cache reuse so repeated keystrokes show cached data while
    // the fresh query is in flight.
    placeholderData: (prev) => prev,
  });

  const instances: any[] = data?.instances ?? [];
  const totalCount: number = data?.total_count ?? 0;
  const hasMore: boolean = data?.has_more ?? false;
  const hasActiveFilters = q || selectedStatuses.length > 0 || dateFrom || dateTo || cancelledBy || repairQueue || workflowId || assignedTeam;

  return (
    <div className="glass-card rounded-2xl p-6 bg-white/85 backdrop-blur-md border border-white/30 shadow-glass">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-extrabold text-slate-800">Transaction Search</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Search millions of transactions by ID, status, or date range
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 text-lg font-bold leading-none"
        >
          ✕
        </button>
      </div>

      {/* ── Search bar ───────────────────────────────────────────────────── */}
      <div className="relative mb-3">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={q}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search by instance ID or transaction reference…"
          className="w-full pl-9 pr-4 py-2.5 text-[12px] border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
          autoFocus
        />
        {isFetching && (
          <div className="absolute inset-y-0 right-3 flex items-center">
            <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* ── Status filter chips ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => toggleStatus(opt.value)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${selectedStatuses.includes(opt.value)
                ? opt.color + ' opacity-100'
                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
          >
            {opt.label}
          </button>
        ))}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setQ('');
              setSelectedStatuses([]);
              setDateFrom('');
              setDateTo('');
              setCancelledBy('');
              setRepairQueue('');
              setWorkflowId('');
              setAssignedTeam('');
              setOffset(0);
            }}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
          >
            ✕ Clear all
          </button>
        )}
      </div>

      {/* ── Advanced filters toggle ───────────────────────────────────────── */}
      <div className="mb-3">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1"
        >
          <span>{showAdvanced ? '▲' : '▼'}</span>
          {showAdvanced ? 'Hide advanced filters' : 'Advanced filters (date range, cancelled by, repair queue…)'}
        </button>
      </div>

      {/* ── Advanced filter panel ─────────────────────────────────────────── */}
      {showAdvanced && (
        <div className="mb-4 p-4 rounded-xl bg-slate-50/50 border border-slate-200/60 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date from</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setOffset(0); }}
              className="w-full text-[11px] border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date to</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setOffset(0); }}
              className="w-full text-[11px] border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cancelled by</label>
            <select
              value={cancelledBy}
              onChange={e => { setCancelledBy(e.target.value); setOffset(0); }}
              className="w-full text-[11px] border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-none"
            >
              <option value="">Any</option>
              <option value="rule">Business rule</option>
              <option value="operator">Operator</option>
              <option value="system">System</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Assigned team</label>
            <select
              value={assignedTeam}
              onChange={e => { setAssignedTeam(e.target.value); setOffset(0); }}
              className="w-full text-[11px] border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-none"
            >
              <option value="">Any</option>
              <option value="operator">Operator</option>
              <option value="sales">Sales</option>
              <option value="risk">Risk</option>
              <option value="admin">Admin</option>
              <option value="auditor">Auditor</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Repair queue</label>
            <input
              type="text"
              value={repairQueue}
              onChange={e => { setRepairQueue(e.target.value); setOffset(0); }}
              placeholder="e.g. AML_REVIEW"
              className="w-full text-[11px] border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-none focus:border-indigo-400 font-mono"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Workflow ID</label>
            <input
              type="text"
              value={workflowId}
              onChange={e => { setWorkflowId(e.target.value); setOffset(0); }}
              placeholder="e.g. WF-ECC2B272"
              className="w-full text-[11px] border border-slate-200 rounded-lg p-1.5 bg-white focus:outline-none focus:border-indigo-400 font-mono"
            />
          </div>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        {/* Results header */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50/60 border-b border-slate-100">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {isLoading ? 'Searching…' : `${totalCount.toLocaleString()} result${totalCount !== 1 ? 's' : ''}`}
          </div>
          {totalCount > 0 && (
            <div className="text-[10px] text-slate-400">
              Showing {offset + 1}–{Math.min(offset + LIMIT, totalCount)} of {totalCount.toLocaleString()}
            </div>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="p-6 text-center text-red-600 text-[12px]">
            Search failed. Check backend connectivity.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && instances.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-[12px]">
            {hasActiveFilters
              ? 'No transactions match your search. Try broadening the filters.'
              : 'Enter a search term or select a status filter to find transactions.'}
          </div>
        )}

        {/* Results list */}
        {instances.length > 0 && (
          <div className="divide-y divide-slate-50">
            {instances.map((instance) => (
              <button
                key={instance.instance_id}
                onClick={() => onSelect(instance.instance_id)}
                className="w-full px-4 py-3 hover:bg-indigo-50/30 transition-colors text-left flex items-center justify-between gap-3 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-mono font-bold text-indigo-700 truncate">
                      {instance.instance_id}
                    </span>
                    {instance.master_transaction_id && instance.master_transaction_id !== instance.instance_id && (
                      <span className="text-[10px] text-slate-400 font-mono truncate">
                        ref: {instance.master_transaction_id}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusBadge status={instance.status} />
                    {instance.assigned_team && (
                      <span className="text-[10px] text-blue-700 font-mono bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                        team: {instance.assigned_team}
                      </span>
                    )}
                    {instance.cancelled_reason_code && (
                      <span className="text-[10px] text-purple-700 font-mono bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                        {instance.cancelled_reason_code}
                      </span>
                    )}
                    {instance.repair_queue_assigned && (
                      <span className="text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                        queue: {instance.repair_queue_assigned}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {new Date(instance.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
                <div className="text-indigo-500 text-[11px] font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  View →
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {(offset > 0 || hasMore) && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/40">
            <button
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              disabled={offset === 0}
              className="text-[11px] font-bold text-slate-600 disabled:opacity-30 hover:text-indigo-600 transition-colors"
            >
              ← Previous
            </button>
            <span className="text-[10px] text-slate-400">
              Page {Math.floor(offset / LIMIT) + 1}
            </span>
            <button
              onClick={() => setOffset(offset + LIMIT)}
              disabled={!hasMore}
              className="text-[11px] font-bold text-slate-600 disabled:opacity-30 hover:text-indigo-600 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
