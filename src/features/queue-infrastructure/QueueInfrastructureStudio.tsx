// WHY THIS COMPONENT EXISTS:
// Queue Infrastructure Studio — the admin control panel for the entire external
// message queue layer. Banks need to configure three things before queue-driven
// payment workflows can run:
//
//   1. External Connections  — the physical TCP/TLS socket to IBM MQ, Kafka, TIBCO,
//                              Oracle AQ, or SWIFT Alliance Gateway.
//   2. Message Queues        — logical queue definitions (MASTER → CHILD → DLQ hierarchy)
//                              with SLA timers, entitlements, and message format.
//   3. Routing Rules         — response code → workflow state transition rules
//                              (pacs.002 ACSC → COMPLETE, RJCT:AC01 → REPAIR queue, etc.)
//
// Without this studio, a system administrator would need to call raw REST APIs to
// set up the queue infrastructure. This gives them a visual interface with a test-
// connection button, queue hierarchy tree, and priority-ordered routing rule editor.
//
// WHAT BREAKS IF REMOVED: PUBLISH_TO_QUEUE, AWAIT_QUEUE_RESPONSE, and ROUTE_ON_RESPONSE
// workflow step_types cannot be configured from the UI — queues must be set up via
// raw API calls only.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExternalConnection {
  connection_id: string;
  connection_name: string;
  description?: string;
  provider: string;
  connection_params: Record<string, any>;
  credential_ref?: string;
  tls_enabled: boolean;
  max_reconnect_attempts: number;
  reconnect_interval_sec: number;
  heartbeat_interval_sec?: number;
  package_id?: string;
  status: string;
  created_at: string;
}

interface MessageQueue {
  queue_id: string;
  queue_name: string;
  queue_code: string;
  description?: string;
  queue_type: string;
  parent_queue_id?: string;
  external_connection_id?: string;
  physical_queue_name?: string;
  message_format: string;
  exception_category?: string;
  package_id?: string;
  product_id?: string;
  sla_minutes?: number;
  on_sla_breach_action: string;
  escalation_queue_id?: string;
  allowed_role_ids: string[];
  allowed_user_ids: string[];
  administrator_role_ids: string[];
  max_retry_count: number;
  retry_interval_sec: number;
  status: string;
  created_at: string;
}

interface RoutingRule {
  rule_id: string;
  queue_id: string;
  rule_name: string;
  description?: string;
  match_field: string;
  match_pattern: string;
  match_type: string;
  target_workflow_state: string;
  target_queue_id?: string;
  alert_queue_administrators: boolean;
  priority: number;
  status: string;
}

// ── Provider metadata ─────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { label: string; color: string; badge: string; status: string }> = {
  KAFKA:          { label: 'Apache Kafka',      color: 'bg-emerald-100 text-emerald-700 border-emerald-200', badge: '✓ Functional', status: 'bg-emerald-500' },
  IBM_MQ:         { label: 'IBM MQ',            color: 'bg-blue-100 text-blue-700 border-blue-200',         badge: 'Stub',         status: 'bg-amber-400'  },
  TIBCO_EMS:      { label: 'TIBCO EMS',         color: 'bg-purple-100 text-purple-700 border-purple-200',   badge: 'Stub',         status: 'bg-amber-400'  },
  ORACLE_AQ:      { label: 'Oracle AQ',         color: 'bg-red-100 text-red-700 border-red-200',            badge: 'Stub',         status: 'bg-amber-400'  },
  SWIFT_ALLIANCE: { label: 'SWIFT Alliance',    color: 'bg-sky-100 text-sky-700 border-sky-200',            badge: 'Stub',         status: 'bg-amber-400'  },
  RABBITMQ:       { label: 'RabbitMQ',          color: 'bg-orange-100 text-orange-700 border-orange-200',   badge: 'Stub',         status: 'bg-amber-400'  },
  ACTIVEMQ:       { label: 'ActiveMQ',          color: 'bg-yellow-100 text-yellow-700 border-yellow-200',   badge: 'Stub',         status: 'bg-amber-400'  },
};

