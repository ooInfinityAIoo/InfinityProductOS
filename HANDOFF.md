# Handoff

## ⏭ NEXT SESSION — revisit Master Data concepts (PM flagged, 2026-06-25)
The PM wants to step back and revisit master-data concepts before building more.
Open question raised: **"Master Data on Launch App vs Master Data before Launch App — why different?"**
- HONEST ANSWER: it's an inconsistency, not a design. Two navigations:
  - BEFORE launch = designer header "Master Data" dropdown (`src/layouts/MasterHeaderNav.tsx`)
    — HARDCODED legacy menu; its "Reference Tables" (Currency & FX Tables, Counterparty
    Directory, Holiday & Calendar) are fixed placeholder labels, NOT the real masters.
  - ON launch = package runtime "🗂 Masters" sidebar (`PackageSidebarNav` →
    `MasterMaintenance`) — DATA-DRIVEN, lists the actual 35 masters.
- The masters we built ONLY surface on the runtime side. Reconcile next session.
- Possible intentional split to decide on: BEFORE launch = DEFINE a master (fields/
  structure, in Screen/Master Designer); ON launch = MAINTAIN records (data entry).
  Today neither side does this cleanly.
- Concepts to revisit together: the define-vs-maintain split, whether the designer
  "Master Data" menu should be data-driven, master_ref/global-share/decision-table in
  the authoring UI, and where field specs for the 19 placeholder masters get entered.

### Where master work stands (Payment Hub = PKG-4D5B9DD9)
- 35 masters, all LIVE, all bound to the package "Masters" business domain (navigable
  via Launch App → Masters). 16 configured with real fields, 19 placeholders.
- GUI (option B) DONE: generic Master Maintenance grid (list/add/edit/delete, form
  generated from the master's fields), decision-table framing, field→master value-list
  linking (9 links), global-share toggle. Reproducible via seed_masters_payments.py +
  configure_payments_masters.py.
- Two-tier routing modelled: Correspondent Bank Routing (execution: currency/default
  correspondent/BIC/Nostro-Vostro/settlement acct) + Intelligent Routing Rules
  (decision table: conditions → MOP + next hop).
- Naming convention: use the PM's bank-standard names (no ISO-element renames). Scripts
  are scaffolding (option A) until the master model settles, then move authoring to UI.

## Active effort (2026-06-24, later) — Extended Field Registry
Turning the ISO-only field registry into a unified, master-anchored, package-scoped
registry. **Contract: `docs/FIELD_REGISTRY_REQUIREMENTS.md`** (read first). Six-level
chain: Package(L1)→Product(L2)→Sub-Product(L3)→Workflow ID(L4)→Workflow Step ID(L5)→
Workflow SubStep ID(L6); Master is a separate mandatory anchor; no orphan fields.

Progress (phased, §13 of the spec):
- **Phase 1 DONE** (`f315ef8`) — additive schema: master_ref, iso_field_ref,
  application_package_id, applies_to_all_products, subproduct_id, workflow_id,
  workflow_step_id, workflow_substep_id on ISOFieldDefinition + `field_product_map`
  table. Migration `e8_002` (idempotent). No behaviour change.
- **Phase 2 DONE** (`654ac10`) — backfill field_source NULL→ISO_20022 (`e8_003`).
  Now {ISO_20022: 3013, BANK_CUSTOM: n}.
- **Phase 3-safe DONE** (`a581845`) — create enforces Package+Master+Product (clear
  400s), CUST_ prefix for BANK_CUSTOM (D7), AUTO_APPROVE_FIELDS flag (D5, default on),
  iso_business_name optional w/ client-name fallback, product_ids→field_product_map.
- **Phase 4 DONE** (`54f5216`) — search `selectable_only` gate (interim: master OR
  grandfathered ISO_20022) + `field_source` filter; IsoFieldSelector passes the gate
  and renders Custom/Calc/Derived/Config/Reg chips.
- **Phase 5 DONE** (`seed_masters.py`) — 10 canonical masters seeded as LIVE MAINTENANCE
  screens (Currency/Country/Customer/Bank + Amount/Date/Reference + Configuration/
  Calculation Output/Derived Field), scoped to Treasury System, with sample Currency/
  Country records. Verified: a field anchored to Currency Master is selectable.
- **Phase 7 API DONE** (`GET /fields/registry/{field_id}/where-used`) — lineage scan
  across rules / calculations / screens / workflow steps / mappers / notifications /
  reports. Best-effort match on technical_sys_name + iso_business_name (excludes
  generic client_business_name). Verified: field bound in a screen → where-used finds it.
  Phase 7 panel DONE — "Lineage" button per row opens a where-used modal in the Field Registry studio.
- **Phase 6 (riskiest, NEXT to groom):** rules-based auto-categorisation of the 3,013
  ISO fields (Package+Master+Product) + exception report. Groom the rule set before
  running. This is the step that tightens the selectability gate from "grandfather
  ISO" to "master required for all".
- **DEFERRED destructive op:** make `iso_business_name` truly nullable — needs a SQLite
  table rebuild of the 3,014-row registry; do with an explicit checkpoint + user nod.
- Test data left in local DB: a few CUST_* fields + an FX Spot product/workflows under
  Treasury System (PKG-B3CFAF78). Harmless.

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
