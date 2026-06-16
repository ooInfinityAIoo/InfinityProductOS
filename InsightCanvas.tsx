import React from 'react';

export const InsightCanvas = ({
  isCreating,
  setIsCreating,
  selectedInsight,
  insightName,
  setInsightName,
  insightCode,
  setInsightCode,
  description,
  setDescription,
  triggerType,
  setTriggerType,
  triggerEvent,
  setTriggerEvent,
  triggerCron,
  setTriggerCron,
  dashboardCategory,
  setDashboardCategory,
  applicableRoles,
  toggleRole,
  applicationPackageId,
  setApplicationPackageId,
  packagesData,
  analysisSteps,
  handleAddStep,
  handleStepChange,
  rulesData,
  calcData,
  apiData,
  eventTypes,
  createInsightMutation
}: any) => {
  return (
    <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
      {!isCreating && !selectedInsight && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
          <p className="text-sm font-semibold text-slate-500">Select an Insight Definition or design a new one.</p>
        </div>
      )}

      {isCreating && (
        <div className="flex flex-col h-full animate-slide-in-right">
          <div className="p-6 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">Design Analytical Insight</h2>
            <p className="text-xs text-slate-500 mt-1">Configure proactive smart-widgets and background anomaly detectors.</p>
          </div>
          
          <div className="p-6 flex-1 overflow-y-auto space-y-6">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Insight Name</label>
                <input type="text" value={insightName} onChange={(e) => setInsightName(e.target.value)} placeholder="e.g., Duplicate Subscription Detector" className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] outline-none" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Insight Token Code</label>
                <input type="text" value={insightCode} onChange={(e) => setInsightCode(e.target.value.toUpperCase())} placeholder="e.g., INSIGHT-SUB-001" className="w-full text-[13px] font-mono text-[#0176D3] border border-slate-300 rounded p-2.5 focus:border-[#0176D3] outline-none uppercase" />
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

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Business Purpose</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this insight detect and why is it valuable?" className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] outline-none" />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded p-5 space-y-4">
              <h3 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">Trigger & Execution Strategy</h3>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Trigger Condition</label>
                  <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="w-full text-[13px] font-bold text-slate-900 border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none bg-white">
                    <option value="EVENT">Event Driven (Reactive)</option>
                    <option value="SCHEDULED">Scheduled Interval (Cron)</option>
                  </select>
                </div>
                
                {triggerType === 'EVENT' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target System Event</label>
                    <input type="text" list="event-types-list" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)} placeholder="e.g., NEW_TRANSACTION" className="w-full font-mono text-[13px] text-[#0176D3] border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none bg-white" />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Cron Schedule</label>
                    <input type="text" value={triggerCron} onChange={(e) => setTriggerCron(e.target.value)} placeholder="0 0 * * 0" className="w-full font-mono text-[13px] text-[#0176D3] border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none" />
                  </div>
                )}
              </div>
            </div>

            <div className="border border-slate-200 rounded p-5">
              <h3 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2 mb-4">Presentation Layer</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Dashboard</label>
                  <select value={dashboardCategory} onChange={(e) => setDashboardCategory(e.target.value)} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none bg-white">
                    <option value="GLOBAL">Global / Home</option>
                    <option value="360_BUSINESS">Product: 360° Business View</option>
                    <option value="TECHNICAL">Product: Technical & API View</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Visible to Roles</label>
                  <div className="flex gap-3">
                    {['ADMIN', 'SALES', 'RISK', 'C_LEVEL'].map(role => (
                      <label key={role} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 cursor-pointer">
                        <input type="checkbox" checked={applicableRoles.includes(role)} onChange={() => toggleRole(role)} className="w-3 h-3 text-[#0176D3] rounded focus:ring-[#0176D3]" />
                        {role}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">Analysis Orchestration Logic</label>
                <button onClick={handleAddStep} className="text-[#0176D3] text-[11px] font-bold hover:underline">+ Add Analysis Step</button>
              </div>
              
              <div className="space-y-3">
                {analysisSteps.length === 0 && <p className="text-[11px] text-slate-400 italic">Add logic steps (Rules, Math, APIs) to evaluate data when this insight triggers.</p>}
                {analysisSteps.map((step: any, idx: number) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded flex gap-3 items-center shadow-sm">
                     <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 p-1.5 rounded shrink-0 w-8 text-center">{step.sequence_number}</span>
                     <select value={step.step_type} onChange={(e) => handleStepChange(idx, 'step_type', e.target.value)} className="w-36 text-[11px] font-bold border border-slate-300 rounded p-2 outline-none bg-white text-slate-700"><option value="BUSINESS_RULE">Rule Engine</option><option value="CALCULATION">Math Engine</option><option value="API_CALL">API Webhook</option><option value="EVENT_BROADCAST">Fire Alert Event</option></select>
                     {step.step_type === 'EVENT_BROADCAST' ? (
                       <input type="text" placeholder="e.g., SUSPICIOUS_ACTIVITY_DETECTED" value={step.target_event_type || ''} onChange={(e) => handleStepChange(idx, 'target_event_type', e.target.value)} className="flex-1 text-[11px] border border-slate-300 rounded p-2 outline-none font-mono text-amber-600" />
                     ) : (
                       <select value={step.target_token} onChange={(e) => handleStepChange(idx, 'target_token', e.target.value)} className="flex-1 text-[11px] border border-slate-300 rounded p-2 outline-none font-mono text-[#0176D3] bg-white"><option value="" disabled>Select Logical Asset...</option>{step.step_type === 'BUSINESS_RULE' && rulesData?.map((r: any) => <option key={r.token_code} value={r.token_code}>{r.token_code}</option>)}{step.step_type === 'CALCULATION' && calcData?.formulas?.map((f: any) => <option key={f.token_code} value={f.token_code}>{f.token_code}</option>)}{step.step_type === 'API_CALL' && apiData?.integrations?.map((a: any) => <option key={a.api_id} value={a.api_id}>{a.api_name}</option>)}</select>
                     )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <datalist id="event-types-list">
            {eventTypes.map((et: string) => <option key={et} value={et} />)}
          </datalist>
          
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
            <button disabled={createInsightMutation.isPending || !insightName || !insightCode} onClick={() => createInsightMutation.mutate()} className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">{createInsightMutation.isPending ? 'Saving...' : 'Deploy Insight'}</button>
          </div>
        </div>
      )}
    </div>
  );
};