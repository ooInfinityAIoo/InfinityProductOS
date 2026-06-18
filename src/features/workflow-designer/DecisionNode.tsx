import React from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from 'reactflow';
import { NodeQuickAdd } from './NodeQuickAdd';

interface DecisionNodeData {
  id: string;
  seq: any; 
  title: string;
  slaDays: number;
  onTitleChange?: (newTitle: string) => void;
  onQuickAdd?: (position: string, sourceHandle: string, type: string, reactFlowType: string, label: string) => void;
}

interface DecisionNodeProps {
  data: DecisionNodeData;
  selected: boolean;
}

export const DecisionNode: React.FC<DecisionNodeProps> = ({ data, selected }) => {
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (data.onTitleChange) {
      data.onTitleChange(e.target.value);
    }
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
        {/* SVG Diamond Shape Background */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <polygon 
            points="50,0 100,50 50,100 0,50" 
            fill="rgba(255, 251, 235, 0.95)" 
            stroke={selected ? '#F59E0B' : '#FCD34D'} 
            strokeWidth="3" 
            className="transition-all duration-300"
          />
        </svg>

        {/* Incoming Connection Point (Top) */}
        <Handle 
          type="target" 
          position={Position.Top} 
          className="w-5 h-5 bg-amber-500 border-2 border-white hover:scale-125 transition-transform z-10 -mt-2" 
        />
        
        <div className="relative z-10 flex flex-col items-center justify-center text-center p-6 mt-2">
          <div className="flex flex-col items-center gap-1 mb-1">
            <span className="font-mono text-[9px] font-bold text-amber-600 bg-amber-100/50 px-1.5 py-0.5 rounded-md">Seq: {data.seq}</span>
          </div>
          <input 
            value={data.title}
            onChange={handleTitleChange}
            className="nodrag font-bold text-[12px] text-slate-800 bg-transparent outline-none w-full text-center border-b border-transparent focus:border-amber-300 focus:bg-white/50 rounded transition-all leading-snug tracking-tight font-display z-20 relative"
            placeholder="Decision"
          />
        </div>

        {/* Outgoing Connection Point (Left - No) */}
        <div className="absolute top-1/2 -left-8 -translate-y-1/2 flex items-center gap-1 z-10">
          <span className="text-[9px] font-bold text-rose-600 bg-white/80 px-1 rounded-sm shadow-sm backdrop-blur-sm">No</span>
          <Handle 
            type="source" 
            position={Position.Left} 
            id="no"
            className="w-5 h-5 bg-rose-500 border-2 border-white hover:scale-125 transition-transform !relative !transform-none" 
          />
        </div>

        {/* Outgoing Connection Point (Right - Yes) */}
        <div className="absolute right-[-8px] top-1/2 -translate-y-1/2 flex items-center z-10">
          <Handle id="right" type="source" position={Position.Right} className="w-4 h-4 bg-amber-500 border-2 border-white hover:scale-125 transition-transform !relative" />
          <span className="text-[9px] font-bold text-amber-700 bg-white/80 px-1 rounded shadow-sm ml-1">Yes</span>
        </div>
        
        {/* Outgoing Connection Point (Bottom - Default/Forward) */}
        <Handle 
          type="source" 
          position={Position.Bottom} 
          id="default"
          className="w-5 h-5 bg-amber-500 border-2 border-white hover:scale-125 transition-transform z-10 -mb-2" 
        />

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
