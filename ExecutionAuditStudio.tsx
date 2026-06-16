import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const ExecutionAuditStudio: React.FC = () => {
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [inputPayload, setInputPayload] = useState<string>('{\n  "transaction_id": "TXN-99882",\n  "amount": 50000,\n  "currency": "USD",\n  "account_number": "100293884"\n}');
  const [executionResult, setExecutionResult] = useState<any>(null);

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => (await apiClient.get('/workflows/')).data
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(inputPayload);
      } catch (e) {
        throw new Error("Invalid JSON payload. Please verify your syntax.");
      }
      const res = await apiClient.post(`/workflows/${selectedWorkflow.workflow_id}/execute`, parsedPayload);
      return res.data;
    },
    onSuccess: (data) => {
      setExecutionResult(data);
    },
    onError: (err: any) => {
      setExecutionResult({ error: err.response?.data?.detail || err.message || "Execution failed" });
    }
  });

  const downloadReportMutation = useMutation({
    mutationFn: async () => {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(inputPayload);
      } catch (e) {
        throw new Error("Invalid JSON payload");
      }
      const response = await apiClient.post(`/workflows/${selectedWorkflow.workflow_id}/execute/download-report`, parsedPayload, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `execution_audit_${selectedWorkflow.workflow_id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  });

  const downloadOutboundMutation = useMutation({
    mutationFn: async ({ mapperId, data }: { mapperId: string, data: any[] }) => {
      const response = await apiClient.post(`/workflows/generate-outbound-file/${mapperId}`, data, {
        responseType: 'blob'
      });
      
      const contentDisposition = response.headers['content-disposition'];
      let filename = `outbound_${mapperId}.csv`;
      if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
          if (filenameMatch && filenameMatch.length === 2) filename = filenameMatch[1];
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  });

  return (
    <div className="flex gap-6 h-[750px] animate-fade-in">
      {/* Left Column: List of Workflows */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Execution & Audit Viewer</h2>
          <p className="text-xs text-slate-500 mt-0.5">Test workflows and inspect logic execution traces.</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading Workflows...</div>
          ) : workflows?.map((wf: any) => (
            <div 
              key={wf.workflow_id} 
              onClick={() => { setSelectedWorkflow(wf); setExecutionResult(null); }}
              className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedWorkflow?.workflow_id === wf.workflow_id ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800">{wf.workflow_name}</div>
                <div className="text-[10px] font-mono text-[#0176D3] bg-blue-50 px-1.5 py-0.5 rounded">{wf.workflow_id}</div>
              </div>
              <div className="text-[11px] text-slate-500 line-clamp-1">{wf.description || "No description provided."}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Execution Canvas */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!selectedWorkflow ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select a workflow to test and audit.</p>
          </div>
        ) : (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{selectedWorkflow.workflow_name}</h2>
                <p className="text-xs text-slate-500 mt-1">Execute with a test payload to view the step-by-step neural trace.</p>
              </div>
              <div className="flex gap-2">
                {executionResult && !executionResult.error && (
                  <button onClick={() => downloadReportMutation.mutate()} className="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded text-sm font-bold shadow-sm hover:bg-slate-50 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2v-4h2v4zm0-6h-2V8h2v2z"></path></svg>
                    Download PDF Report
                  </button>
                )}
                <button onClick={() => executeMutation.mutate()} disabled={executeMutation.isPending} className="bg-[#0176D3] text-white px-6 py-2 rounded text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {executeMutation.isPending ? 'Executing Engine...' : '▶ Run Orchestrator'}
                </button>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6">
              {/* Input Payload Area */}
              <div>
                <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-slate-200 pb-2">Initial Payload Injector (JSON format)</label>
                <textarea value={inputPayload} onChange={(e) => setInputPayload(e.target.value)} className="w-full h-32 font-mono text-[13px] text-emerald-400 bg-slate-900 border border-slate-800 rounded p-4 outline-none shadow-inner" />
              </div>

              {/* Output & Execution Trace Area */}
              {executionResult && (
                <div className="flex-1 flex flex-col gap-4 animate-fade-in">
                  <div className="grid grid-cols-2 gap-6">
                     <div className="flex flex-col">
                       <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-slate-200 pb-2">Final State Context</label>
                       <pre className="flex-1 min-h-[250px] font-mono text-[11px] text-blue-300 bg-slate-900 border border-slate-800 rounded p-4 overflow-auto shadow-inner">{JSON.stringify(executionResult.final_context || executionResult, null, 2)}</pre>
                     </div>
                     <div className="flex flex-col">
                       <label className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider mb-2 border-b border-slate-200 pb-2">Step-by-Step Execution Trace Logs</label>
                       <div className="flex-1 min-h-[250px] font-mono text-[11px] text-slate-300 bg-slate-900 border border-slate-800 rounded p-4 overflow-auto shadow-inner space-y-1.5">{executionResult.logs ? executionResult.logs.map((log: string, idx: number) => (<div key={idx} className={`${log.includes('[ERROR]') ? 'text-red-400 font-bold' : log.includes('[WARN]') ? 'text-amber-400' : 'text-slate-300'}`}>{log}</div>)) : (<div className="text-red-400 font-bold">{executionResult.error || "No logs available."}</div>)}</div>
                     </div>
                     
                     {/* Dynamic Outbound File Download Actions */}
                     {executionResult.final_context?.generated_documents && Object.keys(executionResult.final_context.generated_documents).length > 0 && (
                       <div className="col-span-2 bg-emerald-50 border border-emerald-200 p-4 rounded shadow-sm animate-slide-in-up">
                          <h3 className="text-[12px] font-extrabold text-emerald-800 uppercase tracking-wider mb-2">Outbound Files Successfully Compiled</h3>
                          <div className="flex gap-3 flex-wrap">
                            {Object.entries(executionResult.final_context.generated_documents).map(([mapperId, dataPayload]) => (
                               <button 
                                 key={mapperId}
                                 onClick={() => downloadOutboundMutation.mutate({ mapperId, data: Array.isArray(dataPayload) ? dataPayload : [dataPayload] })}
                                 className="bg-emerald-600 text-white px-4 py-2 rounded text-xs font-bold shadow-sm hover:bg-emerald-700 flex items-center gap-2 transition-colors"
                               >
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                 Download {mapperId} Document
                               </button>
                            ))}
                          </div>
                       </div>
                     )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};