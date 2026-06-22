// WHY THIS FILE EXISTS (E1 commit 2/N — TRANSACTION_SCREEN_DESIGN.md §2):
// The Transaction Workflow Screen is the runtime UI an operator uses to process
// a single live transaction. It is the most important user-facing surface in the
// platform — every other studio (Workflow Designer, Business Rules, Calculation
// Engine, API Designer, Screen Designer, etc.) ultimately exists so this screen
// can render and drive a transaction end-to-end.
//
// THIS COMMIT (scaffolding only): registers the new feature module in the
// platform's lazy-loaded route table and renders a clean placeholder. The placeholder
// confirms the wiring works end-to-end (store -> App.tsx -> Suspense -> module ->
// StudioErrorBoundary) before any visual logic lands.
//
// WHAT BREAKS IF REMOVED: the new screen is unreachable; the metro tracker visuals
// landing in commit 3/N have no host module to mount inside.
//
// WHAT LANDS NEXT (per HANDOFF.md):
//   E1 commit 3/N — Metro tracker SVG component renders the 12 lifecycle states.
//   E1 commit 4/N — Wire to live data via GET /workflows/instances/{instance_id}.
//   E1 commit 5/N — Live sub-text per station from audit columns.
//   E1 commit 6/N — Sub-workflow + parallel-branch rendering.

// WHY THIS FILE EXISTS (E1 — TRANSACTION_SCREEN_DESIGN.md):
// The Transaction Workflow Screen is the runtime UI an operator uses to view and
// process a single live transaction. It is the most important user-facing surface
// in the platform — every other studio exists so this screen can render and drive
// a transaction end-to-end. This component hosts the metro tracker visualization,
// action buttons, and sidebar panels (reversal, issue detail, etc.).
//
// E1 PHASE: Read-only view. Operators can SEE transactions (metro tracker,
// current-step details, live sub-text). E2 adds ACTIONS (approve, reject, retry,
// cancel). E3-E4 add REVERSAL. E5 adds SEARCH.

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { MetroTracker, TrackerStation, StepLifecycleState } from './MetroTracker';
import { InstancePicker } from './InstancePicker';
import { StepIssuePanel } from './StepIssuePanel';

