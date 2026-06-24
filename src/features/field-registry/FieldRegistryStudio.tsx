// ============================================================
// WHY THIS FILE EXISTS:
// This is the Universal Field Registry Studio — the master control panel for managing
// the 3,013 ISO 20022 financial data fields that serve as the universal vocabulary
// across ALL 10 studios in the platform.
//
// Think of it as the "dictionary" that all other studios reference. When a business
// user builds a rule in the Rules Studio or maps a field in the Data Gateway,
// they pick from fields defined here.
//
// WHAT A BUSINESS OPERATIONS USER CAN DO HERE:
// 1. Search across 3,013 ISO standard fields by name, description, or domain
// 2. Give each field a "bank-friendly" name (e.g. ISO "InstructedAmount" → "Wire Amount")
// 3. Toggle whether studios show the ISO name or the bank's custom name (display_preference)
// 4. Filter by domain (PAYMENTS, TREASURY, etc.), data type, PII status
// 5. Bulk-update display preferences across many fields at once
// 6. Register brand-new custom fields not in the ISO standard
//
// WHAT BREAKS IF THIS STUDIO IS REMOVED:
// Business users lose the ability to manage the semantic layer. Fields would only
// show ISO technical names (e.g. "Cdtr.Acct.Id.IBAN") which are unreadable to
// non-technical bank staff. All field-picker dropdowns across studios would
// show ISO codes instead of human-friendly names.
//
// ARCHITECTURE NOTE:
// This studio talks to routers/registry.py via the /fields/registry/search endpoint.
// The IsoFieldSelector component (src/components/IsoFieldSelector.tsx) is the
// lightweight field-picker used inside other studios — this studio is the full
// management console for what that picker displays.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import {
  Lock, ToggleLeft, ToggleRight, ChevronUp, ChevronDown,
  ShieldAlert, Eye, Database, Layers, ChevronRight,
  CheckSquare, Square, X, Filter, ArrowUpDown
} from 'lucide-react';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ISOField {
  field_id: string;
  technical_sys_name: string;
  iso_business_name: string;
  client_business_name: string | null;
  display_preference: 'ISO' | 'CLIENT';
  domain_category: string;
  subdomain_category?: string;
  data_type: string;
  is_pii: boolean;
  masking_strategy?: string;
  description?: string;
  status?: string;
}

type SortDir = 'asc' | 'desc';

