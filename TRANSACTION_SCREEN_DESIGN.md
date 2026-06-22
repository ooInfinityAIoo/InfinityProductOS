# Transaction Workflow Screen — Design Specification

**Status:** locked design, not yet implemented  ·  **Owner:** Nisarg (PM)  ·  **Last updated:** 2026-06-22

---

## Why this document exists

The Transaction Workflow Screen is the runtime UI an operator uses to process a single live transaction. It is the most important capability in the platform — every other studio (Workflow Designer, Business Rules, Calculation Engine, API Designer, Screen Designer, etc.) ultimately exists so this screen can render and drive a transaction end-to-end.

This spec captures every design decision locked in the 2026-06-22 design session. It is the source of truth: if the build deviates from this doc, this doc is updated first. Mockups referenced here are embedded in chat history and can be re-rendered on request.

---

## 1. User flow — how an operator gets to a transaction

```
Menu "Transaction"
   └─ Pick Product            (required — e.g. "Cross-Border Payments")
        └─ Pick Sub-product   (optional — e.g. "SWIFT MT103")
             └─ Pick Workflow Template
                   (auto-loads if only one LIVE template matches;
                    otherwise user chooses from the LIVE list)
                   └─ "New Transaction" creates an instance and lands on the screen
```

**Rules:**
- Only Workflow Templates with `status = LIVE` appear in the picker. DRAFT and ARCHIVED are excluded.
- Sub-product filter is optional. When omitted, all LIVE templates for the Product show.
- The picker is scoped by the current Package context (Two-Key Cockpit applies, same as every other studio).
- The Workflow Designer is the **sole source of truth** for the template — no separate authoring needed for the runtime screen.

---

## 2. The metro tracker — visual model

Each workflow node is a **station** on a horizontal metro line. The current node is highlighted; completed nodes are filled; pending nodes are outlined. Status updates **live** as the engine moves the transaction forward (rule fires, approval given, retry attempt, settlement complete).

### 2.1 Lifecycle state palette

Each step can be in one of 12 states. Color encodes urgency, icon encodes nature, sub-text under the station encodes why.

| State | Color | Icon | Live sub-text example | Source |
|---|---|---|---|---|
| `PENDING` | Gray outline | — | — | not yet reached |
| `IN_PROGRESS` | Amber filled | dot | `in progress · 1h 23m` | engine status |
| `PAUSED` | Amber filled | pause | `awaiting PAYMENTS_MANAGER · 1h 23m` | HUMAN_APPROVAL node |
| `RETRYING` | Amber + red ring | refresh | `retry 2/3 · next in 28s` | `retry_config` on node |
| `AWAITING_REPAIR` | Red filled | wrench | `in PAYMENTS_OPS_REPAIR · 2h 14m` | `on_failure = REPAIR_QUEUE` |
| `FAILED_TECHNICAL` | Dark red | x | `503 from FX provider · retries exhausted` | engine error, `on_failure = FAIL_FAST` |
| `BLOCKED` | Dark red | lock | `blocked by OFAC SDN hit` | `BLOCK_PAYMENT` rule action (shipped) |
| `REJECTED` | Dark red | x | `rejected · FX rate stale` | `REJECT_STEP` rule action (shipped) |
| `CANCELLED` | **Purple** | x-mark | `cancelled by rule: ACCOUNT_FROZEN` | `CANCEL_TRANSACTION` rule action (new) |
| `COMPLETED` | Green | check | — | success |
| `REVERSED` | Amber | ↶ | `reversed by John Doe · customer request` | reversal flow |
| `SKIPPED` | Gray strikethrough | — | `not on this branch` | conditional branch not taken |

**Color semantic locked:** purple = voluntary termination (cancelled); red = system-driven rejection (blocked, rejected, failed). Operators learn this distinction by sight.

### 2.2 Visual rules

- Top of screen: universal search bar (see §6).
- Below search: transaction context strip (UETR, customer, amount, lifecycle status badge).
- Main canvas: the metro tracker (horizontal line of stations).
- Below tracker: legend (states present in this transaction only — not the full palette).
- Below legend: current-step actions card (Approve/Reject/Add Note/Reassign as relevant).
- Below actions: contextual side panels (issue detail, reversal drawer) that slide in when triggered.

