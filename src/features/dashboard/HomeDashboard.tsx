import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { ProductPackageWizard } from './ProductPackageWizard';
import { PackageDashboard } from './PackageDashboard';

export const HomeDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const { isWizardOpen, setWizardOpen, setProductContext, activeProductContext, userRole } = usePlatformStore();
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
      {/* Welcome Hero Banner */}
      <div className="bg-gradient-to-r from-indigo-50/60 via-white/80 to-indigo-50/30 border border-indigo-150/40 rounded-3xl p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-glass relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="space-y-1.5 z-10">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">
            Global Operations Control Center
          </h1>
          <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-[700px]">
            Orchestrate product configuration pipelines, authorize exceptions via 4-Eye security controls, and monitor machine-learning threat anomalies in real-time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 z-10">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-100/50">
            <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping"></span>
            APIs: Operational
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-100/50">
            <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-ping"></span>
            Ledger: Synchronized
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-lg border border-purple-100/50">
            <span className="h-1.5 w-1.5 bg-purple-500 rounded-full animate-ping"></span>
            Audit Log: Secured
          </span>
        </div>
      </div>

      {/* KPI Metrics Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Active Field Attributes */}
        <div className="bg-white/80 border border-slate-150 p-6 rounded-2xl shadow-glass flex items-center justify-between group hover:border-indigo-400/50 hover:bg-white/90 hover:shadow-glass-hover hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Active Field Attributes</div>
            <div className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent group-hover:from-indigo-500 group-hover:to-indigo-750 transition-colors">
              {activeFieldsCount}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">Standardized ISO 20022 schemas</div>
          </div>
          <div className="h-12 w-12 rounded-xl bg-indigo-50/60 flex items-center justify-center text-indigo-600 border border-indigo-100/30 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
          </div>
        </div>

        {/* Compiled Business Rules */}
        <div className="bg-white/80 border border-slate-150 p-6 rounded-2xl shadow-glass flex items-center justify-between group hover:border-indigo-400/50 hover:bg-white/90 hover:shadow-glass-hover hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Compiled Business Rules</div>
            <div className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent group-hover:from-indigo-500 group-hover:to-indigo-750 transition-colors">
              {compiledRulesCount}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">Active verification matrices</div>
          </div>
          <div className="h-12 w-12 rounded-xl bg-indigo-50/60 flex items-center justify-center text-indigo-600 border border-indigo-100/30 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          </div>
        </div>

        {/* SLA Performance Rate */}
        <div className="bg-white/80 border border-slate-150 p-6 rounded-2xl shadow-glass flex items-center justify-between group hover:border-emerald-400/50 hover:bg-white/90 hover:shadow-glass-hover hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">SLA Performance Rate</div>
            <div className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent group-hover:from-emerald-500 group-hover:to-teal-400 transition-colors">
              99.98%
            </div>
            <div className="text-[10px] text-emerald-500 font-medium">✓ Intercepted threat responses</div>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50/60 flex items-center justify-center text-emerald-600 border border-emerald-100/30 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </div>
        </div>
      </div>

      {/* Asymmetric Dashboard Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2/3 width) - core workspace tables */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Product packages implementation tracker */}
          <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                Product Implementation Pipeline
              </h2>
              {activePackages.length > 0 && (
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-100/50">
                  {activePackages.length} Active
                </span>
              )}
            </div>
            
            {activePackages.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center max-w-xl mx-auto py-12">
                <div className="h-16 w-16 rounded-2xl bg-indigo-50/60 flex items-center justify-center text-indigo-600 mb-6 border border-indigo-100/30 shadow-inner">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                </div>
                <h3 className="text-slate-800 font-extrabold text-[15px] font-display">Initialize Your First Product Package</h3>
                <p className="text-slate-400 text-xs mt-2 leading-relaxed font-normal">
                  Define basic parameters (jurisdiction, base currency, and domain) to launch visual Canva studios for data mapping, formula designing, and workflow rules.
                </p>
                
                {/* Onboarding flowchart */}
                <div className="w-full grid grid-cols-5 gap-2 mt-8 mb-8">
                  {[
                    { id: 1, title: 'Context' },
                    { id: 2, title: 'ISO Fields' },
                    { id: 3, title: 'Mappers' },
                    { id: 4, title: 'Rules & Math' },
                    { id: 5, title: 'APIs' }
                  ].map((step) => (
                    <div key={step.id} className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200/60 text-slate-400 font-extrabold text-xs flex items-center justify-center shadow-sm">
                        {step.id}
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold tracking-wider">{step.title}</span>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={() => setWizardOpen(true)}
                  className="px-6 py-3 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl hover:from-indigo-750 hover:to-indigo-800 transition-all shadow-md shadow-indigo-650/15 active:scale-[0.98] flex items-center gap-1.5"
                >
                  <span className="text-sm font-semibold">+</span> Start Configuring New Product
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                    {activePackages.map((pkg: any) => {
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
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* The Governance Exception & 4-Eye Review Queue */}
          <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-[11px] font-extrabold text-rose-600 uppercase tracking-widest flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping"></span>
                Governance Exceptions & 4-Eye Review Queue
              </h2>
              {pendingTasks.length > 0 && (
                <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[10px] font-bold rounded-lg border border-rose-100/50">
                  {pendingTasks.length} Action Required
                </span>
              )}
            </div>
            
            {isLoadingGov ? (
              <div className="p-8 text-center text-slate-400 font-bold animate-pulse">Loading tasks...</div>
            ) : pendingTasks.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center py-12">
                <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 mb-4 border border-emerald-100/50 shadow-inner">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                </div>
                <h3 className="text-slate-800 font-extrabold text-[14px] font-display">Governance Inbox Clean</h3>
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed font-normal max-w-sm">
                  All transaction exceptions, rule variances, and overrides have been cryptographically signed, audited, and cleared.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                    {pendingTasks.map((task: any) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1/3 width) - executive insights and telemetry */}
        <div className="space-y-8">
          
          {/* Executive Analytics Hub */}
          {(userRole === 'C_LEVEL' || userRole === 'ADMIN') && (
            <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-xl overflow-hidden relative">
              <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                <h2 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-indigo-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  Executive Analytics Hub
                </h2>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              
              <div className="p-6">
                {globalWidgets && globalWidgets.length > 0 ? (
                  <div className="space-y-4">
                    {globalWidgets.map((widget: any) => (
                      <div key={widget.insight_id} className="bg-slate-850/80 border border-slate-850/60 p-4.5 rounded-xl hover:border-indigo-500/50 hover:shadow-indigo-950/20 transition-all duration-300 relative group cursor-pointer">
                        <div className="text-[9px] font-bold text-indigo-400 mb-1.5 uppercase tracking-wider">Predictive Anomaly</div>
                        <h3 className="text-white font-bold text-sm mb-2 font-display">{widget.insight_name}</h3>
                        <p className="text-xs text-slate-400 leading-relaxed font-normal">{widget.description}</p>
                        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center text-[10px]">
                          <span className="text-emerald-400 font-bold font-mono">+12% vs Last Month</span>
                          <button className="font-bold text-indigo-400 hover:text-white transition-colors flex items-center gap-0.5">Deep Dive ➔</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="relative flex justify-center mb-4">
                      <div className="absolute w-12 h-12 rounded-full border border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                      <div className="w-8 h-8 rounded-full bg-indigo-950 flex items-center justify-center text-indigo-400 font-extrabold text-[15px] shadow-inner">
                        ∞
                      </div>
                    </div>
                    <h4 className="text-[12px] font-bold text-slate-200">System Scanner Active</h4>
                    <p className="text-[11px] text-slate-400 mt-1.5 max-w-[220px] mx-auto leading-relaxed">
                      Machine learning models are actively monitoring transaction streams. No anomalies detected.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* System Telemetry Health Check */}
          <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                System Telemetry
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">FastAPI Portal API</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    Connected
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">SQLite Ledger</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    Synchronized
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Audit Ledger Logs</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    Secured
                  </span>
                </div>
              </div>
              
              <div className="border-t border-slate-100 pt-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Recent Logs</div>
                <div className="space-y-2 font-mono text-[9px] text-slate-400 max-h-[120px] overflow-y-auto">
                  <div className="flex justify-between">
                    <span>[SYS] Seeded database schema</span>
                    <span>Just now</span>
                  </div>
                  <div className="flex justify-between">
                    <span>[API] GET /masters/theme - 200</span>
                    <span>Just now</span>
                  </div>
                  <div className="flex justify-between">
                    <span>[API] GET /rules/ - 200</span>
                    <span>1m ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isWizardOpen && <ProductPackageWizard />}

      {/* 4-Eye Review Modal Overlay */}
      {selectedTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl w-[550px] overflow-hidden animate-slide-up flex flex-col">
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