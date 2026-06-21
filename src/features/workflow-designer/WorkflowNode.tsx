// WHY THIS COMPONENT EXISTS:
// The visual node card rendered on the Workflow Designer canvas for every step in a workflow.
// After the Universal Step Type Taxonomy (WS-15c), each node now has a node_type from the
// 21-type taxonomy. The card color, top-bar accent, and type badge are all driven by node_type,
// giving the bank user an instant visual scan of the flow structure without reading every label.
//
// COLOR SYSTEM (8 groups):
//   Green  = Start/Trigger  (RECEIVE, SCHEDULE, EVENT_TRIGGER)
//   Blue   = Validate/Check (VALIDATE, COMPLIANCE_SCREEN, LIMIT_CHECK, DOCUMENT_EXAMINE)
//   Amber  = Decide/Branch  (DECISION, PARALLEL_SPLIT, PARALLEL_JOIN)
//   Orange = Approve        (HUMAN_APPROVAL, DIGITAL_SIGNATURE)
//   Purple = Calculate      (CALCULATE, VALUATE, WATERFALL)
//   Cyan   = Send/Act       (SEND_MESSAGE, POST_ENTRY, CALL_SYSTEM, GENERATE_DOCUMENT)
//   Grey   = Wait/Monitor   (AWAIT_RESPONSE, HOLD, ESCALATE)
//   Red    = End            (COMPLETE=green end, TERMINATE=red end)
//
// SHAPE NOTE: DECISION nodes are flagged with a ⑂ icon and amber border.
// True BPMN diamond shape requires a separate React Flow custom node type —
// that upgrade is tracked as a follow-on canvas change.

import React from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';

interface SlaConfig {
  value: number;
  unit: 'SECONDS' | 'MINUTES' | 'HOURS' | 'CALENDAR_DAYS' | 'BANKING_DAYS';
  calendar?: string;
  on_breach?: 'ESCALATE' | 'NOTIFY' | 'REJECT' | 'PROCEED';
  breach_notify_role?: string;
}

interface WorkflowNodeData {
  id: string;
  seq: any;
  title: string;
  slaDays: number;
  sla_config?: SlaConfig | null;  // Structured SLA — overrides slaDays when present
  onTitleChange?: (newTitle: string) => void;
  node_type?: string;         // 21-type taxonomy value e.g. "DECISION", "COMPLIANCE_SCREEN"
  iso_message_type?: string;  // ISO 20022 message e.g. "pacs.008.001.10"
  message_direction?: string; // SEND | RECEIVE | PROCESS | BRANCH | VALIDATE | APPROVE
  party_from?: string;
  party_to?: string;
}

interface WorkflowNodeProps {
  data: WorkflowNodeData;
  selected: boolean;
}

