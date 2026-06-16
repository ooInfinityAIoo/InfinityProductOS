import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const FileTemplateDesignerStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  // Form State
  const [templateName, setTemplateName] = useState('');
  const [templateType, setTemplateType] = useState('UPLOAD');
  const [fileType, setFileType] = useState('CSV');
  const [extractionMode, setExtractionMode] = useState('STRUCTURED');
  const [delimiter, setDelimiter] = useState(',');
  
  const [fields, setFields] = useState([{ extracted_field_name: '', reading_mode: 'COLUMN', cell_address_or_prompt: '' }]);
  const [filePreview, setFilePreview] = useState<{headers: string[], sample_row: string[], rawSuggestions: any[]} | null>(null);

  // --- DYNAMIC API BINDINGS ---
  
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await apiClient.get('/templates/')).data
  });

  const { data: isoFieldsData } = useQuery({
    queryKey: ['fields-all'],
    queryFn: async () => (await apiClient.get('/fields/registry?limit=1000')).data
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        template_name: templateName,
        template_type: templateType,
        file_type: fileType,
        extraction_mode: extractionMode,
        is_multi_sheet: false,
        file_has_header_footer: 'NONE',
        delimiter_record_separator: delimiter,
        fields: fields.filter(f => f.extracted_field_name && f.cell_address_or_prompt)
      };
      return (await apiClient.post('/templates/', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setIsCreating(false);
      setFields([{ extracted_field_name: '', reading_mode: 'COLUMN', cell_address_or_prompt: '' }]);
      setFilePreview(null);
      setTemplateName('');
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Save failed.")
  });

  // --- AI AGENTIC AUTO-MAPPING (Step A) ---
  const autoMapMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return (await apiClient.post('/assistant/auto-map-file', formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
    },
    onSuccess: (data) => {
      setFilePreview({
        headers: data.headers || [],
        sample_row: data.sample_row || [],
        rawSuggestions: data.suggested_mappings || []
      });
      const newFields = data.suggested_mappings.map((m: any) => ({
        extracted_field_name: m.suggested_iso_field || '', 
        reading_mode: 'COLUMN', 
        cell_address_or_prompt: m.source_path,
        is_new_field_required: m.is_new_field_required, 
        inferred_data_type: m.inferred_data_type
      }));
      setFields(newFields);
      setFileType(data.file_type);
      setExtractionMode('STRUCTURED');
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Auto-mapping failed.")
  });

  // --- 1-CLICK ISO REGISTRY ONBOARDING ---
  const createQuickFieldMutation = useMutation({
    mutationFn: async (fieldData: { technical_sys_name: string, preferred_business_name: string, data_type: string }) => {
      const payload = { ...fieldData, iso_business_name: fieldData.preferred_business_name, domain_category: 'Auto-Ingested', is_pii: false };
      return (await apiClient.post('/fields/registry/', payload)).data;
    },
    onSuccess: (data, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['fields-all'] });
      const newF = [...fields];
      if (variables.idx !== undefined) {
        newF[variables.idx].extracted_field_name = data.technical_sys_name;
        (newF[variables.idx] as any).is_new_field_required = false;
      }
      setFields(newF);
    }
  });

  const handleAddFieldRow = () => {
    setFields([...fields, { extracted_field_name: '', reading_mode: extractionMode === 'AGENTIC_PROMPT' ? 'PROMPT' : 'COLUMN', cell_address_or_prompt: '' }]);
  };

  return (
    <div className="flex gap-6 h-[750px] animate-fade-in">
      {/* Left Column: List of Templates */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">File Templates</h2>
            <p className="text-xs text-slate-500 mt-0.5">Physical layouts and AI Prompts.</p>
          </div>
          <button onClick={() => { setIsCreating(true); setSelectedTemplate(null); }} className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors">
            + New Template
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div>
          ) : templatesData?.templates?.map((tpl: any) => (
            <div key={tpl.template_id} onClick={() => { setSelectedTemplate(tpl); setIsCreating(false); }} className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedTemplate?.template_id === tpl.template_id ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}>
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800">{tpl.template_name}</div>
                <div className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${tpl.template_type === 'UPLOAD' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>{tpl.template_type}</div>
              </div>
              <div className="text-[11px] text-slate-500">Format: {tpl.file_type} | Extractor: {tpl.extraction_mode}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!isCreating && !selectedTemplate && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select a File Template or create a new one.</p>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Design File Extraction Template</h2>
              <div className="flex justify-between items-center w-full mt-1">
                <p className="text-xs text-slate-500">Define how data is physically extracted from files into standardized ISO keys.</p>
                <div className="flex items-center">
                  <input type="file" accept=".csv,.xls,.xlsx,.pdf,.docx" className="hidden" id="automap-upload" onChange={(e) => { if (e.target.files?.[0]) autoMapMutation.mutate(e.target.files[0]); }} />
                  <label htmlFor="automap-upload" className={`cursor-pointer border px-4 py-2 rounded text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 ${autoMapMutation.isPending ? 'bg-slate-200 text-slate-500 border-slate-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white'}`}>
                    {autoMapMutation.isPending ? 'Analyzing...' : '✨ AI Auto-Map Layout'}
                  </label>
                </div>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2"><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Template Name</label><input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g., Q3 Vendor Invoice PDF" className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] outline-none" /></div>
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Direction</label><select value={templateType} onChange={(e) => setTemplateType(e.target.value)} className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none bg-white"><option value="UPLOAD">UPLOAD (Ingest)</option><option value="DOWNLOAD">DOWNLOAD (Export)</option></select></div>
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Format</label><select value={fileType} onChange={(e) => setFileType(e.target.value)} className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none bg-white"><option value="CSV">CSV</option><option value="XLSX">Excel</option><option value="PDF">PDF / Word</option><option value="TXT">Fixed-Length TXT</option></select></div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-200 rounded">
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Extraction Strategy</label><select value={extractionMode} onChange={(e) => setExtractionMode(e.target.value)} className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none bg-white"><option value="STRUCTURED">Structured Columns/Cells</option><option value="AGENTIC_PROMPT">Agentic NLP Prompts</option></select></div>
                {extractionMode === 'STRUCTURED' && fileType === 'CSV' && (
                  <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Delimiter</label><input type="text" value={delimiter} onChange={(e) => setDelimiter(e.target.value)} className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none bg-white" /></div>
                )}
              </div>

              {filePreview && filePreview.headers.length > 0 && (
                <div className="bg-white border border-[#0176D3] rounded p-4 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[12px] font-extrabold text-[#0176D3] uppercase tracking-wider">Interactive Layout Selector</h3>
                    <p className="text-[10px] text-slate-500 font-semibold">Click a column header to toggle inclusion.</p>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {filePreview.headers.map((header, idx) => {
                      const isIncluded = fields.some(f => f.cell_address_or_prompt === header);
                      return (
                        <div key={idx} onClick={() => {
                            if (isIncluded) setFields(fields.filter(f => f.cell_address_or_prompt !== header));
                            else {
                              const sug = filePreview.rawSuggestions.find(s => s.source_path === header);
                              setFields([...fields, { extracted_field_name: sug?.suggested_iso_field || '', reading_mode: 'COLUMN', cell_address_or_prompt: header, is_new_field_required: sug?.is_new_field_required, inferred_data_type: sug?.inferred_data_type } as any]);
                            }
                          }} className={`flex-shrink-0 w-40 p-3 rounded cursor-pointer border transition-colors ${isIncluded ? 'bg-[#EEF2FF] border-[#0176D3]' : 'bg-white border-slate-200 opacity-60'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-[11px] font-bold text-slate-800 truncate">{header}</div>
                            <input type="checkbox" checked={isIncluded} readOnly className="w-3 h-3 text-[#0176D3]" />
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 truncate">{filePreview.sample_row[idx]}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                  <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">Field Extraction Targets</label>
                  <button onClick={handleAddFieldRow} className="text-[#0176D3] text-[11px] font-bold hover:underline">+ Add Field Target</button>
                </div>
                
                <div className="space-y-3">
                  {fields.map((field, idx) => (
                    <div key={idx} className={`flex gap-3 items-center p-3 border rounded ${extractionMode === 'AGENTIC_PROMPT' ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-200'}`}>
                      <select value={field.reading_mode} onChange={(e) => { const nF = [...fields]; nF[idx].reading_mode = e.target.value; setFields(nF); }} className={`w-28 text-[11px] font-bold border rounded p-2 outline-none bg-white ${extractionMode === 'AGENTIC_PROMPT' ? 'text-indigo-600 border-indigo-300' : 'text-[#0176D3] border-slate-300'}`}>
                        {extractionMode === 'AGENTIC_PROMPT' ? <option value="PROMPT">AI PROMPT</option> : <><option value="COLUMN">COLUMN</option><option value="CELL">CELL</option></>}
                      </select>
                      
                      <input type="text" placeholder={extractionMode === 'AGENTIC_PROMPT' ? "e.g., Extract the total tax amount" : "Column Header or Cell (e.g. B2)"} value={field.cell_address_or_prompt} onChange={(e) => { const nF = [...fields]; nF[idx].cell_address_or_prompt = e.target.value; setFields(nF); }} className="flex-1 text-[12px] font-mono border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" />
                      
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                      
                      <div className="flex items-center gap-2">
                        <select value={field.extracted_field_name} onChange={(e) => { const nF = [...fields]; nF[idx].extracted_field_name = e.target.value; setFields(nF); }} className={`w-64 text-[11px] border rounded p-2 outline-none bg-white font-mono ${field.extracted_field_name ? 'text-emerald-700 border-emerald-300' : 'text-slate-500 border-slate-300'}`}>
                          <option value="" disabled>Output to ISO Field Key...</option>
                          {isoFieldsData?.fields?.map((f: any) => (<option key={f.technical_sys_name} value={f.technical_sys_name}>{f.technical_sys_name}</option>))}
                        </select>
                        {(field as any).is_new_field_required || (!field.extracted_field_name && field.cell_address_or_prompt) ? (
                          <button onClick={() => createQuickFieldMutation.mutate({ idx, technical_sys_name: `auto_${field.cell_address_or_prompt.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Math.floor(Math.random()*1000)}`, preferred_business_name: field.cell_address_or_prompt, data_type: (field as any).inferred_data_type || 'Text' } as any)} className="px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded text-[9px] font-bold hover:bg-emerald-100 transition-colors whitespace-nowrap">+ Quick Add ISO</button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={createTemplateMutation.isPending || !templateName} onClick={() => createTemplateMutation.mutate()} className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">Save Template Layout</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};