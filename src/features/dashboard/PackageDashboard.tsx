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
      <div className="bg-white border border-slate-200 p-6 rounded shadow-sm flex justify-between items-end">
        <div>
          <div className="text-[11px] font-bold uppercase text-[#0176D3] tracking-wider mb-1">Active Application Package</div>
          <h1 className="text-2xl font-extrabold text-slate-900">{packageName}</h1>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
          <button 
            onClick={() => setActiveTab('360_BUSINESS')} 
            className={`px-6 py-2 text-xs rounded font-bold transition-all ${activeTab === '360_BUSINESS' ? 'bg-white shadow-sm text-[#0176D3]' : 'text-slate-500 hover:text-slate-800'}`}
          >
            360° Business View
          </button>
          <button 
            onClick={() => setActiveTab('TECHNICAL')} 
            className={`px-6 py-2 text-xs rounded font-bold transition-all ${activeTab === 'TECHNICAL' ? 'bg-white shadow-sm text-[#0176D3]' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Technical & API View
          </button>
        </div>
      </div>

      {/* Dynamic Widget Rendering Area */}
      <div className="bg-white border border-slate-200 rounded shadow-sm min-h-[500px] p-6">
        <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
          <svg className="w-4 h-4 text-[#0176D3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          Role-Based Predictive Insights ({userRole})
        </h2>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-slate-400 font-semibold">Loading Custom Widgets...</div>
        ) : widgets && widgets.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {widgets.map((widget: any) => (
              <div key={widget.insight_id} className="border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#0176D3]"></div>
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-slate-800 text-sm leading-tight">{widget.insight_name}</h3>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-[#0176D3] uppercase tracking-wider">Active</span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-3 mb-4">{widget.description || "Machine-learning driven business insight widget."}</p>
                <div className="mt-auto border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                  <span>Triggers: {widget.trigger_type}</span>
                  <button className="text-[#0176D3] hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Configure Widget</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
            <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            <p className="text-sm font-semibold text-slate-500">No {activeTab} widgets configured for role: {userRole}.</p>
            <p className="text-xs text-slate-400 mt-1">Use the Insights Factory to build and assign widgets to this dashboard.</p>
            {userRole === 'ADMIN' && (
              <button className="mt-4 bg-white border border-[#0176D3] text-[#0176D3] px-4 py-2 rounded text-xs font-bold hover:bg-[#0176D3] hover:text-white transition-colors shadow-sm">
                + Add New Widget
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};