const QUEUE_TYPE_META: Record<string, { icon: string; color: string }> = {
  MASTER:     { icon: '📦', color: 'text-indigo-600' },
  CHILD:      { icon: '↳',  color: 'text-slate-500'  },
  DLQ:        { icon: '💀', color: 'text-red-500'    },
  RESPONSE:   { icon: '↩️', color: 'text-emerald-600' },
  ESCALATION: { icon: '🚨', color: 'text-rose-600'   },
};

const WORKFLOW_STATES = ['COMPLETE', 'REPAIR', 'COMPLIANCE_HOLD', 'FUNDS_HOLD',
  'AWAITING_RESPONSE', 'FAILED', 'ESCALATION', 'MANUAL'];

const MATCH_TYPES = ['EXACT', 'STARTSWITH', 'CONTAINS', 'REGEX'];

const MESSAGE_FORMATS = ['ISO_20022', 'SWIFT_FIN', 'NACHA', 'CHIPS', 'JSON', 'XML', 'PROPRIETARY'];

// ── Blank form defaults ───────────────────────────────────────────────────────

const blankConn = (): Partial<ExternalConnection> => ({
  connection_name: '', provider: 'KAFKA', connection_params: {}, tls_enabled: true,
  max_reconnect_attempts: 5, reconnect_interval_sec: 30,
});

const blankQueue = (): Partial<MessageQueue> => ({
  queue_name: '', queue_code: '', queue_type: 'MASTER', message_format: 'ISO_20022',
  on_sla_breach_action: 'ALERT', allowed_role_ids: [], allowed_user_ids: [],
  administrator_role_ids: [], max_retry_count: 3, retry_interval_sec: 60,
});

const blankRule = (queueId: string): Partial<RoutingRule> => ({
  queue_id: queueId, rule_name: '', match_field: 'TxSts', match_pattern: '',
  match_type: 'EXACT', target_workflow_state: 'COMPLETE',
  alert_queue_administrators: false, priority: 100,
});

// ── Main Studio ───────────────────────────────────────────────────────────────

type Tab = 'connections' | 'queues' | 'routing';

