import React, { useEffect } from 'react';
import { MasterHeaderNav } from './layouts/MasterHeaderNav';
import { usePlatformStore } from './store/usePlatformStore';
// import { WorkflowCanvas } from './features/workflow-designer/WorkflowCanvas';

function App() {
  const activeModule = usePlatformStore((state) => state.activeModule);

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 font-sans">
      <MasterHeaderNav />
      
      <main className="max-w-[1650px] mx-auto mt-6 px-6">
        {activeModule === 'dashboard' && (
          <div className="p-6 bg-white border border-slate-200 rounded shadow-sm">
            <h1 className="text-xl font-bold text-[#0052CC]">Welcome to Infinity ProductOS</h1>
            <p className="text-slate-500 mt-2">Select a module from the Design Studio menu to begin.</p>
          </div>
        )}
        
        {activeModule === 'workflow-designer' && (
          <div className="p-6 bg-white border border-slate-200 rounded shadow-sm h-[700px]">
             {/* <WorkflowCanvas /> will be mounted here shortly */}
          </div>
        )}
      </main>
    </div>
  );
}
export default App;