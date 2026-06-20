// WHY THIS FILE EXISTS (Batch Gateway Designer):
// Defines scheduled/file-based integration jobs — the async complement to the
// real-time API Gateway Designer. Banks run hundreds of batch jobs daily:
//   • Inbound SFTP pulls: SWIFT MT940 nostro statements, BACS return files
//   • Outbound S3 drops: settlement files to payment schemes (SEPA, RTGS)
//   • Internal batch feeds: EOD GL reconciliation files, CRM bulk updates
//   • API polls: checking a payment scheme for new acknowledgements every N minutes
//
// INTEGRATION QUADRANT MODEL (same as API Gateway):
//   direction: INBOUND (we receive) | OUTBOUND (we send)
//   scope:     EXTERNAL (outside bank) | INTERNAL (inside bank, cross-system)
//
// source_type determines the transport: SFTP | S3 | FILE_DROP | API_POLL | MQ
// schedule_cron drives Celery beat — stored as config, not hardcoded in Python.
//
// WHAT BREAKS IF REMOVED:
// No way to define or govern batch integrations. All batch configs would be
// hardcoded in Python scripts outside the platform's governance framework.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';
import { CockpitLockBanner } from '../../components/CockpitLockBanner';
import { useToast, ToastContainer } from '../../components/Toast';
import { InfinityAIHelper } from '../../components/InfinityAIHelper';

const SOURCE_TYPES = ['SFTP', 'S3', 'FILE_DROP', 'API_POLL', 'MQ'];

const SOURCE_ICONS: Record<string, string> = {
  SFTP: '🔐', S3: '☁️', FILE_DROP: '📂', API_POLL: '🔄', MQ: '📨',
};

const SOURCE_DESC: Record<string, string> = {
  SFTP: 'Secure file transfer — pull from or push to an SFTP server',
  S3: 'Cloud object storage — AWS S3 or compatible (MinIO, GCS)',
  FILE_DROP: 'Shared network folder / local directory watch',
  API_POLL: 'Periodically call an API endpoint and process the response as a batch',
  MQ: 'Message queue consumer (RabbitMQ, Kafka, IBM MQ)',
};

// Common cron presets so users don't need to write cron expressions from scratch
const CRON_PRESETS = [
  { label: 'Every hour',       value: '0 * * * *' },
  { label: 'Every 6 hours',    value: '0 */6 * * *' },
  { label: 'Daily at midnight',value: '0 0 * * *' },
  { label: 'Daily at 6pm',     value: '0 18 * * *' },
  { label: 'Weekdays 6pm EOD', value: '0 18 * * 1-5' },
  { label: 'Monday 8am',       value: '0 8 * * 1' },
];

