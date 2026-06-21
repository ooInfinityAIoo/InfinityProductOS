// WHY THIS COMPONENT EXISTS:
// Authorization Matrix — the auditor's "single sheet of truth" that answers
// "who can do what across the entire platform?" in one view.
//
// The Entitlement Configuration Studio (EntitlementConfigStudio.tsx) shows a matrix
// filtered by entity type (only screens, only workflows, etc.). This studio shows
// EVERYTHING at once: every role as a column, every entity as a row, and 4 permission
// bits as coloured icons per cell. Auditors, compliance officers, and the CISO use
// this to verify access control before a product goes live or during a regulatory review.
//
// Data source: the existing /entitlements/matrix API which returns a pivot of
// EntitlementPolicy rows. No new backend needed — it's a different view of the same data.
//
// WHAT BREAKS IF REMOVED: Auditors lose the cross-entity access overview. They would
// need to click through every entity type separately in EntitlementConfigStudio.

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface PolicyRow {
  policy_id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  role_code: string;
  can_view: boolean;
  can_modify_data: boolean;
  can_modify_design: boolean;
  can_approve: boolean;
}

interface MatrixData {
  policies: PolicyRow[];
  total_count: number;
}

const ENTITY_TYPE_ICONS: Record<string, string> = {
  SCREEN:         '🖥️',
  WORKFLOW:       '🔄',
  RULE:           '⚖️',
  CALCULATION:    '🧮',
  REPORT:         '📊',
  INTEGRATION:    '🔌',
  RECONCILIATION: '🔁',
};

const PERM_ICONS = [
  { key: 'can_view',          icon: '👁',  label: 'View',    color: 'text-slate-600'   },
  { key: 'can_modify_data',   icon: '✏️', label: 'Data',    color: 'text-indigo-600'  },
  { key: 'can_modify_design', icon: '🎨', label: 'Design',  color: 'text-purple-600'  },
  { key: 'can_approve',       icon: '✅', label: 'Approve', color: 'text-emerald-600' },
] as const;

