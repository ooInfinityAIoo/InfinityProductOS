import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

export const ReconciliationTrackingDashboard: React.FC = () => {
  const { activeProductContext } = usePlatformStore();
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');

  // 1. Fetch available Product Packages for filtering
  const { data: packagesData } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data
  });

  // 2. Real-time Polling: Fetch Tracking Data
  const { data: trackingData, isLoading } = useQuery({
    queryKey: ['recon-tracking', selectedPackageId],
    queryFn: async () => {
      const url = selectedPackageId ? `/reconciliation/tracking?package_id=${selectedPackageId}` : '/reconciliation/tracking';
      return (await apiClient.get(url)).data;
    },
    refetchInterval: 3000 // Realtime: poll every 3 seconds
  });

  return (
    <div className="flex flex-col gap-6 h-[750px] animate-fade-in">
      {/* Header and Filter */}
      <div className="bg-white border border-slate-200 p-5 rounded shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
             <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>
             Realtime Reconciliation Tracker
          </h2>
          <p className="text-[12px] text-slate-500 mt-1">360° view of all master reconciliation jobs, SLA compliance, and failure logs.</p>
        </div>
        <div className="flex items-center gap-3">
           <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Filter by Package context:</label>
           <select value={selectedPackageId} onChange={(e) => setSelectedPackageId(e.target.value)} className="w-64 text-[13px] text-slate-900 border border-slate-300 rounded p-2 focus:border-[#0176D3] outline-none bg-slate-50">
             <option value="">Global / All Packages</option>
             {packagesData?.packages?.map((pkg: any) => (
               <option key={pkg.package_id} value={pkg.package_id}>{pkg.package_name}</option>
             ))}
           </select>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-4 gap-6 shrink-0">
        <div className="bg-white border border-slate-200 p-5 rounded shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Total Reconciliations</div>
            <div className="text-2xl font-extrabold text-[#0176D3]">{trackingData?.stats?.total || 0}</div>
          </div>
          <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg></div>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded shadow-sm flex items-center justify-between border-b-4 border-b-amber-400">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 mb-1 tracking-wider">In Progress</div>
            <div className="text-2xl font-extrabold text-amber-600">{trackingData?.stats?.processing || 0}</div>
          </div>
          <div className="h-10 w-10 bg-amber-50 rounded-full flex items-center justify-center text-amber-600"><svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></div>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded shadow-sm flex items-center justify-between border-b-4 border-b-emerald-400">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Completed Successfully</div>
            <div className="text-2xl font-extrabold text-emerald-600">{trackingData?.stats?.completed || 0}</div>
          </div>
          <div className="h-10 w-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg></div>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded shadow-sm flex items-center justify-between border-b-4 border-b-red-400">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 mb-1 tracking-wider">Failed / Exceptions</div>
            <div className="text-2xl font-extrabold text-red-600">{trackingData?.stats?.failed || 0}</div>
          </div>
          <div className="h-10 w-10 bg-red-50 rounded-full flex items-center justify-center text-red-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></div>
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 bg-white border border-slate-200 rounded shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-slate-500 font-bold">Synchronizing telemetry...</div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
                <tr>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Job ID</th>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Template & Product</th>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Status</th>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">SLA Status</th>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider w-[250px]">Live Progress</th>
                  <th className="px-6 py-3 font-bold text-slate-600 uppercase text-[11px] tracking-wider">Error Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trackingData?.tracking_jobs?.map((job: any) => {
                  const progressPct = job.total_records ? Math.round((job.processed_records / job.total_records) * 100) : 0;
                  return (
                    <tr key={job.job_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-[10px] text-slate-500">{job.job_id}</td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">{job.reconciliation_name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Cat: {job.category} | Prod: {job.product_id || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border 
                          ${job.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                            job.status === 'FAILED' ? 'bg-red-50 text-red-700 border-red-200' : 
                            'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {job.sla_status === 'BREACHED' && <span className="text-red-600 font-bold text-xs">🔴 Breached</span>}
                        {job.sla_status === 'AT_RISK' && <span className="text-amber-500 font-bold text-xs">🟡 At Risk</span>}
                        {job.sla_status === 'ON_TRACK' && <span className="text-emerald-500 font-bold text-xs">🟢 On Track</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div className={`h-2 rounded-full ${job.status === 'FAILED' ? 'bg-red-500' : 'bg-[#0176D3]'}`} style={{ width: `${progressPct}%` }}></div>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 w-8">{progressPct}%</div>
                        </div>
                        <div className="text-[9px] text-slate-400 mt-1">{job.processed_records.toLocaleString()} / {job.total_records?.toLocaleString() || '?'} records</div>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-red-500 max-w-[200px] truncate" title={job.error_message}>
                        {job.error_message || '-'}
                      </td>
                    </tr>
                  );
                })}
                {trackingData?.tracking_jobs?.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">No reconciliation jobs found for this package.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};