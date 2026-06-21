// WHY THIS COMPONENT EXISTS:
// Standalone Product Master registry. A Product is a payment product within a Package —
// e.g., "SWIFT MT103 Cross-Border Wire", "SEPA Credit Transfer", "FEDWIRE", "ACH".
// Each Product gets an auto-generated sequential ID (PRD-YYYYMM-NNN) the moment it is
// created, an alias for display in studio dropdowns, a type for classification, and a
// lifecycle status (DRAFT → ACTIVE → DEPRECATED).
//
// WHAT BREAKS IF REMOVED:
// Designer Studio modules cannot scope rules/workflows/calculations to a specific product.
// Sub-Product Registry has nothing to reference as its parent.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

const PRODUCT_TYPES = [
  { value: 'PAYMENTS',       label: 'Payments',        color: 'indigo' },
  { value: 'LENDING',        label: 'Lending',         color: 'emerald' },
  { value: 'TREASURY',       label: 'Treasury',        color: 'violet' },
  { value: 'TRADE_FINANCE',  label: 'Trade Finance',   color: 'amber' },
  { value: 'CARDS',          label: 'Cards',           color: 'rose' },
  { value: 'FX',             label: 'FX',              color: 'cyan' },
  { value: 'RECONCILIATION', label: 'Reconciliation',  color: 'slate' },
];

const TYPE_COLORS: Record<string, string> = {
  PAYMENTS:       'bg-indigo-100 text-indigo-700',
  LENDING:        'bg-emerald-100 text-emerald-700',
  TREASURY:       'bg-violet-100 text-violet-700',
  TRADE_FINANCE:  'bg-amber-100 text-amber-700',
  CARDS:          'bg-rose-100 text-rose-700',
  FX:             'bg-cyan-100 text-cyan-700',
  RECONCILIATION: 'bg-slate-100 text-slate-600',
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT:      { label: 'Draft',      cls: 'bg-slate-100 text-slate-600' },
  ACTIVE:     { label: 'Active',     cls: 'bg-emerald-100 text-emerald-700' },
  DEPRECATED: { label: 'Deprecated', cls: 'bg-red-100 text-red-600' },
};

interface Product {
  product_id: string;
  product_code?: string;
  package_id: string;
  product_name: string;
  alias?: string;
  product_type?: string;
  description?: string;
  status: string;
  owner_user_id?: string;
  effective_date?: string;
  created_at: string;
  created_by?: string;
}

