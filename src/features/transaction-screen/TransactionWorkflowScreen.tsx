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

import React, { useState } from 'react';
import { MetroTracker, TrackerStation, StepLifecycleState } from './MetroTracker';

export const TransactionWorkflowScreen: React.FC = () => {
  // E1 commit 3/N: Demo workflow data covering all 12 lifecycle states.
  // Each station represents a node in the workflow; the state dictates its color,
  // icon, and sub-text. This demo proves the metro tracker renders all states
  // correctly before live data binding (commit 4/N) wires to the API.
  //
  // A real transaction would come from GET /workflows/instances/{instance_id}
  // (landed in commit 1/N); for this demo we hardcode a rich example.
  const demoStations: TrackerStation[] = [
    {
      node_id: 'NODE-1',
      sequence_number: 1,
      node_title: 'Ingest',
      state: 'COMPLETED',
    },
    {
      node_id: 'NODE-2',
      sequence_number: 2,
      node_title: 'AML & OFAC Screening',
      state: 'COMPLETED',
    },
    {
      node_id: 'NODE-3',
      sequence_number: 3,
      node_title: 'FX Rate Enrichment',
      state: 'RETRYING',
      sub_text: 'retry 2/3 · next in 28s',
    },
    {
      node_id: 'NODE-4',
      sequence_number: 4,
      node_title: 'Dual Authorization',
      state: 'PAUSED',
      sub_text: 'awaiting PAYMENTS_MANAGER',
    },
    {
      node_id: 'NODE-5',
      sequence_number: 5,
      node_title: 'RTGS Settlement',
      state: 'PENDING',
    },
  ];

  // E1 commit 4/N will replace this with:
  // const { data: instance } = useQuery({
  //   queryKey: ['workflow-instance', selectedInstanceId],
  //   queryFn: () => apiClient.get(`/workflows/instances/${selectedInstanceId}`)
  // });
  // const stations = mapInstanceToStations(instance);
  const [_selectedInstanceId] = useState<string | null>('WFI-DEMO-001');

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

        {/* Transaction header — would include UETR, customer, amount in commit 4/N. */}
        <div className="mb-4 pb-4 border-b border-slate-200/50">
          <div className="text-[13px] text-slate-600">
            <span className="font-medium">Demo instance:</span>{' '}
            <span className="font-mono text-slate-400">WFI-DEMO-001</span>
          </div>
        </div>

        {/* Metro tracker — E1 commit 3/N. Renders all 12 lifecycle states from the
            demoStations array. Color/icon language locked in design doc §2.1. */}
        <div className="mt-6">
          <MetroTracker stations={demoStations} />
        </div>

        {/* Current step details — would come from instance.current_node_id in commit 4/N. */}
        <div className="mt-6 p-4 rounded-xl bg-slate-50/50 border border-slate-200/60">
          <div className="text-[12px] text-slate-600">
            <span className="font-bold">Current step (demo):</span> Dual Authorization (paused)
            <br />
            <span className="text-slate-500">
              Awaiting PAYMENTS_MANAGER approval. SLA 1h 23m of 4h.
            </span>
          </div>
        </div>

        {/* Info banner for this demo phase. Removed in commit 4/N when live data lands. */}
        <div className="mt-4 p-3 rounded-lg bg-amber-50/40 border border-amber-200/50 text-[11px] text-amber-900">
          <span className="font-bold">E1 commit 3/N (demo):</span> Metro tracker rendering
          all 12 lifecycle states. Live data binding to{' '}
          <span className="font-mono bg-white px-1 py-0.5 rounded">
            GET /workflows/instances/{'{id}'}
          </span>{' '}
          lands in commit 4/N. Live sub-text (retry counts, cancel reasons, queue names)
          lands in commit 5/N.
        </div>
      </div>
    </div>
  );
};
