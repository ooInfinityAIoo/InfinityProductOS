// WHY THIS FILE EXISTS (WS-6 — Document Checklist Canvas):
// Design named document checklists that attach to workflow nodes.
// A checklist defines WHAT documents are required at a specific workflow step,
// whether each is MANDATORY (blocks the workflow from advancing) or OPTIONAL
// (shown to the operator but does not block progression).
//
// Example: "Corporate KYC Checklist" attached to the "Account Opening" workflow node
// requires: Company Registration (PDF, mandatory), Directors List (PDF/XLS, mandatory),
// Bank Reference Letter (PDF, optional).
//
// Full lifecycle: DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED
// 4-Eye: cannot submit empty checklist; approver ≠ creator.
// Auto-registers in Entitlement Module on go-live.
//
// WHAT BREAKS IF REMOVED:
// Workflow steps that require document collection have no gate — operators
// can advance past compliance steps without uploading required documents.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

type LifecycleStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'LIVE' | 'ARCHIVED';

const STATUS_META: Record<LifecycleStatus, { color: string; label: string }> = {
  DRAFT:            { color: 'bg-slate-100 text-slate-600',    label: 'Draft' },
  PENDING_APPROVAL: { color: 'bg-amber-100 text-amber-700',    label: 'Pending Approval' },
  LIVE:             { color: 'bg-emerald-100 text-emerald-700', label: 'Live' },
  ARCHIVED:         { color: 'bg-slate-100 text-slate-400',    label: 'Archived' },
};

const FORMAT_OPTIONS = ['PDF', 'JPG', 'PNG', 'XLS', 'XLSX', 'CSV', 'DOCX', 'XML', 'ANY'];

const blankItem = () => ({
  document_name: '',
  is_mandatory: true,
  accepted_formats: ['PDF'] as string[],
  max_file_size_mb: 10,
  upload_instructions: '',
});

