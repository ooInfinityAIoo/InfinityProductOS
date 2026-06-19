import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export const CockpitLockBanner: React.FC = () => {
  const { activeProductContext, activeCoreProductId, setCoreProductId } = usePlatformStore();

  const { data: productsData } = useQuery({
    queryKey: ['products', activeProductContext],
    queryFn: async () => {
      if (!activeProductContext) return [];
      return (await apiClient.get(`/products/?domain=${activeProductContext}`)).data;
    },
    enabled: !!activeProductContext
  });

  return (
    <div className="glass-card rounded-2xl p-4 flex items-center justify-between shadow-sm border border-rose-200/50 bg-rose-50/10 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-rose-100/50 flex items-center justify-center text-rose-500 font-extrabold text-lg shadow-inner">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        </div>
        <div>
          <h2 className="text-[13px] font-extrabold text-slate-800 tracking-tight font-display">Two-Key Cockpit Lockdown</h2>
          <p className="text-[10px] text-slate-500 font-medium mt-0.5">Configuration is disabled until a Core Product (Level 2) is explicitly selected.</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Level 1: Domain</span>
        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg mr-4">{activeProductContext || 'Global'}</span>
        
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Level 2: Product Context</span>
        <select 
          value={activeCoreProductId || ''} 
          onChange={(e) => setCoreProductId(e.target.value || null)}
          className="text-[12px] font-bold text-slate-800 border-2 border-rose-200 bg-white rounded-xl p-2.5 outline-none focus:border-rose-400 shadow-sm min-w-[200px]"
        >
          <option value="">-- SELECT CORE PRODUCT --</option>
          {productsData?.map((p: any) => (
            <option key={p.product_id} value={p.product_id}>{p.product_name}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
