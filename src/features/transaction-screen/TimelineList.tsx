import React from 'react';
import { StepLifecycleState } from './MetroTracker';

export interface TimelineStep {
  node_id: string;
  sequence_number: number;
  node_title: string;
  state: StepLifecycleState;
  sub_text?: string;
  screen_template?: string;
  node_type?: string;
  sla_warning?: boolean;
  sla_breached?: boolean;
}

interface TimelineListProps {
  steps: TimelineStep[];
  activeStepId: string | null;
  onStepClick: (nodeId: string) => void;
}

const STATE_CONFIG: Record<
  StepLifecycleState,
  {
    bgClass: string;
    borderClass: string;
    textClass: string;
    bulletClass: string;
    icon: string;
    label: string;
  }
> = {
  PENDING: {
    bgClass: 'bg-slate-50/50',
    borderClass: 'border-slate-200',
    textClass: 'text-slate-500',
    bulletClass: 'bg-slate-200 border-slate-300',
    icon: '○',
    label: 'Pending',
  },
  IN_PROGRESS: {
    bgClass: 'bg-amber-50/30 border-amber-200 animate-pulse',
    borderClass: 'border-amber-300',
    textClass: 'text-amber-800 font-semibold',
    bulletClass: 'bg-amber-400 border-amber-600 animate-ping',
    icon: '●',
    label: 'In Progress',
  },
  PAUSED: {
    bgClass: 'bg-amber-50 border-amber-200',
    borderClass: 'border-amber-400',
    textClass: 'text-amber-800 font-bold',
    bulletClass: 'bg-amber-500 border-amber-600',
    icon: '‖',
    label: 'Paused',
  },
  RETRYING: {
    bgClass: 'bg-amber-50 border-amber-300',
    borderClass: 'border-amber-500',
    textClass: 'text-amber-800 font-bold',
    bulletClass: 'bg-amber-500 border-amber-600 animate-spin',
    icon: '↻',
    label: 'Retrying',
  },
  AWAITING_REPAIR: {
    bgClass: 'bg-red-50/60 border-red-200',
    borderClass: 'border-red-400',
    textClass: 'text-red-900 font-bold',
    bulletClass: 'bg-red-500 border-red-700 animate-bounce',
    icon: '✕',
    label: 'Awaiting Repair',
  },
  FAILED_TECHNICAL: {
    bgClass: 'bg-red-50 border-red-200',
    borderClass: 'border-red-500',
    textClass: 'text-red-900 font-bold',
    bulletClass: 'bg-red-700 border-red-900',
    icon: '✕',
    label: 'Technical Failure',
  },
  BLOCKED: {
    bgClass: 'bg-red-50 border-red-200',
    borderClass: 'border-red-500',
    textClass: 'text-red-950 font-bold',
    bulletClass: 'bg-red-600 border-red-800',
    icon: '!',
    label: 'Blocked',
  },
  REJECTED: {
    bgClass: 'bg-red-50 border-red-200',
    borderClass: 'border-red-500',
    textClass: 'text-red-950 font-bold',
    bulletClass: 'bg-red-600 border-red-800',
    icon: '✕',
    label: 'Rejected',
  },
  CANCELLED: {
    bgClass: 'bg-violet-50 border-violet-200',
    borderClass: 'border-violet-400',
    textClass: 'text-violet-900 font-semibold',
    bulletClass: 'bg-violet-500 border-violet-600',
    icon: '⊘',
    label: 'Cancelled',
  },
  COMPLETED: {
    bgClass: 'bg-emerald-50/20 border-slate-200 hover:bg-emerald-50/30',
    borderClass: 'border-emerald-300',
    textClass: 'text-emerald-800 font-medium',
    bulletClass: 'bg-emerald-600 border-emerald-700',
    icon: '✓',
    label: 'Completed',
  },
  REVERSED: {
    bgClass: 'bg-amber-50/20 border-amber-200',
    borderClass: 'border-amber-300',
    textClass: 'text-amber-800 font-medium',
    bulletClass: 'bg-amber-400 border-amber-500',
    icon: '↶',
    label: 'Reversed',
  },
  SKIPPED: {
    bgClass: 'bg-slate-50/30 border-slate-100',
    borderClass: 'border-slate-200',
    textClass: 'text-slate-400 italic',
    bulletClass: 'bg-slate-300 border-slate-400',
    icon: '—',
    label: 'Skipped',
  },
};

export const TimelineList: React.FC<TimelineListProps> = ({
  steps,
  activeStepId,
  onStepClick,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-2 pb-2 border-b border-slate-100">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Transaction Lifecycle Flow
        </h3>
        <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase">
          {steps.length} Steps
        </span>
      </div>

      <div className="relative pl-6 space-y-4">
        {/* Continuous connector line */}
        <div className="absolute left-3.5 top-2.5 bottom-2.5 w-0.5 bg-slate-200" />

        {steps.map((step, idx) => {
          const isActive = step.node_id === activeStepId;
          const conf = STATE_CONFIG[step.state] || STATE_CONFIG.PENDING;
          const isHuman = step.screen_template || step.node_type === 'HUMAN_APPROVAL';

          return (
            <div
              key={step.node_id}
              onClick={() => onStepClick(step.node_id)}
              className={`relative group cursor-pointer p-3 rounded-xl border transition-all duration-200 ${
                isActive
                  ? `${conf.bgClass} ring-2 ring-indigo-500/80 shadow-md ${conf.borderClass}`
                  : `${conf.bgClass} hover:border-slate-300 hover:shadow-sm ${conf.borderClass}`
              }`}
            >
              {/* Bullet Node */}
              <div className="absolute -left-[23px] top-4 flex items-center justify-center">
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white border ${
                    conf.bulletClass
                  }`}
                >
                  {conf.icon === '○' ? null : conf.icon}
                </div>
              </div>

              {/* Step Card Details */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold font-mono px-1 bg-slate-100 text-slate-500 rounded">
                      {String(step.sequence_number).padStart(2, '0')}
                    </span>
                    <h4 className={`text-[12px] ${conf.textClass} truncate`}>
                      {step.node_title}
                    </h4>
                  </div>

                  {/* Step metadata */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold border ${
                        isHuman
                          ? 'bg-blue-50 text-blue-700 border-blue-150'
                          : 'bg-slate-50 text-slate-600 border-slate-150'
                      }`}
                    >
                      {isHuman ? '👤 Human Action' : '⚙️ Auto System'}
                    </span>
                    
                    <span className="text-[9px] text-slate-400 font-medium">
                      {conf.label}
                    </span>

                    {/* SLA Indicators */}
                    {step.sla_breached && (
                      <span className="text-[8px] bg-red-100 text-red-700 border border-red-200 px-1 py-0.2 rounded font-bold uppercase animate-pulse">
                        SLA Breached !
                      </span>
                    )}
                    {step.sla_warning && !step.sla_breached && (
                      <span className="text-[8px] bg-amber-100 text-amber-700 border border-amber-200 px-1 py-0.2 rounded font-bold uppercase">
                        SLA Warning
                      </span>
                    )}
                  </div>

                  {/* Exception Subtext */}
                  {step.sub_text && (
                    <p className="text-[10px] text-red-600 font-medium mt-1.5 pl-1.5 border-l border-red-300 break-words">
                      {step.sub_text}
                    </p>
                  )}
                </div>

                {/* Arrow indicator on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 text-xs shrink-0 self-center">
                  →
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
