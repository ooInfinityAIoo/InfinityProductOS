# 7. Enterprise Financial Safety Patterns: Atomic Rollbacks and Precision Math

*   **Status**: Accepted
*   **Date**: 2026-06-14

## Context

As a foundational operating system for financial products, the platform processes high-volume, mission-critical transactions, reconciliations, and balance adjustments. Processing these operations using standard stateless loops or native floating-point arithmetic introduces severe enterprise risks:
1.  **Partial State Corruption**: A stateless execution loop might process 500 valid ledger entries and crash on the 501st, leaving the database in a broken, partially committed state.
2.  **Floating-Point Drift**: Standard binary floating-point representations (`float`) introduce microscopic rounding errors that accumulate exponentially over thousands of financial transactions.

To pass strict institutional due diligence and guarantee absolute structural safety, the system must enforce strict operational constraints around state mutations and mathematical evaluations.

## Decision

We mandate two uncompromisable financial safety patterns across the platform's execution layer:

1.  **Atomic Transaction Boundaries (The Invariant Verification Gate)**:
    Any workflow node executing financial movements or balance rollovers (e.g., `POST_LEDGER`, `SETTLE`) must be wrapped in a strict, explicit database-level atomic transaction block (e.g., `with db.begin():`). Before the block closes, an invariant verification check (e.g., $\sum \Delta = 0$ for double-entry bookkeeping) must occur. If the invariant fails, the software must trigger a hard, database-level `ROLLBACK` to completely clear the memory footprint.

2.  **Currency-Scale Precision Wrappers**:
    The `CalculationEngine` must never execute financial mathematics using native Python `float` variables. All inbound numeric attributes (including negative numbers and string-represented decimals) must be robustly parsed and wrapped in strict precision containers (`decimal.Decimal`). 

## Consequences

*   **Pros**:
    *   **Absolute Structural Integrity**: Completely eliminates the risk of partial commits corrupting the general ledger during bulk processing or complex reconciliations.
    *   **Mathematical Accuracy**: Guarantees zero decimal drift across millions of micro-transactions and cross-border currency conversions.
    *   **Audit Defensibility**: Provides a clear, indisputable technical barrier that satisfies global financial regulatory bodies and chief technical auditors.

*   **Cons**:
    *   **Developer Friction**: Engineering teams must be rigorously trained to never use native floats for currency and to respect transaction locking scopes to avoid database deadlocks.
    *   **Slight Overhead**: Maintaining strict `Decimal` objects and initiating hard transaction locks carries a microscopic performance overhead compared to raw, unsafe in-memory evaluation.

## Execution Proof in Codebase

*   **Atomic Rollbacks**: `services/workflow_executor.py` -> `_execute_node_actions()` uses `with self.db.begin():` to wrap the invariant state verification gate for financial nodes.
*   **Precision Math**: `services/calculation_engine.py` -> `execute_formula_by_token()` utilizes a robust `try-except` block to convert all runtime variables to `decimal.Decimal`, correctly handling both positive and negative values prior to AST evaluation.
*   **Secure AST Parsing**: `services/calculation_engine.py` -> Uses `simple_eval` instead of `eval()` to prevent remote code execution vulnerabilities.