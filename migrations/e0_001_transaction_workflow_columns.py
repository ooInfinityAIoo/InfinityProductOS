"""
E0 commit 1 — Transaction Workflow Screen data model migration.

WHY THIS FILE EXISTS (TRANSACTION_SCREEN_DESIGN.md §8):
This migration adds the columns required so the Workflow Designer can author
failure-handling + reversal metadata per node, and so the executor can persist
the full 12-state lifecycle palette on every execution instance.

It is intentionally IDEMPOTENT — each ALTER is wrapped in a "column exists?"
check, so running this migration twice (or partway through a previous run)
is safe. No destructive operations.

The project does not use Alembic — schema lives in models.py and is materialized
by SQLAlchemy Base.metadata.create_all() on first run. For existing local SQLite
dev databases that were created before E0, this script ALTERs them up to the
new shape. For fresh databases (CI / new contributors), create_all() handles it.

HOW TO RUN:
    python -m migrations.e0_001_transaction_workflow_columns

WHAT BREAKS IF SKIPPED:
The Workflow Designer's new Failure Handling and Reversal sub-forms will
attempt to write columns the DB doesn't have → 500 on save. Existing nodes
remain functional (defaults are nullable).
"""
from __future__ import annotations

import sys
from sqlalchemy import inspect, text

from database import regional_engines

# (table_name, column_name, column_ddl) — one row per ALTER.
# DDL is SQLite-friendly (the project default). For Postgres we'd use the same
# DDL since both engines accept this subset.
NODE_COLUMNS = [
    ("workflow_nodes", "on_failure",         "TEXT NOT NULL DEFAULT 'RETRY'"),
    ("workflow_nodes", "retry_config",       "TEXT"),                                # JSONB stored as TEXT on SQLite
    ("workflow_nodes", "repair_queue_name",  "TEXT"),
    ("workflow_nodes", "cancellable",        "BOOLEAN NOT NULL DEFAULT 1"),
    ("workflow_nodes", "skippable",          "BOOLEAN NOT NULL DEFAULT 0"),
    ("workflow_nodes", "reversibility",      "TEXT NOT NULL DEFAULT 'REVERSIBLE'"),
    ("workflow_nodes", "reversal_recipe",    "TEXT"),
    ("workflow_nodes", "reversal_rules",     "TEXT"),
]

INSTANCE_COLUMNS = [
    ("workflow_execution_instances", "retry_attempts_log",       "TEXT"),
    ("workflow_execution_instances", "repair_queue_assigned",    "TEXT"),
    ("workflow_execution_instances", "cancelled_by",             "TEXT"),
    ("workflow_execution_instances", "cancelled_reason_code",    "TEXT"),
    ("workflow_execution_instances", "cancelled_message",        "TEXT"),
    ("workflow_execution_instances", "reversal_request_id",      "TEXT"),
    ("workflow_execution_instances", "template_version_pinned",  "INTEGER"),
]

ALL_COLUMNS = NODE_COLUMNS + INSTANCE_COLUMNS


def _existing_columns(conn, table_name: str) -> set[str]:
    inspector = inspect(conn)
    return {col["name"] for col in inspector.get_columns(table_name)}


def _apply_to_engine(engine, label: str) -> int:
    """Apply all missing ALTERs to one regional engine. Returns count added."""
    added = 0
    with engine.begin() as conn:
        for table, column, ddl in ALL_COLUMNS:
            existing = _existing_columns(conn, table)
            if column in existing:
                continue
            sql = f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"
            conn.execute(text(sql))
            print(f"  [{label}] +{table}.{column}")
            added += 1
    return added


def main() -> int:
    total = 0
    for label, engine in regional_engines.items():
        print(f"Applying E0 columns to engine [{label}] ...")
        try:
            total += _apply_to_engine(engine, label)
        except Exception as exc:
            print(f"  [{label}] FAILED: {exc}", file=sys.stderr)
            return 1
    print(f"E0 migration complete. Columns added: {total}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
