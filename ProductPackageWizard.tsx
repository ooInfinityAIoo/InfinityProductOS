import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

export const ProductPackageWizard: React.FC = () => {
  const { setWizardOpen } = usePlatformStore();
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
    }
  });

  const handleAddModule = () => {
    setModules([...modules, { module_name: 'Custom Screen Design', owner: 'UX Team', sla_days: 3 }]);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100]">
      <div className="bg-white rounded shadow-2xl w-[800px] overflow-hidden animate-slide-in-up flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50">
          <h2 className="text-xl font-extrabold text-[#0052CC]">Initialize New Product Application Package</h2>
          <p className="text-sm text-slate-500 mt-1">Define the core implementation scope, jurisdiction, and Canva studio owners.</p>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Product Package Brand Name</label>
              <input type="text" value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="e.g., Global Treasury Hub" className="w-full text-sm font-bold text-slate-900 border border-slate-300 rounded p-3 focus:border-[#0176D3] outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Business Domain</label>
              <select value={domain} onChange={e => setDomain(e.target.value)} className="w-full text-sm text-slate-900 border border-slate-300 rounded p-3 outline-none bg-white">
                <option value="Payments">Payments & Clearing</option>
                <option value="Treasury">Treasury Management</option>
                <option value="Supply Chain">Supply Chain Finance</option>
                <option value="Retail">Retail Banking</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Jurisdiction</label>
                <input type="text" value={country} onChange={e => setCountry(e.target.value)} className="w-full text-sm font-mono border border-slate-300 rounded p-3 outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Base Currency</label>
                <input type="text" value={currency} onChange={e => setCurrency(e.target.value)} className="w-full text-sm font-mono border border-slate-300 rounded p-3 outline-none" />
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded">
            <div className="flex justify-between items-center p-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Configuration Checklist (Canva Studios)</h3>
              <button onClick={handleAddModule} className="text-[#0176D3] text-[11px] font-bold hover:underline">+ Add Module</button>
            </div>
            <div className="p-3 space-y-3">
              {modules.map((m, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex-1">
                    <input type="text" value={m.module_name} onChange={(e) => { const nm = [...modules]; nm[idx].module_name = e.target.value; setModules(nm); }} className="w-full text-xs border border-slate-300 rounded p-2" placeholder="Module Name" />
                  </div>
                  <div className="w-1/3">
                    <input type="text" value={m.owner} onChange={(e) => { const nm = [...modules]; nm[idx].owner = e.target.value; setModules(nm); }} className="w-full text-xs border border-slate-300 rounded p-2" placeholder="Assign Owner" />
                  </div>
                  <div className="w-24 relative">
                    <input type="number" value={m.sla_days} onChange={(e) => { const nm = [...modules]; nm[idx].sla_days = parseInt(e.target.value); setModules(nm); }} className="w-full text-xs border border-slate-300 rounded p-2 pr-8" placeholder="SLA" />
                    <span className="absolute right-2 top-2 text-[10px] text-slate-400 font-bold">Days</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={() => setWizardOpen(false)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100">Cancel</button>
          <button 
            disabled={createPackageMutation.isPending || !packageName}
            onClick={() => createPackageMutation.mutate()} 
            className="px-6 py-2.5 text-[13px] font-bold text-white bg-[#0052CC] rounded hover:bg-blue-800 shadow-sm disabled:opacity-50"
          >{createPackageMutation.isPending ? 'Initializing...' : 'Initialize Product Configuration'}</button>
        </div>
      </div>
    </div>
  );
};