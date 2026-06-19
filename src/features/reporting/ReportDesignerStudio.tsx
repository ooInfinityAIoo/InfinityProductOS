import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';
import { IsoFieldSelector } from '../../components/IsoFieldSelector';

export const ReportDesignerStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeCoreProductId } = usePlatformStore();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // --- Form State ---
  const [reportName, setReportName] = useState('');
  const [description, setDescription] = useState('');
  const [isThirdPartyEmbedded, setIsThirdPartyEmbedded] = useState(false);
  const [thirdPartyEmbedUrl, setThirdPartyEmbedUrl] = useState('');
  const [exposeAsHeadlessApi, setExposeAsHeadlessApi] = useState(false);
  const [applicationPackageId, setApplicationPackageId] = useState('');
  const [widgets, setWidgets] = useState<any[]>([]);

  // --- DYNAMIC DATA BINDINGS ---
  const { data: reportsData, isLoading: isLoadingReports } = useQuery({
    queryKey: ['reports'],
    queryFn: async () => (await apiClient.get('/reporting/')).data
  });

  const { data: calcData } = useQuery({
    queryKey: ['calculations'],
    queryFn: async () => (await apiClient.get('/calculations/')).data
  });

  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });

  // --- MUTATION ---
  const saveReportMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        report_name: reportName,
        description,
        is_third_party_embedded: isThirdPartyEmbedded,
        third_party_embed_url: isThirdPartyEmbedded ? thirdPartyEmbedUrl : null,
        expose_as_headless_api: exposeAsHeadlessApi,
        application_package_id: applicationPackageId || null,
        widgets: isThirdPartyEmbedded ? [] : widgets.map((w, i) => ({
          ...w,
          grid_layout: { x: 0, y: i, w: 12, h: 4 } // Simplified vertical layout grid for MVP
        }))
      };
      return (await apiClient.post('/reporting/', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setIsCreating(false);
      resetForm();
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Save failed.")
  });

  // --- AI VISION EXTRACTION MUTATION ---
  const aiExtractMutation = useMutation({
    mutationFn: async (payload: { image_base64: string, image_mime_type: string }) => {
      const res = await apiClient.post('/assistant/image-to-report', payload);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.generated_report_blueprint) {
        setReportName(data.generated_report_blueprint.report_name);
        setDescription(data.generated_report_blueprint.description);
        setWidgets(data.generated_report_blueprint.widgets || []);
        setIsThirdPartyEmbedded(false);
        setExposeAsHeadlessApi(false);
      }
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to process image.");
    }
  });

  const resetForm = () => {
    setReportName('');
    setDescription('');
    setIsThirdPartyEmbedded(false);
    setThirdPartyEmbedUrl('');
    setExposeAsHeadlessApi(false);
    setApplicationPackageId('');
    setWidgets([]);
  };

  const handleAddWidget = () => {
    setWidgets([...widgets, {
      widget_id: `WGT-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      chart_type: 'BAR_CHART',
      title: 'New Chart Widget',
      data_source_entity: 'EvidencePacketRegistry',
      x_axis_field: '',
      y_axis_field: '',
      aggregation_method: 'COUNT'
    }]);
  };

  const updateWidget = (idx: number, key: string, value: any) => {
    const updated = [...widgets];
    updated[idx][key] = value;
    setWidgets(updated);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = (event.target?.result as string).split(',')[1];
      const mimeType = file.type || (file.name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream');
      aiExtractMutation.mutate({ image_base64: base64String, image_mime_type: mimeType });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col w-full h-[800px] animate-fade-in">
      <CockpitLockBanner />
      <div className={`flex gap-6 flex-1 min-h-0 transition-all duration-300 ${!activeCoreProductId ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
      {/* Left Column: List of Reports */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Report Blueprints</h2>
            <p className="text-xs text-slate-500 mt-0.5">BI Dashboards and Datasets.</p>
          </div>
          <button onClick={() => { setIsCreating(true); setSelectedReport(null); resetForm(); }} className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors">
            + New Report
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoadingReports ? <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div> : reportsData?.reports?.map((rpt: any) => (
            <div key={rpt.report_id} onClick={() => { setSelectedReport(rpt); setIsCreating(false); }} className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedReport?.report_id === rpt.report_id ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}>
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800">{rpt.report_name}</div>
                <div className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold border ${rpt.is_third_party_embedded ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                  {rpt.is_third_party_embedded ? 'EMBEDDED BI' : 'NATIVE WIDGETS'}
                </div>
              </div>
              <div className="text-[11px] text-slate-500 line-clamp-1">{rpt.description || 'No description.'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canva Designer */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!isCreating && !selectedReport && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select a report to view or create a new one.</p>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Design Interactive Dashboard</h2>
              <div className="flex justify-between items-center w-full mt-1">
                <p className="text-xs text-slate-500">Build native charts via ISO fields or embed your corporate Power BI reports securely.</p>
                <div className="flex items-center">
                  <input type="file" accept="image/*,application/pdf,.csv,.xls,.xlsx" className="hidden" id="report-upload" onChange={handleImageUpload} />
                  <label htmlFor="report-upload" className={`cursor-pointer border px-4 py-2 rounded text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 ${aiExtractMutation.isPending ? 'bg-slate-200 text-slate-500 border-slate-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white'}`}>
                    {aiExtractMutation.isPending ? 'Analyzing...' : '✨ Auto-Generate from Mockup or Data'}
                  </label>
                </div>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Global Config */}
              <div className="grid grid-cols-3 gap-6">
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Dashboard Name</label><input type="text" value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="e.g., Executive Settlement Overview" className="w-full text-[13px] font-semibold border border-slate-300 rounded p-2.5 outline-none focus:border-[#0176D3]" /></div>
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Description</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Daily volume metrics." className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none focus:border-[#0176D3]" /></div>
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Application Scope</label><select value={applicationPackageId} onChange={(e) => setApplicationPackageId(e.target.value)} className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none focus:border-[#0176D3] bg-white"><option value="">Global (All Packages)</option>{packagesData?.packages?.map((pkg: any) => (<option key={pkg.package_id} value={pkg.package_id}>{pkg.package_name}</option>))}</select></div>
              </div>

              {/* Mode Toggle */}
              <div className="flex gap-4 p-1 bg-slate-100 rounded-lg inline-flex">
                <button onClick={() => setIsThirdPartyEmbedded(false)} className={`px-4 py-2 text-[12px] font-bold rounded-md transition-all ${!isThirdPartyEmbedded ? 'bg-white shadow text-[#0176D3]' : 'text-slate-500 hover:text-slate-700'}`}>🎨 Native Infinity Widgets</button>
                <button onClick={() => setIsThirdPartyEmbedded(true)} className={`px-4 py-2 text-[12px] font-bold rounded-md transition-all ${isThirdPartyEmbedded ? 'bg-white shadow text-purple-700' : 'text-slate-500 hover:text-slate-700'}`}>🔗 Third-Party Embed (Power BI/Cognos)</button>
              </div>

              {/* Mode: Embedded BI */}
              {isThirdPartyEmbedded ? (
                <div className="bg-purple-50 border border-purple-200 rounded p-6">
                  <label className="block text-[12px] font-bold text-purple-800 uppercase mb-2 flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg> Secure iframe Embed URL</label>
                  <input type="text" value={thirdPartyEmbedUrl} onChange={(e) => setThirdPartyEmbedUrl(e.target.value)} placeholder="https://app.powerbi.com/reportEmbed?reportId=..." className="w-full text-[13px] font-mono border border-purple-300 rounded p-3 outline-none focus:border-purple-500 bg-white" />
                  <p className="text-[11px] text-purple-600 mt-2">Infinity ProductOS will automatically append the current user's secure JWT token for row-level security masking when rendering this iframe.</p>
                </div>
              ) : (
                /* Mode: Native Widgets */
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <h3 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-wider">Dashboard Widgets</h3>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" checked={exposeAsHeadlessApi} onChange={(e) => setExposeAsHeadlessApi(e.target.checked)} className="w-3 h-3 text-[#0176D3]" /> Expose as Headless OData API</label>
                      <button onClick={handleAddWidget} className="text-[#0176D3] text-[11px] font-bold hover:underline">+ Add Widget</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {widgets.map((widget, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded p-4 relative shadow-sm">
                        <button onClick={() => setWidgets(widgets.filter((_, i) => i !== idx))} className="absolute top-3 right-3 text-slate-400 hover:text-red-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                        
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div><label className="block text-[10px] font-bold text-slate-500 mb-1">Widget Title</label><input type="text" value={widget.title} onChange={(e) => updateWidget(idx, 'title', e.target.value)} placeholder="e.g., Total Volume" className="w-full text-[12px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3]" /></div>
                          <div><label className="block text-[10px] font-bold text-slate-500 mb-1">Chart Type</label><select value={widget.chart_type} onChange={(e) => updateWidget(idx, 'chart_type', e.target.value)} className="w-full text-[12px] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white"><option value="BAR_CHART">Bar Chart</option><option value="PIE_CHART">Pie Chart</option><option value="LINE_CHART">Line Chart</option><option value="KPI_CARD">KPI Card</option><option value="DATA_GRID">Data Grid</option></select></div>
                        </div>

                        <div className="mb-3">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Source Table / Event Stream</label>
                          <select value={widget.data_source_entity} onChange={(e) => updateWidget(idx, 'data_source_entity', e.target.value)} className="w-full text-[12px] font-mono text-[#0176D3] border border-slate-300 rounded p-2 outline-none focus:border-[#0176D3] bg-white"><option value="EvidencePacketRegistry">EvidencePacketRegistry (Financial Ledger)</option><option value="UserInteractionEvent">UserInteractionEvent (Telemetry)</option></select>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">X-Axis (Group By)</label>
                            <IsoFieldSelector 
                              value={widget.x_axis_field}
                              onChange={(val) => updateWidget(idx, 'x_axis_field', val)}
                              placeholder="Select X-Axis Field..."
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Y-Axis (Measure)</label>
                            <IsoFieldSelector 
                              value={widget.y_axis_field}
                              onChange={(val) => updateWidget(idx, 'y_axis_field', val)}
                              placeholder="Select Y-Axis Field..."
                            />
                          </div>
                        </div>

                        <div className="mt-3">
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">Aggregation Math (Left Brain Link)</label>
                          <select value={widget.aggregation_method} onChange={(e) => updateWidget(idx, 'aggregation_method', e.target.value)} className="w-full text-[11px] font-mono text-emerald-600 border border-slate-300 rounded p-1.5 outline-none bg-white"><option value="COUNT">SQL: COUNT()</option><option value="SUM">SQL: SUM()</option><option value="AVG">SQL: AVG()</option><optgroup label="Custom Calc Engine Formulas">{calcData?.formulas?.map((f: any) => (<option key={f.token_code} value={f.token_code}>{f.token_code}</option>))}</optgroup></select>
                        </div>
                      </div>
                    ))}
                    {widgets.length === 0 && <div className="col-span-2 text-center text-slate-400 italic text-xs py-8 border-2 border-dashed border-slate-200 rounded">No widgets added. Drag ISO fields here to build charts.</div>}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={saveReportMutation.isPending || !reportName} onClick={() => saveReportMutation.mutate()} className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">
                {saveReportMutation.isPending ? 'Saving...' : 'Deploy Dashboard Blueprint'}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};