// Maps node_type to the 8-group visual theme.
// Returns { accent: gradient CSS, border: tailwind class, badge: bg+text classes, icon, label }
function getTypeTheme(nodeType?: string) {
  if (!nodeType) return {
    accent: 'from-indigo-500 via-purple-500 to-indigo-600',
    border: 'border-white/50',
    selectedBorder: 'border-indigo-400 ring-indigo-500/80',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    icon: '⚙️',
    groupLabel: null,
  };

  // START / TRIGGER group
  if (['RECEIVE', 'SCHEDULE', 'EVENT_TRIGGER'].includes(nodeType)) return {
    accent: 'from-emerald-400 via-green-500 to-emerald-600',
    border: 'border-emerald-200/60',
    selectedBorder: 'border-emerald-400 ring-emerald-500/70',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: nodeType === 'RECEIVE' ? '📨' : nodeType === 'SCHEDULE' ? '🕐' : '🔔',
    groupLabel: 'Start / Trigger',
  };

  // VALIDATE / CHECK group
  if (['VALIDATE', 'COMPLIANCE_SCREEN', 'LIMIT_CHECK', 'DOCUMENT_EXAMINE'].includes(nodeType)) return {
    accent: 'from-blue-400 via-blue-500 to-blue-600',
    border: 'border-blue-200/60',
    selectedBorder: 'border-blue-400 ring-blue-500/70',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: nodeType === 'COMPLIANCE_SCREEN' ? '🛡️' : nodeType === 'DOCUMENT_EXAMINE' ? '📄' : nodeType === 'LIMIT_CHECK' ? '📊' : '✅',
    groupLabel: 'Validate / Check',
  };

  // DECIDE / BRANCH group — amber + ⑂ diamond indicator
  if (['DECISION', 'PARALLEL_SPLIT', 'PARALLEL_JOIN'].includes(nodeType)) return {
    accent: 'from-amber-400 via-yellow-500 to-amber-500',
    border: 'border-amber-300/70',
    selectedBorder: 'border-amber-400 ring-amber-500/70',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: nodeType === 'DECISION' ? '⑂' : nodeType === 'PARALLEL_SPLIT' ? '⫸' : '⫷',
    groupLabel: 'Decide / Branch',
  };

  // APPROVE / AUTHORIZE group — orange dashed border (human task visual)
  if (['HUMAN_APPROVAL', 'DIGITAL_SIGNATURE'].includes(nodeType)) return {
    accent: 'from-orange-400 via-orange-500 to-red-400',
    border: 'border-orange-300/70 border-dashed',
    selectedBorder: 'border-orange-400 ring-orange-500/70',
    badgeBg: 'bg-orange-50 text-orange-700 border-orange-200',
    icon: nodeType === 'DIGITAL_SIGNATURE' ? '🔏' : '✍️',
    groupLabel: 'Approve / Authorize',
  };

  // CALCULATE group — purple
  if (['CALCULATE', 'VALUATE', 'WATERFALL'].includes(nodeType)) return {
    accent: 'from-violet-400 via-purple-500 to-violet-600',
    border: 'border-purple-200/60',
    selectedBorder: 'border-purple-400 ring-purple-500/70',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: nodeType === 'WATERFALL' ? '🪣' : nodeType === 'VALUATE' ? '📈' : '➗',
    groupLabel: 'Calculate',
  };

  // SEND / ACT group — cyan
  if (['SEND_MESSAGE', 'POST_ENTRY', 'CALL_SYSTEM', 'GENERATE_DOCUMENT'].includes(nodeType)) return {
    accent: 'from-cyan-400 via-sky-500 to-cyan-600',
    border: 'border-cyan-200/60',
    selectedBorder: 'border-cyan-400 ring-cyan-500/70',
    badgeBg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    icon: nodeType === 'SEND_MESSAGE' ? '📤' : nodeType === 'POST_ENTRY' ? '🏦' : nodeType === 'GENERATE_DOCUMENT' ? '📃' : '🔌',
    groupLabel: 'Send / Act',
  };

  // WAIT / MONITOR group — grey dotted border
  if (['AWAIT_RESPONSE', 'HOLD', 'ESCALATE'].includes(nodeType)) return {
    accent: 'from-slate-400 via-gray-500 to-slate-500',
    border: 'border-slate-300/60 border-dotted',
    selectedBorder: 'border-slate-400 ring-slate-400/70',
    badgeBg: 'bg-slate-50 text-slate-600 border-slate-200',
    icon: nodeType === 'AWAIT_RESPONSE' ? '⏱️' : nodeType === 'HOLD' ? '🔒' : '🚨',
    groupLabel: 'Wait / Monitor',
  };

  // END group
  if (nodeType === 'COMPLETE') return {
    accent: 'from-emerald-500 via-green-600 to-emerald-700',
    border: 'border-emerald-400/70',
    selectedBorder: 'border-emerald-500 ring-emerald-500/70',
    badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: '✅',
    groupLabel: 'Complete',
  };
  if (nodeType === 'TERMINATE') return {
    accent: 'from-red-400 via-rose-500 to-red-600',
    border: 'border-red-300/70',
    selectedBorder: 'border-red-400 ring-red-500/70',
    badgeBg: 'bg-red-50 text-red-700 border-red-200',
    icon: '❌',
    groupLabel: 'Terminate',
  };

  // Legacy / unknown type — default indigo
  return {
    accent: 'from-indigo-500 via-purple-500 to-indigo-600',
    border: 'border-white/50',
    selectedBorder: 'border-indigo-400 ring-indigo-500/80',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    icon: '⚙️',
    groupLabel: null,
  };
}

