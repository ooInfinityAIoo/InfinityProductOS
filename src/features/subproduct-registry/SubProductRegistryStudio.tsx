// WHY THIS COMPONENT EXISTS:
// Standalone Sub-Product Master registry. A Sub-Product is a variation of a Product —
// e.g., "SWIFT MT103 - Corporate B2B", "SEPA - Germany Retail", "ACH - Same-Day Payroll".
// The first required step is selecting a parent Product ID from the Product Registry.
// Only then can sub-product fields be defined. This enforces the parent-child dependency
// at the UI level — you cannot create a sub-product in a vacuum.
//
// Auto-generates sequential ID: SP-YYYYMM-NNN
//
// WHAT BREAKS IF REMOVED:
// Studios cannot distinguish product variations. A Business Rule for "SWIFT B2B" would
// apply equally to "SWIFT B2C" with no configuration boundary between them.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

const VARIATION_TYPES = [
  { value: 'BY_GEOGRAPHY',  label: 'By Geography',  desc: 'Country or region variant (e.g., SEPA Germany vs France)' },
  { value: 'BY_SEGMENT',    label: 'By Segment',    desc: 'Customer segment (e.g., Corporate B2B vs Retail B2C)' },
  { value: 'BY_CHANNEL',    label: 'By Channel',    desc: 'Delivery channel (e.g., Branch vs Mobile vs API)' },
  { value: 'BY_CURRENCY',   label: 'By Currency',   desc: 'Currency-specific variant (e.g., USD vs EUR wire)' },
  { value: 'BY_LIMIT',      label: 'By Limit Band', desc: 'Transaction limit tier (e.g., <$10k vs >$10k)' },
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT:      { label: 'Draft',      cls: 'bg-slate-100 text-slate-600' },
  ACTIVE:     { label: 'Active',     cls: 'bg-emerald-100 text-emerald-700' },
  DEPRECATED: { label: 'Deprecated', cls: 'bg-red-100 text-red-600' },
};

const VAR_COLORS: Record<string, string> = {
  BY_GEOGRAPHY: 'bg-blue-100 text-blue-700',
  BY_SEGMENT:   'bg-purple-100 text-purple-700',
  BY_CHANNEL:   'bg-orange-100 text-orange-700',
  BY_CURRENCY:  'bg-cyan-100 text-cyan-700',
  BY_LIMIT:     'bg-rose-100 text-rose-700',
};

interface SubProduct {
  subproduct_id: string;
  subproduct_code?: string;
  product_id: string;
  subproduct_name: string;
  alias?: string;
  variation_type?: string;
  description?: string;
  status: string;
  created_at: string;
  created_by?: string;
}

interface Product {
  product_id: string;
  product_name: string;
  alias?: string;
  product_type?: string;
  status: string;
}

