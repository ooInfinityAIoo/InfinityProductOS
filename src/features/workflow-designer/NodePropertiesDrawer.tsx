// WHY THIS FILE EXISTS (WS-10):
// Right-panel drawer that opens when a designer clicks a node in the Workflow Canvas.
// It is the control center for every behavioural attribute of a single workflow step:
//   - What the step is called and where it sits in the sequence
//   - Whether it runs STP (automated) or waits for a human
//   - Which screen the operator sees (Screen Designer reference)
//   - Which logic engines fire (rules, calculations, APIs, sub-workflows, reports, notifications)
//   - Which document checklist gates entry (WS-6)
//   - Which unstructured extraction blueprint runs (WS-9)
//   - Which notification policy fires (WS-7) and what comm template it uses (WS-5)
//   - What transitions the step produces (SUCCESS → next_node)
//
// WHAT BREAKS IF REMOVED:
// Designers cannot configure any node. The workflow graph becomes unexecutable
// because node_title, orchestration_steps, screen_template, and transitions are all null.
// The Workflow Executor reads these fields at runtime to know what to do at each step.
//
// Tab architecture (WS-10 upgrade from single-scroll to 5 tabs):
//   Basic        — Name, Seq, STP toggle, SLA timer
//   Screen       — Human-facing screen from Screen Designer
//   Logic        — Orchestration steps (rules/calc/API/sub-flow/recon/report/notification)
//                  + State Transition Conditions
//   Documents    — WS-6 Document Checklist reference + WS-9 Extraction Blueprint
//   Signals      — WS-7 Notification Policy + WS-5 Comm Template direct attachment

import React, { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { usePlatformStore } from '../../store/usePlatformStore';

interface NodePropertiesDrawerProps {
  node: Node | null;
  workflowId: string | null;  // The DB workflow_id of the canvas — used to scope participant picker
  onClose: () => void;
  onUpdateData: (updatedData: any) => void;
}

// 21-type Universal Step Type Taxonomy, grouped for the dropdown.
// Each group maps to a visual color on the canvas (see WorkflowNode.tsx getTypeTheme).
const STEP_TYPE_GROUPS: { group: string; types: { value: string; label: string }[] }[] = [
  { group: '▶ Start / Trigger', types: [
    { value: 'RECEIVE',        label: 'Receive — inbound message / file arrives' },
    { value: 'SCHEDULE',       label: 'Schedule — time-triggered batch start' },
    { value: 'EVENT_TRIGGER',  label: 'Event Trigger — platform event fires the flow' },
  ]},
  { group: '✓ Validate / Check', types: [
    { value: 'VALIDATE',         label: 'Validate — schema / field / format check' },
    { value: 'COMPLIANCE_SCREEN',label: 'Compliance Screen — OFAC / AML / sanctions' },
    { value: 'LIMIT_CHECK',      label: 'Limit Check — exposure / credit / position limit' },
    { value: 'DOCUMENT_EXAMINE', label: 'Document Examine — LC / trade doc review' },
  ]},
  { group: '⑂ Decide / Branch', types: [
    { value: 'DECISION',       label: 'Decision — IF/THEN gateway (yes / no branch)' },
    { value: 'PARALLEL_SPLIT', label: 'Parallel Split — fan-out to concurrent branches' },
    { value: 'PARALLEL_JOIN',  label: 'Parallel Join — wait for all branches to converge' },
  ]},
  { group: '👤 Approve / Authorize', types: [
    { value: 'HUMAN_APPROVAL',    label: 'Human Approval — 4-eye / maker-checker sign-off' },
    { value: 'DIGITAL_SIGNATURE', label: 'Digital Signature — cryptographic e-sign' },
  ]},
  { group: '∑ Calculate', types: [
    { value: 'CALCULATE',  label: 'Calculate — formula / fee / interest computation' },
    { value: 'VALUATE',    label: 'Valuate — mark-to-market / FX conversion' },
    { value: 'WATERFALL',  label: 'Waterfall — structured finance cash allocation' },
  ]},
  { group: '→ Send / Act', types: [
    { value: 'SEND_MESSAGE',      label: 'Send Message — dispatch ISO 20022 / SWIFT message' },
    { value: 'POST_ENTRY',        label: 'Post Entry — debit / credit ledger entry' },
    { value: 'CALL_SYSTEM',       label: 'Call System — invoke external API / core banking' },
    { value: 'GENERATE_DOCUMENT', label: 'Generate Document — produce report / letter / advice' },
  ]},
  { group: '⏱ Wait / Monitor', types: [
    { value: 'AWAIT_RESPONSE', label: 'Await Response — pause until reply received' },
    { value: 'HOLD',           label: 'Hold — manual exception park' },
    { value: 'ESCALATE',       label: 'Escalate — SLA breach auto-escalation' },
  ]},
  { group: '■ End', types: [
    { value: 'COMPLETE',   label: 'Complete — successful end state' },
    { value: 'TERMINATE',  label: 'Terminate — rejected / failed end state' },
  ]},
];

type Tab = 'basic' | 'screen' | 'logic' | 'documents' | 'signals';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'basic',     label: 'Basic',      icon: '⚙️' },
  { id: 'screen',    label: 'Screen',     icon: '🖥' },
  { id: 'logic',     label: 'Logic',      icon: '🧠' },
  { id: 'documents', label: 'Documents',  icon: '📋' },
  { id: 'signals',   label: 'Signals',    icon: '🔔' },
];

