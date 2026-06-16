import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const AiAssistantStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [intent, setIntent] = useState<'RULE' | 'INSIGHT' | 'REPORT' | 'COMMAND'>('RULE');
  const [responseLog, setResponseLog] = useState<any>(null);

  // --- DYNAMIC AI BINDINGS ---
  const aiMutation = useMutation({
    mutationFn: async () => {
      let endpoint = '';
      if (intent === 'RULE') endpoint = '/assistant/prompt-to-rule';
      else if (intent === 'INSIGHT') endpoint = '/assistant/prompt-to-insight';
      else if (intent === 'REPORT') endpoint = '/assistant/prompt-to-report';
      else endpoint = '/assistant/execute-command';

      const res = await apiClient.post(endpoint, { prompt });
      return res.data;
    },
    onSuccess: (data) => {
      setResponseLog(data);
      // Invalidate relevant caches to refresh other canvases behind the scenes!
      if (intent === 'RULE') queryClient.invalidateQueries({ queryKey: ['rules'] });
      if (intent === 'INSIGHT') queryClient.invalidateQueries({ queryKey: ['insights'] });
      if (intent === 'REPORT') queryClient.invalidateQueries({ queryKey: ['reports'] });
      setPrompt(''); // Clear prompt for next command
    },
    onError: (err: any) => {
      setResponseLog({ 
        error: err.response?.data?.detail || err.message,
        hint: "Check if you provided a valid format, or if your OpenAI API key is configured correctly in the backend .env file."
      });
    }
  });

  return (
    <div className="flex gap-6 h-[750px]">
      
      {/* Left Column: Natural Language Input */}
      <div className="w-[500px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-indigo-50 flex items-center gap-3">
          <div className="bg-indigo-600 text-white rounded p-2 shadow-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </div>
          <div>
            <h2 className="text-[15px] font-extrabold text-indigo-900 tracking-tight">Infinity AI Copilot</h2>
            <p className="text-xs text-indigo-700/70 mt-0.5">Prompt-to-Canvas Engine</p>
          </div>
        </div>
        
        <div className="p-6 flex-1 flex flex-col space-y-6">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">1. Select AI Intent</label>
            <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
              <button onClick={() => setIntent('RULE')} className={`flex-1 text-xs py-2 rounded font-bold transition-all ${intent === 'RULE' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>Business Rule</button>
              <button onClick={() => setIntent('INSIGHT')} className={`flex-1 text-xs py-2 rounded font-bold transition-all ${intent === 'INSIGHT' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>Smart Insight</button>
              <button onClick={() => setIntent('REPORT')} className={`flex-1 text-xs py-2 rounded font-bold transition-all ${intent === 'REPORT' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>BI Report</button>
              <button onClick={() => setIntent('COMMAND')} className={`flex-1 text-xs py-2 rounded font-bold transition-all ${intent === 'COMMAND' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>Sys Command</button>
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">2. Natural Language Prompt</label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                intent === 'RULE' ? "e.g., 'If the transaction amount is greater than 10000 then require manager approval.'" :
                intent === 'INSIGHT' ? "e.g., 'Detect similar subscriptions to alert the customer.'" :
                intent === 'REPORT' ? "e.g., 'Create a pie chart showing total payment volume by currency.'" :
                "e.g., 'Add GBP currency'"
              }
              className="flex-1 w-full text-[14px] text-slate-900 border border-slate-300 rounded-md p-4 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none shadow-inner"
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button 
            disabled={!prompt || aiMutation.isPending}
            onClick={() => aiMutation.mutate()}
            className="w-full py-3 text-[13px] font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {aiMutation.isPending ? 'Generating Assets...' : '✨ Generate Configuration Blueprint'}
          </button>
        </div>
      </div>

      {/* Right Column: AI Output Terminal */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded shadow-xl flex flex-col overflow-hidden relative">
        <div className="p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          </div>
          <h2 className="text-[11px] font-mono text-slate-400">assistant_terminal.log</h2>
        </div>

        <div className="p-6 flex-1 overflow-y-auto font-mono text-[13px] leading-relaxed text-emerald-400 whitespace-pre-wrap">
          {!responseLog && (
            <div className="text-slate-600">
              $ Waiting for natural language command...<br/>
              $ Select an intent and click Generate.
            </div>
          )}
          
          {responseLog && (
            JSON.stringify(responseLog, null, 2)
          )}
        </div>
      </div>
    </div>
  );
};