// WHY THIS COMPONENT EXISTS:
// User Profile Studio — where System Administrators create and manage the people
// who log into InfinityProductOS. Each user has a primary role and optionally
// additional roles (multi-role users, e.g. a team lead who is both OPERATOR and RISK).
//
// Currently in local dev, the X-User-Id header provides identity and all users are
// effectively "designer_admin". In production (OIDC), the JWT provides user_id.
// This studio pre-provisions users so their profile exists before first login.
//
// UserProfiles also serve the Queue entitlements system: MessageQueue.allowed_user_ids
// references user_ids here for temporary queue access overrides (weekend cover, staff absence)
// — without needing to change the user's role permanently.
//
// WHAT BREAKS IF REMOVED: Queue entitlement user overrides have no validation source.
// Audit logs show user_id strings with no way to resolve them to real names.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

interface UserProfile {
  user_id: string;
  username: string;
  display_name: string;
  email?: string;
  primary_role_code: string;
  additional_role_codes: string[];
  package_ids: string[];
  explicit_queue_ids: string[];
  status: string;
  last_login_at?: string;
  created_at: string;
  created_by: string;
}

const blank = (): Partial<UserProfile> => ({
  username: '', display_name: '', primary_role_code: '',
  additional_role_codes: [], package_ids: [], explicit_queue_ids: [], status: 'ACTIVE',
});

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    'bg-emerald-100 text-emerald-700',
  SUSPENDED: 'bg-amber-100 text-amber-700',
  LOCKED:    'bg-red-100 text-red-700',
};

const initials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500',
  'bg-sky-500', 'bg-amber-500', 'bg-teal-500',
];

