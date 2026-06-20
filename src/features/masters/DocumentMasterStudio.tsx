import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

export const DocumentMasterStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [documentName, setDocumentName] = useState('');
  const [documentFormat, setDocumentFormat] = useState('ANY');
  const [description, setDescription] = useState('');

  const { data: docsData, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await apiClient.get('/documents/')).data
  });

  const createDocMutation = useMutation({
    mutationFn: async () => {
      const payload = { document_name: documentName, document_format: documentFormat, description };
      return (await apiClient.post('/documents/', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setDocumentName('');
      setDocumentFormat('ANY');
      setDescription('');
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Save failed.")
  });

  return (
    <div className="flex gap-6 h-[750px] animate-fade-in">
      <InfinityAIHelper studioKey="document-master" />
      {/* Left List */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50">
          <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Document Checklist Definition</h2>
          <p className="text-xs text-slate-500 mt-0.5">Centralized master records for workflow prerequisites.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading Documents...</div>
          ) : docsData?.map((doc: any) => (
            <div key={doc.document_id} className="p-4 border border-slate-200 rounded shadow-sm bg-white flex justify-between items-center">
              <div>
                <div className="text-[13px] font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                  {doc.document_name}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">{doc.description || "No description provided."}</div>
              </div>
              <div className="text-[10px] font-mono text-[#0176D3] bg-blue-50 px-2 py-1 rounded font-bold">{doc.document_format}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Form */}
      <div className="w-[450px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Register Checklist Document</h2>
          <p className="text-xs text-slate-500 mt-1">Define standardized file requirements.</p>
        </div>
        <div className="p-6 flex-1 space-y-5">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Document Name</label>
            <input type="text" value={documentName} onChange={e => setDocumentName(e.target.value)} placeholder="e.g., W-2 Tax Statement" className="w-full text-[13px] font-semibold border border-slate-300 rounded p-2.5 outline-none focus:border-[#0176D3]" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Expected Format</label>
            <select value={documentFormat} onChange={e => setDocumentFormat(e.target.value)} className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none focus:border-[#0176D3] bg-white">
              <option value="ANY">Any Format</option>
              <option value="PDF">PDF Only</option>
              <option value="EXCEL">Excel (.xls, .xlsx)</option>
              <option value="CSV">CSV</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Provide context for this document requirement..." className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none focus:border-[#0176D3]"></textarea>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button disabled={createDocMutation.isPending || !documentName} onClick={() => createDocMutation.mutate()} className="px-6 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 w-full">Save Document Type</button>
        </div>
      </div>
    </div>
  );
};