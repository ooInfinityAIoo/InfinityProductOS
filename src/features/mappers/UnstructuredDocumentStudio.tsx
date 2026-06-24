import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';
import { IsoFieldSelector } from '../../components/IsoFieldSelector';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

export const UnstructuredDocumentStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeCoreProductId } = usePlatformStore();
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
    <div className="flex flex-col w-full h-[800px] animate-fade-in">
      <CockpitLockBanner />
      <InfinityAIHelper studioKey="unstructured-document-studio" />
      <div className={`flex gap-6 flex-1 min-h-0 transition-all duration-300 ${!activeCoreProductId ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
      {/* Left Column: List of Blueprints */}
      <div className="w-[400px] glass-card rounded-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Agentic Blueprints</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Unstructured file ingest rules</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedMapper(null); }}
            className="bg-indigo-600 hover:bg-indigo-750 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98] flex items-center gap-1"
          >
            ✨ New Blueprint
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoadingMappers ? (
            <div className="text-center text-slate-400 text-xs mt-10 font-bold animate-pulse">Loading blueprints...</div>
          ) : mappersData?.mappers?.map((mapper: any) => (
            <div 
              key={mapper.mapper_id} 
              onClick={() => { setSelectedMapper(mapper); setIsCreating(false); }}
              className={`p-4 border rounded-2xl cursor-pointer transition-all duration-300 shadow-sm ${
                selectedMapper?.mapper_id === mapper.mapper_id 
                  ? 'bg-indigo-50/40 border-indigo-200/80 shadow-glow-indigo' 
                  : 'bg-white/50 border-slate-150 hover:border-indigo-400/50 hover:bg-white/80'
              }`}
            >
              <div className="flex justify-between items-start mb-2.5">
                <div className="text-[13px] font-bold text-slate-800 tracking-tight">{mapper.mapper_name}</div>
                <div className="text-[9px] font-mono text-indigo-650 bg-indigo-50/60 border border-indigo-100/30 px-2 py-0.5 rounded-lg font-bold">{mapper.source_format}</div>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Maps {mapper.mappings?.length || 0} attributes using LLM Prompts.</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden relative">
        {!isCreating && !selectedMapper && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <p className="text-xs font-semibold text-slate-400">Select an Unstructured Blueprint or create a new one.</p>
          </div>
        )}

        {selectedMapper && !isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right p-6 overflow-y-auto space-y-6">
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-base font-extrabold text-slate-800 font-display">{selectedMapper.mapper_name}</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Unstructured Document Blueprint Details</p>
                </div>
                <span className="font-mono text-xs text-indigo-650 bg-indigo-50/80 border border-indigo-100/50 px-2.5 py-1 rounded-lg font-bold">{selectedMapper.source_format}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-6 mt-6">
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Format</div>
                  <div className="text-xs font-semibold text-slate-700">{selectedMapper.target_format}</div>
                </div>
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Scope</div>
                  <div className="text-xs font-semibold text-slate-700">{selectedMapper.application_package_id ? 'Package Scope' : 'Global (All Packages)'}</div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-3">Agentic Extraction Prompts</h3>
              <div className="space-y-2.5">
                {selectedMapper.mappings?.map((m: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50/40 border border-slate-100 p-4 rounded-xl">
                    <div className="flex-1 pr-4">
                      <span className="text-[9px] font-extrabold text-indigo-500 bg-indigo-50 border border-indigo-100/30 px-2 py-0.5 rounded mr-2.5 tracking-wider uppercase">Prompt</span>
                      <span className="text-xs text-slate-700 font-semibold">{m.source_path}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                      <span className="font-mono text-xs font-bold text-indigo-650 bg-indigo-50 border border-indigo-100/30 px-2.5 py-1 rounded-lg shadow-sm">{m.target_iso_field}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-[16px] font-extrabold text-slate-800 font-display">Agentic Unstructured File Prompt Designer</h2>
              <p className="text-[11px] text-slate-400 mt-1">Use natural language prompts to orchestrate AI Agents to extract data from PDFs, Contracts (.docx), and structured files (Excel/CSV).</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Blueprint Name</label>
                  <input 
                    type="text" 
                    value={mapperName} 
                    onChange={(e) => setMapperName(e.target.value)} 
                    placeholder="e.g., Corporate Tax Return Extractor" 
                    className="w-full text-[13px] font-semibold text-slate-800 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Application Scope</label>
                  <select 
                    value={applicationPackageId} 
                    onChange={(e) => setApplicationPackageId(e.target.value)} 
                    className="w-full text-[13px] text-slate-800 border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  >
                    <option value="">Global (All Packages)</option>
                    {packagesData?.packages?.map((pkg: any) => (<option key={pkg.package_id} value={pkg.package_id}>{pkg.package_name}</option>))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2.5">
                  <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">Agentic Extraction Prompts</label>
                  <button onClick={handleAddMappingRow} className="text-indigo-600 text-[11px] font-bold hover:underline">+ Add Prompt Row</button>
                </div>
                
                <div className="space-y-3">
                  {mappings.map((mapping, idx) => (
                    <div key={idx} className="flex gap-3 items-center bg-indigo-50/40 p-4 border border-indigo-100/80 rounded-2xl shadow-sm transition-all hover:bg-indigo-50/60">
                      <span className="text-[10px] font-extrabold text-indigo-500 bg-indigo-50 border border-indigo-150/50 p-1.5 rounded-lg shrink-0">✨ PROMPT</span>
                      
                      <input 
                        type="text" 
                        placeholder="e.g., Extract the total tax liability amount" 
                        value={mapping.source_path} 
                        onChange={(e) => { const newM = [...mappings]; newM[idx].source_path = e.target.value; setMappings(newM); }} 
                        className="flex-1 text-[13px] border border-slate-200 bg-white rounded-xl p-2 outline-none focus:border-indigo-500 shadow-inner" 
                      />
                      
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                      
                      <div className="w-64">
                        <IsoFieldSelector 
                          value={mapping.target_iso_field}
                          onChange={(val) => { const newM = [...mappings]; newM[idx].target_iso_field = val; setMappings(newM); }}
                          placeholder="Map to Universal Registry Field..."
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
              <button 
                onClick={() => setIsCreating(false)} 
                className="px-5 py-2.5 text-[13px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm active:scale-[0.98]"
              >
                Cancel
              </button>
              <button 
                disabled={createMapperMutation.isPending || !mapperName} 
                onClick={() => createMapperMutation.mutate()} 
                className="px-5 py-2.5 text-[13px] font-bold text-white bg-indigo-600 hover:bg-indigo-750 rounded-xl transition-all shadow-md shadow-indigo-650/15 disabled:opacity-50 active:scale-[0.98]"
              >
                Deploy Unstructured Blueprint
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};