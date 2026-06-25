"""
configure_payments_masters.py — Configure Payments masters from the PM spec.

WHY THIS FILE EXISTS:
The Payments masters were seeded as placeholders ({code, description}). The PM
provided a field-level spec (docs/specs/Payments_Master.xlsx) defining the real
columns for 15 of them. This reads that spec and replaces each master's placeholder
definition with the real component set (type, mandatory, length, validations),
mapping the spec's abbreviated names to our master screen_names.

Idempotent: re-running rewrites the same definitions. Only configures masters present
in the spec; the rest keep their placeholder definition until specs arrive.

HOW TO RUN:
    python configure_payments_masters.py
"""
from __future__ import annotations

import re
import openpyxl

from database import SessionLocal
import models

SPEC_PATH = "docs/specs/Payments_Master.xlsx"

# Spec "Master Profile" -> our master screen_name (reconcile the abbreviations).
NAME_MAP = {
    "Currency Master": "Currency Master",
    "Country Master": "Country Master",
    "Holiday Calendar Master": "Holiday Calendar Master",
    "Bank Master": "Bank Master",
    "Branch Master": "Branch Master",
    "NCC Master": "National Clearing Codes Master",
    "Business Customer Account Number": "Customer Account Numbers Master",
    "Counterparty Master": "CounterParty Master",
    "Customer Master": "Customer Master",
    "MOP Master": "Method of Payment Master",
    "Payment Order Master": "Payment Order Master",
    "Mandate Management Master": "Mandate Management Master",
    "Bilateral Key Master": "Bilateral Key Master",
    "Membership Master": "Membership Master",
    "LOB Master": "Line of Business Master",
}


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", name.strip().lower()).strip("_")
    return s or "field"


def _component_type(dtype: str, mode: str) -> str:
    # Read both the data-type and the input-mode columns together.
    t = f"{dtype or ''} {mode or ''}".lower()
    if "date" in t or "calendar" in t:
        return "date_picker"
    if "bool" in t or "checkbox" in t:
        return "checkbox"
    if "drop" in t or "list" in t or "search" in t or "radio" in t:
        return "dropdown"
    # 'alphanumeric' contains 'numeric' — must NOT be treated as a number field.
    if "alphanumeric" not in t and any(k in t for k in ("numeric", "double", "decimal", "number")):
        return "number_input"
    return "text_input"


def _requirement(mo: str) -> str:
    v = (mo or "").lower()
    return "MANDATORY" if ("mand" in v) else "NON_MANDATORY"  # 'Co-Mand.' -> mandatory


def _build_definition(fields: list[dict]) -> dict:
    comps = []
    for f in fields:
        comps.append({
            "component_type": _component_type(f["dtype"], f["mode"]),
            "field_binding": _slug(f["name"]),
            "label_token": "LBL_" + _slug(f["name"]).upper(),
            "requirement_status": _requirement(f["mo"]),
            "properties": {
                "display_label": f["name"],
                "data_type": f["dtype"],
                "input_mode": f["mode"],
                "description": f["desc"],
            },
        })
    return {"components": comps, "action_buttons": [], "value_list_groups": []}


# Address Master was removed; address is folded into Branch & Customer masters
# (PM decision). Canonical address fields ensured on those masters after spec config.
ADDRESS_FIELDS = [
    ("address_line_1", "Address Line 1", "text_input"),
    ("address_line_2", "Address Line 2", "text_input"),
    ("city", "City", "text_input"),
    ("state_province", "State / Province", "text_input"),
    ("postal_code", "Postal Code", "text_input"),
    ("country", "Country", "dropdown"),
]
ADDRESS_TARGETS = ["Branch Master", "Customer Master"]


def _ensure_address(db) -> None:
    for name in ADDRESS_TARGETS:
        m = db.query(models.ScreenTemplate).filter_by(screen_name=name).first()
        if not m:
            continue
        defn = dict(m.definition or {})
        comps = list(defn.get("components", []))
        existing = {c.get("field_binding") for c in comps}
        for slug, label, ctype in ADDRESS_FIELDS:
            if slug in existing:
                continue
            comps.append({
                "component_type": ctype, "field_binding": slug,
                "label_token": "LBL_" + slug.upper(), "requirement_status": "NON_MANDATORY",
                "properties": {"display_label": label, "data_type": "Text",
                               "input_mode": "Drop-down" if ctype == "dropdown" else "Text Box",
                               "description": f"{label} (address)"},
            })
        defn["components"] = comps
        m.definition = defn
        db.commit()
        print(f"[address] ensured address fields on {name}")


def run() -> int:
    wb = openpyxl.load_workbook(SPEC_PATH, data_only=True)
    ws = wb["Sheet1"]
    by_profile: dict[str, list[dict]] = {}
    for r in list(ws.iter_rows(values_only=True))[1:]:
        cat, prof, fname, dtype, mo, mode, desc = (list(r) + [None] * 7)[:7]
        if not prof or not fname:
            continue
        by_profile.setdefault(str(prof).strip(), []).append({
            "name": str(fname).strip(), "dtype": str(dtype or "").strip(),
            "mo": str(mo or "").strip(), "mode": str(mode or "").strip(),
            "desc": str(desc or "").strip(),
        })

    db = SessionLocal()
    configured = 0
    try:
        for profile, fields in by_profile.items():
            screen_name = NAME_MAP.get(profile)
            if not screen_name:
                print(f"[gap] spec master '{profile}' has no mapping — skipped")
                continue
            m = db.query(models.ScreenTemplate).filter_by(screen_name=screen_name).first()
            if not m:
                print(f"[warn] master '{screen_name}' not found in DB — run seed first")
                continue
            m.definition = _build_definition(fields)
            db.commit()
            configured += 1
            print(f"[configured] {screen_name:38} <- {profile}  ({len(fields)} fields)")
        _ensure_address(db)
        return configured
    finally:
        db.close()


if __name__ == "__main__":
    n = run()
    print(f"Done — {n} master(s) configured from the spec.")
