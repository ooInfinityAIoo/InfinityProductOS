import React from 'react';

export const ScreenList = ({
  viewMode,
  isReadOnly,
  isLoadingScreens,
  screensData,
  selectedScreen,
  setViewMode,
  setSelectedScreen,
  setHasUnsavedChanges
}: any) => {
  return (
    <div className={`w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden ${viewMode !== 'LIST' ? 'hidden md:flex opacity-50 pointer-events-none' : ''}`}>
      <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Screen Library</h2>
          <p className="text-xs text-slate-500 mt-0.5">Dynamic UI Blueprints.</p>
        </div>
        {!isReadOnly && (
          <button onClick={() => { setViewMode('CREATE'); setSelectedScreen(null); setHasUnsavedChanges(false); }} className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors">
            + New Screen
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoadingScreens ? <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div> : screensData?.screens?.map((screen: any) => (
          <div key={screen.screen_id} onClick={() => { setSelectedScreen(screen); setViewMode('VIEW'); }} className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedScreen?.screen_id === screen.screen_id ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}>
            <div className="flex justify-between items-start mb-2">
              <div className="text-[13px] font-bold text-slate-800">{screen.screen_name}</div>
              <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${screen.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{screen.status}</div>
            </div>
            <div className="text-[11px] text-slate-500">Renders {screen.definition?.length || 0} UI Components</div>
          </div>
        ))}
      </div>
    </div>
  );
};