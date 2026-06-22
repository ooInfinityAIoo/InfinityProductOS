// WHY THIS FILE EXISTS (WS-5 — Document Template Designer):
// Design reusable EMAIL, LETTER, and SMS templates that attach to workflow nodes.
// Templates use {{ISO.FieldName}} placeholders — e.g. {{Currency.Amount}},
// {{Counterparty.Name}} — which the Notification Engine substitutes with live
// transaction data at runtime before dispatching.
//
// Full lifecycle: DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED
// A wrong email template could send incorrect info to bank customers at scale,
// so LIVE requires a 4-Eye second approver (different from the creator).
//
// WHAT BREAKS IF REMOVED:
// Workflow Notification Engine has no templates to render — cannot send
// emails, letters, or SMS at any workflow step.

import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useResolvedPackageId } from '../../hooks/useResolvedPackageId';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

// ── Types ──────────────────────────────────────────────────────────────────
type TemplateType = 'EMAIL' | 'LETTER' | 'SMS';
type LifecycleStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'LIVE' | 'ARCHIVED';

const TYPE_META: Record<TemplateType, { icon: string; label: string; color: string; desc: string }> = {
  EMAIL:  { icon: '✉️', label: 'Email',       color: 'bg-indigo-50 border-indigo-200 text-indigo-700', desc: 'HTML email with subject line and rich body' },
  LETTER: { icon: '📄', label: 'Letter (PDF)',  color: 'bg-amber-50 border-amber-200 text-amber-700',   desc: 'Formal letter rendered to PDF for dispatch' },
  SMS:    { icon: '💬', label: 'SMS',           color: 'bg-emerald-50 border-emerald-200 text-emerald-700', desc: 'Short message (160 chars). Can pause workflow awaiting reply.' },
};

const STATUS_META: Record<LifecycleStatus, { color: string; label: string }> = {
  DRAFT:            { color: 'bg-slate-100 text-slate-600',   label: 'Draft' },
  PENDING_APPROVAL: { color: 'bg-amber-100 text-amber-700',   label: 'Pending Approval' },
  LIVE:             { color: 'bg-emerald-100 text-emerald-700', label: 'Live' },
  ARCHIVED:         { color: 'bg-slate-100 text-slate-400',   label: 'Archived' },
};