export const UserProfileStudio: React.FC = () => {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<Partial<UserProfile>>(blank());
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: () => apiClient.get('/roles-users/users').then(r => r.data),
  });
  const allUsers: UserProfile[] = usersData?.users ?? [];

  const { data: rolesData } = useQuery({
    queryKey: ['role-profiles'],
    queryFn: () => apiClient.get('/roles-users/roles').then(r => r.data),
  });
  const roles: Array<{ role_id: string; role_code: string; role_name: string }> = rolesData?.roles ?? [];

  const users = allUsers.filter(u => {
    const matchSearch = !search || u.display_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase());
    const matchRole = !roleFilter || u.primary_role_code === roleFilter;
    return matchSearch && matchRole;
  });

  const create = useMutation({
    mutationFn: (d: any) => apiClient.post('/roles-users/users', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['user-profiles'] }); setMode('view'); },
  });
  const update = useMutation({
    mutationFn: ({ id, d }: any) => apiClient.patch(`/roles-users/users/${id}`, d).then(r => r.data),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['user-profiles'] }); setSelected(data); setMode('view'); },
  });

  return (
    <div className="flex h-full bg-slate-50">
      {/* List */}
      <div className="w-72 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Users</span>
          <button
            onClick={() => { setForm(blank()); setSelected(null); setMode('new'); }}
            className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
          >+ New</button>
        </div>

        {/* Search + filter */}
        <div className="p-2 border-b border-slate-100 space-y-1.5">
          <input
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="">All roles</option>
            {roles.map(r => <option key={r.role_id} value={r.role_code}>{r.role_code}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-4 text-xs text-slate-400">Loading…</div>}
          {users.map((user, i) => (
            <button
              key={user.user_id}
              onClick={() => { setSelected(user); setForm(user); setMode('view'); }}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-center gap-2.5 ${selected?.user_id === user.user_id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                {initials(user.display_name)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 truncate">{user.display_name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-slate-400 truncate">@{user.username}</span>
                  <span className={`text-[9px] px-1 rounded font-semibold ${STATUS_COLORS[user.status] ?? 'bg-slate-100'}`}>{user.status}</span>
                </div>
                <div className="text-[10px] text-indigo-500 font-mono mt-0.5">{user.primary_role_code}</div>
              </div>
            </button>
          ))}
          {!isLoading && users.length === 0 && (
            <div className="p-4 text-xs text-slate-400 text-center">
              {search || roleFilter ? 'No users match the filter.' : 'No users yet. Create the first user.'}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400 text-right">
          {users.length} of {allUsers.length} users
        </div>
      </div>

      {/* Detail / form */}
      <div className="flex-1 overflow-y-auto p-6">
        {mode === 'view' && !selected && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="text-5xl mb-3">🧑‍💼</div>
            <p className="text-sm font-medium">Select a user or create a new one</p>
            <p className="text-xs mt-1 text-center max-w-sm">
              User Profiles link display names to user IDs across audit logs, entitlements,
              and queue access overrides.
            </p>
          </div>
        )}

        {(mode !== 'view' || selected) && (
          <div className="max-w-xl">
            {mode === 'view' && selected ? (
              <>
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold ${AVATAR_COLORS[allUsers.indexOf(selected) % AVATAR_COLORS.length]}`}>
                      {initials(selected.display_name)}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-800">{selected.display_name}</h2>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-slate-500">@{selected.username}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${STATUS_COLORS[selected.status]}`}>{selected.status}</span>
                      </div>
                      {selected.email && <div className="text-xs text-slate-400 mt-0.5">{selected.email}</div>}
                    </div>
                  </div>
                  <button
                    onClick={() => { setForm({ ...selected }); setMode('edit'); }}
                    className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold"
                  >Edit</button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Primary Role</div>
                    <div className="text-xs font-bold text-indigo-600 font-mono">{selected.primary_role_code}</div>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">User ID</div>
                    <div className="text-xs font-mono text-slate-600">{selected.user_id}</div>
                  </div>
                </div>

                {selected.additional_role_codes.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Additional Roles</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.additional_role_codes.map(r => (
                        <span key={r} className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100 font-mono">{r}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.package_ids.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Package Access</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.package_ids.map(p => (
                        <span key={p} className="text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-100">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.package_ids.length === 0 && (
                  <div className="text-xs text-slate-500 mb-4 bg-amber-50 border border-amber-100 rounded-lg p-3">
                    No package restrictions — this user has access to all packages.
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500 space-y-1">
                  <div><span className="font-semibold text-slate-600">Created:</span> {new Date(selected.created_at).toLocaleDateString()} by {selected.created_by}</div>
                  {selected.last_login_at && <div><span className="font-semibold text-slate-600">Last login:</span> {new Date(selected.last_login_at).toLocaleString()}</div>}
                </div>
              </>
            ) : (
              /* Edit / New form */
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <h2 className="text-sm font-bold text-slate-700">
                  {mode === 'new' ? 'New User Profile' : 'Edit User'}
                </h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Username *</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.username ?? ''} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. john.smith" disabled={mode === 'edit'} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Display Name *</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.display_name ?? ''} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="e.g. John Smith" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Email</label>
                    <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value || undefined }))} placeholder="john.smith@bank.com" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Primary Role *</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.primary_role_code ?? ''} onChange={e => setForm(f => ({ ...f, primary_role_code: e.target.value }))}>
                      <option value="">— select role —</option>
                      {roles.map(r => <option key={r.role_id} value={r.role_code}>{r.role_code} — {r.role_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Status</label>
                    <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={form.status ?? 'ACTIVE'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      <option>ACTIVE</option><option>SUSPENDED</option><option>LOCKED</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Additional Roles (comma-separated)</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono" value={(form.additional_role_codes ?? []).join(', ')} onChange={e => setForm(f => ({ ...f, additional_role_codes: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) }))} placeholder="RISK, AUDITOR" />
                    <div className="text-[10px] text-slate-400 mt-1">User has access if ANY of their roles (primary + additional) grants permission.</div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">Package Access (comma-separated package IDs)</label>
                    <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={(form.package_ids ?? []).join(', ')} onChange={e => setForm(f => ({ ...f, package_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="Leave empty for access to all packages" />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      if (mode === 'new') create.mutate(form);
                      else if (selected) update.mutate({ id: selected.user_id, d: form });
                    }}
                    disabled={create.isPending || update.isPending || !form.username || !form.display_name || !form.primary_role_code}
                    className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {create.isPending || update.isPending ? 'Saving…' : 'Save User'}
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
