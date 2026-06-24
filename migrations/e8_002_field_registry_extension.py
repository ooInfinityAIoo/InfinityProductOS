"""
E8 commit (Phase 1) — Extended Field Registry schema additions.

WHY THIS FILE EXISTS:
Phase 1 of FIELD_REGISTRY_REQUIREMENTS.md — purely ADDITIVE schema so the
master-anchoring + 6-level placement chain columns exist with NO behaviour change.
Mandatory enforcement (Package+Master+Product), the iso_business_name-nullable
rebuild, backfill, and categorisation come in later phases.

Adds to iso_field_registry (all nullable / safe defaults):
  master_ref, iso_field_ref, application_package_id, applies_to_all_products,
  subproduct_id, workflow_id, workflow_step_id, workflow_substep_id
Creates: field_product_map (field ↔ product many-to-many).

Idempotent: checks existing columns / table before adding. SQLite ADD COLUMN is
additive and safe on the existing 3,013 rows.

HOW TO RUN:
    python -m migrations.e8_002_field_registry_extension
"""
from __future__ import annotations

from sqlalchemy import inspect, text

from database import SessionLocal

# column_name -> column DDL (SQLite). Nullable, with safe defaults where needed.
NEW_COLUMNS = {
    "master_ref": "TEXT",
    "iso_field_ref": "TEXT",
    "application_package_id": "TEXT",
    "applies_to_all_products": "BOOLEAN NOT NULL DEFAULT 0",
    "subproduct_id": "TEXT",
    "workflow_id": "TEXT",
    "workflow_step_id": "TEXT",
    "workflow_substep_id": "TEXT",
}

FIELD_PRODUCT_MAP_DDL = """
CREATE TABLE IF NOT EXISTS field_product_map (
    map_id      TEXT PRIMARY KEY,
    field_id    TEXT NOT NULL REFERENCES iso_field_registry(field_id) ON DELETE CASCADE,
    product_id  TEXT NOT NULL REFERENCES product_master(product_id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    CONSTRAINT uq_field_product UNIQUE (field_id, product_id)
)
"""


def run() -> int:
    db = SessionLocal()
    conn = db.connection()
    added = 0
    try:
        inspector = inspect(conn)
        existing = {c["name"] for c in inspector.get_columns("iso_field_registry")}
        for col, ddl in NEW_COLUMNS.items():
            if col in existing:
                print(f"[skip] iso_field_registry.{col} already exists")
                continue
            conn.execute(text(f"ALTER TABLE iso_field_registry ADD COLUMN {col} {ddl}"))
            print(f"[done] added iso_field_registry.{col}")
            added += 1

        tables = inspector.get_table_names()
        if "field_product_map" in tables:
            print("[skip] table field_product_map already exists")
        else:
            conn.execute(text(FIELD_PRODUCT_MAP_DDL))
            print("[done] created table field_product_map")
            added += 1

        db.commit()
        return added
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    n = run()
    print(f"Done — {n} change(s) applied.")