export const BatchGatewayDesignerStudio: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeCoreProductId, activeProductContext } = usePlatformStore();
  const { toasts, showToast, dismissToast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<any>(null);

  // Form state
  const [configName, setConfigName] = useState('');
  const [description, setDescription] = useState('');
  const [direction, setDirection] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [scope, setScope] = useState<'EXTERNAL' | 'INTERNAL'>('EXTERNAL');
  const [sourceType, setSourceType] = useState('SFTP');
  const [scheduleCron, setScheduleCron] = useState('0 18 * * 1-5');
  const [retryMax, setRetryMax] = useState(3);
  const [alertEmail, setAlertEmail] = useState('');

  // Quadrant filters for the list
  const [filterDirection, setFilterDirection] = useState('ALL');
  const [filterScope, setFilterScope] = useState('ALL');

  const resetForm = () => {
    setConfigName(''); setDescription(''); setDirection('INBOUND'); setScope('EXTERNAL');
    setSourceType('SFTP'); setScheduleCron('0 18 * * 1-5'); setRetryMax(3); setAlertEmail('');
  };

  const { data: listData, isLoading } = useQuery({
    queryKey: ['batch-gateway-configs', activeProductContext],
    queryFn: async () => (await apiClient.get('/batch-gateway/')).data,
  });

  const filteredConfigs = (listData?.configurations || []).filter((c: any) => {
    if (filterDirection !== 'ALL' && c.direction !== filterDirection) return false;
    if (filterScope !== 'ALL' && c.scope !== filterScope) return false;
    return true;
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        config_name: configName, description, direction, scope,
        source_type: sourceType, schedule_cron: scheduleCron,
        retry_max_attempts: retryMax, alert_on_failure_email: alertEmail || null,
      };
      return (await apiClient.post('/batch-gateway/', payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-gateway-configs'] });
      showToast(`Batch job "${configName}" created successfully.`, 'success');
      setIsCreating(false);
      resetForm();
    },
    onError: (err: any) => showToast(err.response?.data?.detail || 'Save failed.', 'error'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await apiClient.patch(`/batch-gateway/${id}/status?new_status=${status}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-gateway-configs'] });
      showToast('Status updated.', 'success');
    },
    onError: (err: any) => showToast(err.response?.data?.detail || 'Status update failed.', 'error'),
  });

  const STATUS_META: Record<string, { color: string; label: string }> = {
    DRAFT:            { color: 'bg-slate-100 text-slate-600',    label: 'Draft' },
    PENDING_APPROVAL: { color: 'bg-amber-100 text-amber-700',    label: 'Pending Approval' },
    LIVE:             { color: 'bg-emerald-100 text-emerald-700', label: 'Live' },
    DISABLED:         { color: 'bg-red-100 text-red-600',         label: 'Disabled' },
  };

  return (
    <div className="flex flex-col w-full h-[800px]">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <InfinityAIHelper studioKey="batch-gateway-designer" />
      <CockpitLockBanner />

      <div className={`flex gap-6 flex-1 min-h-0 transition-all duration-300 ${!activeCoreProductId ? 'opacity-30 pointer-events-none grayscale' : ''}`}>

        {/* ── LEFT: Batch Job List ── */}
        <div className="w-[400px] glass-card rounded-2xl flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
              <h2 className="text-[14px] font-extrabold text-slate-800 tracking-tight">Batch Gateway Designer</h2>
              <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">Scheduled file & batch integration jobs</p>
            </div>
            <button
              onClick={() => { setIsCreating(true); setSelectedConfig(null); resetForm(); }}
              className="bg-indigo-600 text-white px-3.5 py-1.5 rounded-xl text-[11px] font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-[0.97]"
            >
              + New Job
            </button>
          </div>

          {/* Quadrant filter */}
          <div className="px-3 py-2 border-b border-slate-100 bg-white flex gap-1.5 flex-wrap">
            {(['ALL','INBOUND','OUTBOUND'] as const).map(d => (
              <button key={d} onClick={() => setFilterDirection(d)}
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${filterDirection === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                {d === 'ALL' ? 'All Direction' : d}
              </button>
            ))}
            <span className="text-slate-200 text-[10px] self-center">|</span>
            {(['ALL','EXTERNAL','INTERNAL'] as const).map(s => (
              <button key={s} onClick={() => setFilterScope(s)}
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${filterScope === s ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-slate-500 border-slate-200 hover:border-cyan-300'}`}>
                {s === 'ALL' ? 'All Scope' : s}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading ? (
              <div className="flex justify-center mt-10">
                <div className="w-6 h-6 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
              </div>
            ) : filteredConfigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center mt-16 text-slate-300">
                <div className="text-4xl mb-3">📦</div>
                <p className="text-[12px] font-bold text-slate-400">No batch jobs defined yet</p>
                <p className="text-[10px] text-slate-300 mt-1">Create your first batch integration job</p>
              </div>
            ) : filteredConfigs.map((config: any) => (
              <div
                key={config.config_id}
                onClick={() => { setSelectedConfig(config); setIsCreating(false); }}
                className={`p-4 border rounded-xl cursor-pointer transition-all ${
                  selectedConfig?.config_id === config.config_id
                    ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="text-[12px] font-bold text-slate-800 leading-snug flex items-center gap-1.5">
                    <span>{SOURCE_ICONS[config.source_type] || '📦'}</span>
                    {config.config_name}
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_META[config.status]?.color || 'bg-slate-100 text-slate-500'}`}>
                    {STATUS_META[config.status]?.label || config.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${config.direction === 'INBOUND' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                    {config.direction}
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${config.scope === 'EXTERNAL' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-cyan-50 text-cyan-700 border-cyan-200'}`}>
                    {config.scope}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">{config.source_type}</span>
                  {config.schedule_cron && <span className="text-[9px] text-slate-400 font-mono">⏱ {config.schedule_cron}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Detail / Editor ── */}
        <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">

          {/* Empty state */}
          {!isCreating && !selectedConfig && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4 shadow-inner text-3xl">📦</div>
              <p className="text-[13px] font-bold text-slate-500 mb-1">Configure a Batch Integration Job</p>
              <p className="text-[11px] text-slate-400">Select a job or create a new one to define schedule, source, and transport.</p>
            </div>
          )}

          {/* Detail view */}
          {!isCreating && selectedConfig && (
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{SOURCE_ICONS[selectedConfig.source_type] || '📦'}</span>
                    <h2 className="text-[15px] font-extrabold text-slate-800">{selectedConfig.config_name}</h2>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${STATUS_META[selectedConfig.status]?.color}`}>
                      {STATUS_META[selectedConfig.status]?.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">{selectedConfig.description || 'No description.'}</p>
                </div>
              </div>

              {/* Quadrant display */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl p-3 border ${selectedConfig.direction === 'INBOUND' ? 'bg-emerald-50 border-emerald-200' : 'bg-indigo-50 border-indigo-200'}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Direction</p>
                  <p className={`text-[13px] font-extrabold ${selectedConfig.direction === 'INBOUND' ? 'text-emerald-700' : 'text-indigo-700'}`}>
                    {selectedConfig.direction === 'INBOUND' ? '← Inbound' : '→ Outbound'}
                  </p>
                </div>
                <div className={`rounded-xl p-3 border ${selectedConfig.scope === 'EXTERNAL' ? 'bg-amber-50 border-amber-200' : 'bg-cyan-50 border-cyan-200'}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Scope</p>
                  <p className={`text-[13px] font-extrabold ${selectedConfig.scope === 'EXTERNAL' ? 'text-amber-700' : 'text-cyan-700'}`}>
                    {selectedConfig.scope}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Source Type</p>
                  <p className="text-[13px] font-bold text-slate-800">{SOURCE_ICONS[selectedConfig.source_type]} {selectedConfig.source_type}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Schedule</p>
                  <p className="text-[11px] font-mono text-slate-700">{selectedConfig.schedule_cron || 'Manual / on-demand'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Retry</p>
                  <p className="text-[13px] font-bold text-slate-800">{selectedConfig.retry_max_attempts}× / {selectedConfig.retry_backoff_sec}s backoff</p>
                </div>
              </div>

              {/* Lifecycle actions */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Lifecycle</p>
                <div className="flex gap-2 flex-wrap">
                  {selectedConfig.status === 'DRAFT' && (
                    <button onClick={() => updateStatusMutation.mutate({ id: selectedConfig.config_id, status: 'PENDING_APPROVAL' })}
                      className="px-4 py-1.5 text-[11px] font-bold bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-all">
                      Submit for Approval
                    </button>
                  )}
                  {selectedConfig.status === 'PENDING_APPROVAL' && (
                    <button onClick={() => updateStatusMutation.mutate({ id: selectedConfig.config_id, status: 'LIVE' })}
                      className="px-4 py-1.5 text-[11px] font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all">
                      Approve & Go Live
                    </button>
                  )}
                  {selectedConfig.status === 'LIVE' && (
                    <button onClick={() => updateStatusMutation.mutate({ id: selectedConfig.config_id, status: 'DISABLED' })}
                      className="px-4 py-1.5 text-[11px] font-bold bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all">
                      Disable Job
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Create form */}
          {isCreating && (
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[15px] font-extrabold text-slate-800">New Batch Job</h2>
                <button onClick={() => { setIsCreating(false); resetForm(); }} className="text-[11px] text-slate-400 hover:text-slate-600">✕ Cancel</button>
              </div>

              {/* Quadrant selector */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Integration Quadrant</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 mb-1.5">Direction</p>
                    <div className="flex gap-1.5">
                      {(['INBOUND','OUTBOUND'] as const).map(d => (
                        <button key={d} onClick={() => setDirection(d)}
                          className={`flex-1 text-[10px] font-bold py-2 rounded-lg border transition-all ${direction === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                          {d === 'INBOUND' ? '← Inbound' : '→ Outbound'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 mb-1.5">Scope</p>
                    <div className="flex gap-1.5">
                      {(['EXTERNAL','INTERNAL'] as const).map(s => (
                        <button key={s} onClick={() => setScope(s)}
                          className={`flex-1 text-[10px] font-bold py-2 rounded-lg border transition-all ${scope === s ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-slate-500 border-slate-200 hover:border-cyan-300'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[9px] text-slate-400 mt-2">
                  {direction === 'INBOUND' && scope === 'EXTERNAL' && '← We receive files/data from outside the bank (SWIFT statements, BACS returns, regulator feeds)'}
                  {direction === 'INBOUND' && scope === 'INTERNAL' && '← We receive batch data from an internal system (core banking EOD, GL feeds, CRM exports)'}
                  {direction === 'OUTBOUND' && scope === 'EXTERNAL' && '→ We send files/data outside the bank (BACS bulk payments, SEPA credits, settlement files)'}
                  {direction === 'OUTBOUND' && scope === 'INTERNAL' && '→ We send batch data to an internal system (posting to GL, updating CRM, internal report delivery)'}
                </p>
              </div>

              {/* Job name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Job Name *</label>
                <input type="text" value={configName} onChange={e => setConfigName(e.target.value)}
                  placeholder="e.g., SWIFT MT940 EOD Nostro Statement Inbound"
                  className="w-full text-[13px] font-semibold border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-400 outline-none shadow-sm" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  placeholder="What data does this job move and why?"
                  className="w-full text-[12px] border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-400 outline-none resize-none" />
              </div>

              {/* Source type */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Transport / Source Type</label>
                <div className="grid grid-cols-5 gap-2">
                  {SOURCE_TYPES.map(t => (
                    <button key={t} onClick={() => setSourceType(t)}
                      className={`p-2 rounded-xl border text-center transition-all ${sourceType === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-600'}`}>
                      <div className="text-lg mb-0.5">{SOURCE_ICONS[t]}</div>
                      <div className="text-[9px] font-bold">{t}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">{SOURCE_DESC[sourceType]}</p>
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Schedule (Cron)</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {CRON_PRESETS.map(p => (
                    <button key={p.value} onClick={() => setScheduleCron(p.value)}
                      className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-all ${scheduleCron === p.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <input type="text" value={scheduleCron} onChange={e => setScheduleCron(e.target.value)}
                  placeholder="0 18 * * 1-5"
                  className="w-full text-[12px] font-mono border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-400 outline-none" />
              </div>

              {/* Retry + alert */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Max Retry Attempts</label>
                  <div className="flex items-center gap-2">
                    {[1,2,3,5,10].map(n => (
                      <button key={n} onClick={() => setRetryMax(n)}
                        className={`w-9 h-9 rounded-lg border text-[11px] font-bold transition-all ${retryMax === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Alert Email on Failure</label>
                  <input type="email" value={alertEmail} onChange={e => setAlertEmail(e.target.value)}
                    placeholder="ops-team@bank.com"
                    className="w-full text-[12px] border border-slate-200 bg-white rounded-xl p-2.5 focus:border-indigo-400 outline-none" />
                </div>
              </div>

              {/* Save */}
              <div className="pt-2">
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !configName}
                  className="w-full py-3 text-[13px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Saving…' : 'Create Batch Job (Draft)'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
