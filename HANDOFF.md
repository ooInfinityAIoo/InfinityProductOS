# Session Handoff → Gemini

**From:** Claude · **Date:** 2026-06-22 · **Branch:** `main` (pushed, in sync with origin) · **Latest commit:** `8817508`

---

## What this session did — End-to-end execution proof + Wiring Audit

Goal: prove the entire platform works as one system (GUI + backend), not just individual studios in isolation. 4 commits landed.

### Commits this session

| Commit | What |
|---|---|
| `bffa3e9` | **API name fallback + COMPLETED instance persistence** — dispatcher now resolves APIs by name if id lookup misses; executor persists a `WorkflowExecutionInstance` for COMPLETED workflows (was missing) and returns `instance_id`; resume path injects `__resume_instance_id__` to avoid creating duplicate records |
| `7bbe1a2` | **▶ Run Transaction modal** (`RunTransactionModal.tsx`) — green "▶ Run" button in TWS header opens a modal with workflow picker, ISO 20022 fields (amount, currency, beneficiary BIC/name, FX rate, value date), executes via `POST /workflows/{id}/execute`, shows colour-coded trace, "View on Metro Tracker →" navigates to the new instance |
| `8817508` | **🔗 Wiring Audit panel** (`WiringAuditPanel.tsx` + `GET /workflows/wiring-audit` + `PATCH /workflows/wiring-audit/apply`) — scans all workflow nodes for steps with an action type but no target; found 137 unwired steps across 24 RTP/FedNow workflows; inline dropdowns per step, "Apply Wiring" persists all at once |
| `59182e8` | Test seed: 9 lifecycle-state TWS instances + default instance fix |

### Live-tested end-to-end

Executed `WF-ECC2B272` ($592,500 USD → BARCGB22) from the UI:
- NODE-01 MT103 Ingest → COMPLETED ✓
- NODE-02 AML rule fired (high-value flag) → PAUSED ⏸ for operator approval
- Instance `WFI-0354D159310E` loaded live on metro tracker with polling active
- Action buttons (Approve / Reject / Cancel) ready

---

## What's next (E7 — priority order)

### 1. Wire the 137 unwired steps (designer task, no code)
Open Workflow Designer → click "🔗 Wiring Audit" → assign rule/formula/API targets to each step → "Apply Wiring". This unlocks 24 RTP/FedNow workflows for real execution. **No code needed — the UI does it.**

### 2. Reversal Recovery Queue endpoint (backend, ~1 hour)
The frontend component `ReversionRecoveryQueue.tsx` exists but `GET /workflows/reversal-recovery-queue` returns 404. One router function needed. Returns all instances where `reversal_request_id IS NOT NULL AND status != 'REVERSED'`.

### 3. Entitlements enforcement (bigger feature)
Operators see only their team's transactions. Needs: `assigned_team` column on `WorkflowExecutionInstance`, middleware to filter by `X-User-Role`, UI filter chips in the TWS search.

### 4. Event → downstream fan-out (architecture)
Events broadcast on execution but Insights / Behavioral / Reconciliation don't consume them yet. Full event-driven wiring.

### 5. Mobile-responsive metro tracker
Current SVG is desktop-width. Needs responsive `viewBox` + smaller station radii on narrow screens.

---

## How to verify the full chain

```bash
uvicorn main:app --reload --port 8000   # backend
npm run dev                              # frontend (port 5173)
python3 seed_tws_test_data.py           # 9 test instances (idempotent)
```

Navigate to Transaction Workflow Screen → click **▶ Run** → use defaults ($592,500 USD) → Execute Transaction → View on Metro Tracker → Approve at NODE-02 → watch nodes 3–5 complete.

Open Workflow Designer → **🔗 Wiring Audit** → 137 steps shown → wire them → Apply.

---

## What this session did — TWS E4–E6 completion + live testing

Completed the Transaction Workflow Screen (E4 commit 2/N through E6 commit 3/N), then verified
the full feature end-to-end against real seed data. Latest commit: `59182e8`.

### This session's commits (in order)

1. **`d4231b4`** — E4 commit 2/N: Parallel branch visualization in MetroTracker SVG (FORK/JOIN dashed tracks)
2. **`ec253d1`** — E4 commit 3/N: "Reversal" tab in NodePropertiesDrawer (Workflow Designer)
3. **`4e6e892`** — E5 commit 1/N: `GET /workflows/instances/search` backend endpoint (multi-field, paginated)
4. **`f2aa004`** — E5 commit 2/N: `TransactionSearch.tsx` frontend component
5. **`493df5e`** — E6 commit 1/N: SLA badges (amber/red corner dot) + auto-refresh every 10s
6. **`5da29b7`** — E6 commit 2/N: `BulkOperationsPanel.tsx` (select + approve/retry/cancel N at once)
7. **`40ace95`** — E6 commit 3/N: ⌘K search shortcut + Esc closes all panels
8. **`59182e8`** — Test QA: `seed_tws_test_data.py` (9 lifecycle-state instances) + default instance fix

