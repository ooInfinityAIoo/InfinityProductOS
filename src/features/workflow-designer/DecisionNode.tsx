// WHY THIS COMPONENT EXISTS:
// BPMN-aligned gateway node — renders as a true SVG diamond on the canvas so users
// can instantly distinguish branching logic from action steps without reading labels.
// Used for: DECISION (IF-THEN business rule branch), PARALLEL_SPLIT (fan-out),
// PARALLEL_JOIN (synchronize). All three are amber/yellow per the 8-group color system.
//
// DESIGN PRINCIPLE: Shape encodes type. Every BPMN spec, every bank flow diagram,
// every SWIFT process map uses a diamond for a gateway. Rectangles are actions.
// Diamonds are decisions. The user should never have to read a badge to know which.

import React from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';

interface DecisionNodeData {
  id: string;
  seq: any;
  title: string;
  slaDays: number;
  onTitleChange?: (newTitle: string) => void;
  // Universal taxonomy fields — same as WorkflowNode for consistency
  node_type?: string;         // DECISION | PARALLEL_SPLIT | PARALLEL_JOIN
  iso_message_type?: string;
  message_direction?: string;
  party_from?: string;
  party_to?: string;
}

interface DecisionNodeProps {
  data: DecisionNodeData;
  selected: boolean;
}

// Branch label and color per node_type variant
const VARIANT_META: Record<string, { icon: string; label: string; leftLabel: string; rightLabel: string }> = {
  DECISION:       { icon: '⑂',  label: 'Gateway Decision',  leftLabel: 'No / Reject',   rightLabel: 'Yes / Accept' },
  PARALLEL_SPLIT: { icon: '⫸',  label: 'Parallel Split',    leftLabel: 'Branch A',       rightLabel: 'Branch B' },
  PARALLEL_JOIN:  { icon: '⫷',  label: 'Parallel Join',     leftLabel: 'Input A',        rightLabel: 'Input B' },
};

export const DecisionNode: React.FC<DecisionNodeProps> = ({ data, selected }) => {
  const meta = VARIANT_META[data.node_type ?? 'DECISION'] ?? VARIANT_META['DECISION'];

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (data.onTitleChange) data.onTitleChange(e.target.value);
  };

  return (
    <>
      <NodeResizer
        color="#F59E0B"
        isVisible={selected}
        minWidth={160}
        minHeight={160}
        handleStyle={{ width: 8, height: 8, borderRadius: 99 }}
      />
      <div
        className={`w-full h-full relative flex items-center justify-center transition-all duration-300 ${
          selected ? 'drop-shadow-2xl' : 'drop-shadow-md'
        }`}
        style={{ minWidth: '160px', minHeight: '160px' }}
      >
        {/* SVG Diamond Shape — amber fill, selected ring */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <polygon
            points="50,2 98,50 50,98 2,50"
            fill="rgba(255, 251, 235, 0.97)"
            stroke={selected ? '#F59E0B' : '#FCD34D'}
            strokeWidth={selected ? '3.5' : '2.5'}
            className="transition-all duration-300"
          />
        </svg>

        {/* Incoming — Top */}
        <Handle type="target" position={Position.Top}    id="top"  className="w-4 h-4 bg-amber-500 border-2 border-white hover:scale-125 transition-transform z-10 -mt-2" />
        {/* Incoming — Left (for PARALLEL_JOIN) */}
        <Handle type="target" position={Position.Left}   id="left" className="w-4 h-4 bg-amber-400 border-2 border-white hover:scale-125 transition-transform z-10" />

        {/* Node content — rotated counter to diamond */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-5 py-2 w-full">
          {/* Type badge */}
          <span className="font-bold text-[9px] text-amber-600 bg-amber-100/70 px-1.5 py-0.5 rounded-md mb-1 tracking-wide">
            {meta.icon} {meta.label}
          </span>

          {/* Editable label */}
          <input
            value={data.title}
            onChange={handleTitleChange}
            className="nodrag font-bold text-[11px] text-slate-800 bg-transparent outline-none w-full text-center border-b border-transparent focus:border-amber-300 focus:bg-white/40 rounded transition-all leading-tight z-20 relative"
            placeholder="Decision Condition"
          />

          {/* ISO message if present */}
          {data.iso_message_type && (
            <code className="text-[8px] font-mono bg-amber-50/80 text-amber-700 border border-amber-200 px-1 py-0.5 rounded mt-1">
              {data.iso_message_type}
            </code>
          )}

          {/* Sequence */}
          <span className="text-[8px] text-amber-500 font-bold mt-1">#{data.seq}</span>
        </div>

        {/* Left handle — No / Reject branch */}
        <div className="absolute top-1/2 -left-9 -translate-y-1/2 flex items-center gap-1 z-10">
          <span className="text-[8px] font-bold text-rose-600 bg-white/90 px-1 py-0.5 rounded shadow-sm whitespace-nowrap">
            {meta.leftLabel}
          </span>
          <Handle type="source" position={Position.Left} id="no"
            className="w-4 h-4 bg-rose-500 border-2 border-white hover:scale-125 transition-transform !relative !transform-none" />
        </div>

        {/* Right handle — Yes / Accept branch */}
        <div className="absolute right-[-42px] top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
          <Handle type="source" position={Position.Right} id="yes"
            className="w-4 h-4 bg-emerald-500 border-2 border-white hover:scale-125 transition-transform !relative" />
          <span className="text-[8px] font-bold text-emerald-700 bg-white/90 px-1 py-0.5 rounded shadow-sm whitespace-nowrap">
            {meta.rightLabel}
          </span>
        </div>

        {/* Bottom handle — default / forward */}
        <Handle type="source" position={Position.Bottom} id="default"
          className="w-4 h-4 bg-amber-500 border-2 border-white hover:scale-125 transition-transform z-10 -mb-2" />
      </div>
    </>
  );
};
