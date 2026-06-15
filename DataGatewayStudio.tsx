import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const DataGatewayStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedMapper, setSelectedMapper] = useState<any>(null);

  // Form State
  const [mapperName, setMapperName] = useState('');
  const [sourceFormat, setSourceFormat] = useState('CSV');
  const [mappings, setMappings] = useState([{ source_path: '', target_iso_field: '', is_mandatory: false }]);

  // --- DYNAMIC API BINDINGS ---
  
  // 1. Fetch Existing Mappers
  const { data: mappersData, isLoading: isLoadingMappers } = useQuery({
    queryKey: ['mappers'],
    queryFn: async () => (await apiClient.get('/mappers/')).data
  });

  // 2. Fetch ISO Field Registry (For the dropdowns!)
  const { data: fieldsData } = useQuery({
    queryKey: ['fields-all'],
    queryFn: async () => (await apiClient.get('/fields/registry?limit=1000')).data
  });

  const createMapperMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        mapper_name: mapperName,
        source_format: sourceFormat,
        target_format: 'ISO_20022_DICTIONARY',
        mappings: mappings.filter(m => m.source_path && m.target_iso_field)
      };
      const res = await apiClient.post('/mappers/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mappers'] });
      setIsCreating(false);
      setMappings([{ source_path: '', target_iso_field: '', is_mandatory: false }]);
      setMapperName('');
    }
  });

  const handleAddMappingRow = () => {
    setMappings([...mappings, { source_path: '', target_iso_field: '', is_mandatory: false }]);
  };

  return (
    <div className="flex gap-6 h-[750px]">
      
      {/* Left Column: List of Blueprints */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Mapper Blueprints</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configured translation matrices.</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedMapper(null); }}
            className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors"
          >
            + New Blueprint
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoadingMappers ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div>
          ) : mappersData?.mappers?.map((mapper: any) => (
            <div 
              key={mapper.mapper_id} 
              onClick={() => { setSelectedMapper(mapper); setIsCreating(false); }}
              className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedMapper?.mapper_id === mapper.mapper_id ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800">{mapper.mapper_name}</div>
                <div className="text-[10px] font-mono text-[#0176D3] bg-blue-50 px-1.5 py-0.5 rounded">{mapper.source_format}</div>
              </div>
              <div className="text-[11px] text-slate-500">Maps {mapper.mappings?.length || 0} attributes to ISO Registry.</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!isCreating && !selectedMapper && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select a Mapper Blueprint or create a new one.</p>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Design New Payload Mapper</h2>
              <p className="text-xs text-slate-500 mt-1">Translate external schemas into standardized ISO 20022 fields.</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Blueprint Name</label>
                  <input type="text" value={mapperName} onChange={(e) => setMapperName(e.target.value)} placeholder="e.g., SWIFT MT103 to ISO" className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Source Format</label>
                  <select value={sourceFormat} onChange={(e) => setSourceFormat(e.target.value)} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none bg-white">
                    <option value="CSV">CSV Flat File</option>
                    <option value="XML">XML Document</option>
                    <option value="JSON">JSON Payload</option>
                    <option value="DBF">Legacy DBF (Mainframe)</option>
                    <option value="PDF">PDF (Unstructured OCR)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                  <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">Field Translation Matrix</label>
                  <button onClick={handleAddMappingRow} className="text-[#0176D3] text-[11px] font-bold hover:underline">+ Add Row</button>
                </div>
                
                <div className="space-y-3">
                  {mappings.map((mapping, idx) => (
                    <div key={idx} className="flex gap-4 items-center bg-slate-50 p-3 border border-slate-200 rounded">
                      <input type="text" placeholder="Source Path (e.g., '$.amount' or 'LEGACY_BAL')" value={mapping.source_path} onChange={(e) => { const newM = [...mappings]; newM[idx].source_path = e.target.value; setMappings(newM); }} className="flex-1 text-[12px] font-mono border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" />
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                      <select value={mapping.target_iso_field} onChange={(e) => { const newM = [...mappings]; newM[idx].target_iso_field = e.target.value; setMappings(newM); }} className="flex-1 text-[12px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white">
                        <option value="" disabled>Select Target ISO Field...</option>
                        {fieldsData?.fields?.map((f: any) => (
                          <option key={f.technical_sys_name} value={f.technical_sys_name}>{f.preferred_business_name} ({f.technical_sys_name})</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600"><input type="checkbox" checked={mapping.is_mandatory} onChange={(e) => { const newM = [...mappings]; newM[idx].is_mandatory = e.target.checked; setMappings(newM); }} /> Req</label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={createMapperMutation.isPending || !mapperName} onClick={() => createMapperMutation.mutate()} className="px-5 py-2 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">Save Blueprint</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};