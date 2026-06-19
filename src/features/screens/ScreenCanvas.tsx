import React from 'react';
import { IsoFieldSelector } from '../../components/IsoFieldSelector';

export const ScreenCanvas = ({
  viewMode,
  isReadOnly,
  selectedScreen,
  screenName,
  setScreenName,
  description,
  setDescription,
  templateCategory,
  setTemplateCategory,
  components,
  setComponents,
  pendingApi,
  fieldsData: _fieldsData,
  rulesData,
  handleInputChange,
  handleAddComponentRow,
  handleOpenApiDesigner,
  handleImageUpload,
  aiExtractMutation,
  createScreenMutation,
  setShowApiModal,
  handleBackNavigation,
  setViewMode
}: any) => {
  return (
    <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden relative border-slate-200/60 shadow-glass">
      {viewMode === 'LIST' && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <svg className="w-16 h-16 mb-4 opacity-40 text-slate-350" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path></svg>
          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Select a Screen Template or create a new one.</p>
        </div>
      )}

      {viewMode !== 'LIST' && (
        <div className="flex flex-col h-full animate-fade-in">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button onClick={handleBackNavigation} className="text-slate-400 hover:text-slate-700 p-2 border border-slate-200/80 rounded-xl bg-white shadow-sm transition-all active:scale-[0.95]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg></button>
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-800 tracking-tight font-display flex items-center gap-2">
                  {viewMode === 'CREATE' ? 'Design New Screen' : selectedScreen?.screen_name}
                  {isReadOnly && <span className="bg-slate-100 text-slate-500 border border-slate-200/50 text-[9px] px-2 py-0.5 rounded-lg uppercase tracking-wider font-bold">Read-Only</span>}
                </h2>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5 uppercase tracking-wider">Configure visual forms bound directly to the ISO Registry</p>
              </div>
            </div>
            {!isReadOnly && (
              <div className="flex items-center">
                <input type="file" accept="image/*,application/pdf,.csv,.xls,.xlsx" className="hidden" id="wireframe-upload" onChange={handleImageUpload} />
                <label htmlFor="wireframe-upload" className={`cursor-pointer border px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 active:scale-[0.98] ${aiExtractMutation.isPending ? 'bg-slate-100 text-slate-400 border-slate-200 shadow-none' : 'bg-indigo-50 border-indigo-200/60 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:shadow-indigo-600/10'}`}>
                  {aiExtractMutation.isPending ? 'Analyzing...' : '✨ Auto-Generate from Wireframe or Data'}
                </label>
              </div>
            )}
          </div>

          <div className="p-6 flex-1 overflow-y-auto space-y-6">
            {pendingApi && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 mb-2 animate-fade-in shadow-inner">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wider">Linked API Endpoint</h3>
                  {!isReadOnly && <button onClick={() => setShowApiModal(true)} className="text-indigo-600 text-[11px] font-bold hover:underline">Edit Endpoint ➔</button>}
                </div>
                <table className="w-full text-left text-xs bg-white/60 border border-slate-200/50 rounded-xl overflow-hidden shadow-sm">
                  <thead className="bg-slate-50 text-slate-400 text-[9px] uppercase tracking-wider border-b border-slate-100"><tr><th className="p-3">API Name</th><th className="p-3">Method</th><th className="p-3">URL Template</th><th className="p-3">Commit State</th></tr></thead>
                  <tbody><tr className="text-slate-650"><td className="p-3 font-bold">{pendingApi.api_name}</td><td className="p-3 text-indigo-600 font-bold">{pendingApi.http_method}</td><td className="p-3 font-mono text-xs">{pendingApi.url_template}</td><td className="p-3"><span className="bg-amber-50 text-amber-700 border border-amber-100/50 px-2 py-0.5 rounded-lg font-bold text-[9px]">PENDING COMMIT</span></td></tr></tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-3 gap-6">
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Template Name</label><input disabled={isReadOnly} type="text" value={screenName} onChange={(e) => handleInputChange(setScreenName, e.target.value)} placeholder="e.g., MANAGER_APPROVAL_FORM" className="w-full text-[13px] font-semibold text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none uppercase disabled:bg-slate-50/50 disabled:text-slate-400 bg-white/60" /></div>
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Form Description</label><input disabled={isReadOnly} type="text" value={description} onChange={(e) => handleInputChange(setDescription, e.target.value)} placeholder="A brief summary of when this screen is presented." className="w-full text-[13px] text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none disabled:bg-slate-50/50 disabled:text-slate-400 bg-white/60" /></div>
              <div><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Template Category</label><select disabled={isReadOnly} value={templateCategory} onChange={(e) => handleInputChange(setTemplateCategory, e.target.value)} className="w-full text-[13px] text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 outline-none disabled:bg-slate-50/50 disabled:text-slate-400 bg-white/60"><option value="COMMON_MASTER">Common Master / Static Data</option><option value="BUSINESS_WORKFLOW">Business Workflow</option><option value="PRODUCT_CONFIG">Product Package Config</option></select></div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2.5">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider font-display">UI Component Layout Builder</label>
                <div className="flex gap-4">
                  {!isReadOnly && templateCategory !== 'BUSINESS_WORKFLOW' && <button onClick={handleOpenApiDesigner} className="text-indigo-650 text-[11px] font-bold hover:underline">+ Create API Endpoint</button>}
                  {!isReadOnly && <button onClick={handleAddComponentRow} className="text-indigo-650 text-[11px] font-bold hover:underline">+ Add Component</button>}
                </div>
              </div>

              <div className="space-y-4">
                {components.map((comp: any, idx: number) => (
                  <div key={idx} className={`p-4 border rounded-2xl grid grid-cols-12 gap-3.5 items-center transition-all duration-300 ${isReadOnly ? 'bg-transparent border-slate-100' : 'bg-slate-50/40 border-slate-200/60 shadow-sm'}`}>
                    <div className="col-span-3"><label className="block text-[9px] font-bold text-slate-400 mb-1 tracking-wide uppercase">Component Type</label><select disabled={isReadOnly} value={comp.component_type} onChange={(e) => { const newC = [...components]; newC[idx].component_type = e.target.value; handleInputChange(setComponents, newC); }} className="w-full text-[12px] border border-slate-200 rounded-lg p-2 outline-none disabled:bg-slate-50/55 bg-white"><option value="text_input">Text Input</option><option value="number_input">Number Input</option><option value="dropdown">Dropdown Select</option><option value="date_picker">Date Picker</option><option value="label">Read-Only Label</option></select></div>
                    <div className="col-span-3"><label className="block text-[9px] font-bold text-slate-400 mb-1 tracking-wide uppercase">Label / Title (i18n)</label><input disabled={isReadOnly} type="text" placeholder="e.g., LBL_ACCOUNT_NAME" value={comp.label_token} onChange={(e) => { const newC = [...components]; newC[idx].label_token = e.target.value; handleInputChange(setComponents, newC); }} className="w-full text-[12px] border border-slate-200 rounded-lg p-2 outline-none disabled:bg-slate-55" /></div>
                    <div className="col-span-4"><label className="block text-[9px] font-bold text-slate-400 mb-1 tracking-wide uppercase">Data Binding (ISO Registry)</label><IsoFieldSelector value={comp.field_binding} onChange={(val: string) => { const newC = [...components]; newC[idx].field_binding = val; handleInputChange(setComponents, newC); }} placeholder="Select Backend Bind..." disabled={isReadOnly} /></div>
                    <div className="col-span-2"><label className="block text-[9px] font-bold text-slate-400 mb-1 tracking-wide uppercase">Validation</label><select disabled={isReadOnly} value={comp.requirement_status} onChange={(e) => { const newC = [...components]; newC[idx].requirement_status = e.target.value; handleInputChange(setComponents, newC); }} className="w-full text-[12px] border border-slate-200 rounded-lg p-2 outline-none disabled:bg-slate-50/55 bg-white"><option value="MANDATORY">Required</option><option value="NON_MANDATORY">Optional</option><option value="CONDITIONAL">Conditional</option></select></div>

                    {comp.requirement_status === 'CONDITIONAL' && (
                      <div className="col-span-12 mt-1.5 p-3.5 bg-amber-50/55 border border-amber-100/50 rounded-xl flex items-center gap-3">
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider shrink-0">Condition Rule:</span>
                        <select disabled={isReadOnly} value={comp.conditional_rule_id || ''} onChange={(e) => { const newC = [...components]; newC[idx].conditional_rule_id = e.target.value; handleInputChange(setComponents, newC); }} className="flex-1 text-[12px] border border-amber-200 rounded-lg p-2 outline-none disabled:bg-amber-50 bg-white text-amber-900 font-mono">
                          <option value="" disabled>Select Linked Business Rule Set...</option>
                          {rulesData?.map((r: any) => (<option key={r.token_code} value={r.token_code}>{r.business_name} ({r.token_code})</option>))}
                        </select>
                        {!isReadOnly && (<span className="text-[10px] text-amber-600 font-bold whitespace-nowrap">Requires TRUE Evaluation</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-indigo-50/50 border border-indigo-100/60 rounded-2xl p-4.5 flex items-start gap-3.5 shadow-sm">
              <svg className="w-5 h-5 text-indigo-650 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <div className="text-[12px] text-indigo-750 font-medium leading-relaxed"><strong>Data Synchronization Notice:</strong> Fields marked as "Required" will automatically block progression in the Workflow Engine until a valid ISO mapping is supplied by the user.</div>
            </div>
          </div>

          <div className="p-4.5 border-t border-slate-150 bg-slate-50/50 flex justify-end gap-3 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.03)]">
            {viewMode === 'VIEW' && !isReadOnly && (<button onClick={() => setViewMode('EDIT')} className="px-5 py-2.5 text-[13px] font-bold text-white bg-slate-850 hover:bg-slate-950 rounded-xl transition-all shadow-md shadow-slate-850/10 active:scale-[0.98]">Edit Blueprint</button>)}
            {!isReadOnly && viewMode !== 'VIEW' && (
              <>
                <button onClick={handleBackNavigation} className="px-5 py-2.5 text-[13px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-slate-750 transition-all active:scale-[0.98]">Cancel</button>
                <button disabled={createScreenMutation.isPending || !screenName} onClick={() => createScreenMutation.mutate()} className="px-5 py-2.5 text-[13px] font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl hover:from-indigo-750 hover:to-indigo-800 transition-all shadow-md shadow-indigo-600/10 active:scale-[0.98] disabled:opacity-50">
                  {createScreenMutation.isPending ? 'Saving...' : 'Save & Submit for Approval'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};