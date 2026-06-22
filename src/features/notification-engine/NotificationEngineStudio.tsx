// WHY THIS COMPONENT EXISTS (WS-7 — Notification Engine):
// Design notification policies — versioned containers of notification triggers
// that attach to workflow nodes. When a workflow node executes, the Runtime Engine
// fires every LIVE trigger in the attached policy in order.
//
// Three channels:
//   EMAIL    → sends email and workflow continues immediately
//   SMS_WAIT → sends SMS and PAUSES the workflow until customer replies
//              (timeout/escalation is a workflow graph concern, not ours)
//   LETTER   → dispatches a PDF letter and workflow continues
//
// Three recipient modes:
//   ROLE_BASED → bank staff (RISK, OPS, ADMIN...)
//   ISO_FIELD  → end customer via transaction data (BeneficiaryPhone, OriginatorEmail)
//   STATIC     → external partners / fixed addresses
//
// WHAT BREAKS IF REMOVED:
// Workflow nodes cannot send any notifications. No customer confirmations,
// no risk alerts, no SMS-wait approval gates — the entire communication
// layer of the payment platform disappears.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

type LifecycleStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'LIVE' | 'ARCHIVED';
type ChannelType = 'EMAIL' | 'SMS_WAIT' | 'LETTER';
type RecipientMode = 'ROLE_BASED' | 'ISO_FIELD' | 'STATIC';

const STATUS_META: Record<LifecycleStatus, { color: string; label: string }> = {
  DRAFT:            { color: 'bg-slate-100 text-slate-600',    label: 'Draft' },
  PENDING_APPROVAL: { color: 'bg-amber-100 text-amber-700',    label: 'Pending Approval' },
  LIVE:             { color: 'bg-emerald-100 text-emerald-700', label: 'Live' },
  ARCHIVED:         { color: 'bg-slate-100 text-slate-400',    label: 'Archived' },
};

const CHANNEL_META: Record<ChannelType, { icon: string; label: string; color: string; desc: string }> = {
  EMAIL:    { icon: '📧', label: 'Email',    color: 'bg-blue-50 border-blue-200 text-blue-700',    desc: 'Send email and workflow continues immediately' },
  SMS_WAIT: { icon: '💬', label: 'SMS Wait', color: 'bg-violet-50 border-violet-200 text-violet-700', desc: 'Send SMS and PAUSE workflow until customer replies' },
  LETTER:   { icon: '📮', label: 'Letter',   color: 'bg-amber-50 border-amber-200 text-amber-700',  desc: 'Dispatch PDF letter and workflow continues' },
};

const ROLES = ['ADMIN', 'OPERATOR', 'AUDITOR', 'RISK', 'SALES', 'C_LEVEL', 'VIEWER'];

// Common ISO contact fields for end-customer notification
const ISO_CONTACT_FIELDS = [
  'ISO.BeneficiaryEmail',
  'ISO.BeneficiaryPhone',
  'ISO.OriginatorEmail',
  'ISO.OriginatorPhone',
  'ISO.DebtorContactEmail',
  'ISO.CreditorContactEmail',
  'ISO.RemittanceEmail',
  'ISO.NotificationEmail',
];

const blankTrigger = (): TriggerDraft => ({
  trigger_name: '',
  comm_template_id: '',
  notification_type: 'EMAIL' as ChannelType,
  recipient_mode: 'ROLE_BASED' as RecipientMode,
  recipient_role: 'RISK',
  recipient_iso_field: '',
  recipient_static: '',
  audience_label: '',
  wait_for_reply: false,
  timeout_minutes: 30,
});

interface TriggerDraft {
  trigger_name: string;
  comm_template_id: string;
  notification_type: ChannelType;
  recipient_mode: RecipientMode;
  recipient_role: string;
  recipient_iso_field: string;
  recipient_static: string;
  audience_label: string;
  wait_for_reply: boolean;
  timeout_minutes: number;
}

