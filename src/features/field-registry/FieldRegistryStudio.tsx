import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

export const FieldRegistryStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [localizedNames, setLocalizedNames] = useState<any>(null);
  const { activeProductContext } = usePlatformStore();
  const domainContext = activeProductContext || 'Global';

  // --- DYNAMIC API BINDINGS ---
  
  const createFieldMutation = useMutation({
    mutationFn: async (newField: any) => {
      const res = await apiClient.post('/fields/registry/', newField);
      return res.data;
    },
    onSuccess: () => {
      // Instantly refresh the table cache so the new row appears seamlessly!
      queryClient.invalidateQueries({ queryKey: ['fields'] });
      setIsDrawerOpen(false);
      setLocalizedNames(null);
    }
  });

  const translateMutation = useMutation({
    mutationFn: async (payload: { business_name: string, domain_category: string }) => {
      const res = await apiClient.post('/assistant/translate-field', payload);
      return res.data;
    },
    onSuccess: (data) => {
      setLocalizedNames(data.translations);
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to translate.");
    }
  });
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['fields', searchTerm, domainContext],
    queryFn: async () => {
      // If the user is searching, hit the search endpoint; otherwise, list all fields.
      const endpoint = searchTerm.length >= 2 
        ? `/fields/registry/search?q=${searchTerm}&domain=${domainContext}` 
        : `/fields/registry/?domain=${domainContext}`;
      const res = await apiClient.get(endpoint);
      return res.data;
    }
  });

  // --- FORM SUBMISSION HANDLER ---
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      technical_sys_name: formData.get('technical_sys_name'),
      preferred_business_name: formData.get('preferred_business_name'),
      iso_business_name: formData.get('iso_business_name'),
      domain_category: domainContext,
      data_type: formData.get('data_type'),
      is_pii: formData.get('is_pii') === 'on',
      localized_names: localizedNames,
    };
    createFieldMutation.mutate(payload);
  };

  const handleAutoTranslate = (e: React.MouseEvent) => {
    e.preventDefault();
    const form = (e.target as HTMLButtonElement).closest('form');
    if (form) {
      const formData = new FormData(form);
      const bName = formData.get('preferred_business_name') as string;
      const dCat = formData.get('domain_category') as string;
      if (bName) {
        translateMutation.mutate({ business_name: bName, domain_category: dCat || 'General Banking' });
      } else {
        alert("Please enter a Preferred Business Name first.");
      }
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded shadow-sm flex flex-col h-[750px]">
      {/* Header & Tooling Bar */}
      <div className="flex justify-between items-center p-6 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-800">ISO Field Registry</h1>
          <p className="text-sm text-slate-500 mt-1">Manage global data attributes and semantic definitions.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search fields (e.g. amount, SSN)..." 
              className="pl-9 pr-4 py-2 border border-slate-300 rounded text-sm focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none w-72 shadow-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
        <button 
          onClick={() => setIsDrawerOpen(true)}
          className="bg-[#0176D3] text-white px-4 py-2 rounded text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors"
        >
            + New ISO Field
          </button>
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-slate-500 font-bold">Synchronizing Registry...</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-red-500 font-bold">Error loading fields from Core Engine.</div>
        ) : (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
              <tr>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Technical Name</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Business Name</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Domain</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Data Type</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">PII Status</th>
                <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.fields?.map((field: any) => (
                <tr key={field.field_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-[#0176D3] bg-[#F0F7FF]">{field.technical_sys_name}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{field.preferred_business_name}</td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border border-slate-200">
                      {field.domain_category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium">{field.data_type}</td>
                  <td className="px-6 py-4">
                    {field.is_pii ? (
                      <span className="text-red-700 font-bold text-[10px] uppercase tracking-wider bg-red-50 px-2 py-1 rounded border border-red-100"><span className="mr-1">🔒</span>Restricted</span>
                    ) : (
                      <span className="text-emerald-700 font-bold text-[10px] uppercase tracking-wider bg-emerald-50 px-2 py-1 rounded border border-emerald-100">Standard</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-[#0176D3] font-bold text-[12px] hover:underline uppercase tracking-wider">Edit</button>
                  </td>
                </tr>
              ))}
              {data?.fields?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">No fields found matching your criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Pagination Footer */}
      <div className="bg-slate-50 border-t border-slate-200 p-4 text-[13px] font-semibold text-slate-500 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
        <div>Showing {data?.fields?.length || 0} of {data?.total_count || 0} registered attributes.</div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-50 transition-colors">Previous</button>
          <button className="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-50 transition-colors">Next</button>
        </div>
      </div>

      {/* Slide-Out Drawer for New ISO Field */}
      {isDrawerOpen && (
        <div className="absolute top-0 right-0 w-[450px] h-full bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-slide-in-right">
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Register New ISO Field</h2>
            <button onClick={() => { setIsDrawerOpen(false); setLocalizedNames(null); }} className="text-slate-400 hover:text-slate-700 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Technical System Name</label>
                <input name="technical_sys_name" required placeholder="e.g., of_fintax_bal_01" className="w-full text-[13px] font-mono text-[#0176D3] border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Preferred Business Name</label>
                  <button onClick={handleAutoTranslate} disabled={translateMutation.isPending} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 disabled:opacity-50">
                    {translateMutation.isPending ? 'Translating...' : '✨ Auto-Translate'}
                  </button>
                </div>
                <input name="preferred_business_name" required placeholder="e.g., Principal Amount" className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">ISO 20022 Standard Mapping</label>
                <input name="iso_business_name" required placeholder="e.g., Balances.Principal" className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <span>Domain Category</span>
                    <span className="text-rose-500" title="Locked to active tenant/LOB">🔒</span>
                  </label>
                  <div className="w-full text-[13px] font-bold text-slate-600 bg-slate-50 border border-slate-300 rounded p-2.5 truncate">
                    {domainContext}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Data Type</label>
                  <select name="data_type" className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none bg-white">
                    <option value="Text">Text</option>
                    <option value="Decimal">Decimal</option>
                    <option value="Amount">Amount</option>
                    <option value="Date">Date</option>
                    <option value="Alphanumeric">Alphanumeric</option>
                  </select>
                </div>
              </div>
              {localizedNames && (
                <div className="bg-indigo-50 border border-indigo-100 rounded p-4 shadow-sm animate-fade-in">
                  <h3 className="text-[11px] font-extrabold text-indigo-800 uppercase tracking-wider mb-3">✨ AI Generated Localizations</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(localizedNames).map(([locale, translation]) => (
                      <div key={locale}>
                        <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">{locale}</div>
                        <div className="text-[12px] font-semibold text-indigo-900">{String(translation)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" name="is_pii" id="is_pii" className="w-4 h-4 text-[#0176D3] border-slate-300 rounded focus:ring-[#0176D3]" />
                <label htmlFor="is_pii" className="text-[12px] font-bold text-slate-700">Contains PII (Personally Identifiable Information)</label>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button type="button" onClick={() => { setIsDrawerOpen(false); setLocalizedNames(null); }} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button type="submit" disabled={createFieldMutation.isPending} className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">{createFieldMutation.isPending ? 'Saving...' : 'Register Field'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};