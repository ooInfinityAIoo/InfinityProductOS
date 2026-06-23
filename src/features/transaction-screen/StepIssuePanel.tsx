// WHY THIS FILE EXISTS (E2 commit 3/N — TRANSACTION_SCREEN_DESIGN.md §2):
// When a step fails (RETRYING, FAILED_TECHNICAL, AWAITING_REPAIR), operators
// need to understand WHY and what their options are. StepIssuePanel shows:
//   - Full error message (from execution_trace or context)
//   - Retry history (attempt N: timestamp, error_code, error_message)
//   - Configured fallback (retries exhausted → repair queue)
//   - Operator actions: Retry now, Skip step, Send to repair queue, Cancel transaction
//
// WHAT BREAKS IF REMOVED: Operators can't see error details or retry history;
// they're flying blind on failure states.

import React from 'react';

export interface StepIssuePanelProps {
  currentNode: any;
  instanceResponse: any;
  onRetry: () => void;
  onSkip?: () => void;
  onSendToRepair?: () => void;
  onCancel: () => void;
  isRetryPending?: boolean;
}

export const StepIssuePanel: React.FC<StepIssuePanelProps> = ({
  currentNode,
  instanceResponse,
  onRetry,
  onSkip,
  onSendToRepair,
  onCancel,
  isRetryPending = false,
}) => {
  // Parse retry attempts from audit column
  const retryAttempts = Array.isArray(instanceResponse.retry_attempts_log)
    ? instanceResponse.retry_attempts_log
    : [];
  const currentAttempt = retryAttempts.length;
  const maxAttempts = currentNode?.retry_config?.max_attempts || 3;

  // Extract error message from most recent retry attempt or execution_trace
  const latestError = retryAttempts[retryAttempts.length - 1];
  const errorMessage =
    latestError?.error_message ||
    instanceResponse.current_context?.last_error ||
    'No error message available';
  const errorCode = latestError?.error_code || 'UNKNOWN_ERROR';

  return (
    <div className="mt-6 p-4 rounded-xl border border-red-200/60 bg-red-50/40">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-100 text-red-700 font-extrabold text-xs flex-shrink-0 mt-0.5">
          !
        </div>
        <div>
          <h3 className="text-[13px] font-extrabold text-red-900">
            Step issue: {currentNode?.node_title}
          </h3>
          <p className="text-[11px] text-red-700 mt-0.5">
            {instanceResponse.status === 'RETRYING'
              ? `Automatic retry in progress — attempt ${currentAttempt} of ${maxAttempts}`
              : instanceResponse.status === 'FAILED_TECHNICAL'
                ? 'Technical failure — retries exhausted'
                : instanceResponse.status === 'AWAITING_REPAIR'
                  ? 'Routed to repair queue pending manual intervention'
                  : 'Issue detected'}
          </p>
        </div>
      </div>

      {/* Error details */}
      <div className="bg-white/50 rounded-lg p-3 mb-3 text-[12px] border border-red-100">
        <div className="mb-2">
          <div className="text-red-700 font-mono font-bold text-[11px]">
            {errorCode}
          </div>
          <div className="text-red-900 mt-1 leading-relaxed">
            {errorMessage}
          </div>
        </div>
      </div>

      {/* Retry history (if available) */}
      {retryAttempts.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-semibold text-red-800 mb-2">
            Retry history ({retryAttempts.length})
          </div>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {retryAttempts.map((attempt, idx) => (
              <div
                key={idx}
                className="text-[10px] text-red-700 bg-white/40 px-2 py-1.5 rounded border border-red-100/50"
              >
                <div className="font-mono font-bold">{attempt.error_code}</div>
                <div className="text-red-600 text-[9px] mt-0.5">
                  {new Date(attempt.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configured fallback */}
      {currentNode?.on_failure && (
        <div className="mb-3 text-[11px] text-red-800 bg-white/40 px-2.5 py-1.5 rounded border border-red-100/50">
          <span className="font-semibold">If retries exhausted:</span>{' '}
          {currentNode.on_failure === 'REPAIR_QUEUE'
            ? `Route to ${currentNode.repair_queue_name || 'repair queue'}`
            : currentNode.on_failure === 'FAIL_FAST'
              ? 'Terminate workflow (no repair queue)'
              : 'Continue attempting'}
        </div>
      )}

      {/* Operator actions */}
      <div className="border-t border-red-100 pt-3 mt-3">
        <div className="text-[10px] font-bold text-red-800 uppercase tracking-wide mb-2">
          Your options
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Retry now */}
          <button
            onClick={onRetry}
            disabled={isRetryPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span>↻</span>
            {isRetryPending ? 'Retrying...' : 'Retry now'}
          </button>

          {/* Skip step (if skippable) */}
          {currentNode?.skippable && onSkip && (
            <button
              onClick={onSkip}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-200 transition-colors"
            >
              <span>↷</span>
              Skip step
            </button>
          )}

          {/* Send to repair queue */}
          {onSendToRepair && instanceResponse.status !== 'AWAITING_REPAIR' && (
            <button
              onClick={onSendToRepair}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-200 transition-colors"
            >
              <span>↪</span>
              Send to repair queue
            </button>
          )}

          {/* Cancel transaction */}
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 border border-red-300 text-red-700 text-[11px] font-semibold hover:bg-red-200 transition-colors"
          >
            <span>×</span>
            Cancel transaction
          </button>
        </div>
      </div>
    </div>
  );
};
