"""
E8 commit (Phase 2) — Backfill field_source for the seeded ISO fields.

WHY THIS FILE EXISTS (FIELD_REGISTRY_REQUIREMENTS.md §10.1, D8):
The 3,013 fields seeded before the field_source column have field_source = NULL,
so source-filtering ("show only ISO" / "only custom") is broken. They are all
ISO 20022 standard fields → tag the NULLs as ISO_20022. Any field already tagged
(e.g. BANK_CUSTOM created via the API) is left untouched.

Idempotent: only touches rows where field_source IS NULL.

HOW TO RUN:
    python -m migrations.e8_003_backfill_field_source
"""
from __future__ import annotations

from sqlalchemy import text

from database import SessionLocal


def run() -> int:
    db = SessionLocal()
    try:
        before = db.execute(
            text("SELECT COUNT(*) FROM iso_field_registry WHERE field_source IS NULL")
        ).scalar()
        if not before:
            print("[skip] no NULL field_source rows — nothing to backfill")
            return 0
        db.execute(
            text("UPDATE iso_field_registry SET field_source = 'ISO_20022' WHERE field_source IS NULL")
        )
        db.commit()
        print(f"[done] tagged {before} NULL field_source rows as ISO_20022")
        # Report the resulting distribution.
        rows = db.execute(
            text("SELECT field_source, COUNT(*) FROM iso_field_registry GROUP BY field_source")
        ).all()
        print("  distribution:", {src: n for src, n in rows})
        return before
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    n = run()
    print(f"Done — {n} row(s) backfilled.")
