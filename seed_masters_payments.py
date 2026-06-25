"""
seed_masters_payments.py — Placeholder Masters for the Payments package.

WHY THIS FILE EXISTS (FIELD_REGISTRY_REQUIREMENTS.md §4, revised master model):
A Master is a curated, value-domain reference table the bank maintains — defined
deliberately, NOT auto-generated per data-type. The PM defined the Payments master
set; this seeds each as a LIVE MAINTENANCE screen (the existing master mechanism)
scoped to the Payment Hub package, so fields can anchor their `master_ref` to them.

These are PLACEHOLDERS: each master gets a minimal {code, description} definition.
The real columns/value-lists are defined later in Screen Designer. More masters
(other packages) will be added as the PM shares them.

Idempotent by screen_name: existing same-name masters are re-scoped to this package
and ensured LIVE rather than duplicated.

HOW TO RUN:
    python seed_masters_payments.py
"""
from __future__ import annotations

import datetime
import uuid

from database import SessionLocal
import models

PAYMENTS_PACKAGE_ID = "PKG-4D5B9DD9"  # Payment Hub

# The PM-defined Payments masters. " Master" is appended where not already present.
PAYMENTS_MASTERS = [
    "Currency", "Country", "Address", "Holiday Calendar", "National Clearing Codes",
    "IBAN", "Customer Account Numbers", "GL Account Numbers", "Clearing House Accounts",
    "Bank Identification Code", "Branch Master", "Customer", "Bank Master", "Bank Routing",
    "RMA", "Bilateral Key", "Method of Payment", "Membership", "Cut off Time Master",
    "Line of Business", "Department", "Limits", "ISO Message Types", "BIC", "BBAN",
    "Service Level Agreements", "Transaction Codes", "Debit Account Derivation",
    "Credit Account Derivation",
    # Batch 2 (PM-defined)
    "Fee Configuration Master", "Mandate Management Master", "CounterParty Master",
    "Payment Rejection Reason Codes", "Upstream Systems Registration Master",
    "Downstream Systems Registration Master", "Payment Order Master", "Sheet Rate Master",
    "Correspondent Bank", "Branch Hierarchy Master",
]

# Optional per-master descriptions (placeholder masters otherwise get a generic one).
MASTER_DESCRIPTIONS = {
    "Branch Hierarchy Master": "Branch hierarchy — Main Branch with its Local Branches",
}


def _master_name(raw: str) -> str:
    return raw if raw.strip().lower().endswith("master") else f"{raw.strip()} Master"


def _placeholder_definition() -> dict:
    # Minimal placeholder columns — real columns/value-lists defined later in Screen Designer.
    return {
        "components": [
            {"component_type": "text_input", "field_binding": "code",
             "label_token": "LBL_CODE", "requirement_status": "MANDATORY"},
            {"component_type": "text_input", "field_binding": "description",
             "label_token": "LBL_DESCRIPTION", "requirement_status": "NON_MANDATORY"},
        ],
        "action_buttons": [],
        "value_list_groups": [],
    }


def run() -> int:
    db = SessionLocal()
    now = datetime.datetime.utcnow().isoformat()
    created = 0
    try:
        for raw in PAYMENTS_MASTERS:
            name = _master_name(raw)
            existing = db.query(models.ScreenTemplate).filter_by(screen_name=name).first()
            if existing:
                # Re-scope to Payments + ensure LIVE/MAINTENANCE (reuse, don't duplicate).
                changed = False
                if existing.application_package_id != PAYMENTS_PACKAGE_ID:
                    existing.application_package_id = PAYMENTS_PACKAGE_ID; changed = True
                if existing.screen_template_category != "MAINTENANCE":
                    existing.screen_template_category = "MAINTENANCE"; changed = True
                if existing.status != "LIVE":
                    existing.status = "LIVE"; changed = True
                db.commit()
                print(f"[reuse{'+rescope' if changed else ''}] {existing.screen_id}  {name}")
                continue
            screen = models.ScreenTemplate(
                screen_id=f"MSTR-{uuid.uuid4().hex[:10].upper()}",
                screen_name=name,
                description=MASTER_DESCRIPTIONS.get(name, f"Payments Master (placeholder) — {name}"),
                screen_template_category="MAINTENANCE",
                status="LIVE",
                application_package_id=PAYMENTS_PACKAGE_ID,
                definition=_placeholder_definition(),
                created_at=now,
                created_by="SYSTEM",
            )
            db.add(screen)
            db.commit()
            created += 1
            print(f"[created] {screen.screen_id}  {name}")
        return created
    finally:
        db.close()


if __name__ == "__main__":
    n = run()
    print(f"Done — {n} Payments master(s) created.")
