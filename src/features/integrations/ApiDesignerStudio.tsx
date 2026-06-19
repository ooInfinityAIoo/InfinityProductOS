import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';

export const ApiDesignerStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeCoreProductId } = usePlatformStore();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedApi, setSelectedApi] = useState<any>(null);

  // Form State
  const [apiName, setApiName] = useState('');
  const [httpMethod, setHttpMethod] = useState('POST');
  const [urlTemplate, setUrlTemplate] = useState('');
  const [description, setDescription] = useState('');
  const [rateLimitRps, setRateLimitRps] = useState(10);
  const [circuitBreakerThreshold, setCircuitBreakerThreshold] = useState(5);
  const [circuitBreakerTimeout, setCircuitBreakerTimeout] = useState(60);
  const [maskPiiInBody, setMaskPiiInBody] = useState(true);

  // --- DYNAMIC API BINDINGS ---
  
  // 1. Fetch Existing API Integrations
  const { data: integrationsData, isLoading: isLoadingApis } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => (await apiClient.get('/integrations/')).data
  });

  const createApiMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        api_name: apiName,
        http_method: httpMethod,
        url_template: urlTemplate,
        description: description,
        rate_limit_rps: rateLimitRps,
        circuit_breaker_threshold: circuitBreakerThreshold,
        circuit_breaker_timeout_sec: circuitBreakerTimeout,
        mask_pii_in_body: maskPiiInBody,
      };
      const res = await apiClient.post('/integrations/', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setIsCreating(false);
      
      // Reset form
      setApiName('');
      setHttpMethod('POST');
      setUrlTemplate('');
      setDescription('');
      setRateLimitRps(10);
      setCircuitBreakerThreshold(5);
      setCircuitBreakerTimeout(60);
      setMaskPiiInBody(true);
    }
  });

  return (
    <div className="flex flex-col w-full h-[800px]">
      <CockpitLockBanner />
      <div className={`flex gap-6 flex-1 min-h-0 transition-all duration-300 ${!activeCoreProductId ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
      
      {/* Left Column: List of APIs */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Integration Hub</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configured external webhooks.</p>
          </div>
          <button 
            onClick={() => { setIsCreating(true); setSelectedApi(null); }}
            className="bg-[#0176D3] text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors"
          >
            + New Integration
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoadingApis ? (
            <div className="text-center text-slate-500 text-sm mt-10 font-bold">Loading...</div>
          ) : integrationsData?.integrations?.map((api: any) => (
            <div 
              key={api.api_id} 
              onClick={() => { setSelectedApi(api); setIsCreating(false); }}
              className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedApi?.api_id === api.api_id ? 'bg-[#F0F7FF] border-[#0176D3]' : 'bg-white border-slate-200 hover:border-[#0176D3]'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-[13px] font-bold text-slate-800">{api.api_name}</div>
                <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${api.http_method === 'GET' ? 'bg-emerald-50 text-emerald-700' : api.http_method === 'POST' ? 'bg-blue-50 text-[#0176D3]' : 'bg-amber-50 text-amber-700'}`}>{api.http_method}</div>
              </div>
              <div className="text-[11px] text-slate-500 truncate">{api.url_template}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Canvas / Editor */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!isCreating && !selectedApi && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            <p className="text-sm font-semibold text-slate-500">Select an API Integration or create a new one.</p>
          </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Design New API Integration</h2>
              <p className="text-xs text-slate-500 mt-1">Configure outbound webhooks with enterprise fault-tolerance constraints.</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-[1fr_100px] gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Integration Name</label>
                  <input type="text" value={apiName} onChange={(e) => setApiName(e.target.value)} placeholder="e.g., Core Banking Settlement API" className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Method</label>
                  <select value={httpMethod} onChange={(e) => setHttpMethod(e.target.value)} className="w-full text-[13px] font-bold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none bg-white">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">URL Endpoint Template</label>
                <input type="text" value={urlTemplate} onChange={(e) => setUrlTemplate(e.target.value)} placeholder="https://api.vendor.com/v1/settle/{account_number}" className="w-full font-mono text-[13px] text-[#0176D3] border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none" />
                <p className="text-[10px] text-slate-500 mt-1.5">Use curly braces {'{}'} to dynamically inject fields from the ISO dictionary during execution.</p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-wider mb-4">Enterprise Fault Tolerance (Layer 4)</h3>
                <div className="grid grid-cols-3 gap-6 bg-slate-50 border border-slate-200 rounded p-5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Rate Limit (Req/Sec)</label>
                    <input type="number" value={rateLimitRps} onChange={(e) => setRateLimitRps(parseInt(e.target.value))} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none" />
                    <p className="text-[10px] text-slate-400 mt-1">Global Token Bucket limit.</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Circuit Trip Threshold</label>
                    <input type="number" value={circuitBreakerThreshold} onChange={(e) => setCircuitBreakerThreshold(parseInt(e.target.value))} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none" />
                    <p className="text-[10px] text-slate-400 mt-1">Consecutive fails to open circuit.</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Timeout Cooldown (Sec)</label>
                    <input type="number" value={circuitBreakerTimeout} onChange={(e) => setCircuitBreakerTimeout(parseInt(e.target.value))} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none" />
                    <p className="text-[10px] text-slate-400 mt-1">Wait time before half-open retry.</p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-3 p-4 border border-[#CCE0FF] bg-[#F0F7FF] rounded-md cursor-pointer">
                  <input type="checkbox" checked={maskPiiInBody} onChange={(e) => setMaskPiiInBody(e.target.checked)} className="w-4 h-4 text-[#0176D3] border-slate-300 rounded focus:ring-[#0176D3]" />
                  <div>
                    <div className="text-[12px] font-bold text-[#0052CC]">Enable Dynamic Data Masking (DDM)</div>
                    <div className="text-[10px] text-[#0052CC]/70">Automatically strips and masks PII attributes from outbound payloads based on ISO Registry security tags.</div>
                  </div>
                </label>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={createApiMutation.isPending || !apiName || !urlTemplate} onClick={() => createApiMutation.mutate()} className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50">{createApiMutation.isPending ? 'Saving...' : 'Save Integration'}</button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};