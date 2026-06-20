// WHY THIS FILE EXISTS:
// Left panel of the Screen Designer Studio — shows the library of saved screen blueprints.
// Supports filtering by the three screen types (MAINTENANCE / CONFIGURATION / TRANSACTION)
// so configuration analysts can quickly find the right category of screen to work with.
// Each type has a distinct purpose in the product lifecycle:
//   MAINTENANCE  — master/reference data entry, used rarely after go-live
//   CONFIGURATION — drives workflow routing conditions when submitted
//   TRANSACTION   — human-in-the-loop approval forms attached to workflow steps

import React, { useState } from 'react';

// Badge config per screen type — colour and label for quick visual identification
const TYPE_META: Record<string, { label: string; color: string }> = {
  MAINTENANCE:   { label: 'Maintenance',   color: 'bg-slate-100 text-slate-600 border-slate-200' },
  CONFIGURATION: { label: 'Configuration', color: 'bg-blue-50 text-blue-700 border-blue-100' },
  TRANSACTION:   { label: 'Transaction',   color: 'bg-violet-50 text-violet-700 border-violet-100' },
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
  // Active type filter — null = show all
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const screens: any[] = screensData?.screens ?? [];
  const filtered = typeFilter
    ? screens.filter((s: any) => s.screen_template_category === typeFilter)
    : screens;

  return (
    <div className={`w-[400px] glass-card rounded-2xl flex flex-col overflow-hidden ${viewMode !== 'LIST' ? 'hidden md:flex opacity-50 pointer-events-none' : ''}`}>
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Screen Library</h2>
          <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Dynamic UI Blueprints</p>
        </div>
        {!isReadOnly && (
          <button
            onClick={() => { setViewMode('CREATE'); setSelectedScreen(null); setHasUnsavedChanges(false); }}
            className="bg-indigo-600 hover:bg-indigo-750 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98]"
          >
            + New Screen
          </button>
        )}
      </div>

      {/* Type filter tabs — one per screen category */}
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
            {t === null ? 'All' : TYPE_META[t].label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-slate-400 font-medium self-center">{filtered.length} screens</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoadingScreens ? (
          <div className="text-center text-slate-400 text-xs mt-10 font-bold animate-pulse">Loading blueprints...</div>
        ) : filtered.map((screen: any) => {
          const typeMeta = TYPE_META[screen.screen_template_category] ?? { label: screen.screen_template_category, color: 'bg-slate-100 text-slate-500 border-slate-200' };
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
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800 tracking-tight">{screen.screen_name}</div>
                <div className={`text-[9px] font-mono px-2 py-0.5 rounded-lg font-bold border ${
                  screen.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50'
                    : 'bg-amber-50 text-amber-700 border-amber-100/50'
                }`}>{screen.status}</div>
              </div>
              {/* Screen type badge — instantly communicates purpose to configuration analysts */}
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${typeMeta.color}`}>
                  {typeMeta.label}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">{screen.definition?.length || 0} components</span>
              </div>
            </div>
          );
        })}
        {!isLoadingScreens && filtered.length === 0 && (
          <div className="text-center text-slate-400 text-xs mt-10 font-medium">No {typeFilter ? TYPE_META[typeFilter]?.label : ''} screens yet.</div>
        )}
      </div>
    </div>
  );
};