// WHY THIS FILE EXISTS (WS-8):
// Entitlement Configuration Module — the single place where an admin
// controls who can do what across every live entity on the platform.
//
// When any entity (screen, workflow, rule, report) goes LIVE, it is
// automatically registered here with deny-by-default permissions.
// The admin opens this studio, selects an entity type, and toggles
// VIEW / MODIFY DATA / MODIFY DESIGN / APPROVE per role.
//
// This replaces ALL hardcoded role checks in the frontend (ADR #3).
// No developer involvement needed to change who can access what.
//
// WHAT BREAKS IF REMOVED: Bank has no way to control access without
// a developer code change and redeploy — destroying the no-code promise.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

// All roles on the platform — order determines column order in the matrix
const ROLES = ['ADMIN', 'OPERATOR', 'AUDITOR', 'RISK', 'SALES', 'C_LEVEL', 'VIEWER'];

const ROLE_COLORS: Record<string, string> = {
  ADMIN:    'bg-indigo-100 text-indigo-700',
  OPERATOR: 'bg-emerald-100 text-emerald-700',
  AUDITOR:  'bg-purple-100 text-purple-700',
  RISK:     'bg-rose-100 text-rose-700',
  SALES:    'bg-amber-100 text-amber-700',
  C_LEVEL:  'bg-slate-100 text-slate-700',
  VIEWER:   'bg-slate-100 text-slate-500',
};

const ENTITY_TYPES = [
  { code: 'SCREEN',         label: 'Screens',        icon: '🖥️' },
  { code: 'WORKFLOW',       label: 'Workflows',       icon: '🔄' },
  { code: 'RULE',           label: 'Business Rules',  icon: '⚖️' },
  { code: 'CALCULATION',    label: 'Calculations',    icon: '🧮' },
  { code: 'REPORT',         label: 'Reports',         icon: '📊' },
  { code: 'INTEGRATION',    label: 'API Integrations',icon: '🔌' },
  { code: 'RECONCILIATION', label: 'Reconciliation',  icon: '🔁' },
];

// Permission columns shown in the matrix
const PERMISSIONS = [
  { key: 'can_view',          label: 'View',           desc: 'Can open and read this entity' },
  { key: 'can_modify_data',   label: 'Modify Data',    desc: 'Can enter/edit data (no design change)' },
  { key: 'can_modify_design', label: 'Modify Design',  desc: 'Can change structure (triggers lifecycle)' },
  { key: 'can_approve',       label: 'Approve',        desc: '4-Eye approver for this entity' },
];

