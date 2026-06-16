import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const UnstructuredDocumentStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedMapper, setSelectedMapper] = useState<any>(null);

  // Form State
  const [mapperName, setMapperName] = useState('');
  const [mappings, setMappings] = useState([{ source_path: '', target_iso_field: '', reading_mode: 'PROMPT', is_mandatory: false }]);
  const [applicationPackageId, setApplicationPackageId] = useState('');

  // --- DYNAMIC API BINDINGS ---
  
  // Fetch Existing Mappers (Filtered to PDF/Unstructured only)
  const { data: mappersData, isLoading: isLoadingMappers } = useQuery({
    queryKey: ['mappers'],
    queryFn: async () => {
      const res = await apiClient.get('/mappers/');
      // Filter to show only Unstructured Document Templates
      res.data.mappers = res.data.mappers.filter((m: any) => m.source_format === 'PDF' || m.source_format === 'UNSTRUCTURED');
      return res.data;
    }
  });

  // Fetch ISO Field Registry (For the dropdowns!)
  const { data: fieldsData } = useQuery({
    queryKey: ['fields-all'],
    queryFn: async () => (await apiClient.get('/fields/registry?limit=1000')).data
  });

  // Fetch Application Packages for Scoping
  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });

  const createMapperMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        mapper_name: mapperName,
        source_format: 'UNSTRUCTURED', // Agentic Extraction Pipeline
        target_format: 'ISO_20022_DICTIONARY',
        mappings: mappings.filter(m => m.source_path && m.target_iso_field),
        application_package_id: applicationPackageId || null,
      };
      return (await apiClient.post('/mappers/', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mappers'] });
      setIsCreating(false);
      setMappings([{ source_path: '', target_iso_field: '', reading_mode: 'PROMPT', is_mandatory: false }]);
      setMapperName('');
      setApplicationPackageId('');
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Save failed.")
  });

  const handleAddMappingRow = () => {
    setMappings([...mappings, { source_path: '', target_iso_field: '', reading_mode: 'PROMPT', is_mandatory: false }]);
  };

  return (
    <div className="flex gap-6 h-[750px] animate-fade-in">
      {/* Left Column: List of Blueprints */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Agentic Unstructured Blueprints</h2>
            <p className="text-xs text-slate-500 mt-0.5">Unstructured Document Blueprints.</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedMapper(null); }}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-1"
          >
            ✨ New Blueprint
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoadingMappers ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div>
          ) : mappersData?.mappers?.map((mapper: any) => (
            <div 
              key={mapper.mapper_id} 
              onClick={() => { setSelectedMapper(mapper); setIsCreating(false); }}
              className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedMapper?.mapper_id === mapper.mapper_id ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800">{mapper.mapper_name}</div>
                <div className="text-[10px] font-mono text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded font-bold border border-indigo-200">{mapper.source_format}</div>
              </div>
              <div className="text-[11px] text-slate-500">Maps {mapper.mappings?.length || 0} attributes using LLM Prompts.</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!isCreating && !selectedMapper && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select an Unstructured Blueprint or create a new one.</p>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Agentic Unstructured File Prompt Designer</h2>
              <p className="text-xs text-slate-500 mt-1">Use natural language prompts to orchestrate AI Agents to extract data from PDFs, Contracts (.docx), and structured files (Excel/CSV).</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Blueprint Name</label>
                  <input type="text" value={mapperName} onChange={(e) => setMapperName(e.target.value)} placeholder="e.g., Corporate Tax Return Extractor" className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Application Scope</label>
                  <select value={applicationPackageId} onChange={(e) => setApplicationPackageId(e.target.value)} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-indigo-500 outline-none bg-white">
                    <option value="">Global (All Packages)</option>
                    {packagesData?.packages?.map((pkg: any) => (<option key={pkg.package_id} value={pkg.package_id}>{pkg.package_name}</option>))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                  <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">Agentic Extraction Prompts</label>
                  <button onClick={handleAddMappingRow} className="text-indigo-600 text-[11px] font-bold hover:underline">+ Add Prompt Row</button>
                </div>
                
                <div className="space-y-3">
                  {mappings.map((mapping, idx) => (
                    <div key={idx} className="flex gap-3 items-center bg-indigo-50/50 p-4 border border-indigo-100 rounded">
                      <span className="text-[10px] font-extrabold text-indigo-400 bg-indigo-100 p-1.5 rounded shrink-0">✨ PROMPT</span>
                      
                      <input type="text" placeholder="e.g., Extract the total tax liability amount" value={mapping.source_path} onChange={(e) => { const newM = [...mappings]; newM[idx].source_path = e.target.value; setMappings(newM); }} className="flex-1 text-[13px] border border-slate-300 rounded p-2 outline-none focus:border-indigo-500 shadow-inner" />
                      
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                      
                      <select value={mapping.target_iso_field} onChange={(e) => { const newM = [...mappings]; newM[idx].target_iso_field = e.target.value; setMappings(newM); }} className="w-64 text-[12px] font-mono text-indigo-700 border border-slate-300 rounded p-2 outline-none focus:border-indigo-500 bg-white shadow-sm">
                        <option value="" disabled>Map to ISO Registry Field...</option>
                        {fieldsData?.fields?.map((f: any) => (<option key={f.technical_sys_name} value={f.technical_sys_name}>{f.technical_sys_name}</option>))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={createMapperMutation.isPending || !mapperName} onClick={() => createMapperMutation.mutate()} className="px-5 py-2 text-[13px] font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50">Deploy Unstructured Blueprint</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};