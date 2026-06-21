import React from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';

interface WorkflowNodeData {
  id: string;
  seq: any; // Can be number or hierarchical string e.g. "3a"
  title: string;
  slaDays: number;
  onTitleChange?: (newTitle: string) => void;
  // ISO 20022 message metadata — present on template-derived nodes.
  // When set, the node card shows the message type badge + direction arrow
  // and party labels so the bank immediately sees the message choreography.
  iso_message_type?: string;
  message_direction?: string;
  party_from?: string;
  party_to?: string;
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
        className={`w-full h-full rounded-2xl transition-all duration-300 relative flex flex-col justify-between backdrop-blur-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] ${
          selected 
            ? 'bg-white/60 border border-indigo-400 ring-2 ring-indigo-500/80 shadow-glow-indigo' 
            : 'bg-white/30 border border-white/50 shadow-glass'
        }`} 
        style={{ minWidth: '200px', minHeight: '120px' }}
      >
        {/* Premium Gradient Top Cap */}
        <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-650 opacity-90" />
        
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
            {/* ISO 20022 message identity — shown when node came from a scenario template.
                Bank can see exactly which message this node handles without opening properties. */}
            {data.iso_message_type && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                <code className="text-[9px] font-mono bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded">
                  {data.iso_message_type}
                </code>
                {data.message_direction && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    data.message_direction === 'SEND'     ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    data.message_direction === 'RECEIVE'  ? 'bg-sky-50 text-sky-600 border border-sky-100' :
                    data.message_direction === 'VALIDATE' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    data.message_direction === 'APPROVE'  ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                    data.message_direction === 'BRANCH'   ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                    'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>
                    {data.message_direction === 'SEND' ? '↗ SEND' :
                     data.message_direction === 'RECEIVE' ? '↙ RECEIVE' :
                     data.message_direction === 'VALIDATE' ? '✓ VALIDATE' :
                     data.message_direction === 'APPROVE' ? '● APPROVE' :
                     data.message_direction === 'BRANCH' ? '⑂ BRANCH' :
                     data.message_direction}
                  </span>
                )}
              </div>
            )}
            {/* Party labels — shows the From→To routing for this message step */}
            {(data.party_from || data.party_to) && (
              <div className="text-[9px] text-slate-400 mt-1 truncate">
                {data.party_from && <span className="font-semibold text-slate-500">{data.party_from}</span>}
                {data.party_from && data.party_to && <span> → </span>}
                {data.party_to && <span className="font-semibold text-slate-500">{data.party_to}</span>}
              </div>
            )}
          </div>
          <div className="text-[9px] text-amber-600 bg-amber-50/40 border border-amber-100/50 font-bold px-2 py-0.5 rounded-md mt-2 w-max">SLA: {data.slaDays} Days</div>
        </div>

        {/* Incoming Connection Point */}
        <Handle id="left" type="target" position={Position.Left} className="w-4 h-4 bg-indigo-50 border-2 border-indigo-400 -ml-2" />
        <Handle id="top" type="target" position={Position.Top} className="w-4 h-4 bg-indigo-50 border-2 border-indigo-400 -mt-2" />

        {/* Outgoing Connection Point */}
        <Handle id="right" type="source" position={Position.Right} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mr-2" />
        <Handle id="bottom" type="source" position={Position.Bottom} className="w-4 h-4 bg-indigo-500 border-2 border-white hover:scale-125 transition-transform -mb-2" />
      </div>
    </>
  );
};