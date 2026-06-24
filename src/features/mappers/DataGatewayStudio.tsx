import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';
import { IsoFieldSelector } from '../../components/IsoFieldSelector';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

export const DataGatewayStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeCoreProductId } = usePlatformStore();
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
    <div className="flex flex-col w-full h-[800px]">
      <CockpitLockBanner />
      <InfinityAIHelper studioKey="dge-canvas" />
      <div className={`flex gap-6 flex-1 min-h-0 transition-all duration-300 ${!activeCoreProductId ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
      
      {/* Left Column: List of Blueprints */}
      <div className="w-[400px] glass-card rounded-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Transformation Mappers</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Translation & routing networks</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedMapper(null); }}
            className="bg-indigo-600 hover:bg-indigo-750 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98]"
          >
            + New Mapping
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
                <div className="text-[9px] font-mono text-indigo-650 bg-indigo-50/60 border border-indigo-100/30 px-2 py-0.5 rounded-lg font-bold">{mapper.mapper_id}</div>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Maps {mapper.mappings?.length || 0} attributes to Universal Registry.</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden relative">
        {!isCreating && !selectedMapper && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
            <p className="text-xs font-semibold text-slate-400">Select a Transformation Mapping or create a new one.</p>
          </div>
        )}

        {selectedMapper && !isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right p-6 overflow-y-auto space-y-6">
            <div>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-base font-extrabold text-slate-800 font-display">{selectedMapper.mapper_name}</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Transformation Blueprint Details</p>
                </div>
                <span className="font-mono text-xs text-indigo-650 bg-indigo-50/80 border border-indigo-100/50 px-2.5 py-1 rounded-lg font-bold">{selectedMapper.mapper_id}</span>
              </div>
              
              <div className="grid grid-cols-3 gap-6 mt-6">
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Format</div>
                  <div className="text-xs font-semibold text-slate-700">{selectedMapper.target_format}</div>
                </div>
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bound Template</div>
                  <div className="text-xs font-semibold text-slate-700 font-mono truncate">{selectedMapper.source_template_id || 'Direct Ingestion'}</div>
                </div>
                <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-2xl">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Scope</div>
                  <div className="text-xs font-semibold text-slate-700">{selectedMapper.application_package_id ? 'Package Scope' : 'Global (All Packages)'}</div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-3">Field Translation Matrix</h3>
              <div className="space-y-2.5">
                {selectedMapper.mappings?.map((m: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50/40 border border-slate-100 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-slate-750 bg-white border border-slate-200/50 px-2.5 py-1 rounded-lg shadow-sm">{m.source_extracted_field}</span>
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                      <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50/60 border border-indigo-100/30 px-2.5 py-1 rounded-lg shadow-sm">{m.target_iso_field}</span>
                    </div>
                    <div className="flex gap-2">
                      {m.transformation_rule_code && (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100/50 px-2 py-0.5 rounded-lg">Rule: {m.transformation_rule_code}</span>
                      )}
                      {m.calculation_token_code && (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100/50 px-2 py-0.5 rounded-lg">Calc: {m.calculation_token_code}</span>
                      )}
                      {m.is_mandatory && (
                        <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-100/50 px-2 py-0.5 rounded-lg">Required</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedMapper.file_control_totals && selectedMapper.file_control_totals.length > 0 && (
              <div className="border-t border-slate-100 pt-6">
                <h3 className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-3">Pre-Flight Control Totals</h3>
                <div className="space-y-2">
                  {selectedMapper.file_control_totals.map((ct: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 bg-amber-50/20 border border-amber-200/40 p-3.5 rounded-2xl text-xs">
                      <span className="text-amber-800 font-semibold">Assert SUM of column <code className="font-mono text-rose-600 bg-white px-1.5 py-0.5 rounded border border-amber-100/80">{ct.sum_field}</code> == extracted cell value <code className="font-mono text-indigo-650 bg-white px-1.5 py-0.5 rounded border border-indigo-100/80">{ct.target_cell_field}</code></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-[16px] font-extrabold text-slate-800 font-display">Design Transformation Mapping</h2>
              <p className="text-[11px] text-slate-400 mt-1">Translate extracted File Templates into ISO 20022 schemas using dynamic rules and calculations.</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Blueprint Name</label>
                  <input 
                    type="text" 
                    value={mapperName} 
                    onChange={(e) => setMapperName(e.target.value)} 
                    placeholder="e.g., Tax Invoice Core Mapping" 
                    className="w-full text-[13px] font-semibold text-slate-800 border border-slate-200/80 bg-white/60 backdrop-blur-md rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Bind to File Template (Layout)</label>
                  <select 
                    value={sourceTemplateId} 
                    onChange={(e) => setSourceTemplateId(e.target.value)} 
                    className="w-full text-[13px] text-slate-800 border border-slate-200/80 bg-white/60 backdrop-blur-md rounded-xl p-2.5 focus:border-indigo-500 outline-none font-semibold transition-all shadow-sm"
                  >
                    <option value="" disabled>Select Source File Template...</option>
                    {templatesData?.templates?.map((t: any) => (
                      <option key={t.template_id} value={t.template_id}>{t.template_name} ({t.file_type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Application Scope</label>
                  <select 
                    value={applicationPackageId} 
                    onChange={(e) => setApplicationPackageId(e.target.value)} 
                    className="w-full text-[13px] text-slate-800 border border-slate-200/80 bg-white/60 backdrop-blur-md rounded-xl p-2.5 focus:border-indigo-500 outline-none transition-all shadow-sm"
                  >
                    <option value="">Global (All Packages)</option>
                    {packagesData?.packages?.map((pkg: any) => (
                      <option key={pkg.package_id} value={pkg.package_id}>{pkg.package_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedTemplateObj && (
                <div className="bg-indigo-50/40 border border-indigo-150 p-4.5 rounded-2xl text-xs text-indigo-800 shadow-inner flex items-start gap-3">
                  <svg className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <div className="leading-relaxed">
                    <strong>Template Bound:</strong> This transformation map is linked to <strong>{selectedTemplateObj.template_name}</strong>. The dropdowns below are dynamically populated with the {selectedTemplateObj.fields?.length || 0} fields extracted by that template.
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-3.5 border-b border-slate-100 pb-2.5">
                  <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">Field Translation Matrix</label>
                  <button onClick={handleAddMappingRow} className="text-indigo-600 text-[11px] font-bold hover:underline">+ Add Row</button>
                </div>
                
                <div className="space-y-3">
                  {mappings.map((mapping, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-3 items-center bg-slate-50/30 p-4 border border-slate-150/80 rounded-2xl shadow-sm transition-all hover:bg-slate-50/60">
                      
                      <div className="col-span-3">
                        {selectedTemplateObj ? (
                          <select 
                            value={mapping.source_extracted_field} 
                            onChange={(e) => { const newM = [...mappings]; newM[idx].source_extracted_field = e.target.value; setMappings(newM); }} 
                            className="w-full text-[12px] font-mono text-slate-800 border border-slate-200 bg-white rounded-xl p-2 outline-none focus:border-indigo-500 shadow-sm"
                          >
                            <option value="" disabled>Select Template Field...</option>
                            {selectedTemplateObj.fields?.map((f: any) => (<option key={f.address_id} value={f.extracted_field_name}>{f.extracted_field_name}</option>))}
                          </select>
                        ) : (
                          <input 
                            type="text" 
                            placeholder="Source Extracted Key" 
                            value={mapping.source_extracted_field} 
                            onChange={(e) => { const newM = [...mappings]; newM[idx].source_extracted_field = e.target.value; setMappings(newM); }} 
                            className="w-full text-[12px] font-mono text-slate-850 border border-slate-200 bg-white rounded-xl p-2 outline-none focus:border-indigo-500 shadow-sm" 
                          />
                        )}
                      </div>

                      <div className="col-span-3">
                        <select 
                          value={mapping.transformation_rule_code} 
                          onChange={(e) => { const newM = [...mappings]; newM[idx].transformation_rule_code = e.target.value; setMappings(newM); }} 
                          className="w-full text-[11px] border border-slate-200 bg-white rounded-xl p-2 outline-none focus:border-indigo-500 text-amber-700 font-semibold shadow-sm"
                        >
                          <option value="">No Rule Override</option>
                          {rulesData?.map((r: any) => (<option key={r.token_code} value={r.token_code}>{r.token_code}</option>))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <select 
                          value={mapping.calculation_token_code} 
                          onChange={(e) => { const newM = [...mappings]; newM[idx].calculation_token_code = e.target.value; setMappings(newM); }} 
                          className="w-full text-[11px] border border-slate-200 bg-white rounded-xl p-2 outline-none focus:border-indigo-500 text-emerald-700 font-semibold shadow-sm"
                        >
                          <option value="">No Calculation Logic</option>
                          {calcData?.formulas?.map((c: any) => (<option key={c.token_code} value={c.token_code}>{c.token_code}</option>))}
                        </select>
                      </div>
                      
                      <div className="col-span-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                        <div className="flex-1">
                          <IsoFieldSelector 
                            value={mapping.target_iso_field}
                            onChange={(val) => { const newM = [...mappings]; newM[idx].target_iso_field = val; setMappings(newM); }}
                            placeholder="Select Target ISO Field..."
                          />
                        </div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 select-none cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={mapping.is_mandatory} 
                            onChange={(e) => { const newM = [...mappings]; newM[idx].is_mandatory = e.target.checked; setMappings(newM); }} 
                            className="text-indigo-600 rounded-sm focus:ring-indigo-500" 
                          /> 
                          Req
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-5 border-t border-slate-100">
                  <div className="flex justify-between items-center mb-3.5">
                    <h3 className="text-[12px] font-extrabold text-amber-700 uppercase tracking-wider">Pre-Flight Control Totals Validation</h3>
                    <button onClick={handleAddControlTotal} className="text-amber-600 text-[11px] font-bold hover:underline">+ Add Control Check</button>
                  </div>
                  {controlTotals.map((ct, idx) => (
                    <div key={idx} className="flex gap-4 items-center bg-amber-50/30 p-3 border border-amber-200/50 rounded-2xl mb-2.5 animate-fade-in shadow-inner">
                      <span className="text-[10px] font-bold text-amber-700">Assert SUM of Column:</span>
                      <input 
                        type="text" 
                        placeholder="e.g. txn_amount" 
                        value={ct.sum_field} 
                        onChange={(e) => { const nC = [...controlTotals]; nC[idx].sum_field = e.target.value; setControlTotals(nC); }} 
                        className="w-36 text-[11px] font-mono border border-slate-200 bg-white rounded-xl p-2 outline-none shadow-sm focus:border-amber-500" 
                      />
                      <span className="text-[10px] font-bold text-amber-700">== Extracted CELL value:</span>
                      <input 
                        type="text" 
                        placeholder="e.g. summary_tot" 
                        value={ct.target_cell_field} 
                        onChange={(e) => { const nC = [...controlTotals]; nC[idx].target_cell_field = e.target.value; setControlTotals(nC); }} 
                        className="w-36 text-[11px] font-mono border border-slate-200 bg-white rounded-xl p-2 outline-none shadow-sm focus:border-amber-500" 
                      />
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
                disabled={createMapperMutation.isPending || !mapperName || !sourceTemplateId} 
                onClick={() => createMapperMutation.mutate()} 
                className="px-5 py-2.5 text-[13px] font-bold text-white bg-indigo-600 hover:bg-indigo-750 rounded-xl transition-all shadow-md shadow-indigo-650/15 disabled:opacity-50 active:scale-[0.98]"
              >
                Save Transformation Map
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};