export const ProductRegistryStudio: React.FC = () => {
  const { activeProductContext } = usePlatformStore();
  const qc = useQueryClient();

  // --- form state ---
  const [showForm, setShowForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    product_name: '', alias: '', product_code: '', product_type: '',
    description: '', owner_user_id: '', effective_date: '',
  });
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // --- data ---
  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data,
  });
  const packages = packagesData?.packages ?? [];
  const activePackage = packages.find((p: any) => p.package_name === activeProductContext);

  const { data, isLoading } = useQuery({
    queryKey: ['products', activePackage?.package_id, filterType, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activePackage?.package_id) params.set('package_id', activePackage.package_id);
      if (filterType) params.set('product_type', filterType);
      if (filterStatus) params.set('status', filterStatus);
      return (await apiClient.get(`/masters/products?${params}`)).data;
    },
    enabled: !!activePackage?.package_id,
  });
  const products: Product[] = (data?.products ?? []).filter((p: Product) =>
    !search || p.product_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.alias ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.product_id ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const createMut = useMutation({
    mutationFn: (payload: any) => apiClient.post('/masters/products', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setShowForm(false); resetForm(); },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient.patch(`/masters/products/${id}/status?new_status=${status}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const resetForm = () => setForm({ product_name: '', alias: '', product_code: '', product_type: '', description: '', owner_user_id: '', effective_date: '' });

  const handleCreate = () => {
    if (!form.product_name || !activePackage?.package_id) return;
    createMut.mutate({ ...form, package_id: activePackage.package_id });
  };

  if (!activeProductContext) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] text-slate-400">
        <div className="text-4xl mb-4">📦</div>
        <div className="text-[14px] font-bold">No package selected</div>
        <div className="text-[12px] mt-1">Select a package from the header to manage its products.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight">Product Registry</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Define payment products for <span className="font-bold text-indigo-600">{activeProductContext}</span>.
            Each product auto-receives a sequential ID (PRD-YYYYMM-NNN) on creation.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setSelectedProduct(null); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold px-5 py-2.5 rounded-xl shadow-md active:scale-[0.98] transition-all"
        >
          + New Product
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, alias, or ID..."
          className="border border-slate-200 rounded-xl px-4 py-2 text-[13px] w-72 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Types</option>
          {PRODUCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="DEPRECATED">Deprecated</option>
        </select>
        <span className="text-[12px] text-slate-400 ml-auto">{products.length} product{products.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Product list */}
      {isLoading ? (
        <div className="text-center text-slate-400 py-16 text-[13px]">Loading products…</div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-3xl mb-3">🏗</div>
          <div className="text-[13px] font-semibold">No products yet</div>
          <div className="text-[12px] mt-1">Create your first product to start configuring it in Designer Studio.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {products.map((p) => (
            <div
              key={p.product_id}
              onClick={() => setSelectedProduct(selectedProduct?.product_id === p.product_id ? null : p)}
              className={`bg-white border rounded-2xl p-5 cursor-pointer transition-all shadow-sm hover:shadow-md ${
                selectedProduct?.product_id === p.product_id ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200/70'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-extrabold text-slate-900">{p.product_name}</span>
                    {p.alias && <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">"{p.alias}"</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{p.product_id}</span>
                    {p.product_code && <span className="font-mono text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md">{p.product_code}</span>}
                    {p.product_type && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${TYPE_COLORS[p.product_type] ?? 'bg-slate-100 text-slate-600'}`}>{p.product_type.replace('_', ' ')}</span>}
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${STATUS_META[p.status]?.cls ?? 'bg-slate-100 text-slate-500'}`}>{STATUS_META[p.status]?.label ?? p.status}</span>
                  </div>
                  {p.description && <p className="text-[12px] text-slate-500 mt-2 line-clamp-2">{p.description}</p>}
                </div>
                <div className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                  {p.effective_date ? `Live: ${p.effective_date}` : 'No launch date'}
                </div>
              </div>

              {/* Expanded actions */}
              {selectedProduct?.product_id === p.product_id && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-slate-400 mr-1">Status:</span>
                  {['DRAFT', 'ACTIVE', 'DEPRECATED'].map(s => (
                    <button key={s}
                      onClick={e => { e.stopPropagation(); statusMut.mutate({ id: p.product_id, status: s }); }}
                      className={`text-[11px] font-bold px-3 py-1 rounded-lg border transition-all ${
                        p.status === s
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >{s}</button>
                  ))}
                  <span className="text-[10px] text-slate-400 ml-auto">Created by {p.created_by ?? 'system'} · {p.created_at.slice(0, 10)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-extrabold text-slate-900">New Product</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>

            {/* Product Name */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Product Name *</label>
              <input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                placeholder="e.g., SWIFT MT103 Cross-Border Wire"
                className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>

            {/* Alias */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Alias (Short Display Name)</label>
              <input value={form.alias} onChange={e => setForm(f => ({ ...f, alias: e.target.value }))}
                placeholder="e.g., SWIFT Wire"
                className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <p className="text-[10px] text-slate-400 mt-1">Used in studio dropdowns and context selectors.</p>
            </div>

            {/* Product Code + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Product Code</label>
                <input value={form.product_code} onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))}
                  placeholder="e.g., SWIFT-WIRE"
                  className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Product Type</label>
                <select value={form.product_type} onChange={e => setForm(f => ({ ...f, product_type: e.target.value }))}
                  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="">Select type…</option>
                  {PRODUCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe the purpose and scope of this product…"
                rows={3}
                className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
            </div>

            {/* Effective Date + Owner */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Effective / Launch Date</label>
                <input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
                  className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Product Owner / SME</label>
                <input value={form.owner_user_id} onChange={e => setForm(f => ({ ...f, owner_user_id: e.target.value }))}
                  placeholder="e.g., john.doe"
                  className="w-full mt-1 border border-slate-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>

            {/* ID preview */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3">
              <p className="text-[11px] text-indigo-700 font-semibold">
                ✦ Product ID will be auto-generated on save — format: <span className="font-mono">PRD-YYYYMM-NNN</span>
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="flex-1 border border-slate-200 text-slate-600 text-[13px] font-bold py-2.5 rounded-xl hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={!form.product_name || createMut.isPending}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[13px] font-bold py-2.5 rounded-xl transition-all">
                {createMut.isPending ? 'Creating…' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