### Verified live in browser
- TWS-PAUSED-01 loads as default; 5-node metro tracker renders correctly
- Live pulse dot active; 10s polling confirmed
- Action buttons (Approve/Reject/Cancel) shown at paused node
- All 3 header buttons render: ⊕ Recent, 🔍 Search ⌘K, ⚡ Bulk

---

## What's next (E7 — future work)

- **Entitlements enforcement** — operators see only their team's transactions (needs backend RBAC column + middleware)
- **Reversal Recovery Queue endpoint** — `GET /workflows/reversal-recovery-queue` returns 404; frontend component exists but has no data
- **SLA breach alerting** — push/Slack notification when SLA breached (needs notification engine wiring)
- **Mobile-responsive metro tracker** — current SVG is desktop-width only
- **Wiring UI for unwired workflow nodes** — ~35 RTP/FedNow templates have `target_token: null`; a designer UI to link nodes → rules/calcs would close that gap

---

## How to run / test

```bash
# Backend
uvicorn main:app --reload --port 8000

# Frontend
npm run dev

# Seed test data (idempotent, safe to re-run)
python3 seed_tws_test_data.py

# Type check
tsc --noEmit
```

Navigate to Transaction Workflow Screen. Use ⊕ Recent or 🔍 Search to load any of these:

| Instance ID | Status |
|---|---|
| TWS-PAUSED-01 | PAUSED (default) |
| TWS-RUNNING-01 | RUNNING |
| TWS-RETRYING-01 | RETRYING |
| TWS-REPAIR-01 | AWAITING_REPAIR |
| TWS-REJECTED-01 | REJECTED |
| TWS-FAILED-01 | FAILED_TECHNICAL |
| TWS-CANCELLED-01 | CANCELLED (OFAC_HIT) |
| TWS-COMPLETED-01 | COMPLETED |
| TWS-REVERSED-01 | REVERSED |

---

## Previous session — UX audit + remediation

A full two-track audit of the studios (functional + UX/layout) plus making the engines
run **in tandem** at runtime. 9 commits, all on `origin/main` (latest `3a1b7b2`).

### Landed & verified
1. **Per-studio error boundary** (`d541ce6`) — `src/components/StudioErrorBoundary.tsx`, wired
   in `App.tsx` keyed by `activeModule`. A crash in one studio now shows a recoverable card
   instead of blanking the whole app.
2. **Workflow executor crash fixes** (`8c7ca68`) — `uuid` / `BusinessRuleEngine` local-import
   shadowing made every execution 500.
3. **Transaction shell trace + edge-condition guard** (`884b9eb`).
4. **Report Designer blank-panel fix** (`13a126b`) — selecting a report rendered nothing; added
   the read-only detail view + Edit path.
5. **`useResolvedPackageId` hook + `metaLookup` helper** (`393b6f2`) — de-duplicated the
   package-name→id resolution across 11 studios (root cause of the "empty studio" bug class).
   `src/hooks/useResolvedPackageId.ts`, `src/utils/metaLookup.ts`.
6. **Business Rule Engine studio-shape adapter** (`4eb36ed`, Finding D) — engine now evaluates
   studio-authored rules `{field, operator, value}` / `{type: FLAG_FOR_REVIEW/EMIT_EVENT}`.
7. **Workflow executor step adapter** (`3a1b7b2`, Finding C) — golden path `WF-ECC2B272` now
   fires rules + calc + events + approval **in tandem**. See `INTEGRATION_AUDIT_FINDINGS.md`.
8. **Settlement-node savepoint** (`436e771`, Finding C2) — SETTLE / POST_LEDGER nodes now use
   `db.begin_nested()` (SAVEPOINT) when a transaction is already active, else `db.begin()`. The
   golden path now runs all the way to `STATUS=COMPLETED` with the double-entry guardrail
   passing (Debits=Credits=592500). New `test_active_transaction_uses_savepoint`.
9. **Responsive header + filter bar** (Finding A2) — `MasterHeaderNav.tsx` and `CockpitLockBanner.tsx`
   now `flex-wrap` instead of clipping `EXIT PACKAGE` / dropdowns below ~1024px. Verified at
   768px (no horizontal overflow) and 1440px (unchanged).
