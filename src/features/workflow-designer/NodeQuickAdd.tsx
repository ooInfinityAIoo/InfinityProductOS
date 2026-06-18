import React, { useState } from 'react';
import { useReactFlow } from 'reactflow';

interface NodeQuickAddProps {
  nodeId: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  sourceHandle: string;
  onQuickAdd?: (position: string, sourceHandle: string, type: string, reactFlowType: string, label: string) => void;
}

export const NodeQuickAdd: React.FC<NodeQuickAddProps> = ({ nodeId, position, sourceHandle, onQuickAdd }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleAddNode = (e: React.MouseEvent, type: string, reactFlowType: string, label: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (onQuickAdd) {
      onQuickAdd(position, sourceHandle, type, reactFlowType, label);
    }
    setIsOpen(false);
  };

  const posClass = {
    top: '-top-8 left-1/2 -translate-x-1/2',
    bottom: '-bottom-8 left-1/2 -translate-x-1/2',
    left: '-left-8 top-1/2 -translate-y-1/2',
    right: '-right-8 top-1/2 -translate-y-1/2'
  }[position];

  return (
    <div 
      className={`absolute ${posClass} z-50 flex items-center justify-center nodrag`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {!isOpen ? (
        <button className="w-5 h-5 bg-white border border-slate-300 rounded-full shadow-sm flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 transition-all z-10">
          <span className="text-[14px] leading-none mb-0.5">+</span>
        </button>
      ) : (
        <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-1 flex gap-1 z-20 animate-fade-in pointer-events-auto">
          <button onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); handleAddNode(e, 'STEP', 'customBankingNode', 'New Step'); }} className="w-7 h-7 bg-indigo-50 hover:bg-indigo-100 rounded flex items-center justify-center text-indigo-600 text-xs" title="Add Step">⬜</button>
          <button onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); handleAddNode(e, 'DECISION', 'decisionNode', 'Decision'); }} className="w-7 h-7 bg-amber-50 hover:bg-amber-100 rounded flex items-center justify-center text-amber-600 text-xs" title="Add Decision">💠</button>
          <button onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); handleAddNode(e, 'SYSTEM_TASK', 'eventNode', 'System Task'); }} className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center text-slate-700 text-xs" title="Add System Task">⚙️</button>
        </div>
      )}
    </div>
  );
};