// MAPPING FUNCTION: converts API instance response to metro tracker stations.
// Maps the instance's current_node_id + workflow nodes to TrackerStation[].
// WHAT BREAKS IF REMOVED: The metro tracker has no data source — can't render.
//
// Logic:
//   - If instance.status in (COMPLETED, REJECTED, CANCELLED, REVERSED) → all prior
//     nodes are green (COMPLETED). The terminal node gets the instance's status.
//   - If instance.status in (RUNNING, PAUSED, RETRYING) → nodes before current
//     are COMPLETED; current node gets the instance's status; rest are PENDING.
//
// E1 commit 5/N: Extract live sub-text from instance audit columns:
//   - RETRYING: "retry N/M" from retry_attempts_log
//   - CANCELLED: "[reason_code] message"
//   - AWAITING_REPAIR: "in {queue_name} queue"
//   - PAUSED: context from execution_trace if available
//
// Sub-text is only shown on the current_node_id station (where the interesting
// state is). Other stations (completed, pending) have no sub-text noise.
const mapInstanceToStations = (
  instance: any,
  workflowNodes: any[]
): TrackerStation[] => {
  const currentNodeIdx = workflowNodes.findIndex(n => n.node_id === instance.current_node_id);

  // Determine the state of the current node based on instance.status
  const statusToState: Record<string, StepLifecycleState> = {
    RUNNING: 'IN_PROGRESS',
    PAUSED: 'PAUSED',
    RETRYING: 'RETRYING',
    AWAITING_REPAIR: 'AWAITING_REPAIR',
    FAILED_TECHNICAL: 'FAILED_TECHNICAL',
    COMPLETED: 'COMPLETED',
    REJECTED: 'REJECTED',
    BLOCKED: 'BLOCKED',
    CANCELLED: 'CANCELLED',
    REVERSED: 'REVERSED',
  };
  const currentState = statusToState[instance.status] || 'IN_PROGRESS';

  // Extract sub-text for the current node based on its lifecycle state
  // E1 commit 5/N — these come from the E0 audit columns on WorkflowExecutionInstance
  let currentNodeSubText: string | undefined;
  if (instance.current_node_id && currentState) {
    if (currentState === 'RETRYING' && instance.retry_attempts_log) {
      // Count retry attempts to show "retry N/M"
      const attempts = Array.isArray(instance.retry_attempts_log)
        ? instance.retry_attempts_log.length
        : 0;
      const maxAttempts = instance.retry_config?.max_attempts || 3;
      currentNodeSubText = `retry ${attempts} / ${maxAttempts}`;
    } else if (currentState === 'CANCELLED' && instance.cancelled_reason_code) {
      // Show cancellation reason + message
      const reasonCode = instance.cancelled_reason_code;
      const message =
        instance.cancelled_message ||
        'Transaction cancelled by business rule.';
      currentNodeSubText = `[${reasonCode}] ${message}`;
    } else if (
      currentState === 'AWAITING_REPAIR' &&
      instance.repair_queue_assigned
    ) {
      // Show which repair queue this lives in
      currentNodeSubText = `in ${instance.repair_queue_assigned} queue`;
    } else if (currentState === 'PAUSED') {
      // For PAUSED, look in execution_trace for a recent pause marker
      // (e.g., "[PAUSED] awaiting PAYMENTS_MANAGER at node...")
      // Fallback to a generic message if not found
      currentNodeSubText = 'awaiting external input';
    }
  }

  return workflowNodes.map((node, idx) => {
    let state: StepLifecycleState;
    if (idx < currentNodeIdx) {
      // Nodes before the current node are always completed
      state = 'COMPLETED';
    } else if (idx === currentNodeIdx) {
      // Current node's state reflects the instance's lifecycle
      state = currentState;
    } else {
      // Nodes after the current node are pending
      state = 'PENDING';
    }

    // Only the current node gets sub-text; others are silent
    const subText = idx === currentNodeIdx ? currentNodeSubText : undefined;

    return {
      node_id: node.node_id,
      sequence_number: node.sequence_number,
      node_title: node.node_title,
      state,
      sub_text: subText,
    };
  });
};