---

## 3. Parallel branches — FORK and JOIN

Steps with no data dependency can execute concurrently for SLA efficiency. Example: Sanctions check ∥ Balance inquiry.

### 3.1 Authoring (Workflow Designer)

Two new node types:
- **`FORK`** — one input edge, N output edges. Marks the start of parallel work.
- **`JOIN`** — N input edges, one output edge. Waits for all incoming branches per the join policy, then proceeds.

Designer-time lints:
- Every `FORK` must have a matching `JOIN`.
- No cycles inside a parallel region.
- **Conflict detection:** warn at save time if two parallel branches write to the same context key (race condition).

### 3.2 Runtime semantics

| Property | Default | Notes |
|---|---|---|
| Branch failure policy | `FAIL_FAST` | Failing branch immediately marks JOIN as rejected; in-flight branches keep running but their results are compensated post-hoc |
| Alternatives | `WAIT_FOR_ALL`, `CANCEL_OTHERS` | Per-FORK opt-in |
| Branch timeout | per-branch SLA from node `sla_config` | independent timers |
| JOIN SLA | `MAX` of branch SLAs | the slowest branch determines join time |
| Resource conflicts | savepoint per branch (ADR #7 + Finding C2 pattern) | parallel branches that touch shared DB rows use SAVEPOINT |

### 3.3 Visual model

```
                ┌── 2a. Sanctions check ──┐
1. Validate ───┤                           ├── 3. Approve → 4. Settle
                └── 2b. Balance check ────┘
```

- Each branch is its own mini-track with its own color states.
- JOIN node shows **"Waiting on: Balance check (3m 14s)"** so ops know the bottleneck.
- Branch-level SLA badges + a max-SLA badge on the JOIN node.

---

## 4. Sub-workflows — parallel tracks below a node

When a node references a sub-workflow (via existing `SUB_WORKFLOW` step type), a **second line appears below** the parent station showing **all** the sub-workflow's steps in full — not just the active one — so the operator sees the complete end-to-end map.

### 4.1 Visual model

```
   ✓ Validate → ✓ AML+OFAC → ✓ FX enrich → ⊙ Approve → ◯ Settle
                                  │
                                  └─► ✓ Risk score → ✓ Margin calc → ✓ Pricing
```

### 4.2 Nesting depth

**Locked: cap at two visible lines (parent + one sub-level).** Deeper nesting expands on demand — operator clicks the deepest station and a second sub-flow opens in a side panel. Reasoning: three+ parallel tracks gets visually busy; most real workflows don't nest more than 2 deep anyway.

---

## 5. Reversal — compensation, not undo

Reversal is a first-class capability. The right mental model is **saga compensation**: each step doesn't just *do* something, it teaches the system how to *undo* itself.

### 5.1 Per-node authoring fields (in Workflow Designer)

| Field | Values | Purpose |
|---|---|---|
| `reversibility` | `REVERSIBLE` · `REVERSIBLE_WITH_APPROVAL` · `IRREVERSIBLE` · `CONDITIONALLY_REVERSIBLE` | Verdict at design time |
| `reversal_recipe.db_reversal` | structured object | Which fields to restore from the pre-step snapshot |
| `reversal_recipe.api_reversal` | `api_id` reference | Which compensating API to call |
| `reversal_recipe.event_reversal` | `event_code` | Compensating event to broadcast |
| `reversal_rules` | list of conditions | Time/state checks (e.g. "reversible only within 10 min of settlement") evaluated at click time |

### 5.2 Snapshot strategy

**Locked: snapshot per step (sidecar table `workflow_step_snapshots`).** Captures the relevant context fields **before** each step executes. Event-sourcing is the more correct long-term answer; deferred — snapshot first, migrate later.

### 5.3 Reversal flow

1. Operator clicks ↶ icon on a completed station.
2. Reversal Drawer opens — shows the recipe in plain language ("Will cancel FX hold of $592,500. Will send pacs.002 reject. Will mark as REVERSED.").
3. Operator enters mandatory **reason** (free text) + **category** (Customer request · Compliance · Data error · Other).
4. If `REVERSIBLE_WITH_APPROVAL`: routes to 4-eye approval (approver ≠ requester).
5. Engine executes the compensation:
   - **LIFO ordering** within a sequential workflow (reverse step 5 first, then 4, then 3).
   - **Reverse-completion-order** for parallel branches by default; opt-in to parallel compensation on the FORK node.
6. If a compensation step fails → status becomes `REVERSAL_FAILED`, instance lands in **Reversal Recovery Queue** for manual intervention.
7. Every reversal logged to immutable evidence ledger (who, when, why, what changed, did compensation succeed).

### 5.4 Idempotency

Every reversal carries a `reversal_request_id`. Clicking twice fires once.

### 5.5 Cascade to downstream

If a step's compensation must invalidate downstream-consumed events (Insights, Behavioral, Recon), it emits a `_REVERSED` companion event so derived records can re-tune. This is the trickiest corner — event contracts must be designed with reversal in mind from day one.

---

## 6. Search — own subsystem, not a UI feature

Bank-scale: ~1M tx/day × 365 days × 5-year retention = **~1.8B records**. Search does not query the live OLTP table.

### 6.1 Architecture

```
  OLTP (workflow_execution_instances)  ──events──►  Search Index
  (hot, transactional)                              (cold, optimized for read)
```

- **Tier 1 (v1):** PostgreSQL — B-tree on indexed columns, GIN on JSONB for wide reference fields, `pg_trgm` for fuzzy name matching. Good to ~100M records.
- **Tier 2 (when GIN slows):** Elasticsearch / OpenSearch. Migrate based on measured latency, not pre-emptively.
- Sync: async via event bus; <2s eventual consistency.

### 6.2 Indexed fields (categorized)

| Category | Fields | Match type |
|---|---|---|
| **Identity (exact)** | UETR, EndToEndId, TxId, MsgId, InstrId, ClrSysRef, CdtrRef.Strd.Ref, AcctSvcrRef, RltdRef, internal IDs, customer_id, account_number | Exact (with normalization: hyphens stripped, leading zeros preserved) |
| **Faceted / categorical** | status, product, subproduct, workflow_template_id, currency, channel, country | Exact enum |
| **Free-text / fuzzy** | customer_name, beneficiary_name, debtor_name, RmtInf narrative, address | Trigram / phonetic |
| **Range** | amount, value_date, initiated_at, completed_at, SLA breach time | Range |
| **Boolean / flag** | has_block, was_reversed, requires_approval, has_sanctions_hit | Exact |

### 6.3 UX

**Universal search bar** in the top nav. Types-as-search with auto-detect — 36 chars with hyphens → UETR candidate; all digits → account candidate; currency-prefixed amount → amount candidate; free text → name candidate. Inline result counts per field.

**Advanced search drawer** — multi-field AND/OR builder, saved searches per user, CSV/Excel export for compliance.

**Result list** — virtualized, count-first ("Showing 50 of 1,247 matches"), click-to-pivot opens the Transaction screen.

### 6.4 Non-negotiable constraints

- **Entitlement filtering at query time** (never post-filter — security + performance).
- **Every search query audit-logged** (who, when, what, result count). Required for regulators.
- **Normalization on ingest AND query** (UETR with/without hyphens, account numbers with/without leading zeros, names with diacritics).
- **Linked transactions** — `RltdRef` derives a `linked_group_id` so payment + recall + amendment + reversal surface together.

### 6.5 Performance budget

- Find by UETR / exact ID: **< 100 ms**
- Search by customer name (fuzzy): **< 500 ms**
- Faceted multi-field across 1B records: **< 2 s**

---

## 7. Failure handling — retry, repair queue, cancellation

### 7.1 Per-node authoring fields

| Field | Values | Default |
|---|---|---|
| `on_failure` | `RETRY` · `REPAIR_QUEUE` · `FAIL_FAST` · `COMPENSATE_AND_HALT` | `RETRY` (with 3 attempts) |
| `retry_config.max_attempts` | int | 3 |
| `retry_config.backoff_strategy` | `LINEAR` · `EXPONENTIAL` | `EXPONENTIAL` |
| `retry_config.backoff_seconds` | int | 30 |
| `repair_queue_name` | string (FK to Queue Infrastructure) | — (required if `on_failure = REPAIR_QUEUE`) |
| `cancellable` | bool | `true` (can a `CANCEL_TRANSACTION` rule fire here?) |
| `skippable` | bool | `false` (can ops staff manually skip this step?) |

### 7.2 New rule action: `CANCEL_TRANSACTION`

Authored in Business Rules studio. Carries `reason_code` + `message`. Engine handler:
- Sets `_cancelled: True` on context (mirroring `_blocked` for BLOCK_PAYMENT).
- Workflow executor checks after each node, persists `WorkflowExecutionInstance` with `status = CANCELLED`, returns `{status: CANCELLED, cancelled_at_node, reason_code, message}`.
- Distinct from BLOCK (sanctions hit) and REJECT_STEP (validation failure).

### 7.3 Repair Queue

New view in the Runtime Operations menu (alongside Transaction Shell). Lists all instances where `status = AWAITING_REPAIR`, scoped by the user's role-to-queue entitlements. Each row → click → opens the Transaction screen with the issue panel already expanded.

### 7.4 Step issue detail panel

Clicking any failed / retrying / awaiting-repair station opens a side panel:
- Plain-language reason
- Full error message (technical)
- Retry history (attempt N: timestamp, response code)
- Configured fallback (e.g. "retries exhausted → route to PAYMENTS_OPS_REPAIR")
- Operator actions: **Retry now · Skip step · Send to repair queue · Cancel transaction · Escalate**

`Skip step` is hidden unless the node is flagged `skippable = true`.

---

## 8. Data model changes

### 8.1 `WorkflowNode` — new columns

```sql
-- Failure handling
on_failure              VARCHAR(32)   DEFAULT 'RETRY'
retry_config            JSONB         -- {max_attempts, backoff_strategy, backoff_seconds}
repair_queue_name       VARCHAR(64)   -- FK to queue infrastructure
cancellable             BOOLEAN       DEFAULT TRUE
skippable               BOOLEAN       DEFAULT FALSE

-- Reversal
reversibility           VARCHAR(32)   DEFAULT 'REVERSIBLE'
reversal_recipe         JSONB         -- {db_reversal, api_reversal, event_reversal}
reversal_rules          JSONB         -- list of conditions
```

### 8.2 `WorkflowExecutionInstance` — new states + new columns

Allowed `status` values (extended):
```
RUNNING · PAUSED · COMPLETED · REJECTED · BLOCKED · CANCELLED
RETRYING · AWAITING_REPAIR · FAILED_TECHNICAL · REVERSED · REVERSING · REVERSAL_FAILED
```

New columns:
```sql
retry_attempts_log      JSONB         -- list of {attempt_n, timestamp, error_code, error_message}
repair_queue_assigned   VARCHAR(64)   -- which queue this lives in when AWAITING_REPAIR
cancelled_by            VARCHAR(32)   -- 'rule' | 'operator' | 'system'
cancelled_reason_code   VARCHAR(64)
cancelled_message       TEXT
reversal_request_id     VARCHAR(64)   -- idempotency key for in-flight reversals
template_version_pinned INT           -- in-flight stays on the template version it started with
```

### 8.3 New table: `workflow_step_snapshots`

```sql
snapshot_id             VARCHAR(64) PRIMARY KEY
instance_id             VARCHAR(64) NOT NULL  -- FK to WorkflowExecutionInstance
node_id                 VARCHAR(64) NOT NULL  -- FK to WorkflowNode
captured_at             TIMESTAMPTZ NOT NULL
context_snapshot        JSONB NOT NULL        -- the fields to restore on reversal
INDEX(instance_id, captured_at)
```

### 8.4 New table: `repair_queue`

```sql
queue_entry_id          VARCHAR(64) PRIMARY KEY
queue_name              VARCHAR(64) NOT NULL
instance_id             VARCHAR(64) NOT NULL
node_id                 VARCHAR(64) NOT NULL
landed_at               TIMESTAMPTZ NOT NULL
last_error              JSONB
assigned_to             VARCHAR(64)
INDEX(queue_name, landed_at)
```

### 8.5 New table: `transaction_search_index` (Tier 1)

Postgres-backed denormalized index of all the fields listed in §6.2. Updated asynchronously from `WorkflowExecutionInstance` events. GIN index on the wide JSONB ref column; B-tree on identity columns; `pg_trgm` GIN on name columns.

---

## 9. New authoring surfaces in studios

### 9.1 Workflow Designer

- Per-node panel gains **Failure Handling** section: `on_failure`, `retry_config`, `repair_queue_name`, `cancellable`, `skippable`.
- Per-node panel gains **Reversal** section: `reversibility`, `reversal_recipe` (sub-form), `reversal_rules` (sub-form).
- Two new node types: `FORK`, `JOIN`.

### 9.2 Business Rules

- New action type: `CANCEL_TRANSACTION` (alongside FLAG_FOR_REVIEW, EMIT_EVENT, BLOCK_PAYMENT, REJECT_STEP).

### 9.3 New top-level studio (under Runtime Operations)

- **Repair Queue** — list view of `AWAITING_REPAIR` instances, scoped by role/queue.

---

## 10. Phased build plan

Each phase is independently shippable and commits to git separately. Don't move to the next phase until the current one's tests pass.

| Phase | Scope | Outcome |
|---|---|---|
| **E0** | Data model migrations (§8) + new lifecycle states + new rule action `CANCEL_TRANSACTION` + executor handles new states | Backend can express + persist every new state, but no UI yet |
| **E1** | Read-only metro tracker — renders any in-flight instance with main line + sub-workflow + parallel branches + all 12 lifecycle states | Operators can VIEW transactions; no actions yet |
| **E2** | Current-step actions (Approve / Reject / Add Note / Reassign) + Resume from PAUSE + step-issue detail panel + Retry/Skip/Cancel actions | Operators can MOVE transactions forward |
| **E3** | Reversal authoring in Workflow Designer (per-node reversal_recipe + reversal_rules + reversibility) + snapshot capture in executor | The authoring side of reversal is ready |
| **E4** | Reversal runtime — Reversal Drawer UI + LIFO compensation executor + 4-eye approval flow + Reversal Recovery Queue | Operators can REVERSE transactions |
| **E5** | Search — universal search bar + advanced drawer + Postgres index + audit logging + entitlement filtering + linked-transaction grouping | Operators can FIND transactions at scale |
| **E6** | Repair Queue view + parallel-branch visualization polish + responsive tweaks + concurrent-operator locking + SLA badges + bulk operations | Production-grade polish |

**E0 is the gating phase.** Until the data model and lifecycle states are in place, none of the UI work makes sense.

---

## 11. Open questions / deferred decisions

These were raised in design but punted:

- **Workflow forking visualization** — the executor supports fork/join; the visual layout for arbitrary parallel topology (not just 2 branches) needs design exploration.
- **Customer-comms compensation on reversal** — if a step sent the customer an SMS, reversing the step may need a "previous message in error" follow-up. Decision deferred.
- **Multi-language / phonetic name matching** for cross-border (Cyrillic, Chinese, Arabic) — E5 ships ASCII trigram; multi-language is a later spike.
- **AI-assisted search** ("show me payments that look like fraud last week") — deferred to E6+.
- **Workflow hot-swap** — can a senior user CHANGE the in-flight workflow path mid-transaction? Locked: **no** for v1. In-flight transactions stay on their pinned template version.

---

## 12. Constraints carried from elsewhere

All ADRs continue to apply:
- **ADR #2** — secrets via `os.getenv()`, never hardcoded.
- **ADR #3** — Logic-as-Data: workflow templates, rules, recipes all live in DB as JSONB, interpreted at runtime.
- **ADR #7** — `decimal.Decimal` for money; `simpleeval` for formulas; atomic transactions via `with db.begin():` / `begin_nested()` (Finding C2 pattern).
- **ADR #8** — external API calls require rate_limit_rps, circuit_breaker_threshold, circuit_breaker_timeout. PII masking on outbound bodies.
- **Quick X-Ray** comment standard — every file touched gets WHY comments at 3 levels.

---

## 13. References

- Mockup A — *Linear + parallel + sub-workflow + reversal drawer*: rendered 2026-06-22, chat history.
- Mockup B — *Failure states: retrying step + step issue panel*: rendered 2026-06-22, chat history.
- Findings doc: `INTEGRATION_AUDIT_FINDINGS.md` — the cross-engine work that unblocked this design.
- Session handoff: `HANDOFF.md` — what shipped before this spec.
