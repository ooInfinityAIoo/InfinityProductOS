// WHY THIS FILE EXISTS (E3 commit 1/N — TRANSACTION_SCREEN_DESIGN.md §5):
// When an operator wants to roll back a completed step, the Reversal Drawer
// shows the compensation recipe in plain language ("Will cancel FX hold of $592,500.
// Will send pacs.002 reject. Will mark as REVERSED."), collects mandatory reason
// and category, enforces 4-eye approval if needed, and submits the reversal.
//
// Reversal is saga-style compensation, not undo. The drawer guides the operator
// through the decision and captures the audit trail (who, when, why, what changed).
//
// WHAT BREAKS IF REMOVED: Operators can't reverse (rollback) completed transactions.

import React, { useState } from 'react';

export interface ReversalDrawerProps {
  nodeId: string;
  nodeTitle: string;
  reversibility: string; // REVERSIBLE, REVERSIBLE_WITH_APPROVAL, IRREVERSIBLE, CONDITIONALLY_REVERSIBLE
  reversalRecipe?: {
    db_reversal?: string;
    api_reversal?: { api_id: string };
    event_reversal?: { event_code: string };
  };
  onSubmit: (payload: { reason: string; category: string }) => void;
  onClose: () => void;
  isSubmitting?: boolean;
}

export const ReversalDrawer: React.FC<ReversalDrawerProps> = ({
  nodeId,
  nodeTitle,
  reversibility,
  reversalRecipe,
  onSubmit,
  onClose,
  isSubmitting = false,
}) => {
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('customer-request');
  const [error, setError] = useState<string | null>(null);

  const isIrreversible = reversibility === 'IRREVERSIBLE';
  const needsApproval = reversibility === 'REVERSIBLE_WITH_APPROVAL';

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }
    onSubmit({ reason, category });
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 px-6 py-4 border-b border-slate-200 flex items-start justify-between bg-white">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Reverse step: {nodeTitle}
            </h2>
            <p className="text-[12px] text-slate-500 mt-1">
              Rollback to undo this step via saga compensation
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-500 hover:text-slate-700 text-2xl leading-none disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Irreversible warning */}
          {isIrreversible && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-[12px]">
              <div className="font-bold">🔒 Cannot be reversed</div>
              <div className="mt-1 text-[11px] text-red-800">
                This step is locked. It may be a regulatory submission, settlement,
                or other operation that cannot be undone for compliance reasons.
              </div>
            </div>
          )}

          {/* Reversal recipe */}
          {!isIrreversible && reversalRecipe && (
            <div>
              <div className="text-[12px] font-bold text-slate-800 mb-2">
                What will be reversed
              </div>
              <ul className="space-y-2 text-[12px] text-slate-700">
                {reversalRecipe.db_reversal && (
                  <li className="flex gap-2">
                    <span className="text-amber-600">→</span>
                    <span>
                      Database fields will be restored from pre-step snapshot
                    </span>
                  </li>
                )}
                {reversalRecipe.api_reversal && (
                  <li className="flex gap-2">
                    <span className="text-amber-600">→</span>
                    <span>
                      Compensating API will be called to reverse downstream effects
                    </span>
                  </li>
                )}
                {reversalRecipe.event_reversal && (
                  <li className="flex gap-2">
                    <span className="text-amber-600">→</span>
                    <span>
                      Reversal event will be emitted for derived records (Insights,
                      Recon)
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-[11px]">
              {error}
            </div>
          )}

          {!isIrreversible && (
            <>
              {/* Reason field */}
              <div>
                <label className="text-[12px] font-bold text-slate-800 block mb-2">
                  Reason for reversal (required)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g., Customer called requesting reversal due to duplicate entry..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  rows={3}
                />
              </div>

              {/* Category dropdown */}
              <div>
                <label className="text-[12px] font-bold text-slate-800 block mb-2">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="customer-request">Customer request</option>
                  <option value="compliance-review">Compliance review</option>
                  <option value="data-error">Data error</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* 4-eye approval note */}
              {needsApproval && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                  <span className="font-bold">👥 Requires 4-eye approval</span>
                  <div className="mt-1 text-amber-800">
                    An approver (who is not you) must sign off before the reversal
                    executes.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-6 py-4 border-t border-slate-200 flex gap-3 justify-end bg-white">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-[12px] font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isIrreversible || isSubmitting || !reason.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {needsApproval ? 'Submit for approval' : 'Reverse'}
            {isSubmitting && '...'}
          </button>
        </div>
      </div>
    </div>
  );
};
