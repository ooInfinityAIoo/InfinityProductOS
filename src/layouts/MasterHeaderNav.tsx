// WHY THIS FILE EXISTS:
// Master navigation header for InfinityProductOS. Renders the top nav bar with
// package context and all studio dropdowns.
// NOTE: Module-level and field-level entitlements are NOT hardcoded here.
// They will be enforced at runtime by the Entitlement Configuration module,
// which defines roles, users, and access rights as data — consistent with ADR #3.

import React from 'react';
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
    <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-slate-200/50 px-8 h-16 flex items-center justify-between shadow-glass">
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
            <button 
          onClick={() => setActiveModule('ai-assistant')} 
          className="text-[12px] font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-750 to-indigo-800 hover:from-indigo-750 hover:to-indigo-900 px-3.5 py-1.5 rounded-xl shadow-md shadow-indigo-600/10 active:scale-[0.98] transition-all flex items-center gap-1.5 mr-2"
        >
          <span className="animate-pulse">✨</span> Infinity AI
        </button>
           {/* MASTER DATA DROPDOWN — permanent reference data that lives for the lifetime of a package */}
        <div className="relative group h-full flex items-center py-5">
          <button className="text-[13px] font-bold text-slate-600 hover:text-indigo-650 px-3 py-1.5 rounded-lg hover:bg-slate-50/50 flex items-center gap-1 cursor-default transition-all">
            Master Data ▾
          </button>
          <div className="absolute top-[100%] left-0 w-72 bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-xl hidden group-hover:flex flex-col z-50 overflow-hidden mt-1 animate-slide-up">
            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Product Hierarchy
            </div>
            <button onClick={() => setActiveModule('products-registry')} className="px-4 py-2.5 text-left hover:bg-indigo-50/40 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-indigo-600">Products Registry</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Core products, sub-products and variation catalogue.</div>
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
          </div>
        </div>

           {/* DESIGNER STUDIO DROPDOWN (DESIGN-TIME BLUEPRINT)
               Visibility and field-level access per module are controlled at runtime
               by the Entitlement Configuration module — not hardcoded here (ADR #3). */}
        <div className="relative group h-full flex items-center py-5">
          <button className="text-[13px] font-extrabold text-indigo-650 hover:text-indigo-850 px-3.5 py-1.5 rounded-xl border border-indigo-150 bg-indigo-50/50 hover:bg-indigo-100/50 flex items-center gap-1 cursor-default transition-all ml-1">
            Designer Studio ▾
          </button>
          <div className="absolute top-[100%] right-0 w-80 bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-xl hidden group-hover:flex flex-col z-50 overflow-hidden mt-1 animate-slide-up max-h-[500px] overflow-y-auto">

            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Phase 1: Define the Data
            </div>
            <button onClick={() => setActiveModule('field-registry')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">1. Data Dictionary</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define global data fields and ISO 20022 schemas.</div>
            </button>
            <button onClick={() => setActiveModule('document-master')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">2. Document Checklist</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define prerequisite files and customer documents.</div>
            </button>
            <button onClick={() => setActiveModule('file-template-designer')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">3. File Template Designer</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define layouts for importing document streams.</div>
            </button>
            <button onClick={() => setActiveModule('dge-canvas')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">4. Import File Mappers</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Map inbound fields to targets using mappers.</div>
            </button>

            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Phase 2: Design Logic & Flow
            </div>
            <button onClick={() => setActiveModule('workflow-designer')} className="px-4 py-2.5 text-left hover:bg-indigo-50/30 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-indigo-600">5. Process Flow Designer</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Orchestrate operational workflows and steps.</div>
            </button>
            <button onClick={() => setActiveModule('business-rules')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">6. Decision Logic & Policies</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Configure validation matrices and business rules.</div>
            </button>
            <button onClick={() => setActiveModule('calculation-engine')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">7. Calculations & Formulas</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design pricing logic, rates, and math formulas.</div>
            </button>

            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Phase 3: Connect & Render
            </div>
            <button onClick={() => setActiveModule('api-designer')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">8. External Connectors</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design integration endpoints and transaction gateways.</div>
            </button>
            <button onClick={() => setActiveModule('screen-designer')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">9. User Screen Designer</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design layout canvases for user interfaces.</div>
            </button>

            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Phase 4: Monitor, Output & Intelligence
            </div>
            <button onClick={() => setActiveModule('reconciliation-engine')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">10. Reconciliation Matchers</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define payment matching criteria.</div>
            </button>
            <button onClick={() => setActiveModule('behavioral-profiles')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">11. Behavioral Profiling Models</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Track system activity patterns and risk behaviors.</div>
            </button>
            <button onClick={() => setActiveModule('report-designer')} className="px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">12. Report Templates</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design statements, balances, and export grids.</div>
            </button>
            <button onClick={() => setActiveModule('insights-factory')} className="px-4 py-2.5 text-left hover:bg-indigo-50/40 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-indigo-600">13. Insights Factory</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design analytical workflows, alerts, and intelligence widgets.</div>
            </button>

            {/* Platform Administration — access control, entitlements */}
            <div className="px-4 py-2 bg-rose-50/60 border-b border-rose-100/50 text-[10px] font-bold uppercase tracking-wider text-rose-400">
              Platform Administration
            </div>
            <button onClick={() => setActiveModule('entitlements')} className="px-4 py-2.5 text-left hover:bg-rose-50/40 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-rose-600">🔐 Entitlement Configuration</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Control who can view, modify, or approve each entity per role.</div>
            </button>
            <button onClick={() => setActiveModule('comm-templates')} className="px-4 py-2.5 text-left hover:bg-rose-50/40 transition-colors">
              <div className="text-[12px] font-bold text-rose-600">📨 Document Template Designer</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Design EMAIL, LETTER and SMS templates with ISO field placeholders.</div>
            </button>
            <button onClick={() => setActiveModule('doc-checklists')} className="px-4 py-2.5 text-left hover:bg-rose-50/40 transition-colors">
              <div className="text-[12px] font-bold text-rose-600">📋 Document Checklist Canvas</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define required documents per workflow step. Mandatory items block progression.</div>
            </button>
            <button onClick={() => setActiveModule('notification-engine')} className="px-4 py-2.5 text-left hover:bg-rose-50/40 transition-colors">
              <div className="text-[12px] font-bold text-rose-600">🔔 Notification Engine</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Configure EMAIL, SMS Wait, and LETTER triggers per workflow node.</div>
            </button>

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