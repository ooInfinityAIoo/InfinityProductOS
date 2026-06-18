import React from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from 'reactflow';

interface EventNodeData {
  id: string;
  seq: any; 
  title: string;
  type: 'START_EVENT' | 'END_EVENT' | 'TIMER_EVENT' | 'SYSTEM_TASK';
  onTitleChange?: (newTitle: string) => void;
}

interface EventNodeProps {
  data: EventNodeData;
  selected: boolean;
}

export const EventNode: React.FC<EventNodeProps> = ({ data, selected }) => {
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (data.onTitleChange) {
      data.onTitleChange(e.target.value);
    }
  };

  const isStart = data.type === 'START_EVENT';
  const isEnd = data.type === 'END_EVENT';
  const isTimer = data.type === 'TIMER_EVENT';
  const isSystem = data.type === 'SYSTEM_TASK';

  let bgColor = 'bg-slate-200';
  let borderColor = 'border-slate-300';
  let icon = '⏺';
  let isRound = true;

  if (isStart) {
    bgColor = 'bg-emerald-500';
    borderColor = 'border-emerald-600';
    icon = '▶';
  } else if (isEnd) {
    bgColor = 'bg-rose-500';
    borderColor = 'border-rose-600';
    icon = '⏹';
  } else if (isTimer) {
    bgColor = 'bg-purple-500';
    borderColor = 'border-purple-600';
    icon = '⏱';
  } else if (isSystem) {
    bgColor = 'bg-slate-700';
    borderColor = 'border-slate-800';
    icon = '⚙️';
    isRound = false;
  }

  return (
    <>
      <div 
        className={`w-full h-full relative flex items-center justify-center transition-all duration-300 ${
          selected ? 'drop-shadow-2xl scale-105 ring-4 ring-indigo-500/50' : 'drop-shadow-md'
        } ${isRound ? 'rounded-full' : 'rounded-2xl'} ${bgColor} border-[3px] ${borderColor}`}
        style={{ minWidth: '80px', minHeight: '80px' }}
      >
        <span className="text-white text-3xl">{icon}</span>

        <div className="absolute -bottom-8 whitespace-nowrap font-bold text-[11px] text-slate-700 bg-white/90 px-1 py-0.5 rounded-md shadow-sm border border-slate-200 backdrop-blur-sm z-20">
          <input 
            value={data.title}
            onChange={handleTitleChange}
            className="nodrag bg-transparent outline-none text-center min-w-[60px]"
            placeholder="Event Name"
          />
        </div>

        {/* 4-Way Handles - styled identically to WorkflowNode Lego connectors */}
        {!isStart && <Handle id="top" type="target" position={Position.Top} className="w-4 h-4 bg-indigo-50 border-2 border-indigo-400 -mt-2" />}
        {!isEnd && <Handle id="bottom" type="source" position={Position.Bottom} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mb-2 z-10" />}
        {!isStart && <Handle id="left" type="target" position={Position.Left} className="w-4 h-4 bg-indigo-50 border-2 border-indigo-400 -ml-2" />}
        {!isEnd && <Handle id="right" type="source" position={Position.Right} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mr-2 z-10" />}
      </div>
    </>
  );
};
