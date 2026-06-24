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
- **Iteration 8** — Institutional theme pass across the side panels
  (`StepIssuePanel`, `TransactionSearch`, `BulkOperationsPanel`, `ReversalDrawer`)
  and the shared `RuntimeScreenRenderer` (still light-glass).
- **Open decision (spec §4)** — facts-row config source: recommend deriving from
  the START node's screen definition rather than a new `WorkflowConfiguration`
  column. Not yet implemented; interim resolver is in `TransactionWorkflowScreen.tsx`.
- **Backend resume semantics — NOW WIRED (iteration 5, commit below).** The
  resume endpoint `POST /workflows/{id}/resume/{instance_id}` now branches on the
  decision/action contract (schema `WorkflowResumeRequest` extended with
  `decision/action/reason/node_id/category`):
  - `decision=reject` → REJECTED terminal, **reason is mandatory**, records
    `cancelled_by/reason_code/message` + trace (verified end-to-end via TestClient).
  - `action=cancel_transaction` → CANCELLED with reason.
  - `action=send_to_repair` → AWAITING_REPAIR + `repair_queue_assigned` from the node.
  - `action=skip_step` → advances to the next node by sequence (linear approx;
    full edge-aware skip is a follow-up) and resumes; completes if last.
  - `action=retry` → re-executes (only valid from RETRYING/FAILED/AWAITING_REPAIR).
  - `decision=approve` / bare resume → re-executes from the current node (PAUSED only).
  - `action=reverse_step` → explicit 400 (saga reversal still NOT implemented here).
  Terminal instances (COMPLETED/REJECTED/CANCELLED/REVERSED) are rejected with 400.
- **Still open:** saga reversal (`reverse_step`) in resume; edge-aware skip.
- Priority-3 (older): mobile-responsive metro tracker (SVG viewBox + adaptive radii).
