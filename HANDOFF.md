# Handoff

## Current Context
**InfinityProductOS** (Banking Operations Platform), strict "Logic as Data" architecture.
Active effort: **Transaction Workflow Screen rework** — adopting an institutional
layout language (synthesised from StructuredFlow / nCino / ANZ Transactive) so the
screen stops looking like a demo and reads like a real bank ops surface.

The contract for this rework lives in **`docs/TXN_SCREEN_LAYOUT_LANGUAGE.md`** —
read it first. It defines a 5-band frame (A header · B step spine · C instruction
banner · D step workspace · E decision bar), maps every band to a real column in
`models.py`, and lists the iteration roadmap. The rule throughout: adopt the
layout *language*, render content from definitions, never hardcode per product.

## Completed iterations (all committed + pushed to main, each green)
1. `0075fb1` — docs: layout language spec (the contract).
2. `d77486d` — Band B+D: MetroTracker promoted to a clickable spine; clicking any
   station renders that node's screen via `RuntimeScreenRenderer` (read-only =
   playback; editable only for the live PAUSED approval). Context fallback when no
   screen bound.
3. `2386f1e` — Band A+C: dark institutional record header + configurable facts row
   (interim ISO-path resolver, see spec §4) + dismissible instruction banner.
   Removed the developer changelog banner that was rendered into production UI.
4. `01e899f` — Band E: real maker-checker decision bar — mandatory typed reject
   reason, Return-to-repair (gated on `node.on_failure=REPAIR_QUEUE`), Skip
   (gated on `node.skippable`), Approve primary, Cancel.

Verification each step: `tsc --noEmit` passes; app mounts clean in the vite
preview (no error overlay). Full click-through interaction not yet exercised
end-to-end (needs backend up + a seeded PAUSED instance with screen_templates).

## Next steps / open items (roadmap §6 of the spec)
- **Iteration 6 DONE** (commit below) — Manual capture is now definition-driven.
  `RunTransactionModal` renders the workflow's START-node screen via
  `RuntimeScreenRenderer` instead of hardcoded fields; on submit it expands the
  screen's flat ISO-path field values into the nested pacs.008 the engine expects
  (`expandFlat`/`setByPath`) and layers engine defaults under them. Legacy fixed
  fields remain as a fallback for workflows whose start node has no screen bound.
  Migration `e8_001_bind_swift_entry_screen.py` binds SCR-8AE80048 (10-field SWIFT
  Wire Payment Entry) to WF-ECC2B272's start node (idempotent; already applied to
  local DB). Verified via TestClient: definition-driven payload runs to PAUSED.
  **Follow-up:** patch `seed_golden_path.py` to set this binding so fresh seeds
  include it (today only the migration does).
- **Iteration 7 DONE** (commit below) — Worklist / queue landing is now the entry
  point. New `Worklist.tsx` lists live instances with queue tabs (Pending approval
  / Repair / Rejected / Completed / All) + counts, amount pulled from context,
  click-to-open. `TransactionWorkflowScreen` now defaults to `selectedInstanceId =
  null` → renders the worklist; opening a row drops into the record workspace;
  a "← Worklist" button returns. Verified live (backend + vite): worklist showed
  26 pending rows with formatted amounts; row click opened the record workspace
  (metro tracker 11 stations, facts, decision bar). Amount facts now group-formatted.
- **Iteration 8 DONE** (commit below) — Institutional theme pass. Removed all
  remaining glassmorphism (`glass-card` / `bg-white/85 backdrop-blur-md` /
  `shadow-glass`) from the transaction-screen surfaces — `BulkOperationsPanel`,
  `TransactionSearch`, `ReversionRecoveryQueue`, and the three early-return/picker
  panels in `TransactionWorkflowScreen` — replacing them with clean institutional
  panels (`bg-white border border-slate-200 shadow-sm`). No glass remains in
  `src/features/transaction-screen/` (only the modal's intentional `bg-black/40`
  scrim). tsc clean; app mounts clean in vite. `StepIssuePanel`/`ReversalDrawer`
  had no glass; the shared `RuntimeScreenRenderer` was already glass-free.
- **Spec §4 facts-row — DONE.** The header facts row now derives from the START
  node's screen definition (`buildFactsFromScreen` in `TransactionWorkflowScreen.tsx`),
  falling back to the interim ISO-path resolver only when no start screen is bound.
  No new `WorkflowConfiguration` column was needed. **Bug also fixed:** the
  `/instances/{id}` response was omitting `workflow_nodes[].screen_template`, which
  had silently broken both this facts row AND iteration-2 clickable-station
  playback (every station fell back to raw context). Now serialized.
- **Backend resume semantics — NOW WIRED (iteration 5, commit below).** The
  resume endpoint `POST /workflows/{id}/resume/{instance_id}` now branches on the
  decision/action contract (schema `WorkflowResumeRequest` extended with
  `decision/action/reason/node_id/category`):
  - `decision=reject` → REJECTED terminal, **reason is mandatory**, records
    `cancelled_by/reason_code/message` + trace (verified end-to-end via TestClient).
  - `action=cancel_transaction` → CANCELLED with reason.
  - `action=send_to_repair` → AWAITING_REPAIR + `repair_queue_assigned` from the node.
  - `action=skip_step` → **edge-aware**: follows the single outgoing `WorkflowEdge`;
    falls back to sequence order only for branches/no-edge; completes if last.
  - `action=retry` → re-executes (only valid from RETRYING/FAILED/AWAITING_REPAIR).
  - `decision=approve` / bare resume → re-executes from the current node (PAUSED only).
  - `action=reverse_step` → **implemented**: validates target node + reversibility
    (IRREVERSIBLE → 400), transitions to REVERSED with an idempotent
    `reversal_request_id`, records audit + traces the node's `reversal_recipe`
    compensations. Exempt from the terminal gate so a COMPLETED txn can be reversed.
  Terminal instances are otherwise rejected with 400.
- **Still open (engine work):** actually DISPATCHING reversal compensations
  (db/api/event) declared in `reversal_recipe` — currently recorded in the trace
  only; the REVERSED state transition + idempotency key are committed.
- Priority-3 (older): mobile-responsive metro tracker (SVG viewBox + adaptive radii).
