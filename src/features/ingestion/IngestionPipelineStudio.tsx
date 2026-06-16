import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const IngestionPipelineStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [mapperId, setMapperId] = useState<string>('');
  const [workflowIds, setWorkflowIds] = useState<string[]>([]);
  
  // Advanced Routing State
  const [routingMode, setRoutingMode] = useState<'NEW' | 'RESUME'>('NEW');
  const [targetInstanceId, setTargetInstanceId] = useState<string>('');
  const [documentType, setDocumentType] = useState<string>('');

  // --- DYNAMIC API BINDINGS ---
  const { data: mappersData } = useQuery({
    queryKey: ['mappers'],
    queryFn: async () => (await apiClient.get('/mappers/')).data
  });

  const { data: workflowsData } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => (await apiClient.get('/workflows/')).data
  });

  // Real-time polling: Fetches Celery job status every 3 seconds!
  const { data: jobsData } = useQuery({
    queryKey: ['ingestion-jobs'],
    queryFn: async () => (await apiClient.get('/ingestion/jobs/')).data,
    refetchInterval: 3000
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (files.length === 0 || !mapperId) throw new Error('Missing required fields');
      if (routingMode === 'NEW' && workflowIds.length === 0) throw new Error('At least one target workflow required.');
      if (routingMode === 'RESUME' && (!targetInstanceId || !documentType)) throw new Error('Correlation ID and Document Type required to resume.');
      
      const formData = new FormData();
      files.forEach(f => formData.append('files', f)); // Append multiple files
      
      // Pass convergence metadata via query params for the backend router to relay to Celery
      const targetWorkflowsStr = workflowIds.join(',');
      const url = routingMode === 'NEW' 
        ? `/ingestion/files/${mapperId}/${targetWorkflowsStr}` 
        : `/ingestion/files/${mapperId}/resume?instance_id=${targetInstanceId}&document_type=${encodeURIComponent(documentType)}`;
        
      const res = await apiClient.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: () => {
      setFiles([]); // Clear staged files
      setTargetInstanceId('');
      setDocumentType('');
      queryClient.invalidateQueries({ queryKey: ['ingestion-jobs'] });
    }
  });

  return (
    <div className="flex gap-6 h-[750px]">
      
      {/* Left Column: File Upload Configurator */}
      <div className="w-[500px] bg-white border border-slate-200 rounded shadow-sm flex flex-col">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-[15px] font-extrabold text-[#0176D3] tracking-tight">File Upload & Dispatcher</h2>
          <p className="text-xs text-slate-500 mt-1">Execute your pre-configured Structured and Unstructured blueprints by uploading live data files.</p>
        </div>
        
        <div className="p-6 space-y-5 flex-1">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Payload Mapper</label>
            <select 
              value={mapperId} 
              onChange={(e) => setMapperId(e.target.value)}
              className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none bg-white"
            >
              <option value="" disabled>Select Mapper Blueprint...</option>
              {mappersData?.mappers?.map((m: any) => (
                <option key={m.mapper_id} value={m.mapper_id}>{m.mapper_name} ({m.source_format} {"->"} {m.target_format})</option>
              ))}
            </select>
          </div>

          {/* Routing Mode Toggle */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Orchestration Routing Strategy</label>
            <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200 mb-4">
              <button onClick={() => setRoutingMode('NEW')} className={`flex-1 text-xs py-2 rounded font-bold transition-all ${routingMode === 'NEW' ? 'bg-white shadow text-[#0176D3]' : 'text-slate-500 hover:text-slate-700'}`}>Spawn New Transaction(s)</button>
              <button onClick={() => setRoutingMode('RESUME')} className={`flex-1 text-xs py-2 rounded font-bold transition-all ${routingMode === 'RESUME' ? 'bg-white shadow text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}>Append to Paused Workflow</button>
            </div>
            
            {routingMode === 'NEW' ? (
              <div className="animate-fade-in">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Target Execution Workflow</label>
                <div className="max-h-32 overflow-y-auto border border-slate-300 rounded p-2 bg-white space-y-1">
                  {workflowsData?.map((w: any) => (
                    <label key={w.workflow_id} className="flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer p-1 hover:bg-slate-50 rounded">
                      <input type="checkbox" checked={workflowIds.includes(w.workflow_id)} onChange={(e) => {
                        if (e.target.checked) setWorkflowIds([...workflowIds, w.workflow_id]);
                        else setWorkflowIds(workflowIds.filter(id => id !== w.workflow_id));
                      }} className="w-3.5 h-3.5 text-[#0176D3] rounded-sm" />
                      {w.workflow_name}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">Every record in the files will independently trigger ALL selected workflows simultaneously.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 bg-amber-50 border border-amber-200 p-3 rounded animate-fade-in">
                <div className="col-span-2">
                  <div className="text-[10px] font-bold text-amber-800 uppercase mb-1">Correlation ID (Instance ID)</div>
                  <input type="text" value={targetInstanceId} onChange={(e) => setTargetInstanceId(e.target.value)} placeholder="Comma-separated IDs (e.g., WFI-123, WFI-456)" className="w-full text-[12px] font-mono border border-amber-300 rounded p-2 outline-none focus:border-amber-500 bg-white" />
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-bold text-amber-800 uppercase mb-1">Target Document Checklist Type</div>
                  <input type="text" value={documentType} onChange={(e) => setDocumentType(e.target.value)} placeholder="e.g., Signed Tax Return" className="w-full text-[12px] border border-amber-300 rounded p-2 outline-none focus:border-amber-500 bg-white" />
                  <p className="text-[9px] text-amber-700 mt-1">This satisfies the prerequisite checklist configured in the Workflow Designer.</p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Payload File</label>
            <div className="border-2 border-dashed border-slate-300 rounded-md p-6 flex flex-col items-center justify-center bg-slate-50 hover:bg-blue-50 hover:border-[#0176D3] transition-colors cursor-pointer relative">
              <input 
                type="file" 
                multiple
                accept=".csv,.xlsx,.xls,.xml,.pdf,.dbf,.txt,.doc,.docx"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
              <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
              <span className="text-[13px] font-bold text-[#0176D3]">{files.length > 0 ? `${files.length} file(s) staged` : 'Click or drag files to attach'}</span>
              <span className="text-[11px] text-slate-500 mt-1">Supports CSV, XLSX, XML, PDF, DBF, DOCX, TXT</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button 
            disabled={files.length === 0 || !mapperId || uploadMutation.isPending || (routingMode === 'NEW' && workflowIds.length === 0)}
            onClick={() => uploadMutation.mutate()}
            className="w-full py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Queuing Upload...' : 'Dispatch to Background Worker'}
          </button>
        </div>
      </div>

      {/* Right Column: Real-Time Celery Queue Monitor */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Active Ingestion Queue (Celery)</h2>
            <p className="text-xs text-slate-500 mt-1">Real-time polling of distributed background parsing tasks.</p>
          </div>
          <span className="flex h-3 w-3"><span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-bold">Job ID / File</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Progress (Records)</th>
                <th className="px-4 py-3 font-bold text-right">Queued At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobsData?.jobs?.map((job: any) => (
                <tr key={job.job_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4"><div className="font-mono text-xs font-bold text-[#0176D3]">{job.job_id}</div><div className="text-[11px] text-slate-500">{job.filename}</div></td>
                  <td className="px-4 py-4"><span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider border ${job.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : job.status === 'PROCESSING' ? 'bg-blue-50 text-[#0176D3] border-blue-100' : job.status === 'FAILED' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{job.status}</span></td>
                  <td className="px-4 py-4"><div className="text-xs font-semibold text-slate-700">{job.processed_records} <span className="text-slate-400 font-normal">/ {job.total_records || '?'}</span></div></td>
                  <td className="px-4 py-4 text-right text-xs text-slate-500">{new Date(job.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};