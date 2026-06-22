// WHY THIS COMPONENT EXISTS (WS-9 — Unstructured Document Studio):
// Design AI extraction blueprints for documents that structured file parsing cannot handle.
// The File Template Designer handles structured CSV/Excel/SWIFT layouts.
// This studio handles everything else: PDFs, scanned images, and long legal documents.
//
// Three extraction profiles:
//   PDF_STRUCTURED — PDF with predictable layout (invoices, bank statements).
//                    Configure OCR zones: page number, position hint, target ISO field.
//   PDF_AGENTIC    — Long-form documents (legal contracts, KYC packs, compliance reports).
//                    Section-aware agentic chain: define sections + per-field LLM prompts.
//   IMAGE_OCR      — Scanned/photographed documents. Pre-processing (deskew, denoise)
//                    then zone-based OCR extraction.
//
// Document type classification is USER-DEFINED from Document Master — NOT a hardcoded
// enum. Banks create their own types ("Invoice", "AML Certificate", "Director ID") and
// select from them here. Consistent with ADR #3 no-code principle.
//
// WHAT BREAKS IF REMOVED:
// All PDF, scanned image, and legal document ingestion stops. KYC automation,
// invoice processing, and contract analysis have no extraction configuration.

import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { useResolvedPackageId } from '../../hooks/useResolvedPackageId';
import { metaLookup } from '../../utils/metaLookup';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

type LifecycleStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'LIVE' | 'ARCHIVED';
type ExtractionProfile = 'PDF_STRUCTURED' | 'PDF_AGENTIC' | 'IMAGE_OCR';
type FallbackMode = 'SKIP_FIELD' | 'HUMAN_REVIEW' | 'USE_DEFAULT';

const STATUS_META: Record<LifecycleStatus, { color: string; label: string }> = {
  DRAFT:            { color: 'bg-slate-100 text-slate-600',    label: 'Draft' },
  PENDING_APPROVAL: { color: 'bg-amber-100 text-amber-700',    label: 'Pending Approval' },
  LIVE:             { color: 'bg-emerald-100 text-emerald-700', label: 'Live' },
  ARCHIVED:         { color: 'bg-slate-100 text-slate-400',    label: 'Archived' },
};

const PROFILE_META: Record<ExtractionProfile, { icon: string; label: string; color: string; desc: string }> = {
  PDF_STRUCTURED: { icon: '📄', label: 'PDF Structured', color: 'bg-blue-50 border-blue-200',   desc: 'Invoices, bank statements, tax forms — predictable layout, OCR zone config' },
  PDF_AGENTIC:    { icon: '🤖', label: 'PDF Agentic',    color: 'bg-violet-50 border-violet-200', desc: 'Legal contracts, KYC packs — section-aware LLM chain reads whole document' },
  IMAGE_OCR:      { icon: '🔍', label: 'Image OCR',      color: 'bg-amber-50 border-amber-200',  desc: 'Scanned/photographed documents — pre-process then zone-based OCR' },
};

const PRE_PROCESSING_OPTIONS = ['deskew', 'denoise', 'contrast_boost', 'binarize', 'rotate_auto'];
const FALLBACK_LABELS: Record<FallbackMode, string> = {
  SKIP_FIELD:   'Skip field (leave empty)',
  HUMAN_REVIEW: 'Flag for human review',
  USE_DEFAULT:  'Use default value',
};

// Blank rule/section factories
const blankRule = () => ({ rule_name: '', page: 1, position_hint: '', iso_field: '', is_mandatory: true, confidence_threshold: 0.85, default_value: '' });
const blankSection = () => ({ section_name: '', section_prompt: '', fields: [blankSectionField()] });
const blankSectionField = () => ({ field_name: '', extraction_prompt: '', iso_field: '', is_mandatory: true, default_value: '' });

