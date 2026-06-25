"""
E8 — Master Global Share flag.

WHY THIS FILE EXISTS (FIELD_REGISTRY_REQUIREMENTS.md §4):
Masters are package-scoped by default, but some reference masters are genuinely
universal (Currency, Country) and the bank wants to share them across packages,
while others stay package-specific (e.g. BIC is irrelevant to domestic-only
Commercial Lending). This adds a user-controlled `is_global_shared` flag to
screen_templates (masters are MAINTENANCE screens) and enables it for the two
clear universals — Currency and Country — as sensible defaults the user can change.

Availability rule (for consumers): a package sees masters where
application_package_id == pkg OR is_global_shared == true.

Idempotent: ADD COLUMN only if missing; flag updates are naturally idempotent.

HOW TO RUN:
    python -m migrations.e8_004_master_global_share
"""
from __future__ import annotations

from sqlalchemy import inspect, text

from database import SessionLocal

# Masters enabled for global sharing by default (the unambiguous universals).
DEFAULT_GLOBAL_MASTERS = ["Currency Master", "Country Master"]


def run() -> int:
    db = SessionLocal()
    conn = db.connection()
    changes = 0
    try:
        cols = {c["name"] for c in inspect(conn).get_columns("screen_templates")}
        if "is_global_shared" not in cols:
            conn.execute(text(
                "ALTER TABLE screen_templates ADD COLUMN is_global_shared BOOLEAN NOT NULL DEFAULT 0"
            ))
            print("[done] added screen_templates.is_global_shared")
            changes += 1
        else:
            print("[skip] screen_templates.is_global_shared already exists")
        db.commit()

        # Enable global on the default universal masters.
        from models import ScreenTemplate
        for name in DEFAULT_GLOBAL_MASTERS:
            m = db.query(ScreenTemplate).filter_by(screen_name=name).first()
            if m and not m.is_global_shared:
                m.is_global_shared = True
                changes += 1
                print(f"[done] enabled global share on '{name}'")
            elif m:
                print(f"[skip] '{name}' already global")
            else:
                print(f"[warn] master '{name}' not found — run seed_masters_payments.py first")
        db.commit()
        return changes
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    n = run()
    print(f"Done — {n} change(s).")
