import React from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from 'reactflow';

interface GatewayNodeData {
  id: string;
  seq: any; 
  title: string;
  type: 'PARALLEL_GATEWAY';
  onTitleChange?: (newTitle: string) => void;
}

interface GatewayNodeProps {
  data: GatewayNodeData;
  selected: boolean;
}

export const GatewayNode: React.FC<GatewayNodeProps> = ({ data, selected }) => {
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (data.onTitleChange) {
      data.onTitleChange(e.target.value);
    }
  };

  return (
    <>
      <NodeResizer 
        color="#06B6D4" 
        isVisible={selected} 
        minWidth={120} 
        minHeight={120} 
        handleStyle={{ width: 8, height: 8, borderRadius: 99 }}
      />
      <div 
        className={`w-full h-full relative flex items-center justify-center transition-all duration-300 ${
          selected ? 'drop-shadow-2xl' : 'drop-shadow-md'
        }`}
        style={{ minWidth: '120px', minHeight: '120px' }}
      >
        {/* SVG Diamond Shape Background */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <polygon 
            points="50,0 100,50 50,100 0,50" 
            fill="rgba(236, 254, 255, 0.95)" 
            stroke={selected ? '#06B6D4' : '#22D3EE'} 
            strokeWidth="4" 
            className="transition-all duration-300"
          />
        </svg>

        {/* Plus Icon inside the Diamond */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center">
          <span className="text-cyan-500 text-5xl font-light leading-none -mt-2">+</span>
        </div>

        <div className="absolute -bottom-8 whitespace-nowrap font-bold text-[11px] text-slate-700 bg-white/90 px-1 py-0.5 rounded-md shadow-sm border border-slate-200 backdrop-blur-sm z-20">
          <input 
            value={data.title}
            onChange={handleTitleChange}
            className="nodrag bg-transparent outline-none text-center min-w-[60px]"
            placeholder="Gateway Name"
          />
        </div>

        {/* 4-Way Handles */}
        <Handle id="top-t" type="target" position={Position.Top} className="w-4 h-4 bg-cyan-500 border-2 border-white z-10 -mt-2" />
        <Handle id="top-s" type="source" position={Position.Top} className="w-4 h-4 bg-cyan-500 border-2 border-white z-10 -mt-2 opacity-0 hover:opacity-100" />

        <Handle id="bottom-t" type="target" position={Position.Bottom} className="w-4 h-4 bg-cyan-500 border-2 border-white z-10 -mb-2 opacity-0 hover:opacity-100" />
        <Handle id="bottom-s" type="source" position={Position.Bottom} className="w-4 h-4 bg-cyan-500 border-2 border-white z-10 -mb-2" />

        <Handle id="left-t" type="target" position={Position.Left} className="w-4 h-4 bg-cyan-500 border-2 border-white z-10 -ml-2" />
        <Handle id="left-s" type="source" position={Position.Left} className="w-4 h-4 bg-cyan-500 border-2 border-white z-10 -ml-2 opacity-0 hover:opacity-100" />

        <Handle id="right-t" type="target" position={Position.Right} className="w-4 h-4 bg-cyan-500 border-2 border-white z-10 -mr-2 opacity-0 hover:opacity-100" />
        <Handle id="right-s" type="source" position={Position.Right} className="w-4 h-4 bg-cyan-500 border-2 border-white z-10 -mr-2" />
      </div>
    </>
  );
};
