// WHY THIS COMPONENT EXISTS:
// Custom React Flow edge that renders business-language condition labels on arrows.
// Replaces the default unlabeled smoothstep edge.
//
// KEY DESIGN DECISION: Edge labels must speak business language, not booleans.
// "✓ Accepted" / "✗ Rejected" is what a Trade Finance manager reads.
// "true" / "false" is what a developer reads. This canvas is for the bank user.
//
// Auto-labeling: when an edge is drawn from a DECISION node's 'yes' handle → "✓ Accepted".
// From 'no' handle → "✗ Rejected". User can override by clicking the edge.
// No label = a regular sequential flow (most edges).

import React from 'react';
import {
  EdgeProps,
  getSmoothStepPath,
  EdgeLabelRenderer,
  BaseEdge,
  MarkerType,
} from 'reactflow';

// Maps sourceHandle ID to business-language label and color
const HANDLE_LABELS: Record<string, { text: string; bg: string; text_color: string; border: string }> = {
  yes:     { text: '✓ Accepted',  bg: 'bg-emerald-50', text_color: 'text-emerald-700', border: 'border-emerald-200' },
  no:      { text: '✗ Rejected',  bg: 'bg-rose-50',    text_color: 'text-rose-700',    border: 'border-rose-200' },
  default: { text: '→ Continue',  bg: 'bg-slate-50',   text_color: 'text-slate-600',   border: 'border-slate-200' },
  left:    { text: '✗ Rejected',  bg: 'bg-rose-50',    text_color: 'text-rose-700',    border: 'border-rose-200' },
  right:   { text: '✓ Accepted',  bg: 'bg-emerald-50', text_color: 'text-emerald-700', border: 'border-emerald-200' },
};

export const LabeledEdge: React.FC<EdgeProps> = ({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  sourceHandleId,
  data,
  selected,
  markerEnd,
  style,
}) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  // Determine label: explicit data.label wins, then sourceHandle auto-label
  const explicitLabel = data?.label as string | undefined;
  const handleMeta = sourceHandleId ? HANDLE_LABELS[sourceHandleId] : undefined;
  const showLabel = explicitLabel || (handleMeta && sourceHandleId !== undefined);
  const labelText = explicitLabel || handleMeta?.text || '';

  // Edge stroke color: accepted=emerald, rejected=rose, default=indigo
  const strokeColor =
    sourceHandleId === 'yes' || sourceHandleId === 'right' ? '#10b981' :
    sourceHandleId === 'no'  || sourceHandleId === 'left'  ? '#ef4444' :
    selected ? '#6366f1' : '#94a3b8';

  const strokeWidth = selected ? 2.5 : 1.8;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          ...style,
        }}
      />

      {showLabel && labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <span className={`
              text-[9px] font-bold px-1.5 py-0.5 rounded-full border
              whitespace-nowrap shadow-sm backdrop-blur-sm
              ${handleMeta ? `${handleMeta.bg} ${handleMeta.text_color} ${handleMeta.border}` : 'bg-white text-slate-600 border-slate-200'}
            `}>
              {labelText}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