export const SubProductRegistryStudio: React.FC = () => {
  const { activeProductContext } = usePlatformStore();
  const qc = useQueryClient();

  const [selectedProductId, setSelectedProductId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedSP, setSelectedSP] = useState<SubProduct | null>(null);
  const [form, setForm] = useState({
    subproduct_name: '', alias: '', subproduct_code: '', variation_type: '', description: '',
  });
  const [search, setSearch] = useState('');
  const [filterVariation, setFilterVariation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Load packages to resolve package_id from activeProductContext
  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data,
  });
  const packages = packagesData?.packages ?? [];
  const activePackage = packages.find((p: any) => p.package_name === activeProductContext);

  // Load all products for the active package — user must pick one first
  const { data: productsData } = useQuery({
    queryKey: ['products', activePackage?.package_id],
    queryFn: async () => (await apiClient.get(`/masters/products?package_id=${activePackage.package_id}`)).data,
    enabled: !!activePackage?.package_id,
  });
  const products: Product[] = productsData?.products ?? [];
  const activeProduct = products.find(p => p.product_id === selectedProductId);

  // Load sub-products for the selected product
  const { data: spData, isLoading } = useQuery({
    queryKey: ['subproducts', selectedProductId, filterVariation, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams({ product_id: selectedProductId });
      if (filterVariation) params.set('variation_type', filterVariation);
      if (filterStatus)    params.set('status', filterStatus);
      return (await apiClient.get(`/masters/subproducts?${params}`)).data;
    },
    enabled: !!selectedProductId,
  });
  const subproducts: SubProduct[] = (spData?.subproducts ?? []).filter((sp: SubProduct) =>
    !search ||
    sp.subproduct_name.toLowerCase().includes(search.toLowerCase()) ||
    (sp.alias ?? '').toLowerCase().includes(search.toLowerCase()) ||
    sp.subproduct_id.toLowerCase().includes(search.toLowerCase())
  );

  const createMut = useMutation({
    mutationFn: (payload: any) => apiClient.post('/masters/subproducts', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subproducts', selectedProductId] });
      setShowForm(false);
      resetForm();
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient.patch(`/masters/subproducts/${id}/status?new_status=${status}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subproducts', selectedProductId] }),
  });

  const resetForm = () => setForm({ subproduct_name: '', alias: '', subproduct_code: '', variation_type: '', description: '' });

  const handleCreate = () => {
    if (!form.subproduct_name || !selectedProductId) return;
    createMut.mutate({ ...form, product_id: selectedProductId });
  };

  if (!activeProductContext) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-slate-400">
        <div className="text-4xl mb-4">📦</div>
        <div className="text-[14px] font-bold">No package selected</div>
        <div className="text-[12px] mt-1">Select a package from the header first.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight">Sub-Product Registry</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Define product variations for <span className="font-bold text-indigo-600">{activeProductContext}</span>.
            Select a Product first, then add sub-product variations.
          </p>
        </div>
        {selectedProductId && (
          <button
            onClick={() => { setShowForm(true); setSelectedSP(null); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold px-5 py-2.5 rounded-xl shadow-md active:scale-[0.98] transition-all"
          >
            + New Sub-Product
          </button>
        )}
      </div>

      {/* Step 1 — Product selector (always visible, required first step) */}
      <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-extrabold flex items-center justify-center">1</div>
          <span className="text-[13px] font-bold text-indigo-900">Select Parent Product</span>
        </div>
        {products.length === 0 ? (
          <p className="text-[12px] text-slate-500">No products found for this package. Create products in Product Registry first.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {products.map(p => (
              <button
                key={p.product_id}
                onClick={() => { setSelectedProductId(p.product_id); setSelectedSP(null); setSearch(''); }}
                className={`text-left px-4 py-3 rounded-xl border transition-all ${
                  selectedProductId === p.product_id
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                }`}
              >
                <div className={`text-[12px] font-bold truncate ${selectedProductId === p.product_id ? 'text-white' : 'text-slate-800'}`}>
                  {p.alias ?? p.product_name}
                </div>
                <div className={`font-mono text-[10px] mt-0.5 ${selectedProductId === p.product_id ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {p.product_id}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 2 — Sub-product list (only shown after product is selected) */}
      {selectedProductId && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-extrabold flex items-center justify-center">2</div>
            <span className="text-[13px] font-bold text-indigo-900">
              Sub-Products of <span className="text-indigo-600">{activeProduct?.alias ?? activeProduct?.product_name}</span>
            </span>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, alias, or ID…"
              className="border border-slate-200 rounded-xl px-4 py-2 text-[13px] w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            />
            <select value={filterVariation} onChange={e => setFilterVariation(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="">All Variation Types</option>
              {VARIATION_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="DEPRECATED">Deprecated</option>
            </select>
            <span className="text-[12px] text-slate-400 ml-auto">{subproducts.length} sub-product{subproducts.length !== 1 ? 's' : ''}</span>
          </div>

          {isLoading ? (
            <div className="text-center text-slate-400 py-16 text-[13px]">Loading…</div>
          ) : subproducts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
              <div className="text-3xl mb-3">🔀</div>
              <div className="text-[13px] font-semibold">No sub-products yet</div>
              <div className="text-[12px] mt-1">Click "+ New Sub-Product" to define the first variation.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {subproducts.map(sp => (
                <div
                  key={sp.subproduct_id}
                  onClick={() => setSelectedSP(selectedSP?.subproduct_id === sp.subproduct_id ? null : sp)}
                  className={`bg-white border rounded-2xl p-5 cursor-pointer transition-all shadow-sm hover:shadow-md ${
                    selectedSP?.subproduct_id === sp.subproduct_id ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-extrabold text-slate-900">{sp.subproduct_name}</span>
                        {sp.alias && <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">"{sp.alias}"</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{sp.subproduct_id}</span>
                        {sp.subproduct_code && <span className="font-mono text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md">{sp.subproduct_code}</span>}
                        {sp.variation_type && (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${VAR_COLORS[sp.variation_type] ?? 'bg-slate-100 text-slate-600'}`}>
                            {sp.variation_type.replace('BY_', '').replace('_', ' ')}
                          </span>
                        )}
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${STATUS_META[sp.status]?.cls ?? 'bg-slate-100 text-slate-500'}`}>
                          {STATUS_META[sp.status]?.label ?? sp.status}
                        </span>
                      </div>
                      {sp.description && <p className="text-[12px] text-slate-500 mt-2 line-clamp-2">{sp.description}</p>}
                    </div>
                    <div className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">{sp.created_at.slice(0, 10)}</div>
                  </div>
                  {selectedSP?.subproduct_id === sp.subproduct_id && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-slate-400 mr-1">Status:</span>
                      {['DRAFT', 'ACTIVE', 'DEPRECATED'].map(s => (
                        <button key={s}
                          onClick={e => { e.stopPropagation(); statusMut.mutate({ id: sp.subproduct_id, status: s }); }}
                          className={`text-[11px] font-bold px-3 py-1 rounded-lg border transition-all ${
                            sp.status === s
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >{s}</button>
                      ))}
                      <span className="text-[10px] text-slate-400 ml-auto">by {sp.created_by ?? 'system'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-extrabold text-slate-900">New Sub-Product</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>

            {/* Parent product — read-only, already selected */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Parent Product</p>
              <p className="text-[13px] font-bold text-indigo-800 mt-0.5">
                {activeProduct?.alias ?? activeProduct?.product_name}
                <span className="font-mono text-[11px] text-indigo-500 ml-2">{activeProduct?.product_id}</span>
              </p>
            </div>

            {/* Variation Type — pick first to guide naming */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Variation Type *</label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {VARIATION_TYPES.map(v => (
                  <button key={v.value}
                    onClick={() => setForm(f => ({ ...f, variation_type: v.value }))}
                    className={`text-left px-4 py-2.5 rounded-xl border transition-all ${
                      form.variation_type === v.value
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className={`text-[12px] font-bold ${form.variation_type === v.value ? 'text-white' : 'text-slate-800'}`}>{v.label}</div>
                    <div className={`text-[10px] mt-0.5 ${form.variation_type === v.value ? 'text-indigo-200' : 'text-slate-400'}`}>{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Name + Alias */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Sub-Product Name *</label>
              <input value={form.subproduct_name} onChange={e => setForm(f => ({ ...f, subproduct_name: e.target.value }))}
                placeholder={`e.g., ${activeProduct?.alias ?? 'Product'} - Corporate B2B`}
                className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Alias</label>
                <input value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))}
                  placeholder="e.g., SWIFT B2B"
                  className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Sub-Product Code</label>
                <input value={form.subproduct_code} onChange={e => setForm(f => ({ ...f, subproduct_code: e.target.value }))}
                  placeholder="e.g., SWIFT-WIRE-B2B"
                  className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe what makes this variation distinct…"
                rows={2}
                className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3">
              <p className="text-[11px] text-indigo-700 font-semibold">
                ✦ Sub-Product ID will be auto-generated on save — format: <span className="font-mono">SP-YYYYMM-NNN</span>
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="flex-1 border border-slate-200 text-slate-600 text-[13px] font-bold py-2.5 rounded-xl hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={!form.subproduct_name || !selectedProductId || createMut.isPending}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[13px] font-bold py-2.5 rounded-xl transition-all">
                {createMut.isPending ? 'Creating…' : 'Create Sub-Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
