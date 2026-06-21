// WHY THIS COMPONENT EXISTS:
// Renders the left-side band header for Swimlane View mode.
// Each WorkflowParticipant (e.g. "Debtor Bank", "RTP Network") gets one label node
// placed to the left of its horizontal band. It is purely decorative — non-draggable,
// non-selectable, never saved to DB. It disappears when the canvas returns to Flow View.
//
// WHAT BREAKS IF REMOVED: Swimlane View bands would have no labels; banks couldn't
// tell which row belongs to which party in a multi-participant SWIFT/RTP flow.

import React from 'react';
import { NodeProps, Handle, Position } from 'reactflow';

export const SwimlaneLabelNode: React.FC<NodeProps> = ({ data }) => {
  return (
    <>
      {/* No handles — label nodes are not connectable */}
      <div
        style={{ borderLeft: `4px solid ${data.color || '#6366f1'}` }}
        className="bg-white/90 backdrop-blur-sm rounded-r-xl shadow-sm px-3 py-2.5 min-w-[120px] pointer-events-none select-none"
      >
        <div className="text-[11px] font-extrabold text-slate-800 tracking-tight truncate max-w-[140px]">
          {data.name}
        </div>
        {data.role && (
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            {data.role}
          </div>
        )}
        <div className="text-[9px] text-slate-400 mt-0.5">
          {data.nodeCount} step{data.nodeCount !== 1 ? 's' : ''}
        </div>
      </div>
    </>
  );
};
