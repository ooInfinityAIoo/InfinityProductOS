import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// useMutation + useQueryClient still used by ProductsRegistry export below
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

// WHY THIS COMPONENT EXISTS:
// Banks launch hundreds of products over time. The old card grid became unusable at scale.
// This tree-table shows all products as compact rows with inline expand for subproduct
// variations — the same pattern used in banking product catalogs (T24, Flexcube, etc.).
// Search filters client-side instantly; subproducts load lazily on first expand.
interface ProductRowProps {
  product: any;
  onAddSubproduct: (productId: string, productName: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
  searchTerm: string;
}

const ProductRow: React.FC<ProductRowProps> = ({ product, onAddSubproduct, isExpanded, onToggle, searchTerm }) => {
  const { data: subproductsData, isLoading } = useQuery({
    queryKey: ['subproducts', product.product_id],
    queryFn: async () => {
      const res = await apiClient.get(`/masters/subproducts?product_id=${product.product_id}`);
      return res.data.subproducts ?? [];
    },
    // Only fetch when row is expanded — lazy load saves N API calls on page load
    enabled: isExpanded,
  });

  const subCount = subproductsData?.length ?? 0;

  return (
    <>
      {/* Product row */}
      <tr
        onClick={onToggle}
        className="group cursor-pointer border-b border-slate-100 hover:bg-indigo-50/40 transition-colors"
      >
        <td className="py-3 pl-4 pr-2 w-8">
          <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${isExpanded ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-slate-400 group-hover:border-indigo-400'}`}>
            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </td>
        <td className="py-3 px-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full bg-indigo-500 opacity-60 group-hover:opacity-100 transition-opacity"></div>
            <div>
              <span className="text-sm font-bold text-slate-800 font-display block leading-tight">
                {highlight(product.product_name, searchTerm)}
              </span>
              {product.description && (
                <span className="text-[10px] text-slate-400 font-normal line-clamp-1">{product.description}</span>
              )}
            </div>
          </div>
        </td>
        <td className="py-3 px-3">
          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{product.product_id}</span>
        </td>
        <td className="py-3 px-3">
          {isLoading && isExpanded ? (
            <span className="text-[10px] text-slate-400 animate-pulse">...</span>
          ) : (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${subCount > 0 ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-slate-100 text-slate-400'}`}>
              {subCount} variation{subCount !== 1 ? 's' : ''}
            </span>
          )}
        </td>
        <td className="py-3 px-3 text-[10px] text-slate-400 font-mono">
          {new Date(product.created_at).toLocaleDateString()}
        </td>
        <td className="py-3 pr-4 text-right" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onAddSubproduct(product.product_id, product.product_name)}
            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-all"
          >
            + Variation
          </button>
        </td>
      </tr>

      {/* Expanded subproduct rows — inline tree indentation */}
      {isExpanded && (
        <>
          {isLoading ? (
            <tr className="bg-slate-50/60">
              <td colSpan={6} className="py-3 pl-14 text-[11px] text-slate-400 animate-pulse">Loading variations...</td>
            </tr>
          ) : subproductsData && subproductsData.length > 0 ? (
            subproductsData.map((sub: any) => (
              <tr key={sub.subproduct_id} className="bg-indigo-50/20 border-b border-indigo-100/40 hover:bg-indigo-50/40 transition-colors">
                <td className="py-2 pl-4 pr-2">
                  {/* Tree indent connector */}
                  <div className="flex items-center justify-center h-full">
                    <div className="w-5 h-5 flex items-end justify-center">
                      <div className="w-px h-3 bg-indigo-200"></div>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-3" colSpan={2}>
                  <div className="flex items-center gap-2 pl-4">
                    <div className="w-1 h-4 rounded-full bg-indigo-300"></div>
                    <div>
                      <span className="text-xs font-semibold text-slate-700 font-display block">{sub.subproduct_name}</span>
                      {sub.description && <span className="text-[10px] text-slate-400 line-clamp-1">{sub.description}</span>}
                    </div>
                  </div>
                </td>
                <td className="py-2 px-3">
                  <span className="text-[9px] font-mono text-slate-400 bg-white border border-slate-100 px-2 py-0.5 rounded-md">{sub.subproduct_id}</span>
                </td>
                <td className="py-2 px-3 text-[10px] text-slate-400 font-mono">
                  {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : '—'}
                </td>
                <td></td>
              </tr>
            ))
          ) : (
            <tr className="bg-slate-50/40">
              <td colSpan={6} className="py-3 pl-16 text-[11px] text-slate-400 italic">No variations defined yet.</td>
            </tr>
          )}
        </>
      )}
    </>
  );
};

// Highlights matched search term in product name text
function highlight(text: string, term: string) {
  if (!term) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  );
}

// Module name → activeModule key map — lets checklist rows deep-link into the right studio
const MODULE_ROUTE_MAP: Record<string, string> = {
  'ISO Field Registry Sync':  'field-registry',
  'Document Master':          'document-master',
  'Unstructured Document':    'unstructured-document-studio',
  'Behavioral Profile':       'behavioral-profiles',
  'Event Repository':         'event-repository',
  'DataGateway Mappers':      'dge-canvas',
  'Business Rule Sets':       'business-rules',
  'Calculation Engine':       'calculation-engine',
  'API Designer':             'api-designer',
  'Screen Designer':          'screen-designer',
  'Reconciliation Engine':    'reconciliation-engine',
  'Report Designer':          'report-designer',
  'Workflow Designer':        'workflow-designer',
};

// --- MAIN PACKAGE DASHBOARD COMPONENT ---
// WHY: 360° Product Dashboard — single view for package health, go-live progress, and insights.
// The Implementation Roadmap checklist lives here pre-live and auto-hides once all modules complete.
// Products Registry lives in Master Data nav. Designer Studio stays in top nav (access-controlled).
export const PackageDashboard: React.FC<{ packageName: string }> = ({ packageName }) => {
  const { userRole, setActiveModule } = usePlatformStore();
  const [activeInsightTab, setActiveInsightTab] = useState<'360_BUSINESS' | 'TECHNICAL'>('360_BUSINESS');


  // 1. Fetch available packages to resolve package_id dynamically
  const { data: packagesData, isLoading: isLoadingPackages } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });

  const currentPackage = packagesData?.packages?.find((p: any) => p.package_name === packageName);
  const packageId = currentPackage?.package_id;

  // 2. Fetch Role-Based Insights dynamically from Backend using resolved packageId
  const { data: widgets, isLoading: isLoadingWidgets } = useQuery({
    queryKey: ['dashboard-widgets', activeInsightTab, packageId, userRole],
    queryFn: async () => {
      const res = await apiClient.get(`/insights/widgets?dashboard_category=${activeInsightTab}&application_package_id=${packageId}`);
      return res.data;
    },
    enabled: !!packageId
  });


  if (isLoadingPackages) {
    return (
      <div className="flex h-96 items-center justify-center text-slate-400 font-semibold animate-pulse">
        Initializing Package Workspace...
      </div>
    );
  }

  if (!currentPackage) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl max-w-xl mx-auto mt-12 text-center shadow-lg">
        <h3 className="font-extrabold text-[16px] font-display">Workspace Configuration Error</h3>
        <p className="text-xs mt-2">Could not resolve package details for name: <strong>{packageName}</strong>.</p>
      </div>
    );
  }

  const configurationPlan = currentPackage.configuration_plan || [];

  const completedCount = configurationPlan.filter((m: any) => m.is_configured).length;
  const isPackageLive = configurationPlan.length > 0 && completedCount === configurationPlan.length;
  // Progress bar width as percentage
  const progressPct = configurationPlan.length > 0 ? Math.round((completedCount / configurationPlan.length) * 100) : 0;

  return (
    <div className="space-y-6 animate-slide-in-right">

      {/* ── SECTION 1: CANVA STUDIO IMPLEMENTATION ROADMAP ──────────────────
          Auto-hides once all modules are completed (package is live).
          Each row has an "Open Studio" button so analysts can deep-link directly
          without hunting through the Designer Studio dropdown.                   */}
      {!isPackageLive && configurationPlan.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Header with progress bar */}
          <div className="px-6 py-4 border-b border-slate-100 bg-white/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <span className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">Canva Studio Implementation Roadmap</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400">{completedCount} / {configurationPlan.length} modules complete</span>
                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-lg">{progressPct}%</span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Module rows */}
          <div className="divide-y divide-slate-100">
            {configurationPlan.map((mod: any, idx: number) => {
              const status: 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED' =
                mod.is_configured ? 'COMPLETED' : mod.in_progress ? 'IN_PROGRESS' : 'NOT_STARTED';
              const statusStyles = {
                COMPLETED:   { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Completed' },
                IN_PROGRESS: { pill: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400 animate-pulse', label: 'In Progress' },
                NOT_STARTED: { pill: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-300', label: 'Not Started' },
              }[status];
              const studioRoute = MODULE_ROUTE_MAP[mod.module_name];
              return (
                <div key={idx} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[10px] font-mono font-bold text-slate-400 w-5 shrink-0 text-center">{idx + 1}</span>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-slate-700 font-display block truncate">{mod.module_name}</span>
                      <span className="text-[10px] text-slate-400">{mod.owner} · {mod.sla_days}d SLA</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusStyles.pill}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusStyles.dot}`}></span>
                      {statusStyles.label}
                    </span>
                    {/* Open Studio button — only shown when a route exists and module isn't done */}
                    {studioRoute && status !== 'COMPLETED' && (
                      <button
                        onClick={() => setActiveModule(studioRoute as any)}
                        className="text-[10px] font-bold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        Open Studio →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Package-live banner — shown instead of roadmap once all modules complete */}
      {isPackageLive && (
        <div className="glass-card rounded-2xl px-6 py-4 flex items-center gap-4 border-l-4 border-emerald-500">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-lg shrink-0">✓</div>
          <div>
            <p className="text-sm font-bold text-slate-800">Package Live — All Studios Configured</p>
            <p className="text-xs text-slate-500 mt-0.5">The implementation roadmap is complete. Designer Studio access is now restricted to change-management workflows.</p>
          </div>
        </div>
      )}

      {/* ── SECTION 2: ROLE-BASED INSIGHTS ───────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-[12px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Role-Based Insights
          </h2>
          <div className="flex bg-slate-100/60 p-1 rounded-xl border border-slate-150 backdrop-blur-md shadow-sm">
            <button
              onClick={() => setActiveInsightTab('360_BUSINESS')}
              className={`px-4 py-1.5 text-[10px] rounded-lg font-bold transition-all ${activeInsightTab === '360_BUSINESS' ? 'bg-white shadow-sm text-indigo-600 border border-slate-100/50' : 'text-slate-500 hover:text-slate-800'}`}
            >360° Business View</button>
            <button
              onClick={() => setActiveInsightTab('TECHNICAL')}
              className={`px-4 py-1.5 text-[10px] rounded-lg font-bold transition-all ${activeInsightTab === 'TECHNICAL' ? 'bg-white shadow-sm text-indigo-600 border border-slate-100/50' : 'text-slate-500 hover:text-slate-800'}`}
            >Technical & API View</button>
          </div>
        </div>

        {isLoadingWidgets ? (
          <div className="flex h-48 items-center justify-center text-slate-400 animate-pulse">Loading widgets...</div>
        ) : widgets && widgets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {widgets.map((widget: any) => (
              <div key={widget.insight_id} className="bg-white/50 border border-slate-150 rounded-2xl p-5 hover:border-indigo-400/50 hover:shadow-glow-indigo transition-all group cursor-pointer flex flex-col relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-slate-800 text-sm font-display leading-tight">{widget.insight_name}</h3>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">Active</span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">{widget.description || "Predictive insight widget."}</p>
                <div className="mt-auto border-t border-slate-100 pt-2.5 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>{widget.trigger_type}</span>
                  <button className="text-indigo-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Configure →</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <p className="text-sm font-semibold text-slate-500">No widgets configured yet</p>
            <p className="text-xs text-slate-400 mt-1">Use the Insights Factory to build widgets for this dashboard.</p>
          </div>
        )}
      </div>

    </div>
  );
};

// WHY THIS EXPORT EXISTS:
// ProductsRegistry is the standalone version of the tree-table, mounted via
// Master Data > Products Registry in the top nav (activeModule = 'products-registry').
// It reuses all the same state/logic from PackageDashboard but renders only the
// tree-table + modals, without the checklist/insights tabs.
export const ProductsRegistry: React.FC<{ packageName: string }> = ({ packageName }) => {
  const queryClient = useQueryClient();
  const { userRole } = usePlatformStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const [isAddProductOpen, setAddProductOpen] = useState(false);
  const [activeProductIdForSubproduct, setActiveProductIdForSubproduct] = useState<string | null>(null);
  const [activeProductNameForSubproduct, setActiveProductNameForSubproduct] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newSubproductName, setNewSubproductName] = useState('');
  const [newSubproductDesc, setNewSubproductDesc] = useState('');

  const { data: packagesData, isLoading: isLoadingPackages } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });
  const currentPackage = packagesData?.packages?.find((p: any) => p.package_name === packageName);
  const packageId = currentPackage?.package_id;

  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', packageId],
    queryFn: async () => {
      if (!packageId) return [];
      return (await apiClient.get(`/masters/products?package_id=${packageId}`)).data.products;
    },
    enabled: !!packageId
  });

  const createProductMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/masters/products', { package_id: packageId, product_name: newProductName, description: newProductDesc });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', packageId] });
      setAddProductOpen(false); setNewProductName(''); setNewProductDesc('');
    }
  });

  const createSubproductMutation = useMutation({
    mutationFn: async () => {
      if (!activeProductIdForSubproduct) return;
      await apiClient.post('/masters/subproducts', { product_id: activeProductIdForSubproduct, subproduct_name: newSubproductName, description: newSubproductDesc });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subproducts', activeProductIdForSubproduct] });
      setActiveProductIdForSubproduct(null); setNewSubproductName(''); setNewSubproductDesc('');
    }
  });

  const filteredProducts = useMemo(() =>
    (productsData ?? []).filter((p: any) =>
      p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchTerm.toLowerCase())
    ), [productsData, searchTerm]);

  if (isLoadingPackages) return <div className="flex h-64 items-center justify-center text-slate-400 animate-pulse">Loading...</div>;

  return (
    <div className="space-y-4 animate-slide-in-right">
      {/* Page title — package name shown once here, not repeated from nav */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 font-display">Products Registry</h2>
          <p className="text-xs text-slate-400 mt-0.5">{packageName} · Core products and sub-product variation catalogue</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 bg-white/60">
          <div className="flex items-center gap-3 flex-1 max-w-sm">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20 outline-none transition-all"
              />
            </div>
            <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
              {filteredProducts.length} of {(productsData ?? []).length} products
            </span>
          </div>
          {userRole === 'ADMIN' && (
            <button onClick={() => setAddProductOpen(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/10 active:scale-[0.98] whitespace-nowrap">
              + Add Core Product
            </button>
          )}
        </div>

        {isLoadingProducts ? (
          <div className="flex h-64 items-center justify-center text-slate-400 animate-pulse">Loading Products Registry...</div>
        ) : filteredProducts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="py-2.5 pl-4 pr-2 w-8"></th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product Name</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-36">Product ID</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28">Variations</th>
                  <th className="py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28">Created</th>
                  <th className="py-2.5 pr-4 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product: any) => (
                  <ProductRow
                    key={product.product_id}
                    product={product}
                    isExpanded={expandedIds.has(product.product_id)}
                    onToggle={() => toggleExpand(product.product_id)}
                    onAddSubproduct={(pid, pname) => {
                      setActiveProductIdForSubproduct(pid);
                      setActiveProductNameForSubproduct(pname);
                    }}
                    searchTerm={searchTerm}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 m-6">
            {(productsData ?? []).length === 0 ? (
              <>
                <p className="text-sm font-semibold text-slate-550">No Core Products Defined Yet</p>
                {userRole === 'ADMIN' && (
                  <button onClick={() => setAddProductOpen(true)} className="mt-3 bg-white border border-indigo-200 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors shadow-sm">
                    Create Your First Product
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-medium">No products match "{searchTerm}"</p>
                <button onClick={() => setSearchTerm('')} className="text-xs text-indigo-500 hover:underline mt-1">Clear search</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ADD PRODUCT MODAL */}
      {isAddProductOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100]">
          <div className="bg-white/95 rounded-3xl border border-white/20 shadow-2xl w-[520px] overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent font-display">Create Core Product</h3>
              <button onClick={() => setAddProductOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-8 space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Product Name</label>
                <input type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)}
                  placeholder="e.g., FEDWIRE, SWIFT-CORE, CHIPS"
                  className="w-full text-sm font-bold text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 outline-none transition-all shadow-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Description</label>
                <textarea rows={3} value={newProductDesc} onChange={e => setNewProductDesc(e.target.value)}
                  placeholder="Describe the payment rail or business functionality."
                  className="w-full text-sm text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 outline-none transition-all shadow-sm resize-none" />
              </div>
            </div>
            <div className="px-8 py-5 bg-slate-50/80 border-t border-slate-150 flex justify-end gap-3">
              <button onClick={() => setAddProductOpen(false)} className="px-5 py-2.5 text-xs font-bold text-slate-500 bg-white border border-slate-250 rounded-xl hover:bg-slate-50">Cancel</button>
              <button disabled={createProductMutation.isPending || !newProductName} onClick={() => createProductMutation.mutate()}
                className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md disabled:opacity-50">
                {createProductMutation.isPending ? 'Saving...' : 'Add Core Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD SUBPRODUCT MODAL */}
      {activeProductIdForSubproduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100]">
          <div className="bg-white/95 rounded-3xl border border-white/20 shadow-2xl w-[520px] overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent font-display">Add Sub-Product Variation</h3>
                <p className="text-[11px] text-slate-400 mt-1">Under <strong>{activeProductNameForSubproduct}</strong></p>
              </div>
              <button onClick={() => setActiveProductIdForSubproduct(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-8 space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sub-Product Name</label>
                <input type="text" value={newSubproductName} onChange={e => setNewSubproductName(e.target.value)}
                  placeholder="e.g., FEDWIRE-B2B, FEDWIRE-RETAIL-ACH"
                  className="w-full text-sm font-bold text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 outline-none transition-all shadow-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Description</label>
                <textarea rows={3} value={newSubproductDesc} onChange={e => setNewSubproductDesc(e.target.value)}
                  placeholder="Describe the unique rules, SLA thresholds, or transformations."
                  className="w-full text-sm text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 outline-none transition-all shadow-sm resize-none" />
              </div>
            </div>
            <div className="px-8 py-5 bg-slate-50/80 border-t border-slate-150 flex justify-end gap-3">
              <button onClick={() => setActiveProductIdForSubproduct(null)} className="px-5 py-2.5 text-xs font-bold text-slate-500 bg-white border border-slate-250 rounded-xl hover:bg-slate-50">Cancel</button>
              <button disabled={createSubproductMutation.isPending || !newSubproductName} onClick={() => createSubproductMutation.mutate()}
                className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md disabled:opacity-50">
                {createSubproductMutation.isPending ? 'Saving...' : 'Add Variation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};