// Business-friendly display labels for each type (shown on the card instead of the raw enum value)
const TYPE_LABELS: Record<string, string> = {
  RECEIVE:           'Receive Instruction',
  SCHEDULE:          'Scheduled Trigger',
  EVENT_TRIGGER:     'Event Trigger',
  VALIDATE:          'Format Validation',
  COMPLIANCE_SCREEN: 'Compliance Screen',
  LIMIT_CHECK:       'Limit Check',
  DOCUMENT_EXAMINE:  'Document Examination',
  DECISION:          'Business Rule Decision',
  PARALLEL_SPLIT:    'Parallel Split',
  PARALLEL_JOIN:     'Parallel Join',
  HUMAN_APPROVAL:    'Human Approval',
  DIGITAL_SIGNATURE: 'Digital Signature',
  CALCULATE:         'Formula Calculation',
  VALUATE:           'Mark-to-Market',
  WATERFALL:         'Payment Waterfall',
  SEND_MESSAGE:      'Send Financial Message',
  POST_ENTRY:        'Post Accounting Entry',
  CALL_SYSTEM:       'Call External System',
  GENERATE_DOCUMENT: 'Generate Document',
  AWAIT_RESPONSE:    'Await Response',
  HOLD:              'Hold / Suspend',
  ESCALATE:          'Escalate Exception',
  COMPLETE:          'Complete Successfully',
  TERMINATE:         'Terminate',
};

