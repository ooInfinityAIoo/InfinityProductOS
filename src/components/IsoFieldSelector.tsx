import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { Search, ChevronDown, Check, Shield, X } from 'lucide-react';

interface IsoFieldSelectorProps {
  value: string | string[];
  onChange: (value: any) => void;
  multiSelect?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  domainCategory?: string;
}

const DATA_TYPE_FILTERS = ['All', 'Amount', 'Date', 'Text', 'Alphanumeric', 'Decimal'];

const DATA_TYPE_COLORS: Record<string, string> = {
  Amount: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Date: 'bg-blue-50 text-blue-700 border-blue-200',
  Text: 'bg-slate-50 text-slate-600 border-slate-200',
  Alphanumeric: 'bg-purple-50 text-purple-700 border-purple-200',
  Decimal: 'bg-orange-50 text-orange-700 border-orange-200',
};

// Field-source badges (FIELD_REGISTRY_REQUIREMENTS.md §3/§6). ISO_20022 is the
// default and intentionally shows NO tag so the standard fields stay visually clean;
// every non-ISO source gets a distinct chip.
const FIELD_SOURCE_TAG: Record<string, { label: string; cls: string }> = {
  BANK_CUSTOM: { label: 'Custom', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  CALCULATED: { label: 'Calc', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  DERIVED: { label: 'Derived', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  CONFIGURATION: { label: 'Config', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  REGULATORY: { label: 'Reg', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export const IsoFieldSelector: React.FC<IsoFieldSelectorProps> = ({
  value,
  onChange,
  multiSelect = false,
  placeholder = 'Select ISO Field...',
  className = '',
  disabled = false,
  domainCategory,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTypeFilter, setActiveTypeFilter] = useState('All');
  const [piiOnly, setPiiOnly] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Build query params
  const queryParams = new URLSearchParams();
  if (debouncedSearch) queryParams.set('q', debouncedSearch);
  if (activeTypeFilter !== 'All') queryParams.set('data_type', activeTypeFilter);
  if (piiOnly) queryParams.set('is_pii', 'true');
  if (domainCategory) queryParams.set('domain_category', domainCategory);
  // Selectability gate (FIELD_REGISTRY_REQUIREMENTS.md §6) — never offer orphan
  // fields (no Master). ISO fields are grandfathered server-side until categorised.
  queryParams.set('selectable_only', 'true');
  queryParams.set('limit', '50');

  const { data, isLoading } = useQuery({
    queryKey: ['iso-fields-selector', debouncedSearch, activeTypeFilter, piiOnly, domainCategory],
    queryFn: async () => {
      const res = await apiClient.get(`/fields/registry/search?${queryParams.toString()}`);
      return res.data;
    },
    staleTime: 30000,
    enabled: isOpen,
  });

  const fields = data?.fields || [];
  const totalCount = data?.total_count ?? 0;

  // Click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  const handleOpen = () => {
    if (!disabled) setIsOpen(true);
  };

  const toggleSelection = (field: any) => {
    const key = field.iso_business_name;
    if (multiSelect) {
      const currentVal = Array.isArray(value) ? value : (value ? [value] : []);
      if (currentVal.includes(key)) {
        onChange(currentVal.filter((v) => v !== key));
      } else {
        onChange([...currentVal, key]);
      }
    } else {
      onChange(key);
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const isSelected = (isoName: string) => {
    if (multiSelect && Array.isArray(value)) return value.includes(isoName);
    return value === isoName;
  };

  const getDisplayText = () => {
    if (multiSelect && Array.isArray(value)) {
      if (value.length === 0) return placeholder;
      if (value.length === 1) return value[0];
      return `${value.length} fields selected`;
    }
    return value || placeholder;
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIndex((i) => Math.min(i + 1, fields.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && focusedIndex >= 0) { e.preventDefault(); toggleSelection(fields[focusedIndex]); }
    else if (e.key === 'Escape') { setIsOpen(false); }
  };

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const item = listRef.current.querySelector(`[data-idx="${focusedIndex}"]`) as HTMLElement;
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  const getFieldDisplayName = (f: any) =>
    f.display_preference === 'CLIENT' && f.client_business_name ? f.client_business_name : f.iso_business_name;
  const getFieldSubName = (f: any) =>
    f.display_preference === 'CLIENT' && f.client_business_name ? f.iso_business_name : f.client_business_name;

  return (
    <div className={`relative ${className}`} ref={wrapperRef} onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <div
        className={`flex items-center justify-between w-full min-h-[38px] px-3 py-1.5 bg-white/80 backdrop-blur-md border ${
          isOpen ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
        } rounded-xl shadow-sm text-sm cursor-pointer transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'hover:bg-slate-50'
        }`}
        onClick={handleOpen}
      >
        <span className={`truncate font-mono text-[12px] ${value ? 'text-indigo-700 font-bold' : 'text-slate-400 font-medium'}`}>
          {getDisplayText()}
        </span>
        <ChevronDown size={14} className={`text-slate-400 flex-shrink-0 ml-2 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-[200] w-[520px] mt-2 top-full left-0 bg-white border border-slate-200/80 rounded-2xl shadow-2xl animate-slide-up overflow-hidden flex flex-col max-h-[480px]"
          style={{ boxShadow: '0 20px 60px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)' }}>

          {/* Header */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-100 bg-slate-50/80 space-y-2">
            {/* Search bar */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-50 transition-all">
              <Search size={14} className="text-slate-400 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400 text-slate-800 font-medium"
                placeholder="Search by name, ISO tag, or description..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setFocusedIndex(-1); }}
                onClick={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <button onClick={(e) => { e.stopPropagation(); setSearchTerm(''); }} className="text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {DATA_TYPE_FILTERS.map((t) => (
                <button
                  key={t}
                  onClick={(e) => { e.stopPropagation(); setActiveTypeFilter(t); setFocusedIndex(-1); }}
                  className={`flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                    activeTypeFilter === t
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {t}
                </button>
              ))}
              <div className="w-px h-4 bg-slate-200 flex-shrink-0" />
              <button
                onClick={(e) => { e.stopPropagation(); setPiiOnly(!piiOnly); setFocusedIndex(-1); }}
                className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${
                  piiOnly ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-500 border-slate-200 hover:border-rose-300 hover:text-rose-600'
                }`}
              >
                <Shield size={9} />PII Only
              </button>
              <div className="ml-auto flex-shrink-0 text-[10px] text-slate-400 font-medium whitespace-nowrap">
                {isLoading ? 'Loading...' : `${totalCount.toLocaleString()} fields`}
              </div>
            </div>
          </div>

          {/* Results list */}
          <div ref={listRef} className="flex-1 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
            {isLoading ? (
              <div className="p-6 flex justify-center">
                <span className="w-5 h-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
              </div>
            ) : fields.length === 0 ? (
              <div className="p-6 text-center">
                <Search size={24} className="text-slate-300 mx-auto mb-2" />
                <div className="text-xs text-slate-400 font-medium">No fields matched.</div>
                <div className="text-[10px] text-slate-300 mt-1">Try searching by ISO tag (e.g. "Amt") or description</div>
              </div>
            ) : (
              fields.map((f: any, idx: number) => (
                <div
                  key={f.field_id || f.iso_business_name}
                  data-idx={idx}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected(f.iso_business_name) ? 'bg-indigo-50 border border-indigo-100' :
                    focusedIndex === idx ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                  onClick={(e) => { e.stopPropagation(); toggleSelection(f); }}
                  onMouseEnter={() => setFocusedIndex(idx)}
                >
                  {/* Checkbox */}
                  <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected(f.iso_business_name) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'
                  }`}>
                    {isSelected(f.iso_business_name) && <Check size={10} className="text-white" />}
                  </div>

                  {/* Field info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-slate-800 truncate">{getFieldDisplayName(f)}</span>
                      {f.data_type && (
                        <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${DATA_TYPE_COLORS[f.data_type] || DATA_TYPE_COLORS.Text}`}>
                          {f.data_type}
                        </span>
                      )}
                      {f.is_pii && (
                        <span className="flex-shrink-0 flex items-center gap-0.5 text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded">
                          <Shield size={8} />PII
                        </span>
                      )}
                      {/* Field-source tag — distinguishes non-ISO fields at a glance
                          (FIELD_REGISTRY_REQUIREMENTS.md §6). ISO_20022 shows no tag. */}
                      {FIELD_SOURCE_TAG[f.field_source as string] && (
                        <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${FIELD_SOURCE_TAG[f.field_source as string].cls}`}>
                          {FIELD_SOURCE_TAG[f.field_source as string].label}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">{getFieldSubName(f)}</div>
                    {f.description && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5 italic">{f.description}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="text-[10px] text-slate-400">↑↓ navigate · Enter select · Esc close</div>
            {multiSelect && Array.isArray(value) && value.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="text-[10px] font-bold text-rose-500 hover:text-rose-700"
              >
                Clear {value.length} selected
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
