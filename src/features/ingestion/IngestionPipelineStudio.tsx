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
      <div className="w-[500px] glass-card rounded-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">File Upload & Dispatcher</h2>
          <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Execute blueprinted data ingestion</p>
        </div>
        
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Payload Mapper</label>
            <select 
              value={mapperId} 
              onChange={(e) => setMapperId(e.target.value)}
              className="w-full text-[13px] text-slate-800 border border-slate-200/80 rounded-xl p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white/60 backdrop-blur-md transition-all shadow-sm"
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
            <div className="flex bg-slate-100/60 p-1.5 rounded-xl border border-slate-150 mb-4 backdrop-blur-md">
              <button 
                onClick={() => setRoutingMode('NEW')} 
                className={`flex-1 text-[11px] py-2 rounded-lg font-bold transition-all ${
                  routingMode === 'NEW' 
                    ? 'bg-white shadow-sm text-indigo-650 border border-slate-100/50' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Spawn New Transaction(s)
              </button>
              <button 
                onClick={() => setRoutingMode('RESUME')} 
                className={`flex-1 text-[11px] py-2 rounded-lg font-bold transition-all ${
                  routingMode === 'RESUME' 
                    ? 'bg-white shadow-sm text-amber-600 border border-slate-100/50' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Append to Paused Workflow
              </button>
            </div>
            
            {routingMode === 'NEW' ? (
              <div className="animate-fade-in">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Target Execution Workflow</label>
                <div className="max-h-32 overflow-y-auto border border-slate-200/80 rounded-xl p-2.5 bg-white/60 space-y-1">
                  {workflowsData?.map((w: any) => (
                    <label key={w.workflow_id} className="flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer p-1 hover:bg-slate-50 rounded">
                      <input 
                        type="checkbox" 
                        checked={workflowIds.includes(w.workflow_id)} 
                        onChange={(e) => {
                          if (e.target.checked) setWorkflowIds([...workflowIds, w.workflow_id]);
                          else setWorkflowIds(workflowIds.filter(id => id !== w.workflow_id));
                        }} 
                        className="w-3.5 h-3.5 text-indigo-600 rounded-sm border-slate-300 focus:ring-indigo-500" 
                      />
                      {w.workflow_name}
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Every record in the files will independently trigger ALL selected workflows simultaneously.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 bg-amber-50/40 border border-amber-200/50 p-4 rounded-2xl animate-fade-in">
                <div className="col-span-2">
                  <div className="text-[10px] font-bold text-amber-800 uppercase mb-1">Correlation ID (Instance ID)</div>
                  <input 
                    type="text" 
                    value={targetInstanceId} 
                    onChange={(e) => setTargetInstanceId(e.target.value)} 
                    placeholder="Comma-separated IDs (e.g., WFI-123, WFI-456)" 
                    className="w-full text-[12px] font-mono border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 bg-white/80 transition-all focus:ring-1 focus:ring-amber-500" 
                  />
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-bold text-amber-800 uppercase mb-1">Target Document Checklist Type</div>
                  <input 
                    type="text" 
                    value={documentType} 
                    onChange={(e) => setDocumentType(e.target.value)} 
                    placeholder="e.g., Signed Tax Return" 
                    className="w-full text-[12px] border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 bg-white/80 transition-all focus:ring-1 focus:ring-amber-500" 
                  />
                  <p className="text-[9px] text-amber-700 mt-1">This satisfies the prerequisite checklist configured in the Workflow Designer.</p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Payload File</label>
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-indigo-50/30 hover:border-indigo-400/80 transition-all duration-300 cursor-pointer relative shadow-inner">
              <input 
                type="file" 
                multiple
                accept=".csv,.xlsx,.xls,.xml,.pdf,.dbf,.txt,.doc,.docx"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
              <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
              <span className="text-[13px] font-bold text-indigo-650">{files.length > 0 ? `${files.length} file(s) staged` : 'Click or drag files to attach'}</span>
              <span className="text-[11px] text-slate-400 mt-1">Supports CSV, XLSX, XML, PDF, DBF, DOCX, TXT</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <button 
            disabled={files.length === 0 || !mapperId || uploadMutation.isPending || (routingMode === 'NEW' && workflowIds.length === 0)}
            onClick={() => uploadMutation.mutate()}
            className="w-full py-3 text-[13px] font-bold text-white bg-indigo-600 hover:bg-indigo-750 rounded-xl transition-all shadow-md shadow-indigo-600/10 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
          >
            {uploadMutation.isPending ? 'Queuing Upload...' : 'Dispatch to Background Worker'}
          </button>
        </div>
      </div>

      {/* Right Column: Real-Time Celery Queue Monitor */}
      <div className="flex-1 glass-card rounded-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight font-display">Active Ingestion Queue (Celery)</h2>
            <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase">Real-time polling of background workers</p>
          </div>
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-400 text-[9px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-bold">Job ID / File</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4 font-bold">Progress (Records)</th>
                <th className="px-6 py-4 font-bold text-right">Queued At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobsData?.jobs?.map((job: any) => (
                <tr key={job.job_id} className="hover:bg-slate-50/40 transition-colors bg-white/40">
                  <td className="px-6 py-4">
                    <div className="font-mono text-xs font-bold text-indigo-650">{job.job_id}</div>
                    <div className="text-[11px] text-slate-400 mt-1 font-medium">{job.filename}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-wider border ${
                      job.status === 'COMPLETED' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50' 
                        : job.status === 'PROCESSING' 
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-100/50' 
                          : job.status === 'FAILED' 
                            ? 'bg-red-50 text-red-700 border-red-100/50' 
                            : 'bg-slate-50 text-slate-550 border-slate-200/50'
                    }`}>{job.status}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs font-semibold text-slate-700">{job.processed_records} <span className="text-slate-400 font-normal">/ {job.total_records || '?'}</span></div>
                  </td>
                  <td className="px-6 py-4 text-right text-xs text-slate-400">{new Date(job.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};