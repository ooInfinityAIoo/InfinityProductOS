import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const IngestionPipelineStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [mapperId, setMapperId] = useState<string>('');
  const [workflowId, setWorkflowId] = useState<string>('');

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
      if (!file || !mapperId || !workflowId) throw new Error('Missing required fields');
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post(`/ingestion/files/${mapperId}/${workflowId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: () => {
      setFile(null); // Clear staged file
      queryClient.invalidateQueries({ queryKey: ['ingestion-jobs'] });
    }
  });

  return (
    <div className="flex gap-6 h-[750px]">
      
      {/* Left Column: File Upload Configurator */}
      <div className="w-[450px] bg-white border border-slate-200 rounded shadow-sm flex flex-col">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Stage New Ingestion</h2>
          <p className="text-xs text-slate-500 mt-1">Upload CSV, XML, PDF, or DBF files for background extraction and processing.</p>
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
                <option key={m.mapper_id} value={m.mapper_id}>{m.mapper_name} ({m.source_format} -> {m.target_format})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Target Execution Workflow</label>
            <select 
              value={workflowId} 
              onChange={(e) => setWorkflowId(e.target.value)}
              className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none bg-white"
            >
              <option value="" disabled>Select Orchestration Flow...</option>
              {workflowsData?.map((w: any) => (
                <option key={w.workflow_id} value={w.workflow_id}>{w.workflow_name}</option>
              ))}
            </select>
          </div>

          <div className="pt-2">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Payload File</label>
            <div className="border-2 border-dashed border-slate-300 rounded-md p-6 flex flex-col items-center justify-center bg-slate-50 hover:bg-blue-50 hover:border-[#0176D3] transition-colors cursor-pointer relative">
              <input 
                type="file" 
                accept=".csv,.xlsx,.xml,.pdf,.dbf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
              />
              <svg className="w-8 h-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
              <span className="text-[13px] font-bold text-[#0176D3]">{file ? file.name : 'Click or drag file to attach'}</span>
              <span className="text-[11px] text-slate-500 mt-1">Supports CSV, XLSX, XML, PDF, DBF</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button 
            disabled={!file || !mapperId || !workflowId || uploadMutation.isPending}
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