// Common ISO field placeholders grouped by domain — shown in the field picker sidebar
const ISO_PLACEHOLDER_GROUPS = [
  {
    domain: 'Wire & Payments',
    fields: [
      { name: 'Currency.Amount',          label: 'Payment Amount' },
      { name: 'Currency.Identifier',      label: 'Currency Code' },
      { name: 'AmountAndDirection.Amount', label: 'Net Amount' },
    ],
  },
  {
    domain: 'Counterparty',
    fields: [
      { name: 'Counterparty.Name',        label: 'Customer Name' },
      { name: 'Beneficiary.Name',         label: 'Beneficiary Name' },
      { name: 'OrderingParty.Name',       label: 'Ordering Party' },
    ],
  },
  {
    domain: 'Account',
    fields: [
      { name: 'Account1.Identification',  label: 'Account Number' },
      { name: 'Account1.AccountServicer', label: 'Bank Name' },
    ],
  },
  {
    domain: 'Transaction',
    fields: [
      { name: 'TransactionRef.Reference', label: 'Transaction Reference' },
      { name: 'ValueDate.Date',           label: 'Value Date' },
      { name: 'Status.Code',              label: 'Transaction Status' },
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────
export const DocumentTemplateDesigner: React.FC = () => {
  const { activeProductContext } = usePlatformStore();
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // WHY THIS EXISTS: `activeProductContext` is the package NAME ("Payment Hub"),
  // but the comm-templates API filters on package_id (PKG-XXXX). Passing the name
  // as package_id silently matched zero rows — the studio always showed "No templates yet".
  // We resolve name → id via the packages master, mirroring CalculationEngineStudio.
  // Shared hook — resolves active package name → id. See src/hooks/useResolvedPackageId.ts.
  const { packageId: resolvedPackageId } = useResolvedPackageId();

  // List / editor state
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [typeFilter, setTypeFilter] = useState<TemplateType | 'ALL'>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Editor form state
  const [form, setForm] = useState({
    template_name: '',
    template_type: 'EMAIL' as TemplateType,
    subject_line: '',
    body_content: '',
    description: '',
  });

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: listData, isLoading } = useQuery({
    queryKey: ['comm-templates', resolvedPackageId, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (resolvedPackageId) params.set('package_id', resolvedPackageId);
      if (typeFilter !== 'ALL') params.set('template_type', typeFilter);
      return (await apiClient.get(`/comm-templates/?${params}`)).data;
    },
    enabled: view === 'list',
  });

  const { data: editData } = useQuery({
    queryKey: ['comm-template', editingId],
    queryFn: async () => (await apiClient.get(`/comm-templates/${editingId}`)).data,
    enabled: !!editingId,
  });

  // Populate form when editing an existing template
  React.useEffect(() => {
    if (editData && editingId) {
      setForm({
        template_name: editData.template_name,
        template_type: editData.template_type,
        subject_line: editData.subject_line || '',
        body_content: editData.body_content || '',
        description: editData.description || '',
      });
    }
  }, [editData, editingId]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        application_package_id: resolvedPackageId || undefined,
        referenced_iso_fields: extractPlaceholders(form.body_content + ' ' + form.subject_line),
      };
      if (editingId) return (await apiClient.put(`/comm-templates/${editingId}`, payload)).data;
      return (await apiClient.post('/comm-templates/', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comm-templates'] });
      setView('list');
      setEditingId(null);
      resetForm();
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Save failed'),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/comm-templates/${id}/submit`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comm-templates'] }),
    onError: (e: any) => alert(e.response?.data?.detail || 'Submit failed'),
  });

  const makeLiveMutation = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/comm-templates/${id}/make-live`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comm-templates'] }),
    onError: (e: any) => alert(e.response?.data?.detail || 'Make Live failed — ' + (e.response?.data?.detail || '')),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const resetForm = () => setForm({ template_name: '', template_type: 'EMAIL', subject_line: '', body_content: '', description: '' });

  // Extract {{Field.Name}} placeholders from text
  const extractPlaceholders = (text: string): string[] => {
    const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '').trim()))];
  };

  // Insert placeholder at cursor position in textarea
  const insertPlaceholder = (fieldName: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const placeholder = `{{${fieldName}}}`;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newBody = form.body_content.slice(0, start) + placeholder + form.body_content.slice(end);
    setForm(f => ({ ...f, body_content: newBody }));
    // Restore cursor after placeholder
    setTimeout(() => { el.selectionStart = el.selectionEnd = start + placeholder.length; el.focus(); }, 0);
  };

  const templates = listData?.templates ?? [];
  const placeholders = extractPlaceholders(form.body_content + ' ' + form.subject_line);
  const smsLength = form.body_content.length;

  // ── Render: List View ─────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="space-y-6 animate-fade-in">
        <InfinityAIHelper studioKey="comm-templates" />

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-3xl p-7 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="space-y-1 z-10">
            <div className="flex items-center gap-2">
              <span className="text-xl">📨</span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">Document Template Designer</h1>
            </div>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              Design EMAIL, LETTER, and SMS templates with ISO field placeholders. Templates attach to workflow nodes — the Notification Engine populates placeholders with live transaction data at runtime.
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setEditingId(null); setView('editor'); }}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 shrink-0 z-10"
          >
            + New Template
          </button>
        </div>

        {/* Type filter tabs */}
        <div className="flex gap-2">
          {(['ALL', 'EMAIL', 'LETTER', 'SMS'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                typeFilter === t
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
              }`}
            >
              {t === 'ALL' ? 'All Types' : `${TYPE_META[t].icon} ${TYPE_META[t].label}`}
            </button>
          ))}
        </div>

        {/* Template cards */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="bg-white border border-slate-150 rounded-2xl p-12 text-center space-y-3 shadow-glass">
            <div className="text-4xl">📨</div>
            <div className="text-sm font-bold text-slate-600">No templates yet</div>
            <div className="text-xs text-slate-400 max-w-sm mx-auto">
              Create your first template. Use <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600">{'{{ISO.FieldName}}'}</code> placeholders to personalise messages with live transaction data.
            </div>
            <button
              onClick={() => { resetForm(); setView('editor'); }}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all mt-2"
            >
              + Create First Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map((t: any) => {
              const meta = TYPE_META[t.template_type as TemplateType];
              const statusMeta = STATUS_META[t.status as LifecycleStatus];
              const fields = t.referenced_iso_fields || [];
              return (
                <div key={t.template_id} className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass hover:-translate-y-0.5 hover:border-indigo-200 transition-all flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{meta.icon}</span>
                      <div>
                        <div className="text-sm font-bold text-slate-800 leading-tight">{t.template_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{t.template_id} · v{t.version_number}</div>
                      </div>
                    </div>
                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${statusMeta.color}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* Type badge */}
                  <span className={`self-start text-[9px] font-bold uppercase px-2 py-0.5 rounded-lg border ${meta.color}`}>
                    {meta.label}
                  </span>

                  {/* Subject line (EMAIL only) */}
                  {t.subject_line && (
                    <div className="text-[10px] text-slate-500 bg-slate-50 rounded-lg px-2 py-1 font-medium">
                      Subject: {t.subject_line}
                    </div>
                  )}

                  {/* Body preview */}
                  <div className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">
                    {t.body_content}
                  </div>

                  {/* ISO placeholders used */}
                  {fields.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {fields.slice(0, 4).map((f: string) => (
                        <span key={f} className="text-[8px] font-mono bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded">
                          {`{{${f}}}`}
                        </span>
                      ))}
                      {fields.length > 4 && (
                        <span className="text-[8px] text-slate-400">+{fields.length - 4} more</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-2 border-t border-slate-50">
                    {(t.status === 'DRAFT' || t.status === 'PENDING_APPROVAL') && (
                      <button
                        onClick={() => { setEditingId(t.template_id); setView('editor'); }}
                        className="flex-1 py-1.5 text-[10px] font-bold text-indigo-600 border border-indigo-100 rounded-lg hover:bg-indigo-50 transition-all"
                      >
                        Edit
                      </button>
                    )}
                    {t.status === 'DRAFT' && (
                      <button
                        onClick={() => submitMutation.mutate(t.template_id)}
                        className="flex-1 py-1.5 text-[10px] font-bold text-amber-600 border border-amber-100 rounded-lg hover:bg-amber-50 transition-all"
                      >
                        Submit for Approval
                      </button>
                    )}
                    {t.status === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => makeLiveMutation.mutate(t.template_id)}
                        className="flex-1 py-1.5 text-[10px] font-bold text-white bg-emerald-500 border border-emerald-500 rounded-lg hover:bg-emerald-600 transition-all"
                      >
                        ▶ Make it Live
                      </button>
                    )}
                    {t.status === 'LIVE' && (
                      <button
                        onClick={() => { setEditingId(t.template_id); setView('editor'); }}
                        className="flex-1 py-1.5 text-[10px] font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
                      >
                        Create New Version
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

  // ── Render: Editor View ───────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      <InfinityAIHelper studioKey="comm-templates" />

      {/* Editor header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView('list'); setEditingId(null); resetForm(); }}
            className="text-xs text-slate-500 hover:text-indigo-600 font-semibold flex items-center gap-1 transition-colors"
          >
            ← Back to Templates
          </button>
          <span className="text-slate-300">|</span>
          <h2 className="text-sm font-extrabold text-slate-800">
            {editingId ? 'Edit Template' : 'New Template'}
          </h2>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !form.template_name || !form.body_content}
          className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save as Draft'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-5">

        {/* ── Left: Form ───────────────────────────────────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* Template type selector */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">Template Type</div>
            <div className="grid grid-cols-3 gap-3">
              {(Object.entries(TYPE_META) as [TemplateType, typeof TYPE_META['EMAIL']][]).map(([type, meta]) => (
                <button
                  key={type}
                  onClick={() => setForm(f => ({ ...f, template_type: type }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    form.template_type === type
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-150 hover:border-indigo-200'
                  }`}
                >
                  <div className="text-xl mb-1">{meta.icon}</div>
                  <div className="text-xs font-bold text-slate-800">{meta.label}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5 leading-relaxed">{meta.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Name + description */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block mb-1">Template Name *</label>
              <input
                value={form.template_name}
                onChange={e => setForm(f => ({ ...f, template_name: e.target.value }))}
                placeholder="e.g. Payment Confirmation Email"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block mb-1">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="When is this template used?"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Subject line (EMAIL only) */}
          {form.template_type === 'EMAIL' && (
            <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass">
              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block mb-1">Subject Line *</label>
              <input
                value={form.subject_line}
                onChange={e => setForm(f => ({ ...f, subject_line: e.target.value }))}
                placeholder="e.g. Your {{Currency.Amount}} {{Currency.Identifier}} transfer is confirmed"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 font-mono"
              />
              <div className="text-[9px] text-slate-400 mt-1.5">Use {'{{ISO.FieldName}}'} to personalise the subject. Placeholders are resolved at runtime.</div>
            </div>
          )}

          {/* Body editor */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                {form.template_type === 'SMS' ? 'Message Body *' : 'Template Body *'}
              </label>
              {form.template_type === 'SMS' && (
                <span className={`text-[10px] font-bold ${smsLength > 160 ? 'text-rose-500' : 'text-slate-400'}`}>
                  {smsLength} / 160 chars {smsLength > 160 ? '⚠️ over limit' : ''}
                </span>
              )}
            </div>
            <textarea
              ref={bodyRef}
              value={form.body_content}
              onChange={e => setForm(f => ({ ...f, body_content: e.target.value }))}
              rows={form.template_type === 'SMS' ? 4 : 10}
              placeholder={
                form.template_type === 'SMS'
                  ? 'e.g. Dear {{Counterparty.Name}}, your payment of {{Currency.Amount}} {{Currency.Identifier}} has been initiated. Reply YES to confirm or NO to cancel.'
                  : 'e.g. Dear {{Counterparty.Name}},\n\nYour payment of {{Currency.Amount}} {{Currency.Identifier}} to {{Beneficiary.Name}} has been processed on {{ValueDate.Date}}.\n\nTransaction Reference: {{TransactionRef.Reference}}'
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 font-mono resize-none"
            />
            <div className="text-[9px] text-slate-400 mt-1.5">
              Click a field in the ISO Field Picker → to insert it at your cursor position.
            </div>
          </div>

          {/* Live placeholders found */}
          {placeholders.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2">
                ISO Fields referenced in this template ({placeholders.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {placeholders.map(p => (
                  <span key={p} className="text-[10px] font-mono bg-white text-indigo-700 border border-indigo-200 px-2 py-1 rounded-lg">
                    {`{{${p}}}`}
                  </span>
                ))}
              </div>
              <div className="text-[9px] text-slate-500 mt-2">
                These fields will be fetched from the live transaction context at runtime before the message is sent.
              </div>
            </div>
          )}
        </div>

        {/* ── Right: ISO Field Picker ───────────────────────────────────── */}
        <div className="space-y-3">
          <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden sticky top-4">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">ISO Field Picker</div>
              <div className="text-[9px] text-slate-400 mt-0.5">Click a field to insert at cursor</div>
            </div>
            <div className="p-3 space-y-3 max-h-[560px] overflow-y-auto">
              {ISO_PLACEHOLDER_GROUPS.map(group => (
                <div key={group.domain}>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-1">{group.domain}</div>
                  <div className="space-y-1">
                    {group.fields.map(f => (
                      <button
                        key={f.name}
                        onClick={() => insertPlaceholder(f.name)}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all group"
                      >
                        <div className="text-[10px] font-semibold text-slate-700 group-hover:text-indigo-700">{f.label}</div>
                        <div className="text-[8px] font-mono text-slate-400 group-hover:text-indigo-500">{`{{${f.name}}}`}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lifecycle guide */}
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Lifecycle</div>
            <div className="space-y-1.5">
              {[
                { status: 'DRAFT', desc: 'Editing in progress' },
                { status: 'PENDING_APPROVAL', desc: 'Awaiting 4-Eye review' },
                { status: 'LIVE', desc: 'Active — attached to workflows' },
                { status: 'ARCHIVED', desc: 'Superseded by newer version' },
              ].map(s => (
                <div key={s.status} className="flex items-center gap-2">
                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${STATUS_META[s.status as LifecycleStatus].color}`}>
                    {STATUS_META[s.status as LifecycleStatus].label}
                  </span>
                  <span className="text-[9px] text-slate-400">{s.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
