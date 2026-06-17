import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { ProductPackageWizard } from './ProductPackageWizard';
import { PackageDashboard } from './PackageDashboard';

export const HomeDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const { isWizardOpen, setProductContext, activeProductContext, userRole } = usePlatformStore();
  const [selectedTask, setSelectedTask] = useState<any>(null);

  // --- DYNAMIC API BINDINGS ---
  
  // 1. Fetch Active Fields Count
  const { data: fieldsData } = useQuery({
    queryKey: ['dashboard-fields'],
    queryFn: async () => {
      const res = await apiClient.get('/fields/registry?limit=1');
      return res.data;
    }
  });

  // 2. Fetch Compiled Rules Count
  const { data: rulesData } = useQuery({
    queryKey: ['dashboard-rules'],
    queryFn: async () => {
      const res = await apiClient.get('/rules/');
      return res.data;
    }
  });

  // 3. Fetch Pending Governance Tasks (The 4-Eye Queue)
  const { data: governanceData, isLoading: isLoadingGov } = useQuery({
    queryKey: ['dashboard-governance'],
    queryFn: async () => {
      const res = await apiClient.get('/governance/tasks/pending');
      return res.data;
    }
  });
  
  // 5. Fetch Initialized Product Packages
  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => {
      return (await apiClient.get('/masters/packages')).data;
    }
  });

  // Fetch Global C-Level Insight Widgets
  const { data: globalWidgets } = useQuery({
    queryKey: ['dashboard-widgets', 'GLOBAL', userRole],
    queryFn: async () => {
      return (await apiClient.get(`/insights/widgets?dashboard_category=GLOBAL`)).data;
    }
  });

  // 4. Governance Authorization Mutation (The 4-Eye Action)
  const authorizeMutation = useMutation({
    mutationFn: async ({ taskId, action }: { taskId: string, action: 'APPROVE' | 'REJECT' }) => {
      const res = await apiClient.post(`/governance/tasks/${taskId}/authorize`, { action });
      return res.data;
    },
    onSuccess: () => {
      // Instantly refresh the queue and close the modal upon success!
      queryClient.invalidateQueries({ queryKey: ['dashboard-governance'] });
      setSelectedTask(null);
    }
  });

  // 6. Cancel Package Mutation
  const cancelPackageMutation = useMutation({
    mutationFn: async (packageId: string) => {
      await apiClient.put(`/masters/packages/${packageId}/cancel`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product-packages'] })
  });

  const pendingTasks = governanceData?.pending_tasks || [];
  const activePackages = packagesData?.packages || [];
  const activeFieldsCount = fieldsData?.total_count?.toLocaleString() || '...';
  const compiledRulesCount = rulesData?.length?.toLocaleString() || '...';

  // --- DYNAMIC ROUTING: Divert to Package Dashboard if contextualized ---
  if (activeProductContext) {
    return <PackageDashboard packageName={activeProductContext} />;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* KPI Metrics Widgets */}
      <div className="grid grid-cols-3 gap-6">
        <div className="glass-card glass-card-hover p-6 rounded-2xl">
          <div className="text-[10px] font-bold uppercase text-slate-400 mb-2 tracking-wider">Active Field Attributes</div>
          <div className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent">{activeFieldsCount}</div>
          <div className="text-[10px] text-slate-400 mt-2 font-medium">Standardized ISO 20022 schemas</div>
        </div>
        <div className="glass-card glass-card-hover p-6 rounded-2xl">
          <div className="text-[10px] font-bold uppercase text-slate-400 mb-2 tracking-wider">Compiled Business Rules</div>
          <div className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent">{compiledRulesCount}</div>
          <div className="text-[10px] text-slate-400 mt-2 font-medium">Active verification matrices</div>
        </div>
        <div className="glass-card glass-card-hover p-6 rounded-2xl">
          <div className="text-[10px] font-bold uppercase text-slate-400 mb-2 tracking-wider">SLA Performance Rate</div>
          <div className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">99.98%</div>
          <div className="text-[10px] text-emerald-500 mt-2 font-medium">✓ Intercepted threat responses</div>
        </div>
      </div>

      {/* The Governance Exception & 4-Eye Review Queue */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-[11px] font-extrabold text-rose-600 uppercase tracking-widest flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping"></span>
            Governance Exceptions & 4-Eye Review Queue
          </h2>
        </div>
        
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-400 text-[9px] uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4 font-bold">Task ID</th>
              <th className="px-6 py-4 font-bold">Exception Type</th>
              <th className="px-6 py-4 font-bold">Target Record / Payload</th>
              <th className="px-6 py-4 font-bold">Operator (Maker)</th>
              <th className="px-6 py-4 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoadingGov ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 font-bold animate-pulse">Loading tasks...</td></tr>
            ) : pendingTasks.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No pending governance tasks. Inbox zero! 🎉</td></tr>
            ) : (
              pendingTasks.map((task: any) => (
                <tr key={task.packet_id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-600">{task.packet_id}</td>
                  <td className="px-6 py-4">
                    {task.blockchain_tx_hash === 'CONCURRENT_UPDATE_CONFLICT' ? (
                      <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded-lg text-[9px] font-bold tracking-wider border border-rose-100/50 flex items-center w-max">CONCURRENCY CONFLICT</span>
                    ) : (
                      <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg text-[9px] font-bold tracking-wider border border-amber-100/50 flex items-center w-max">RULE VARIANCE</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{task.raw_payload_reference || 'N/A'}</td>
                  <td className="px-6 py-4 text-slate-600 font-semibold">{task.operator_maker}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setSelectedTask(task)}
                      className="text-[11px] font-bold text-indigo-600 border border-indigo-200/80 px-3.5 py-1.5 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm active:scale-[0.97]"
                    >Review</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* --- GLOBAL BIRD'S EYE VIEW (C-LEVEL / ADMIN ONLY) --- */}
      {(userRole === 'C_LEVEL' || userRole === 'ADMIN') && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-850 rounded-2xl shadow-xl overflow-hidden mt-8 shadow-indigo-950/5">
          <div className="p-5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2.5">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              Global Bird's Eye Insights (C-Level Executive)
            </h2>
          </div>
          <div className="p-6 grid grid-cols-3 gap-6">
             {globalWidgets && globalWidgets.length > 0 ? (
               globalWidgets.map((widget: any) => (
                <div key={widget.insight_id} className="bg-slate-850/80 border border-slate-800 p-6 rounded-xl hover:border-indigo-500/50 hover:shadow-indigo-950/20 transition-all duration-300">
                  <div className="text-[9px] font-bold text-indigo-400 mb-2.5 uppercase tracking-wider">Predictive Anomaly</div>
                  <h3 className="text-white font-bold text-sm mb-3 font-display">{widget.insight_name}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-normal">{widget.description}</p>
                  <div className="mt-5 pt-4 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-[10px] text-emerald-400 font-bold font-mono">+12% vs Last Month</span>
                    <button className="text-[10px] font-bold text-indigo-400 hover:text-white transition-colors flex items-center gap-0.5">Deep Dive ➔</button>
                  </div>
                </div>
               ))
             ) : (
               <div className="col-span-3 text-center text-slate-500 text-sm py-10 italic">No global insights currently deployed for C-Level executives.</div>
             )}
          </div>
        </div>
      )}

      {/* Product Packages Implementation Tracker */}
      <div className="glass-card rounded-2xl overflow-hidden mt-8">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">🚀 Product Implementation Pipeline</h2>
        </div>
        
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-400 text-[9px] uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4 font-bold">Package Name & Domain</th>
              <th className="px-6 py-4 font-bold">Config Progress</th>
              <th className="px-6 py-4 font-bold">Status</th>
              <th className="px-6 py-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activePackages.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">No products initialized. Click "+ Start Configuring New Product" to begin.</td></tr>
            ) : (
              activePackages.map((pkg: any) => {
                const totalMods = pkg.configuration_plan?.length || 0;
                const completedMods = pkg.configuration_plan?.filter((m:any) => m.is_configured).length || 0;
                const percent = totalMods === 0 ? 0 : Math.round((completedMods / totalMods) * 100);
                
                return (
                  <React.Fragment key={pkg.package_id}>
                    <tr className="hover:bg-slate-50/30 transition-colors bg-white/40">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800 text-[14px]">{pkg.package_name}</div>
                        <div className="text-[9px] text-slate-400 mt-1.5 uppercase font-medium tracking-wider">{pkg.business_domain} • {pkg.jurisdiction_country_code} • {pkg.base_currency_code}</div>
                      </td>
                      <td className="px-6 py-4 w-64">
                        <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1.5"><span>{percent}% Complete</span><span>{completedMods} / {totalMods} Modules</span></div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5"><div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-1.5 rounded-full" style={{ width: `${percent}%` }}></div></div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-wider border ${pkg.implementation_status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50' : pkg.implementation_status === 'IN_PROGRESS' ? 'bg-indigo-50 text-indigo-700 border-indigo-100/50' : pkg.implementation_status === 'CANCELLED' ? 'bg-slate-100 text-slate-500 border-slate-200/50' : 'bg-amber-50 text-amber-700 border-amber-100/50'}`}>{pkg.implementation_status.replace('_', ' ')}</span>
                      </td>
                      <td className="px-6 py-4 text-right flex justify-end gap-3.5">
                        <button onClick={() => setProductContext(pkg.package_name)} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-850 hover:underline">View / Edit Studio</button>
                        {pkg.implementation_status === 'IN_PROGRESS' && (
                          <button onClick={() => cancelPackageMutation.mutate(pkg.package_id)} className="text-[11px] font-bold text-red-500 hover:text-red-700 hover:underline">Cancel Config</button>
                        )}
                      </td>
                    </tr>
                    {/* The Nested Tree Structure of Configuration Modules */}
                    {pkg.configuration_plan?.map((mod: any, idx: number) => (
                      <tr key={`${pkg.package_id}-mod-${idx}`} className="bg-slate-50/30">
                        <td colSpan={4} className="px-10 py-2 border-l-2 border-indigo-500/80 ml-6 text-xs text-slate-500">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400">↳</span>
                            <span className={mod.is_configured ? 'line-through text-slate-400' : 'font-medium'}>{mod.module_name}</span>
                            <span className="bg-white/60 border border-slate-200/40 text-slate-400 text-[9px] px-2 py-0.5 rounded-lg">Owner: {mod.owner} (SLA: {mod.sla_days}d)</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isWizardOpen && <ProductPackageWizard />}

      {/* 4-Eye Review Modal Overlay */}
      {selectedTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl w-[550px] overflow-hidden animate-slide-up">
            <div className="px-6 py-4.5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-[15px] font-display">4-Eye Governance Review</h3>
              <button onClick={() => setSelectedTask(null)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 text-amber-800 border border-amber-100/50 text-xs p-3 rounded-xl font-medium shadow-sm leading-relaxed">
                You are performing a 4-Eye authorization. This action is immutable and will be cryptographically logged to the Evidence Ledger.
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Task ID</div>
                  <div className="font-mono text-indigo-600 font-bold">{selectedTask.packet_id}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Maker (Operator)</div>
                  <div className="font-semibold text-slate-700">{selectedTask.operator_maker}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Payload Reference</div>
                  <div className="font-mono text-xs text-slate-500 bg-slate-50/80 p-3 border border-slate-200/50 rounded-xl">{selectedTask.raw_payload_reference || 'N/A'}</div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4.5 bg-slate-50/80 border-t border-slate-150 flex justify-end gap-3 shadow-inner">
              <button 
                onClick={() => authorizeMutation.mutate({ taskId: selectedTask.packet_id, action: 'REJECT' })}
                disabled={authorizeMutation.isPending}
                className="px-5 py-2.5 text-[13px] font-bold text-red-650 bg-white border border-red-200/80 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
              >Reject Exception</button>
              <button 
                onClick={() => authorizeMutation.mutate({ taskId: selectedTask.packet_id, action: 'APPROVE' })}
                disabled={authorizeMutation.isPending}
                className="px-5 py-2.5 text-[13px] font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-xl hover:from-emerald-700 hover:to-emerald-800 shadow-md shadow-emerald-600/10 transition-all active:scale-[0.98] disabled:opacity-50"
              >{authorizeMutation.isPending ? 'Executing...' : 'Approve & Release'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};