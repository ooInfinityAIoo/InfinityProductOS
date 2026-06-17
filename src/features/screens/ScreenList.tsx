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
    <div className={`w-[400px] glass-card rounded-2xl flex flex-col overflow-hidden ${viewMode !== 'LIST' ? 'hidden md:flex opacity-50 pointer-events-none' : ''}`}>
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Screen Library</h2>
          <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Dynamic UI Blueprints</p>
        </div>
        {!isReadOnly && (
          <button 
            onClick={() => { setViewMode('CREATE'); setSelectedScreen(null); setHasUnsavedChanges(false); }} 
            className="bg-indigo-600 hover:bg-indigo-750 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98]"
          >
            + New Screen
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoadingScreens ? (
          <div className="text-center text-slate-400 text-xs mt-10 font-bold animate-pulse">Loading blueprints...</div>
        ) : screensData?.screens?.map((screen: any) => (
          <div 
            key={screen.screen_id} 
            onClick={() => { setSelectedScreen(screen); setViewMode('VIEW'); }} 
            className={`p-4 border rounded-2xl cursor-pointer transition-all duration-300 shadow-sm ${
              selectedScreen?.screen_id === screen.screen_id 
                ? 'bg-indigo-50/40 border-indigo-200/80 shadow-glow-indigo' 
                : 'bg-white/50 border-slate-150 hover:border-indigo-400/50 hover:bg-white/80'
            }`}
          >
            <div className="flex justify-between items-start mb-2.5">
              <div className="text-[13px] font-bold text-slate-800 tracking-tight">{screen.screen_name}</div>
              <div className={`text-[9px] font-mono px-2 py-0.5 rounded-lg font-bold border ${
                screen.status === 'ACTIVE' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50' 
                  : 'bg-amber-50 text-amber-700 border-amber-100/50'
              }`}>{screen.status}</div>
            </div>
            <div className="text-[10px] text-slate-400 font-medium">{screen.definition?.length || 0} UI component fields bound</div>
          </div>
        ))}
      </div>
    </div>
  );
};