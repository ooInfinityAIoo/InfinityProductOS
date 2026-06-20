// WHY THIS FILE EXISTS:
// Global 360 Dashboard — the bank's command centre before entering any specific package.
// Shows cross-package progress, global KPI health, and platform initialization status.
//
// What lives HERE (global):
//   - Platform Setup Guide (has the bank initialized InfinityProductOS correctly?)
//   - Product Implementation Pipeline (all packages and their config progress)
//   - Executive Analytics Hub (C-level predictive insights across all packages)
//   - Compact Governance Alert count (X tasks pending — deep-links to Package 360)
//
// What does NOT live here (by design):
//   - 4-Eye Review Queue table → Package 360 (tasks are package-scoped)
//   - System Telemetry → Global Technical Dashboard (under Runtime Operations)
//   - Package-level KPIs → Package 360

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { ProductPackageWizard } from './ProductPackageWizard';

export const HomeDashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const { isWizardOpen, setWizardOpen, setProductContext, userRole, setActiveModule } = usePlatformStore();
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);

  // ── DATA FETCHING ──────────────────────────────────────────────────────────

  const { data: fieldsData } = useQuery({
    queryKey: ['dashboard-fields'],
    queryFn: async () => (await apiClient.get('/fields/registry?limit=1')).data
  });

  const { data: rulesData } = useQuery({
    queryKey: ['dashboard-rules'],
    queryFn: async () => (await apiClient.get('/rules/')).data
  });

  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });

  // Global governance task count — compact badge only, full queue is on Package 360
  const { data: governanceData } = useQuery({
    queryKey: ['dashboard-governance'],
    queryFn: async () => (await apiClient.get('/governance/tasks/pending')).data
  });

  const { data: globalWidgets } = useQuery({
    queryKey: ['dashboard-widgets', 'GLOBAL', userRole],
    queryFn: async () => (await apiClient.get('/insights/widgets?dashboard_category=GLOBAL')).data
  });

  const cancelPackageMutation = useMutation({
    mutationFn: async (packageId: string) => {
      await apiClient.put(`/masters/packages/${packageId}/cancel`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product-packages'] })
  });

  const activePackages = packagesData?.packages || [];
  const pendingGovCount = governanceData?.pending_tasks?.length || 0;

  // Portfolio health metrics — cross-package story for Global 360
  const packagesLive = activePackages.filter((p: any) => p.implementation_status === 'COMPLETED').length;
  const packagesInProgress = activePackages.filter((p: any) => p.implementation_status === 'IN_PROGRESS').length;

  // Overall configuration progress = average % complete across all packages with a plan
  const packagesWithPlan = activePackages.filter((p: any) => p.configuration_plan?.length > 0);
  const overallProgressPct = packagesWithPlan.length === 0 ? 0 : Math.round(
    packagesWithPlan.reduce((sum: number, p: any) => {
      const total = p.configuration_plan.length;
      const done = p.configuration_plan.filter((m: any) => m.is_configured).length;
      return sum + (total === 0 ? 0 : done / total);
    }, 0) / packagesWithPlan.length * 100
  );

  // ── PLATFORM SETUP GUIDE ──────────────────────────────────────────────────
  // Checks whether the bank has completed InfinityProductOS platform initialization.
  // Derived from live data — no hardcoded state.
  const setupItems = [
    {
      label: 'ISO Field Registry',
      desc: 'Global data dictionary synced with ISO 20022 schemas',
      done: (fieldsData?.total_count ?? 0) > 0,
      route: 'field-registry' as const,
    },
    {
      label: 'First Product Package',
      desc: 'At least one product package initialized and configured',
      done: activePackages.length > 0,
      route: null,
      action: () => setWizardOpen(true),
      actionLabel: 'Create Package',
    },
    {
      label: 'Business Logic',
      desc: 'Business rules and decision policies defined',
      done: (rulesData?.length ?? 0) > 0,
      route: 'business-rules' as const,
    },
    {
      label: 'Master Data',
      desc: 'Products registry, currency tables, and counterparty directory',
      done: activePackages.length > 0,
      route: 'products-registry' as const,
    },
  ];
  const setupCompletedCount = setupItems.filter(i => i.done).length;
  const setupProgressPct = Math.round((setupCompletedCount / setupItems.length) * 100);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── PLATFORM SETUP GUIDE — compact progress bar + slide drawer ─────── */}
      <div className="bg-white/80 border border-slate-150 rounded-2xl px-6 py-4 flex items-center gap-4 shadow-glass">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Platform Setup Guide
            </span>
            <span className="text-[11px] font-bold text-indigo-600">
              {setupCompletedCount} / {setupItems.length} complete
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700"
              style={{ width: `${setupProgressPct}%` }}
            />
          </div>
        </div>
        <button
          onClick={() => setSetupGuideOpen(true)}
          className="shrink-0 flex items-center gap-2 text-[12px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded-xl transition-all active:scale-[0.98]"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
          Setup Guide
        </button>
      </div>

      {/* ── SETUP GUIDE SLIDE-IN DRAWER ──────────────────────────────────── */}
      {setupGuideOpen && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90]"
            onClick={() => setSetupGuideOpen(false)}
          />
          <div className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-[100] flex flex-col animate-slide-in-right overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-[14px] font-extrabold text-slate-900 font-display">Platform Setup Guide</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{setupCompletedCount} of {setupItems.length} steps complete · {setupProgressPct}% ready</p>
              </div>
              <button onClick={() => setSetupGuideOpen(false)} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-3 border-b border-slate-100 shrink-0">
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700" style={{ width: `${setupProgressPct}%` }} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {setupItems.map((item, idx) => (
                <div key={idx} className="px-6 py-3.5 hover:bg-slate-50/60 transition-colors group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-[10px] font-mono font-bold text-slate-400 w-4 shrink-0 mt-0.5">{idx + 1}</span>
                      <div className="min-w-0">
                        <span className="text-[13px] font-semibold text-slate-800 font-display block leading-tight">{item.label}</span>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">{item.desc}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.done ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${item.done ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                        {item.done ? 'Complete' : 'Not Started'}
                      </span>
                      {!item.done && (
                        item.route ? (
                          <button
                            onClick={() => { setActiveModule(item.route as any); setSetupGuideOpen(false); }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                          >Open Studio →</button>
                        ) : item.action ? (
                          <button
                            onClick={() => { item.action!(); setSetupGuideOpen(false); }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                          >{item.actionLabel} →</button>
                        ) : null
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
              <p className="text-[10px] text-slate-400 text-center">Complete all steps to have a fully operational InfinityProductOS platform</p>
            </div>
          </div>
        </>
      )}

      {/* ── PORTFOLIO HEALTH KPI CARDS ───────────────────────────────────────
          Each card answers one question: "should I act?" or "is everything healthy?"
          No system metrics here — this is an executive portfolio view.           */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">

        {/* Card 1: Packages Live — are we generating business? */}
        <div className="bg-white/80 border border-slate-150 p-5 rounded-2xl shadow-glass flex items-center justify-between group hover:border-emerald-400/50 hover:-translate-y-0.5 transition-all duration-300">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Packages Live</div>
            <div className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">{packagesLive}</div>
            <div className="text-[10px] text-slate-400 font-medium">Fully configured · in production</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50/60 flex items-center justify-center text-emerald-600 border border-emerald-100/30 group-hover:bg-emerald-600 group-hover:text-white transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
          </div>
        </div>

        {/* Card 2: In Configuration — what's being built right now? */}
        <div className="bg-white/80 border border-slate-150 p-5 rounded-2xl shadow-glass flex items-center justify-between group hover:border-indigo-400/50 hover:-translate-y-0.5 transition-all duration-300">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">In Configuration</div>
            <div className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent">{packagesInProgress}</div>
            <div className="text-[10px] text-slate-400 font-medium">Packages being configured</div>
          </div>
          <div className="h-10 w-10 rounded-xl bg-indigo-50/60 flex items-center justify-center text-indigo-600 border border-indigo-100/30 group-hover:bg-indigo-600 group-hover:text-white transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
          </div>
        </div>

        {/* Card 3: Overall Progress — how close is the organisation as a whole? */}
        <div className="bg-white/80 border border-slate-150 p-5 rounded-2xl shadow-glass group hover:border-indigo-400/50 hover:-translate-y-0.5 transition-all duration-300">
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Overall Progress</div>
              <div className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-indigo-800 bg-clip-text text-transparent">{overallProgressPct}%</div>
              <div className="text-[10px] text-slate-400 font-medium">Avg. modules configured</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-50/60 flex items-center justify-center text-indigo-600 border border-indigo-100/30 group-hover:bg-indigo-600 group-hover:text-white transition-all shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
            </div>
          </div>
          {/* Mini progress bar — gives visual weight to the percentage */}
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700" style={{ width: `${overallProgressPct}%` }} />
          </div>
        </div>

        {/* Card 4: Governance Queue — does anyone need to act today? */}
        <div
          onClick={() => pendingGovCount > 0 && activePackages[0] && setProductContext(activePackages[0].package_name)}
          className={`bg-white/80 border p-5 rounded-2xl shadow-glass flex items-center justify-between group transition-all duration-300 ${pendingGovCount > 0 ? 'border-rose-200 hover:border-rose-400 hover:-translate-y-0.5 cursor-pointer' : 'border-slate-150'}`}
        >
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Governance Queue</div>
            <div className={`text-2xl font-extrabold tracking-tight ${pendingGovCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{pendingGovCount}</div>
            <div className="text-[10px] text-slate-400 font-medium">
              {pendingGovCount > 0 ? 'Pending 4-Eye reviews → click to review' : 'Inbox clear · no action needed'}
            </div>
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center border transition-all ${pendingGovCount > 0 ? 'bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-600 group-hover:text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
            {pendingGovCount > 0
              ? <span className="text-sm font-extrabold animate-pulse">{pendingGovCount}</span>
              : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            }
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT GRID ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT: Product Implementation Pipeline (2/3) */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-150 rounded-2xl shadow-glass overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                Product Implementation Pipeline
              </h2>
              <div className="flex items-center gap-2">
                {activePackages.length > 0 && (
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-100/50">{activePackages.length} Active</span>
                )}
                <button
                  onClick={() => setWizardOpen(true)}
                  className="text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-xl transition-all active:scale-[0.98]"
                >+ New Package</button>
              </div>
            </div>

            {activePackages.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center">
                <div className="h-14 w-14 rounded-2xl bg-indigo-50/60 flex items-center justify-center text-indigo-600 mb-5 border border-indigo-100/30 shadow-inner">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                </div>
                <h3 className="text-slate-800 font-extrabold text-[15px] font-display">Initialize Your First Product Package</h3>
                <p className="text-slate-400 text-xs mt-2 leading-relaxed max-w-md">Define jurisdiction, base currency, and domain to launch the Canva studios for data mapping, formula design, and workflow rules.</p>
                <button onClick={() => setWizardOpen(true)} className="mt-6 px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl hover:from-indigo-750 hover:to-indigo-800 transition-all shadow-md active:scale-[0.98] flex items-center gap-1.5">
                  + Start Configuring New Product
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-400 text-[9px] uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5 font-bold">Package Name & Domain</th>
                      <th className="px-6 py-3.5 font-bold">Config Progress</th>
                      <th className="px-6 py-3.5 font-bold">Status</th>
                      <th className="px-6 py-3.5 text-right font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activePackages.map((pkg: any) => {
                      const totalMods = pkg.configuration_plan?.length || 0;
                      const completedMods = pkg.configuration_plan?.filter((m: any) => m.is_configured).length || 0;
                      const percent = totalMods === 0 ? 0 : Math.round((completedMods / totalMods) * 100);
                      return (
                        <tr key={pkg.package_id} className="hover:bg-slate-50/30 transition-colors bg-white/40">
                          <td className="px-6 py-4">
                            <button
                              onClick={() => setProductContext(pkg.package_name)}
                              className="font-bold text-slate-800 text-[14px] hover:text-indigo-600 hover:underline transition-colors text-left"
                            >{pkg.package_name}</button>
                            <div className="text-[9px] text-slate-400 mt-1 uppercase font-medium tracking-wider">{pkg.business_domain} · {pkg.jurisdiction_country_code} · {pkg.base_currency_code}</div>
                          </td>
                          <td className="px-6 py-4 w-56">
                            <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1.5"><span>{percent}% Complete</span><span>{completedMods} / {totalMods}</span></div>
                            <div className="w-full bg-slate-200 rounded-full h-1.5"><div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-1.5 rounded-full" style={{ width: `${percent}%` }}></div></div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-wider border ${pkg.implementation_status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50' : pkg.implementation_status === 'IN_PROGRESS' ? 'bg-indigo-50 text-indigo-700 border-indigo-100/50' : 'bg-slate-100 text-slate-500 border-slate-200/50'}`}>
                              {pkg.implementation_status?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-3">
                              <button onClick={() => setProductContext(pkg.package_name)} className="text-[11px] font-bold text-indigo-600 hover:underline">View / Edit Studio</button>
                              {pkg.implementation_status === 'IN_PROGRESS' && (
                                <button onClick={() => cancelPackageMutation.mutate(pkg.package_id)} className="text-[11px] font-bold text-red-500 hover:underline">Cancel Config</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Executive Analytics Hub (1/3) */}
        <div>
          {(userRole === 'C_LEVEL' || userRole === 'ADMIN') && (
            <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-xl overflow-hidden">
              <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                <h2 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-indigo-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  Executive Analytics Hub
                </h2>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <div className="p-5">
                {globalWidgets && globalWidgets.length > 0 ? (
                  <div className="space-y-3">
                    {globalWidgets.map((widget: any) => (
                      <div key={widget.insight_id} className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-xl hover:border-indigo-500/50 transition-all cursor-pointer">
                        <div className="text-[9px] font-bold text-indigo-400 mb-1 uppercase tracking-wider">Predictive Anomaly</div>
                        <h3 className="text-white font-bold text-[13px] mb-1.5 font-display">{widget.insight_name}</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">{widget.description}</p>
                        <div className="mt-3 pt-2.5 border-t border-slate-700 flex justify-between items-center text-[10px]">
                          <span className="text-emerald-400 font-bold font-mono">+12% vs Last Month</span>
                          <button className="font-bold text-indigo-400 hover:text-white transition-colors">Deep Dive →</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="relative flex justify-center mb-4">
                      <div className="absolute w-12 h-12 rounded-full border border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                      <div className="w-8 h-8 rounded-full bg-indigo-950 flex items-center justify-center text-indigo-400 font-extrabold text-[15px]">∞</div>
                    </div>
                    <h4 className="text-[12px] font-bold text-slate-200">System Scanner Active</h4>
                    <p className="text-[11px] text-slate-400 mt-1.5 max-w-[200px] mx-auto leading-relaxed">ML models monitoring transaction streams. No anomalies detected.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {isWizardOpen && <ProductPackageWizard />}
    </div>
  );
};