export const NodePropertiesDrawer: React.FC<NodePropertiesDrawerProps> = ({ node, workflowId, onClose, onUpdateData }) => {
  const {
    setActiveModule,
    setWorkflowReturnStepId,
    activeWorkflowProductContext,
  } = usePlatformStore();

  const [activeTab, setActiveTab] = useState<Tab>('basic');

  // ── Basic tab state ───────────────────────────────────────────────────
  const [title, setTitle]               = useState('');
  const [seq, setSeq]                   = useState<number>(0);
  const [stpEnabled, setStpEnabled]     = useState(false);
  const [slaDays, setSlaDays]           = useState('00');
  const [slaHours, setSlaHours]         = useState('00');
  const [slaMins, setSlaMins]           = useState('00');
  const [slaSecs, setSlaSecs]           = useState('00');

  // ── Screen tab state ──────────────────────────────────────────────────
  const [screenTemplate, setScreenTemplate] = useState<string>('');

  // ── Logic tab state ───────────────────────────────────────────────────
  const [orchestrationSteps, setOrchestrationSteps] = useState<any[]>([]);
  const [transitions, setTransitions]               = useState<any[]>([]);
  const [newOutcome, setNewOutcome]                 = useState('SUCCESS');
  const [newTargetStatus, setNewTargetStatus]       = useState('AUTHORIZED');
  const [newNextStep, setNewNextStep]               = useState('');

  // ── Documents tab state ───────────────────────────────────────────────
  // documentChecklistId: references a live DocumentChecklist (WS-6) policy_id.
  // Replaces the old inline required_documents array which was not linked to any entity.
  const [documentChecklistId, setDocumentChecklistId]       = useState<string>('');
  const [extractionBlueprintId, setExtractionBlueprintId]   = useState<string>('');

  // ── Signals tab state ─────────────────────────────────────────────────
  const [notificationPolicyId, setNotificationPolicyId] = useState<string>('');
  const [commTemplateId, setCommTemplateId]             = useState<string>('');

  // ── Step type + swim-lane ─────────────────────────────────────────────
  // nodeType: one of the 21 Universal Taxonomy types (e.g. VALIDATE, HUMAN_APPROVAL).
  // participantId: the swim-lane band this node belongs to (FK → workflow_participants).
  const [nodeType, setNodeType]           = useState<string>('');
  const [participantId, setParticipantId] = useState<string>('');

  // ── Read-only guard ───────────────────────────────────────────────────
  const [isReadOnly, setIsReadOnly]         = useState(false);
  const [lastModifiedBy, setLastModifiedBy] = useState('');
  const [lastModifiedAt, setLastModifiedAt] = useState('');

  // Hydrate state from selected node
  useEffect(() => {
    if (!node) return;
    setTitle(node.data.title || '');
    setSeq(node.data.seq || 0);
    setStpEnabled(node.data.stpEnabled || false);

    const dur = (node.data.slaDuration || '00:01:00:00').split(':');
    if (dur.length === 4) {
      setSlaDays(dur[0]);
      setSlaHours(dur[1]);
      setSlaMins(dur[2]);
      setSlaSecs(dur[3]);
    }

    setOrchestrationSteps(node.data.orchestration_steps || []);
    setScreenTemplate(node.data.screen_template || '');
    setTransitions(node.data.transitions || []);
    setDocumentChecklistId(node.data.document_checklist_id || '');
    setExtractionBlueprintId(node.data.extraction_blueprint_id || '');
    setNotificationPolicyId(node.data.notification_policy_id || '');
    setCommTemplateId(node.data.comm_template_id || '');
    setNodeType(node.data.node_type || '');
    setParticipantId(node.data.participant_id || '');

    if (node.data.lastModifiedBy) {
      setIsReadOnly(true);
      setLastModifiedBy(node.data.lastModifiedBy);
      setLastModifiedAt(node.data.lastModifiedAt || new Date().toISOString());
    } else {
      setIsReadOnly(false);
      setLastModifiedBy('');
      setLastModifiedAt('');
    }
    setActiveTab('basic');
  }, [node?.id]);

  // ── Studio-linked asset queries ───────────────────────────────────────
  const { data: rulesData }      = useQuery({ queryKey: ['rules'],            queryFn: async () => (await apiClient.get('/rules/')).data });
  const { data: calcData }       = useQuery({ queryKey: ['calculations'],     queryFn: async () => (await apiClient.get('/calculations/')).data });
  const { data: apiData }        = useQuery({ queryKey: ['integrations'],     queryFn: async () => (await apiClient.get('/integrations/')).data });
  const { data: screenData }     = useQuery({ queryKey: ['screens'],          queryFn: async () => (await apiClient.get('/screens/')).data });
  const { data: workflowsData }  = useQuery({ queryKey: ['workflows'],        queryFn: async () => (await apiClient.get('/workflows/')).data });
  const { data: reconData }      = useQuery({ queryKey: ['recon-templates'],  queryFn: async () => (await apiClient.get('/reconciliation/templates')).data });
  const { data: reportData }     = useQuery({ queryKey: ['reports'],          queryFn: async () => (await apiClient.get('/reporting/')).data });

  // WS-5/6/7/9 — newly-built studios referenced from node config
  const { data: checklistsData }  = useQuery({ queryKey: ['doc-checklists'],         queryFn: async () => (await apiClient.get('/doc-checklists/')).data });
  const { data: blueprintsData }  = useQuery({ queryKey: ['extraction-blueprints'],  queryFn: async () => (await apiClient.get('/unstructured-docs/')).data });
  const { data: notifPolicies }   = useQuery({ queryKey: ['notification-policies'],  queryFn: async () => (await apiClient.get('/notification-policies/')).data });
  const { data: commTemplates }   = useQuery({ queryKey: ['comm-templates'],         queryFn: async () => (await apiClient.get('/comm-templates/')).data });

  // Swim-lane participants — scoped to the current workflow.
  // Only fetched when a workflow_id is known (i.e. the canvas has been saved at least once).
  const { data: participantsData } = useQuery({
    queryKey: ['participants', workflowId],
    queryFn: async () => (await apiClient.get(`/workflows/${workflowId}/participants/`)).data,
    enabled: !!workflowId,
  });

  if (!node) return null;

  const isStudioNode = node?.type === 'studioNode';

  const handleInvoke = (moduleName: any) => {
    setWorkflowReturnStepId(node.id);
    setActiveModule(moduleName);
  };

  const handleInvokeStudioNode = () => {
    const sType = node.data.studioType;
    if (sType === 'CALCULATION_ENGINE') handleInvoke('calculation-engine');
    else if (sType === 'BUSINESS_RULES') handleInvoke('business-rules');
    else if (sType === 'REPORT_DESIGNER') handleInvoke('report-designer');
    else if (sType === 'DATA_GATEWAY') handleInvoke('dge-canvas');
    else if (sType === 'API_DESIGNER') handleInvoke('api-designer');
    else if (sType === 'AI_ASSISTANT') handleInvoke('ai-assistant');
    else if (sType === 'EVENT_REPOSITORY') handleInvoke('event-repository');
    else if (sType === 'DOCUMENT_MASTER') handleInvoke('document-master');
  };

  const handleSaveAll = () => {
    const slaDuration = `${slaDays.padStart(2,'0')}:${slaHours.padStart(2,'0')}:${slaMins.padStart(2,'0')}:${slaSecs.padStart(2,'0')}`;
    onUpdateData({
      title,
      seq,
      stpEnabled,
      slaDuration,
      orchestration_steps: orchestrationSteps,
      screen_template: screenTemplate,
      transitions,
      document_checklist_id: documentChecklistId || null,
      extraction_blueprint_id: extractionBlueprintId || null,
      notification_policy_id: notificationPolicyId || null,
      comm_template_id: commTemplateId || null,
      node_type: nodeType || null,
      participant_id: participantId || null,
      lastModifiedBy: 'Current User',
      lastModifiedAt: new Date().toISOString(),
    });
    onClose();
  };

  const handleAddStep = () => {
    setOrchestrationSteps([
      ...orchestrationSteps,
      { sequence_number: (orchestrationSteps.length + 1) * 10, step_type: 'BUSINESS_RULE', target_token: '' },
    ]);
  };

  const handleStepChange = (index: number, field: string, value: any) => {
    const next = [...orchestrationSteps];
    next[index][field] = value;
    if (field === 'step_type') next[index].target_token = '';
    setOrchestrationSteps(next);
  };

  const handleAddTransition = () => {
    if (!newNextStep) return;
    setTransitions([...transitions, { outcome: newOutcome, target_status: newTargetStatus, next_step: newNextStep }]);
    setNewNextStep('');
  };

  const liveSuffix = (status: string) => status === 'LIVE' ? ' ✓' : ` (${status})`;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full bg-white/90 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-glass flex flex-col">

      {/* Header */}
      <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <span className="text-[14px]">{node.data.icon || '📦'}</span>
          <div>
            <h2 className="text-[13px] font-extrabold text-slate-800 tracking-tight">{node.data.title || 'Workflow Step'}</h2>
            <div className="text-[9px] text-slate-400 font-bold tracking-widest mt-0.5">ID: {node.id}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Last-modified banner */}
      {lastModifiedBy && (
        <div className="bg-amber-50 border-b border-amber-100 px-5 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-amber-800 font-medium">
            <span>👤</span>
            <span>Last configured by <strong>{lastModifiedBy}</strong> on {new Date(lastModifiedAt).toLocaleDateString()}</span>
          </div>
          {isReadOnly && (
            <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">Read Only</span>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-slate-100 bg-slate-50/30 px-3 pt-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold border-b-2 transition-colors mr-0.5 ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="text-[12px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={`flex-1 overflow-y-auto p-5 ${isReadOnly ? 'opacity-60 pointer-events-none grayscale-[10%]' : ''}`}>

        {/* ── BASIC TAB ── */}
        {activeTab === 'basic' && (
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Workflow Step Name</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full text-[13px] font-semibold text-slate-800 border border-slate-200 rounded-xl p-2.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Sequence Number</label>
              <input
                type="number"
                value={seq}
                onChange={e => setSeq(Number(e.target.value))}
                className="w-28 text-[12px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 outline-none bg-white"
              />
            </div>

            {/* ── Step Type (Universal Taxonomy) ── */}
            <div className="pt-3 border-t border-slate-100">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Step Type
              </label>
              <p className="text-[10px] text-slate-400 mb-2">
                Controls the canvas color, shape, and executor dispatch. DECISION nodes render as diamonds.
              </p>
              <select
                value={nodeType}
                onChange={e => setNodeType(e.target.value)}
                className="w-full text-[11px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none bg-white"
              >
                <option value="">— No type (legacy node) —</option>
                {STEP_TYPE_GROUPS.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.types.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {nodeType && (
                <div className="mt-1.5 text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg font-mono">
                  type: {nodeType}
                </div>
              )}
            </div>

            {/* ── Swim-Lane Participant ── */}
            <div className="pt-3 border-t border-slate-100">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Swim-Lane Participant
              </label>
              <p className="text-[10px] text-slate-400 mb-2">
                Assign this node to an org-unit or role band (e.g. "Debtor Bank", "RTP Network").
                {!workflowId && <span className="text-amber-600 font-semibold"> Save the workflow first to manage participants.</span>}
              </p>
              <select
                value={participantId}
                onChange={e => setParticipantId(e.target.value)}
                disabled={!workflowId}
                className="w-full text-[11px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 outline-none bg-white disabled:opacity-50"
              >
                <option value="">— No participant (unassigned) —</option>
                {(participantsData?.participants ?? []).map((p: any) => (
                  <option key={p.participant_id} value={p.participant_id}>
                    {p.name}{p.role ? ` · ${p.role}` : ''}
                  </option>
                ))}
              </select>
              {(participantsData?.participants ?? []).length === 0 && workflowId && (
                <p className="text-[10px] text-slate-400 italic mt-1.5">
                  No participants defined yet. Use the Participants panel to add swim-lane bands.
                </p>
              )}
            </div>

            {isStudioNode ? (
              // Studio nodes — pick asset + open the linked studio
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Configured Engine Asset</label>
                <select
                  value={orchestrationSteps[0]?.target_token || ''}
                  onChange={e => {
                    let sType = 'BUSINESS_RULE';
                    if (node.data.studioType === 'CALCULATION_ENGINE') sType = 'CALCULATION';
                    if (node.data.studioType === 'API_DESIGNER') sType = 'API_CALL';
                    if (node.data.studioType === 'REPORT_DESIGNER') sType = 'REPORTING';
                    if (node.data.studioType === 'DATA_GATEWAY') sType = 'MAPPING';
                    if (node.data.studioType === 'AI_ASSISTANT') sType = 'AI_PROMPT';
                    if (node.data.studioType === 'EVENT_REPOSITORY') sType = 'EVENT_BROADCAST';
                    if (node.data.studioType === 'DOCUMENT_MASTER') sType = 'DOC_GENERATE';
                    setOrchestrationSteps([{ sequence_number: 10, step_type: sType, target_token: e.target.value }]);
                  }}
                  className="w-full text-[12px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 outline-none bg-white font-mono text-indigo-700"
                >
                  <option value="" disabled>Select Asset…</option>
                  {node.data.studioType === 'BUSINESS_RULES' && rulesData?.map((r: any) => <option key={r.token_code} value={r.token_code}>{r.token_code}</option>)}
                  {node.data.studioType === 'CALCULATION_ENGINE' && calcData?.formulas?.map((f: any) => <option key={f.token_code} value={f.token_code}>{f.token_code}</option>)}
                  {node.data.studioType === 'API_DESIGNER' && apiData?.integrations?.map((a: any) => <option key={a.api_id} value={a.api_id}>{a.api_name}</option>)}
                </select>
                <button
                  onClick={handleInvokeStudioNode}
                  className="w-full bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-700 hover:to-indigo-900 text-white font-extrabold text-[12px] py-3 rounded-xl shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  🚀 Open Designer Studio
                </button>
              </div>
            ) : (
              // Regular nodes — STP toggle + SLA
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Processing Mode</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stpEnabled}
                    onChange={e => setStpEnabled(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-[12px] font-bold text-slate-700">Straight-Through Processing (STP)</span>
                </label>
                {!stpEnabled && (
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block mb-2">SLA Bound (DD : HH : MM : SS)</span>
                    <div className="flex items-center gap-2 font-mono text-xs text-slate-700">
                      <input type="text" maxLength={2} value={slaDays}  onChange={e => setSlaDays(e.target.value)}  className="w-10 text-center border rounded p-1" placeholder="DD" />:
                      <input type="text" maxLength={2} value={slaHours} onChange={e => setSlaHours(e.target.value)} className="w-10 text-center border rounded p-1" placeholder="HH" />:
                      <input type="text" maxLength={2} value={slaMins}  onChange={e => setSlaMins(e.target.value)}  className="w-10 text-center border rounded p-1" placeholder="MM" />:
                      <input type="text" maxLength={2} value={slaSecs}  onChange={e => setSlaSecs(e.target.value)}  className="w-10 text-center border rounded p-1" placeholder="SS" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SCREEN TAB ── */}
        {activeTab === 'screen' && !isStudioNode && (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">User-Facing Screen</label>
              <p className="text-[10px] text-slate-400 mb-2">
                When this step requires human input, the operator sees this screen.
                Leave blank for fully-automated background steps.
              </p>
              <div className="flex gap-2">
                <select
                  value={screenTemplate}
                  onChange={e => setScreenTemplate(e.target.value)}
                  className="flex-1 text-[12px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-none bg-white"
                >
                  <option value="">No Screen (Background / STP step)</option>
                  {screenData?.screens?.map((s: any) => (
                    <option key={s.screen_id} value={s.screen_id}>
                      {s.screen_name}{liveSuffix(s.status)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleInvoke('screen-designer')}
                  className="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200 text-[10px] font-bold px-3 rounded-xl transition-all shadow-sm active:scale-[0.98] whitespace-nowrap"
                >
                  Design →
                </button>
              </div>
              {screenTemplate && (
                <div className="mt-2 text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg font-mono">
                  Ref: {screenTemplate}
                </div>
              )}
            </div>

            {screenTemplate && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">Selected Screen Preview</p>
                <p className="text-[11px] text-slate-700 font-semibold">
                  {screenData?.screens?.find((s: any) => s.screen_id === screenTemplate)?.screen_name ?? '—'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {screenData?.screens?.find((s: any) => s.screen_id === screenTemplate)?.description ?? 'No description'}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'screen' && isStudioNode && (
          <EmptyTabMessage icon="🖥" message="Studio nodes execute engine logic directly. They do not have user-facing screens." />
        )}

        {/* ── LOGIC TAB ── */}
        {activeTab === 'logic' && (
          <div className="space-y-6">
            {/* Orchestration Steps */}
            {!isStudioNode && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Automated Orchestration Steps</label>
                <p className="text-[10px] text-slate-400 mb-3">
                  Logic assets that fire automatically when the workflow reaches this node.
                  Each step runs in sequence_number order.
                </p>

                <div className="space-y-2 mb-2">
                  {orchestrationSteps.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No logic assets attached. Add a step below.
                    </p>
                  )}

                  {orchestrationSteps.map((step, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 p-2.5 rounded-xl flex gap-2 items-center shadow-sm">
                      <span className="text-[9px] font-bold text-slate-400 w-5 text-center">{idx + 1}</span>

                      <select
                        value={step.step_type}
                        onChange={e => handleStepChange(idx, 'step_type', e.target.value)}
                        className="text-[10px] font-bold border border-slate-200 rounded-lg p-1.5 outline-none bg-slate-50 text-slate-600 w-28"
                      >
                        <option value="BUSINESS_RULE">Rule</option>
                        <option value="CALCULATION">Math</option>
                        <option value="API_CALL">API</option>
                        <option value="SUB_WORKFLOW">Sub-Flow</option>
                        <option value="RECONCILIATION">Recon</option>
                        <option value="REPORT">Report</option>
                        <option value="NOTIFICATION">Notify</option>
                      </select>

                      <select
                        value={step.target_token}
                        onChange={e => handleStepChange(idx, 'target_token', e.target.value)}
                        className="flex-1 text-[10px] border border-slate-200 rounded-lg p-1.5 outline-none font-mono text-indigo-700 min-w-0"
                      >
                        <option value="" disabled>Select Asset…</option>
                        {step.step_type === 'BUSINESS_RULE'  && rulesData?.map((r: any) => <option key={r.token_code} value={r.token_code}>{r.token_code}</option>)}
                        {step.step_type === 'CALCULATION'    && calcData?.formulas?.map((f: any) => <option key={f.token_code} value={f.token_code}>{f.token_code}</option>)}
                        {step.step_type === 'API_CALL'       && apiData?.integrations?.map((a: any) => <option key={a.api_id} value={a.api_id}>{a.api_name}</option>)}
                        {step.step_type === 'SUB_WORKFLOW'   && workflowsData?.map((w: any) => <option key={w.workflow_id} value={w.workflow_id}>{w.workflow_name}</option>)}
                        {step.step_type === 'RECONCILIATION' && reconData?.templates?.map((t: any) => <option key={t.reconciliation_template_id} value={t.reconciliation_template_id}>{t.reconciliation_name}</option>)}
                        {step.step_type === 'REPORT'         && reportData?.reports?.map((r: any) => <option key={r.report_id} value={r.report_id}>{r.report_name}</option>)}
                        {step.step_type === 'NOTIFICATION'   && notifPolicies?.policies?.map((p: any) => <option key={p.policy_id} value={p.policy_id}>{p.policy_name}</option>)}
                      </select>

                      <button
                        onClick={() => {
                          if (step.step_type === 'BUSINESS_RULE')  handleInvoke('business-rules');
                          if (step.step_type === 'CALCULATION')    handleInvoke('calculation-engine');
                          if (step.step_type === 'API_CALL')       handleInvoke('api-designer');
                          if (step.step_type === 'RECONCILIATION') handleInvoke('reconciliation-engine');
                          if (step.step_type === 'REPORT')         handleInvoke('report-designer');
                          if (step.step_type === 'NOTIFICATION')   handleInvoke('notification-engine');
                        }}
                        className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-1 rounded hover:bg-indigo-600 hover:text-white transition-colors"
                      >
                        →
                      </button>

                      <button
                        onClick={() => setOrchestrationSteps(orchestrationSteps.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleAddStep}
                  className="w-full text-[10px] font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-2 rounded-xl transition-all shadow-sm"
                >
                  + Add Orchestration Step
                </button>
              </div>
            )}

            {/* State Transition Conditions */}
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">State Transition Conditions</label>
              <p className="text-[10px] text-slate-400 mb-3">
                When this step completes, which outcome routes to which next node?
              </p>

              <div className="space-y-2 mb-3">
                {transitions.map((t, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-[10px] font-mono">
                    <div className="space-y-0.5">
                      <div><span className="text-slate-500">Outcome:</span> <span className="text-indigo-600 font-bold">{t.outcome}</span></div>
                      <div><span className="text-slate-500">Status:</span> <span className="text-emerald-600 font-bold">{t.target_status}</span></div>
                      <div><span className="text-slate-500">Next:</span> <span className="text-slate-800 font-bold">{t.next_step}</span></div>
                    </div>
                    <button onClick={() => setTransitions(transitions.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <select value={newOutcome} onChange={e => setNewOutcome(e.target.value)} className="text-[10px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 outline-none bg-white">
                  <option value="SUCCESS">On SUCCESS</option>
                  <option value="FAILURE">On FAILURE</option>
                  <option value="HOLD">On HOLD</option>
                  <option value="APPROVED">On APPROVED</option>
                  <option value="REJECTED">On REJECTED</option>
                  <option value="SMS_TIMEOUT">On SMS_TIMEOUT</option>
                </select>
                <select value={newTargetStatus} onChange={e => setNewTargetStatus(e.target.value)} className="text-[10px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 outline-none bg-white">
                  <option value="AUTHORIZED">AUTHORIZED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="EXCEPTION_HOLD">EXCEPTION_HOLD</option>
                  <option value="ESCALATED">ESCALATED</option>
                  <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                </select>
              </div>

              <div className="flex gap-2">
                <select value={newNextStep} onChange={e => setNewNextStep(e.target.value)} className="flex-1 text-[10px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 outline-none bg-white">
                  <option value="">Select Next Node…</option>
                  {workflowsData?.map((w: any) => (
                    <optgroup key={w.workflow_id} label={w.workflow_name}>
                      {w.nodes?.map((n: any) => (
                        <option key={n.node_id} value={n.node_id}>{n.node_title} ({n.node_id})</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  onClick={handleAddTransition}
                  disabled={!newNextStep}
                  className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl disabled:opacity-40 transition-colors"
                >
                  Add Link
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DOCUMENTS TAB ── */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            {/* WS-6 — Document Checklist picker */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Document Checklist (WS-6)</label>
              <p className="text-[10px] text-slate-400 mb-2">
                Gate entry to this step: the operator must have all mandatory documents in the
                selected checklist before this step can complete. Points to a live policy authored in
                Document Checklist Canvas.
              </p>
              <div className="flex gap-2">
                <select
                  value={documentChecklistId}
                  onChange={e => setDocumentChecklistId(e.target.value)}
                  className="flex-1 text-[12px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-none bg-white"
                >
                  <option value="">No Document Gate (unrestricted entry)</option>
                  {checklistsData?.checklists?.map((c: any) => (
                    <option key={c.checklist_id} value={c.checklist_id}>
                      {c.checklist_name}{liveSuffix(c.status)}
                    </option>
                  ))}
                </select>
                <button onClick={() => handleInvoke('doc-checklists')} className="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200 text-[10px] font-bold px-3 rounded-xl transition-all shadow-sm active:scale-[0.98] whitespace-nowrap">
                  Design →
                </button>
              </div>
              {documentChecklistId && (
                <PolicyRefBadge label="Checklist ref" value={documentChecklistId} />
              )}
            </div>

            {/* WS-9 — Unstructured Extraction Blueprint picker */}
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">AI Extraction Blueprint (WS-9)</label>
              <p className="text-[10px] text-slate-400 mb-2">
                When uploaded documents need AI-driven field extraction (invoice OCR, contract parsing),
                select the blueprint that defines the extraction profile. The Workflow Executor
                will invoke the AI extraction engine automatically at this step.
              </p>
              <div className="flex gap-2">
                <select
                  value={extractionBlueprintId}
                  onChange={e => setExtractionBlueprintId(e.target.value)}
                  className="flex-1 text-[12px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-none bg-white"
                >
                  <option value="">No AI Extraction (manual review only)</option>
                  {blueprintsData?.blueprints?.map((b: any) => (
                    <option key={b.blueprint_id} value={b.blueprint_id}>
                      {b.blueprint_name}{liveSuffix(b.status)}
                    </option>
                  ))}
                </select>
                <button onClick={() => handleInvoke('unstructured-document-studio')} className="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200 text-[10px] font-bold px-3 rounded-xl transition-all shadow-sm active:scale-[0.98] whitespace-nowrap">
                  Design →
                </button>
              </div>
              {extractionBlueprintId && (
                <PolicyRefBadge label="Blueprint ref" value={extractionBlueprintId} />
              )}
            </div>
          </div>
        )}

        {/* ── SIGNALS TAB ── */}
        {activeTab === 'signals' && (
          <div className="space-y-6">
            {/* WS-7 — Notification Policy */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Notification Policy (WS-7)</label>
              <p className="text-[10px] text-slate-400 mb-2">
                When this step starts or completes, fire the selected notification policy.
                The policy defines which channel (Email / SMS / Letter), which recipient (role / ISO field / static),
                and what comm template to use. SMS-Wait triggers pause the workflow until a reply is received.
                Timeout routing (escalate / reject) is controlled by the State Transitions above.
              </p>
              <div className="flex gap-2">
                <select
                  value={notificationPolicyId}
                  onChange={e => setNotificationPolicyId(e.target.value)}
                  className="flex-1 text-[12px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-none bg-white"
                >
                  <option value="">No Notification (silent step)</option>
                  {notifPolicies?.policies?.map((p: any) => (
                    <option key={p.policy_id} value={p.policy_id}>
                      {p.policy_name}{liveSuffix(p.status)}
                    </option>
                  ))}
                </select>
                <button onClick={() => handleInvoke('notification-engine')} className="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200 text-[10px] font-bold px-3 rounded-xl transition-all shadow-sm active:scale-[0.98] whitespace-nowrap">
                  Design →
                </button>
              </div>
              {notificationPolicyId && (
                <PolicyRefBadge label="Policy ref" value={notificationPolicyId} />
              )}
            </div>

            {/* WS-5 — Comm Template direct attachment */}
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Direct Comm Template (WS-5)</label>
              <p className="text-[10px] text-slate-400 mb-2">
                Optional: attach a single Comm Template directly to this step for ad-hoc
                notifications (e.g., a confirmation letter after settlement). The full Notification
                Policy (above) is preferred when you need multi-recipient or multi-channel logic.
              </p>
              <div className="flex gap-2">
                <select
                  value={commTemplateId}
                  onChange={e => setCommTemplateId(e.target.value)}
                  className="flex-1 text-[12px] text-slate-800 border border-slate-200 rounded-xl p-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 outline-none bg-white"
                >
                  <option value="">No Direct Template</option>
                  {commTemplates?.templates?.map((t: any) => (
                    <option key={t.template_id} value={t.template_id}>
                      {t.template_name}{liveSuffix(t.status)}
                    </option>
                  ))}
                </select>
                <button onClick={() => handleInvoke('comm-templates')} className="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-200 text-[10px] font-bold px-3 rounded-xl transition-all shadow-sm active:scale-[0.98] whitespace-nowrap">
                  Design →
                </button>
              </div>
              {commTemplateId && (
                <PolicyRefBadge label="Template ref" value={commTemplateId} />
              )}
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-150 bg-slate-50/50 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-5 py-2.5 text-[12px] font-bold text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-[0.98] shadow-sm"
        >
          Cancel
        </button>
        {isReadOnly ? (
          <button
            onClick={() => setIsReadOnly(false)}
            className="px-5 py-2.5 text-[12px] font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all active:scale-[0.98] shadow-sm flex items-center gap-2"
          >
            ✏️ Modify Configuration
          </button>
        ) : (
          <button
            onClick={handleSaveAll}
            className="px-5 py-2.5 text-[12px] font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl hover:from-indigo-700 hover:to-indigo-800 transition-all active:scale-[0.98] shadow-md shadow-indigo-600/10"
          >
            Save Changes
          </button>
        )}
      </div>
    </div>
  );
};

// ── Small helper components ────────────────────────────────────────────────────

const EmptyTabMessage: React.FC<{ icon: string; message: string }> = ({ icon, message }) => (
  <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-center gap-3">
    <span className="text-3xl">{icon}</span>
    <p className="text-[12px] font-medium max-w-xs">{message}</p>
  </div>
);

// Shows a small monospace reference badge below a picker when a policy is attached.
// WHY: makes it clear to the designer what entity ID is stored in the node data,
// so they can cross-reference in the DB if needed.
const PolicyRefBadge: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="mt-1.5 text-[9px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg font-mono">
    {label}: {value}
  </div>
);
