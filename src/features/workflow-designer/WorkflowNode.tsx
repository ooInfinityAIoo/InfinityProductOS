import React from 'react';
import { Handle, Position } from 'reactflow';

interface WorkflowNodeData {
  id: string;
  seq: number;
  title: string;
  slaDays: number;
}

interface WorkflowNodeProps {
  data: WorkflowNodeData;
  selected: boolean;
}

export const WorkflowNode: React.FC<WorkflowNodeProps> = ({ data, selected }) => {
  return (
    <div 
      className={`glass-card w-[220px] rounded-2xl transition-all duration-300 relative ${
        selected 
          ? 'ring-2 ring-indigo-500/80 shadow-glow-indigo scale-[1.02]' 
          : 'border-slate-200/60 shadow-glass'
      }`} 
    >
      {/* Premium Gradient Top Cap */}
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-650" />
      
      {/* Incoming Connection Point */}
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform" />
      
      <div className="p-4 pt-5">
        <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 mb-2 tracking-wider uppercase">
          <span>Sequence #{data.seq}</span>
          <span className="font-mono text-indigo-600 bg-indigo-50/50 border border-indigo-100/50 px-1.5 py-0.5 rounded-md">{data.id}</span>
        </div>
        <div className="font-bold text-[13px] text-slate-800 leading-snug tracking-tight font-display">{data.title}</div>
        <div className="text-[9px] text-amber-600 bg-amber-50/40 border border-amber-100/50 font-bold px-2 py-0.5 rounded-md mt-3 w-max">SLA: {data.slaDays} Days</div>
      </div>

      {/* Outgoing Connection Point */}
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform" />
    </div>
  );
};