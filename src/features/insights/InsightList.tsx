import React from 'react';

export const InsightList = ({
  isCreating,
  setIsCreating,
  selectedInsight,
  setSelectedInsight,
  isLoadingInsights,
  insightsData,
  resetForm
}: any) => {
  return (
    <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
      <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Insights Factory</h2>
          <p className="text-xs text-slate-500 mt-0.5">Automated analytical jobs & widgets.</p>
        </div>
        <button 
          onClick={() => { setIsCreating(true); setSelectedInsight(null); resetForm(); }}
          className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors"
        >
          + New Insight
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoadingInsights ? (
          <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div>
        ) : insightsData?.insights?.map((insight: any) => (
          <div key={insight.insight_id} onClick={() => { setSelectedInsight(insight); setIsCreating(false); }} className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedInsight?.insight_id === insight.insight_id ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}>
            <div className="flex justify-between items-start mb-2">
              <div className="text-[13px] font-bold text-slate-800">{insight.insight_name}</div>
              <div className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${insight.trigger_type === 'SCHEDULED' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>{insight.trigger_type}</div>
            </div>
            <div className="text-[10px] text-slate-500 font-mono bg-slate-50 p-1 rounded border border-slate-100">{insight.insight_code}</div>
          </div>
        ))}
      </div>
    </div>
  );
};