"""
E7 commit 3 — Entitlements Enforcement data model migration.

WHY THIS FILE EXISTS:
This migration adds the assigned_team column to workflow_execution_instances
so that operators can be restricted to viewing only their team's transactions.

HOW TO RUN:
    python -m migrations.e7_003_entitlements_columns
"""
from __future__ import annotations

import sys
from sqlalchemy import inspect, text

from database import regional_engines

ALL_COLUMNS = [
    ("workflow_execution_instances", "assigned_team", "TEXT"),
]

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
        print(f"Applying E7 columns to engine [{label}] ...")
        try:
            total += _apply_to_engine(engine, label)
        except Exception as exc:
            print(f"  [{label}] FAILED: {exc}", file=sys.stderr)
            return 1
    print(f"E7 migration complete. Columns added: {total}.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
