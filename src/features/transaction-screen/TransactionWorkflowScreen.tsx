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

import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { MetroTracker, TrackerStation, StepLifecycleState } from './MetroTracker';
import { InstancePicker } from './InstancePicker';
import { StepIssuePanel } from './StepIssuePanel';
import { ReversalDrawer } from './ReversalDrawer';
import { TransactionSearch } from './TransactionSearch';
import { BulkOperationsPanel } from './BulkOperationsPanel';
import { RunTransactionModal } from './RunTransactionModal';
import { Worklist } from './Worklist';
// Iteration 2 (TXN_SCREEN_LAYOUT_LANGUAGE.md band D) — the shared screen
// interpreter. Clicking a metro-tracker station renders THAT node's screen here,
// read-only for completed steps (= "playback"), editable only for the live action.
import { RuntimeScreenRenderer } from '../package-runtime/RuntimeScreenRenderer';
import { usePlatformStore } from '../../store/usePlatformStore';

// ── Band A facts row (TXN_SCREEN_LAYOUT_LANGUAGE.md §4) ──────────────────────
// Status → badge colour on the dark header band. Mirrors the metro-tracker
// urgency language: green done · amber in-motion · red blocked · purple cancel.
const STATUS_BADGE: Record<string, string> = {
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  RUNNING: 'bg-amber-500/20 text-amber-300',
  PAUSED: 'bg-amber-500/20 text-amber-300',
  RETRYING: 'bg-amber-500/20 text-amber-300',
  AWAITING_REPAIR: 'bg-red-500/20 text-red-300',
  FAILED_TECHNICAL: 'bg-red-500/20 text-red-300',
  BLOCKED: 'bg-red-500/20 text-red-300',
  REJECTED: 'bg-red-500/20 text-red-300',
  CANCELLED: 'bg-violet-500/20 text-violet-300',
  REVERSED: 'bg-amber-500/20 text-amber-300',
};

// INTERIM facts resolver. §4 of the spec calls for the facts row to be
// configurable per workflow (driven by the START node's screen). Until that
// lands, we resolve a small set of well-known ISO 20022 paths (with flat-key
// fallbacks) out of current_context and show only the ones that resolve — so a
// non-payment workflow simply shows fewer facts rather than blank/incorrect cells.
const FACT_CANDIDATES: { label: string; paths: string[] }[] = [
  { label: 'Amount', paths: ['FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt', 'amount', 'Amount'] },
  { label: 'Currency', paths: ['FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Ccy', 'currency', 'Ccy'] },
  { label: 'Beneficiary', paths: ['FIToFICstmrCdtTrf.CdtTrfTxInf.Cdtr.Nm', 'beneficiary', 'beneficiary_name'] },
  { label: 'Beneficiary BIC', paths: ['FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAgt.FinInstnId.BICFI', 'beneficiary_bic', 'BIC'] },
  { label: 'Value date', paths: ['FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt', 'value_date', 'valueDate'] },
];

