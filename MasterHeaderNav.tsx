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
        <button onClick={() => setActiveModule('ingestion-pipeline')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Data Ingestion
        </button>
        <button onClick={() => setActiveModule('business-rules')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Rules Engine
        </button>
        <button onClick={() => setActiveModule('calculation-engine')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Calculation Engine
        </button>
        <button onClick={() => setActiveModule('screen-designer')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Screen Designer
        </button>
        <button onClick={() => setActiveModule('api-designer')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          API Designer
        </button>
        <button onClick={() => setActiveModule('dge-canvas')} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900">
          Payload Mappers
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