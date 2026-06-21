// WHY THIS COMPONENT EXISTS:
// Role Profile Studio — the master data screen where System Administrators define
// what roles exist on the platform. A "role" here is a named permission template
// (e.g. COMPLIANCE_OFFICER, TRADE_OPERATIONS, NOSTRO_RECONCILER) that a bank can
// create without a developer changing any code.
//
// Previously roles were hardcoded as ALL_ROLES in routers/entitlements.py.
// That violated ADR #3 and made banks call their integration partner every time they
// needed a new role. Now a System Administrator creates it here, and it immediately
// appears as a column in the Entitlement Configuration matrix.
//
// WHAT BREAKS IF REMOVED: The only way to add a new role is a code change + redeploy.
// The Entitlement Configuration studio loses its dynamic column capability.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface RoleProfile {
  role_id: string;
  role_code: string;
  role_name: string;
  description?: string;
  package_id?: string;
  is_system_role: boolean;
  default_permissions: {
    can_view: boolean;
    can_modify_data: boolean;
    can_modify_design: boolean;
    can_approve: boolean;
  };
  status: string;
  created_at: string;
  created_by: string;
}

const blank = (): Partial<RoleProfile> => ({
  role_code: '', role_name: '', status: 'ACTIVE', is_system_role: false,
  default_permissions: { can_view: true, can_modify_data: false, can_modify_design: false, can_approve: false },
});

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:   'bg-emerald-100 text-emerald-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
};

const PERM_LABELS = [
  { key: 'can_view',          label: 'View',          desc: 'Can open and read entities' },
  { key: 'can_modify_data',   label: 'Modify Data',   desc: 'Can enter/edit data (no design change)' },
  { key: 'can_modify_design', label: 'Modify Design', desc: 'Can change structure (triggers lifecycle)' },
  { key: 'can_approve',       label: 'Approve',       desc: '4-Eye approver for entities' },
] as const;

