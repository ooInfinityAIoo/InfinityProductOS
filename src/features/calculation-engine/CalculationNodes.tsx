import React from 'react';
import { Handle, Position } from 'reactflow';

// 1. Variable Node (ISO Field)
export const VariableNode = ({ data }: any) => {
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 min-w-[150px] shadow-sm relative group hover:border-indigo-400 transition-colors">
      <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1">ISO Field (Variable)</div>
      <div className="text-[12px] font-bold text-indigo-900">{data.label}</div>
      <div className="text-[10px] font-mono text-indigo-500 mt-1">{data.technical_name}</div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-indigo-500 border-2 border-white" />
    </div>
  );
};

// 2. Constant Node (Number)
export const ConstantNode = ({ data }: any) => {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 min-w-[100px] shadow-sm relative group hover:border-emerald-400 transition-colors">
      <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Constant</div>
      <input 
        type="number" 
        value={data.value || 0} 
        onChange={(e) => data.onChange && data.onChange(data.id, e.target.value)}
        className="w-full text-[14px] font-mono font-bold text-emerald-900 bg-white border border-emerald-100 rounded-lg p-1 outline-none text-center"
      />
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-emerald-500 border-2 border-white" />
    </div>
  );
};

// 3. Operator Node (+, -, *, /)
export const OperatorNode = ({ data }: any) => {
  const opColor = data.operator === '+' || data.operator === '-' ? 'amber' : 'rose';
  
  return (
    <div className={`bg-${opColor}-50 border border-${opColor}-200 rounded-xl p-2 min-w-[80px] text-center shadow-sm relative group hover:border-${opColor}-400 transition-colors`}>
      <Handle type="target" id="a" position={Position.Left} style={{ top: '30%' }} className={`w-3 h-3 bg-${opColor}-500 border-2 border-white`} />
      <Handle type="target" id="b" position={Position.Left} style={{ top: '70%' }} className={`w-3 h-3 bg-${opColor}-500 border-2 border-white`} />
      
      <div className={`text-[20px] font-extrabold text-${opColor}-700 my-1 font-mono`}>
        {data.operator}
      </div>
      
      <Handle type="source" position={Position.Right} className={`w-3 h-3 bg-${opColor}-500 border-2 border-white`} />
    </div>
  );
};
