import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const DataGatewayStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedMapper, setSelectedMapper] = useState<any>(null);

  // Form State
  const [mapperName, setMapperName] = useState('');
  const [sourceTemplateId, setSourceTemplateId] = useState('');
  const [mappings, setMappings] = useState([{ source_extracted_field: '', target_iso_field: '', transformation_rule_code: '', calculation_token_code: '', is_mandatory: false }]);
  const [controlTotals, setControlTotals] = useState<any[]>([]);
  const [applicationPackageId, setApplicationPackageId] = useState('');

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

  // 3. Fetch File Layout Templates (Step A/B Integration)
  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await apiClient.get('/templates/')).data
  });

  // 4. Fetch Business Rules (For logic injection)
  const { data: rulesData } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => (await apiClient.get('/rules/')).data
  });

  // 5. Fetch Calculation Formulas (For logic injection)
  const { data: calcData } = useQuery({
    queryKey: ['calculations'],
    queryFn: async () => (await apiClient.get('/calculations/')).data
  });

  // 6. Fetch Application Packages for Scoping
  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });

  // UX Helper: Extract the field keys from the currently selected Template
  const selectedTemplateObj = useMemo(() => {
    if (!sourceTemplateId || !templatesData?.templates) return null;
    return templatesData.templates.find((t: any) => t.template_id === sourceTemplateId);
  }, [sourceTemplateId, templatesData]);

  const createMapperMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        mapper_name: mapperName,
        source_template_id: sourceTemplateId || null,
        target_format: 'ISO_20022_DICTIONARY',
        file_control_totals: controlTotals.length > 0 ? controlTotals : null,
        mappings: mappings.filter(m => m.source_extracted_field && m.target_iso_field).map(m => ({
          ...m,
          transformation_rule_code: m.transformation_rule_code || null,
          calculation_token_code: m.calculation_token_code || null
        })),
        application_package_id: applicationPackageId || null,
      };
      const res = await apiClient.post('/mappers/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mappers'] });
      setIsCreating(false);
      setMappings([{ source_extracted_field: '', target_iso_field: '', transformation_rule_code: '', calculation_token_code: '', is_mandatory: false }]);
      setControlTotals([]);
      setMapperName('');
      setSourceTemplateId('');
      setApplicationPackageId('');
    }
  });

  const handleAddMappingRow = () => {
    setMappings([...mappings, { source_extracted_field: '', target_iso_field: '', transformation_rule_code: '', calculation_token_code: '', is_mandatory: false }]);
  };

  const handleAddControlTotal = () => {
    setControlTotals([...controlTotals, { sum_field: '', target_cell_field: '' }]);
  };

  return (
    <div className="flex gap-6 h-[750px]">
      
      {/* Left Column: List of Blueprints */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Transformation Mappers</h2>
            <p className="text-xs text-slate-500 mt-0.5">Logical translation and routing networks.</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedMapper(null); }}
            className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors"
          >
            + New Mapping
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
                <div className="text-[10px] font-mono text-[#0176D3] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{mapper.mapper_id}</div>
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
            <p className="text-sm font-semibold text-slate-500">Select a Transformation Mapping or create a new one.</p>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Design Transformation Mapping</h2>
              <div className="flex justify-between items-center w-full mt-1">
                <p className="text-xs text-slate-500">Translate extracted File Templates into ISO 20022 schemas using dynamic rules and calculations.</p>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Blueprint Name</label>
                  <input type="text" value={mapperName} onChange={(e) => setMapperName(e.target.value)} placeholder="e.g., Tax Invoice Core Mapping" className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Bind to File Template (Layout)</label>
                  <select value={sourceTemplateId} onChange={(e) => setSourceTemplateId(e.target.value)} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] outline-none bg-white font-bold">
                    <option value="" disabled>Select Source File Template...</option>
                    {templatesData?.templates?.map((t: any) => (
                      <option key={t.template_id} value={t.template_id}>{t.template_name} ({t.file_type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Application Scope</label>
                  <select value={applicationPackageId} onChange={(e) => setApplicationPackageId(e.target.value)} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] outline-none bg-white">
                    <option value="">Global (All Packages)</option>
                    {packagesData?.packages?.map((pkg: any) => (
                      <option key={pkg.package_id} value={pkg.package_id}>{pkg.package_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedTemplateObj && (
                <div className="bg-[#EEF2FF] border border-indigo-200 p-4 rounded text-sm text-indigo-800 shadow-sm flex items-start gap-3">
                  <svg className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <div>
                    <strong>Template Bound:</strong> This transformation map is linked to <strong>{selectedTemplateObj.template_name}</strong>. The dropdowns below are dynamically populated with the {selectedTemplateObj.fields?.length || 0} fields extracted by that template.
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                  <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">Field Translation Matrix</label>
                  <button onClick={handleAddMappingRow} className="text-[#0176D3] text-[11px] font-bold hover:underline">+ Add Row</button>
                </div>
                
                <div className="space-y-3">
                  {mappings.map((mapping, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-3 items-center bg-slate-50 p-3 border border-slate-200 rounded">
                      
                      <div className="col-span-3">
                        {selectedTemplateObj ? (
                          <select value={mapping.source_extracted_field} onChange={(e) => { const newM = [...mappings]; newM[idx].source_extracted_field = e.target.value; setMappings(newM); }} className="w-full text-[12px] font-mono text-slate-800 border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white">
                            <option value="" disabled>Select Template Field...</option>
                            {selectedTemplateObj.fields?.map((f: any) => (<option key={f.address_id} value={f.extracted_field_name}>{f.extracted_field_name}</option>))}
                          </select>
                        ) : (
                          <input type="text" placeholder="Source Extracted Key" value={mapping.source_extracted_field} onChange={(e) => { const newM = [...mappings]; newM[idx].source_extracted_field = e.target.value; setMappings(newM); }} className="w-full text-[12px] font-mono text-slate-800 border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" />
                      )}
                      </div>

                      <div className="col-span-3">
                        <select value={mapping.transformation_rule_code} onChange={(e) => { const newM = [...mappings]; newM[idx].transformation_rule_code = e.target.value; setMappings(newM); }} className="w-full text-[11px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white text-amber-700">
                          <option value="">No Rule Engine Override</option>
                          {rulesData?.map((r: any) => (<option key={r.token_code} value={r.token_code}>{r.token_code}</option>))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <select value={mapping.calculation_token_code} onChange={(e) => { const newM = [...mappings]; newM[idx].calculation_token_code = e.target.value; setMappings(newM); }} className="w-full text-[11px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white text-emerald-700">
                          <option value="">No Calculation Logic</option>
                          {calcData?.formulas?.map((c: any) => (<option key={c.token_code} value={c.token_code}>{c.token_code}</option>))}
                        </select>
                      </div>
                      
                      <div className="col-span-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                        <select value={mapping.target_iso_field} onChange={(e) => { const newM = [...mappings]; newM[idx].target_iso_field = e.target.value; setMappings(newM); }} className="flex-1 text-[11px] font-bold text-[#0176D3] border border-[#0176D3] rounded p-2 outline-none bg-blue-50">
                          <option value="" disabled>Select Target ISO Field...</option>
                          {fieldsData?.fields?.map((f: any) => (
                            <option key={f.technical_sys_name} value={f.technical_sys_name}>{f.preferred_business_name} ({f.technical_sys_name})</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={mapping.is_mandatory} onChange={(e) => { const newM = [...mappings]; newM[idx].is_mandatory = e.target.checked; setMappings(newM); }} /> Req</label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-200">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[12px] font-extrabold text-amber-600 uppercase tracking-wider">Pre-Flight Control Totals Validation</h3>
                    <button onClick={handleAddControlTotal} className="text-amber-600 text-[11px] font-bold hover:underline">+ Add Control Check</button>
                  </div>
                  {controlTotals.map((ct, idx) => (
                    <div key={idx} className="flex gap-4 items-center bg-amber-50 p-2 border border-amber-200 rounded mb-2">
                      <span className="text-[10px] font-bold text-amber-700">Assert SUM of Column:</span>
                      <input type="text" placeholder="e.g. txn_amount" value={ct.sum_field} onChange={(e) => { const nC = [...controlTotals]; nC[idx].sum_field = e.target.value; setControlTotals(nC); }} className="w-32 text-[11px] font-mono border border-slate-300 rounded p-1.5 outline-none" />
                      <span className="text-[10px] font-bold text-amber-700">== Extracted CELL value:</span>
                      <input type="text" placeholder="e.g. summary_tot" value={ct.target_cell_field} onChange={(e) => { const nC = [...controlTotals]; nC[idx].target_cell_field = e.target.value; setControlTotals(nC); }} className="w-32 text-[11px] font-mono border border-slate-300 rounded p-1.5 outline-none" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={createMapperMutation.isPending || !mapperName || !sourceTemplateId} onClick={() => createMapperMutation.mutate()} className="px-5 py-2 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">Save Transformation Map</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};