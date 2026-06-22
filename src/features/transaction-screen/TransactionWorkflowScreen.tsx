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
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { MetroTracker, TrackerStation, StepLifecycleState } from './MetroTracker';

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
// E1 commit 5/N will enhance this to extract live sub-text from audit columns
// (retry_attempts_log, cancelled_reason_code, repair_queue_assigned, etc.).
const mapInstanceToStations = (
  instance: any,
  workflowNodes: any[]
): TrackerStation[] => {
  const nodeMap = new Map(workflowNodes.map(n => [n.node_id, n]));
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

    return {
      node_id: node.node_id,
      sequence_number: node.sequence_number,
      node_title: node.node_title,
      state,
      // sub_text lands in E1 commit 5/N — extracted from instance audit columns
      sub_text: undefined,
    };
  });
};

export const TransactionWorkflowScreen: React.FC = () => {
  // E1 commit 4/N: Live data binding. Operator selects an instance ID (via a picker
  // landing in a future commit); useQuery fetches the instance from the GET endpoint
  // (E1 commit 1/N), and the metro tracker renders it live.
  //
  // For now, we hard-code a demo instance ID to prove the wiring works.
  // The instance picker (to allow navigating between transactions) lands later.
  const [selectedInstanceId] = useState<string | null>('WFI-ECC2B272');

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
      <div className="glass-card rounded-2xl p-6 bg-white/85 backdrop-blur-md border border-white/30 shadow-glass">
        <div className="flex items-center gap-3 mb-4">
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

        {/* Current step details — populated from the instance's current_node_id */}
        {currentNode && (
          <div className="mt-6 p-4 rounded-xl bg-slate-50/50 border border-slate-200/60">
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
                  ? 'Awaiting human decision or external signal.'
                  : instanceResponse.status === 'RETRYING'
                  ? 'Automatic retry in progress.'
                  : 'Step is executing.'}
              </span>
            </div>
          </div>
        )}

        {/* Info banner — E1 commit 4/N phase. Removed in 5/N when live sub-text lands. */}
        <div className="mt-4 p-3 rounded-lg bg-green-50/40 border border-green-200/50 text-[11px] text-green-900">
          <span className="font-bold">E1 commit 4/N:</span> Live data binding via
          GET /workflows/instances/{'{id}'} working. Metro tracker renders live instance
          status. Live sub-text (retry counts, cancel reasons) lands in commit 5/N.
        </div>
      </div>
    </div>
  );
};
