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

import React, { useState } from 'react';

export const TransactionWorkflowScreen: React.FC = () => {
  // selectedInstanceId will drive the GET /workflows/instances/{id} fetch wired
  // in E1 commit 4/N. For this scaffolding commit we render a static placeholder
  // so the route lights up and the StudioErrorBoundary contract is provable.
  const [selectedInstanceId, _setSelectedInstanceId] = useState<string | null>(null);

  return (
    <div className="w-full flex flex-col gap-6 p-6">
      <div className="glass-card rounded-2xl p-6 bg-white/85 backdrop-blur-md border border-white/30 shadow-glass">
        <div className="flex items-center gap-3 mb-3">
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

        <div className="mt-4 p-4 rounded-xl bg-indigo-50/40 border border-indigo-100 text-[12px] text-indigo-900 leading-relaxed">
          <span className="font-bold">E1 scaffolding active.</span>{' '}
          This screen will render the metro tracker for any in-flight execution
          instance, color-coded across the 12 lifecycle states (pending, in
          progress, paused, retrying, awaiting repair, failed, blocked, rejected,
          cancelled, completed, reversed, skipped) with live sub-text per station.
          The visual canvas lands in <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded">E1 commit 3/N</span>;
          data binding to{' '}
          <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded">
            GET /workflows/instances/{'{id}'}
          </span>{' '}
          lands in <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded">commit 4/N</span>.
        </div>

        {/* Placeholder visual region — replaced by the metro tracker SVG in commit 3/N. */}
        <div className="mt-6 h-[220px] rounded-2xl border border-dashed border-slate-200 bg-slate-50/30 flex items-center justify-center text-slate-400 text-[12px] font-medium">
          {selectedInstanceId
            ? `Selected instance: ${selectedInstanceId}`
            : 'No transaction selected — instance picker lands in commit 4/N'}
        </div>
      </div>
    </div>
  );
};
