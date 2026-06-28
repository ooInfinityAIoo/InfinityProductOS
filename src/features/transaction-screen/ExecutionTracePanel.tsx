import React from 'react';

interface ExecutionTracePanelProps {
  trace: any[];
}

export const ExecutionTracePanel: React.FC<ExecutionTracePanelProps> = ({ trace }) => {
  if (!trace || trace.length === 0) {
    return (
      <div className="text-sm text-slate-500 py-6 text-center">
        No execution trace available for this transaction.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-6">
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <span className="text-indigo-600">⚡</span> Execution Audit Trace
        </h3>
        <span className="text-xs font-semibold text-slate-500 bg-slate-200 px-2 py-1 rounded">Chronological</span>
      </div>
      <div className="p-6">
        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
          {trace.map((event: any, idx: number) => {
            // Flexible parser for different trace formats
            const timestamp = event.timestamp || event.time || event.created_at || '';
            const action = event.action || event.event_type || event.type || 'SYSTEM_ACTION';
            const description = event.description || event.message || event.details || JSON.stringify(event);
            
            // Determine icon and colors based on action keywords
            let icon = '⏺';
            let bgClass = 'bg-slate-100 text-slate-500';
            
            const actionUpper = String(action).toUpperCase();
            if (actionUpper.includes('RULE') || actionUpper.includes('EVAL')) {
              icon = '⚖️'; bgClass = 'bg-sky-100 text-sky-600';
            } else if (actionUpper.includes('API') || actionUpper.includes('INTEGRATION')) {
              icon = '🌐'; bgClass = 'bg-purple-100 text-purple-600';
            } else if (actionUpper.includes('CALC')) {
              icon = '🧮'; bgClass = 'bg-emerald-100 text-emerald-600';
            } else if (actionUpper.includes('FAIL') || actionUpper.includes('ERROR') || actionUpper.includes('REJECT')) {
              icon = '✕'; bgClass = 'bg-red-100 text-red-600';
            } else if (actionUpper.includes('PAUSE') || actionUpper.includes('APPROVAL')) {
              icon = '⏸'; bgClass = 'bg-amber-100 text-amber-600';
            } else if (actionUpper.includes('COMPLETE') || actionUpper.includes('SUCCESS')) {
              icon = '✓'; bgClass = 'bg-emerald-100 text-emerald-600';
            }

            return (
              <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-4 border-white ${bgClass} shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2`}>
                  <span className="text-xs">{icon}</span>
                </div>
                <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">{action}</div>
                    <time className="text-[10px] text-slate-400 font-mono">{timestamp}</time>
                  </div>
                  <div className="text-sm text-slate-600 mt-1">{description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
