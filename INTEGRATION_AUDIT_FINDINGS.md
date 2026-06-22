# Integration ("In-Tandem") Audit — Open Findings

**Audit date:** 2026-06-21
**Scope:** Do the engines (Workflow, Business Rules, Calculation, API, Events, Reconciliation)
actually work *together at runtime* — not just author/load in isolation?
**Method:** Executed real workflows via `POST /api/v1/workflows/{id}/execute` and read the
execution trace, then wired individual nodes to real engine artifacts to test the handoffs.

This document tracks the items that are **NOT yet fixed** and need a product/architecture
decision. Two crash bugs found during the same audit were already fixed (see "Context" below).

---

## Context — bugs already fixed (commit `8c7ca68`)

These made workflow execution impossible end-to-end and are resolved:

- **`uuid` variable shadowing** in `services/workflow_executor.py` — every execution 500'd.
- **`BusinessRuleEngine` variable shadowing** — 500 the moment a BUSINESS_RULE step ran.

After these fixes, `POST /workflows/{id}/execute` returns `COMPLETED`, the DAG traverses
correctly, and the executor **does** invoke the Business Rule Engine in tandem when a node
step is wired to a real rule token. The mechanism works; the two findings below are what
still stop the engines from actually working together with the seeded data.

---

## Finding C — Workflow orchestration steps are 97% unwired

**Severity:** Major (blocks in-tandem execution with current data; not a code bug)

**STATUS: golden path RESOLVED & demonstrated end-to-end.** The root cause turned out to be
the same *schema-mismatch* class as Finding D, not literally "unwired": the golden-path
workflow `WF-ECC2B272` was already authored with real references, but in a semantic step shape
(`{action:"INVOKE_RULE", rule_token}`, `{action:"INVOKE_FORMULA", formula_token}`,
`{action:"INVOKE_API", api_name}`, `{action:"EMIT_EVENT", event_code}`,
`{action:"REQUIRE_APPROVAL", role}`) that the executor (reading `{step_type, target_token,
target_event_type}`) ignored. Fixes landed:
- `WorkflowExecutor._normalize_step()` — adapter translating the authored `action` shape into
  the executor's dispatch shape (+ an `INGEST_NOOP` branch for INVOKE_TEMPLATE/INVOKE_MAPPER).
