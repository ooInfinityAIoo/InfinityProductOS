import React, { useState, useEffect } from 'react';
import { Edge } from 'reactflow';

interface EdgePropertiesDrawerProps {
  selectedEdge: Edge;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  saveDraft: () => void;
  onClose: () => void;
}

export const EdgePropertiesDrawer: React.FC<EdgePropertiesDrawerProps> = ({ 
  selectedEdge, 
  setEdges, 
  saveDraft,
  onClose
}) => {
  const [label, setLabel] = useState((selectedEdge.data?.label || selectedEdge.label) as string || '');
  const [preStatus, setPreStatus] = useState(selectedEdge.data?.preStatus as string || '');
  const [postStatus, setPostStatus] = useState(selectedEdge.data?.postStatus as string || '');

  // Reset local state if a new edge is selected
  useEffect(() => {
    setLabel((selectedEdge.data?.label || selectedEdge.label) as string || '');
    setPreStatus(selectedEdge.data?.preStatus as string || '');
    setPostStatus(selectedEdge.data?.postStatus as string || '');
  }, [selectedEdge]);

  const handleUpdate = (field: string, value: string) => {
    if (field === 'label') setLabel(value);
    if (field === 'preStatus') setPreStatus(value);
    if (field === 'postStatus') setPostStatus(value);

    setEdges((eds) => {
      const updated = eds.map((e) => {
        if (e.id === selectedEdge.id) {
          const newEdge = { ...e, data: { ...e.data, [field]: value } };
          if (field === 'label') {
            newEdge.label = value;
            newEdge.labelStyle = { fill: '#4F46E5', fontWeight: 700, fontSize: 12 };
            newEdge.labelBgStyle = { fill: '#EEF2FF', fillOpacity: 0.9, rx: 4, ry: 4 };
            newEdge.labelBgPadding = [6, 4];
          }
          return newEdge;
        }
        return e;
      });
      return updated;
    });
    saveDraft();
  };

  const handleDeleteEdge = () => {
    setEdges((eds) => eds.filter(e => e.id !== selectedEdge.id));
    saveDraft();
    onClose();
  };

  return (
    <div className="w-full h-full bg-white/90 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-glass flex flex-col">
      {/* Drawer Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100/50 bg-gradient-to-br from-indigo-50/50 to-white rounded-t-2xl">
        <div>
          <h3 className="text-[14px] font-extrabold text-slate-800 font-display flex items-center gap-2">
            <span>🔗</span> State Transition Properties
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase font-medium">Edge Control | {selectedEdge.id}</p>
        </div>
        <button 
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="space-y-6">
          {/* Transition Label */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Transition Name / Action Trigger
            </label>
            <input 
              type="text" 
              value={label}
              onChange={(e) => handleUpdate('label', e.target.value)}
              placeholder="e.g. Approve, Reject, Submit"
              className="w-full px-3 py-2 text-[12px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all"
            />
            <p className="text-[10px] text-slate-400 mt-1">This text will visibly display on the connecting arrow.</p>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-[11px] font-bold text-slate-700 mb-3 uppercase tracking-wider">State Machine Context</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                  PRE-TRANSITION STATUS
                </label>
                <input 
                  type="text" 
                  value={preStatus}
                  onChange={(e) => handleUpdate('preStatus', e.target.value)}
                  placeholder="e.g. PENDING_REVIEW"
                  className="w-full px-3 py-2 text-[12px] font-medium text-slate-700 bg-amber-50 border border-amber-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                  POST-TRANSITION STATUS
                </label>
                <input 
                  type="text" 
                  value={postStatus}
                  onChange={(e) => handleUpdate('postStatus', e.target.value)}
                  placeholder="e.g. PROCESSING"
                  className="w-full px-3 py-2 text-[12px] font-medium text-slate-700 bg-emerald-50 border border-emerald-200/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-mono"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">These statuses define the database mutation during runtime execution.</p>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
            <button 
              onClick={handleDeleteEdge}
              className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-[12px] py-2 rounded-xl border border-rose-200 transition-colors flex items-center justify-center gap-2"
            >
              <span>🗑️</span> Delete Connection
            </button>
            <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
              <h4 className="text-[11px] font-bold text-indigo-800 mb-1">Visual Re-routing</h4>
              <p className="text-[10px] text-indigo-600/80 leading-relaxed">
                To change which steps this transition connects, click and drag the arrowhead on the canvas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
