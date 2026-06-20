// WHY THIS COMPONENT EXISTS (WS-4):
// Legacy banking systems (T24, Flexcube, Midas, Symbols) have hundreds of screens
// that banks need to digitally replicate in InfinityProductOS. Manually recreating
// them in Screen Designer would take weeks per screen. This studio automates that:
//
//   Step 1 — Upload a screenshot of the legacy screen (e.g., T24 "Bilateral Keys")
//   Step 2 — AI Vision (GPT-4o via /ai-assistant/wireframe-to-screen) extracts:
//             field labels, component types, and auto-maps to ISO Field Registry
//   Step 3 — Designer reviews the extraction table: correct types, fix ISO mappings,
//             mark mandatory/optional, reorder fields
//   Step 4 — One click creates a DRAFT ScreenTemplate in Screen Designer
//             exactly as if the designer had built it manually
//
// Why this matters: a bank migrating from T24 has 200+ screens. This compresses
// weeks of manual re-entry into hours of AI-assisted review + correction.
//
// WHAT BREAKS IF REMOVED:
// No automated path from legacy screenshot → Screen Designer. Manual re-entry only.
// The platform cannot credibly promise T24/Flexcube migration support without this.

import React, { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtractedComponent {
  component_type: string;
  label_token: string;
  field_binding: string;
  category: 'USER_DEFINED' | 'READ_ONLY';
  requirement_status: 'MANDATORY' | 'NON_MANDATORY' | 'CONDITIONAL';
  // local-only review state
  _reviewed?: boolean;
  _error?: string;
}

interface ExtractionResult {
  message: string;
  components: ExtractedComponent[];
}

type Step = 'upload' | 'review' | 'save' | 'done';

const COMPONENT_TYPES = [
  'text_input',
  'number_input',
  'date_picker',
  'datetime_picker',
  'dropdown',
  'checkbox',
  'textarea',
  'currency_input',
  'label',
  'readonly',
  'section_header',
];

// ── Main Component ─────────────────────────────────────────────────────────────

export const LegacyOnboardingStudio: React.FC = () => {
  const { setActiveModule, activeProductContext } = usePlatformStore();

  const [step, setStep] = useState<Step>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [components, setComponents] = useState<ExtractedComponent[]>([]);
  const [screenName, setScreenName] = useState('');
  const [screenCategory, setScreenCategory] = useState('MAINTENANCE');
  const [screenDescription, setScreenDescription] = useState('');
  const [savedScreenId, setSavedScreenId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ISO field registry for the mapping dropdowns — fetched once
  const { data: isoFields } = useQuery({
    queryKey: ['iso-fields-for-mapping'],
    queryFn: async () => {
      const res = await apiClient.get('/fields/registry/', { params: { limit: 200 } });
      return res.data.fields as { field_id: string; technical_sys_name: string; client_business_name: string }[];
    },
  });

  // Step 1 → Step 2: Upload image to AI extractor
  const extractMut = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      const res = await apiClient.post('/ai-assistant/wireframe-to-screen', {
        image_base64: base64,
        image_mime_type: file.type || 'image/jpeg',
      });
      return res.data as ExtractionResult;
    },
    onSuccess: (data) => {
      // Derive a screen name from the file name if not yet set
      if (!screenName && uploadedFile) {
        const stem = uploadedFile.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        setScreenName(toTitleCase(stem));
      }
      setComponents(data.components.map(c => ({ ...c, _reviewed: false })));
      setStep('review');
    },
  });

  // Step 3 → Done: POST to /screens/ to create a DRAFT ScreenTemplate
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        screen_name: screenName,
        description: screenDescription || `Auto-generated from legacy screen: ${uploadedFile?.name}`,
        screen_template_category: screenCategory,
        application_package_id: null,
        definition: components.map(({ _reviewed, _error, ...c }) => c),
        action_buttons: [],
        value_list_groups: [],
      };
      const res = await apiClient.post('/screens/', payload);
      return res.data;
    },
    onSuccess: (data) => {
      setSavedScreenId(data.screen_id);
      setStep('done');
    },
  });

  const handleFileDrop = useCallback((file: File) => {
    setUploadedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep('upload');
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileDrop(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileDrop(file);
  };

  const updateComponent = (idx: number, field: string, value: any) => {
    setComponents(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value, _reviewed: true };
      return next;
    });
  };

  const removeComponent = (idx: number) => {
    setComponents(prev => prev.filter((_, i) => i !== idx));
  };

  const moveComponent = (idx: number, direction: -1 | 1) => {
    setComponents(prev => {
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const CATEGORY_COLORS: Record<string, string> = {
    MAINTENANCE: 'bg-blue-100 text-blue-700',
    CONFIGURATION: 'bg-purple-100 text-purple-700',
    TRANSACTION: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Legacy Screen Onboarding Studio</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload a legacy banking screen → AI extracts fields → review + fix → auto-generate in Screen Designer
          </p>
        </div>

        {/* Step progress indicator */}
        <div className="flex items-center gap-1">
          {(['upload', 'review', 'save', 'done'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                step === s
                  ? 'bg-indigo-600 text-white'
                  : (['upload', 'review', 'save', 'done'] as Step[]).indexOf(step) > i
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-400'
              }`}>
                {(['upload', 'review', 'save', 'done'] as Step[]).indexOf(step) > i ? '✓' : i + 1}
                {' '}{toTitleCase(s)}
              </div>
              {i < 3 && <div className="w-4 h-px bg-slate-300" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── STEP 1: Upload ── */}
      {step === 'upload' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center h-80 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
              dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileInput}
              className="hidden"
            />
            <div className="text-4xl mb-3">🖼</div>
            <p className="text-sm font-semibold text-slate-700">Drop a legacy screen screenshot here</p>
            <p className="text-xs text-slate-400 mt-1">or click to browse — PNG, JPG, PDF supported</p>
            <div className="mt-4 flex gap-2">
              {['T24', 'Flexcube', 'Midas', 'Symbols', 'Finacle'].map(s => (
                <span key={s} className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{s}</span>
              ))}
            </div>
          </div>

          {/* Preview + extract button */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Preview</h3>
            </div>
            <div className="p-4 flex flex-col h-64">
              {previewUrl ? (
                <img src={previewUrl} alt="Legacy screen" className="flex-1 object-contain rounded-lg border border-slate-100" />
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
                  Upload a file to preview
                </div>
              )}
              {uploadedFile && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-[11px] text-slate-600 font-medium truncate">{uploadedFile.name}</p>
                  <p className="text-[10px] text-slate-400">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              )}
            </div>
          </div>

          {/* Extract button */}
          {uploadedFile && (
            <div className="col-span-2 flex justify-end">
              <button
                onClick={() => extractMut.mutate(uploadedFile)}
                disabled={extractMut.isPending}
                className="px-8 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-500/20 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center gap-2"
              >
                {extractMut.isPending ? (
                  <>
                    <span className="animate-spin">⟳</span> AI Extracting Fields…
                  </>
                ) : (
                  <>✨ Extract Fields with AI</>
                )}
              </button>
            </div>
          )}

          {extractMut.isError && (
            <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {(extractMut.error as any)?.response?.data?.detail ?? 'Extraction failed. Check that OpenAI API key is configured.'}
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: Review extracted fields ── */}
      {step === 'review' && (
        <div className="space-y-4">
          {/* AI extraction summary */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-xl">✅</span>
            <div>
              <p className="text-sm font-bold text-emerald-800">AI extracted {components.length} fields</p>
              <p className="text-xs text-emerald-600 mt-0.5">Review each field below. Correct the type or ISO mapping if needed, then proceed to save.</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <img src={previewUrl!} alt="" className="w-20 h-14 object-contain rounded border border-emerald-200 opacity-80" />
              <button onClick={() => setStep('upload')} className="text-xs text-emerald-700 border border-emerald-300 rounded-lg px-2 py-1 hover:bg-emerald-100 transition-colors">
                ← Re-upload
              </button>
            </div>
          </div>

          {/* Field review table */}
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Extracted Fields</h3>
              <button
                onClick={() => setComponents(prev => [...prev, {
                  component_type: 'text_input',
                  label_token: 'New Field',
                  field_binding: '',
                  category: 'USER_DEFINED',
                  requirement_status: 'NON_MANDATORY',
                  _reviewed: false,
                }])}
                className="text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1 hover:bg-indigo-50 transition-colors"
              >
                + Add Field
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-slate-50/50">
                    <th className="px-4 py-2.5 text-left w-8">#</th>
                    <th className="px-4 py-2.5 text-left">Label</th>
                    <th className="px-4 py-2.5 text-left w-36">Component Type</th>
                    <th className="px-4 py-2.5 text-left">ISO Field Binding</th>
                    <th className="px-4 py-2.5 text-left w-28">Category</th>
                    <th className="px-4 py-2.5 text-left w-28">Required</th>
                    <th className="px-4 py-2.5 text-center w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((comp, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-slate-50 transition-colors ${comp._reviewed ? 'bg-emerald-50/30' : ''}`}
                    >
                      <td className="px-4 py-2 text-xs text-slate-400 font-mono">{idx + 1}</td>

                      {/* Label */}
                      <td className="px-4 py-2">
                        <input
                          value={comp.label_token}
                          onChange={e => updateComponent(idx, 'label_token', e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-semibold text-slate-800 focus:outline-none focus:border-indigo-400"
                        />
                      </td>

                      {/* Component type */}
                      <td className="px-4 py-2">
                        <select
                          value={comp.component_type}
                          onChange={e => updateComponent(idx, 'component_type', e.target.value)}
                          className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-indigo-400 font-mono"
                        >
                          {COMPONENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>

                      {/* ISO field binding */}
                      <td className="px-4 py-2">
                        <select
                          value={comp.field_binding}
                          onChange={e => updateComponent(idx, 'field_binding', e.target.value)}
                          className={`w-full text-[11px] border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-indigo-400 font-mono ${
                            comp.field_binding ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-600'
                          }`}
                        >
                          <option value="">— No ISO mapping —</option>
                          {isoFields?.map(f => (
                            <option key={f.technical_sys_name} value={f.technical_sys_name}>
                              {f.technical_sys_name} ({f.client_business_name})
                            </option>
                          ))}
                        </select>
                        {!comp.field_binding && (
                          <p className="text-[9px] text-amber-600 mt-0.5 font-medium">⚠ No ISO mapping — field will be unbound</p>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-2">
                        <select
                          value={comp.category}
                          onChange={e => updateComponent(idx, 'category', e.target.value)}
                          className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                        >
                          <option value="USER_DEFINED">Input</option>
                          <option value="READ_ONLY">Read-only</option>
                        </select>
                      </td>

                      {/* Required */}
                      <td className="px-4 py-2">
                        <select
                          value={comp.requirement_status}
                          onChange={e => updateComponent(idx, 'requirement_status', e.target.value)}
                          className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
                        >
                          <option value="MANDATORY">Mandatory</option>
                          <option value="NON_MANDATORY">Optional</option>
                          <option value="CONDITIONAL">Conditional</option>
                        </select>
                      </td>

                      {/* Row actions */}
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => moveComponent(idx, -1)} disabled={idx === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                          <button onClick={() => moveComponent(idx, 1)} disabled={idx === components.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                          <button onClick={() => removeComponent(idx)} className="p-1 text-red-400 hover:text-red-600 ml-1">✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mapping summary footer */}
            <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
              <span className="font-semibold">
                {components.filter(c => c.field_binding).length}/{components.length} ISO-mapped
              </span>
              <span>•</span>
              <span>{components.filter(c => c.requirement_status === 'MANDATORY').length} mandatory</span>
              <span>•</span>
              <span>{components.filter(c => c.category === 'READ_ONLY').length} read-only</span>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep('save')}
              disabled={components.length === 0}
              className="px-7 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
            >
              Looks Good → Set Screen Details
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Screen metadata + save ── */}
      {step === 'save' && (
        <div className="max-w-xl mx-auto space-y-5">
          <div className="bg-white/85 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <h3 className="text-sm font-bold text-slate-700">Screen Details</h3>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Screen Name *</label>
              <input
                value={screenName}
                onChange={e => setScreenName(e.target.value)}
                placeholder="e.g. Bilateral Keys Master"
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Screen Category</label>
              <div className="flex gap-2">
                {(['MAINTENANCE', 'CONFIGURATION', 'TRANSACTION'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setScreenCategory(cat)}
                    className={`flex-1 text-xs font-semibold py-2 rounded-xl border transition-colors ${
                      screenCategory === cat
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                {screenCategory === 'MAINTENANCE' ? 'Static master/reference data (currency, country, BIC codes)' :
                 screenCategory === 'CONFIGURATION' ? 'Drives workflow routing when submitted (product limits, rules)' :
                 'Human-in-loop step in a workflow (approval, review, exception)'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
              <textarea
                value={screenDescription}
                onChange={e => setScreenDescription(e.target.value)}
                rows={2}
                placeholder={`Auto-generated from legacy screen: ${uploadedFile?.name}`}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>

            {/* Summary of what will be created */}
            <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4 text-xs text-slate-700 space-y-1.5">
              <p className="font-bold text-indigo-700 mb-2">Will create in Screen Designer:</p>
              <p>• <strong>{components.length}</strong> fields ({components.filter(c => c.field_binding).length} ISO-mapped)</p>
              <p>• Status: <strong>DRAFT</strong> — needs Submit → 4-Eye → Make Live</p>
              <p>• Category: <strong>{screenCategory}</strong></p>
              <p>• Source: <strong>{uploadedFile?.name}</strong></p>
            </div>

            {saveMut.isError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-xl">
                {(saveMut.error as any)?.response?.data?.detail ?? 'Failed to create screen. Try again.'}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('review')}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                ← Back to Review
              </button>
              <button
                onClick={() => saveMut.mutate()}
                disabled={!screenName.trim() || saveMut.isPending}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {saveMut.isPending ? '⟳ Creating…' : '✓ Create Screen Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: Done ── */}
      {step === 'done' && savedScreenId && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-5">
          <div className="w-20 h-20 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-4xl">
            🎉
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">{screenName} created!</h3>
            <p className="text-sm text-slate-500 mt-1">
              The screen is now in DRAFT in Screen Designer.
              Submit it for 4-Eye review, then Make Live to deploy it.
            </p>
            <p className="text-xs text-slate-400 mt-1 font-mono">Screen ID: {savedScreenId}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setActiveModule('screen-designer')}
              className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all"
            >
              Open in Screen Designer →
            </button>
            <button
              onClick={() => {
                setStep('upload');
                setUploadedFile(null);
                setPreviewUrl(null);
                setComponents([]);
                setScreenName('');
                setScreenDescription('');
                setSavedScreenId(null);
              }}
              className="px-6 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
            >
              Onboard Another Screen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // FileReader returns "data:image/png;base64,XXXX" — strip the prefix
      const result = (reader.result as string).split(',')[1];
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}
