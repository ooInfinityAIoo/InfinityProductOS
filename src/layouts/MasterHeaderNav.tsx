// WHY THIS FILE EXISTS:
// Master navigation header for InfinityProductOS. Renders the top nav bar with
// package context and all studio dropdowns.
// NOTE: Module-level and field-level entitlements are NOT hardcoded here.
// They will be enforced at runtime by the Entitlement Configuration module,
// which defines roles, users, and access rights as data — consistent with ADR #3.

import React, { useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export const MasterHeaderNav: React.FC = () => {
  const {
    activeModule,
    activeProductContext,
    setProductContext,
    setActiveModule,
    setWizardOpen,
    workflowDraft,
    workflowReturnStepId,
  } = usePlatformStore();

  // Designer Studio phase accordions — each phase collapses independently so
  // the user never has to scroll through all 14 items at once.
  const [phase1Open, setPhase1Open] = useState(false);
  const [phase2Open, setPhase2Open] = useState(false);
  const [phase3Open, setPhase3Open] = useState(false);
  const [phase4Open, setPhase4Open] = useState(false);
  // Sub-accordions within phases
  const [ingestionOpen, setIngestionOpen] = useState(false);
  const [integrationGatewayOpen, setIntegrationGatewayOpen] = useState(false);

  const { data: themeData } = useQuery({
    queryKey: ['global-theme'],
    queryFn: async () => (await apiClient.get('/masters/theme')).data
  });

  const getLinkClass = (module: string) => {
    return activeModule === module
      ? "text-[13px] font-bold text-indigo-600 bg-indigo-50/50 border border-indigo-100/50 px-3 py-1.5 rounded-lg transition-all"
      : "text-[13px] font-semibold text-slate-500 hover:text-slate-850 hover:bg-slate-50/50 px-3 py-1.5 rounded-lg transition-all";
  };

  return (
    // Responsive (Finding A2): below ~1024px the nav groups no longer fit on one row.
    // min-height + flex-wrap drop them to a second row instead of clipping 'EXIT PACKAGE'
    // off the right edge. overflow-x-auto is intentionally NOT used — it would create a
    // scroll container that clips the absolutely-positioned dropdown menus.
    <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-slate-200/50 px-4 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 shadow-glass">
      <div className="flex items-center gap-6">
        <div 
          onClick={() => { setProductContext(null); setActiveModule('dashboard'); }}
          className="flex items-center gap-3 cursor-pointer select-none active:scale-[0.98] transition-all hover:opacity-85"
        >
          {themeData?.logo_url ? (
            <img src={themeData.logo_url} alt="Brand Logo" className="h-8 object-contain" />
          ) : (
            <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-850 text-white w-9 h-9 font-extrabold text-[19px] rounded-xl flex items-center justify-center shadow-md shadow-indigo-950/10">
              ∞
            </div>
          )}
          <div>
            <div className="text-[14px] font-extrabold text-slate-900 tracking-tight font-display">
              {activeProductContext || themeData?.brand_name || 'Infinity ProductOS™'}
            </div>
            <div className="text-[10px] text-slate-400 font-medium mt-0.5 tracking-wider uppercase">
              Active Package Environment Context
            </div>
          </div>
        </div>

        {activeModule !== 'workflow-designer' && workflowDraft && (
          <div className="flex items-center gap-2.5 bg-amber-50/90 border border-amber-200/80 px-4 py-1.5 rounded-2xl shadow-sm">
            <span className="text-[11px] font-bold text-amber-800">
              🛠️ Configuring asset for step: {workflowReturnStepId ? `[${workflowReturnStepId}]` : 'Active Step'}
            </span>
            <button 
              onClick={() => setActiveModule('workflow-designer')}
              className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-extrabold px-3 py-1 rounded-xl transition-all shadow-sm active:scale-[0.98]"
            >
              Return to Workflow Designer
            </button>
          </div>
        )}
      </div>

      <nav className="flex items-center gap-2">
        {activeProductContext && (
          <>
            {/* WS-12: Launch the deployed banking product runtime — switches from designer mode to operator mode */}
            <button
              onClick={() => setActiveModule('package-runtime')}
              className={`text-[12px] font-bold px-3.5 py-1.5 rounded-xl shadow-sm active:scale-[0.98] transition-all flex items-center gap-1.5 mr-1 ${
                activeModule === 'package-runtime' || activeModule === 'runtime-transaction-shell'
                  ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              ▶ Launch App
            </button>
            <button
          onClick={() => setActiveModule('ai-assistant')}
          className="text-[12px] font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-750 to-indigo-800 hover:from-indigo-750 hover:to-indigo-900 px-3.5 py-1.5 rounded-xl shadow-md shadow-indigo-600/10 active:scale-[0.98] transition-all flex items-center gap-1.5 mr-2"
        >
          <span className="animate-pulse">✨</span> Infinity AI
        </button>

           {/* TRANSACTION WORKFLOW SCREEN */}
           <div className="relative group h-full flex items-center py-5">
             <button 
               onClick={() => setActiveModule('transaction-workflow-screen')}
               className={`text-[13px] font-bold px-3 py-1.5 rounded-lg hover:bg-slate-50/50 flex items-center gap-1 transition-all cursor-pointer ${
                 activeModule === 'transaction-workflow-screen' 
                   ? 'text-indigo-700 bg-indigo-50/80 border border-indigo-100/50' 
                   : 'text-slate-600 hover:text-indigo-650'
               }`}
             >
               Transaction Workflows
             </button>
           </div>

           {/* MASTER DATA DROPDOWN — permanent reference data that lives for the lifetime of a package */}
        <div className="relative group h-full flex items-center py-5">
          <button className="text-[13px] font-bold text-slate-600 hover:text-indigo-650 px-3 py-1.5 rounded-lg hover:bg-slate-50/50 flex items-center gap-1 cursor-default transition-all">
            Master Data ▾
          </button>
          <div className="absolute top-[100%] left-0 w-72 bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-xl hidden group-hover:flex flex-col z-50 overflow-hidden mt-1 animate-slide-up">
            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Product Hierarchy
            </div>
            <button onClick={() => setActiveModule('product-registry')} className="px-4 py-2.5 text-left hover:bg-indigo-50/40 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-indigo-600">Product Registry</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define payment products — SWIFT, SEPA, ACH, RTP, FX. Auto-generates PRD-YYYYMM-NNN ID.</div>
            </button>
            <button onClick={() => setActiveModule('subproduct-registry')} className="px-4 py-2.5 text-left hover:bg-indigo-50/40 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-indigo-600">Sub-Product Registry</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define product variations by geography, segment, channel, currency, or limit band.</div>
            </button>
            <button onClick={() => setActiveModule('field-registry')} className="px-4 py-2.5 text-left hover:bg-indigo-50/40 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-indigo-600">Data Dictionary</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Global data fields and ISO 20022 field registry.</div>
            </button>
            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Reference Tables
            </div>
            <button className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors opacity-50 cursor-not-allowed">
              <div className="text-[12px] font-bold text-slate-500">Currency & FX Tables</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">ISO 4217 currencies, exchange rates, tolerance bands.</div>
            </button>
            <button className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors opacity-50 cursor-not-allowed">
              <div className="text-[12px] font-bold text-slate-500">Counterparty Directory</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">BICs, correspondent banks, SSI standing instructions.</div>
            </button>
            <button className="px-4 py-2.5 text-left hover:bg-slate-50 transition-colors opacity-50 cursor-not-allowed">
              <div className="text-[12px] font-bold text-slate-500">Holiday & Calendar</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Settlement calendars, cut-off times per jurisdiction.</div>
            </button>

            {/* Access & Authorization — IAM config lives in Master because every studio
                reads it at runtime (Layer 6). Keeping it here means auditors find it in
                one place, and the 4-Eye pattern never nests inside the thing it governs. */}
            <div className="px-4 py-2 bg-rose-50/60 border-t border-rose-100/50 border-b border-rose-100/50 text-[10px] font-bold uppercase tracking-wider text-rose-400">
              Access &amp; Authorization
            </div>
            <button onClick={() => setActiveModule('user-profiles')} className="px-4 py-2.5 text-left hover:bg-rose-50/40 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-rose-600">🧑‍💼 Users</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Create and manage platform user accounts and role assignments.</div>
            </button>
            <button onClick={() => setActiveModule('role-profiles')} className="px-4 py-2.5 text-left hover:bg-rose-50/40 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-rose-600">🏷 Role Profiles</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define named roles (ADMIN, OPERATOR, RISK, AUDITOR, etc.) as data masters.</div>
            </button>
            <button onClick={() => setActiveModule('entitlements')} className="px-4 py-2.5 text-left hover:bg-rose-50/50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-rose-600">🔐 Entitlement Configuration</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Map permissions to roles — who can view, modify, or approve each entity.</div>
            </button>
            <button onClick={() => setActiveModule('authorization-matrix')} className="px-4 py-2.5 text-left hover:bg-rose-50/40 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-rose-600">🔲 Authorization Matrix</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Cross-reference view: role × resource × allowed actions.</div>
            </button>
            <div className="px-4 py-2 bg-sky-50/60 border-t border-sky-100/50 border-b border-sky-100/50 text-[10px] font-bold uppercase tracking-wider text-sky-400">
              Queue Infrastructure
            </div>
            <button onClick={() => setActiveModule('queue-infrastructure')} className="px-4 py-2.5 text-left hover:bg-sky-50/40 transition-colors">
              <div className="text-[12px] font-bold text-sky-600">📬 Queue Infrastructure</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Configure external MQ connections (IBM MQ, Kafka, TIBCO, SWIFT), queues, and routing rules.</div>
            </button>
          </div>
        </div>

           {/* DESIGNER STUDIO DROPDOWN (DESIGN-TIME BLUEPRINT)
               Visibility and field-level access per module are controlled at runtime
               by the Entitlement Configuration module — not hardcoded here (ADR #3). */}
        <div className="relative group h-full flex items-center py-5">
          <button className="text-[13px] font-extrabold text-indigo-650 hover:text-indigo-850 px-3.5 py-1.5 rounded-xl border border-indigo-150 bg-indigo-50/50 hover:bg-indigo-100/50 flex items-center gap-1 cursor-default transition-all ml-1">
            Designer Studio ▾
          </button>
          {/* Designer Studio dropdown — 4 phase accordions, no scrolling needed.
              Same collapse pattern as Data Ingestion & Mapping: click phase header
              to expand/collapse its tools inline. All 4 closed by default. */}
          <div className="absolute top-[100%] right-0 w-80 bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-xl hidden group-hover:flex flex-col z-50 overflow-hidden mt-1 animate-slide-up">

            {/* ── PHASE 1: Define the Data ── */}
            <div className="border-b border-slate-100/50">
              <button
                onClick={() => setPhase1Open(o => !o)}
                className="w-full px-4 py-2.5 text-left hover:bg-slate-50/60 flex items-center justify-between transition-colors bg-slate-50/80"
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phase 1</div>
                  <div className="text-[12px] font-bold text-slate-700 mt-0.5">Define the Data</div>
                </div>
                <span className="text-slate-400 text-[10px] ml-2 shrink-0" style={{ transform: phase1Open ? 'rotate(180deg)' : 'none', display:'inline-block' }}>▾</span>
              </button>
              {phase1Open && (
                <div className="border-t border-slate-100/50">
                  <button onClick={() => setActiveModule('doc-checklists')} className="w-full px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-700">1. Document Checklist</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define prerequisite documents and customer files per workflow step.</div>
                  </button>
                  {/* Data Ingestion nested accordion — same pattern, one level deeper */}
                  <div className="border-b border-slate-100/50">
                    <button
                      onClick={() => setIngestionOpen(o => !o)}
                      className="w-full px-4 py-2.5 text-left hover:bg-cyan-50/40 flex items-center justify-between transition-colors"
                    >
                      <div>
                        <div className="text-[12px] font-bold text-cyan-700">2. Data Ingestion & Mapping</div>
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5">File templates, document extraction, field mapping.</div>
                      </div>
                      <span className="text-slate-400 text-[10px] ml-2 shrink-0" style={{ transform: ingestionOpen ? 'rotate(180deg)' : 'none', display:'inline-block' }}>▾</span>
                    </button>
                    {ingestionOpen && (
                      <div className="bg-cyan-50/30 border-t border-cyan-100/50">
                        <button onClick={() => setActiveModule('file-template-designer')} className="w-full pl-8 pr-4 py-2 text-left hover:bg-cyan-50/60 border-b border-cyan-100/30 transition-colors flex items-center gap-2">
                          <span className="text-[11px]">📄</span>
                          <div>
                            <div className="text-[11px] font-bold text-slate-700">File Template Designer</div>
                            <div className="text-[10px] text-slate-400 font-normal">Structured file layouts (CSV, Excel, SWIFT).</div>
                          </div>
                        </button>
                        <button onClick={() => setActiveModule('unstructured-document-studio')} className="w-full pl-8 pr-4 py-2 text-left hover:bg-cyan-50/60 border-b border-cyan-100/30 transition-colors flex items-center gap-2">
                          <span className="text-[11px]">🔍</span>
                          <div>
                            <div className="text-[11px] font-bold text-slate-700">Unstructured Document Studio</div>
                            <div className="text-[10px] text-slate-400 font-normal">AI extraction for PDFs and scanned images.</div>
                          </div>
                        </button>
                        <button onClick={() => setActiveModule('dge-canvas')} className="w-full pl-8 pr-4 py-2 text-left hover:bg-cyan-50/60 transition-colors flex items-center gap-2">
                          <span className="text-[11px]">🔀</span>
                          <div>
                            <div className="text-[11px] font-bold text-slate-700">Import File Mappers</div>
                            <div className="text-[10px] text-slate-400 font-normal">Map inbound fields to ISO 20022 targets.</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── PHASE 2: Design Logic & Flow ── */}
            <div className="border-b border-slate-100/50">
              <button
                onClick={() => setPhase2Open(o => !o)}
                className="w-full px-4 py-2.5 text-left hover:bg-slate-50/60 flex items-center justify-between transition-colors bg-slate-50/80"
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phase 2</div>
                  <div className="text-[12px] font-bold text-slate-700 mt-0.5">Design Logic & Flow</div>
                </div>
                <span className="text-slate-400 text-[10px] ml-2 shrink-0" style={{ transform: phase2Open ? 'rotate(180deg)' : 'none', display:'inline-block' }}>▾</span>
              </button>
              {phase2Open && (
                <div className="border-t border-slate-100/50">
                  <button onClick={() => setActiveModule('workflow-designer')} className="w-full px-4 py-2.5 text-left hover:bg-indigo-50/30 border-b border-slate-100/50 transition-colors">
                    <div className="text-[12px] font-bold text-indigo-600">4. Workflow Designer</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design transaction and onboarding workflow DAGs.</div>
                  </button>
                  <button onClick={() => setActiveModule('business-rules')} className="w-full px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-700">5. Business Rules Engine</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Configure validation matrices and business rules.</div>
                  </button>
                  <button onClick={() => setActiveModule('calculation-engine')} className="w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-700">6. Calculations & Formulas</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design pricing logic, rates, and math formulas.</div>
                  </button>
                </div>
              )}
            </div>

            {/* ── PHASE 3: Connect & Render ── */}
            <div className="border-b border-slate-100/50">
              <button
                onClick={() => setPhase3Open(o => !o)}
                className="w-full px-4 py-2.5 text-left hover:bg-slate-50/60 flex items-center justify-between transition-colors bg-slate-50/80"
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phase 3</div>
                  <div className="text-[12px] font-bold text-slate-700 mt-0.5">Connect & Render</div>
                </div>
                <span className="text-slate-400 text-[10px] ml-2 shrink-0" style={{ transform: phase3Open ? 'rotate(180deg)' : 'none', display:'inline-block' }}>▾</span>
              </button>
              {phase3Open && (
                <div className="border-t border-slate-100/50">
                  {/* Integration Gateway nested accordion */}
                  <div className="border-b border-slate-100/50">
                    <button
                      onClick={() => setIntegrationGatewayOpen(o => !o)}
                      className="w-full px-4 py-2.5 text-left hover:bg-violet-50/40 flex items-center justify-between transition-colors"
                    >
                      <div>
                        <div className="text-[12px] font-bold text-violet-700">7. Integration Gateway</div>
                        <div className="text-[10px] text-slate-400 font-normal mt-0.5">API and batch integration blueprints with governance.</div>
                      </div>
                      <span className="text-slate-400 text-[10px] ml-2 shrink-0" style={{ transform: integrationGatewayOpen ? 'rotate(180deg)' : 'none', display:'inline-block' }}>▾</span>
                    </button>
                    {integrationGatewayOpen && (
                      <div className="bg-violet-50/20 border-t border-violet-100/50">
                        <button onClick={() => setActiveModule('api-designer')} className="w-full pl-8 pr-4 py-2.5 text-left hover:bg-violet-50/60 border-b border-violet-100/30 transition-colors flex items-center gap-2">
                          <span className="text-[13px]">⚡</span>
                          <div>
                            <div className="text-[11px] font-bold text-slate-700">API Gateway Designer</div>
                            <div className="text-[10px] text-slate-400">Real-time REST/webhook integrations — SWIFT, RTGS, KYC, core banking.</div>
                          </div>
                        </button>
                        <button onClick={() => setActiveModule('batch-gateway-designer')} className="w-full pl-8 pr-4 py-2.5 text-left hover:bg-violet-50/60 transition-colors flex items-center gap-2">
                          <span className="text-[13px]">📦</span>
                          <div>
                            <div className="text-[11px] font-bold text-slate-700">Batch Gateway Designer</div>
                            <div className="text-[10px] text-slate-400">Scheduled file jobs — SFTP, S3, MQ, BACS, SEPA bulk files.</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setActiveModule('screen-designer')} className="w-full px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-700">8. Screen Design Studio</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design layout canvases for user interfaces.</div>
                  </button>
                  <button onClick={() => setActiveModule('legacy-onboarding')} className="w-full px-4 py-2.5 text-left hover:bg-amber-50/40 border-b border-slate-100/50 transition-colors">
                    <div className="text-[12px] font-bold text-amber-700">🏛 Legacy Screen Onboarding</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Upload T24/Flexcube screenshots → AI extracts fields → auto-generate screens.</div>
                  </button>
                  <button onClick={() => setActiveModule('comm-templates')} className="w-full px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-700">9. Document Template Designer</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design EMAIL, LETTER and SMS templates with ISO field placeholders.</div>
                  </button>
                  <button onClick={() => setActiveModule('notification-engine')} className="w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-700">10. Notification Engine</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Configure EMAIL, SMS, and LETTER triggers per workflow node.</div>
                  </button>
                </div>
              )}
            </div>

            {/* ── PHASE 4: Monitor, Output & Intelligence ── */}
            <div>
              <button
                onClick={() => setPhase4Open(o => !o)}
                className="w-full px-4 py-2.5 text-left hover:bg-slate-50/60 flex items-center justify-between transition-colors bg-slate-50/80"
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phase 4</div>
                  <div className="text-[12px] font-bold text-slate-700 mt-0.5">Monitor, Output & Intelligence</div>
                </div>
                <span className="text-slate-400 text-[10px] ml-2 shrink-0" style={{ transform: phase4Open ? 'rotate(180deg)' : 'none', display:'inline-block' }}>▾</span>
              </button>
              {phase4Open && (
                <div className="border-t border-slate-100/50">
                  <button onClick={() => setActiveModule('reconciliation-engine')} className="w-full px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-700">11. Reconciliation Engine</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define payment matching criteria.</div>
                  </button>
                  <button onClick={() => setActiveModule('behavioral-profiles')} className="w-full px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-700">12. Behavioral Profiling Models</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Track system activity patterns and risk behaviors.</div>
                  </button>
                  <button onClick={() => setActiveModule('report-designer')} className="w-full px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
                    <div className="text-[12px] font-bold text-slate-700">13. Report Designer Engine</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design statements, balances, and export grids.</div>
                  </button>
                  <button onClick={() => setActiveModule('insights-factory')} className="w-full px-4 py-2.5 text-left hover:bg-indigo-50/40 transition-colors">
                    <div className="text-[12px] font-bold text-indigo-600">14. Insights Factory</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design analytical workflows, alerts, and intelligence widgets.</div>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* RUNTIME OPERATIONS DROPDOWN (RUN-TIME MONITORING) */}
        <div className="relative group h-full flex items-center py-5">
          <button className="text-[13px] font-bold text-slate-600 hover:text-indigo-650 px-3 py-1.5 rounded-lg hover:bg-slate-50/50 flex items-center gap-1 cursor-default transition-all">
            Runtime Operations ▾
          </button>
          <div className="absolute top-[100%] right-0 w-72 bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-xl hidden group-hover:flex flex-col z-50 overflow-hidden mt-1 animate-slide-up">
            
            <button onClick={() => setActiveModule('ingestion-pipeline')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-indigo-600">1. File Import Gateway</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Upload and execute live documents.</div>
            </button>
            <button onClick={() => setActiveModule('recon-tracking')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">2. Reconciliation Tracker</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Track matching runs and transaction parity.</div>
            </button>
            <button onClick={() => setActiveModule('event-repository')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">3. Event Catalog</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Inspect system event logs and audit streams.</div>
            </button>
            <button onClick={() => setActiveModule('execution-audit')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">4. Execution Traces</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Trace transactional lifecycles in detail.</div>
            </button>
            <button onClick={() => setActiveModule('global-technical-dashboard')} className="px-4 py-3 text-left hover:bg-slate-50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">5. Global Technical Dashboard</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Platform infrastructure health, API status, system logs.</div>
            </button>
          </div>
        </div>
        </>
        )}
        
        {activeProductContext ? (
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => setActiveModule('domain-dashboard')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all active:scale-[0.98] shadow-sm ${activeModule === 'domain-dashboard' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-250 text-indigo-600 hover:bg-slate-50'}`}
            >
              360° Dashboard
            </button>
            <button
              onClick={() => { setProductContext(null); setActiveModule('dashboard'); }}
              className="px-3.5 py-1.5 text-xs font-bold uppercase rounded-xl border border-slate-250 bg-white text-slate-600 hover:bg-slate-50 transition-all active:scale-[0.98] shadow-sm"
            >
              Exit Package
            </button>
          </div>
        ) : (
          /* Global-level nav — shown when no package is active */
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => setActiveModule('dashboard')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all active:scale-[0.98] shadow-sm ${activeModule === 'dashboard' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-250 text-indigo-600 hover:bg-slate-50'}`}
            >
              Global 360 Dashboard
            </button>
            <button
              onClick={() => setActiveModule('global-technical-dashboard')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all active:scale-[0.98] shadow-sm ${activeModule === 'global-technical-dashboard' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-250 text-slate-600 hover:bg-slate-50'}`}
            >
              Global Technical Dashboard
            </button>

          </div>
        )}
      </nav>
    </header>
  );
};