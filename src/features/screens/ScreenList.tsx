// WHY THIS FILE EXISTS:
// Left panel of the Screen Designer Studio — library of saved screen blueprints.
// Supports filtering by screen type AND by lifecycle status (WS-2).
//
// Lifecycle states (WS-2):
//   DRAFT            — being designed, not visible to bank users
//   PENDING_APPROVAL — submitted for 4-Eye review
//   LIVE             — active, appears in Package sidebar navigation
//   ARCHIVED         — superseded by a newer version, read-only
//
// Screen types (three-type model):
//   MAINTENANCE   — master/reference data entry (Currency, Country, Bank)
//   CONFIGURATION — drives workflow routing when submitted
//   TRANSACTION   — human-in-loop approval form attached to a workflow step

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

// Badge config per screen type
const TYPE_META: Record<string, { label: string; color: string }> = {
  MAINTENANCE:   { label: 'Maintenance',   color: 'bg-slate-100 text-slate-600 border-slate-200' },
  CONFIGURATION: { label: 'Configuration', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  TRANSACTION:   { label: 'Transaction',   color: 'bg-violet-50 text-violet-700 border-violet-100' },
};

// Badge config per lifecycle status
const STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT:            { label: 'Draft',            color: 'bg-slate-100 text-slate-500 border-slate-200' },
  PENDING_APPROVAL: { label: 'Pending Approval', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  LIVE:             { label: 'Live',             color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ARCHIVED:         { label: 'Archived',         color: 'bg-rose-50 text-rose-400 border-rose-100' },
  // Legacy values
  ACTIVE:           { label: 'Live',             color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export const ScreenList = ({
  viewMode,
  isReadOnly,
  isLoadingScreens,
  screensData,
  selectedScreen,
  setViewMode,
  setSelectedScreen,
  setHasUnsavedChanges
}: any) => {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const screens: any[] = screensData?.screens ?? [];
  const filtered = screens.filter((s: any) => {
    if (typeFilter && s.screen_template_category !== typeFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    return true;
  });

  // Submit for approval
  const submitMutation = useMutation({
    mutationFn: (screenId: string) => apiClient.post(`/screens/${screenId}/submit-for-approval`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['screen-templates'] }),
  });

  // Make it Live
  const makeLiveMutation = useMutation({
    mutationFn: (screenId: string) => apiClient.post(`/screens/${screenId}/make-live`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['screen-templates'] }),
  });

  return (
    <div className={`w-[420px] glass-card rounded-2xl flex flex-col overflow-hidden ${viewMode !== 'LIST' ? 'hidden md:flex opacity-50 pointer-events-none' : ''}`}>

      {/* Header */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Screen Library</h2>
          <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Dynamic UI Blueprints</p>
        </div>
        {!isReadOnly && (
          <button
            onClick={() => { setViewMode('CREATE'); setSelectedScreen(null); setHasUnsavedChanges(false); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98]"
          >
            + New Screen
          </button>
        )}
      </div>

      {/* Type filter */}
      <div className="px-4 pt-3 pb-2 flex gap-1.5 flex-wrap border-b border-slate-100">
        {[null, 'MAINTENANCE', 'CONFIGURATION', 'TRANSACTION'].map((t) => (
          <button
            key={t ?? 'all'}
            onClick={() => setTypeFilter(t)}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
              typeFilter === t
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {t === null ? 'All Types' : TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="px-4 pt-2 pb-2 flex gap-1.5 flex-wrap border-b border-slate-100">
        {[null, 'DRAFT', 'PENDING_APPROVAL', 'LIVE', 'ARCHIVED'].map((s) => (
          <button
            key={s ?? 'all-status'}
            onClick={() => setStatusFilter(s)}
            className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-all ${
              statusFilter === s
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-600'
            }`}
          >
            {s === null ? 'All Status' : STATUS_META[s]?.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-slate-400 font-medium self-center">{filtered.length}</span>
      </div>

      {/* Screen cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoadingScreens ? (
          <div className="text-center text-slate-400 text-xs mt-10 font-bold animate-pulse">Loading blueprints...</div>
        ) : filtered.map((screen: any) => {
          const typeMeta  = TYPE_META[screen.screen_template_category] ?? { label: screen.screen_template_category, color: 'bg-slate-100 text-slate-500 border-slate-200' };
          const statusMeta = STATUS_META[screen.status] ?? { label: screen.status, color: 'bg-slate-100 text-slate-500 border-slate-200' };
          const isLive     = screen.status === 'LIVE' || screen.status === 'ACTIVE';
          const isDraft    = screen.status === 'DRAFT';
          const isPending  = screen.status === 'PENDING_APPROVAL';

          return (
            <div
              key={screen.screen_id}
              onClick={() => { setSelectedScreen(screen); setViewMode('VIEW'); }}
              className={`p-4 border rounded-2xl cursor-pointer transition-all duration-300 shadow-sm ${
                selectedScreen?.screen_id === screen.screen_id
                  ? 'bg-indigo-50/40 border-indigo-200/80 shadow-glow-indigo'
                  : 'bg-white/50 border-slate-150 hover:border-indigo-400/50 hover:bg-white/80'
              }`}
            >
              <div className="flex justify-between items-start mb-1.5">
                <div className="text-[13px] font-bold text-slate-800 tracking-tight leading-snug">{screen.screen_name}</div>
                <div className={`text-[9px] font-bold px-2 py-0.5 rounded-lg border shrink-0 ml-2 ${statusMeta.color}`}>
                  {statusMeta.label}
                  {(screen.version_number > 1) && <span className="ml-1 opacity-60">v{screen.version_number}</span>}
                </div>
              </div>

              {/* Type badge + component count */}
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${typeMeta.color}`}>
                  {typeMeta.label}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">{screen.definition?.length || 0} components</span>
                {isLive && <span className="ml-auto text-[9px] text-emerald-600 font-bold">● Live</span>}
              </div>

              {/* Lifecycle action buttons — shown on selected card only, non-destructive clicks */}
              {!isReadOnly && selectedScreen?.screen_id === screen.screen_id && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                  {isDraft && (
                    <button
                      onClick={() => submitMutation.mutate(screen.screen_id)}
                      disabled={submitMutation.isPending}
                      className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all disabled:opacity-50"
                    >
                      {submitMutation.isPending ? 'Submitting...' : '→ Submit for Approval'}
                    </button>
                  )}
                  {isPending && (
                    <button
                      onClick={() => makeLiveMutation.mutate(screen.screen_id)}
                      disabled={makeLiveMutation.isPending}
                      className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700 transition-all disabled:opacity-50"
                    >
                      {makeLiveMutation.isPending ? 'Going Live...' : '▶ Make it Live'}
                    </button>
                  )}
                  {isLive && (
                    <div className="flex-1 text-[10px] text-emerald-600 font-bold text-center py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                      ✓ Live · visible in Package nav
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!isLoadingScreens && filtered.length === 0 && (
          <div className="text-center text-slate-400 text-xs mt-10 font-medium">
            No {[typeFilter && TYPE_META[typeFilter]?.label, statusFilter && STATUS_META[statusFilter]?.label].filter(Boolean).join(' · ')} screens yet.
          </div>
        )}
      </div>
    </div>
  );
};