const getByPath = (obj: any, path: string): any =>
  path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const resolveFacts = (ctx: any): { label: string; value: string }[] => {
  if (!ctx) return [];
  const out: { label: string; value: string }[] = [];
  for (const f of FACT_CANDIDATES) {
    for (const p of f.paths) {
      const v = getByPath(ctx, p);
      if (v !== undefined && v !== null && v !== '') {
        // Group-format numeric amounts (e.g. 592500 → 592,500.00) so the facts
        // row reads like money, not a raw integer.
        let display: string;
        if (f.label === 'Amount' && !isNaN(Number(v))) {
          display = Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
          display = typeof v === 'object' ? JSON.stringify(v) : String(v);
        }
        out.push({ label: f.label, value: display });
        break;
      }
    }
  }
  return out;
};

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

  // E4 commit 2/N — Detect parallel branches from node_type and parallel_group.
  // Nodes with node_type === 'FORK' are branch-split points (is_fork = true).
  // Nodes with node_type === 'JOIN' are branch-merge points (is_join = true).
  // Nodes with a parallel_group field live on a branch track below the main line.
  // Each unique parallel_group string gets its own numbered track (1, 2, …).
  // Nodes without these fields go on the main track (branch_track = 0 / undefined).
  const parallelGroupTrackMap = new Map<string, number>();
  let nextTrackNum = 1;

  return workflowNodes.map((node, idx) => {
    let state: StepLifecycleState;
    if (idx < currentNodeIdx) {
      state = 'COMPLETED';
    } else if (idx === currentNodeIdx) {
      state = currentState;
    } else {
      state = 'PENDING';
    }

    const subText = idx === currentNodeIdx ? currentNodeSubText : undefined;

    // Parallel branch detection
    const nodeType: string = node.node_type || 'STANDARD';
    const parallelGroup: string | undefined = node.parallel_group;

    let branch_track: number | undefined;
    let is_fork = false;
    let is_join = false;

    if (nodeType === 'FORK') {
      is_fork = true;
    } else if (nodeType === 'JOIN') {
      is_join = true;
    } else if (parallelGroup) {
      if (!parallelGroupTrackMap.has(parallelGroup)) {
        parallelGroupTrackMap.set(parallelGroup, nextTrackNum++);
      }
      branch_track = parallelGroupTrackMap.get(parallelGroup);
    }

    // E6 commit 1/N — SLA badge computation for the current active station.
    // slaDuration is stored as "DD:HH:MM:SS" on the node (set in NodePropertiesDrawer).
    // We compare elapsed time since the instance was created against the SLA bound.
    // Only active states (IN_PROGRESS, PAUSED, RETRYING, AWAITING_REPAIR) get badges —
    // completed/pending nodes don't need SLA warnings.
    let sla_warning = false;
    let sla_breached = false;
    const activeStates: StepLifecycleState[] = ['IN_PROGRESS', 'PAUSED', 'RETRYING', 'AWAITING_REPAIR'];
    if (idx === currentNodeIdx && activeStates.includes(state) && node.slaDuration && instance.created_at) {
      const [dd, hh, mm, ss] = (node.slaDuration as string).split(':').map(Number);
      const slaTotalSecs = (dd || 0) * 86400 + (hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0);
      if (slaTotalSecs > 0) {
        const elapsedSecs = (Date.now() - new Date(instance.created_at).getTime()) / 1000;
        const pct = elapsedSecs / slaTotalSecs;
        sla_breached = pct >= 1.0;
        sla_warning = !sla_breached && pct >= 0.75;
      }
    }

    return {
      node_id: node.node_id,
      sequence_number: node.sequence_number,
      node_title: node.node_title,
      state,
      sub_text: subText,
      branch_track,
      is_fork,
      is_join,
      sla_warning,
      sla_breached,
    };
  });
};

