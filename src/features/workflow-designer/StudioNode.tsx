import React from 'react';
import { Handle, Position } from 'reactflow';

interface StudioNodeData {
  id: string;
  seq: any; 
  title: string;
  studioType: 'CALCULATION_ENGINE' | 'BUSINESS_RULES' | 'REPORT_DESIGNER' | 'DATA_GATEWAY' | 'API_DESIGNER' | 'AI_ASSISTANT' | 'EVENT_REPOSITORY' | 'DOCUMENT_MASTER';
  slaDays: number;
  onTitleChange?: (newTitle: string) => void;
}

interface StudioNodeProps {
  data: StudioNodeData;
  selected: boolean;
}

export const StudioNode: React.FC<StudioNodeProps> = ({ data, selected }) => {
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (data.onTitleChange) {
      data.onTitleChange(e.target.value);
    }
  };

  const getStudioConfig = (type: string) => {
    switch (type) {
      case 'CALCULATION_ENGINE': return { icon: '🧮', color: 'from-blue-600 to-blue-800', badge: 'Calculation' };
      case 'BUSINESS_RULES': return { icon: '⚖️', color: 'from-amber-600 to-amber-800', badge: 'Rules Engine' };
      case 'REPORT_DESIGNER': return { icon: '📊', color: 'from-emerald-600 to-emerald-800', badge: 'Reporting' };
      case 'DATA_GATEWAY': return { icon: '🔀', color: 'from-cyan-600 to-cyan-800', badge: 'Data Mapper' };
      case 'API_DESIGNER': return { icon: '🔌', color: 'from-purple-600 to-purple-800', badge: 'API Gateway' };
      case 'AI_ASSISTANT': return { icon: '🧠', color: 'from-fuchsia-600 to-fuchsia-800', badge: 'AI Agent' };
      case 'EVENT_REPOSITORY': return { icon: '📡', color: 'from-rose-600 to-rose-800', badge: 'Event Bus' };
      case 'DOCUMENT_MASTER': return { icon: '📄', color: 'from-slate-600 to-slate-800', badge: 'Doc Processor' };
      default: return { icon: '⚙️', color: 'from-slate-700 to-slate-900', badge: 'Backend Task' };
    }
  };

  const config = getStudioConfig(data.studioType);

  return (
    <>
      <div 
        className={`w-[180px] min-h-[70px] relative rounded-xl transition-all duration-300 ${
          selected ? 'shadow-2xl scale-105 ring-4 ring-indigo-500/50' : 'shadow-lg'
        } bg-gradient-to-br ${config.color} border border-white/20 p-3 flex flex-col justify-between`}
      >
        <div className="flex justify-between items-start mb-2">
          <span className="text-white text-lg bg-white/20 p-1.5 rounded-lg shadow-inner">{config.icon}</span>
          <span className="text-[8px] font-bold uppercase tracking-wider text-white/90 bg-black/30 px-2 py-0.5 rounded-full border border-white/10">
            {config.badge}
          </span>
        </div>
        
        <input 
          value={data.title}
          onChange={handleTitleChange}
          className="nodrag font-bold text-[12px] text-white bg-transparent outline-none w-full border-b border-transparent focus:border-white/50 focus:bg-black/20 rounded px-1 py-0.5 transition-all leading-snug tracking-tight font-display"
          placeholder="Studio Task"
        />

        {/* Incoming Connection Points */}
        <Handle id="left" type="target" position={Position.Left} className="w-4 h-4 bg-indigo-50 border-2 border-indigo-400 -ml-2" />
        <Handle id="top" type="target" position={Position.Top} className="w-4 h-4 bg-indigo-50 border-2 border-indigo-400 -mt-2" />

        {/* Outgoing Connection Points */}
        <Handle id="right" type="source" position={Position.Right} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mr-2 z-10" />
        <Handle id="bottom" type="source" position={Position.Bottom} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mb-2 z-10" />
      </div>
    </>
  );
};
