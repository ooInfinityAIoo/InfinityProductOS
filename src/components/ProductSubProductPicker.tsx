// WHY THIS COMPONENT EXISTS:
// Reusable Product → Sub-Product picker for use inside NEW RECORD forms across all
// Designer Studio modules (Business Rules, Calculations, Workflows, Screens, etc.).
//
// This is intentionally SEPARATE from the CockpitFilterBar (header filter).
// The header filter controls what existing records are SHOWN.
// This picker controls what a NEW RECORD is SCOPED TO.
//
// Rules:
//   - Product is MANDATORY — a record cannot be created without a product scope.
//   - "All Products" is a valid product selection — the record applies package-wide.
//   - Sub-Product is optional — "All Sub-Products" means the record applies to all
//     variations of the selected product.
//   - Sub-Product selector only appears after a specific Product is chosen
//     (not shown when "All Products" is selected, because sub-products are product-scoped).
//
// Pre-population: if a product/sub-product is already selected in the header filter
// (activeCoreProductId / activeCoreSubProductId), the picker defaults to those values
// so the user doesn't have to re-select what they were just filtering by.

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { usePlatformStore } from '../store/usePlatformStore';

interface Props {
  packageId: string | null;
  // Controlled values — parent form owns these
  selectedProductId: string;          // '' = none, 'ALL' = all products
  selectedSubProductId: string;       // '' = all sub-products
  onProductChange: (productId: string) => void;
  onSubProductChange: (subProductId: string) => void;
  // If true, shows a compact inline layout instead of stacked labels
  compact?: boolean;
}

export const ProductSubProductPicker: React.FC<Props> = ({
  packageId,
  selectedProductId,
  selectedSubProductId,
  onProductChange,
  onSubProductChange,
  compact = false,
}) => {
  const { activeCoreProductId, activeCoreSubProductId } = usePlatformStore();

  // Pre-populate from header filter on first mount — convenience for the user
  useEffect(() => {
    if (!selectedProductId && activeCoreProductId) {
      onProductChange(activeCoreProductId);
    }
    if (!selectedSubProductId && activeCoreSubProductId) {
      onSubProductChange(activeCoreSubProductId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: productsData } = useQuery({
    queryKey: ['products', packageId],
    queryFn: async () => (await apiClient.get(`/masters/products?package_id=${packageId}`)).data,
    enabled: !!packageId,
  });
  const products = productsData?.products ?? [];

  const { data: subProductsData } = useQuery({
    queryKey: ['subproducts', selectedProductId],
    queryFn: async () => (await apiClient.get(`/masters/subproducts?product_id=${selectedProductId}`)).data,
    enabled: !!selectedProductId && selectedProductId !== 'ALL',
  });
  const subProducts = subProductsData?.subproducts ?? [];

  const showSubProduct = selectedProductId && selectedProductId !== 'ALL';

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {/* Product */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Product *</span>
          <select
            value={selectedProductId}
            onChange={e => { onProductChange(e.target.value); onSubProductChange(''); }}
            className={`border rounded-lg px-2.5 py-1.5 text-[12px] font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
              !selectedProductId ? 'border-rose-300 text-slate-400' : 'border-slate-200 text-slate-800'
            }`}
          >
            <option value="">— Select Product —</option>
            <option value="ALL">📦 All Products (package-wide)</option>
            {products.map((p: any) => (
              <option key={p.product_id} value={p.product_id}>
                {p.alias ?? p.product_name}
              </option>
            ))}
          </select>
        </div>
        {showSubProduct && (
          <>
            <span className="text-slate-300">›</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Sub-Product</span>
              <select
                value={selectedSubProductId}
                onChange={e => onSubProductChange(e.target.value)}
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-800"
              >
                <option value="">All Sub-Products</option>
                {subProducts.map((sp: any) => (
                  <option key={sp.subproduct_id} value={sp.subproduct_id}>
                    {sp.alias ?? sp.subproduct_name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {!selectedProductId && (
          <span className="text-[10px] text-rose-500 font-semibold">Product is required to save this record.</span>
        )}
      </div>
    );
  }

  // Full stacked layout for modals / form sections
  return (
    <div className="bg-indigo-50/40 border border-indigo-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider">Product Scope</span>
        <span className="text-[10px] bg-rose-100 text-rose-600 font-bold px-2 py-0.5 rounded-md">Required</span>
      </div>
      <p className="text-[11px] text-slate-500">
        This record will only apply to the selected product and sub-product.
        Choose <strong>All Products</strong> to apply it package-wide.
      </p>

      {/* Product row */}
      <div>
        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Product *</label>
        <select
          value={selectedProductId}
          onChange={e => { onProductChange(e.target.value); onSubProductChange(''); }}
          className={`w-full border-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors ${
            !selectedProductId
              ? 'border-rose-300 text-slate-400'
              : 'border-indigo-200 text-slate-800'
          }`}
        >
          <option value="">— Select a Product —</option>
          <option value="ALL">📦 All Products (applies to every product in this package)</option>
          {products.map((p: any) => (
            <option key={p.product_id} value={p.product_id}>
              {p.alias ?? p.product_name}  ·  {p.product_id}
            </option>
          ))}
        </select>
        {!selectedProductId && (
          <p className="text-[11px] text-rose-500 font-semibold mt-1">⚠ A Product must be selected before saving.</p>
        )}
      </div>

      {/* Sub-Product row — only when a specific product is chosen */}
      {showSubProduct && (
        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
            Sub-Product <span className="text-slate-400 font-normal normal-case">(optional — leave blank to apply to all variations)</span>
          </label>
          <select
            value={selectedSubProductId}
            onChange={e => onSubProductChange(e.target.value)}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-[13px] font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-800"
          >
            <option value="">All Sub-Products (applies to every variation)</option>
            {subProducts.length === 0
              ? <option disabled>No sub-products defined for this product yet</option>
              : subProducts.map((sp: any) => (
                  <option key={sp.subproduct_id} value={sp.subproduct_id}>
                    {sp.alias ?? sp.subproduct_name}  ·  {sp.subproduct_id}
                  </option>
                ))
            }
          </select>
        </div>
      )}

      {/* Scope summary */}
      {selectedProductId && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Scope:</span>
          <span className="text-[11px] font-bold text-slate-700">
            {selectedProductId === 'ALL'
              ? 'All Products in package'
              : products.find((p: any) => p.product_id === selectedProductId)?.alias
                ?? products.find((p: any) => p.product_id === selectedProductId)?.product_name
                ?? selectedProductId
            }
            {showSubProduct && selectedSubProductId
              ? ` › ${subProducts.find((sp: any) => sp.subproduct_id === selectedSubProductId)?.alias ?? selectedSubProductId}`
              : showSubProduct ? ' › All Sub-Products' : ''
            }
          </span>
        </div>
      )}
    </div>
  );
};
