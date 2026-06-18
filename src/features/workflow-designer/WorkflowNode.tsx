import React from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from 'reactflow';
import { NodeQuickAdd } from './NodeQuickAdd';

interface WorkflowNodeData {
  id: string;
  seq: any; // Can be number or hierarchical string e.g. "3a"
  title: string;
  slaDays: number;
  onTitleChange?: (newTitle: string) => void;
  onQuickAdd?: (position: string, sourceHandle: string, type: string, reactFlowType: string, label: string) => void;
}

interface WorkflowNodeProps {
  data: WorkflowNodeData;
  selected: boolean;
}

export const WorkflowNode: React.FC<WorkflowNodeProps> = ({ data, selected }) => {
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (data.onTitleChange) {
      data.onTitleChange(e.target.value);
    }
  };

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
        className={`glass-card w-full h-full rounded-2xl transition-all duration-300 relative flex flex-col justify-between ${
          selected 
            ? 'ring-2 ring-indigo-500/80 shadow-glow-indigo' 
            : 'border-slate-200/60 shadow-glass'
        }`} 
        style={{ minWidth: '200px', minHeight: '120px' }}
      >
        {/* Premium Gradient Top Cap */}
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-650" />
        
        {/* Incoming Connection Point */}
        <Handle id="left" type="target" position={Position.Left} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -ml-2" />
        <Handle id="top" type="target" position={Position.Top} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mt-2" />

        
        <div className="p-4 pt-5 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 mb-2 tracking-wider uppercase">
              <span>Sequence #{data.seq}</span>
              <span className="font-mono text-indigo-600 bg-indigo-50/50 border border-indigo-100/50 px-1.5 py-0.5 rounded-md">{data.id}</span>
            </div>
            <input 
              value={data.title}
              onChange={handleTitleChange}
              className="nodrag font-bold text-[13px] text-slate-800 bg-transparent outline-none w-full border-b border-transparent focus:border-indigo-300 focus:bg-white/50 rounded transition-all leading-snug tracking-tight font-display"
              placeholder="Step Name"
            />
          </div>
          <div className="text-[9px] text-amber-600 bg-amber-50/40 border border-amber-100/50 font-bold px-2 py-0.5 rounded-md mt-2 w-max">SLA: {data.slaDays} Days</div>
        </div>

        {/* Outgoing Connection Point */}
        <Handle id="right" type="source" position={Position.Right} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mr-2" />
        <Handle id="bottom" type="source" position={Position.Bottom} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mb-2" />

        {selected && (
          <>
            <NodeQuickAdd nodeId={data.id} position="top" sourceHandle="top" onQuickAdd={data.onQuickAdd} />
            <NodeQuickAdd nodeId={data.id} position="bottom" sourceHandle="bottom" onQuickAdd={data.onQuickAdd} />
            <NodeQuickAdd nodeId={data.id} position="left" sourceHandle="left" onQuickAdd={data.onQuickAdd} />
            <NodeQuickAdd nodeId={data.id} position="right" sourceHandle="right" onQuickAdd={data.onQuickAdd} />
          </>
        )}
      </div>
    </>
  );
};