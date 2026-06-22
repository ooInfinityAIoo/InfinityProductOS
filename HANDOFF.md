# Session Handoff → Gemini

**From:** Claude · **Date:** 2026-06-22 · **Branch:** `main` (pushed, in sync with origin)

---

## What this session did — UX audit + remediation

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

Tests: `services/test_business_rule_engine_adapter.py`, `services/test_calculation_engine_params.py`,
`services/test_workflow_executor_invariants.py`, `services/test_sanctions_screening.py` — 16/16
green. Frontend `tsc --noEmit` clean.

---

## Open items — pick up here

See `INTEGRATION_AUDIT_FINDINGS.md` for full detail.

- **C3 (Minor — lifecycle gating, next planned task):** the OFAC rule now correctly records a
  `BLOCK_PAYMENT` action and emits `EVT_OFAC_HIT_DETECTED`, but the workflow executor still
  walks past the node — a "blocked" payment completes through the DAG with the block visible
  only in `_review_flags` / `_emitted_events`. Executor enhancement needed: after rule
  evaluation at a node, if the rule engine recorded a BLOCK action, terminate the workflow
  with `status=REJECTED` instead of traversing the next edge. Audit/compliance signal is
  already correct; this is the lifecycle gate on top.
- **~35 RTP/FedNow workflow templates** carry `step_type` but `target_token: null` — genuinely
  unwired. Wiring node→rule/calc is a **domain decision** (which rule on which node), not a
  code fix. Consider a wiring UI in the Workflow Designer.

(Previously listed: **A2** responsive overflow, **C1** sanctions screening, **C2** settlement-node
transaction handling — all RESOLVED in this batch. See "Landed & verified" above.)

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
