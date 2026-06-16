import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export const MasterHeaderNav: React.FC = () => {
  const { 
    activeProductContext, 
    setProductContext, 
    setActiveModule,
    setWizardOpen
  } = usePlatformStore();

  const { data: themeData } = useQuery({
    queryKey: ['global-theme'],
    queryFn: async () => (await apiClient.get('/masters/theme')).data
  });

  return (
    <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        {themeData?.logo_url ? (
          <img src={themeData.logo_url} alt="Brand Logo" className="h-8 object-contain" />
        ) : (
          <div className="bg-slate-900 text-white px-2.5 py-1.5 font-extrabold text-sm rounded tracking-wide">
            ∞
          </div>
        )}
        <div>
          <div className="text-[15px] font-bold text-slate-900">
            {activeProductContext || themeData?.brand_name || 'Infinity ProductOS™'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Configure Your Product Environment Context
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-5">
        <button onClick={() => setActiveModule('ai-assistant')} className="text-[13px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded shadow-sm hover:bg-indigo-600 hover:text-white transition-colors flex items-center gap-1.5">
          <span>✨</span> Infinity AI
        </button>
        
        {/* DATA INGESTION GATEWAY DROPDOWN */}
        <div className="relative group h-full flex items-center py-5">
          <button className="text-[13px] font-bold text-slate-800 hover:text-[#0176D3] flex items-center gap-1 cursor-default">
            Data Ingestion Gateway ▾
          </button>
          <div className="absolute top-[100%] left-0 w-72 bg-white border border-slate-200 rounded-md shadow-xl hidden group-hover:flex flex-col z-50 overflow-hidden">
            <button onClick={() => setActiveModule('ingestion-pipeline')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100 transition-colors">
              <div className="text-[12px] font-bold text-[#0176D3]">1. File Upload & Dispatcher</div>
              <div className="text-[10px] text-slate-500 font-normal mt-0.5">Execute your templates with live files.</div>
            </button>
            <button onClick={() => setActiveModule('file-template-designer')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">2. File Template Designer</div>
              <div className="text-[10px] text-slate-500 font-normal mt-0.5">Define Layouts & Prompts (Steps A & B).</div>
            </button>
            <button onClick={() => setActiveModule('dge-canvas')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">3. Transformation Mapping</div>
              <div className="text-[10px] text-slate-500 font-normal mt-0.5">Map Extractions to Targets (Step C).</div>
            </button>
            <button onClick={() => setActiveModule('document-master')} className="px-4 py-3 text-left hover:bg-slate-50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">4. Document Checklist Definition</div>
              <div className="text-[10px] text-slate-500 font-normal mt-0.5">Define master prerequisite documents.</div>
            </button>
          </div>
        </div>

        <button onClick={() => setActiveModule('business-rules')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Rules Engine
        </button>
        <button onClick={() => setActiveModule('behavioral-profiles')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Behavioral AI
        </button>
        <button onClick={() => setActiveModule('calculation-engine')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Calculation Engine
        </button>
        <button onClick={() => setActiveModule('reconciliation-engine')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Reconciliation Engine
        </button>
        <button onClick={() => setActiveModule('recon-tracking')} className="text-[13px] font-semibold text-[#0052CC] bg-blue-50 border border-blue-100 px-2 py-1 rounded hover:bg-[#0052CC] hover:text-white transition-colors">
          Recon Tracker
        </button>
        <button onClick={() => setActiveModule('insights-factory')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Insights Factory
        </button>
        <button onClick={() => setActiveModule('screen-designer')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Screen Designer
        </button>
        <button onClick={() => setActiveModule('api-designer')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          API Designer
        </button>
        <button onClick={() => setActiveModule('event-repository')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Event Repository
        </button>
        <button onClick={() => setActiveModule('execution-audit')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Execution Trace
        </button>
        <button onClick={() => setActiveModule('report-designer')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Report Builder
        </button>
        <button onClick={() => setActiveModule('field-registry')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Master Configuration
        </button>
        <button onClick={() => setActiveModule('workflow-designer')} className="text-[13px] font-bold text-[#0052CC] hover:text-blue-900">
          Design Studio ▾
        </button>
        
        {activeProductContext ? (
          <button onClick={() => setProductContext(null)} className="ml-4 px-4 py-2 text-xs font-bold uppercase rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors">
            Change Product Context
          </button>
        ) : (
          <button onClick={() => setWizardOpen(true)} className="ml-4 px-4 py-2 text-xs font-bold uppercase rounded border border-transparent bg-[#0176D3] text-white hover:bg-blue-700 transition-colors shadow-sm">
            + Start Configuring New Product
          </button>
        )}
      </nav>
    </header>
  );
};