export const WorkflowNode: React.FC<WorkflowNodeProps> = ({ data, selected }) => {
  const theme = getTypeTheme(data.node_type);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (data.onTitleChange) {
      data.onTitleChange(e.target.value);
    }
  };

  // DECISION nodes get an extra amber ring to hint at their gateway role
  const isDecision = data.node_type === 'DECISION';
  const isParallel = data.node_type === 'PARALLEL_SPLIT' || data.node_type === 'PARALLEL_JOIN';
  const isWait     = ['AWAIT_RESPONSE', 'HOLD', 'ESCALATE'].includes(data.node_type ?? '');
  const isHuman    = ['HUMAN_APPROVAL', 'DIGITAL_SIGNATURE'].includes(data.node_type ?? '');

  const borderClass = selected
    ? `border ${theme.selectedBorder} ring-2`
    : `border ${theme.border}`;

  return (
    <>
      <NodeResizer
        color="#6366F1"
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        handleStyle={{ width: 8, height: 8, borderRadius: 99 }}
      />
      <div
        className={`w-full h-full rounded-2xl transition-all duration-300 relative flex flex-col justify-between backdrop-blur-3xl ${borderClass} ${
          selected
            ? 'bg-white/70 shadow-[0_8px_32px_0_rgba(31,38,135,0.18)]'
            : 'bg-white/30 shadow-[0_4px_16px_0_rgba(31,38,135,0.10)]'
        } ${isDecision ? 'ring-1 ring-amber-400/60' : ''}`}
        style={{ minWidth: '200px', minHeight: '120px' }}
      >
        {/* Colored top accent bar — encodes the step type group */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl bg-gradient-to-r ${theme.accent} opacity-90`} />

        {/* Incoming Connection Points */}
        <Handle id="left"  type="target" position={Position.Left}  className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -ml-2" />
        <Handle id="top"   type="target" position={Position.Top}   className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mt-2" />

        <div className="p-4 pt-5 flex-1 flex flex-col justify-between">
          <div>
            {/* Sequence number + node ID row */}
            <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 mb-2 tracking-wider uppercase">
              <span>Sequence #{data.seq}</span>
              <span className="font-mono text-indigo-600 bg-indigo-50/50 border border-indigo-100/50 px-1.5 py-0.5 rounded-md">{data.id}</span>
            </div>

            {/* Editable step name */}
            <input
              value={data.title}
              onChange={handleTitleChange}
              className="nodrag font-bold text-[13px] text-slate-800 bg-transparent outline-none w-full border-b border-transparent focus:border-indigo-300 focus:bg-white/50 rounded transition-all leading-snug tracking-tight font-display"
              placeholder="Step Name"
            />

            {/* Node type badge — business-friendly label + icon */}
            {data.node_type && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${theme.badgeBg}`}>
                  <span>{theme.icon}</span>
                  <span>{TYPE_LABELS[data.node_type] ?? data.node_type}</span>
                </span>
                {/* DECISION: extra diamond hint badge */}
                {isDecision && (
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded">
                    Gateway ⑂
                  </span>
                )}
                {/* PARALLEL: fan-out/join hint */}
                {isParallel && (
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded">
                    Parallel
                  </span>
                )}
              </div>
            )}

            {/* ISO 20022 message identity — shown on template-derived nodes */}
            {data.iso_message_type && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                <code className="text-[9px] font-mono bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded">
                  {data.iso_message_type}
                </code>
                {data.message_direction && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    data.message_direction === 'SEND'     ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    data.message_direction === 'RECEIVE'  ? 'bg-sky-50 text-sky-600 border border-sky-100' :
                    data.message_direction === 'VALIDATE' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    data.message_direction === 'APPROVE'  ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                    data.message_direction === 'BRANCH'   ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                    'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>
                    {data.message_direction === 'SEND'     ? '↗ SEND'    :
                     data.message_direction === 'RECEIVE'  ? '↙ RECEIVE' :
                     data.message_direction === 'VALIDATE' ? '✓ VALIDATE':
                     data.message_direction === 'APPROVE'  ? '● APPROVE' :
                     data.message_direction === 'BRANCH'   ? '⑂ BRANCH'  :
                     data.message_direction}
                  </span>
                )}
              </div>
            )}

            {/* Party routing labels */}
            {(data.party_from || data.party_to) && (
              <div className="text-[9px] text-slate-400 mt-1 truncate">
                {data.party_from && <span className="font-semibold text-slate-500">{data.party_from}</span>}
                {data.party_from && data.party_to && <span> → </span>}
                {data.party_to && <span className="font-semibold text-slate-500">{data.party_to}</span>}
              </div>
            )}
          </div>

          {/* SLA indicator — shows structured config when present, falls back to legacy slaDays */}
          {(() => {
            const cfg = data.sla_config;
            const unit_labels: Record<string, string> = {
              SECONDS: 's', MINUTES: 'min', HOURS: 'hr',
              CALENDAR_DAYS: 'd', BANKING_DAYS: 'bd',
            };
            const slaText = cfg
              ? `SLA: ${cfg.value}${unit_labels[cfg.unit] ?? cfg.unit}${cfg.on_breach ? ' · ' + cfg.on_breach : ''}`
              : `SLA: ${data.slaDays}d`;
            const isUrgent = cfg && (cfg.unit === 'SECONDS' || cfg.unit === 'MINUTES');
            return (
              <div className={`text-[9px] font-bold px-2 py-0.5 rounded-md mt-2 w-max ${
                isUrgent
                  ? 'text-red-600 bg-red-50/60 border border-red-200/50'
                  : isWait
                    ? 'text-slate-600 bg-slate-100/60 border border-slate-200/50'
                    : 'text-amber-600 bg-amber-50/40 border border-amber-100/50'
              }`}>
                {slaText}
              </div>
            );
          })()}
        </div>

        {/* Outgoing Connection Points */}
        <Handle id="right"  type="source" position={Position.Right}  className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mr-2" />
        <Handle id="bottom" type="source" position={Position.Bottom} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mb-2" />
      </div>
    </>
  );
};
