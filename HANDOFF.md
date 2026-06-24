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
- **Iteration 5** — Manual capture screen rendered from the START-node definition
  (retire the hardcoded `RunTransactionModal.tsx` demo harness).
- **Iteration 6** — Worklist / queue landing ("My Deals" equivalent) as the entry
  point (currently the screen opens straight into one instance, `TWS-PAUSED-01`).
- **Iteration 7** — Institutional theme pass across the side panels
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