export const NotificationEngineStudio: React.FC = () => {
  const { activeProductContext } = usePlatformStore();
  const queryClient = useQueryClient();

  // WHY THIS EXISTS: `activeProductContext` is the package NAME ("Payment Hub"),
  // but the notification-policies API filters on package_id (PKG-XXXX). Passing the
  // name as package_id silently matched zero rows — the studio always showed
  // "No policies yet". We resolve name → id via the packages master.
  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data,
    enabled: !!activeProductContext,
  });
  const resolvedPackageId = packagesData?.packages?.find(
    (p: any) => p.package_name === activeProductContext
  )?.package_id ?? null;

  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [header, setHeader] = useState({ policy_name: '', description: '' });
  const [draftTriggers, setDraftTriggers] = useState<TriggerDraft[]>([blankTrigger()]);
  const [addingTrigger, setAddingTrigger] = useState(false);
  const [newTrigger, setNewTrigger] = useState<TriggerDraft>(blankTrigger());

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: listData, isLoading } = useQuery({
    queryKey: ['notification-policies', resolvedPackageId],
    queryFn: async () => {
      const params = resolvedPackageId ? `?package_id=${resolvedPackageId}` : '';
      return (await apiClient.get(`/notification-policies/${params}`)).data;
    },
    enabled: view === 'list',
  });

  const { data: editData } = useQuery({
    queryKey: ['notification-policy', editingId],
    queryFn: async () => (await apiClient.get(`/notification-policies/${editingId}`)).data,
    enabled: !!editingId && view === 'editor',
  });

  const { data: templatesData } = useQuery({
    queryKey: ['live-comm-templates', resolvedPackageId],
    queryFn: async () => {
      const params = resolvedPackageId ? `?package_id=${resolvedPackageId}` : '';
      return (await apiClient.get(`/notification-policies/comm-templates/live${params}`)).data;
    },
    enabled: view === 'editor',
  });

  const liveTemplates: any[] = templatesData?.templates ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => apiClient.post('/notification-policies/', {
      ...header,
      application_package_id: resolvedPackageId || undefined,
      triggers: draftTriggers.filter(t => t.trigger_name.trim()),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-policies'] });
      setView('list');
      setHeader({ policy_name: '', description: '' });
      setDraftTriggers([blankTrigger()]);
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Create failed'),
  });

  const addTriggerMutation = useMutation({
    mutationFn: async (policyId: string) =>
      apiClient.post(`/notification-policies/${policyId}/triggers`, newTrigger),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-policy', editingId] });
      setNewTrigger(blankTrigger());
      setAddingTrigger(false);
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Add trigger failed'),
  });

  const removeTriggerMutation = useMutation({
    mutationFn: async ({ policyId, triggerId }: { policyId: string; triggerId: string }) =>
      apiClient.delete(`/notification-policies/${policyId}/triggers/${triggerId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-policy', editingId] }),
    onError: (e: any) => alert(e.response?.data?.detail || 'Remove failed'),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/notification-policies/${id}/submit`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-policies'] });
      queryClient.invalidateQueries({ queryKey: ['notification-policy', editingId] });
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Submit failed'),
  });

  const makeLiveMutation = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/notification-policies/${id}/make-live`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-policies'] });
      queryClient.invalidateQueries({ queryKey: ['notification-policy', editingId] });
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Make Live failed'),
  });

  const updateDraft = (idx: number, patch: Partial<TriggerDraft>) =>
    setDraftTriggers(ts => ts.map((t, i) => i === idx ? { ...t, ...patch } : t));

  const policies: any[] = listData?.policies ?? [];

  // ── List View ─────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="space-y-6 animate-fade-in">
        <InfinityAIHelper studioKey="notification-engine" />

        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-3xl p-7 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="z-10 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔔</span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">Notification Engine</h1>
            </div>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              Design notification policies that attach to workflow nodes. EMAIL and LETTER continue the workflow instantly. SMS Wait pauses the workflow until the customer replies — timeout and escalation are configured in the Workflow Designer.
            </p>
          </div>
          <button
            onClick={() => { setEditingId(null); setView('editor'); }}
            className="px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 transition-all shadow-md shrink-0 z-10"
          >
            + New Policy
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading policies...</div>
        ) : policies.length === 0 ? (
          <div className="bg-white border border-slate-150 rounded-2xl p-12 text-center space-y-3 shadow-glass">
            <div className="text-4xl">🔔</div>
            <div className="text-sm font-bold text-slate-600">No notification policies yet</div>
            <div className="text-xs text-slate-400 max-w-sm mx-auto">
              Create a policy with EMAIL, SMS Wait, and LETTER triggers. Attach it to a workflow node in the Workflow Designer.
            </div>
            <button
              onClick={() => setView('editor')}
              className="px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 transition-all mt-2"
            >
              + Create First Policy
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {policies.map((p: any) => {
              // Defensive fallback: a record with an unknown status (e.g. a legacy
              // 'ACTIVE' value not in the lifecycle) must not crash the whole studio.
              const statusMeta = STATUS_META[p.status as LifecycleStatus]
                ?? { color: 'bg-slate-100 text-slate-500', label: p.status || 'Unknown' };
              const hasSmsWait = p.sms_wait_count > 0;
              return (
                <div key={p.policy_id} className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass hover:-translate-y-0.5 hover:border-violet-200 transition-all flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🔔</span>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{p.policy_name}</div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">{p.policy_id} · v{p.version_number}</div>
                      </div>
                    </div>
                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${statusMeta.color}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* Channel summary chips */}
                  <div className="flex gap-2 flex-wrap">
                    {(['EMAIL', 'SMS_WAIT', 'LETTER'] as ChannelType[]).map(ch => {
                      const count = (p.triggers || []).filter((t: any) => t.notification_type === ch).length;
                      if (!count) return null;
                      const meta = CHANNEL_META[ch];
                      return (
                        <span key={ch} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${meta.color}`}>
                          {meta.icon} {count} {meta.label}
                        </span>
                      );
                    })}
                    {hasSmsWait && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                        ⏸ Pauses workflow
                      </span>
                    )}
                  </div>

                  {/* Trigger list preview */}
                  {(p.triggers || []).slice(0, 3).map((t: any) => (
                    <div key={t.trigger_id} className="flex items-center gap-2 text-[10px]">
                      <span>{CHANNEL_META[t.notification_type as ChannelType]?.icon ?? '🔔'}</span>
                      <span className="text-slate-700 font-medium truncate">{t.trigger_name}</span>
                      <span className="text-slate-400 shrink-0">→ {t.audience_label || t.recipient_role || t.recipient_iso_field || t.recipient_static || '—'}</span>
                    </div>
                  ))}
                  {(p.triggers || []).length > 3 && (
                    <div className="text-[9px] text-slate-400">+{p.triggers.length - 3} more triggers</div>
                  )}

                  <div className="flex gap-2 mt-auto pt-2 border-t border-slate-50">
                    <button
                      onClick={() => { setEditingId(p.policy_id); setView('editor'); }}
                      className="flex-1 py-1.5 text-[10px] font-bold text-violet-600 border border-violet-100 rounded-lg hover:bg-violet-50 transition-all"
                    >
                      {p.status === 'LIVE' ? 'View / New Version' : 'Edit'}
                    </button>
                    {p.status === 'DRAFT' && (
                      <button
                        onClick={() => submitMutation.mutate(p.policy_id)}
                        disabled={submitMutation.isPending}
                        className="flex-1 py-1.5 text-[10px] font-bold text-amber-600 border border-amber-100 rounded-lg hover:bg-amber-50 transition-all"
                      >
                        Submit
                      </button>
                    )}
                    {p.status === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => makeLiveMutation.mutate(p.policy_id)}
                        disabled={makeLiveMutation.isPending}
                        className="flex-1 py-1.5 text-[10px] font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-all"
                      >
                        ▶ Make it Live
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Editor View ─────────────────────────────────────────────────────────────
  const isEditing = !!editingId;
  const policy = editData;
  const isLive = policy?.status === 'LIVE';

  return (
    <div className="space-y-4 animate-fade-in">
      <InfinityAIHelper studioKey="notification-engine" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView('list'); setEditingId(null); }}
            className="text-xs text-slate-500 hover:text-violet-600 font-semibold flex items-center gap-1 transition-colors"
          >
            ← Back to Policies
          </button>
          <span className="text-slate-300">|</span>
          <h2 className="text-sm font-extrabold text-slate-800">
            {isEditing ? policy?.policy_name ?? 'Loading...' : 'New Policy'}
          </h2>
          {policy && (() => {
            const m = STATUS_META[policy.status as LifecycleStatus]
              ?? { color: 'bg-slate-100 text-slate-500', label: policy.status || 'Unknown' };
            return (
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${m.color}`}>
                {m.label}
              </span>
            );
          })()}
        </div>
        <div className="flex gap-2">
          {!isEditing && (
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !header.policy_name.trim() || draftTriggers.filter(t => t.trigger_name.trim()).length === 0}
              className="px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-all shadow-md"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Policy'}
            </button>
          )}
          {isEditing && policy?.status === 'DRAFT' && (
            <button
              onClick={() => submitMutation.mutate(editingId!)}
              disabled={submitMutation.isPending || !editData?.triggers?.length}
              className="px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-all"
            >
              Submit for Approval
            </button>
          )}
          {isEditing && policy?.status === 'PENDING_APPROVAL' && (
            <button
              onClick={() => makeLiveMutation.mutate(editingId!)}
              disabled={makeLiveMutation.isPending}
              className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all"
            >
              ▶ Make it Live
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* ── Left + center: triggers ───────────────────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* Header form (new only) */}
          {!isEditing && (
            <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass space-y-3">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Policy Details</div>
              <input
                value={header.policy_name}
                onChange={e => setHeader(h => ({ ...h, policy_name: e.target.value }))}
                placeholder="Policy name e.g. MT103 Approval Notifications"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400"
              />
              <input
                value={header.description}
                onChange={e => setHeader(h => ({ ...h, description: e.target.value }))}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400"
              />
            </div>
          )}

          {/* Triggers */}
          <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest">Notification Triggers</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Fired in order when the workflow node executes. SMS Wait pauses the workflow.</div>
              </div>
              {isEditing && !isLive && (
                <button
                  onClick={() => { setAddingTrigger(true); setNewTrigger(blankTrigger()); }}
                  className="px-3 py-1.5 text-[10px] font-bold text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-50 transition-all"
                >
                  + Add Trigger
                </button>
              )}
            </div>

            {/* Existing triggers (edit mode) */}
            {isEditing && (
              <div className="divide-y divide-slate-50">
                {(editData?.triggers ?? []).map((t: any, idx: number) => (
                  <TriggerRow
                    key={t.trigger_id}
                    trigger={t}
                    index={idx}
                    onRemove={!isLive ? () => removeTriggerMutation.mutate({ policyId: editingId!, triggerId: t.trigger_id }) : undefined}
                  />
                ))}
                {(editData?.triggers ?? []).length === 0 && !addingTrigger && (
                  <div className="p-8 text-center text-slate-400 text-xs">No triggers yet. Click "+ Add Trigger".</div>
                )}
              </div>
            )}

            {/* Draft triggers (new mode) */}
            {!isEditing && (
              <div className="p-4 space-y-4">
                {draftTriggers.map((t, idx) => (
                  <TriggerForm
                    key={idx}
                    trigger={t}
                    liveTemplates={liveTemplates}
                    onUpdate={patch => updateDraft(idx, patch)}
                    onRemove={draftTriggers.length > 1 ? () => setDraftTriggers(ts => ts.filter((_, i) => i !== idx)) : undefined}
                  />
                ))}
                <button
                  onClick={() => setDraftTriggers(ts => [...ts, blankTrigger()])}
                  className="w-full py-2 text-xs font-bold text-violet-500 border border-dashed border-violet-200 rounded-lg hover:bg-violet-50 transition-all"
                >
                  + Add Another Trigger
                </button>
              </div>
            )}

            {/* Inline add form (edit mode) */}
            {isEditing && addingTrigger && !isLive && (
              <div className="p-4 border-t border-slate-100 bg-violet-50/30">
                <div className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-3">New Trigger</div>
                <TriggerForm
                  trigger={newTrigger}
                  liveTemplates={liveTemplates}
                  onUpdate={patch => setNewTrigger(t => ({ ...t, ...patch }))}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => addTriggerMutation.mutate(editingId!)}
                    disabled={!newTrigger.trigger_name.trim() || addTriggerMutation.isPending}
                    className="px-3 py-1.5 text-[10px] font-bold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-all"
                  >
                    {addTriggerMutation.isPending ? 'Adding...' : 'Add Trigger'}
                  </button>
                  <button
                    onClick={() => setAddingTrigger(false)}
                    className="px-3 py-1.5 text-[10px] font-bold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: info panels ──────────────────────────────────── */}
        <div className="space-y-4">

          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">Channel Behaviour</div>
            {(['EMAIL', 'SMS_WAIT', 'LETTER'] as ChannelType[]).map(ch => {
              const meta = CHANNEL_META[ch];
              return (
                <div key={ch} className="flex gap-2 mb-3 last:mb-0">
                  <span className="shrink-0 text-base">{meta.icon}</span>
                  <div>
                    <div className="text-[10px] font-bold text-slate-700">{meta.label}</div>
                    <div className="text-[9px] text-slate-400 leading-relaxed">{meta.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">SMS Wait — Important</div>
            <div className="text-[9px] text-slate-500 leading-relaxed space-y-1.5">
              <p>When a trigger is SMS Wait, the workflow <strong>pauses</strong> at that node and waits for the recipient to reply.</p>
              <p>The <strong>timeout duration</strong> is set per trigger here.</p>
              <p><strong>What happens when it times out</strong> (escalate, auto-approve, re-route) is configured in the <strong>Workflow Designer</strong> as a graph edge condition — not here.</p>
            </div>
          </div>

          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Lifecycle</div>
            <div className="space-y-1.5">
              {[
                { s: 'DRAFT', d: 'Building trigger list' },
                { s: 'PENDING_APPROVAL', d: 'Awaiting 4-Eye review' },
                { s: 'LIVE', d: 'Fires on workflow node execution' },
                { s: 'ARCHIVED', d: 'Superseded by newer version' },
              ].map(row => (
                <div key={row.s} className="flex items-center gap-2">
                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${STATUS_META[row.s as LifecycleStatus].color}`}>
                    {STATUS_META[row.s as LifecycleStatus].label}
                  </span>
                  <span className="text-[9px] text-slate-400">{row.d}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-50 text-[9px] text-slate-400">
              Approver must differ from creator (4-Eye). Cannot modify triggers on a LIVE policy.
            </div>
          </div>

          {isEditing && policy && (
            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Summary</div>
              <div className="space-y-1 text-[10px] text-slate-600">
                <div><span className="font-semibold">ID:</span> <span className="font-mono">{policy.policy_id}</span></div>
                <div><span className="font-semibold">Version:</span> v{policy.version_number}</div>
                <div><span className="font-semibold">Triggers:</span> {policy.trigger_count}</div>
                {policy.sms_wait_count > 0 && <div><span className="font-semibold">SMS Waits:</span> {policy.sms_wait_count} ⏸</div>}
                <div><span className="font-semibold">Created by:</span> {policy.created_by}</div>
                {policy.made_live_by && <div><span className="font-semibold">Approved by:</span> {policy.made_live_by}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ── Trigger row (read-only display in edit mode) ────────────────────────────
const TriggerRow: React.FC<{
  trigger: any;
  index: number;
  onRemove?: () => void;
}> = ({ trigger, index, onRemove }) => {
  const meta = CHANNEL_META[trigger.notification_type as ChannelType];
  const recipient =
    trigger.recipient_mode === 'ROLE_BASED' ? `Role: ${trigger.recipient_role}` :
    trigger.recipient_mode === 'ISO_FIELD'  ? `Field: ${trigger.recipient_iso_field}` :
    `Static: ${trigger.recipient_static}`;
  return (
    <div className="flex items-start gap-3 p-4 hover:bg-slate-50/50 transition-colors">
      <span className="text-slate-400 text-[10px] font-mono w-4 shrink-0 mt-1">{index + 1}</span>
      <span className="text-lg shrink-0">{meta?.icon ?? '🔔'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800">{trigger.trigger_name}</span>
          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${meta?.color ?? ''}`}>{meta?.label}</span>
          {trigger.wait_for_reply && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
              ⏸ Wait {trigger.timeout_minutes ? `${trigger.timeout_minutes}m` : '∞'}
            </span>
          )}
        </div>
        <div className="text-[9px] text-slate-400 mt-0.5">{recipient}</div>
        {trigger.audience_label && <div className="text-[9px] text-slate-400">Audience: {trigger.audience_label}</div>}
      </div>
      {onRemove && (
        <button onClick={onRemove} className="text-slate-300 hover:text-rose-400 transition-colors text-sm shrink-0">×</button>
      )}
    </div>
  );
};


// ── Trigger form (new/edit) ─────────────────────────────────────────────────
const TriggerForm: React.FC<{
  trigger: TriggerDraft;
  liveTemplates: any[];
  onUpdate: (patch: Partial<TriggerDraft>) => void;
  onRemove?: () => void;
}> = ({ trigger, liveTemplates, onUpdate, onRemove }) => {
  return (
    <div className="bg-slate-50/60 border border-slate-150 rounded-xl p-4 space-y-3">
      {/* Name + remove */}
      <div className="flex gap-2">
        <input
          value={trigger.trigger_name}
          onChange={e => onUpdate({ trigger_name: e.target.value })}
          placeholder="Trigger name e.g. Notify Risk Team — AML Alert"
          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white"
        />
        {onRemove && (
          <button onClick={onRemove} className="text-slate-300 hover:text-rose-400 transition-colors px-1">×</button>
        )}
      </div>

      {/* Channel selector */}
      <div>
        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wide mb-1">Channel</div>
        <div className="flex gap-2">
          {(['EMAIL', 'SMS_WAIT', 'LETTER'] as ChannelType[]).map(ch => {
            const meta = CHANNEL_META[ch];
            const active = trigger.notification_type === ch;
            return (
              <button
                key={ch}
                onClick={() => onUpdate({ notification_type: ch, wait_for_reply: ch === 'SMS_WAIT' })}
                className={`flex-1 py-2 rounded-lg border text-[9px] font-bold transition-all ${active ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-violet-300'}`}
              >
                {meta.icon} {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Template picker */}
      <div>
        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wide mb-1">
          Comm Template <span className="text-slate-300 font-normal">(only LIVE templates shown)</span>
        </div>
        <select
          value={trigger.comm_template_id}
          onChange={e => onUpdate({ comm_template_id: e.target.value })}
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white"
        >
          <option value="">— Select template —</option>
          {liveTemplates
            .filter((t: any) => {
              if (trigger.notification_type === 'EMAIL') return t.template_type === 'EMAIL';
              if (trigger.notification_type === 'SMS_WAIT') return t.template_type === 'SMS';
              if (trigger.notification_type === 'LETTER') return t.template_type === 'LETTER';
              return true;
            })
            .map((t: any) => (
              <option key={t.template_id} value={t.template_id}>{t.template_name}</option>
            ))}
        </select>
        {liveTemplates.length === 0 && (
          <div className="text-[9px] text-amber-600 mt-1">No LIVE templates found. Create and publish templates in the Document Template Designer first.</div>
        )}
      </div>

      {/* Recipient mode */}
      <div>
        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wide mb-1">Recipient</div>
        <div className="flex gap-2 mb-2">
          {(['ROLE_BASED', 'ISO_FIELD', 'STATIC'] as RecipientMode[]).map(mode => {
            const labels: Record<RecipientMode, string> = { ROLE_BASED: '👤 Role', ISO_FIELD: '🔗 ISO Field', STATIC: '📌 Static' };
            return (
              <button
                key={mode}
                onClick={() => onUpdate({ recipient_mode: mode })}
                className={`flex-1 py-1.5 rounded-lg border text-[9px] font-bold transition-all ${trigger.recipient_mode === mode ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>

        {trigger.recipient_mode === 'ROLE_BASED' && (
          <select
            value={trigger.recipient_role}
            onChange={e => onUpdate({ recipient_role: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white"
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {trigger.recipient_mode === 'ISO_FIELD' && (
          <div className="space-y-1.5">
            <select
              value={trigger.recipient_iso_field}
              onChange={e => onUpdate({ recipient_iso_field: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white"
            >
              <option value="">— Select ISO contact field —</option>
              {ISO_CONTACT_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <input
              value={trigger.recipient_iso_field}
              onChange={e => onUpdate({ recipient_iso_field: e.target.value })}
              placeholder="Or type custom ISO field e.g. ISO.GuarantorEmail"
              className="w-full px-2.5 py-1.5 text-[10px] border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white"
            />
          </div>
        )}
        {trigger.recipient_mode === 'STATIC' && (
          <input
            value={trigger.recipient_static}
            onChange={e => onUpdate({ recipient_static: e.target.value })}
            placeholder="e.g. compliance@partner.com or +1-555-0100"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white"
          />
        )}
      </div>

      {/* Audience label */}
      <input
        value={trigger.audience_label}
        onChange={e => onUpdate({ audience_label: e.target.value })}
        placeholder="Audience label e.g. Customer, Risk Team, External Compliance Partner"
        className="w-full px-2.5 py-1.5 text-[10px] border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white"
      />

      {/* SMS Wait config */}
      {trigger.notification_type === 'SMS_WAIT' && (
        <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 space-y-2">
          <div className="text-[9px] font-bold text-violet-700 uppercase tracking-wide">⏸ SMS Wait Configuration</div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={trigger.wait_for_reply}
                onChange={e => onUpdate({ wait_for_reply: e.target.checked })}
                className="rounded"
              />
              Pause workflow and wait for customer reply
            </label>
          </div>
          {trigger.wait_for_reply && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 whitespace-nowrap">Timeout after</span>
              <input
                type="number"
                value={trigger.timeout_minutes}
                onChange={e => onUpdate({ timeout_minutes: Number(e.target.value) })}
                className="w-20 px-2 py-1 text-xs border border-violet-200 rounded-lg focus:outline-none focus:border-violet-400 text-center bg-white"
              />
              <span className="text-[9px] text-slate-500">minutes</span>
              <span className="text-[9px] text-violet-500 ml-1">→ escalation handled in Workflow Designer</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