interface SortState {
  column: string;
  dir: SortDir;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DOMAIN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PAYMENTS:      { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  TREASURY:      { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  CUSTOMER_DATA: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  HELOC:         { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
};
const DEFAULT_DOMAIN_COLOR = { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };

function domainColor(d: string) { return DOMAIN_COLORS[d] || DEFAULT_DOMAIN_COLOR; }

// ─── Inline toggle mutation ────────────────────────────────────────────────────

function useToggleDisplay(queryClient: ReturnType<typeof useQueryClient>) {
  return useMutation({
    mutationFn: async ({ field_id, display_preference }: { field_id: string; display_preference: 'ISO' | 'CLIENT' }) => {
      const res = await apiClient.patch(`/fields/registry/${field_id}/preferences`, { display_preference });
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fields'] }),
  });
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ totalCount, piiCount, clientCount }: { totalCount: number; piiCount: number; clientCount: number }) {
  return (
    <div className="grid grid-cols-3 gap-4 px-6 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
      <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-2 bg-blue-50 rounded-lg"><Database size={16} className="text-blue-600" /></div>
        <div>
          <div className="text-[22px] font-extrabold text-slate-800 leading-none">{totalCount.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Total Fields</div>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-red-100 shadow-sm">
        <div className="p-2 bg-red-50 rounded-lg"><ShieldAlert size={16} className="text-red-600" /></div>
        <div>
          <div className="text-[22px] font-extrabold text-red-700 leading-none">{piiCount}</div>
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">PII Fields</div>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-indigo-100 shadow-sm">
        <div className="p-2 bg-indigo-50 rounded-lg"><Eye size={16} className="text-indigo-600" /></div>
        <div>
          <div className="text-[22px] font-extrabold text-indigo-700 leading-none">{clientCount}</div>
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Client Display</div>
        </div>
      </div>
    </div>
  );
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

function SortTh({ label, column, sort, onSort, className = '' }: {
  label: string; column: string; sort: SortState; onSort: (col: string) => void; className?: string;
}) {
  const active = sort.column === column;
  return (
    <th
      className={`px-4 py-3 font-bold text-slate-600 uppercase text-[10px] tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors ${className}`}
      onClick={() => onSort(column)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (
          sort.dir === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />
        ) : (
          <ArrowUpDown size={11} className="text-slate-300" />
        )}
      </span>
    </th>
  );
}

// ─── Filter Chips Bar ─────────────────────────────────────────────────────────

function FilterChips({
  domains, selectedDomain, onDomain,
  dataTypes, selectedType, onType,
  piiOnly, onPii,
  displayFilter, onDisplay,
  onClear, activeCount
}: {
  domains: string[];
  selectedDomain: string;
  onDomain: (d: string) => void;
  dataTypes: string[];
  selectedType: string;
  onType: (t: string) => void;
  piiOnly: boolean;
  onPii: (v: boolean) => void;
  displayFilter: '' | 'ISO' | 'CLIENT';
  onDisplay: (v: '' | 'ISO' | 'CLIENT') => void;
  onClear: () => void;
  activeCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-white border-b border-slate-200">
      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        <Filter size={11} />Filters
      </span>

      {/* Domain chips */}
      {domains.map(d => {
        const c = domainColor(d);
        const active = selectedDomain === d;
        return (
          <button key={d}
            onClick={() => onDomain(active ? '' : d)}
            className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-all ${active ? `${c.bg} ${c.text} ${c.border} shadow-sm ring-1 ring-offset-1 ring-current` : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'}`}
          >
            {d}
          </button>
        );
      })}

      <div className="w-px h-5 bg-slate-200 mx-1" />

      {/* Data type chips */}
      {dataTypes.map(t => (
        <button key={t}
          onClick={() => onType(selectedType === t ? '' : t)}
          className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-all ${selectedType === t ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-500'}`}
        >
          {t}
        </button>
      ))}

      <div className="w-px h-5 bg-slate-200 mx-1" />

      {/* PII toggle */}
      <button
        onClick={() => onPii(!piiOnly)}
        className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-all flex items-center gap-1 ${piiOnly ? 'bg-red-600 text-white border-red-600 shadow-sm' : 'bg-white text-slate-500 border-slate-300 hover:border-red-400 hover:text-red-600'}`}
      >
        <ShieldAlert size={10} /> PII Only
      </button>

      {/* Display mode */}
      {(['ISO', 'CLIENT'] as const).map(v => (
        <button key={v}
          onClick={() => onDisplay(displayFilter === v ? '' : v)}
          className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-all ${displayFilter === v ? (v === 'CLIENT' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-600 text-white border-slate-600') : 'bg-white text-slate-500 border-slate-300 hover:border-slate-500'}`}
        >
          {v === 'ISO' ? 'ISO Display' : 'Client Display'}
        </button>
      ))}

      {activeCount > 0 && (
        <button onClick={onClear} className="ml-1 text-[11px] font-bold text-slate-400 hover:text-slate-700 flex items-center gap-1 transition-colors">
          <X size={12} /> Clear ({activeCount})
        </button>
      )}
    </div>
  );
}

// ─── Domain Group Row ─────────────────────────────────────────────────────────

function DomainGroup({ domain, fields, selectedIds, onToggleField, onToggleDisplay, onOpenEdit, onShowLineage }: {
  domain: string;
  fields: ISOField[];
  selectedIds: Set<string>;
  onToggleField: (id: string) => void;
  onToggleDisplay: (field: ISOField) => void;
  onOpenEdit: (field: ISOField) => void;
  onShowLineage: (field: ISOField) => void;
}) {
  const [open, setOpen] = useState(true);
  const c = domainColor(domain);
  const allSelected = fields.every(f => selectedIds.has(f.field_id));
  return (
    <tbody>
      <tr className={`${c.bg} border-y ${c.border} cursor-pointer`} onClick={() => setOpen(o => !o)}>
        <td colSpan={9} className="px-4 py-2">
          <div className="flex items-center gap-3">
            <input type="checkbox" className="w-3.5 h-3.5 rounded"
              checked={allSelected}
              onClick={e => { e.stopPropagation(); fields.forEach(f => onToggleField(f.field_id)); }}
              readOnly
            />
            <ChevronRight size={14} className={`${c.text} transition-transform ${open ? 'rotate-90' : ''}`} />
            <span className={`text-[11px] font-extrabold uppercase tracking-widest ${c.text}`}>{domain}</span>
            <span className={`text-[10px] font-bold ${c.text} opacity-60`}>{fields.length} fields</span>
          </div>
        </td>
      </tr>
      {open && fields.map(f => (
        <FieldRow key={f.field_id} field={f} selected={selectedIds.has(f.field_id)}
          onToggle={() => onToggleField(f.field_id)}
          onToggleDisplay={() => onToggleDisplay(f)}
          onOpenEdit={() => onOpenEdit(f)}
          onShowLineage={() => onShowLineage(f)} />
      ))}
    </tbody>
  );
}

// ─── Field Row ─────────────────────────────────────────────────────────────────

function FieldRow({ field, selected, onToggle, onToggleDisplay, onOpenEdit, onShowLineage }: {
  field: ISOField; selected: boolean;
  onToggle: () => void;
  onToggleDisplay: () => void;
  onOpenEdit: () => void;
  onShowLineage: () => void;
}) {
  const c = domainColor(field.domain_category);
  return (
    <tr className={`hover:bg-blue-50/30 transition-colors border-b border-slate-100 ${selected ? 'bg-blue-50/60' : ''}`}>
      <td className="px-4 py-2.5 w-8">
        <input type="checkbox" checked={selected} onChange={onToggle} className="w-3.5 h-3.5 rounded text-blue-600" />
      </td>
      <td className="px-4 py-2.5 font-mono text-[11px] text-[#0176D3] max-w-[130px]">
        <span className="truncate block" title={field.technical_sys_name}>{field.technical_sys_name}</span>
      </td>
      <td className="px-4 py-2.5 text-[12px] text-slate-700 max-w-[180px]">
        <span className="truncate block" title={field.iso_business_name}>{field.iso_business_name}</span>
      </td>
      <td className="px-4 py-2.5 text-[12px] font-semibold text-slate-800 max-w-[150px]">
        <span className="truncate block" title={field.client_business_name || ''}>
          {field.client_business_name || <span className="text-slate-300 italic font-normal text-[11px]">not set</span>}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <button
          onClick={onToggleDisplay}
          title={`Click to switch to ${field.display_preference === 'CLIENT' ? 'ISO' : 'CLIENT'}`}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer ${
            field.display_preference === 'CLIENT'
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
          }`}
        >
          {field.display_preference === 'CLIENT' ? <ToggleRight size={11} /> : <ToggleLeft size={11} />}
          {field.display_preference}
        </button>
      </td>
      <td className="px-4 py-2.5">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border ${c.bg} ${c.text} ${c.border}`}>
          {field.domain_category}
        </span>
      </td>
      <td className="px-4 py-2.5 text-[11px] text-slate-600 font-medium">{field.data_type}</td>
      <td className="px-4 py-2.5">
        {field.is_pii ? (
          <span className="inline-flex items-center gap-1 text-red-700 font-bold text-[10px] uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded border border-red-100">
            <Lock size={9} /> PII
          </span>
        ) : (
          <span className="text-emerald-600 font-bold text-[10px] uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">OK</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <button onClick={onShowLineage} title="Where is this field used?" className="text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:underline uppercase tracking-wider transition-colors mr-3">
          Lineage
        </button>
        <button onClick={onOpenEdit} className="text-[11px] font-bold text-[#0176D3] hover:text-blue-800 hover:underline uppercase tracking-wider transition-colors">
          Edit
        </button>
      </td>
    </tr>
  );
}

// ─── Bulk Action Bar ───────────────────────────────────────────────────────────

function BulkBar({ count, onSetDisplay, onClear, isPending }: {
  count: number; onSetDisplay: (v: 'ISO' | 'CLIENT') => void; onClear: () => void; isPending: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 animate-fade-in">
      <CheckSquare size={16} className="text-blue-400" />
      <span className="text-[13px] font-bold">{count} selected</span>
      <div className="w-px h-5 bg-slate-700" />
      <span className="text-[11px] text-slate-400 font-semibold">Set display:</span>
      <button onClick={() => onSetDisplay('ISO')} disabled={isPending}
        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-50">
        ISO Standard
      </button>
      <button onClick={() => onSetDisplay('CLIENT')} disabled={isPending}
        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50">
        Client Display
      </button>
      <button onClick={onClear} className="ml-1 text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
    </div>
  );
}

// ─── Main Studio ───────────────────────────────────────────────────────────────

export const FieldRegistryStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeProductContext } = usePlatformStore();
  const domainContext = activeProductContext || 'Global';

  // Phase 7 — the field whose lineage ("where used") panel is open (null = closed).
  const [lineageField, setLineageField] = useState<ISOField | null>(null);

  // Search & filters
  const [rawSearch, setRawSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [piiOnly, setPiiOnly] = useState(false);
  const [displayFilter, setDisplayFilter] = useState<'' | 'ISO' | 'CLIENT'>('');

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Sorting
  const [sort, setSort] = useState<SortState>({ column: 'iso_business_name', dir: 'asc' });

  // View mode
  const [groupByDomain, setGroupByDomain] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drawers
  const [editingField, setEditingField] = useState<ISOField | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editDisplayPref, setEditDisplayPref] = useState<'ISO' | 'CLIENT'>('ISO');
  const [isNewDrawerOpen, setIsNewDrawerOpen] = useState(false);
  const [localizedNames, setLocalizedNames] = useState<any>(null);

  // Stats state from API
  const [statsTotal, setStatsTotal] = useState(0);
  const [statsPii, setStatsPii] = useState(0);
  const [statsClient, setStatsClient] = useState(0);

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchTerm(rawSearch);
      setPage(0);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [rawSearch]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [selectedDomain, selectedType, piiOnly, displayFilter, sort]);

  // Build query params
  const buildParams = useCallback((overrides?: Record<string, string | number | boolean>) => {
    const p = new URLSearchParams();
    p.set('skip', String(page * pageSize));
    p.set('limit', String(pageSize));
    p.set('sort_by', sort.column);
    p.set('sort_dir', sort.dir);
    if (searchTerm.length >= 2) p.set('q', searchTerm);
    if (selectedDomain) p.set('domain_category', selectedDomain);
    if (selectedType) p.set('data_type', selectedType);
    if (piiOnly) p.set('is_pii', 'true');
    if (displayFilter) p.set('display_preference', displayFilter);
    if (overrides) Object.entries(overrides).forEach(([k, v]) => p.set(k, String(v)));
    return p.toString();
  }, [page, pageSize, sort, searchTerm, selectedDomain, selectedType, piiOnly, displayFilter]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['fields', searchTerm, selectedDomain, selectedType, piiOnly, displayFilter, page, pageSize, sort],
    queryFn: async () => {
      const res = await apiClient.get(`/fields/registry/search?${buildParams()}`);
      return res.data as { fields: ISOField[]; total_count: number };
    },
    staleTime: 30_000,
  });

