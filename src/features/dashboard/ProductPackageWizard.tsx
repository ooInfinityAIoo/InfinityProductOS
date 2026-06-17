import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

export const ProductPackageWizard: React.FC = () => {
  const { setWizardOpen, setProductContext } = usePlatformStore();
  const queryClient = useQueryClient();
  
  const [packageName, setPackageName] = useState('');
  const [domain, setDomain] = useState('Payments');
  const [country, setCountry] = useState('US');
  const [currency, setCurrency] = useState('USD');
  
  // Pre-seed the configuration checklist
  const [modules, setModules] = useState([
    { module_name: 'ISO Field Registry Sync', owner: 'Data Governance Team', sla_days: 2 },
    { module_name: 'DataGateway Mappers', owner: 'Integration Team', sla_days: 5 },
    { module_name: 'Business Rule Sets', owner: 'Risk Analysts', sla_days: 4 },
    { module_name: 'Workflow Orchestration', owner: 'Product Ops', sla_days: 7 }
  ]);

  const createPackageMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        package_name: packageName,
        business_domain: domain,
        jurisdiction_country_code: country,
        base_currency_code: currency,
        configuration_plan: modules.map(m => ({ ...m, is_configured: false }))
      };
      await apiClient.post('/masters/packages', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-packages'] });
      setWizardOpen(false);
      setProductContext(packageName);
    }
  });

  const handleAddModule = () => {
    setModules([...modules, { module_name: 'Custom Screen Design', owner: 'UX Team', sla_days: 3 }]);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] animate-fade-in">
      <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl w-[800px] overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-extrabold bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent font-display">Initialize New Product Application Package</h2>
          <p className="text-xs text-slate-400 mt-1.5 font-medium">Define the core implementation scope, jurisdiction, and Canva studio owners.</p>
        </div>
        
        <div className="p-8 flex-1 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Product Package Brand Name</label>
              <input 
                type="text" 
                value={packageName} 
                onChange={e => setPackageName(e.target.value)} 
                placeholder="e.g., Global Treasury Hub" 
                className="w-full text-sm font-bold text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Business Domain</label>
              <select 
                value={domain} 
                onChange={e => setDomain(e.target.value)} 
                className="w-full text-sm font-bold text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm"
              >
                <option value="Payments">Payments & Clearing</option>
                <option value="Treasury">Treasury Management</option>
                <option value="Supply Chain">Supply Chain Finance</option>
                <option value="Retail">Retail Banking</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Jurisdiction</label>
                <input 
                  type="text" 
                  value={country} 
                  onChange={e => setCountry(e.target.value)} 
                  className="w-full text-sm font-semibold font-mono text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm text-center" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Base Currency</label>
                <input 
                  type="text" 
                  value={currency} 
                  onChange={e => setCurrency(e.target.value)} 
                  className="w-full text-sm font-semibold font-mono text-slate-800 bg-white/60 border border-slate-200/80 rounded-xl p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm text-center" 
                />
              </div>
            </div>
          </div>
 
          <div className="border border-slate-150 bg-slate-50/20 rounded-2xl overflow-hidden">
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-150 bg-slate-50/60">
              <h3 className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Configuration Checklist (Canva Studios)</h3>
              <button onClick={handleAddModule} className="text-indigo-650 text-[11px] font-bold hover:underline">+ Add Module</button>
            </div>
            <div className="p-5 space-y-3">
              {modules.map((m, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex-1">
                    <input 
                      type="text" 
                      value={m.module_name} 
                      onChange={(e) => { const nm = [...modules]; nm[idx].module_name = e.target.value; setModules(nm); }} 
                      className="w-full text-xs font-semibold text-slate-700 bg-white/60 border border-slate-200/80 rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-inner" 
                      placeholder="Module Name" 
                    />
                  </div>
                  <div className="w-1/3">
                    <input 
                      type="text" 
                      value={m.owner} 
                      onChange={(e) => { const nm = [...modules]; nm[idx].owner = e.target.value; setModules(nm); }} 
                      className="w-full text-xs font-semibold text-slate-700 bg-white/60 border border-slate-200/80 rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-inner" 
                      placeholder="Assign Owner" 
                    />
                  </div>
                  <div className="w-28 relative">
                    <input 
                      type="number" 
                      value={m.sla_days} 
                      onChange={(e) => { const nm = [...modules]; nm[idx].sla_days = parseInt(e.target.value); setModules(nm); }} 
                      className="w-full text-xs font-semibold text-slate-700 bg-white/60 border border-slate-200/80 rounded-xl p-2.5 pr-10 focus:border-indigo-500 outline-none transition-all shadow-inner text-center" 
                      placeholder="SLA" 
                    />
                    <span className="absolute right-3.5 top-3 text-[9px] text-slate-400 font-bold uppercase tracking-wider">Days</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
 
        <div className="px-8 py-5 bg-slate-50/80 border-t border-slate-150 flex justify-end gap-3 shadow-inner">
          <button 
            onClick={() => setWizardOpen(false)} 
            className="px-5 py-2.5 text-[13px] font-bold text-slate-555 bg-white border border-slate-250 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >Cancel</button>
          <button 
            disabled={createPackageMutation.isPending || !packageName}
            onClick={() => createPackageMutation.mutate()} 
            className="px-6 py-2.5 text-[13px] font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-750 hover:to-indigo-800 rounded-xl shadow-md shadow-indigo-600/15 transition-all active:scale-[0.98] disabled:opacity-50"
          >{createPackageMutation.isPending ? 'Initializing...' : 'Initialize Product Configuration'}</button>
        </div>
      </div>
    </div>
  );
};