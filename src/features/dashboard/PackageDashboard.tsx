import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

export const PackageDashboard: React.FC<{ packageName: string }> = ({ packageName }) => {
  const { userRole } = usePlatformStore();
  const [activeTab, setActiveTab] = useState<'360_BUSINESS' | 'TECHNICAL'>('360_BUSINESS');

  // In a real app, we would look up the package_id. For demo, we pass a dummy ID or null
  const packageId = "PKG-DEMO"; 

  // Fetch Role-Based Widgets dynamically from the Backend
  const { data: widgets, isLoading } = useQuery({
    queryKey: ['dashboard-widgets', activeTab, packageId, userRole],
    queryFn: async () => {
      const res = await apiClient.get(`/insights/widgets?dashboard_category=${activeTab}&application_package_id=${packageId}`);
      return res.data;
    }
  });

  return (
    <div className="space-y-6 animate-slide-in-right">
      {/* Dashboard Header & Context */}
      <div className="glass-card rounded-2xl p-6 flex justify-between items-end">
        <div>
          <div className="text-[10px] font-bold uppercase text-indigo-600 tracking-widest mb-1 font-display">Active Application Package</div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">{packageName}</h1>
        </div>
        <div className="flex bg-slate-100/60 p-1.5 rounded-xl border border-slate-150 backdrop-blur-md">
          <button 
            onClick={() => setActiveTab('360_BUSINESS')} 
            className={`px-6 py-2 text-xs rounded-lg font-bold transition-all ${activeTab === '360_BUSINESS' ? 'bg-white shadow-sm text-indigo-600 border border-slate-100/50' : 'text-slate-500 hover:text-slate-800'}`}
          >
            360° Business View
          </button>
          <button 
            onClick={() => setActiveTab('TECHNICAL')} 
            className={`px-6 py-2 text-xs rounded-lg font-bold transition-all ${activeTab === 'TECHNICAL' ? 'bg-white shadow-sm text-indigo-600 border border-slate-100/50' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Technical & API View
          </button>
        </div>
      </div>

      {/* Dynamic Widget Rendering Area */}
      <div className="glass-card rounded-2xl min-h-[500px] p-6 flex flex-col justify-start">
        <h2 className="text-[12px] font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          Role-Based Predictive Insights ({userRole})
        </h2>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-slate-400 font-semibold animate-pulse">Loading Custom Widgets...</div>
        ) : widgets && widgets.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {widgets.map((widget: any) => (
              <div key={widget.insight_id} className="bg-white/50 border border-slate-150 rounded-2xl p-5 hover:border-indigo-400/50 hover:bg-white/80 hover:shadow-glow-indigo transition-all duration-300 relative overflow-hidden group cursor-pointer flex flex-col justify-between shadow-sm">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                <div className="flex justify-between items-start mb-3.5">
                  <h3 className="font-bold text-slate-850 text-sm leading-tight tracking-tight font-display">{widget.insight_name}</h3>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-650 uppercase tracking-wider border border-indigo-100/50">Active</span>
                </div>
                <p className="text-xs text-slate-450 line-clamp-3 mb-4 leading-relaxed font-normal">{widget.description || "Machine-learning driven business insight widget."}</p>
                <div className="mt-auto border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Triggers: {widget.trigger_type}</span>
                  <button className="text-indigo-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Configure Widget</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 shadow-inner">
            <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            <p className="text-sm font-semibold text-slate-550">No {activeTab} widgets configured for role: {userRole}.</p>
            <p className="text-xs text-slate-400 mt-1">Use the Insights Factory to build and assign widgets to this dashboard.</p>
            {userRole === 'ADMIN' && (
              <button className="mt-4 bg-white border border-indigo-200 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors shadow-sm active:scale-[0.98]">
                + Add New Widget
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};