10. **Sanctions screening capability** (Finding C1) — new `models.SanctionsList`,
    `services/sanctions_service.py`, `seed_sanctions_lists.py`. Engine now evaluates
    `IN_SANCTION_LIST` / `NOT_IN_SANCTION_LIST` against named DB-backed lists, honors
    `logical_operator: "OR"`, and fails CLOSED on unknown lists. OFAC rule semantics corrected
    (NOT_IN_SANCTION_LIST AND → IN_SANCTION_LIST OR). Verified end-to-end on the golden path:
    sanctioned beneficiary trips a recorded BLOCK + `EVT_OFAC_HIT_DETECTED`; clean payment is
    unaffected. 6 new sanctions tests.
11. **Executor BLOCK halt + FX rule fix** (Finding C3) — executor now terminates with
    `status=REJECTED` (persisting a REJECTED `WorkflowExecutionInstance`) when the rule engine
    records a BLOCK_PAYMENT/REJECT_STEP action, instead of walking past it. The added rigor
    surfaced the FX-stale rule's inverted authoring (`LESS_THAN 15` → `GREATER_THAN_OR_EQUAL_TO 15`)
    — also fixed in seed and DB. Now: sanctioned + fresh FX → REJECTED at OFAC node; clean +
    fresh FX → **COMPLETED** (true in-tandem happy path); clean + stale FX → REJECTED at FX node.
    2 new tests; 18/18 backend tests pass.

Tests: `test_business_rule_engine_adapter.py`, `test_calculation_engine_params.py`,
`test_workflow_executor_invariants.py`, `test_sanctions_screening.py`,
`test_workflow_executor_block_halt.py` — 18/18 green. Frontend `tsc --noEmit` clean.

---

## 🎉 Transaction Workflow Screen — E0 through E6 COMPLETE

All 7 phases of the Transaction Workflow Screen are shipped and on `origin/main`.
Latest commit: `40ace95`. 25/25 backend tests pass. Frontend `tsc --noEmit` clean.

### E6 — SLA badges, bulk ops, keyboard shortcuts — ✅ COMPLETE

- ✅ **Commit 1/N (`493df5e`)** — SLA badges on MetroTracker (amber corner dot >75% elapsed, red = breached). `TrackerStation` gets `sla_warning` + `sla_breached`. Computed from `node.slaDuration` vs `instance.created_at` in `mapInstanceToStations`. Auto-refresh: `refetchInterval` polls every 10s for active instances, stops for terminal states. Live/refreshing pulse dot in instance header.
- ✅ **Commit 2/N (`5da29b7`)** — `BulkOperationsPanel.tsx`: select-all or individual checkbox on PAUSED/RETRYING/AWAITING_REPAIR/FAILED instances, choose Approve/Retry/Cancel, run sequentially with per-row progress. "Bulk" button in TWS header.
- ✅ **Commit 3/N (`40ace95`)** — ⌘K / Ctrl+K opens search from anywhere. Esc closes all panels. Search button shows ⌘K hint.

### Complete operator capability matrix (E0–E6)

| Capability | Phase | Status |
|---|---|---|
| View metro tracker (12 lifecycle states) | E1 | ✅ |
| Live sub-text (retry counts, cancel reasons, queue names) | E1 | ✅ |
| Navigate — recent quick-picker | E2 | ✅ |
| Act — approve / reject / cancel | E2 | ✅ |
| Retry failed steps | E2 | ✅ |
| Diagnose — step issue panel with error + retry history | E2 | ✅ |
| Reverse — saga compensation + 4-eye approval | E3 | ✅ |
| Parallel branch visualization (FORK/JOIN dashed tracks) | E4 | ✅ |
| Reversal recipe authoring in Workflow Designer | E4 | ✅ |
| Search millions of transactions (multi-field) | E5 | ✅ |
| SLA breach badges (amber/red corner dot on stations) | E6 | ✅ |
| Auto-refresh every 10s for active instances | E6 | ✅ |
| Bulk approve / retry / cancel N transactions | E6 | ✅ |
| ⌘K search shortcut, Esc close | E6 | ✅ |

### What remains (E7 — future, not committed)