export const RoleProfileStudio: React.FC = () => {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<RoleProfile | null>(null);
  const [form, setForm] = useState<Partial<RoleProfile>>(blank());
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view');

  const { data, isLoading } = useQuery({
    queryKey: ['role-profiles'],
    queryFn: () => apiClient.get('/roles-users/roles').then(r => r.data),
  });
  const roles: RoleProfile[] = data?.roles ?? [];

  const create = useMutation({
    mutationFn: (d: any) => apiClient.post('/roles-users/roles', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['role-profiles'] }); setMode('view'); },
  });
  const update = useMutation({
    mutationFn: ({ id, d }: any) => apiClient.patch(`/roles-users/roles/${id}`, d).then(r => r.data),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['role-profiles'] }); setSelected(data); setMode('view'); },
  });

  const togglePerm = (key: keyof RoleProfile['default_permissions']) => {
    setForm(f => ({
      ...f,
      default_permissions: {
        ...f.default_permissions!,
        [key]: !(f.default_permissions as any)?.[key],
      }
    }));
  };

  return (
    <div className="flex h-full bg-slate-50">
      {/* List */}
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Role Profiles</span>
          <button
            onClick={() => { setForm(blank()); setSelected(null); setMode('new'); }}
            className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
          >+ New</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-4 text-xs text-slate-400">Loading…</div>}
          {roles.map(role => (
            <button
              key={role.role_id}
              onClick={() => { setSelected(role); setForm(role); setMode('view'); }}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${selected?.role_id === role.role_id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 font-mono">{role.role_code}</span>
                <div className="flex items-center gap-1">
                  {role.is_system_role && <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500">SYSTEM</span>}
                  <span className={`text-[9px] px-1.5 rounded font-semibold ${STATUS_COLORS[role.status] ?? 'bg-slate-100 text-slate-500'}`}>{role.status}</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{role.role_name}</div>
              {/* Mini permission bar */}
              <div className="flex gap-1 mt-1.5">
                {PERM_LABELS.map(p => (
                  <span
                    key={p.key}
                    className={`text-[9px] px-1 rounded ${role.default_permissions?.[p.key] ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}
                    title={p.label}
                  >{p.label[0]}</span>
                ))}
              </div>
            </button>
          ))}
          {!isLoading && roles.length === 0 && (
            <div className="p-4 text-xs text-slate-400 text-center">
              No roles yet.<br />Create the first role to enable the entitlement matrix.
            </div>
          )}
        </div>
      </div>

      {/* Detail / form */}
      <div className="flex-1 overflow-y-auto p-6">
        {mode === 'view' && !selected && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="text-5xl mb-3">🏷</div>
            <p className="text-sm font-medium">Select a role or create a new one</p>
            <p className="text-xs mt-1 text-center max-w-sm">
              Roles are the permission templates for the platform. Each role defines default
              access levels that seed the Entitlement Configuration matrix for new entities.
            </p>
          </div>
        )}

        {(mode !== 'view' || selected) && (
          <div className="max-w-xl">
            {mode === 'view' && selected ? (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-800 font-mono">{selected.role_code}</h2>
                      {selected.is_system_role && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">SYSTEM ROLE</span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${STATUS_COLORS[selected.status]}`}>{selected.status}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{selected.role_name}</p>
                    {selected.description && <p className="text-xs text-slate-400 mt-1">{selected.description}</p>}
                  </div>
                  {!selected.is_system_role && (
                    <button
                      onClick={() => { setForm({ ...selected }); setMode('edit'); }}
                      className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold"
                    >Edit</button>
                  )}
                </div>

                {/* Default permissions card */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Default Permissions
                    <span className="ml-2 font-normal text-slate-400 normal-case">Applied when a new entity goes LIVE</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {PERM_LABELS.map(p => (
                      <div key={p.key} className={`flex items-center gap-2 p-3 rounded-lg border ${selected.default_permissions?.[p.key] ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className={`w-4 h-4 rounded flex items-center justify-center text-white text-xs font-bold ${selected.default_permissions?.[p.key] ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                          {selected.default_permissions?.[p.key] ? '✓' : '✗'}
                        </div>
                        <div>
                          <div className={`text-xs font-semibold ${selected.default_permissions?.[p.key] ? 'text-indigo-700' : 'text-slate-500'}`}>{p.label}</div>
                          <div className="text-[10px] text-slate-400">{p.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500">
                  <span className="font-semibold text-slate-600">Created:</span> {new Date(selected.created_at).toLocaleDateString()} by {selected.created_by}
                </div>
              </>
            ) : (
              /* Edit / New form */
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <h2 className="text-sm font-bold text-slate-700">
                  {mode === 'new' ? 'New Role Profile' : 'Edit Role Profile'}
                </h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Role Code *</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono uppercase"
                      value={form.role_code ?? ''}
                      onChange={e => setForm(f => ({ ...f, role_code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                      placeholder="e.g. COMPLIANCE_OFFICER"
                      disabled={mode === 'edit'}
                    />
                    {mode === 'edit' && <div className="text-[10px] text-slate-400 mt-1">Role code cannot be changed after creation.</div>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Display Name *</label>
                    <input
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                      value={form.role_name ?? ''}
                      onChange={e => setForm(f => ({ ...f, role_name: e.target.value }))}
                      placeholder="e.g. Compliance Officer"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Description</label>
                    <textarea
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs h-16"
                      value={form.description ?? ''}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What does this role do? Who should be assigned it?"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Status</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.status ?? 'ACTIVE'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      <option>ACTIVE</option><option>INACTIVE</option>
                    </select>
                  </div>
                </div>

                {/* Default permissions */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-2">
                    Default Permissions
                    <span className="ml-2 font-normal text-slate-400">Seeded to the entitlement matrix when a new entity goes LIVE</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PERM_LABELS.map(p => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => togglePerm(p.key)}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${(form.default_permissions as any)?.[p.key] ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center text-white text-xs font-bold shrink-0 ${(form.default_permissions as any)?.[p.key] ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                          {(form.default_permissions as any)?.[p.key] ? '✓' : ''}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-700">{p.label}</div>
                          <div className="text-[10px] text-slate-400">{p.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      if (mode === 'new') create.mutate(form);
                      else if (selected) update.mutate({ id: selected.role_id, d: form });
                    }}
                    disabled={create.isPending || update.isPending || !form.role_code || !form.role_name}
                    className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {create.isPending || update.isPending ? 'Saving…' : 'Save Role'}
                  </button>
                  <button onClick={() => setMode('view')} className="text-xs px-3 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">Cancel</button>
                </div>

                {(create.isError || update.isError) && (
                  <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2">
                    {(create.error as any)?.response?.data?.detail ?? (update.error as any)?.response?.data?.detail ?? 'Save failed'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