export const AuthorizationMatrixStudio: React.FC = () => {
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  // Fetch all policies — no pagination needed for a matrix view
  const { data, isLoading } = useQuery<MatrixData>({
    queryKey: ['entitlements-all'],
    queryFn: () => apiClient.get('/entitlements/').then(r => ({ policies: r.data.policies ?? [], total_count: r.data.total ?? 0 })),
  });

  // Fetch roles from DB so columns are dynamic
  const { data: rolesData } = useQuery({
    queryKey: ['role-profiles'],
    queryFn: () => apiClient.get('/roles-users/roles').then(r => r.data),
  });
  const roles: string[] = (rolesData?.roles ?? []).map((r: any) => r.role_code);

  const allPolicies: PolicyRow[] = data?.policies ?? [];

  // Build pivot: entity_id → { role_code → { can_view, can_modify_data, ... } }
  type PermMap = Record<string, Record<string, Partial<PolicyRow>>>;
  const pivot: PermMap = {};
  const entityMeta: Record<string, { type: string; name: string }> = {};

  allPolicies.forEach(p => {
    if (!pivot[p.entity_id]) pivot[p.entity_id] = {};
    pivot[p.entity_id][p.role_code] = p;
    entityMeta[p.entity_id] = { type: p.entity_type, name: p.entity_name };
  });

  // Filter entities
  let entityIds = Object.keys(pivot);
  if (entityTypeFilter) entityIds = entityIds.filter(id => entityMeta[id]?.type === entityTypeFilter);
  if (search) entityIds = entityIds.filter(id => entityMeta[id]?.name?.toLowerCase().includes(search.toLowerCase()));

  // Group by entity type for section headers
  const grouped: Record<string, string[]> = {};
  entityIds.forEach(id => {
    const t = entityMeta[id]?.type ?? 'UNKNOWN';
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(id);
  });

  const entityTypes = Object.keys(grouped).sort();

  // Legend summary counts
  const totalEntities = entityIds.length;
  const totalPolicies = allPolicies.length;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Authorization Matrix</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cross-reference: role × resource × allowed actions. Auditor read-only view.
            Edit permissions in <span className="font-semibold text-indigo-600">Entitlement Configuration</span>.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span><span className="font-bold text-slate-700">{totalEntities}</span> entities</span>
          <span><span className="font-bold text-slate-700">{roles.length}</span> roles</span>
          <span><span className="font-bold text-slate-700">{totalPolicies}</span> policies</span>
        </div>
      </div>

      {/* Legend + filters */}
      <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-6 flex-wrap">
        {/* Permission legend */}
        <div className="flex items-center gap-3">
          {PERM_ICONS.map(p => (
            <span key={p.key} className="flex items-center gap-1 text-[11px] text-slate-500">
              <span>{p.icon}</span>{p.label}
            </span>
          ))}
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-400">Greyed = denied</span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 ml-auto">
          <select
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
            value={entityTypeFilter}
            onChange={e => setEntityTypeFilter(e.target.value)}
          >
            <option value="">All entity types</option>
            {Object.keys(ENTITY_TYPE_ICONS).map(t => <option key={t}>{t}</option>)}
          </select>
          <input
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs w-48"
            placeholder="Search entity name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Matrix table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading && (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading matrix…</div>
        )}

        {!isLoading && entityIds.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <div className="text-4xl mb-2">🔲</div>
            <p className="text-sm font-medium">No entities registered yet</p>
            <p className="text-xs mt-1">Entities appear here automatically when they go LIVE in their respective studio.</p>
          </div>
        )}

        {!isLoading && entityIds.length > 0 && roles.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-3 py-2.5 text-left font-bold w-8 sticky left-0 bg-slate-800">#</th>
                  <th className="px-3 py-2.5 text-left font-bold min-w-48 sticky left-8 bg-slate-800">Entity</th>
                  {roles.map(role => (
                    <th key={role} className="px-2 py-2.5 text-center font-bold min-w-24" colSpan={4}>
                      <div className="text-[10px]">{role}</div>
                      <div className="flex justify-center gap-0.5 mt-1 opacity-60">
                        {PERM_ICONS.map(p => <span key={p.key} className="text-[10px]">{p.icon}</span>)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entityTypes.map(type => (
                  <React.Fragment key={type}>
                    {/* Section header row */}
                    <tr>
                      <td
                        colSpan={2 + roles.length * 4}
                        className="px-3 py-1.5 bg-slate-50 border-y border-slate-200 sticky left-0"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {ENTITY_TYPE_ICONS[type] ?? '📄'} {type}
                          <span className="ml-2 font-normal text-slate-400">({grouped[type].length})</span>
                        </span>
                      </td>
                    </tr>

                    {/* Entity rows */}
                    {grouped[type].map((entityId, i) => {
                      const meta = entityMeta[entityId];
                      const rowPerms = pivot[entityId] ?? {};
                      return (
                        <tr
                          key={entityId}
                          className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-indigo-50/30`}
                        >
                          <td className="px-3 py-2 text-slate-400 sticky left-0 bg-inherit text-[10px]">{i + 1}</td>
                          <td className="px-3 py-2 sticky left-8 bg-inherit">
                            <div className="font-semibold text-slate-700 truncate max-w-48">{meta?.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">{entityId}</div>
                          </td>
                          {roles.map(role => {
                            const p = rowPerms[role];
                            return PERM_ICONS.map(perm => (
                              <td key={`${role}-${perm.key}`} className="px-1 py-2 text-center">
                                {p ? (
                                  <span
                                    className={`text-sm ${(p as any)[perm.key] ? perm.color : 'opacity-15 grayscale'}`}
                                    title={`${role}: ${perm.label} = ${(p as any)[perm.key] ? 'Granted' : 'Denied'}`}
                                  >
                                    {perm.icon}
                                  </span>
                                ) : (
                                  <span className="text-slate-200 text-sm" title="No policy defined">—</span>
                                )}
                              </td>
                            ));
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && roles.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
            <strong>No roles found.</strong> Create Role Profiles in Master Data → Role Profiles first.
            The matrix columns will appear automatically once roles are defined.
          </div>
        )}
      </div>
    </div>
  );
};