export const TransactionWorkflowScreen: React.FC = () => {
  // Default to the PAUSED test instance so the screen loads immediately with a real transaction.
  // Operators can switch via ⊕ Recent, 🔍 Search, or ⌘K.
  // Iteration 7 — the screen now LANDS on the worklist (null instance), not a
  // hardcoded transaction. Opening a worklist row sets this and switches to the
  // record workspace; "← Worklist" sets it back to null.
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showInstancePicker, setShowInstancePicker] = useState(false);
  // E5 commit 2/N — full search panel (replaces simple instance picker for deep queries)
  const [showSearch, setShowSearch] = useState(false);
  const [showBulkOps, setShowBulkOps] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [reversalNodeId, setReversalNodeId] = useState<string | null>(null);
  // Iteration 2 — which station's screen the operator is currently viewing.
  // null = follow the live current node; a node_id = the operator clicked a
  // station to inspect/playback that step. Reset to null whenever the instance changes.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Band C — operator can dismiss the contextual instruction banner.
  const [bandCDismissed, setBandCDismissed] = useState(false);
  // Band E (maker-checker) — reject requires a typed reason before it can fire.
  // showReject reveals the reason field; rejectReason holds the mandatory text.
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const { activeProductContext } = usePlatformStore();
  const queryClient = useQueryClient();

  // E6 commit 3/N — ⌘K (Mac) / Ctrl+K (Windows) opens the search panel.
  // WHY: operators processing high-volume runs need keyboard-speed navigation;
  // clicking three nested UI elements to search is too slow when managing 100+
  // transactions per shift. ⌘K is the platform-standard search shortcut.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(prev => {
          const next = !prev;
          if (next) { setShowInstancePicker(false); setShowBulkOps(false); }
          return next;
        });
      }
      // Escape closes all panels
      if (e.key === 'Escape') {
        setShowSearch(false);
        setShowInstancePicker(false);
        setShowBulkOps(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // E6 commit 1/N — auto-refresh for active (non-terminal) instances.
  // Terminal states (COMPLETED, REJECTED, CANCELLED, REVERSED, FAILED_TECHNICAL)
  // don't change, so we skip polling for them. Active states poll every 10s so
  // operators see retries, state transitions, and SLA warnings without manual refresh.
  const TERMINAL_STATUSES = new Set(['COMPLETED', 'REJECTED', 'CANCELLED', 'REVERSED', 'FAILED_TECHNICAL', 'BLOCKED']);
  const { data: instanceResponse, isLoading, error, isFetching } = useQuery({
    queryKey: ['workflow-instance', selectedInstanceId],
    queryFn: async () => {
      if (!selectedInstanceId) return null;
      const response = await apiClient.get(`/workflows/instances/${selectedInstanceId}`);
      return response.data;
    },
    enabled: !!selectedInstanceId,
    // Poll every 10 seconds while the instance is in an active state.
    // refetchInterval receives the cached data — if terminal, return false to stop polling.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || TERMINAL_STATUSES.has(status)) return false;
      return 10_000; // 10 seconds
    },
  });

  // Memoize the stations array so the metro tracker doesn't re-render unnecessarily
  const stations = useMemo(() => {
    if (!instanceResponse || !instanceResponse.workflow_nodes) return [];
    return mapInstanceToStations(instanceResponse, instanceResponse.workflow_nodes);
  }, [instanceResponse]);

  // Iteration 2 — when the operator switches to a different transaction, stop
  // viewing whatever station they had open and snap back to the live current node.
  useEffect(() => { setSelectedNodeId(null); setBandCDismissed(false); }, [selectedInstanceId]);

  // The station the operator is viewing: their explicit click, else the live node.
  const viewedNodeId: string | null =
    selectedNodeId ?? instanceResponse?.current_node_id ?? null;
  const viewedNode = instanceResponse?.workflow_nodes?.find(
    (n: any) => n.node_id === viewedNodeId
  );
  const viewedScreenTemplate: string | undefined = viewedNode?.screen_template;

  // Band D — fetch the viewed node's screen definition. Keyed on the template id
  // so React Query caches each step's screen; clicking back to a visited station
  // is instant. Disabled when the node has no screen_template (we fall back to a
  // generated context view so the band is never blank — see render below).
  const { data: viewedScreen } = useQuery({
    queryKey: ['node-screen', viewedScreenTemplate],
    queryFn: async () => {
      const res = await apiClient.get(`/screens/${viewedScreenTemplate}`);
      return res.data;
    },
    enabled: !!viewedScreenTemplate,
  });

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
  // Band E — reject now carries the operator's mandatory reason to the engine
  // (maker-checker audit). Reason text comes from the decision bar, not a hardcode.
  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!instanceResponse) throw new Error('Instance not found');
      const response = await apiClient.post(
        `/workflows/${instanceResponse.workflow_id}/resume/${selectedInstanceId}`,
        { decision: 'reject', reason }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workflow-instance', selectedInstanceId],
      });
      setActionError(null);
      setShowReject(false);
      setRejectReason('');
    },
    onError: (err) => {
      setActionError(`Reject failed: ${String(err)}`);
    },
  });

  // Band E — return a stuck step to its repair queue (uses the node's
  // repair_queue_name; only offered when on_failure = REPAIR_QUEUE).
  const repairMutation = useMutation({
    mutationFn: async () => {
      if (!instanceResponse) throw new Error('Instance not found');
      const response = await apiClient.post(
        `/workflows/${instanceResponse.workflow_id}/resume/${selectedInstanceId}`,
        { action: 'send_to_repair' }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-instance', selectedInstanceId] });
      setActionError(null);
    },
    onError: (err) => setActionError(`Return to repair failed: ${String(err)}`),
  });

  // Band E — manually skip a step the designer marked skippable.
  const skipMutation = useMutation({
    mutationFn: async () => {
      if (!instanceResponse) throw new Error('Instance not found');
      const response = await apiClient.post(
        `/workflows/${instanceResponse.workflow_id}/resume/${selectedInstanceId}`,
        { action: 'skip_step' }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-instance', selectedInstanceId] });
      setActionError(null);
    },
    onError: (err) => setActionError(`Skip failed: ${String(err)}`),
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

  // E3 commit 2/N — Reversal mutation (reverse a completed step via saga compensation)
  const reversalMutation = useMutation({
    mutationFn: async (payload: { reason: string; category: string }) => {
      if (!instanceResponse) throw new Error('Instance not found');
      const response = await apiClient.post(
        `/workflows/${instanceResponse.workflow_id}/resume/${selectedInstanceId}`,
        {
          action: 'reverse_step',
          node_id: reversalNodeId,
          reason: payload.reason,
          category: payload.category,
        }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workflow-instance', selectedInstanceId],
      });
      setReversalNodeId(null);
      setActionError(null);
    },
    onError: (err) => {
      setActionError(`Reversal failed: ${String(err)}`);
    },
  });

  // LOADING STATE
  // ── WORKLIST LANDING (iteration 7) ──────────────────────────────────────────
  // No instance selected → show the queue worklist. New-transaction and search
  // modals are reachable from here; both set selectedInstanceId on success, which
  // drops the operator into the record workspace below.
  if (!selectedInstanceId) {
    return (
      <div className="w-full flex flex-col gap-6 p-6">
        {showRunModal && (
          <RunTransactionModal
            onClose={() => setShowRunModal(false)}
            onInstanceCreated={(id) => { setSelectedInstanceId(id); setShowRunModal(false); }}
          />
        )}
        {showSearch && (
          <TransactionSearch
            onSelect={(id) => { setSelectedInstanceId(id); setShowSearch(false); }}
            onClose={() => setShowSearch(false)}
          />
        )}
        <Worklist
          onSelect={(id) => setSelectedInstanceId(id)}
          onNewTransaction={() => { setShowRunModal(true); setShowSearch(false); }}
          onOpenSearch={() => { setShowSearch(true); setShowRunModal(false); }}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full flex flex-col gap-6 p-6">
        <div className="rounded-2xl p-6 bg-white border border-slate-200 shadow-sm h-[500px] flex items-center justify-center">
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
        <div className="rounded-2xl p-6 bg-white border border-red-200 shadow-sm">
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
      {/* E2 commit 2/N — Recent instances quick-picker */}
      {showInstancePicker && (
        <div className="rounded-2xl p-6 bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-extrabold text-slate-800">Recent Transactions</h2>
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

      {/* E6 commit 2/N — Bulk operations panel */}
      {showRunModal && (
        <RunTransactionModal
          onClose={() => setShowRunModal(false)}
          onInstanceCreated={(id) => {
            setSelectedInstanceId(id);
            setShowRunModal(false);
          }}
        />
      )}
      {showBulkOps && (
        <BulkOperationsPanel onClose={() => setShowBulkOps(false)} />
      )}

      {/* E5 commit 2/N — Full transaction search panel */}
      {showSearch && (
        <TransactionSearch
          onSelect={(id) => {
            setSelectedInstanceId(id);
            setShowSearch(false);
          }}
          onClose={() => setShowSearch(false)}
        />
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* ── Band A (TXN_SCREEN_LAYOUT_LANGUAGE.md) — dark record header ──────
            Persistent record context that never scrolls away: action title,
            status badge, identity line, and a configurable facts row. Dark
            institutional band adopted from the StructuredFlow layout language. */}
        <div className="bg-[#1c2230] px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[15px] font-bold tracking-tight text-white">
                  {currentNode ? currentNode.node_title : 'Transaction'}
                </h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_BADGE[instanceResponse.status] ?? 'bg-slate-600/40 text-slate-200'}`}>
                  {instanceResponse.status}
                </span>
                {!TERMINAL_STATUSES.has(instanceResponse.status) && (
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className={`w-1.5 h-1.5 rounded-full ${isFetching ? 'bg-sky-400 animate-ping' : 'bg-emerald-400'}`} />
                    {isFetching ? 'refreshing' : 'live'}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono truncate">
                {instanceResponse.workflow_id} · {instanceResponse.instance_id}
              </div>
            </div>
            {/* Run + Recent + Search + Bulk — restyled for the dark band */}
            <div className="flex gap-2 flex-wrap justify-end shrink-0">
              {/* ← back to the queue worklist (iteration 7) */}
              <button
                onClick={() => setSelectedInstanceId(null)}
                className="px-3 py-1.5 rounded-lg border border-white/15 text-slate-200 text-[11px] font-semibold hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                ← Worklist
              </button>
              <button
                onClick={() => { setShowRunModal(true); setShowSearch(false); setShowBulkOps(false); setShowInstancePicker(false); }}
                className="px-3 py-1.5 rounded-lg border border-emerald-400/40 text-emerald-300 bg-emerald-400/10 text-[11px] font-bold hover:bg-emerald-400/20 transition-colors whitespace-nowrap"
              >
                ▶ Run
              </button>
              <button
                onClick={() => { setShowInstancePicker(!showInstancePicker); setShowSearch(false); setShowBulkOps(false); }}
                className="px-3 py-1.5 rounded-lg border border-white/15 text-slate-200 text-[11px] font-semibold hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                {showInstancePicker ? '✕' : '⊕ Recent'}
              </button>
              <button
                onClick={() => { setShowSearch(!showSearch); setShowInstancePicker(false); setShowBulkOps(false); }}
                className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${showSearch ? 'bg-sky-500 text-white border-sky-500' : 'border-sky-400/40 text-sky-300 hover:bg-sky-400/10'}`}
              >
                {showSearch ? '✕ Close' : '🔍 Search ⌘K'}
              </button>
              <button
                onClick={() => { setShowBulkOps(!showBulkOps); setShowSearch(false); setShowInstancePicker(false); }}
                className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap ${showBulkOps ? 'bg-slate-200 text-slate-900 border-slate-200' : 'border-white/15 text-slate-200 hover:bg-white/10'}`}
              >
                {showBulkOps ? '✕ Close' : '⚡ Bulk'}
              </button>
            </div>
          </div>

          {/* Facts row — §4 configurable context (interim resolver). Always ends
              with Product so the operator sees the package they're working in. */}
          <div className="flex flex-wrap gap-x-7 gap-y-2 mt-3 pt-3 border-t border-white/10">
            {resolveFacts(instanceResponse.current_context).map(f => (
              <div key={f.label}>
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{f.label}</div>
                <div className="text-[12px] font-semibold text-white">{f.value}</div>
              </div>
            ))}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Product</div>
              <div className="text-[12px] font-semibold text-white">{activeProductContext ?? '—'}</div>
            </div>
          </div>
        </div>

        {/* ── Band C — contextual instruction banner (dismissible) ─────────── */}
        {!bandCDismissed && instanceResponse.status === 'PAUSED' && (
          <div className="bg-indigo-50 border-b border-indigo-100 text-indigo-800 text-[11px] px-6 py-2 flex items-center justify-between gap-2">
            <span>ℹ Review the captured instruction below, then approve or reject. Click any station to replay its screen.</span>
            <button onClick={() => setBandCDismissed(true)} className="text-indigo-400 hover:text-indigo-700 font-bold">✕</button>
          </div>
        )}

        {/* Body — all bands B/D/E live inside the padded content region. */}
        <div className="p-6">

        {/* Metro tracker — E1 commit 4/N live data. Renders the instance's workflow
            with stations color-coded by their lifecycle state. */}
        <div className="mt-6">
          <MetroTracker
            stations={stations}
            onStationClick={setSelectedNodeId}
            activeStationId={viewedNodeId ?? undefined}
          />
        </div>

        {/* ── Band D (TXN_SCREEN_LAYOUT_LANGUAGE.md) — Step workspace ──────────
            The screen of whichever station the operator clicked. Read-only unless
            it is the live current node AND the instance is PAUSED awaiting action
            (that single case is the editable approval; everything else is
            playback). When the node has no screen_template we show the raw
            context so the band is never blank. */}
        {viewedNode && (
          <div className="mt-6 p-4 rounded-xl border border-slate-200/70 bg-white/60">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Step {viewedNode.sequence_number} · {viewedNode.node_title}
                {viewedNodeId !== instanceResponse.current_node_id && (
                  <span className="ml-2 font-semibold text-indigo-500 normal-case tracking-normal">· playback (read-only)</span>
                )}
              </div>
              {selectedNodeId && (
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1"
                >
                  ↩ Back to current step
                </button>
              )}
            </div>

            {viewedScreenTemplate && viewedScreen ? (
              <RuntimeScreenRenderer
                screenName={viewedScreen.screen_name}
                definition={viewedScreen.definition}
                initialValues={instanceResponse.current_context}
                readOnly={
                  !(viewedNodeId === instanceResponse.current_node_id &&
                    instanceResponse.status === 'PAUSED')
                }
                onSubmit={(_values, action) => {
                  if (action === 'CANCEL_SESSION') { setShowReject(true); }
                  else { approveMutation.mutate(); }
                }}
              />
            ) : viewedScreenTemplate ? (
              <div className="text-[12px] text-slate-400 py-4 text-center">Loading step screen…</div>
            ) : (
              // No screen bound to this node — generated context fallback (band D rule).
              <div className="divide-y divide-slate-100">
                {Object.entries(instanceResponse.current_context ?? {}).length === 0 ? (
                  <p className="text-[12px] text-slate-400 py-4 text-center">
                    No screen configured for this step, and no context to display.
                  </p>
                ) : (
                  Object.entries(instanceResponse.current_context).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between py-2 gap-4 text-[11px]">
                      <span className="font-mono font-semibold text-indigo-600 break-all">{k}</span>
                      <span className="text-slate-700 text-right break-all">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

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

            {/* ── Band E (TXN_SCREEN_LAYOUT_LANGUAGE.md) — maker-checker decision bar ──
                A real decision surface, not a lone button: Approve / Reject (with a
                MANDATORY typed reason) / Return-for-repair / Retry / Skip / Cancel,
                each gated on the node's own failure-handling config. */}
            <div className="mt-4 pt-3 border-t border-slate-200/50">
              {/* Reject reason field — revealed by "Reject"; reject cannot fire until
                  a reason is typed (maker-checker audit requirement). */}
              {showReject && instanceResponse.status === 'PAUSED' && (
                <div className="mb-3 flex items-center gap-2">
                  <input
                    autoFocus
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection (required)"
                    className="flex-1 px-3 py-1.5 text-[11px] border border-red-200 rounded-lg focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100"
                  />
                  <button
                    onClick={() => rejectMutation.mutate(rejectReason.trim())}
                    disabled={!rejectReason.trim() || rejectMutation.isPending}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {rejectMutation.isPending ? 'Rejecting…' : 'Confirm reject'}
                  </button>
                  <button
                    onClick={() => { setShowReject(false); setRejectReason(''); }}
                    className="px-2 py-1.5 text-[11px] text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                {/* Approve / Reject — PAUSED human-approval state only */}
                {instanceResponse.status === 'PAUSED' && (
                  <>
                    <button
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending || showReject}
                      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 border border-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <span>✓</span>
                      {approveMutation.isPending ? 'Approving…' : 'Approve'}
                    </button>
                    {!showReject && (
                      <button
                        onClick={() => setShowReject(true)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold hover:bg-red-100 transition-colors"
                      >
                        <span>✕</span> Reject
                      </button>
                    )}
                  </>
                )}

                {/* Retry — RETRYING / FAILED_TECHNICAL */}
                {(instanceResponse.status === 'RETRYING' ||
                  instanceResponse.status === 'FAILED_TECHNICAL') && (
                    <button
                      onClick={() => retryMutation.mutate()}
                      disabled={retryMutation.isPending}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    >
                      <span>↻</span>
                      {retryMutation.isPending ? 'Retrying…' : 'Retry now'}
                    </button>
                  )}

                {/* Return for repair — only when the node routes failures to a repair queue */}
                {currentNode.on_failure === 'REPAIR_QUEUE' &&
                  ['RETRYING', 'FAILED_TECHNICAL', 'AWAITING_REPAIR'].includes(instanceResponse.status) && (
                    <button
                      onClick={() => repairMutation.mutate()}
                      disabled={repairMutation.isPending}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-[11px] font-semibold hover:bg-orange-100 disabled:opacity-50 transition-colors"
                    >
                      <span>⤺</span>
                      {repairMutation.isPending ? 'Sending…' : `Return to repair${currentNode.repair_queue_name ? ` · ${currentNode.repair_queue_name}` : ''}`}
                    </button>
                  )}

                {/* Skip — only when the designer marked this step skippable */}
                {currentNode.skippable && instanceResponse.status !== 'COMPLETED' && (
                  <button
                    onClick={() => skipMutation.mutate()}
                    disabled={skipMutation.isPending}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-semibold hover:bg-slate-100 disabled:opacity-50 transition-colors"
                  >
                    <span>⏭</span>
                    {skipMutation.isPending ? 'Skipping…' : 'Skip step'}
                  </button>
                )}

                {/* Cancel transaction — when the node permits it */}
                {currentNode.cancellable && (
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-[11px] font-semibold hover:bg-slate-100 disabled:opacity-50 transition-colors ml-auto"
                  >
                    <span>×</span>
                    {cancelMutation.isPending ? 'Cancelling…' : 'Cancel transaction'}
                  </button>
                )}
              </div>
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

        {/* E3 commit 2/N — Reversal Drawer (saga compensation) */}
        {reversalNodeId && (
          <ReversalDrawer
            nodeId={reversalNodeId}
            nodeTitle={
              instanceResponse.workflow_nodes?.find((n: any) => n.node_id === reversalNodeId)
                ?.node_title || 'Unknown'
            }
            reversibility={
              instanceResponse.workflow_nodes?.find((n: any) => n.node_id === reversalNodeId)
                ?.reversibility || 'REVERSIBLE'
            }
            reversalRecipe={
              instanceResponse.workflow_nodes?.find((n: any) => n.node_id === reversalNodeId)
                ?.reversal_recipe
            }
            onSubmit={(payload) => reversalMutation.mutate(payload)}
            onClose={() => setReversalNodeId(null)}
            isSubmitting={reversalMutation.isPending}
          />
        )}

        </div>
      </div>
    </div>
  );
};
