import React from 'react';
import { Node } from 'reactflow';

interface NodePropertiesDrawerProps {
  node: Node | null;
  onClose: () => void;
}

export const NodePropertiesDrawer: React.FC<NodePropertiesDrawerProps> = ({ node, onClose }) => {
  if (!node) return null;

  return (
    <div className="absolute top-0 right-0 w-[400px] h-full bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-slide-in-right">
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50">
        <h2 className="text-[15px] font-extrabold text-slate-800 tracking-tight">Node Properties</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Node ID</label>
            <div className="text-xs font-mono bg-slate-100 p-2.5 rounded text-slate-700 border border-slate-200">{node.id}</div>
          </div>
          
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Node Title</label>
            <input type="text" defaultValue={node.data.title} className="w-full text-[13px] font-semibold text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none transition-all shadow-sm" />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Sequence</label>
              <input type="number" defaultValue={node.data.seq} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none transition-all shadow-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">SLA (Days)</label>
              <input type="number" defaultValue={node.data.slaDays} className="w-full text-[13px] text-slate-900 border border-slate-300 rounded p-2.5 focus:border-[#0176D3] focus:ring-1 focus:ring-[#0176D3] outline-none transition-all shadow-sm" />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Layer 4 Orchestration</label>
            <div className="bg-[#F0F7FF] border border-[#CCE0FF] p-4 rounded-md">
              <p className="text-[12px] text-[#0052CC] mb-3 leading-relaxed">Configure logic rules, API triggers, and calculations for this step to process payload transformations.</p>
              <button className="text-[12px] font-bold text-[#0052CC] bg-white border border-[#0052CC] hover:bg-[#0052CC] hover:text-white px-4 py-2 rounded transition-colors w-full shadow-sm">
                + Add Orchestration Step
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button onClick={onClose} className="px-5 py-2.5 text-[13px] font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
        <button className="px-5 py-2.5 text-[13px] font-bold text-white bg-[#0176D3] rounded hover:bg-blue-700 transition-colors shadow-sm">Save Changes</button>
      </div>
    </div>
  );
};