// WHY THIS FILE EXISTS (E2 commit 2/N — TRANSACTION_SCREEN_DESIGN.md §1):
// The Transaction Workflow Screen renders ONE transaction at a time. Operators
// need to navigate between transactions (their queue, recent transactions, specific
// instance searches). InstancePicker provides a searchable list of instances,
// scoped by status (PAUSED/COMPLETED/RETRYING/AWAITING_REPAIR) for quick access.
//
// WHAT BREAKS IF REMOVED: Operators can only view the hard-coded instance;
// they can't navigate to other in-flight transactions or completed ones.

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export interface InstancePickerInstance {
  instance_id: string;
  workflow_id: string;
  status: string;
  created_at: string;
}

interface InstancePickerProps {
  selectedInstanceId: string | null;
  onSelect: (instanceId: string) => void;
}

export const InstancePicker: React.FC<InstancePickerProps> = ({
  selectedInstanceId,
  onSelect,
}) => {
  // E2 commit 2/N: Instance search state. User can filter by ID or status.
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Fetch recent instances from GET /workflows/instances/list
  // WHY THIS FETCH: Backend filters, orders, and limits — the picker just
  // displays what's returned. We could add more filters (workflow_id, date range)
  // later, but for E2 we keep it simple: list all instances, filter client-side.
  const { data: instancesResponse, isLoading } = useQuery({
    queryKey: ['workflow-instances', statusFilter],
    queryFn: async () => {
      const response = await apiClient.get('/workflows/instances/list', {
        params: {
          instance_status: statusFilter || undefined,
          limit: 50,
        },
      });
      return response.data;
    },
  });

  const instances: InstancePickerInstance[] = instancesResponse?.instances || [];

  // Client-side search filter: match instance ID or status
  const filteredInstances = useMemo(() => {
    if (!searchText) return instances;
    const lower = searchText.toLowerCase();
    return instances.filter(
      (i) =>
        i.instance_id.toLowerCase().includes(lower) ||
        i.status.toLowerCase().includes(lower)
    );
  }, [instances, searchText]);

  // Group instances by status for visual organization (optional — could be
  // removed for a flat list if this becomes cluttered at scale).
  const instancesByStatus = useMemo(() => {
    const grouped: Record<string, InstancePickerInstance[]> = {};
    filteredInstances.forEach((i) => {
      if (!grouped[i.status]) grouped[i.status] = [];
      grouped[i.status].push(i);
    });
    return grouped;
  }, [filteredInstances]);

  const statusOrder = ['PAUSED', 'RETRYING', 'AWAITING_REPAIR', 'COMPLETED', 'REJECTED', 'BLOCKED', 'CANCELLED'];

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Search input */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
          Find a transaction
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by instance ID..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            onClick={() => setSearchText('')}
            className="px-2.5 py-2 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-50 transition-colors"
            disabled={!searchText}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setStatusFilter(null)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
            statusFilter === null
              ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-150'
          }`}
        >
          All
        </button>
        {['PAUSED', 'RETRYING', 'AWAITING_REPAIR', 'COMPLETED'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
              statusFilter === status
                ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-150'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Instance list */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="p-6 text-center text-slate-500 text-[12px]">
            Loading instances...
          </div>
        ) : filteredInstances.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-[12px]">
            No instances found.
          </div>
        ) : (
          <div>
            {statusOrder
              .filter((status) => instancesByStatus[status])
              .map((status) => (
                <div key={status}>
                  {/* Status header */}
                  <div className="sticky top-0 px-4 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                      {status}
                    </span>
                  </div>
                  {/* Instances in this status */}
                  {instancesByStatus[status].map((instance) => (
                    <button
                      key={instance.instance_id}
                      onClick={() => onSelect(instance.instance_id)}
                      className={`w-full px-4 py-3 text-left border-b border-slate-100 hover:bg-indigo-50 transition-colors ${
                        selectedInstanceId === instance.instance_id
                          ? 'bg-indigo-100 border-l-4 border-l-indigo-600'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-mono font-semibold text-slate-900 truncate">
                            {instance.instance_id}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(instance.created_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap ${
                          status === 'PAUSED'
                            ? 'bg-amber-100 text-amber-700'
                            : status === 'COMPLETED'
                            ? 'bg-green-100 text-green-700'
                            : status === 'RETRYING'
                            ? 'bg-amber-100 text-amber-700'
                            : status === 'AWAITING_REPAIR'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
