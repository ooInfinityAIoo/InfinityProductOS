// WHY THIS COMPONENT EXISTS:
// Advanced record filter bar shown at the top of every Designer Studio module.
// Lets users NARROW the list of existing records by Product and Sub-Product.
// This is a FILTER, not a lock — studios are always accessible.
//
// Architectural contract (separation of concerns):
//   - This banner = viewport filter for EXISTING records (read path)
//   - ProductSubProductPicker (in create/edit forms) = scoping for NEW records (write path)
//
// When the user selects a product here, the studio lists update to show only records
// scoped to that product (or "All Products" records, which always show regardless).
// When the user clears the filter, all records for the package are shown.
//
// Pre-populations the form picker (ProductSubProductPicker) for convenience — if the
// user has filtered to "SWIFT MT103", the create form defaults to the same product
// so they don't have to re-select it.

import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export const CockpitLockBanner: React.FC = () => {
  const {
    activeProductContext,
    activeCoreProductId, setCoreProductId,
    activeCoreSubProductId, setCoreSubProductId,
  } = usePlatformStore();

  // Step 1 — resolve package_id from package name stored in Zustand
  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data,
    enabled: !!activeProductContext,
  });
  const currentPackage = packagesData?.packages?.find((p: any) => p.package_name === activeProductContext);
  const packageId = currentPackage?.package_id;

  // Step 2 — products for this package
  const { data: productsData } = useQuery({
    queryKey: ['products', packageId],
    queryFn: async () => (await apiClient.get(`/masters/products?package_id=${packageId}`)).data,
    enabled: !!packageId,
  });
  const products = productsData?.products ?? [];

  // Step 3 — sub-products for the selected product (only fetched once product is chosen)
  const { data: subProductsData } = useQuery({
    queryKey: ['subproducts', activeCoreProductId],
    queryFn: async () => (await apiClient.get(`/masters/subproducts?product_id=${activeCoreProductId}`)).data,
    enabled: !!activeCoreProductId,
  });
  const subProducts = subProductsData?.subproducts ?? [];

  return (
    <div className="rounded-2xl p-3.5 flex items-center justify-between shadow-sm mb-6 border border-slate-200/60 bg-slate-50/40">
      {/* Left — filter icon + label */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-500 border border-indigo-100">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
        </div>
        <div>
          <h2 className="text-[12px] font-extrabold text-slate-700 tracking-tight">Advanced Record Filters</h2>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
            {activeCoreProductId
              ? `Showing records for: ${activeProductContext} › ${activeCoreProductId}${activeCoreSubProductId ? ' › ' + activeCoreSubProductId : ' (all sub-products)'}`
              : `Showing all records in package: ${activeProductContext}`
            }
          </p>
        </div>
      </div>

      {/* Right — level selectors */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Level 1 — Package (read-only, set by package context) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Package</span>
          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg whitespace-nowrap">
            {activeProductContext || 'None'}
          </span>
        </div>

        <span className="text-slate-300 text-[14px]">›</span>

        {/* Level 2 — Product filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Product</span>
          <select
            value={activeCoreProductId || ''}
            onChange={(e) => setCoreProductId(e.target.value || null)}
            className="text-[12px] font-bold text-slate-700 border border-slate-200 bg-white rounded-xl px-3 py-1.5 outline-none shadow-sm min-w-[160px] focus:border-indigo-300"
          >
            <option value="">All Products</option>
            {products.map((p: any) => (
              <option key={p.product_id} value={p.product_id}>
                {p.alias ?? p.product_name} ({p.product_id})
              </option>
            ))}
          </select>
        </div>

        {/* Level 3 — Sub-Product filter (only shown once product is selected) */}
        {activeCoreProductId && (
          <>
            <span className="text-slate-300 text-[14px]">›</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Sub-Product</span>
              <select
                value={activeCoreSubProductId || ''}
                onChange={(e) => setCoreSubProductId(e.target.value || null)}
                className="text-[12px] font-bold text-slate-700 border border-slate-200 bg-white rounded-xl px-3 py-1.5 outline-none focus:border-indigo-300 shadow-sm min-w-[160px]"
              >
                <option value="">All Sub-Products</option>
                {subProducts.length === 0
                  ? <option disabled value="">No sub-products defined</option>
                  : subProducts.map((sp: any) => (
                      <option key={sp.subproduct_id} value={sp.subproduct_id}>
                        {sp.alias ?? sp.subproduct_name} ({sp.subproduct_id})
                      </option>
                    ))
                }
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
