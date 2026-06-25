"""
seed_masters.py — Seed the standard Masters for the Extended Field Registry.

WHY THIS FILE EXISTS (FIELD_REGISTRY_REQUIREMENTS.md §4/§5, Phase 5):
Every field must be anchored to a Master, and a Master here IS an existing
MAINTENANCE screen (banks won't move off that habit). This seeds the canonical
master set so fields have something real to point `master_ref` at:

  Reference masters (value-list)      : Currency, Country, Customer, Bank
  Attribute masters (classification)  : Amount, Date, Reference
  System masters (config/calc/derived): Configuration, Calculation Output, Derived Field

Each master is a LIVE MAINTENANCE ScreenTemplate. A few sample rows are seeded into
dynamic_master_records for Currency and Country so the reference masters aren't empty.

Scoping: created for one package (default Treasury System) — Q3/Q6 package-scoped;
global sharing/inheritance is a future feature. Idempotent by screen_name.

HOW TO RUN:
    python seed_masters.py
"""
from __future__ import annotations

import datetime
import uuid

from database import SessionLocal
import models

DEFAULT_PACKAGE_ID = "PKG-B3CFAF78"  # Treasury System (the active framework-build package)

# (screen_name, kind, [component field_bindings]) — kind drives which field_source(s)
# a master is the natural home for; components are the master's columns (minimal).
MASTERS = [
    ("Currency Master",           "REFERENCE",  ["ccy_code", "ccy_name", "symbol"]),
    ("Country Master",            "REFERENCE",  ["ctry_code", "ctry_name"]),
    ("Customer Master",           "REFERENCE",  ["customer_id", "customer_name"]),
    ("Bank Master",               "REFERENCE",  ["bic", "bank_name"]),
    ("Amount Master",             "ATTRIBUTE",  ["amount_attr"]),
    ("Date Master",               "ATTRIBUTE",  ["date_attr"]),
    ("Reference Master",          "ATTRIBUTE",  ["reference_attr"]),
    ("Configuration Master",      "SYSTEM",     ["config_key", "config_value"]),
    ("Calculation Output Master", "SYSTEM",     ["calc_token", "output_field"]),
    ("Derived Field Master",      "SYSTEM",     ["derived_token", "source_fields"]),
]

# A few sample records so the reference masters aren't empty (screen_name -> rows).
# Field bindings match the PM spec config (Currency/Country masters), so linked
# value-list dropdowns resolve their labels correctly.
SAMPLE_RECORDS = {
    "Currency Master": [
        {"currency": "USD", "currency_name": "US Dollar", "no_of_decimal_digits": "2"},
        {"currency": "EUR", "currency_name": "Euro", "no_of_decimal_digits": "2"},
        {"currency": "GBP", "currency_name": "Pound Sterling", "no_of_decimal_digits": "2"},
    ],
    "Country Master": [
        {"country_code": "US", "country_name": "United States", "currency": "USD"},
        {"country_code": "GB", "country_name": "United Kingdom", "currency": "GBP"},
        {"country_code": "DE", "country_name": "Germany", "currency": "EUR"},
    ],
}


def _definition(field_bindings: list[str]) -> dict:
    return {
        "components": [
            {
                "component_type": "text_input",
                "field_binding": fb,
                "label_token": "LBL_" + fb.upper(),
                "requirement_status": "MANDATORY" if i == 0 else "NON_MANDATORY",
            }
            for i, fb in enumerate(field_bindings)
        ],
        "action_buttons": [],
        "value_list_groups": [],
    }


def run() -> int:
    db = SessionLocal()
    now = datetime.datetime.utcnow().isoformat()
    created = 0
    try:
        for name, kind, fields in MASTERS:
            existing = db.query(models.ScreenTemplate).filter_by(screen_name=name).first()
            if existing:
                print(f"[skip] master '{name}' exists ({existing.screen_id})")
                screen = existing
            else:
                screen = models.ScreenTemplate(
                    screen_id=f"MSTR-{uuid.uuid4().hex[:10].upper()}",
                    screen_name=name,
                    description=f"{kind.title()} Master — {name}",
                    screen_template_category="MAINTENANCE",
                    status="LIVE",
                    application_package_id=DEFAULT_PACKAGE_ID,
                    definition=_definition(fields),
                    created_at=now,
                    created_by="SYSTEM",
                )
                db.add(screen)
                db.commit()
                created += 1
                print(f"[created] {screen.screen_id}  {name}  ({kind})")

            # Seed sample records for reference masters (idempotent: skip if any exist).
            rows = SAMPLE_RECORDS.get(name)
            if rows:
                have = db.query(models.DynamicMasterRecord).filter_by(screen_id=screen.screen_id).count()
                if have == 0:
                    for r in rows:
                        db.add(models.DynamicMasterRecord(
                            record_id=f"REC-{uuid.uuid4().hex[:10].upper()}",
                            screen_id=screen.screen_id,
                            record_data=r,
                            status="ACTIVE",
                            created_at=now,
                            created_by="SYSTEM",
                        ))
                    db.commit()
                    print(f"          + {len(rows)} sample record(s)")
        return created
    finally:
        db.close()


if __name__ == "__main__":
    n = run()
    print(f"Done — {n} master(s) created.")
