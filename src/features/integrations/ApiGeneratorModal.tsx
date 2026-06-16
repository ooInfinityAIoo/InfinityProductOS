import React from 'react';

export const ApiGeneratorModal = ({
  pendingApi,
  setPendingApi,
  setShowApiModal,
  setHasUnsavedChanges
}: any) => {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110]">
      <div className="bg-white rounded shadow-2xl w-[700px] max-h-[90vh] overflow-hidden flex flex-col animate-slide-in-up">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
             <h3 className="font-bold text-slate-800 text-[15px]">Configure Linked API Endpoint</h3>
             <p className="text-[11px] text-slate-500">This endpoint will be created atomically with your screen layout.</p>
          </div>
        </div>
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
           <div className="grid grid-cols-[1fr_100px] gap-4">
              <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Integration Name</label><input type="text" value={pendingApi.api_name} onChange={(e) => setPendingApi({...pendingApi, api_name: e.target.value})} className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none" /></div>
              <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Method</label><select value={pendingApi.http_method} onChange={(e) => setPendingApi({...pendingApi, http_method: e.target.value})} className="w-full text-[13px] font-bold text-slate-900 border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none bg-white"><option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option></select></div>
           </div>
           <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">URL Endpoint Template</label><input type="text" value={pendingApi.url_template} onChange={(e) => setPendingApi({...pendingApi, url_template: e.target.value})} className="w-full font-mono text-[13px] text-[#0176D3] border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none" /></div>
           
           <div className="grid grid-cols-2 gap-4">
             <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Auto-Generated Request Schema</label><pre className="text-[10px] bg-slate-900 text-green-400 p-3 rounded overflow-x-auto">{JSON.stringify(pendingApi.request_body_template, null, 2)}</pre></div>
             <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Auto-Generated Response Schema</label><pre className="text-[10px] bg-slate-900 text-green-400 p-3 rounded overflow-x-auto">{JSON.stringify(pendingApi.response_contract, null, 2)}</pre></div>
           </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
           <button onClick={() => { setPendingApi(null); setShowApiModal(false); }} className="px-4 py-2 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100">Discard Endpoint</button>
           <button onClick={() => { setShowApiModal(false); setHasUnsavedChanges(true); }} className="px-4 py-2 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700">Confirm Linked Endpoint</button>
        </div>
      </div>
    </div>
  );
};