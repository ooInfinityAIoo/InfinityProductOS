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
      <NodeResizer 
        color={isStart ? '#10B981' : isEnd ? '#F43F5E' : isTimer ? '#A855F7' : '#334155'} 
        isVisible={selected} 
        minWidth={80} 
        minHeight={80} 
        handleStyle={{ width: 8, height: 8, borderRadius: 99 }}
      />
      <div 
        className={`w-full h-full relative flex items-center justify-center transition-all duration-300 ${
          selected ? 'drop-shadow-2xl scale-105' : 'drop-shadow-md'
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

        {/* 4-Way Handles */}
        {!isStart && <Handle id="top-t" type="target" position={Position.Top} className="w-3 h-3 bg-white border-2 border-slate-400 z-10 -mt-1.5" />}
        {!isEnd && <Handle id="bottom-s" type="source" position={Position.Bottom} className="w-3 h-3 bg-white border-2 border-slate-400 z-10 -mb-1.5" />}
        {!isStart && <Handle id="left-t" type="target" position={Position.Left} className="w-3 h-3 bg-white border-2 border-slate-400 z-10 -ml-1.5" />}
        {!isEnd && <Handle id="right-s" type="source" position={Position.Right} className="w-3 h-3 bg-white border-2 border-slate-400 z-10 -mr-1.5" />}
      </div>
    </>
  );
};