interface BlueprintDraft {
  blueprint_name: string;
  description: string;
  document_type_id: string;
  extraction_profile: ExtractionProfile;
  confidence_threshold: number;
  fallback_mode: FallbackMode;
  // profile-specific state held separately
}

export const UnstructuredDocStudio: React.FC = () => {
  const { activeProductContext } = usePlatformStore();
  const queryClient = useQueryClient();

  // WHY THIS EXISTS: `activeProductContext` is the package NAME ("Payment Hub"),
  // but the unstructured-docs API filters on package_id (PKG-XXXX). Passing the
  // name as package_id silently matched zero rows — the studio always showed
  // "No extraction blueprints yet". Resolve name → id via the packages master.
  // Shared hook — resolves active package name → id. See src/hooks/useResolvedPackageId.ts.
  const { packageId: resolvedPackageId } = useResolvedPackageId();

  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileFilter, setProfileFilter] = useState<ExtractionProfile | 'ALL'>('ALL');

  // Editor state
  const [draft, setDraft] = useState<BlueprintDraft>({
    blueprint_name: '', description: '', document_type_id: '',
    extraction_profile: 'PDF_STRUCTURED', confidence_threshold: 0.80, fallback_mode: 'HUMAN_REVIEW',
  });
  // Profile-specific extraction config state
  const [structuredRules, setStructuredRules] = useState([blankRule()]);
  const [agenticSections, setAgenticSections] = useState([blankSection()]);
  const [imagePreProcessing, setImagePreProcessing] = useState<string[]>(['deskew', 'denoise']);
  const [imageLanguage, setImageLanguage] = useState('en');
  const [imageRules, setImageRules] = useState([blankRule()]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: listData, isLoading } = useQuery({
    queryKey: ['unstructured-blueprints', resolvedPackageId, profileFilter],
    queryFn: async () => {
      let url = '/unstructured-docs/';
      const params: string[] = [];
      if (resolvedPackageId) params.push(`package_id=${resolvedPackageId}`);
      if (profileFilter !== 'ALL') params.push(`extraction_profile=${profileFilter}`);
      if (params.length) url += '?' + params.join('&');
      return (await apiClient.get(url)).data;
    },
    enabled: view === 'list',
  });

  const { data: editData, isLoading: editLoading } = useQuery({
    queryKey: ['unstructured-blueprint', editingId],
    queryFn: async () => (await apiClient.get(`/unstructured-docs/${editingId}`)).data,
    enabled: !!editingId && view === 'editor',
  });

  const { data: docTypesData } = useQuery({
    queryKey: ['doc-types-for-extraction'],
    queryFn: async () => (await apiClient.get('/unstructured-docs/document-types')).data,
    enabled: view === 'editor',
  });

  const docTypes: any[] = docTypesData?.document_types ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────
  const buildConfig = useCallback(() => {
    if (draft.extraction_profile === 'PDF_STRUCTURED') {
      return { extraction_rules: structuredRules.filter(r => r.rule_name.trim()) };
    }
    if (draft.extraction_profile === 'PDF_AGENTIC') {
      return { sections: agenticSections.filter(s => s.section_name.trim()) };
    }
    return { pre_processing: imagePreProcessing, language: imageLanguage, extraction_rules: imageRules.filter(r => r.rule_name.trim()) };
  }, [draft.extraction_profile, structuredRules, agenticSections, imagePreProcessing, imageLanguage, imageRules]);

  const createMutation = useMutation({
    mutationFn: async () => apiClient.post('/unstructured-docs/', {
      ...draft,
      application_package_id: resolvedPackageId || undefined,
      ai_extraction_config: buildConfig(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unstructured-blueprints'] });
      setView('list');
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Create failed'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => apiClient.put(`/unstructured-docs/${editingId}`, {
      ...draft,
      ai_extraction_config: buildConfig(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unstructured-blueprint', editingId] });
      queryClient.invalidateQueries({ queryKey: ['unstructured-blueprints'] });
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Save failed'),
  });

  const newVersionMutation = useMutation({
    mutationFn: async () => apiClient.post(`/unstructured-docs/${editingId}/new-version`, {
      ...draft,
      ai_extraction_config: buildConfig(),
    }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['unstructured-blueprints'] });
      setEditingId(res.data.blueprint_id);
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'New version failed'),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/unstructured-docs/${id}/submit`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unstructured-blueprints'] });
      queryClient.invalidateQueries({ queryKey: ['unstructured-blueprint', editingId] });
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Submit failed'),
  });

  const makeLiveMutation = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/unstructured-docs/${id}/make-live`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unstructured-blueprints'] });
      queryClient.invalidateQueries({ queryKey: ['unstructured-blueprint', editingId] });
    },
    onError: (e: any) => alert(e.response?.data?.detail || 'Make Live failed'),
  });

  const openEditor = (b?: any) => {
    if (b) {
      setEditingId(b.blueprint_id);
      setDraft({
        blueprint_name: b.blueprint_name,
        description: b.description || '',
        document_type_id: b.document_type_id || '',
        extraction_profile: b.extraction_profile,
        confidence_threshold: b.confidence_threshold,
        fallback_mode: b.fallback_mode,
      });
      const cfg = b.ai_extraction_config || {};
      if (b.extraction_profile === 'PDF_STRUCTURED') setStructuredRules(cfg.extraction_rules?.length ? cfg.extraction_rules : [blankRule()]);
      if (b.extraction_profile === 'PDF_AGENTIC') setAgenticSections(cfg.sections?.length ? cfg.sections : [blankSection()]);
      if (b.extraction_profile === 'IMAGE_OCR') {
        setImagePreProcessing(cfg.pre_processing || ['deskew', 'denoise']);
        setImageLanguage(cfg.language || 'en');
        setImageRules(cfg.extraction_rules?.length ? cfg.extraction_rules : [blankRule()]);
      }
    } else {
      setEditingId(null);
      setDraft({ blueprint_name: '', description: '', document_type_id: '', extraction_profile: 'PDF_STRUCTURED', confidence_threshold: 0.80, fallback_mode: 'HUMAN_REVIEW' });
      setStructuredRules([blankRule()]);
      setAgenticSections([blankSection()]);
      setImagePreProcessing(['deskew', 'denoise']);
      setImageLanguage('en');
      setImageRules([blankRule()]);
    }
    setView('editor');
  };

  const blueprints: any[] = listData?.blueprints ?? [];

  // ── List View ─────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="space-y-6 animate-fade-in">
        <InfinityAIHelper studioKey="unstructured-document-studio" />

        <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 rounded-3xl p-7 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="z-10 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧠</span>
              <h1 className="text-xl font-extrabold text-white tracking-tight">Unstructured Document Studio</h1>
            </div>
            <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
              Design AI extraction blueprints for PDFs, scanned images, and long legal documents. Document type classification is user-defined from Document Master — create your types there first.
            </p>
          </div>
          <button
            onClick={() => openEditor()}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md shrink-0 z-10"
          >
            + New Blueprint
          </button>
        </div>

        {/* Profile filter */}
        <div className="flex gap-2 flex-wrap">
          {(['ALL', 'PDF_STRUCTURED', 'PDF_AGENTIC', 'IMAGE_OCR'] as const).map(p => (
            <button
              key={p}
              onClick={() => setProfileFilter(p)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${profileFilter === p ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
            >
              {p === 'ALL' ? 'All Profiles' : PROFILE_META[p as ExtractionProfile].icon + ' ' + PROFILE_META[p as ExtractionProfile].label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading blueprints...</div>
        ) : blueprints.length === 0 ? (
          <div className="bg-white border border-slate-150 rounded-2xl p-12 text-center space-y-3 shadow-glass">
            <div className="text-4xl">🧠</div>
            <div className="text-sm font-bold text-slate-600">No extraction blueprints yet</div>
            <div className="text-xs text-slate-400 max-w-sm mx-auto">
              First create document types in Document Master (e.g. "Invoice", "Legal Contract"). Then build extraction blueprints here.
            </div>
            <button onClick={() => openEditor()} className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all mt-2">
              + Create First Blueprint
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {blueprints.map((b: any) => {
              // Defensive lookups: a record with an unknown status or a malformed
              // extraction_profile (e.g. legacy data where the profile column holds a
              // JSON rules blob) must not crash the whole studio.
              const statusMeta = STATUS_META[b.status as LifecycleStatus]
                ?? { color: 'bg-slate-100 text-slate-500', label: b.status || 'Unknown' };
              const profileMeta = PROFILE_META[b.extraction_profile as ExtractionProfile]
                ?? { icon: '📦', label: 'Custom', color: 'bg-slate-50 border-slate-200', desc: '' };
              const ruleCount = b.extraction_profile === 'PDF_AGENTIC'
                ? (b.ai_extraction_config?.sections?.length ?? 0)
                : (b.ai_extraction_config?.extraction_rules?.length ?? 0);
              return (
                <div key={b.blueprint_id} className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass hover:-translate-y-0.5 hover:border-blue-200 transition-all flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xl mt-0.5">{profileMeta.icon}</span>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{b.blueprint_name}</div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">{b.blueprint_id} · v{b.version_number}</div>
                      </div>
                    </div>
                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${statusMeta.color}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${profileMeta.color}`}>
                      {profileMeta.label}
                    </span>
                    {b.document_type_name && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        📑 {b.document_type_name}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                      <div className="text-base font-extrabold text-slate-700">{ruleCount}</div>
                      <div className="text-[8px] font-bold text-slate-400 uppercase">{b.extraction_profile === 'PDF_AGENTIC' ? 'Sections' : 'Rules'}</div>
                    </div>
                    <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                      <div className="text-base font-extrabold text-slate-700">{Math.round(b.confidence_threshold * 100)}%</div>
                      <div className="text-[8px] font-bold text-slate-400 uppercase">Confidence</div>
                    </div>
                    <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                      <div className="text-[9px] font-bold text-slate-600">{b.fallback_mode.replace('_', ' ')}</div>
                      <div className="text-[8px] font-bold text-slate-400 uppercase">Fallback</div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-auto pt-2 border-t border-slate-50">
                    <button
                      onClick={() => openEditor(b)}
                      className="flex-1 py-1.5 text-[10px] font-bold text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 transition-all"
                    >
                      {b.status === 'LIVE' ? 'View / New Version' : 'Edit'}
                    </button>
                    {b.status === 'DRAFT' && (
                      <button
                        onClick={() => submitMutation.mutate(b.blueprint_id)}
                        disabled={submitMutation.isPending}
                        className="flex-1 py-1.5 text-[10px] font-bold text-amber-600 border border-amber-100 rounded-lg hover:bg-amber-50 transition-all"
                      >
                        Submit
                      </button>
                    )}
                    {b.status === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => makeLiveMutation.mutate(b.blueprint_id)}
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
  const currentStatus: LifecycleStatus = (editData?.status ?? 'DRAFT') as LifecycleStatus;
  const isLive = currentStatus === 'LIVE';

  return (
    <div className="space-y-4 animate-fade-in">
      <InfinityAIHelper studioKey="unstructured-document-studio" />

      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView('list'); setEditingId(null); }} className="text-xs text-slate-500 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors">
            ← Back
          </button>
          <span className="text-slate-300">|</span>
          <h2 className="text-sm font-extrabold text-slate-800">{isEditing ? (editData?.blueprint_name ?? 'Loading...') : 'New Blueprint'}</h2>
          {isEditing && editData && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${metaLookup(STATUS_META, currentStatus, { color: 'bg-slate-100 text-slate-500', label: String(currentStatus ?? '—') }).color}`}>
              {metaLookup(STATUS_META, currentStatus, { color: 'bg-slate-100 text-slate-500', label: String(currentStatus ?? '—') }).label}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {!isEditing && (
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !draft.blueprint_name.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Blueprint'}
            </button>
          )}
          {isEditing && !isLive && currentStatus === 'DRAFT' && (
            <>
              <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="px-3 py-1.5 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
                {updateMutation.isPending ? 'Saving...' : 'Save Draft'}
              </button>
              <button onClick={() => submitMutation.mutate(editingId!)} disabled={submitMutation.isPending} className="px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-all">
                Submit for Approval
              </button>
            </>
          )}
          {isEditing && currentStatus === 'PENDING_APPROVAL' && (
            <button onClick={() => makeLiveMutation.mutate(editingId!)} disabled={makeLiveMutation.isPending} className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all">
              ▶ Make it Live
            </button>
          )}
          {isEditing && isLive && (
            <button onClick={() => newVersionMutation.mutate()} disabled={newVersionMutation.isPending} className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all">
              Create New Version
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* ── Left+center: config ───────────────────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* Blueprint metadata */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass space-y-3">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Blueprint Details</div>
            <input
              value={draft.blueprint_name}
              onChange={e => setDraft(d => ({ ...d, blueprint_name: e.target.value }))}
              placeholder="Blueprint name e.g. UK Invoice Extractor"
              disabled={isLive}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 disabled:bg-slate-50"
            />
            <div className="grid grid-cols-2 gap-3">
              {/* Document type — from DocumentMaster, user-defined */}
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Document Type <span className="text-slate-300 font-normal">(user-defined in Document Master)</span></div>
                <select
                  value={draft.document_type_id}
                  onChange={e => setDraft(d => ({ ...d, document_type_id: e.target.value }))}
                  disabled={isLive}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-50"
                >
                  <option value="">— Select document type —</option>
                  {docTypes.map((t: any) => (
                    <option key={t.document_id} value={t.document_id}>{t.document_name} ({t.document_format})</option>
                  ))}
                </select>
                {docTypes.length === 0 && (
                  <div className="text-[9px] text-amber-600 mt-1">No document types yet. Create them in Document Master Studio first.</div>
                )}
              </div>
              <input
                value={draft.description}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="Description (optional)"
                disabled={isLive}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 disabled:bg-slate-50"
              />
            </div>
          </div>

          {/* Extraction profile selector */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">Extraction Profile</div>
            <div className="grid grid-cols-3 gap-3">
              {(['PDF_STRUCTURED', 'PDF_AGENTIC', 'IMAGE_OCR'] as ExtractionProfile[]).map(p => {
                const meta = PROFILE_META[p];
                const active = draft.extraction_profile === p;
                return (
                  <button
                    key={p}
                    onClick={() => !isLive && setDraft(d => ({ ...d, extraction_profile: p }))}
                    disabled={isLive}
                    className={`p-3 rounded-xl border text-left transition-all ${active ? 'bg-slate-800 border-slate-800 text-white' : `${meta.color} hover:border-slate-400`} disabled:cursor-default`}
                  >
                    <div className="text-lg mb-1">{meta.icon}</div>
                    <div className={`text-[10px] font-extrabold ${active ? 'text-white' : 'text-slate-700'}`}>{meta.label}</div>
                    <div className={`text-[8px] mt-0.5 leading-relaxed ${active ? 'text-slate-300' : 'text-slate-400'}`}>{meta.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Profile-specific extraction rules */}
          {draft.extraction_profile === 'PDF_STRUCTURED' && (
            <StructuredRulesPanel rules={structuredRules} onChange={setStructuredRules} disabled={isLive} />
          )}
          {draft.extraction_profile === 'PDF_AGENTIC' && (
            <AgenticSectionsPanel sections={agenticSections} onChange={setAgenticSections} disabled={isLive} />
          )}
          {draft.extraction_profile === 'IMAGE_OCR' && (
            <ImageOCRPanel
              rules={imageRules} onRulesChange={setImageRules}
              preProcessing={imagePreProcessing} onPreProcessingChange={setImagePreProcessing}
              language={imageLanguage} onLanguageChange={setImageLanguage}
              disabled={isLive}
            />
          )}

          {/* Global quality config */}
          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">Quality & Fallback</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[9px] font-bold text-slate-500 mb-1">
                  Global Confidence Threshold: <span className="text-blue-600 font-extrabold">{Math.round(draft.confidence_threshold * 100)}%</span>
                </div>
                <input
                  type="range" min="0.5" max="1.0" step="0.05"
                  value={draft.confidence_threshold}
                  onChange={e => setDraft(d => ({ ...d, confidence_threshold: parseFloat(e.target.value) }))}
                  disabled={isLive}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-[8px] text-slate-300 mt-0.5">
                  <span>50% (lenient)</span><span>100% (strict)</span>
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-500 mb-1">When confidence is below threshold</div>
                <div className="space-y-1">
                  {(['SKIP_FIELD', 'HUMAN_REVIEW', 'USE_DEFAULT'] as FallbackMode[]).map(fm => (
                    <button
                      key={fm}
                      onClick={() => !isLive && setDraft(d => ({ ...d, fallback_mode: fm }))}
                      disabled={isLive}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[9px] font-bold border transition-all ${draft.fallback_mode === fm ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'} disabled:cursor-default`}
                    >
                      {FALLBACK_LABELS[fm]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: info panels ──────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">Profile Guide</div>
            {(['PDF_STRUCTURED', 'PDF_AGENTIC', 'IMAGE_OCR'] as ExtractionProfile[]).map(p => {
              const meta = PROFILE_META[p];
              return (
                <div key={p} className={`flex gap-2 mb-3 last:mb-0 p-2 rounded-lg ${draft.extraction_profile === p ? 'bg-slate-50' : ''}`}>
                  <span className="shrink-0">{meta.icon}</span>
                  <div>
                    <div className="text-[9px] font-bold text-slate-700">{meta.label}</div>
                    <div className="text-[8px] text-slate-400 leading-relaxed">{meta.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-glass">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Lifecycle</div>
            <div className="space-y-1.5">
              {[
                { s: 'DRAFT', d: 'Building extraction rules' },
                { s: 'PENDING_APPROVAL', d: 'Awaiting 4-Eye review' },
                { s: 'LIVE', d: 'Used by Ingestion Pipeline on uploaded docs' },
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
              4-Eye: approver ≠ creator. LIVE blueprints create a new version; old stays active until new one is approved.
            </div>
          </div>

          {isEditing && editData && (
            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Summary</div>
              <div className="space-y-1 text-[10px] text-slate-600">
                <div><span className="font-semibold">ID:</span> <span className="font-mono">{editData.blueprint_id}</span></div>
                <div><span className="font-semibold">Version:</span> v{editData.version_number}</div>
                <div><span className="font-semibold">Created by:</span> {editData.created_by}</div>
                {editData.made_live_by && <div><span className="font-semibold">Approved by:</span> {editData.made_live_by}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ── PDF Structured / Image OCR extraction rules panel ───────────────────────
const StructuredRulesPanel: React.FC<{
  rules: ReturnType<typeof blankRule>[];
  onChange: (r: ReturnType<typeof blankRule>[]) => void;
  disabled: boolean;
}> = ({ rules, onChange, disabled }) => (
  <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden">
    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
      <div>
        <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest">OCR Extraction Rules</div>
        <div className="text-[10px] text-slate-400 mt-0.5">Each rule targets one field in the document layout.</div>
      </div>
      {!disabled && (
        <button onClick={() => onChange([...rules, blankRule()])} className="px-3 py-1.5 text-[10px] font-bold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-all">
          + Add Rule
        </button>
      )}
    </div>
    <div className="p-4 space-y-3">
      {rules.map((r, idx) => (
        <div key={idx} className="bg-slate-50/60 border border-slate-150 rounded-xl p-3 space-y-2">
          <div className="flex gap-2">
            <input value={r.rule_name} onChange={e => { const n = [...rules]; n[idx] = { ...n[idx], rule_name: e.target.value }; onChange(n); }}
              placeholder="Field name e.g. Invoice Total" disabled={disabled}
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-50" />
            <input type="number" value={r.page} onChange={e => { const n = [...rules]; n[idx] = { ...n[idx], page: Number(e.target.value) }; onChange(n); }}
              placeholder="Pg" disabled={disabled} min={1}
              className="w-14 px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 text-center bg-white disabled:bg-slate-50" />
            {!disabled && rules.length > 1 && (
              <button onClick={() => onChange(rules.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-400 px-1">×</button>
            )}
          </div>
          <input value={r.position_hint} onChange={e => { const n = [...rules]; n[idx] = { ...n[idx], position_hint: e.target.value }; onChange(n); }}
            placeholder="Position hint e.g. bottom-right, last row of amount table" disabled={disabled}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-50" />
          <div className="flex gap-2">
            <input value={r.iso_field} onChange={e => { const n = [...rules]; n[idx] = { ...n[idx], iso_field: e.target.value }; onChange(n); }}
              placeholder="ISO target field e.g. ISO.InstructedAmount" disabled={disabled}
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-50" />
            <button
              onClick={() => { const n = [...rules]; n[idx] = { ...n[idx], is_mandatory: !n[idx].is_mandatory }; onChange(n); }}
              disabled={disabled}
              className={`px-2.5 py-1.5 text-[8px] font-bold rounded-lg border transition-all ${r.is_mandatory ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-500 border-slate-200'} disabled:cursor-default`}
            >
              {r.is_mandatory ? 'Required' : 'Optional'}
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);


// ── PDF Agentic sections panel ───────────────────────────────────────────────
const AgenticSectionsPanel: React.FC<{
  sections: ReturnType<typeof blankSection>[];
  onChange: (s: ReturnType<typeof blankSection>[]) => void;
  disabled: boolean;
}> = ({ sections, onChange, disabled }) => (
  <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden">
    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
      <div>
        <div className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest">Agentic Section Chain</div>
        <div className="text-[10px] text-slate-400 mt-0.5">AI reads the whole document to locate each section, then extracts fields within it.</div>
      </div>
      {!disabled && (
        <button onClick={() => onChange([...sections, blankSection()])} className="px-3 py-1.5 text-[10px] font-bold text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-50 transition-all">
          + Add Section
        </button>
      )}
    </div>
    <div className="p-4 space-y-4">
      {sections.map((section, sIdx) => (
        <div key={sIdx} className="bg-violet-50/40 border border-violet-100 rounded-xl p-4 space-y-3">
          <div className="flex gap-2 items-center">
            <span className="text-[10px] font-extrabold text-violet-500 bg-violet-100 px-2 py-0.5 rounded shrink-0">§{sIdx + 1}</span>
            <input value={section.section_name} onChange={e => { const n = [...sections]; n[sIdx] = { ...n[sIdx], section_name: e.target.value }; onChange(n); }}
              placeholder="Section name e.g. Governing Law Clause" disabled={disabled}
              className="flex-1 px-2.5 py-1.5 text-xs border border-violet-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white disabled:bg-slate-50" />
            {!disabled && sections.length > 1 && (
              <button onClick={() => onChange(sections.filter((_, i) => i !== sIdx))} className="text-slate-300 hover:text-rose-400 px-1">×</button>
            )}
          </div>
          <textarea value={section.section_prompt} onChange={e => { const n = [...sections]; n[sIdx] = { ...n[sIdx], section_prompt: e.target.value }; onChange(n); }}
            placeholder="Section location prompt e.g. Find the governing law and jurisdiction clause in this contract"
            rows={2} disabled={disabled}
            className="w-full px-2.5 py-1.5 text-xs border border-violet-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white resize-none disabled:bg-slate-50" />

          <div className="pl-3 border-l-2 border-violet-200 space-y-2">
            <div className="text-[9px] font-bold text-violet-600 uppercase tracking-wide">Fields within this section</div>
            {section.fields.map((field, fIdx) => (
              <div key={fIdx} className="flex gap-2 items-start flex-wrap">
                <input value={field.field_name} onChange={e => { const n = [...sections]; n[sIdx].fields[fIdx] = { ...n[sIdx].fields[fIdx], field_name: e.target.value }; onChange(n); }}
                  placeholder="Field name" disabled={disabled}
                  className="w-28 px-2 py-1.5 text-[10px] border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white disabled:bg-slate-50" />
                <input value={field.extraction_prompt} onChange={e => { const n = [...sections]; n[sIdx].fields[fIdx] = { ...n[sIdx].fields[fIdx], extraction_prompt: e.target.value }; onChange(n); }}
                  placeholder="Extraction prompt e.g. What is the governing legal jurisdiction?" disabled={disabled}
                  className="flex-1 px-2 py-1.5 text-[10px] border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white disabled:bg-slate-50" />
                <input value={field.iso_field} onChange={e => { const n = [...sections]; n[sIdx].fields[fIdx] = { ...n[sIdx].fields[fIdx], iso_field: e.target.value }; onChange(n); }}
                  placeholder="ISO.FieldName" disabled={disabled}
                  className="w-40 px-2 py-1.5 text-[10px] border border-slate-200 rounded-lg focus:outline-none focus:border-violet-400 bg-white font-mono disabled:bg-slate-50" />
                {!disabled && section.fields.length > 1 && (
                  <button onClick={() => { const n = [...sections]; n[sIdx].fields = n[sIdx].fields.filter((_, i) => i !== fIdx); onChange(n); }} className="text-slate-300 hover:text-rose-400">×</button>
                )}
              </div>
            ))}
            {!disabled && (
              <button onClick={() => { const n = [...sections]; n[sIdx].fields = [...n[sIdx].fields, blankSectionField()]; onChange(n); }}
                className="text-[9px] font-bold text-violet-500 hover:underline">
                + Add field
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);


// ── Image OCR panel ──────────────────────────────────────────────────────────
const ImageOCRPanel: React.FC<{
  rules: ReturnType<typeof blankRule>[];
  onRulesChange: (r: ReturnType<typeof blankRule>[]) => void;
  preProcessing: string[];
  onPreProcessingChange: (p: string[]) => void;
  language: string;
  onLanguageChange: (l: string) => void;
  disabled: boolean;
}> = ({ rules, onRulesChange, preProcessing, onPreProcessingChange, language, onLanguageChange, disabled }) => (
  <div className="space-y-4">
    <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-glass">
      <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">Pre-Processing Pipeline</div>
      <div className="flex gap-2 flex-wrap mb-3">
        {PRE_PROCESSING_OPTIONS.map(opt => {
          const active = preProcessing.includes(opt);
          return (
            <button key={opt} onClick={() => !disabled && onPreProcessingChange(active ? preProcessing.filter(p => p !== opt) : [...preProcessing, opt])}
              disabled={disabled}
              className={`px-2.5 py-1 text-[9px] font-bold rounded-lg border transition-all ${active ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'} disabled:cursor-default`}>
              {opt}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-slate-500 whitespace-nowrap">OCR Language:</span>
        <select value={language} onChange={e => onLanguageChange(e.target.value)} disabled={disabled}
          className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-400 bg-white disabled:bg-slate-50">
          <option value="en">English</option>
          <option value="ar">Arabic</option>
          <option value="zh">Chinese</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="ja">Japanese</option>
          <option value="es">Spanish</option>
        </select>
      </div>
    </div>
    <StructuredRulesPanel rules={rules} onChange={onRulesChange} disabled={disabled} />
  </div>
);
