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
      className={`bg-white rounded w-[210px] shadow-sm relative transition-colors ${
        selected ? 'border-2 border-blue-600' : 'border border-slate-300'
      }`} 
      style={{ borderTop: '4px solid #0176D3' }}
    >
      {/* Incoming Connection Point */}
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-slate-400 border-none" />
      
      <div className="p-3">
        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 mb-1">
          <span>SEQUENCE #{data.seq}</span>
          <span className="font-mono text-blue-600 bg-blue-50 px-1 rounded">{data.id}</span>
        </div>
        <div className="font-bold text-xs text-slate-900 leading-tight">{data.title}</div>
        <div className="text-[10px] text-orange-600 font-bold mt-2 border-t border-slate-100 pt-2">SLA: {data.slaDays} Days</div>
      </div>

      {/* Outgoing Connection Point */}
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-slate-400 border-none" />
    </div>
  );
};