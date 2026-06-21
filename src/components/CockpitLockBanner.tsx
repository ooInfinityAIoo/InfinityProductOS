// WHY THIS COMPONENT EXISTS:
// Three-level "Cockpit Lockdown" banner shown at the top of every Designer Studio module.
// Enforces Package → Product → Sub-Product context before configuration begins.
// Without this, a business rule created for "SWIFT B2B" would have no boundary
// separating it from "SWIFT B2C" or "SEPA Germany".
//
// Level 1: Package (from activeProductContext — set when user enters a package)
// Level 2: Product (dropdown — populates from Product Registry for this package)
// Level 3: Sub-Product (dropdown — appears only after Product is selected, optional
//           since not every studio requires sub-product granularity)
//
// Changing Product resets Sub-Product to null — stale sub-product context from a
// prior product selection must never bleed into a new product's studio config.

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

  const isLocked = !activeCoreProductId;

  return (
    <div className={`rounded-2xl p-4 flex items-center justify-between shadow-sm mb-6 border ${
      isLocked
        ? 'border-rose-200/50 bg-rose-50/10'
        : 'border-emerald-200/50 bg-emerald-50/10'
    }`}>
      {/* Left — lock icon + label */}
      <div className="flex items-center gap-3 shrink-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg shadow-inner ${
          isLocked ? 'bg-rose-100/50 text-rose-500' : 'bg-emerald-100/50 text-emerald-600'
        }`}>
          {isLocked
            ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
          }
        </div>
        <div>
          <h2 className="text-[13px] font-extrabold text-slate-800 tracking-tight">
            {isLocked ? 'Three-Level Cockpit Lockdown' : 'Studio Context Active'}
          </h2>
          <p className="text-[10px] text-slate-500 font-medium mt-0.5">
            {isLocked
              ? 'Select a Product to unlock configuration. Sub-Product further scopes the studio.'
              : `Configuring for: ${activeProductContext} › ${activeCoreProductId}${activeCoreSubProductId ? ' › ' + activeCoreSubProductId : ''}`
            }
          </p>
        </div>
      </div>

      {/* Right — level selectors */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Level 1 — Package (read-only, set by package context) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">L1: Package</span>
          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg whitespace-nowrap">
            {activeProductContext || 'None'}
          </span>
        </div>

        <span className="text-slate-300 text-[14px]">›</span>

        {/* Level 2 — Product */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">L2: Product</span>
          <select
            value={activeCoreProductId || ''}
            onChange={(e) => setCoreProductId(e.target.value || null)}
            className={`text-[12px] font-bold text-slate-800 border-2 bg-white rounded-xl px-3 py-2 outline-none shadow-sm min-w-[180px] ${
              isLocked ? 'border-rose-200 focus:border-rose-400' : 'border-emerald-200 focus:border-emerald-400'
            }`}
          >
            <option value="">— Select Product —</option>
            {products.map((p: any) => (
              <option key={p.product_id} value={p.product_id}>
                {p.alias ?? p.product_name} ({p.product_id})
              </option>
            ))}
          </select>
        </div>

        {/* Level 3 — Sub-Product (only shown once product is selected) */}
        {activeCoreProductId && (
          <>
            <span className="text-slate-300 text-[14px]">›</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">L3: Sub-Product</span>
              <select
                value={activeCoreSubProductId || ''}
                onChange={(e) => setCoreSubProductId(e.target.value || null)}
                className="text-[12px] font-bold text-slate-800 border-2 border-slate-200 bg-white rounded-xl px-3 py-2 outline-none focus:border-indigo-400 shadow-sm min-w-[180px]"
              >
                <option value="">— All Sub-Products —</option>
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
