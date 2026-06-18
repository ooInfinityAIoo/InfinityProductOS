import React from 'react';

interface WorkflowSidebarProps {
  selectedNode?: any | null;
}

export const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({ selectedNode }) => {
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-full lg:w-[260px] h-full flex-shrink-0 bg-white/95 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-glass flex flex-col animate-slide-in-left">
      <div className="p-4 border-b border-slate-100/50 bg-gradient-to-br from-indigo-50/50 to-white rounded-t-2xl">
        <h3 className="text-[14px] font-extrabold text-slate-800 font-display flex items-center gap-2">
          <span>🧰</span> Component Toolbox
        </h3>
        <p className="text-[10px] text-slate-400 mt-0.5 tracking-wider uppercase font-medium">Drag & Drop Shapes</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
        
        {/* Core Steps */}
        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Core Steps</h4>
          <div className="grid grid-cols-2 gap-2">
            <div 
              className="flex flex-col items-center justify-center p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl cursor-grab hover:shadow-md hover:bg-indigo-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'STEP', 'Workflow Step')} draggable
            >
              <div className="w-8 h-8 bg-indigo-500 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[10px]">⬜</div>
              <span className="text-[10px] font-bold text-indigo-800 text-center">Step</span>
            </div>

            <div 
              className={`flex flex-col items-center justify-center p-3 border rounded-xl transition-all ${
                selectedNode ? 'bg-indigo-50/50 border-indigo-100 cursor-grab hover:shadow-md hover:bg-indigo-100/50 active:cursor-grabbing' : 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
              }`}
              onDragStart={(e) => selectedNode && onDragStart(e, 'SUB_WORKFLOW', 'Sub-Workflow')} draggable={!!selectedNode}
              title={!selectedNode ? "Select a Step on the canvas first to branch a Sub-Workflow" : "Drag to canvas"}
            >
              <div className="w-8 h-8 bg-indigo-600 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[12px]">📂</div>
              <span className="text-[10px] font-bold text-indigo-800 text-center leading-tight">Sub<br/>Workflow</span>
            </div>
          </div>
        </div>

        {/* Gateways / Routing */}
        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Routing & Logic</h4>
          <div className="grid grid-cols-2 gap-2">
            <div 
              className="flex flex-col items-center justify-center p-3 bg-amber-50/50 border border-amber-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-amber-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'DECISION', 'Decision')} draggable
            >
              <div className="w-8 h-8 bg-amber-400 rotate-45 shadow-inner mb-3 mt-1 flex items-center justify-center text-white text-[10px]"></div>
              <span className="text-[10px] font-bold text-amber-800 text-center">Decision</span>
            </div>

            <div 
              className="flex flex-col items-center justify-center p-3 bg-cyan-50/50 border border-cyan-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-cyan-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'PARALLEL_GATEWAY', 'Parallel Split')} draggable
            >
              <div className="w-8 h-8 bg-cyan-500 rotate-45 shadow-inner mb-3 mt-1 flex items-center justify-center text-white font-bold text-[14px]">
                <span className="-rotate-45 block leading-none">+</span>
              </div>
              <span className="text-[10px] font-bold text-cyan-800 text-center leading-tight">Parallel<br/>Gateway</span>
            </div>
          </div>
        </div>

        {/* Events & Triggers */}
        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Events</h4>
          <div className="grid grid-cols-2 gap-2">
            <div 
              className="flex flex-col items-center justify-center p-3 bg-emerald-50/50 border border-emerald-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-emerald-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'START_EVENT', 'Start Event')} draggable
            >
              <div className="w-8 h-8 bg-emerald-500 rounded-full shadow-inner mb-2 flex items-center justify-center text-white text-[12px]">▶</div>
              <span className="text-[10px] font-bold text-emerald-800 text-center">Start</span>
            </div>

            <div 
              className="flex flex-col items-center justify-center p-3 bg-rose-50/50 border border-rose-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-rose-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'END_EVENT', 'End Event')} draggable
            >
              <div className="w-8 h-8 bg-rose-500 rounded-full shadow-inner mb-2 flex items-center justify-center text-white text-[12px]">⏹</div>
              <span className="text-[10px] font-bold text-rose-800 text-center">End</span>
            </div>

            <div 
              className="flex flex-col items-center justify-center p-3 bg-purple-50/50 border border-purple-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-purple-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'TIMER_EVENT', 'Timer / Wait')} draggable
            >
              <div className="w-8 h-8 bg-purple-500 rounded-full shadow-inner mb-2 flex items-center justify-center text-white text-[12px]">⏱</div>
              <span className="text-[10px] font-bold text-purple-800 text-center">Timer</span>
            </div>

          </div>
        </div>

        {/* Backend Processing Studios */}
        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 px-1">Backend Processing</h4>
          <div className="grid grid-cols-2 gap-2">
            <div 
              className="flex flex-col items-center justify-center p-3 bg-blue-50/50 border border-blue-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-blue-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'STUDIO_CALCULATION_ENGINE', 'Calculation Engine')} draggable
            >
              <div className="w-8 h-8 bg-blue-600 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[14px]">🧮</div>
              <span className="text-[10px] font-bold text-blue-800 text-center leading-tight">Calc<br/>Engine</span>
            </div>

            <div 
              className="flex flex-col items-center justify-center p-3 bg-amber-50/50 border border-amber-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-amber-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'STUDIO_BUSINESS_RULES', 'Rules Engine')} draggable
            >
              <div className="w-8 h-8 bg-amber-600 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[14px]">⚖️</div>
              <span className="text-[10px] font-bold text-amber-800 text-center leading-tight">Rules<br/>Engine</span>
            </div>

            <div 
              className="flex flex-col items-center justify-center p-3 bg-emerald-50/50 border border-emerald-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-emerald-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'STUDIO_REPORT_DESIGNER', 'Report Generation')} draggable
            >
              <div className="w-8 h-8 bg-emerald-600 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[14px]">📊</div>
              <span className="text-[10px] font-bold text-emerald-800 text-center leading-tight">Report<br/>Engine</span>
            </div>

            <div 
              className="flex flex-col items-center justify-center p-3 bg-cyan-50/50 border border-cyan-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-cyan-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'STUDIO_DATA_GATEWAY', 'Data Gateway')} draggable
            >
              <div className="w-8 h-8 bg-cyan-600 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[14px]">🔀</div>
              <span className="text-[10px] font-bold text-cyan-800 text-center leading-tight">Data<br/>Mappers</span>
            </div>

            <div 
              className="flex flex-col items-center justify-center p-3 bg-purple-50/50 border border-purple-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-purple-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'STUDIO_API_DESIGNER', 'API Invocation')} draggable
            >
              <div className="w-8 h-8 bg-purple-600 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[14px]">🔌</div>
              <span className="text-[10px] font-bold text-purple-800 text-center leading-tight">API<br/>Invoker</span>
            </div>

            <div 
              className="flex flex-col items-center justify-center p-3 bg-fuchsia-50/50 border border-fuchsia-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-fuchsia-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'STUDIO_AI_ASSISTANT', 'AI Agent Task')} draggable
            >
              <div className="w-8 h-8 bg-fuchsia-600 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[14px]">🧠</div>
              <span className="text-[10px] font-bold text-fuchsia-800 text-center leading-tight">AI<br/>Agent</span>
            </div>
            
            <div 
              className="flex flex-col items-center justify-center p-3 bg-rose-50/50 border border-rose-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-rose-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'STUDIO_EVENT_REPOSITORY', 'Event Publisher')} draggable
            >
              <div className="w-8 h-8 bg-rose-600 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[14px]">📡</div>
              <span className="text-[10px] font-bold text-rose-800 text-center leading-tight">Event<br/>PubSub</span>
            </div>

            <div 
              className="flex flex-col items-center justify-center p-3 bg-slate-50/50 border border-slate-200/50 rounded-xl cursor-grab hover:shadow-md hover:bg-slate-100/50 transition-all active:cursor-grabbing"
              onDragStart={(e) => onDragStart(e, 'STUDIO_DOCUMENT_MASTER', 'Document Processing')} draggable
            >
              <div className="w-8 h-8 bg-slate-600 rounded-lg shadow-inner mb-2 flex items-center justify-center text-white text-[14px]">📄</div>
              <span className="text-[10px] font-bold text-slate-800 text-center leading-tight">Doc<br/>Processing</span>
            </div>
          </div>
        </div>

        {/* Connection Instruction */}
        <div className="pt-2">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">How To Connect</h4>
          <div className="p-3 bg-indigo-50/50 border border-indigo-100/50 rounded-xl flex flex-col gap-2 text-left">
            <span className="text-[10px] font-medium text-indigo-700 leading-snug">
              <strong>State Transitions:</strong> Hover over any block on the canvas, click one of its blue edge dots, and drag to another block to create an arrow.
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