export const QueueInfrastructureStudio: React.FC = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('connections');

  // ── Connections tab state
  const [selectedConn, setSelectedConn] = useState<ExternalConnection | null>(null);
  const [connForm, setConnForm] = useState<Partial<ExternalConnection>>(blankConn());
  const [connMode, setConnMode] = useState<'view' | 'edit' | 'new'>('view');
  const [testResult, setTestResult] = useState<{ healthy: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // ── Queues tab state
  const [selectedQueue, setSelectedQueue] = useState<MessageQueue | null>(null);
  const [queueForm, setQueueForm] = useState<Partial<MessageQueue>>(blankQueue());
  const [queueMode, setQueueMode] = useState<'view' | 'edit' | 'new'>('view');

  // ── Routing Rules tab state
  const [rulesQueueId, setRulesQueueId] = useState<string>('');
  const [ruleForm, setRuleForm] = useState<Partial<RoutingRule> | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: connsData, isLoading: loadingConns } = useQuery({
    queryKey: ['queue-connections'],
    queryFn: () => apiClient.get('/queues/connections').then(r => r.data),
  });
  const connections: ExternalConnection[] = connsData?.connections ?? [];

  const { data: queuesData, isLoading: loadingQueues } = useQuery({
    queryKey: ['message-queues'],
    queryFn: () => apiClient.get('/queues/message-queues').then(r => r.data),
  });
  const allQueues: MessageQueue[] = queuesData?.queues ?? [];

  const { data: rulesData } = useQuery({
    queryKey: ['routing-rules', rulesQueueId],
    queryFn: () => apiClient.get(`/queues/routing-rules${rulesQueueId ? `?queue_id=${rulesQueueId}` : ''}`).then(r => r.data),
    enabled: tab === 'routing',
  });
  const routingRules: RoutingRule[] = rulesData?.rules ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createConn = useMutation({
    mutationFn: (d: any) => apiClient.post('/queues/connections', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['queue-connections'] }); setConnMode('view'); },
  });
  const updateConn = useMutation({
    mutationFn: ({ id, d }: any) => apiClient.patch(`/queues/connections/${id}`, d).then(r => r.data),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['queue-connections'] }); setSelectedConn(data); setConnMode('view'); },
  });

  const createQueue = useMutation({
    mutationFn: (d: any) => apiClient.post('/queues/message-queues', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['message-queues'] }); setQueueMode('view'); },
  });
  const updateQueue = useMutation({
    mutationFn: ({ id, d }: any) => apiClient.patch(`/queues/message-queues/${id}`, d).then(r => r.data),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['message-queues'] }); setSelectedQueue(data); setQueueMode('view'); },
  });

  const createRule = useMutation({
    mutationFn: (d: any) => apiClient.post('/queues/routing-rules', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['routing-rules', rulesQueueId] }); setRuleForm(null); },
  });
  const updateRule = useMutation({
    mutationFn: ({ id, d }: any) => apiClient.patch(`/queues/routing-rules/${id}`, d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['routing-rules', rulesQueueId] }); setRuleForm(null); },
  });
  const deleteRule = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/queues/routing-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routing-rules', rulesQueueId] }),
  });

  // ── Test Connection ───────────────────────────────────────────────────────
  const testConnection = async (connId: string) => {
    setTesting(true); setTestResult(null);
    try {
      const r = await apiClient.post(`/queues/connections/${connId}/test`);
      setTestResult({ healthy: r.data.healthy, message: r.data.message });
    } catch (e: any) {
      setTestResult({ healthy: false, message: e.message });
    } finally { setTesting(false); }
  };

  // ── Queue hierarchy helpers ───────────────────────────────────────────────
  const masterQueues = allQueues.filter(q => q.queue_type === 'MASTER');
  const childrenOf = (parentId: string) => allQueues.filter(q => q.parent_queue_id === parentId);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Queue Infrastructure</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure external MQ connections, logical queues, and response routing rules for payment workflows.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Kafka active
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block ml-2" />Stub (needs SDK)
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6">
        {([
          { key: 'connections', label: '🔌 External Connections', count: connections.length },
          { key: 'queues',      label: '📬 Message Queues',       count: allQueues.length },
          { key: 'routing',     label: '🔀 Routing Rules',        count: routingRules.length },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors mr-1 ${
              tab === t.key
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── CONNECTIONS TAB ─────────────────────────────────────────────── */}
        {tab === 'connections' && (
          <>
            {/* List */}
            <div className="w-72 border-r border-slate-200 bg-white flex flex-col">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Connections</span>
                <button
                  onClick={() => { setConnForm(blankConn()); setSelectedConn(null); setTestResult(null); setConnMode('new'); }}
                  className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                >+ New</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loadingConns && <div className="p-4 text-xs text-slate-400">Loading…</div>}
                {connections.map(c => {
                  const meta = PROVIDER_META[c.provider] ?? { label: c.provider, color: 'bg-slate-100 text-slate-600 border-slate-200', badge: '', status: 'bg-slate-400' };
                  return (
                    <button
                      key={c.connection_id}
                      onClick={() => { setSelectedConn(c); setConnForm(c); setTestResult(null); setConnMode('view'); }}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedConn?.connection_id === c.connection_id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${meta.status}`} />
                        <span className="text-xs font-semibold text-slate-800 truncate">{c.connection_name}</span>
                      </div>
                      <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
                {!loadingConns && connections.length === 0 && (
                  <div className="p-4 text-xs text-slate-400 text-center">
                    No connections configured.<br />Create one to enable queue-driven workflows.
                  </div>
                )}
              </div>
            </div>

            {/* Detail / Form */}
            <div className="flex-1 overflow-y-auto p-6">
              {connMode === 'view' && !selectedConn && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <div className="text-5xl mb-3">🔌</div>
                  <p className="text-sm font-medium">Select a connection or create a new one</p>
                  <p className="text-xs mt-1">Each connection links to a physical MQ system (IBM MQ, Kafka, TIBCO, Oracle AQ, SWIFT).</p>
                </div>
              )}

              {(connMode === 'edit' || connMode === 'new' || (connMode === 'view' && selectedConn)) && (
                <div className="max-w-2xl">
                  {/* View mode header */}
                  {connMode === 'view' && selectedConn && (
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h2 className="text-base font-bold text-slate-800">{selectedConn.connection_name}</h2>
                        <p className="text-xs text-slate-500 mt-0.5">{selectedConn.description || 'No description'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => testConnection(selectedConn.connection_id)}
                          disabled={testing}
                          className="text-xs px-3 py-1.5 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 font-semibold disabled:opacity-50"
                        >
                          {testing ? 'Testing…' : '⚡ Test Connection'}
                        </button>
                        <button
                          onClick={() => { setConnForm({ ...selectedConn }); setConnMode('edit'); }}
                          className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold"
                        >Edit</button>
                      </div>
                    </div>
                  )}

                  {/* Test result banner */}
                  {testResult && (
                    <div className={`mb-4 px-4 py-3 rounded-lg text-xs font-semibold border ${testResult.healthy ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {testResult.healthy ? '✓ Connected' : '✗ Failed'} — {testResult.message}
                    </div>
                  )}

                  {/* Form / read-only display */}
                  {connMode === 'view' && selectedConn ? (
                    <div className="space-y-4">
                      {/* Provider badge */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Provider</div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const meta = PROVIDER_META[selectedConn.provider] ?? { label: selectedConn.provider, color: 'bg-slate-100 text-slate-600 border-slate-200', badge: '' };
                            return (
                              <>
                                <span className={`px-2 py-0.5 rounded border text-xs font-bold ${meta.color}`}>{meta.label}</span>
                                <span className="text-xs text-slate-500">{meta.badge}</span>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Connection params */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Connection Parameters</div>
                        <pre className="text-xs text-slate-700 bg-slate-50 rounded-lg p-3 overflow-x-auto">
                          {JSON.stringify(selectedConn.connection_params, null, 2)}
                        </pre>
                      </div>

                      {/* Settings summary */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">TLS</div>
                          <div className={`text-xs font-semibold ${selectedConn.tls_enabled ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {selectedConn.tls_enabled ? 'Enabled' : 'Disabled'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reconnect Attempts</div>
                          <div className="text-xs text-slate-700">{selectedConn.max_reconnect_attempts}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reconnect Interval</div>
                          <div className="text-xs text-slate-700">{selectedConn.reconnect_interval_sec}s</div>
                        </div>
                      </div>

                      {selectedConn.credential_ref && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Vault Reference (ADR #2)</div>
                          <div className="text-xs font-mono text-amber-700">{selectedConn.credential_ref}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Edit / New form */
                    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                      <h2 className="text-sm font-bold text-slate-700">
                        {connMode === 'new' ? 'New External Connection' : 'Edit Connection'}
                      </h2>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Connection Name *</label>
                          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={connForm.connection_name ?? ''} onChange={e => setConnForm(f => ({ ...f, connection_name: e.target.value }))} placeholder="e.g. IBM MQ — SWIFT Gateway" />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Provider *</label>
                          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={connForm.provider ?? 'KAFKA'} onChange={e => setConnForm(f => ({ ...f, provider: e.target.value }))}>
                            {Object.entries(PROVIDER_META).map(([k, v]) => (
                              <option key={k} value={k}>{v.label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">TLS Enabled</label>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => setConnForm(f => ({ ...f, tls_enabled: !f.tls_enabled }))}
                              className={`relative w-10 h-5 rounded-full transition-colors ${connForm.tls_enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${connForm.tls_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                            <span className="text-xs text-slate-600">{connForm.tls_enabled ? 'Enabled' : 'Disabled'}</span>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Connection Parameters (JSON) *</label>
                          <textarea
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono h-28"
                            value={typeof connForm.connection_params === 'string' ? connForm.connection_params : JSON.stringify(connForm.connection_params ?? {}, null, 2)}
                            onChange={e => { try { setConnForm(f => ({ ...f, connection_params: JSON.parse(e.target.value) })); } catch { setConnForm(f => ({ ...f, connection_params: e.target.value as any })); } }}
                            placeholder={`{\n  "bootstrap_servers": "localhost:9092",\n  "group_id": "infinity-payments"\n}`}
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Credential Vault Reference (ADR #2)</label>
                          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono" value={connForm.credential_ref ?? ''} onChange={e => setConnForm(f => ({ ...f, credential_ref: e.target.value }))} placeholder="VAULT/KAFKA/SASL_PASSWORD  — never paste the actual secret" />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Max Reconnect Attempts</label>
                          <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={connForm.max_reconnect_attempts ?? 5} onChange={e => setConnForm(f => ({ ...f, max_reconnect_attempts: +e.target.value }))} />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Reconnect Interval (sec)</label>
                          <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={connForm.reconnect_interval_sec ?? 30} onChange={e => setConnForm(f => ({ ...f, reconnect_interval_sec: +e.target.value }))} />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => {
                            if (connMode === 'new') createConn.mutate(connForm);
                            else if (selectedConn) updateConn.mutate({ id: selectedConn.connection_id, d: connForm });
                          }}
                          disabled={createConn.isPending || updateConn.isPending}
                          className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {createConn.isPending || updateConn.isPending ? 'Saving…' : 'Save Connection'}
                        </button>
                        <button onClick={() => setConnMode('view')} className="text-xs px-3 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── QUEUES TAB ──────────────────────────────────────────────────── */}
        {tab === 'queues' && (
          <>
            {/* Hierarchy tree */}
            <div className="w-72 border-r border-slate-200 bg-white flex flex-col">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Queue Hierarchy</span>
                <button
                  onClick={() => { setQueueForm(blankQueue()); setSelectedQueue(null); setQueueMode('new'); }}
                  className="text-xs px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                >+ New</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loadingQueues && <div className="p-4 text-xs text-slate-400">Loading…</div>}
                {masterQueues.map(mq => (
                  <div key={mq.queue_id}>
                    {/* Master queue row */}
                    <button
                      onClick={() => { setSelectedQueue(mq); setQueueForm(mq); setQueueMode('view'); }}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 ${selectedQueue?.queue_id === mq.queue_id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{QUEUE_TYPE_META[mq.queue_type]?.icon ?? '📬'}</span>
                        <span className="text-xs font-semibold text-slate-800 truncate">{mq.queue_name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 ml-5">
                        <span className="text-[10px] text-slate-400 font-mono">{mq.queue_code}</span>
                        <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-500">{mq.message_format}</span>
                      </div>
                    </button>
                    {/* Children */}
                    {childrenOf(mq.queue_id).map(cq => (
                      <button
                        key={cq.queue_id}
                        onClick={() => { setSelectedQueue(cq); setQueueForm(cq); setQueueMode('view'); }}
                        className={`w-full text-left pl-8 pr-4 py-2 border-b border-slate-100/60 hover:bg-slate-50 ${selectedQueue?.queue_id === cq.queue_id ? 'bg-indigo-50 border-l-2 border-l-indigo-300' : ''}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs ${QUEUE_TYPE_META[cq.queue_type]?.color ?? ''}`}>{QUEUE_TYPE_META[cq.queue_type]?.icon ?? '↳'}</span>
                          <span className="text-xs text-slate-600 truncate">{cq.queue_name}</span>
                        </div>
                        {cq.exception_category && (
                          <span className="ml-3 text-[10px] px-1 rounded bg-rose-50 text-rose-600 border border-rose-100">{cq.exception_category}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
                {/* Queues without a parent that aren't MASTER */}
                {allQueues.filter(q => !q.parent_queue_id && q.queue_type !== 'MASTER').map(q => (
                  <button
                    key={q.queue_id}
                    onClick={() => { setSelectedQueue(q); setQueueForm(q); setQueueMode('view'); }}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 ${selectedQueue?.queue_id === q.queue_id ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{QUEUE_TYPE_META[q.queue_type]?.icon ?? '📬'}</span>
                      <span className="text-xs font-semibold text-slate-800 truncate">{q.queue_name}</span>
                      <span className={`text-[10px] px-1 rounded bg-slate-100 ${QUEUE_TYPE_META[q.queue_type]?.color}`}>{q.queue_type}</span>
                    </div>
                  </button>
                ))}
                {!loadingQueues && allQueues.length === 0 && (
                  <div className="p-4 text-xs text-slate-400 text-center">
                    No queues defined.<br />Create a MASTER queue first, then add CHILD / DLQ / RESPONSE queues under it.
                  </div>
                )}
              </div>
            </div>

            {/* Queue detail / form */}
            <div className="flex-1 overflow-y-auto p-6">
              {queueMode === 'view' && !selectedQueue && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <div className="text-5xl mb-3">📬</div>
                  <p className="text-sm font-medium">Select a queue or create a new one</p>
                  <p className="text-xs mt-1 text-center max-w-sm">
                    Start with a MASTER queue (e.g. SWIFT_OUTBOUND), then add CHILD exception queues (AML, FUNDS, DUPLICATE) and a DLQ.
                  </p>
                </div>
              )}

              {(queueMode !== 'view' || selectedQueue) && (
                <div className="max-w-2xl">
                  {queueMode === 'view' && selectedQueue ? (
                    <>
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{QUEUE_TYPE_META[selectedQueue.queue_type]?.icon}</span>
                            <h2 className="text-base font-bold text-slate-800">{selectedQueue.queue_name}</h2>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">{selectedQueue.queue_code}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 ml-7">{selectedQueue.description || 'No description'}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setTab('routing'); setRulesQueueId(selectedQueue.queue_id); }}
                            className="text-xs px-3 py-1.5 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 font-semibold"
                          >🔀 Routing Rules</button>
                          <button
                            onClick={() => { setQueueForm({ ...selectedQueue }); setQueueMode('edit'); }}
                            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold"
                          >Edit</button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        {[
                          { label: 'Type', value: selectedQueue.queue_type },
                          { label: 'Format', value: selectedQueue.message_format },
                          { label: 'SLA', value: selectedQueue.sla_minutes ? `${selectedQueue.sla_minutes} min` : '—' },
                          { label: 'SLA Breach Action', value: selectedQueue.on_sla_breach_action },
                          { label: 'Max Retries', value: selectedQueue.max_retry_count },
                          { label: 'Retry Interval', value: `${selectedQueue.retry_interval_sec}s` },
                        ].map(item => (
                          <div key={item.label} className="bg-white rounded-lg border border-slate-200 p-3">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</div>
                            <div className="text-xs font-semibold text-slate-700 mt-1">{item.value}</div>
                          </div>
                        ))}
                      </div>

                      {selectedQueue.allowed_role_ids.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Allowed Roles</div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedQueue.allowed_role_ids.map(r => (
                              <span key={r} className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">{r}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Edit / New form */
                    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                      <h2 className="text-sm font-bold text-slate-700">
                        {queueMode === 'new' ? 'New Message Queue' : 'Edit Queue'}
                      </h2>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Queue Name *</label>
                          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={queueForm.queue_name ?? ''} onChange={e => setQueueForm(f => ({ ...f, queue_name: e.target.value }))} placeholder="e.g. SWIFT Outbound" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Queue Code *</label>
                          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono" value={queueForm.queue_code ?? ''} onChange={e => setQueueForm(f => ({ ...f, queue_code: e.target.value.toUpperCase() }))} placeholder="SWIFT_OUTBOUND" />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Type *</label>
                          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={queueForm.queue_type ?? 'MASTER'} onChange={e => setQueueForm(f => ({ ...f, queue_type: e.target.value }))}>
                            {Object.keys(QUEUE_TYPE_META).map(t => <option key={t}>{t}</option>)}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Message Format</label>
                          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={queueForm.message_format ?? 'ISO_20022'} onChange={e => setQueueForm(f => ({ ...f, message_format: e.target.value }))}>
                            {MESSAGE_FORMATS.map(f => <option key={f}>{f}</option>)}
                          </select>
                        </div>

                        {queueForm.queue_type !== 'MASTER' && (
                          <div>
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Parent Queue</label>
                            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={queueForm.parent_queue_id ?? ''} onChange={e => setQueueForm(f => ({ ...f, parent_queue_id: e.target.value || undefined }))}>
                              <option value="">— none —</option>
                              {masterQueues.map(q => <option key={q.queue_id} value={q.queue_id}>{q.queue_name}</option>)}
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">External Connection</label>
                          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={queueForm.external_connection_id ?? ''} onChange={e => setQueueForm(f => ({ ...f, external_connection_id: e.target.value || undefined }))}>
                            <option value="">— none —</option>
                            {connections.map(c => <option key={c.connection_id} value={c.connection_id}>{c.connection_name}</option>)}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Physical Queue Name</label>
                          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono" value={queueForm.physical_queue_name ?? ''} onChange={e => setQueueForm(f => ({ ...f, physical_queue_name: e.target.value }))} placeholder="Actual queue name on MQ system" />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">SLA (minutes)</label>
                          <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={queueForm.sla_minutes ?? ''} onChange={e => setQueueForm(f => ({ ...f, sla_minutes: e.target.value ? +e.target.value : undefined }))} placeholder="e.g. 240" />
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">SLA Breach Action</label>
                          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={queueForm.on_sla_breach_action ?? 'ALERT'} onChange={e => setQueueForm(f => ({ ...f, on_sla_breach_action: e.target.value }))}>
                            <option>ALERT</option><option>ESCALATE</option><option>BOTH</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Exception Category</label>
                          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={queueForm.exception_category ?? ''} onChange={e => setQueueForm(f => ({ ...f, exception_category: e.target.value || undefined }))}>
                            <option value="">— none —</option>
                            {['AML', 'OFAC', 'FUNDS', 'DUPLICATE', 'FORMAT', 'RATE', 'MANUAL', 'ESCALATION'].map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Max Retry Count</label>
                          <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={queueForm.max_retry_count ?? 3} onChange={e => setQueueForm(f => ({ ...f, max_retry_count: +e.target.value }))} />
                        </div>

                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Allowed Roles (comma-separated)</label>
                          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={(queueForm.allowed_role_ids ?? []).join(', ')} onChange={e => setQueueForm(f => ({ ...f, allowed_role_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="ADMIN, OPERATOR, RISK" />
                        </div>

                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Administrator Roles (comma-separated)</label>
                          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs" value={(queueForm.administrator_role_ids ?? []).join(', ')} onChange={e => setQueueForm(f => ({ ...f, administrator_role_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="ADMIN" />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => {
                            if (queueMode === 'new') createQueue.mutate(queueForm);
                            else if (selectedQueue) updateQueue.mutate({ id: selectedQueue.queue_id, d: queueForm });
                          }}
                          disabled={createQueue.isPending || updateQueue.isPending}
                          className="text-xs px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {createQueue.isPending || updateQueue.isPending ? 'Saving…' : 'Save Queue'}
                        </button>
                        <button onClick={() => setQueueMode('view')} className="text-xs px-3 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ROUTING RULES TAB ───────────────────────────────────────────── */}
        {tab === 'routing' && (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Queue selector */}
            <div className="flex items-center gap-3 mb-5">
              <label className="text-xs font-semibold text-slate-600">Queue:</label>
              <select
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs min-w-52"
                value={rulesQueueId}
                onChange={e => setRulesQueueId(e.target.value)}
              >
                <option value="">— All queues —</option>
                {allQueues.map(q => <option key={q.queue_id} value={q.queue_id}>{q.queue_name} ({q.queue_code})</option>)}
              </select>
              {rulesQueueId && (
                <button
                  onClick={() => setRuleForm(blankRule(rulesQueueId))}
                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                >+ Add Rule</button>
              )}
              <span className="text-xs text-slate-400 ml-auto">Rules evaluated in priority order (lowest first). First match wins.</span>
            </div>

            {/* Add / Edit rule form */}
            {ruleForm && (
              <div className="bg-white rounded-xl border border-indigo-200 p-4 mb-5">
                <h3 className="text-xs font-bold text-indigo-700 mb-3">{ruleForm.rule_id ? 'Edit Rule' : 'New Routing Rule'}</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Rule Name</label>
                    <input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={ruleForm.rule_name ?? ''} onChange={e => setRuleForm(f => f && ({ ...f, rule_name: e.target.value }))} placeholder="e.g. Settlement Complete" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Priority</label>
                    <input type="number" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={ruleForm.priority ?? 100} onChange={e => setRuleForm(f => f && ({ ...f, priority: +e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Match Field</label>
                    <input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono" value={ruleForm.match_field ?? 'TxSts'} onChange={e => setRuleForm(f => f && ({ ...f, match_field: e.target.value }))} placeholder="TxSts" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Match Type</label>
                    <select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={ruleForm.match_type ?? 'EXACT'} onChange={e => setRuleForm(f => f && ({ ...f, match_type: e.target.value }))}>
                      {MATCH_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Match Pattern</label>
                    <input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono" value={ruleForm.match_pattern ?? ''} onChange={e => setRuleForm(f => f && ({ ...f, match_pattern: e.target.value }))} placeholder="ACSC" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Target Workflow State</label>
                    <select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={ruleForm.target_workflow_state ?? 'COMPLETE'} onChange={e => setRuleForm(f => f && ({ ...f, target_workflow_state: e.target.value }))}>
                      {WORKFLOW_STATES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Route to Exception Queue</label>
                    <select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={ruleForm.target_queue_id ?? ''} onChange={e => setRuleForm(f => f && ({ ...f, target_queue_id: e.target.value || undefined }))}>
                      <option value="">— none —</option>
                      {allQueues.filter(q => q.queue_type !== 'MASTER').map(q => <option key={q.queue_id} value={q.queue_id}>{q.queue_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      if (ruleForm.rule_id) updateRule.mutate({ id: ruleForm.rule_id, d: ruleForm });
                      else createRule.mutate(ruleForm);
                    }}
                    disabled={createRule.isPending || updateRule.isPending}
                    className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {createRule.isPending || updateRule.isPending ? 'Saving…' : 'Save Rule'}
                  </button>
                  <button onClick={() => setRuleForm(null)} className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            )}

            {/* Rules table */}
            {routingRules.length > 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2.5 text-left font-bold text-slate-500 w-12">#</th>
                      <th className="px-3 py-2.5 text-left font-bold text-slate-500">Rule Name</th>
                      <th className="px-3 py-2.5 text-left font-bold text-slate-500">Match</th>
                      <th className="px-3 py-2.5 text-left font-bold text-slate-500">Target State</th>
                      <th className="px-3 py-2.5 text-left font-bold text-slate-500">Exception Queue</th>
                      <th className="px-3 py-2.5 text-left font-bold text-slate-500 w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routingRules.map((rule, i) => (
                      <tr key={rule.rule_id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="px-3 py-2.5">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">{rule.priority}</span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-700">{rule.rule_name}</td>
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-slate-500">{rule.match_field}</span>
                          <span className="mx-1 text-slate-300">|</span>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">{rule.match_type}</span>
                          <span className="ml-1 font-mono text-indigo-600 font-bold">{rule.match_pattern}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            rule.target_workflow_state === 'COMPLETE' ? 'bg-emerald-100 text-emerald-700' :
                            rule.target_workflow_state === 'ESCALATION' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{rule.target_workflow_state}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 font-mono text-[10px]">
                          {rule.target_queue_id ? allQueues.find(q => q.queue_id === rule.target_queue_id)?.queue_code ?? rule.target_queue_id : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <button onClick={() => setRuleForm({ ...rule })} className="text-[10px] px-2 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100">Edit</button>
                            <button onClick={() => { if (confirm('Delete this routing rule?')) deleteRule.mutate(rule.rule_id); }} className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100">Del</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
                <div className="text-4xl mb-2">🔀</div>
                <p className="text-sm font-medium">No routing rules yet</p>
                <p className="text-xs mt-1">Select a RESPONSE queue above and add rules to map pacs.002 response codes to workflow states.</p>
              </div>
            )}

            {/* Quick reference */}
            <div className="mt-5 bg-slate-800 rounded-xl p-4">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">pacs.002 Quick Reference</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {[
                  ['TxSts = ACSC', 'Accepted Settlement Completed → COMPLETE'],
                  ['TxSts = ACCP', 'Accepted Customer Profile → AWAITING_RESPONSE'],
                  ['TxSts = PDNG', 'Pending → AWAITING_RESPONSE (reset SLA)'],
                  ['TxSts = RJCT + RJCT:AC01', 'Invalid account → REPAIR'],
                  ['RJCT:AM04', 'Insufficient funds → FUNDS_HOLD'],
                  ['RJCT:AM05', 'Duplicate → COMPLIANCE_HOLD'],
                  ['RJCT:ED05', 'Settlement failure → ESCALATION'],
                  ['No response (SLA breach)', 'QUEUE_TIMEOUT_ESCALATE step → ESCALATION'],
                ].map(([code, desc]) => (
                  <div key={code} className="flex gap-2 text-[10px]">
                    <span className="font-mono text-sky-400 shrink-0">{code}</span>
                    <span className="text-slate-400">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