- Entitlements enforcement (operators see only their team's transactions — needs backend RBAC column + middleware)
- Reversal Recovery Queue backend endpoint (`GET /workflows/reversal-recovery-queue` — the frontend component exists in E4 commit 1/N but the endpoint returns 404)
- SLA breach alerting (push notification / Slack when SLA breached — needs notification engine wiring)
- Mobile-responsive metro tracker (current SVG is desktop-width)

---

## Previous session — Transaction Workflow Screen E4+E5 COMPLETE (E6 remaining)

### E4 — parallel branch visualization + reversal authoring — ✅ COMPLETE

- ✅ **Commit 1/N (`5d77770`)** — ReversionRecoveryQueue dashboard (failed reversals ops view).
- ✅ **Commit 2/N (`d4231b4`)** — Parallel branch visualization in MetroTracker SVG. FORK/JOIN stations + secondary dashed tracks below the main line for nodes with `parallel_group` field. Backward-compatible.
- ✅ **Commit 3/N (`ec253d1`)** — 6th "Reversal" tab in NodePropertiesDrawer (Workflow Designer). Exposes per-node: reversibility, on_failure, cancellable, skippable, reversal_recipe (db/api/event). Wired into `handleSaveAll`.

### E5 — transaction search — ✅ COMPLETE

- ✅ **Commit 1/N (`4e6e892`)** — `GET /workflows/instances/search` backend endpoint. Multi-field: instance_id prefix, master_transaction_id prefix, multi-status IN, workflow_id, cancelled_by, repair_queue, ISO date range. Paginated with total_count + has_more.
- ✅ **Commit 2/N (`f2aa004`)** — `TransactionSearch.tsx` frontend component. Status filter chips (all 12 lifecycle states), free-text bar, advanced drawer (date range, cancelled_by, repair queue, workflow ID), paginated results (20/page). "Search" button in TransactionWorkflowScreen header opens panel.

### What operators can now do (E1–E5 full stack)

✅ **View** — metro tracker with all 12 lifecycle states, live sub-text (retry counts, cancel reasons, queue names)
✅ **Navigate** — Recent quick-picker + full transaction search across millions of records
✅ **Act** — approve, reject, cancel from any state
✅ **Retry** — manual retry on RETRYING/FAILED states
✅ **Diagnose** — error code + message + retry history on step-issue panel
✅ **Reverse** — rollback completed steps with saga compensation (E3)
✅ **Author reversal** — designers configure per-node reversibility + recipe in Workflow Designer (E4)
✅ **See parallel steps** — FORK/JOIN branches shown as secondary dashed tracks on metro tracker (E4)
✅ **Search** — find any transaction by ID, status, date range, cancelled_by, repair queue (E5)

### E6 — remaining (next session)

- SLA badge overlay on metro tracker stations (yellow/red when SLA bound exceeded)
- Entitlements enforcement (some operators see only their team's transactions)
- Bulk operations (approve 10 PAUSED transactions at once)
- ↶ reversal icon badge on REVERSED stations in the metro tracker
- UI polish: keyboard shortcuts (⌘K for search), auto-refresh polling

---

## Previous session handoff — Transaction Workflow Screen (E1 starting; E0 COMPLETE)

A full design spec is locked in `TRANSACTION_SCREEN_DESIGN.md` (repo root). This is the next major workstream and is the most important capability in the platform — every other studio exists so this screen can render and drive a transaction end-to-end.

The spec covers: lifecycle state palette (12 states), metro tracker visual model, parallel branches (FORK/JOIN), sub-workflows, reversal (saga compensation), search (Postgres-first, ES-later), failure handling (retry/repair-queue/cancellation), data model migrations, and a 7-phase build plan (E0 → E6).

### E0 — backend foundation — ✅ COMPLETE
- ✅ **Commit 1/N (`b90ee6e`)** — Data model: 15 new columns on `WorkflowNode` (failure handling + reversal) and `WorkflowExecutionInstance` (lifecycle telemetry). Idempotent migration at `migrations/e0_001_transaction_workflow_columns.py`.
- ✅ **Commit 2/N (`645ee2c`)** — `CANCEL_TRANSACTION` rule action in the Business Rule Engine adapter (signal emitter).
- ✅ **Commit 3/N (`2da23e2`)** — Executor halts on `_cancelled` → `status=CANCELLED` (distinct from REJECTED). Mirrors the BLOCK halt path from finding C3 with deliberately different lifecycle/color semantics.
- ✅ **Commit 4/N (`0208af3`)** — `WorkflowNodeCreate` Pydantic schema exposes the 8 new authoring fields.
- ✅ **Commit 5/N (`fde0283`)** — `/workflows/instances/list` surfaces the 7 new audit columns. Live verified against running dev server.

**E0 is functionally complete end-to-end at the backend layer.** A rule firing CANCEL_TRANSACTION terminates the workflow with full audit; new node-authoring fields are accepted on save; instance audit fields are returned on read. 25/25 backend tests pass.

### E1 — read-only metro tracker UI — ✅ COMPLETE

Per design doc phase plan: render any in-flight instance with main line + all 12 lifecycle states, color-coded, with live sub-text per station. Operators can VIEW transactions; no actions yet (E2).

- ✅ **Commit 1/N (`dc420aa`)** — `GET /workflows/instances/{id}` endpoint returns full instance + workflow node definitions (single round-trip).
- ✅ **Commit 2/N (`dc420aa`)** — TransactionWorkflowScreen scaffolding + MetroTracker SVG component (all 12 states, color/icon language, legend).
- ✅ **Commit 3/N (`4ea85e1`)** — Demo data wired, metro tracker renders all states for visual verification.
- ✅ **Commit 4/N (`58ffab9`)** — Live data binding via useQuery + API integration. Loading/error states. Instance header + status badge.
- ✅ **Commit 5/N (`940dbe0`)** — Live sub-text from E0 audit columns: retry counts, cancellation reasons, repair queue names.

**E1 is feature-complete and production-ready for read-only viewing.** Operators can view any in-flight transaction with full lifecycle state, understand what step is current and why, and see the end-to-end workflow flow.

**What's NOT in E1** (deferred to E2+):
- Action buttons (approve, reject, retry, cancel) — E2
- Reversal UI (rollback drawer, 4-eye approval) — E3-E4
- Parallel branch + sub-workflow visualization — deferred (complex SVG logic)
- Instance picker (search/select transaction to view) — future
- SLA badges + entitlements enforcement — E6+
- Full search — E5

### E2 — action buttons + operator workflows — ✅ COMPLETE

- ✅ **Commit 1/N (`cdba2d9`)** — Action buttons (approve/reject/retry/cancel) wired to mutations. Loading states + error handling.
- ✅ **Commit 2/N (`08c4592`)** — Instance picker (search by ID, filter by status). Navigation between transactions. Searchable list with recent-first ordering.
- ✅ **Commit 3/N (`dc04e0d`)** — Step-issue panel (error diagnostics, retry history, operator actions). Shows full error code + message. Conditional on RETRYING/FAILED_TECHNICAL/AWAITING_REPAIR.

### E3 — reversal / saga compensation — ✅ COMPLETE

- ✅ **Commit 1/N (`f003b17`)** — Reversal Drawer UI component. Modal form showing reversal recipe (what will be compensated), collects reason + category, enforces 4-eye approval if needed, prevents reversal of IRREVERSIBLE steps.
- ✅ **Commit 2/N (`5997f78`)** — Reversal mutation + integration. POST /workflows/{id}/resume with action: 'reverse_step'. Auto-refetch on success, error handling, drawer auto-closes on completion.

## What operators can do (E1-E3 full stack)

✅ **View** — metro tracker with all 12 lifecycle states, live sub-text (retry counts, cancel reasons, queue names)  
✅ **Navigate** — instance picker with search + status filter + recent ordering  
✅ **Act** — approve, reject, cancel from any state  
✅ **Retry** — manual retry on RETRYING/FAILED states  
✅ **Diagnose** — error code + message + retry history on step-issue panel  
✅ **Reverse** — rollback completed steps with saga compensation (E3)

## Other open items

See `INTEGRATION_AUDIT_FINDINGS.md` for full detail.

- **~35 RTP/FedNow workflow templates** carry `step_type` but `target_token: null` — genuinely
  unwired. Wiring node→rule/calc is a **domain decision** (which rule on which node), not a
  code fix. Consider a wiring UI in the Workflow Designer. This is the only real open item
  in the integration audit.

(Previously listed: **A2** responsive overflow, **C1** sanctions screening, **C2** settlement-node
transaction handling, **C3** executor BLOCK halt — all RESOLVED. See "Landed & verified" above.)

## How to verify the in-tandem chain
```bash
uvicorn main:app --reload --port 8000      # backend
# then run WF-ECC2B272 via POST /api/v1/workflows/WF-ECC2B272/execute with a payload
# containing FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt > 500000, XchgRate, and the
# required document keys — trace shows AML rule, FX-stale rule, FX calc = amount*rate, pauses.
```

## Notes / constraints still in force
- API baseURL must be `http://localhost:8000/api/v1`.
- ADR #7: Decimal for money (note: BRE `_resolve_operand` still uses `float()` — pre-existing,
  out of scope, worth revisiting).
- Quick X-Ray comment standard on every file touched.