export const EntitlementConfigStudio: React.FC = () => {
  const { activeProductContext } = usePlatformStore();
  const queryClient = useQueryClient();
  const [selectedEntityType, setSelectedEntityType] = useState('SCREEN');
  const [search, setSearch] = useState('');

  // WHY THIS EXISTS: `activeProductContext` is the package NAME ("Payment Hub"),
  // but /entitlements/summary filters on package_id (PKG-XXXX). Passing the name
  // returned an empty matrix. Resolve name → id via the packages master.
  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data,
    enabled: !!activeProductContext,
  });
  const resolvedPackageId = packagesData?.packages?.find(
    (p: any) => p.package_name === activeProductContext
  )?.package_id ?? null;

  const { data: matrixData, isLoading } = useQuery({
    queryKey: ['entitlements-matrix', resolvedPackageId, selectedEntityType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (resolvedPackageId) params.set('package_id', resolvedPackageId);
      if (selectedEntityType) params.set('entity_type', selectedEntityType);
      const res = await apiClient.get(`/entitlements/summary?${params}`);
      return res.data;
    }
  });

  // PATCH a single permission toggle
  const toggleMutation = useMutation({
    mutationFn: async ({ policyId, permission, value }: { policyId: string; permission: string; value: boolean }) =>
      apiClient.patch(`/entitlements/${policyId}?${permission}=${value}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entitlements-matrix'] })
  });

  const entities: any[] = (matrixData?.matrix ?? []).filter((e: any) =>
    e.entity_type === selectedEntityType &&
    e.entity_name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedType = ENTITY_TYPES.find(t => t.code === selectedEntityType);

  return (
    <div className="space-y-6 animate-fade-in">
      <InfinityAIHelper studioKey="entitlements" />

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-3xl p-7 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔐</span>
            <h1 className="text-xl font-extrabold text-white tracking-tight">Entitlement Configuration</h1>
          </div>
          <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
            Every entity that goes LIVE is registered here. Grant or revoke VIEW / MODIFY DATA / MODIFY DESIGN / APPROVE per role.
            No code change. No redeploy. Changes take effect immediately.
          </p>
        </div>
        <div className="flex items-center gap-2 z-10 shrink-0">
          <span className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            ADR #3 Compliant — No Hardcoded Access
          </span>
        </div>
      </div>

      {/* ── Entity type tabs ──────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {ENTITY_TYPES.map(et => (
          <button
            key={et.code}
            onClick={() => setSelectedEntityType(et.code)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
              selectedEntityType === et.code
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            <span>{et.icon}</span>
            {et.label}
          </button>
        ))}
      </div>

      {/* ── Permission Matrix ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden">
        {/* Table header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-base">{selectedType?.icon}</span>
            <h2 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest">
              {selectedType?.label} — Permission Matrix
            </h2>
            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold">
              {entities.length} entities
            </span>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${selectedType?.label?.toLowerCase()}...`}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg w-48 focus:outline-none focus:border-indigo-400"
          />
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading entitlements...</div>
        ) : entities.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-3xl">🔐</div>
            <div className="text-sm font-semibold text-slate-500">No {selectedType?.label} registered yet</div>
            <div className="text-xs text-slate-400">
              Entities are auto-registered when they go LIVE. Make a {selectedType?.label.slice(0, -1).toLowerCase()} live to see it here.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left p-3 font-bold text-slate-500 uppercase tracking-wide text-[9px] min-w-[180px]">Entity</th>
                  {ROLES.map(role => (
                    <th key={role} className="p-3 text-center min-w-[120px]">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide ${ROLE_COLORS[role]}`}>
                        {role}
                      </span>
                    </th>
                  ))}
                </tr>
                {/* Permission sub-header */}
                <tr className="border-b border-slate-50 bg-slate-50/30">
                  <th className="p-2" />
                  {ROLES.map(role => (
                    <th key={role} className="p-1">
                      <div className="grid grid-cols-4 gap-0.5">
                        {PERMISSIONS.map(perm => (
                          <div key={perm.key} title={perm.desc} className="text-[8px] text-center text-slate-400 font-semibold leading-tight px-0.5">
                            {perm.label.split(' ')[0]}
                          </div>
                        ))}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entities.map((entity: any, idx: number) => (
                  <tr key={entity.entity_id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/20'}`}>
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{entity.entity_name}</div>
                      <div className="text-[9px] text-slate-400 font-mono mt-0.5">{entity.entity_id}</div>
                    </td>
                    {ROLES.map(role => {
                      const rolePolicy = entity.roles?.[role];
                      if (!rolePolicy) {
                        return (
                          <td key={role} className="p-3 text-center">
                            <span className="text-[9px] text-slate-300">—</span>
                          </td>
                        );
                      }
                      return (
                        <td key={role} className="p-1">
                          <div className="grid grid-cols-4 gap-0.5">
                            {PERMISSIONS.map(perm => {
                              const isOn = rolePolicy[perm.key];
                              // ADMIN can_view is always locked on
                              const isLocked = role === 'ADMIN' && perm.key === 'can_view';
                              return (
                                <button
                                  key={perm.key}
                                  disabled={isLocked || toggleMutation.isPending}
                                  title={`${role} — ${perm.desc}`}
                                  onClick={() => toggleMutation.mutate({
                                    policyId: rolePolicy.policy_id,
                                    permission: perm.key,
                                    value: !isOn
                                  })}
                                  className={`w-full h-6 rounded text-[8px] font-bold transition-all border ${
                                    isLocked
                                      ? 'bg-indigo-100 border-indigo-200 text-indigo-600 cursor-not-allowed'
                                      : isOn
                                        ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600'
                                        : 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'
                                  }`}
                                >
                                  {isOn ? '✓' : '×'}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Permission legend */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/30 flex flex-wrap gap-4">
          {PERMISSIONS.map(p => (
            <div key={p.key} className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <div className="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center text-white text-[8px] font-bold">✓</div>
              <span className="font-semibold">{p.label}</span>
              <span className="text-slate-400">— {p.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
