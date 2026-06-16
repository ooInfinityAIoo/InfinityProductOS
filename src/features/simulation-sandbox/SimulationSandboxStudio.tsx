import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export const SimulationSandboxStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedSimulation, setSelectedSimulation] = useState<any>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Form State
  const [simulationName, setSimulationName] = useState('');
  const [description, setDescription] = useState('');
  const [targetWorkflowId, setTargetWorkflowId] = useState('');
  const [sampleSize, setSampleSize] = useState(1000);
  const [scenarioVariablesStr, setScenarioVariablesStr] = useState('{\n  "interest_rate_modifier": 0.05,\n  "macro_economic_flag": "RECESSION"\n}');

  // --- DYNAMIC API BINDINGS ---
  const { data: simulations, isLoading } = useQuery({
    queryKey: ['simulations'],
    queryFn: async () => (await apiClient.get('/simulations/')).data
  });

  const { data: workflowsData } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => (await apiClient.get('/workflows/')).data
  });

  // Poll the job status if we triggered a run
  const { data: activeJob } = useQuery({
    queryKey: ['simulation-job', activeJobId],
    queryFn: async () => (await apiClient.get(`/simulations/jobs/${activeJobId}`)).data,
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const data = query?.state?.data as any;
      return (data?.status === 'COMPLETED' || data?.status === 'FAILED') ? false : 3000;
    }
  });

  const createSimMutation = useMutation({
    mutationFn: async () => {
      let parsedVars = {};
      try { parsedVars = JSON.parse(scenarioVariablesStr); } 
      catch (e) { throw new Error("Invalid Scenario Variables JSON."); }

      const payload = {
        simulation_name: simulationName,
        description,
        target_workflow_id: targetWorkflowId,
        sample_size: sampleSize,
        scenario_variables: parsedVars,
        historical_dataset_source: 'SYNTHETIC_GENERATION'
      };
      return (await apiClient.post('/simulations/', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations'] });
      setIsCreating(false);
      setSimulationName('');
      setDescription('');
      setTargetWorkflowId('');
    },
    onError: (err: any) => alert(err.response?.data?.detail || err.message)
  });

  const executeSimMutation = useMutation({
    mutationFn: async (simId: string) => {
      return (await apiClient.post(`/simulations/${simId}/execute`)).data;
    },
    onSuccess: (data) => {
      setActiveJobId(data.job_id);
    }
  });

  return (
    <div className="flex gap-6 h-[750px] animate-fade-in">
      {/* Left List */}
      <div className="w-[400px] bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-amber-50 flex justify-between items-center">
          <div>
            <h2 className="text-[15px] font-extrabold text-amber-900 tracking-tight">Scenario Sandbox</h2>
            <p className="text-xs text-amber-700 mt-0.5">Air-gapped 'What If' projections.</p>
          </div>
          <button onClick={() => { setIsCreating(true); setSelectedSimulation(null); setActiveJobId(null); }} className="bg-amber-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-amber-700 transition-colors">
            + New Scenario
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? <div className="text-center text-slate-500 text-sm mt-10">Loading...</div> : simulations?.map((sim: any) => (
            <div key={sim.simulation_id} onClick={() => { setSelectedSimulation(sim); setIsCreating(false); setActiveJobId(null); }} className={`p-4 border rounded cursor-pointer transition-all shadow-sm ${selectedSimulation?.simulation_id === sim.simulation_id ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200 hover:border-amber-300'}`}>
              <div className="font-bold text-slate-800 text-[13px]">{sim.simulation_name}</div>
              <div className="text-[10px] text-slate-500 mt-1">Workflow: {sim.target_workflow_id}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Canvas */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm flex flex-col overflow-hidden relative">
        {!isCreating && !selectedSimulation && (
           <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
             <svg className="w-16 h-16 mb-4 opacity-50 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
             <p className="text-sm font-semibold text-slate-500">Select a scenario to execute synthetic forecasts.</p>
           </div>
        )}

        {isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-amber-50">
              <h2 className="text-lg font-bold text-amber-900">Define 'What If' Scenario</h2>
              <p className="text-xs text-amber-700 mt-1">Configure variable overrides to stress-test your master logic graphs safely.</p>
            </div>
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Scenario Name</label><input type="text" value={simulationName} onChange={e => setSimulationName(e.target.value)} placeholder="e.g., Q4 Rate Hike Stress Test" className="w-full text-[13px] font-semibold border border-slate-300 rounded p-2.5 outline-none focus:border-amber-500" /></div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Target Workflow to Test</label>
                  <select value={targetWorkflowId} onChange={e => setTargetWorkflowId(e.target.value)} className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none focus:border-amber-500 bg-white">
                    <option value="" disabled>Select Master Workflow...</option>
                    {workflowsData?.map((w: any) => (<option key={w.workflow_id} value={w.workflow_id}>{w.workflow_name}</option>))}
                  </select>
                </div>
              </div>
              
              <div><label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">Description / Hypothesis</label><input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Testing 5% impact on approval rates..." className="w-full text-[13px] border border-slate-300 rounded p-2.5 outline-none focus:border-amber-500" /></div>

              <div className="grid grid-cols-[1fr_200px] gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-amber-600 uppercase mb-1.5">Variable Overrides (JSON)</label>
                  <textarea value={scenarioVariablesStr} onChange={e => setScenarioVariablesStr(e.target.value)} className="w-full h-32 font-mono text-[12px] text-emerald-400 bg-slate-900 border border-slate-800 rounded p-4 outline-none shadow-inner" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-amber-600 uppercase mb-1.5">Sample Size</label>
                  <input type="number" value={sampleSize} onChange={e => setSampleSize(parseInt(e.target.value))} className="w-full text-[13px] font-mono border border-amber-300 rounded p-2.5 outline-none focus:border-amber-500 bg-amber-50" />
                  <p className="text-[10px] text-slate-500 mt-2">Number of synthetic payloads generated for this test run.</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
              <button disabled={createSimMutation.isPending || !simulationName || !targetWorkflowId} onClick={() => createSimMutation.mutate()} className="px-5 py-2.5 text-[13px] font-bold text-white bg-amber-600 rounded hover:bg-amber-700 transition-colors shadow-sm disabled:opacity-50">Save Scenario</button>
            </div>
          </div>
        )}

        {selectedSimulation && !isCreating && (
          <div className="flex flex-col h-full animate-slide-in-right">
            <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{selectedSimulation.simulation_name}</h2>
                <p className="text-xs text-slate-500 mt-1">Workflow Target: {selectedSimulation.target_workflow_id}</p>
              </div>
              <button disabled={executeSimMutation.isPending || (activeJob && activeJob.status === 'PROCESSING')} onClick={() => executeSimMutation.mutate(selectedSimulation.simulation_id)} className="px-6 py-2 bg-amber-600 text-white font-bold rounded shadow-sm hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Run Deep Simulation
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded text-sm text-slate-700 font-mono whitespace-pre-wrap shadow-inner">
                {JSON.stringify(selectedSimulation.scenario_variables, null, 2)}
              </div>

              {activeJob && (
                <div className="border border-amber-200 rounded p-6 bg-white shadow-xl animate-slide-in-up">
                   <div className="flex justify-between items-center mb-4">
                     <h3 className="text-[14px] font-extrabold text-amber-800 uppercase tracking-wider">Simulation Job Status</h3>
                     <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider border ${activeJob.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : activeJob.status === 'PROCESSING' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{activeJob.status}</span>
                   </div>
                   
                   <div className="mb-4">
                     <div className="w-full bg-slate-200 rounded-full h-2">
                       <div className="bg-amber-500 h-2 rounded-full transition-all duration-500" style={{ width: `${(activeJob.processed_records / activeJob.total_records) * 100}%` }}></div>
                     </div>
                     <div className="text-[10px] text-slate-500 mt-2 text-right">{activeJob.processed_records} / {activeJob.total_records} Simulated Transactions</div>
                   </div>

                   {activeJob.results_summary && (
                     <div className="bg-emerald-50 border border-emerald-200 p-4 rounded mt-4">
                       <h4 className="text-[11px] font-bold text-emerald-800 uppercase mb-2">Aggregated Forecast Results</h4>
                       <div className="grid grid-cols-3 gap-4">
                         <div className="bg-white p-3 rounded shadow-sm border border-emerald-100"><div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Success Rate</div><div className="text-lg font-extrabold text-emerald-600">{activeJob.results_summary.success_rate}</div></div>
                         <div className="bg-white p-3 rounded shadow-sm border border-emerald-100"><div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Cleared</div><div className="text-lg font-extrabold text-emerald-600">{activeJob.results_summary.total_successful}</div></div>
                         <div className="bg-white p-3 rounded shadow-sm border border-red-100"><div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Exceptions Generated</div><div className="text-lg font-extrabold text-red-500">{activeJob.results_summary.total_failed}</div></div>
                       </div>
                       <p className="text-[10px] italic text-emerald-700 mt-3 border-t border-emerald-100 pt-2">{activeJob.results_summary.notes}</p>
                     </div>
                   )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
