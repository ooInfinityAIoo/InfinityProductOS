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
    setWizardOpen
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
      <div className="flex items-center gap-3">
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
            Active Product Environment Context
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-2">
        <button 
          onClick={() => setActiveModule('ai-assistant')} 
          className="text-[12px] font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-750 to-indigo-800 hover:from-indigo-750 hover:to-indigo-900 px-3.5 py-1.5 rounded-xl shadow-md shadow-indigo-600/10 active:scale-[0.98] transition-all flex items-center gap-1.5 mr-2"
        >
          <span className="animate-pulse">✨</span> Infinity AI
        </button>
        
        {/* DATA INGESTION GATEWAY DROPDOWN */}
        <div className="relative group h-full flex items-center py-5">
          <button className="text-[13px] font-bold text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-slate-50/50 flex items-center gap-1 cursor-default transition-all">
            Data Ingestion ▾
          </button>
          <div className="absolute top-[100%] left-0 w-72 bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-xl shadow-xl hidden group-hover:flex flex-col z-50 overflow-hidden mt-1 animate-slide-up">
            <button onClick={() => setActiveModule('ingestion-pipeline')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-indigo-600">1. File Ingestion Gateway</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Execute your templates with live files.</div>
            </button>
            <button onClick={() => setActiveModule('file-template-designer')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">2. File Template Designer</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define Layouts & Prompts (Steps A & B).</div>
            </button>
            <button onClick={() => setActiveModule('dge-canvas')} className="px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100/50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">3. Transformation Mapping</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Map Extractions to Targets (Step C).</div>
            </button>
            <button onClick={() => setActiveModule('document-master')} className="px-4 py-3 text-left hover:bg-slate-50 transition-colors">
              <div className="text-[12px] font-bold text-slate-700">4. Document Checklist</div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">Define master prerequisite documents.</div>
            </button>
          </div>
        </div>

        <button onClick={() => setActiveModule('business-rules')} className={getLinkClass('business-rules')}>
          Rules
        </button>
        <button onClick={() => setActiveModule('behavioral-profiles')} className={getLinkClass('behavioral-profiles')}>
          Behavioral AI
        </button>
        <button onClick={() => setActiveModule('calculation-engine')} className={getLinkClass('calculation-engine')}>
          Math Engine
        </button>
        <button onClick={() => setActiveModule('reconciliation-engine')} className={getLinkClass('reconciliation-engine')}>
          Recon Engine
        </button>
        <button 
          onClick={() => setActiveModule('recon-tracking')} 
          className={activeModule === 'recon-tracking'
            ? "text-[13px] font-bold text-emerald-600 bg-emerald-50/50 border border-emerald-100/50 px-3 py-1.5 rounded-lg transition-all"
            : "text-[13px] font-semibold text-emerald-600 hover:bg-emerald-50/50 px-3 py-1.5 rounded-lg transition-all"
          }
        >
          Recon Tracker
        </button>
        <button onClick={() => setActiveModule('insights-factory')} className={getLinkClass('insights-factory')}>
          Insights
        </button>
        <button onClick={() => setActiveModule('screen-designer')} className={getLinkClass('screen-designer')}>
          Screens
        </button>
        <button onClick={() => setActiveModule('api-designer')} className={getLinkClass('api-designer')}>
          APIs
        </button>
        <button onClick={() => setActiveModule('event-repository')} className={getLinkClass('event-repository')}>
          Events
        </button>
        <button onClick={() => setActiveModule('execution-audit')} className={getLinkClass('execution-audit')}>
          Traces
        </button>
        <button onClick={() => setActiveModule('report-designer')} className={getLinkClass('report-designer')}>
          Reports
        </button>
        <button onClick={() => setActiveModule('field-registry')} className={getLinkClass('field-registry')}>
          Settings
        </button>
        <button 
          onClick={() => setActiveModule('workflow-designer')} 
          className="text-[13px] font-extrabold text-indigo-600 hover:text-indigo-800 bg-indigo-50/50 hover:bg-indigo-100/50 px-3.5 py-1.5 rounded-xl border border-indigo-150 transition-all ml-1"
        >
          Designer Studio
        </button>
        
        {activeProductContext ? (
          <button onClick={() => setProductContext(null)} className="ml-4 px-3.5 py-1.5 text-xs font-bold uppercase rounded-xl border border-slate-250 bg-white text-slate-600 hover:bg-slate-50 transition-all active:scale-[0.98] shadow-sm">
            Exit Product
          </button>
        ) : (
          <button onClick={() => setWizardOpen(true)} className="ml-4 px-3.5 py-1.5 text-xs font-bold uppercase rounded-xl border border-transparent bg-indigo-600 text-white hover:bg-indigo-700 transition-all active:scale-[0.98] shadow-md shadow-indigo-600/10">
            Configure Context
          </button>
        )}
      </nav>
    </header>
  );
};