- `database.py` JSON serializer (`default=str`) — Decimal/datetime in the persisted
  execution-instance context no longer crash on commit ("Object of type Decimal is not JSON
  serializable").
- Calc engine: bind list-shaped `parameters` (`{name, iso_field, type}`) to ISO-field values;
  guard `_to_decimal(bool)`.
- BRE: honest error for the unimplemented sanctions operator; handle BLOCK_PAYMENT / REJECT_STEP.

Running `WF-ECC2B272` end-to-end now fires, in tandem: AML rule (flag+event), FX-stale rule
(reject+event), **FX calc = 592500.00 (Decimal)**, human-approval pause, event broadcasts,
document gates. Regression tests: `test_business_rule_engine_adapter.py`,
`test_calculation_engine_params.py`.

**Residual sub-findings (still open):**
- **C1 (Major):** Sanctions-list screening (`NOT_IN_SANCTION_LIST` against OFAC_SDN) is not
  implemented and no SDN list data is loaded — the OFAC rule logs an honest "manual screening
  required" instead of actually screening. Needs a sanctions-screening capability + list data.
- **C2 (Major) — RESOLVED.** SETTLE / POST_LEDGER nodes used `with db.begin():`, but the
  executor commits earlier in the run and SA 2.0 autobegins, so reaching settlement raised
  "A transaction is already begun on this Session." Fixed in `workflow_executor.py`: open a
  SAVEPOINT via `db.begin_nested()` when a transaction is already active, else `db.begin()` —
  same atomic-rollback semantics, no conflict. Verified: `WF-ECC2B272` now runs end-to-end to
  STATUS=COMPLETED with the double-entry guardrail passing (Debits=Credits). New test
  `test_active_transaction_uses_savepoint` in `test_workflow_executor_invariants.py`.
- The broad statement below still holds for the *other* ~35 workflows (RTP/FedNow templates) —
  their steps carry `step_type` but `target_token: null`, so they remain genuinely unwired and
  need per-workflow wiring (a domain decision).

**What:** Across all workflows there are **201 orchestration steps**, but only **6** carry a
`target_token` (4 `API_CALL`, 2 `EVENT_BROADCAST`). Specifically:

| Step type      | Count | Wired to a target |
|----------------|------:|------------------:|
| API_CALL       |   111 |                 4 |
| BUSINESS_RULE  |    25 |             **0** |
| EVENT          |    21 |             **0** |
| CALCULATION    |     5 |             **0** |
| TRIGGER        |    23 |                 0 |
| APPROVAL       |     3 |                 0 |
| EVENT_BROADCAST|     2 |                 2 |

**Effect:** A seeded workflow executes and traverses every node, but each engine step logs
`'None' … not found. Skipping.` — so no rule, calculation, or event actually fires. The
workflows are authored as visual DAGs with step-type placeholders, but the wiring that says
*which* rule set / formula / API each node invokes was never populated.

**Evidence (trace excerpt, RTP Credit Transfer):**
```
Entering Node: 'Validate & Enrich Payment'
Executing step: BUSINESS_RULE 'None'
[WARN] Business Rule Set 'None' not found. Skipping.
```

**Options:**
1. Seed realistic `target_token`s on the Golden Path workflow so it exercises the full chain
   (rule → calc → API → event) for demos and tests.
2. Add an authoring-time validation in the Workflow Designer that flags a BUSINESS_RULE /
   CALCULATION / API_CALL step with no target before a blueprint can go LIVE.

**Recommendation:** Both — (1) for a working reference scenario, (2) to prevent silent
no-op steps in production.

---

## Finding D — Business Rules authoring schema ≠ Rule Engine evaluation schema

**Severity:** Critical (business rules cannot fire as authored, even when correctly wired)

**STATUS: RESOLVED** (Option 1 — engine-side adapter). `services/business_rule_engine.py`
now normalizes the studio condition shape `{field, operator, value}` → engine
`{left_hand_side, right_hand_side, operator}` and the studio action shape
`{type, message/event_code}` → `{action_type, ...}` (incl. FLAG_FOR_REVIEW / EMIT_EVENT
handling and an operator-alias map). Round-trip regression tests in
`services/test_business_rule_engine_adapter.py` (studio-shape rule triggers above
threshold with flags/events, doesn't below, operator aliases normalize, engine-native
shape still works). The "Operand has no source fields." crash no longer occurs. The
long-term question of standardizing the *stored* shape (Options 2/3) is deferred.

**What:** The Business Rules studio authors/stores a condition as:
```json
{ "field": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt", "operator": "GREATER_THAN", "value": 500000 }
```
But `services/business_rule_engine.py` evaluates a condition as:
```json
{
  "left_hand_side":  { "source_fields": ["..."] },
  "right_hand_side": { "static_value": 500000 },
  "operator": "GREATER_THAN"
}
```

The engine reads `condition.get("left_hand_side")` / `right_hand_side` and resolves operands
from `source_fields` / `static_value`. When given the authored `{field, operator, value}`
shape, both operands resolve empty and it raises **`Operand has no source fields.`**

**Effect:** Even after wiring a node to a real rule (e.g. `BRE-XBDR-AML-HVT-V1`, "flag
payments > $500k"), the rule throws at evaluation. Confirmed live:
```
Executing step: BUSINESS_RULE 'BRE-XBDR-AML-HVT-V1'
[ERROR] Failed to execute rule with priority 100: Operand has no source fields.
```
So no seeded business rule can actually evaluate against a transaction.

**Why this is a decision, not a quick fix:** the studio and the engine were built to two
different contracts. Reconciling them touches the rule data model, the studio, and the engine.

**Options:**
1. **Normalize in the engine** — add an adapter so `BusinessRuleEngine` also accepts the
   `{field, operator, value}` shape (translate to `left_hand_side`/`right_hand_side` internally).
   Lowest blast radius; keeps existing authored rules working.
2. **Migrate the data + studio** — author/store rules in the engine's
   `left_hand_side`/`right_hand_side` shape; migrate existing rule definitions.
3. **Dedicated translation layer** invoked on save/publish that compiles the authoring shape
   into the engine shape.

**Recommendation:** Option 1 (engine-side adapter) as the immediate fix so rules fire, then
decide whether to standardize the stored shape long-term. Whichever path: add a round-trip
test that authors a rule in the studio format and asserts the engine evaluates it correctly —
this gap existed precisely because no test crossed the studio↔engine boundary.

---

## Not yet audited (tracked for completeness)

- **Layout / alignment pass** at real desktop width incl. modals/drawers/wizards (Workstream A).
- **Calculation Engine in tandem** — same wiring/contract questions as rules, not yet exercised
  through a live workflow run (blocked by Findings C/D).
- **Event → subscriber fan-out** — events broadcast on execution, but downstream triggering of
  Insights / Behavioral / Reconciliation has not been traced end-to-end.
- **Runtime views** Transaction Shell and 360° Dashboard (Workstream C).