export const DocumentChecklistCanvas: React.FC = () => {
  const { activeProductContext } = usePlatformStore();
  const queryClient = useQueryClient();

  // WHY THIS EXISTS: `activeProductContext` is the package NAME ("Payment Hub"),
  // but the doc-checklists API filters on package_id (PKG-XXXX). Passing the name
  // as package_id silently matched zero rows — the studio always showed
  // "No checklists yet". Resolve name → id via the packages master.
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

  // Checklist header form
  const [header, setHeader] = useState({ checklist_name: '', description: '', intended_workflow_step: '' });
  // Items being built in the editor (not yet saved individually — saved all at once on create)
  const [draftItems, setDraftItems] = useState<ReturnType<typeof blankItem>[]>([blankItem()]);
  // Inline add-item form for existing checklists
  const [newItem, setNewItem] = useState(blankItem());
  const [addingItem, setAddingItem] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: listData, isLoading } = useQuery({
    queryKey: ['doc-checklists', resolvedPackageId],
    queryFn: async () => {
      const params = resolvedPackageId ? `?package_id=${resolvedPackageId}` : '';
      return (await apiClient.get(`/doc-checklists/${params}`)).data;
    },
    enabled: view === 'list',
  });

  const { data: editData } = useQuery({
    queryKey: ['doc-checklist', editingId],
    queryFn: async () => (await apiClient.get(`/doc-checklists/${editingId}`)).data,
    enabled: !!editingId && view === 'editor',
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => apiClient.post('/doc-checklists/', {
      ...header,
      application_package_id: resolvedPackageId || undefined,
      items: draftItems.filter(i => i.document_name.trim()),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doc-checklists'] });
      setView('list');
      setHeader({ checklist_name: '', description: '', intended_workflow_step: '' });
      setDraftItems([blankItem()]);
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Create failed'),
  });

  const addItemMutation = useMutation({
    mutationFn: async (checklistId: string) =>
      apiClient.post(`/doc-checklists/${checklistId}/items`, newItem),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doc-checklist', editingId] });
      setNewItem(blankItem());
      setAddingItem(false);
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Add item failed'),
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ checklistId, itemId }: { checklistId: string; itemId: string }) =>
      apiClient.delete(`/doc-checklists/${checklistId}/items/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doc-checklist', editingId] }),
    onError: (e: any) => alert(e.response?.data?.detail || 'Remove failed'),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/doc-checklists/${id}/submit`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doc-checklists'] });
      queryClient.invalidateQueries({ queryKey: ['doc-checklist', editingId] });
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Submit failed'),
  });

  const makeLiveMutation = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/doc-checklists/${id}/make-live`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doc-checklists'] });
      queryClient.invalidateQueries({ queryKey: ['doc-checklist', editingId] });
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Make Live failed'),
  });

  // ── Draft item helpers ────────────────────────────────────────────────────
  const updateDraftItem = (idx: number, patch: Partial<ReturnType<typeof blankItem>>) =>
    setDraftItems(items => items.map((item, i) => i === idx ? { ...item, ...patch } : item));

  const toggleFormat = (formats: string[], fmt: string): string[] =>
    formats.includes(fmt) ? formats.filter(f => f !== fmt) : [...formats, fmt];

  const checklists = listData?.checklists ?? [];

  // ── List View ─────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="space-y-6 animate-fade-in">
        <InfinityAIHelper studioKey="doc-checklists" />

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-3xl p-7 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="space-y-1 z-10">
            <div className="flex items-center gap-2">
              <span className="text-xl">📋</span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">Document Checklist Canvas</h1>
            </div>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              Define which documents are required at each workflow step. MANDATORY items block the workflow from advancing until uploaded and verified. OPTIONAL items are shown but do not block.
            </p>
          </div>
          <button
            onClick={() => { setEditingId(null); setView('editor'); }}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shrink-0 z-10"
          >
            + New Checklist
          </button>
        </div>

        {/* Checklist cards */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading checklists...</div>
        ) : checklists.length === 0 ? (
          <div className="bg-white border border-slate-150 rounded-2xl p-12 text-center space-y-3 shadow-glass">
            <div className="text-4xl">📋</div>
            <div className="text-sm font-bold text-slate-600">No checklists yet</div>
            <div className="text-xs text-slate-400 max-w-sm mx-auto">
              Create a checklist and attach it to a workflow node. MANDATORY items block the workflow until documents are uploaded.
            </div>
            <button
              onClick={() => setView('editor')}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all mt-2"
            >
              + Create First Checklist
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {checklists.map((c: any) => {
              // Defensive: a checklist with an unknown status (e.g. legacy 'ACTIVE')
              // must not crash the whole studio.
              const statusMeta = STATUS_META[c.status as LifecycleStatus]
                ?? { color: 'bg-slate-100 text-slate-500', label: c.status || 'Unknown' };
              return (
                <div key={c.checklist_id} className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass hover:-translate-y-0.5 hover:border-indigo-200 transition-all flex flex-col gap-3">
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📋</span>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{c.checklist_name}</div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">{c.checklist_id} · v{c.version_number}</div>
                      </div>
                    </div>
                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${statusMeta.color}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* Intended step */}
                  {c.intended_workflow_step && (
                    <div className="text-[10px] text-slate-500 bg-slate-50 rounded-lg px-2 py-1.5">
                      📍 Designed for: <span className="font-semibold">{c.intended_workflow_step}</span>
                    </div>
                  )}

                  {/* Item summary */}
                  <div className="flex gap-3">
                    <div className="flex-1 bg-rose-50 border border-rose-100 rounded-lg p-2 text-center">
                      <div className="text-lg font-extrabold text-rose-600">{c.mandatory_count}</div>
                      <div className="text-[8px] font-bold text-rose-400 uppercase tracking-wide">Mandatory</div>
                    </div>
                    <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                      <div className="text-lg font-extrabold text-slate-500">{c.optional_count}</div>
                      <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">Optional</div>
                    </div>
                  </div>

                  {/* Item names preview */}
                  {c.items?.length > 0 && (
                    <div className="space-y-1">
                      {c.items.slice(0, 3).map((item: any) => (
                        <div key={item.item_id} className="flex items-center gap-2 text-[10px]">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.is_mandatory ? 'bg-rose-400' : 'bg-slate-300'}`} />
                          <span className="text-slate-600 truncate">{item.document_name}</span>
                          <span className="text-slate-400 shrink-0">{(item.accepted_formats || []).join('/')}</span>
                        </div>
                      ))}
                      {c.items.length > 3 && (
                        <div className="text-[9px] text-slate-400">+{c.items.length - 3} more documents</div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-2 border-t border-slate-50">
                    <button
                      onClick={() => { setEditingId(c.checklist_id); setView('editor'); }}
                      className="flex-1 py-1.5 text-[10px] font-bold text-indigo-600 border border-indigo-100 rounded-lg hover:bg-indigo-50 transition-all"
                    >
                      {c.status === 'LIVE' ? 'View / New Version' : 'Edit'}
                    </button>
                    {c.status === 'DRAFT' && (
                      <button
                        onClick={() => submitMutation.mutate(c.checklist_id)}
                        disabled={submitMutation.isPending}
                        className="flex-1 py-1.5 text-[10px] font-bold text-amber-600 border border-amber-100 rounded-lg hover:bg-amber-50 transition-all"
                      >
                        Submit for Approval
                      </button>
                    )}
                    {c.status === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => makeLiveMutation.mutate(c.checklist_id)}
                        disabled={makeLiveMutation.isPending}
                        className="flex-1 py-1.5 text-[10px] font-bold text-white bg-emerald-500 border border-emerald-500 rounded-lg hover:bg-emerald-600 transition-all"
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

  // ── Editor View ────────────────────────────────────────────────────────────
  const isEditing = !!editingId;
  const checklist = editData;
  const isLive = checklist?.status === 'LIVE';

  return (
    <div className="space-y-4 animate-fade-in">
      <InfinityAIHelper studioKey="doc-checklists" />

      {/* Editor header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView('list'); setEditingId(null); }}
            className="text-xs text-slate-500 hover:text-indigo-600 font-semibold flex items-center gap-1 transition-colors"
          >
            ← Back to Checklists
          </button>
          <span className="text-slate-300">|</span>
          <h2 className="text-sm font-extrabold text-slate-800">
            {isEditing ? checklist?.checklist_name ?? 'Loading...' : 'New Checklist'}
          </h2>
          {checklist && (() => {
            const m = STATUS_META[checklist.status as LifecycleStatus]
              ?? { color: 'bg-slate-100 text-slate-500', label: checklist.status || 'Unknown' };
            return (
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${m.color}`}>{m.label}</span>
            );
          })()}
        </div>
        {!isEditing && (
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !header.checklist_name.trim() || draftItems.filter(i => i.document_name.trim()).length === 0}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Checklist'}
          </button>
        )}
        {isEditing && checklist?.status === 'DRAFT' && (
          <button
            onClick={() => submitMutation.mutate(editingId!)}
            disabled={submitMutation.isPending || !editData?.items?.length}
            className="px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-all"
          >
            Submit for 4-Eye Approval
          </button>
        )}
        {isEditing && checklist?.status === 'PENDING_APPROVAL' && (
          <button
            onClick={() => makeLiveMutation.mutate(editingId!)}
            disabled={makeLiveMutation.isPending}
            className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all"
          >
            ▶ Make it Live
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-5">

        {/* ── Left: Checklist header + items ──────────────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* Header form (new only) */}
          {!isEditing && (
            <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass space-y-3">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1">Checklist Details</div>
              <input
                value={header.checklist_name}
                onChange={e => setHeader(h => ({ ...h, checklist_name: e.target.value }))}
                placeholder="Checklist name e.g. Corporate KYC Checklist"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
              <input
                value={header.intended_workflow_step}
                onChange={e => setHeader(h => ({ ...h, intended_workflow_step: e.target.value }))}
                placeholder="Designed for workflow step e.g. Credit Approval"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
              <input
                value={header.description}
                onChange={e => setHeader(h => ({ ...h, description: e.target.value }))}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
            </div>
          )}

          {/* Items list */}
          <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest">Document Requirements</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Red dot = mandatory (blocks workflow). Grey dot = optional.</div>
              </div>
              {isEditing && !isLive && (
                <button
                  onClick={() => setAddingItem(true)}
                  className="px-3 py-1.5 text-[10px] font-bold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all"
                >
                  + Add Document
                </button>
              )}
            </div>

            {/* Existing items (edit mode) */}
            {isEditing && (
              <div className="divide-y divide-slate-50">
                {(editData?.items ?? []).map((item: any) => (
                  <div key={item.item_id} className="flex items-start gap-3 p-4 hover:bg-slate-50/50 transition-colors">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${item.is_mandatory ? 'bg-rose-400' : 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{item.document_name}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${item.is_mandatory ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-slate-100 text-slate-500'}`}>
                          {item.is_mandatory ? 'Mandatory' : 'Optional'}
                        </span>
                        <span className="text-[8px] text-slate-400">{(item.accepted_formats || []).join(' · ')} · max {item.max_file_size_mb}MB</span>
                      </div>
                      {item.upload_instructions && (
                        <div className="text-[10px] text-slate-400 mt-1">{item.upload_instructions}</div>
                      )}
                    </div>
                    {!isLive && (
                      <button
                        onClick={() => removeItemMutation.mutate({ checklistId: editingId!, itemId: item.item_id })}
                        className="text-slate-300 hover:text-rose-400 transition-colors text-sm shrink-0"
                        title="Remove"
                      >×</button>
                    )}
                  </div>
                ))}
                {(editData?.items ?? []).length === 0 && !addingItem && (
                  <div className="p-8 text-center text-slate-400 text-xs">No documents added yet. Click "+ Add Document" to start.</div>
                )}
              </div>
            )}

            {/* Draft items (new checklist mode) */}
            {!isEditing && (
              <div className="p-4 space-y-3">
                {draftItems.map((item, idx) => (
                  <ItemForm
                    key={idx}
                    item={item}
                    onUpdate={patch => updateDraftItem(idx, patch)}
                    onRemove={draftItems.length > 1 ? () => setDraftItems(items => items.filter((_, i) => i !== idx)) : undefined}
                  />
                ))}
                <button
                  onClick={() => setDraftItems(items => [...items, blankItem()])}
                  className="w-full py-2 text-xs font-bold text-indigo-500 border border-dashed border-indigo-200 rounded-lg hover:bg-indigo-50 transition-all"
                >
                  + Add Another Document
                </button>
              </div>
            )}

            {/* Inline add form (edit mode) */}
            {isEditing && addingItem && !isLive && (
              <div className="p-4 border-t border-slate-100 bg-indigo-50/30">
                <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-3">New Document Requirement</div>
                <ItemForm
                  item={newItem}
                  onUpdate={patch => setNewItem(i => ({ ...i, ...patch }))}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => addItemMutation.mutate(editingId!)}
                    disabled={!newItem.document_name.trim() || addItemMutation.isPending}
                    className="px-3 py-1.5 text-[10px] font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all"
                  >
                    {addItemMutation.isPending ? 'Adding...' : 'Add to Checklist'}
                  </button>
                  <button
                    onClick={() => { setAddingItem(false); setNewItem(blankItem()); }}
                    className="px-3 py-1.5 text-[10px] font-bold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Info panels ───────────────────────────────────────── */}
        <div className="space-y-4">

          {/* How it works */}
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">How it works at runtime</div>
            <div className="space-y-2.5">
              {[
                { icon: '🔴', text: 'MANDATORY items — workflow step cannot advance until document is uploaded and verified' },
                { icon: '⚪', text: 'OPTIONAL items — shown to operator but do not block progression' },
                { icon: '📎', text: 'Format restrictions — operator sees which file types are accepted' },
                { icon: '📏', text: 'Size limit — files exceeding max_file_size_mb are rejected at upload' },
              ].map((tip, i) => (
                <div key={i} className="flex gap-2 text-[10px] text-slate-600 leading-relaxed">
                  <span className="shrink-0">{tip.icon}</span>
                  <span>{tip.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lifecycle */}
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Lifecycle</div>
            <div className="space-y-1.5">
              {[
                { status: 'DRAFT', desc: 'Building requirements list' },
                { status: 'PENDING_APPROVAL', desc: 'Awaiting 4-Eye review' },
                { status: 'LIVE', desc: 'Enforced at workflow steps' },
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
            <div className="mt-3 pt-3 border-t border-slate-50 text-[9px] text-slate-400">
              Cannot submit empty checklist. Approver must be different from creator (4-Eye rule).
            </div>
          </div>

          {/* Checklist summary (edit mode) */}
          {isEditing && checklist && (
            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Summary</div>
              <div className="space-y-1 text-[10px] text-slate-600">
                <div><span className="font-semibold">ID:</span> <span className="font-mono">{checklist.checklist_id}</span></div>
                <div><span className="font-semibold">Version:</span> v{checklist.version_number}</div>
                {checklist.intended_workflow_step && (
                  <div><span className="font-semibold">For step:</span> {checklist.intended_workflow_step}</div>
                )}
                <div><span className="font-semibold">Created by:</span> {checklist.created_by}</div>
                {checklist.made_live_by && (
                  <div><span className="font-semibold">Approved by:</span> {checklist.made_live_by}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ── Reusable item form component ───────────────────────────────────────────

const ItemForm: React.FC<{
  item: ReturnType<typeof blankItem>;
  onUpdate: (patch: Partial<ReturnType<typeof blankItem>>) => void;
  onRemove?: () => void;
}> = ({ item, onUpdate, onRemove }) => {
  const toggleFmt = (fmt: string) =>
    onUpdate({ accepted_formats: item.accepted_formats.includes(fmt)
      ? item.accepted_formats.filter(f => f !== fmt)
      : [...item.accepted_formats, fmt] });

  return (
    <div className="bg-slate-50/60 border border-slate-150 rounded-xl p-3 space-y-2.5">
      <div className="flex gap-2">
        <input
          value={item.document_name}
          onChange={e => onUpdate({ document_name: e.target.value })}
          placeholder="Document name e.g. Company Registration Certificate"
          className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
        />
        {onRemove && (
          <button onClick={onRemove} className="text-slate-300 hover:text-rose-400 transition-colors px-1">×</button>
        )}
      </div>

      {/* Mandatory toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onUpdate({ is_mandatory: true })}
          className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all ${item.is_mandatory ? 'bg-rose-500 border-rose-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-rose-200'}`}
        >
          🔴 Mandatory
        </button>
        <button
          onClick={() => onUpdate({ is_mandatory: false })}
          className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all ${!item.is_mandatory ? 'bg-slate-500 border-slate-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
        >
          ⚪ Optional
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[9px] text-slate-400">Max</span>
          <input
            type="number"
            value={item.max_file_size_mb}
            onChange={e => onUpdate({ max_file_size_mb: Number(e.target.value) })}
            className="w-12 px-1.5 py-1 text-[10px] border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 text-center bg-white"
          />
          <span className="text-[9px] text-slate-400">MB</span>
        </div>
      </div>

      {/* Format chips */}
      <div>
        <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wide mb-1">Accepted Formats</div>
        <div className="flex flex-wrap gap-1">
          {FORMAT_OPTIONS.map(fmt => (
            <button
              key={fmt}
              onClick={() => toggleFmt(fmt)}
              className={`px-2 py-0.5 rounded text-[8px] font-bold border transition-all ${
                item.accepted_formats.includes(fmt)
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <input
        value={item.upload_instructions}
        onChange={e => onUpdate({ upload_instructions: e.target.value })}
        placeholder="Upload instructions shown to operator (optional)"
        className="w-full px-2.5 py-1.5 text-[10px] border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
      />
    </div>
  );
};