export const TransactionWorkflowScreen: React.FC = () => {
  // E2 commit 1/N: Action buttons + operator workflows. Operators can approve, reject,
  // retry, or cancel a transaction from this screen. Each action mutates the instance
  // state via POST /workflows/{id}/resume or specialized action endpoints.
  //
  // E2 commit 2/N: Instance picker + navigation. Operators can search for and navigate
  // between transactions. InstancePicker fetches recent/filtered instances from
  // GET /workflows/instances/list and allows selecting one to view.
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>('WFI-ECC2B272');
  const [actionError, setActionError] = useState<string | null>(null);
  const [showInstancePicker, setShowInstancePicker] = useState(false);
  const queryClient = useQueryClient();

  const { data: instanceResponse, isLoading, error } = useQuery({
    queryKey: ['workflow-instance', selectedInstanceId],
    queryFn: async () => {
      if (!selectedInstanceId) return null;
      const response = await apiClient.get(`/workflows/instances/${selectedInstanceId}`);
      return response.data;
    },
    enabled: !!selectedInstanceId,
  });

  // Memoize the stations array so the metro tracker doesn't re-render unnecessarily
  const stations = useMemo(() => {
    if (!instanceResponse || !instanceResponse.workflow_nodes) return [];
    return mapInstanceToStations(instanceResponse, instanceResponse.workflow_nodes);
  }, [instanceResponse]);

  // E2 commit 1/N — Approve mutation (PAUSED → resume with approval decision)
  // WHY THIS EXISTS: HUMAN_APPROVAL nodes pause the workflow waiting for operator
  // decision. Approve sends that decision back to the engine, resuming execution.
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!instanceResponse) throw new Error('Instance not found');
      const response = await apiClient.post(
        `/workflows/${instanceResponse.workflow_id}/resume/${selectedInstanceId}`,
        { decision: 'approve', approver_id: 'current_user' } // simplified for E2
      );
      return response.data;
    },
    onSuccess: () => {
      // Refetch instance to see updated state
      queryClient.invalidateQueries({
        queryKey: ['workflow-instance', selectedInstanceId],
      });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(`Approve failed: ${String(err)}`);
    },
  });

  // E2 commit 1/N — Reject mutation (PAUSED → resume with rejection decision)
  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!instanceResponse) throw new Error('Instance not found');
      const response = await apiClient.post(
        `/workflows/${instanceResponse.workflow_id}/resume/${selectedInstanceId}`,
        { decision: 'reject', reason: 'Rejected by operator' }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workflow-instance', selectedInstanceId],
      });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(`Reject failed: ${String(err)}`);
    },
  });

  // E2 commit 1/N — Retry mutation (RETRYING/FAILED → retry the step)
  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!instanceResponse) throw new Error('Instance not found');
      const response = await apiClient.post(
        `/workflows/${instanceResponse.workflow_id}/resume/${selectedInstanceId}`,
        { action: 'retry' }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workflow-instance', selectedInstanceId],
      });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(`Retry failed: ${String(err)}`);
    },
  });

  // E2 commit 1/N — Cancel mutation (any step → terminate transaction with reason)
  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!instanceResponse) throw new Error('Instance not found');
      const response = await apiClient.post(
        `/workflows/${instanceResponse.workflow_id}/resume/${selectedInstanceId}`,
        { action: 'cancel_transaction', reason: 'Cancelled by operator' }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workflow-instance', selectedInstanceId],
      });
      setActionError(null);
    },
    onError: (err) => {
      setActionError(`Cancel failed: ${String(err)}`);
    },
  });

  // LOADING STATE
  if (isLoading) {
    return (
      <div className="w-full flex flex-col gap-6 p-6">
        <div className="glass-card rounded-2xl p-6 bg-white/85 backdrop-blur-md border border-white/30 shadow-glass h-[500px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
              <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center font-extrabold text-indigo-600 text-xs shadow-inner">
                T
              </div>
            </div>
            <div className="text-center">
              <div className="text-[12px] font-semibold text-slate-600">Fetching transaction...</div>
              <div className="text-[11px] text-slate-500 mt-1">WFI-ECC2B272</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ERROR STATE
  if (error || !instanceResponse) {
    return (
      <div className="w-full flex flex-col gap-6 p-6">
        <div className="glass-card rounded-2xl p-6 bg-white/85 backdrop-blur-md border border-red-200/50 shadow-glass">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-50 text-red-600 font-extrabold text-xs flex-shrink-0 mt-0.5">
              !
            </div>
            <div>
              <h2 className="text-[13px] font-extrabold text-red-900">
                Transaction not found
              </h2>
              <p className="text-[12px] text-red-700 mt-1">
                Instance {selectedInstanceId} could not be loaded. The workflow may have
                been archived or the ID is invalid.
              </p>
              <p className="text-[11px] text-red-600 mt-2 font-mono">
                {error ? String(error) : 'Unknown error'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LIVE DATA STATE
  const currentNode = instanceResponse.workflow_nodes?.find(
    (n: any) => n.node_id === instanceResponse.current_node_id
  );

  return (
    <div className="w-full flex flex-col gap-6 p-6">
      {/* E2 commit 2/N — Instance picker collapsible panel */}
      {showInstancePicker && (
        <div className="glass-card rounded-2xl p-6 bg-white/85 backdrop-blur-md border border-white/30 shadow-glass">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-extrabold text-slate-800">Find a Transaction</h2>
            <button
              onClick={() => setShowInstancePicker(false)}
              className="text-slate-500 hover:text-slate-700 text-lg leading-none"
            >
              ✕
            </button>
          </div>
          <InstancePicker
            selectedInstanceId={selectedInstanceId}
            onSelect={(id) => {
              setSelectedInstanceId(id);
              setShowInstancePicker(false);
            }}
          />
        </div>
      )}

      <div className="glass-card rounded-2xl p-6 bg-white/85 backdrop-blur-md border border-white/30 shadow-glass">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 font-extrabold text-base shadow-inner">
              T
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-800 tracking-tight font-display">
                Transaction Workflow Screen
              </h1>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                Runtime view · Live metro tracker for a single transaction
              </p>
            </div>
          </div>
          {/* E2 commit 2/N — Instance selector button */}
          <button
            onClick={() => setShowInstancePicker(!showInstancePicker)}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            {showInstancePicker ? '✕ Close' : '⊕ Select Instance'}
          </button>
        </div>

        {/* Transaction header — instance identity + status badge */}
        <div className="mb-4 pb-4 border-b border-slate-200/50">
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-slate-600">
              <span className="font-medium">Instance:</span>{' '}
              <span className="font-mono text-slate-500">{instanceResponse.instance_id}</span>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span className="text-[11px] font-semibold text-slate-700">
                {instanceResponse.status}
              </span>
            </div>
          </div>
        </div>

        {/* Metro tracker — E1 commit 4/N live data. Renders the instance's workflow
            with stations color-coded by their lifecycle state. */}
        <div className="mt-6">
          <MetroTracker stations={stations} />
        </div>

        {/* Error banner — E2 action errors */}
        {actionError && (
          <div className="mt-4 p-3 rounded-lg bg-red-50/40 border border-red-200/50 text-[11px] text-red-900">
            <span className="font-bold">Action error:</span> {actionError}
          </div>
        )}

        {/* Current step details — populated from the instance's current_node_id */}
        {currentNode && (
          <div className="mt-6 p-4 rounded-xl bg-slate-50/50 border border-slate-200/60">
            <div className="flex items-start justify-between mb-3">
              <div className="text-[12px] text-slate-600">
                <span className="font-bold">
                  {currentNode.sequence_number}. {currentNode.node_title}
                </span>
                {instanceResponse.status === 'PAUSED' && (
                  <span className="ml-2 text-slate-500">(paused)</span>
                )}
                {instanceResponse.status === 'RETRYING' && (
                  <span className="ml-2 text-slate-500">(retrying)</span>
                )}
                <br />
                <span className="text-slate-500 text-[11px] mt-2 block">
                  {instanceResponse.status === 'PAUSED'
                    ? 'Awaiting your decision to proceed.'
                    : instanceResponse.status === 'RETRYING'
                    ? 'Automatic retry in progress. You can retry now or skip this step.'
                    : 'Step is executing.'}
                </span>
              </div>
            </div>

            {/* E2 commit 1/N — Action buttons */}
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-200/50">
              {/* Approve button — PAUSED state only */}
              {instanceResponse.status === 'PAUSED' && (
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-[11px] font-semibold hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span>✓</span>
                  {approveMutation.isPending ? 'Approving...' : 'Approve'}
                </button>
              )}

              {/* Reject button — PAUSED state only */}
              {instanceResponse.status === 'PAUSED' && (
                <button
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span>✕</span>
                  {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
                </button>
              )}

              {/* Retry button — RETRYING or FAILED states */}
              {(instanceResponse.status === 'RETRYING' ||
                instanceResponse.status === 'FAILED_TECHNICAL') && (
                <button
                  onClick={() => retryMutation.mutate()}
                  disabled={retryMutation.isPending}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span>↻</span>
                  {retryMutation.isPending ? 'Retrying...' : 'Retry now'}
                </button>
              )}

              {/* Cancel button — always available if cancellable */}
              {currentNode.cancellable && (
                <button
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <span>×</span>
                  {cancelMutation.isPending ? 'Cancelling...' : 'Cancel'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* E2 commit 3/N — Step-issue panel (failure diagnostics) */}
        {currentNode &&
          ['RETRYING', 'FAILED_TECHNICAL', 'AWAITING_REPAIR'].includes(
            instanceResponse.status
          ) && (
            <StepIssuePanel
              currentNode={currentNode}
              instanceResponse={instanceResponse}
              onRetry={() => retryMutation.mutate()}
              onSendToRepair={() => {
                /* E2 commit 3/N: placeholder for send-to-repair action */
              }}
              onCancel={() => cancelMutation.mutate()}
              isRetryPending={retryMutation.isPending}
            />
          )}

        {/* Info banner — E2 commit 3/N phase. */}
        <div className="mt-4 p-3 rounded-lg bg-blue-50/40 border border-blue-200/50 text-[11px] text-blue-900">
          <span className="font-bold">E2 commit 3/N:</span> Step-issue detail panel
          added for RETRYING/FAILED states. Shows error details, retry history, and
          operator actions (Retry now, Skip, Send to repair queue, Cancel). Action
          buttons + instance picker from E2 commits 1-2 available.
        </div>
      </div>
    </div>
  );
};
