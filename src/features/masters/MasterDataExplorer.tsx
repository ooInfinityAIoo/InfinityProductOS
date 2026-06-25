// WHY THIS COMPONENT EXISTS:
// The single home for Master Data in designer mode. Previously masters were only
// reachable via "Launch App" (runtime), and a second hardcoded "Master Data"
// dropdown listed fake reference tables — masters were "all over". This consolidates
// them into ONE place, grouped by master category (Geography & Reference, Bank &
// Institution Identity, Accounts, ...), mirroring how banks organise master menus.
//
// Left: categories → masters (accordion). Right: the selected master's maintenance
// grid (records list/add/edit/delete), reusing MasterMaintenance.

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useResolvedPackageId } from '../../hooks/useResolvedPackageId';
import { MasterMaintenance } from '../package-runtime/MasterMaintenance';

// Category display order (matches the PM's grouping).
const CATEGORY_ORDER = [
  'Geography & Reference', 'Bank & Institution Identity', 'Accounts', 'Parties',
  'Payment Processing', 'Security & Connectivity', 'Organisation',
];
const UNCATEGORISED = 'Other';

export const MasterDataExplorer: React.FC = () => {
  const { currentPackage } = useResolvedPackageId();
  const packageId: string = currentPackage?.package_id ?? '';
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // All MAINTENANCE masters for the active package.
  const { data, isLoading } = useQuery({
    queryKey: ['masters-explorer', packageId],
    queryFn: async () => {
      const res = await apiClient.get(`/screens/?package_id=${packageId}&limit=300`);
      return res.data;
    },
    enabled: !!packageId,
  });

  const masters: any[] = (data?.screens ?? []).filter(
    (s: any) => s.screen_template_category === 'MAINTENANCE'
  );

  // Group masters by category, in display order.
  const grouped = useMemo(() => {
    const byCat: Record<string, any[]> = {};
    for (const m of masters) {
      const cat = m.master_category || UNCATEGORISED;
      (byCat[cat] ??= []).push(m);
    }
    const order = [...CATEGORY_ORDER, ...Object.keys(byCat).filter(c => !CATEGORY_ORDER.includes(c))];
    return order.filter(c => byCat[c]?.length).map(c => ({ category: c, items: byCat[c].sort((a, b) => a.screen_name.localeCompare(b.screen_name)) }));
  }, [masters]);

  // The selected master's full definition (for the grid).
  const { data: selected } = useQuery({
    queryKey: ['master-detail', selectedId],
    queryFn: async () => (await apiClient.get(`/screens/${selectedId}`)).data,
    enabled: !!selectedId,
  });

  return (
    <div className="w-full flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Master Data</h1>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Reference & configuration masters for {currentPackage?.package_name ?? 'this package'}, grouped by category.
        </p>
      </div>

      <div className="grid grid-cols-[300px_1fr] gap-4 min-h-[600px]">
        {/* Left — categories → masters */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-y-auto max-h-[78vh]">
          {isLoading ? (
            <div className="text-center text-slate-400 py-12 text-sm">Loading masters…</div>
          ) : masters.length === 0 ? (
            <div className="text-center text-slate-400 py-12 text-sm">No masters in this package.</div>
          ) : (
            grouped.map(g => (
              <div key={g.category} className="border-b border-slate-100 last:border-b-0">
                <div className="px-4 py-2 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                  {g.category}
                  <span className="text-slate-400">{g.items.length}</span>
                </div>
                {g.items.map(m => (
                  <button
                    key={m.screen_id}
                    onClick={() => setSelectedId(m.screen_id)}
                    className={`w-full text-left px-4 py-2 text-[12px] border-b border-slate-50 last:border-b-0 flex items-center gap-2 transition-colors ${
                      selectedId === m.screen_id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{m.master_type === 'DECISION_TABLE' ? '🧮' : '🗂'}</span>
                    <span className="flex-1 truncate">{m.screen_name.replace(/ Master$/, '')}</span>
                    {m.is_global_shared && <span title="Global" className="text-[10px]">🌐</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Right — selected master's maintenance grid */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 overflow-y-auto max-h-[78vh]">
          {!selectedId ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 gap-2 py-20">
              <span className="text-3xl">🗂</span>
              <p className="text-sm font-medium">Select a master to view and maintain its records.</p>
            </div>
          ) : !selected ? (
            <div className="text-center text-slate-400 py-12 text-sm">Loading…</div>
          ) : (
            <MasterMaintenance
              screenId={selected.screen_id}
              screenName={selected.screen_name}
              components={selected.definition}
              masterType={selected.master_type}
              isGlobalShared={selected.is_global_shared}
            />
          )}
        </div>
      </div>
    </div>
  );
};