  // Fetch stats separately (unfiltered totals)
  const { data: statsData } = useQuery({
    queryKey: ['fields-stats'],
    queryFn: async () => {
      const [all, pii, client] = await Promise.all([
        apiClient.get('/fields/registry/search?limit=1&skip=0'),
        apiClient.get('/fields/registry/search?limit=1&skip=0&is_pii=true'),
        apiClient.get('/fields/registry/search?limit=1&skip=0&display_preference=CLIENT'),
      ]);
      return { total: all.data.total_count, pii: pii.data.total_count, client: client.data.total_count };
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (statsData) {
      setStatsTotal(statsData.total);
      setStatsPii(statsData.pii);
      setStatsClient(statsData.client);
    }
  }, [statsData]);

  // Fetch domain list
  const { data: domainData } = useQuery({
    queryKey: ['registry-domains'],
    queryFn: async () => {
      const res = await apiClient.get('/fields/registry/domain-categories');
      return res.data.domain_categories as string[];
    },
    staleTime: 300_000,
  });

  const domains = domainData || [];
  const dataTypes = ['Amount', 'Text', 'Date', 'Decimal', 'Alphanumeric', 'Identifier'];
  const activeFilterCount = [selectedDomain, selectedType, piiOnly, displayFilter].filter(Boolean).length;

  const handleSort = (col: string) => {
    setSort(s => s.column === col ? { column: col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { column: col, dir: 'asc' });
  };

  // Inline toggle display
  const toggleDisplay = useToggleDisplay(queryClient);
  const handleToggleDisplay = (field: ISOField) => {
    toggleDisplay.mutate({ field_id: field.field_id, display_preference: field.display_preference === 'ISO' ? 'CLIENT' : 'ISO' });
  };

  // Edit drawer
  const openEditDrawer = (field: ISOField) => {
    setEditingField(field);
    setEditClientName(field.client_business_name || '');
    setEditDisplayPref(field.display_preference === 'CLIENT' ? 'CLIENT' : 'ISO');
  };

  const updatePrefsMutation = useMutation({
    mutationFn: async ({ field_id, ...payload }: { field_id: string; client_business_name: string; display_preference: string }) => {
      const res = await apiClient.patch(`/fields/registry/${field_id}/preferences`, payload);
      return res.data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fields'] }); queryClient.invalidateQueries({ queryKey: ['fields-stats'] }); setEditingField(null); },
    onError: (err: any) => alert(err.response?.data?.detail || 'Failed to update.'),
  });

  const handleSavePreferences = () => {
    if (!editingField) return;
    updatePrefsMutation.mutate({ field_id: editingField.field_id, client_business_name: editClientName, display_preference: editDisplayPref });
  };

  // Create field
  const createMutation = useMutation({
    mutationFn: async (payload: any) => { const res = await apiClient.post('/fields/registry/', payload); return res.data; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fields'] }); queryClient.invalidateQueries({ queryKey: ['fields-stats'] }); setIsNewDrawerOpen(false); setLocalizedNames(null); },
  });

  const translateMutation = useMutation({
    mutationFn: async (p: { business_name: string; domain_category: string }) => { const res = await apiClient.post('/assistant/translate-field', p); return res.data; },
    onSuccess: (d) => setLocalizedNames(d.translations),
    onError: (err: any) => alert(err.response?.data?.detail || 'Translation failed.'),
  });

  const handleNewSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      technical_sys_name: fd.get('technical_sys_name'),
      client_business_name: fd.get('client_business_name'),
      iso_business_name: fd.get('iso_business_name'),
      display_preference: fd.get('display_preference') || 'ISO',
      domain_category: domainContext,
      data_type: fd.get('data_type'),
      is_pii: fd.get('is_pii') === 'on',
      localized_names: localizedNames,
    });
  };

  // Bulk actions
  const toggleField = (id: string) => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());
  const toggleAllVisible = () => {
    const ids = data?.fields.map(f => f.field_id) || [];
    const allSel = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const n = new Set(prev);
      allSel ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id));
      return n;
    });
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async (display_preference: 'ISO' | 'CLIENT') => {
      await Promise.all([...selectedIds].map(id =>
        apiClient.patch(`/fields/registry/${id}/preferences`, { display_preference })
      ));
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fields'] }); queryClient.invalidateQueries({ queryKey: ['fields-stats'] }); clearSelection(); },
  });

  const fields = data?.fields || [];
  const totalCount = data?.total_count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const allOnPageSelected = fields.length > 0 && fields.every(f => selectedIds.has(f.field_id));

  // Group by domain
  const groupedFields = groupByDomain
    ? fields.reduce<Record<string, ISOField[]>>((acc, f) => {
        const d = f.domain_category || 'OTHER';
        if (!acc[d]) acc[d] = [];
        acc[d].push(f);
        return acc;
      }, {})
    : {};

  const clearFilters = () => { setSelectedDomain(''); setSelectedType(''); setPiiOnly(false); setDisplayFilter(''); };

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm flex flex-col h-[calc(100vh-120px)] relative overflow-hidden">
      <InfinityAIHelper studioKey="field-registry" />

      {/* ── Header ── */}
      <div className="flex justify-between items-start px-6 py-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Universal Field Registry</h1>
          <p className="text-sm text-slate-500 mt-0.5">Universal semantic vocabulary across all studios — {statsTotal.toLocaleString()} attributes registered.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search fields (e.g. amount, SSN)..."
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none w-72 shadow-sm"
              value={rawSearch}
              onChange={e => setRawSearch(e.target.value)}
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {rawSearch && (
              <button onClick={() => setRawSearch('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* View toggle */}
          <button
            onClick={() => setGroupByDomain(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[12px] font-bold transition-colors ${groupByDomain ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}
          >
            <Layers size={13} /> {groupByDomain ? 'Grouped' : 'Flat'}
          </button>

          <button
            onClick={() => setIsNewDrawerOpen(true)}
            className="bg-[#0176D3] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors"
          >
            + New Field
          </button>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <StatsBar totalCount={statsTotal} piiCount={statsPii} clientCount={statsClient} />

      {/* ── Filters ── */}
      <FilterChips
        domains={domains} selectedDomain={selectedDomain} onDomain={d => { setSelectedDomain(d); setPage(0); }}
        dataTypes={dataTypes} selectedType={selectedType} onType={t => { setSelectedType(t); setPage(0); }}
        piiOnly={piiOnly} onPii={v => { setPiiOnly(v); setPage(0); }}
        displayFilter={displayFilter} onDisplay={v => { setDisplayFilter(v); setPage(0); }}
        onClear={clearFilters} activeCount={activeFilterCount}
      />

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-sm text-slate-500 font-semibold">Synchronizing Registry...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-red-500 font-bold">Error loading fields from Core Engine.</div>
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllVisible}
                    className="w-3.5 h-3.5 rounded text-blue-600" />
                </th>
                <SortTh label="Technical Name" column="technical_sys_name" sort={sort} onSort={handleSort} className="w-[140px]" />
                <SortTh label="ISO Business Name" column="iso_business_name" sort={sort} onSort={handleSort} />
                <SortTh label="Client Name" column="client_business_name" sort={sort} onSort={handleSort} />
                <th className="px-4 py-3 font-bold text-slate-600 uppercase text-[10px] tracking-wider">Display</th>
                <SortTh label="Domain" column="domain_category" sort={sort} onSort={handleSort} />
                <SortTh label="Type" column="data_type" sort={sort} onSort={handleSort} />
                <th className="px-4 py-3 font-bold text-slate-600 uppercase text-[10px] tracking-wider">PII</th>
                <th className="px-4 py-3 font-bold text-slate-600 uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>

            {groupByDomain ? (
              Object.entries(groupedFields).map(([domain, dFields]) => (
                <DomainGroup key={domain} domain={domain} fields={dFields}
                  selectedIds={selectedIds}
                  onToggleField={toggleField}
                  onToggleDisplay={handleToggleDisplay}
                  onOpenEdit={openEditDrawer}
                  onShowLineage={setLineageField}
                />
              ))
            ) : (
              <tbody className="divide-y divide-slate-100">
                {fields.map(field => (
                  <FieldRow key={field.field_id} field={field}
                    selected={selectedIds.has(field.field_id)}
                    onToggle={() => toggleField(field.field_id)}
                    onToggleDisplay={() => handleToggleDisplay(field)}
                    onOpenEdit={() => openEditDrawer(field)}
                    onShowLineage={() => setLineageField(field)}
                  />
                ))}
                {fields.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Database size={32} className="opacity-30" />
                        <span className="font-semibold text-sm">No fields match your criteria.</span>
                        {activeFilterCount > 0 && (
                          <button onClick={clearFilters} className="text-[12px] text-blue-600 hover:underline font-bold mt-1">Clear all filters</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            )}
          </table>
        )}
      </div>

      {/* ── Pagination Footer ── */}
      <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-slate-500 font-semibold">
            {totalCount === 0 ? 'No results' : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalCount)} of ${totalCount.toLocaleString()}`}
          </span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="text-[12px] border border-slate-300 rounded py-1 px-2 bg-white text-slate-700 font-semibold focus:outline-none focus:border-blue-400"
          >
            {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} / page</option>)}
          </select>
        </div>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          <button disabled={page === 0} onClick={() => setPage(0)}
            className="px-2 py-1 text-[11px] font-bold border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors">
            «
          </button>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="px-2.5 py-1 text-[11px] font-bold border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors">
            ‹ Prev
          </button>
          {(() => {
            // Build a CONTIGUOUS window of page numbers centred on the current page.
            // The previous per-index clamp produced duplicates near the edges
            // (e.g. 0,0,0,0,1,2,3 → rendered "1 1 1 1 2 3 4" with duplicate React
            // keys). Compute a single window start so every page number is unique.
            const windowSize = Math.min(totalPages, 7);
            const start = Math.max(0, Math.min(page - Math.floor(windowSize / 2), totalPages - windowSize));
            return Array.from({ length: windowSize }, (_, i) => {
              const p = start + i;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-8 h-7 text-[11px] font-bold rounded transition-colors ${p === page ? 'bg-[#0176D3] text-white border border-blue-600' : 'border border-slate-300 bg-white hover:bg-slate-100 text-slate-600'}`}>
                  {p + 1}
                </button>
              );
            });
          })()}
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            className="px-2.5 py-1 text-[11px] font-bold border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors">
            Next ›
          </button>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}
            className="px-2 py-1 text-[11px] font-bold border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-40 transition-colors">
            »
          </button>
        </div>
      </div>

      {/* ── Bulk Action Bar ── */}
      <BulkBar
        count={selectedIds.size}
        onSetDisplay={v => bulkUpdateMutation.mutate(v)}
        onClear={clearSelection}
        isPending={bulkUpdateMutation.isPending}
      />

      {/* ── Edit Preferences Drawer ── */}
      {editingField && (
        <div className="absolute top-0 right-0 w-[440px] h-full bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col">
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div>
              <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Bank Display Preferences</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Customize how this field appears across all Studios</p>
            </div>
            <button onClick={() => setEditingField(null)} className="text-slate-400 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={12} className="text-slate-400" />
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">ISO 20022 Standard Name (Immutable)</label>
              </div>
              <div className="font-mono text-[13px] text-slate-700 font-semibold">{editingField.iso_business_name}</div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={12} className="text-slate-400" />
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Technical System Name (Immutable)</label>
              </div>
              <div className="font-mono text-[12px] text-[#0176D3] font-semibold">{editingField.technical_sys_name}</div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">Your Bank's Name for This Field</label>
              <input
                type="text"
                value={editClientName}
                onChange={e => setEditClientName(e.target.value)}
                placeholder="e.g., Principal Remittance Amount"
                className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded-xl p-3 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-3">Display Mode Across All Studios</label>
              <div className="grid grid-cols-2 gap-3">
                {(['ISO', 'CLIENT'] as const).map(pref => (
                  <button key={pref} onClick={() => setEditDisplayPref(pref)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${editDisplayPref === pref
                      ? pref === 'ISO' ? 'border-slate-500 bg-slate-50' : 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {pref === 'ISO' ? <ToggleLeft size={14} className={editDisplayPref === 'ISO' ? 'text-slate-600' : 'text-slate-400'} /> : <ToggleRight size={14} className={editDisplayPref === 'CLIENT' ? 'text-indigo-600' : 'text-slate-400'} />}
                      <span className={`text-[11px] font-extrabold uppercase tracking-wider ${editDisplayPref === pref ? (pref === 'ISO' ? 'text-slate-700' : 'text-indigo-700') : 'text-slate-500'}`}>
                        {pref === 'ISO' ? 'ISO Standard' : 'Bank Name'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">{pref === 'ISO' ? 'Show ISO 20022 canonical name everywhere' : "Show your bank's custom name everywhere"}</p>
                  </button>
                ))}
              </div>
            </div>

            {editingField.description && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">ISO Standard Definition</label>
                <p className="text-[11px] text-blue-800 leading-relaxed line-clamp-4">{editingField.description}</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
            <button onClick={() => setEditingField(null)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
            <button onClick={handleSavePreferences} disabled={updatePrefsMutation.isPending}
              className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
              {updatePrefsMutation.isPending ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* ── New Field Drawer ── */}
      {isNewDrawerOpen && (
        <div className="absolute top-0 right-0 w-[450px] h-full bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col">
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Register New ISO Field</h2>
            <button onClick={() => { setIsNewDrawerOpen(false); setLocalizedNames(null); }} className="text-slate-400 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleNewSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Technical System Name</label>
                <input name="technical_sys_name" required placeholder="e.g., of_fintax_bal_01" className="w-full text-[13px] font-mono text-[#0176D3] border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">ISO 20022 Standard Name</label>
                <input name="iso_business_name" required placeholder="e.g., Balances.Principal" className="w-full text-[13px] border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 outline-none" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bank's Client Name</label>
                  <button type="button" onClick={() => {
                    const form = document.querySelector('form[data-new-field]') as HTMLFormElement;
                    const name = form?.querySelector<HTMLInputElement>('[name=client_business_name]')?.value;
                    if (name) translateMutation.mutate({ business_name: name, domain_category: domainContext });
                    else alert('Enter a client business name first.');
                  }} disabled={translateMutation.isPending} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50">
                    {translateMutation.isPending ? 'Translating...' : '✨ Auto-Translate'}
                  </button>
                </div>
                <input name="client_business_name" required placeholder="e.g., Principal Amount" className="w-full text-[13px] font-semibold border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 outline-none" />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Default Display Mode</label>
                <div className="flex gap-2">
                  {(['ISO', 'CLIENT'] as const).map(pref => (
                    <label key={pref} className="flex items-center gap-2 cursor-pointer p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 flex-1">
                      <input type="radio" name="display_preference" value={pref} defaultChecked={pref === 'ISO'} className="text-[#0176D3]" />
                      <span className="text-[12px] font-bold text-slate-700">{pref === 'ISO' ? 'ISO Standard' : 'Bank Name'}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Domain 🔒</label>
                  <div className="text-[13px] font-bold text-slate-600 bg-slate-50 border border-slate-300 rounded p-2.5 truncate">{domainContext}</div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data Type</label>
                  <select name="data_type" className="w-full text-[13px] border border-slate-300 rounded p-2.5 focus:border-[#0176D3] outline-none bg-white">
                    {['Text', 'Decimal', 'Amount', 'Date', 'Alphanumeric', 'Identifier'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {localizedNames && (
                <div className="bg-indigo-50 border border-indigo-100 rounded p-4 animate-fade-in">
                  <h3 className="text-[11px] font-extrabold text-indigo-800 uppercase tracking-wider mb-3">✨ AI Localizations</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(localizedNames).map(([locale, v]) => (
                      <div key={locale}>
                        <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">{locale}</div>
                        <div className="text-[12px] font-semibold text-indigo-900">{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input type="checkbox" name="is_pii" id="new_is_pii" className="w-4 h-4 text-[#0176D3] border-slate-300 rounded" />
                <label htmlFor="new_is_pii" className="text-[12px] font-bold text-slate-700">Contains PII (Personally Identifiable Information)</label>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button type="button" onClick={() => { setIsNewDrawerOpen(false); setLocalizedNames(null); }} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
                {createMutation.isPending ? 'Saving...' : 'Register Field'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Phase 7 — field lineage / where-used panel */}
      {lineageField && (
        <LineageModal field={lineageField} onClose={() => setLineageField(null)} />
      )}
    </div>
  );
};

// ─── Lineage ("Where Used") Modal ──────────────────────────────────────────────
// WHY THIS EXISTS (FIELD_REGISTRY_REQUIREMENTS.md §8): bank-grade impact analysis —
// shows every rule, calculation, screen, workflow step, mapper, notification, and
// report that references this field, so a user sees what breaks before changing it.
// Calls GET /fields/registry/{field_id}/where-used.
const LINEAGE_GROUPS: { key: string; label: string }[] = [
  { key: 'rules', label: 'Business Rules' },
  { key: 'calculations', label: 'Calculations' },
  { key: 'screens', label: 'Screens' },
  { key: 'workflow_steps', label: 'Workflow Steps' },
  { key: 'mappers', label: 'Data Gateway Mappers' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'reports', label: 'Reports' },
];

function LineageModal({ field, onClose }: { field: ISOField; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['field-where-used', field.field_id],
    queryFn: async () => (await apiClient.get(`/fields/registry/${field.field_id}/where-used`)).data,
  });
  const usages = data?.usages ?? {};
  const total = data?.usage_count ?? 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-[120] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-[#1c2230]">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-white">Field lineage — where used</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate">{field.technical_sys_name}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg font-bold">✕</button>
        </div>
        <div className="p-5 overflow-y-auto">
          {isLoading ? (
            <div className="py-10 text-center text-[12px] text-slate-400">Scanning the platform…</div>
          ) : total === 0 ? (
            <div className="py-10 text-center">
              <div className="text-[13px] font-semibold text-slate-600">Not used anywhere yet</div>
              <div className="text-[11px] text-slate-400 mt-1">Safe to change — no rules, screens, calcs, workflows, mappers, notifications, or reports reference it.</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-[12px] text-slate-600">
                Referenced in <span className="font-bold text-slate-900">{total}</span> place{total === 1 ? '' : 's'} across the platform.
              </div>
              {LINEAGE_GROUPS.map(g => {
                const rows: any[] = usages[g.key] ?? [];
                if (rows.length === 0) return null;
                return (
                  <div key={g.key} className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">{g.label}</span>
                      <span className="text-[10px] font-bold text-slate-400">{rows.length}</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {rows.map((r, i) => (
                        <div key={i} className="px-4 py-2 flex items-center justify-between gap-3">
                          <span className="text-[12px] font-semibold text-slate-800 truncate">{r.name || r.id}</span>
                          <span className="text-[10px] font-mono text-slate-400 truncate shrink-0">{r.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
