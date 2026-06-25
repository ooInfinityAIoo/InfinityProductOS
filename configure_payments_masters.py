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
import copy
import openpyxl
from sqlalchemy.orm.attributes import flag_modified

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


# IBAN/BBAN masters were removed (PM decision): they are account identifiers, so
# they live as fields on Customer Account Numbers Master. BBAN = localized account
# number (up to 30 alphanumeric); IBAN = its standardized international extension
# (up to 34 alphanumeric).
ACCOUNT_ID_FIELDS = [
    ("bban", "BBAN", "Alphanumeric (30)", "Basic Bank Account Number — localized account number + bank/branch code."),
    ("iban", "IBAN", "Alphanumeric (34)", "International Bank Account Number — standardized international extension of the BBAN."),
]


def _ensure_account_ids(db) -> None:
    m = db.query(models.ScreenTemplate).filter_by(screen_name="Customer Account Numbers Master").first()
    if not m:
        return
    defn = dict(m.definition or {})
    comps = list(defn.get("components", []))
    existing = {c.get("field_binding") for c in comps}
    for slug, label, dtype, desc in ACCOUNT_ID_FIELDS:
        if slug in existing:
            continue
        comps.append({
            "component_type": "text_input", "field_binding": slug,
            "label_token": "LBL_" + slug.upper(), "requirement_status": "NON_MANDATORY",
            "properties": {"display_label": label, "data_type": dtype,
                           "input_mode": "Text Box", "description": desc},
        })
    defn["components"] = comps
    m.definition = defn
    db.commit()
    print("[account-id] ensured BBAN + IBAN on Customer Account Numbers Master")


# Masters the PM defined inline (not in the Excel spec). Field tuples:
# (slug, label, component_type, data_type, M/O, description). Applied as a full
# definition (replace) so re-running keeps them in sync.
MANUAL_MASTER_DEFINITIONS = {
    # ── Execution tier (reference data) — Default Currency Correspondents +
    #    Settlement Accounts. ISO 20022: SttlmAcct, BICFI (ISO 9362), Ccy (ISO 4217).
    "Correspondent Bank Routing Master": [
        ("currency", "Currency", "dropdown", "Alphanumeric (3)", "Mandatory",
         "ISO 4217 currency routed via this correspondent (references Currency Master)."),
        ("default_correspondent", "Default Correspondent", "dropdown", "Text", "Mandatory",
         "Primary correspondent bank used to route this currency for Straight Through Processing (STP)."),
        ("bic", "Bank Identifier Code (BIC)", "text_input", "Alphanumeric (8/11)", "Mandatory",
         "ISO 9362 SWIFT BIC of the correspondent settlement account (ISO 20022 BICFI)."),
        ("nostro_vostro_indicator", "Nostro / Vostro Indicator", "dropdown", "Text", "Mandatory",
         "Settlement account ownership — Nostro (our account with them) or Vostro (their account with us)."),
        ("settlement_account_number", "Settlement Account Number", "text_input", "Alphanumeric (34)", "Mandatory",
         "Nostro/Vostro settlement account number (ISO 20022 SttlmAcct.Id). Bilateral payments fail if not maintained."),
    ],
    # ── Decision tier (rules) — Intelligent Routing: derives Method of Payment +
    #    next hop from conditions. ISO 20022: ClrSys/PmtTpInf, IntrmyAgt/CdtrAgt/DbtrAgt.
    "Intelligent Routing Rules Master": [
        # Conditions
        ("currency", "Currency", "dropdown", "Alphanumeric (3)", "Optional",
         "Condition — ISO 4217 currency of the payment (references Currency Master)."),
        ("destination_country", "Destination Country", "dropdown", "Alphanumeric (2)", "Optional",
         "Condition — ISO 3166 destination country (references Country Master)."),
        ("amount_from", "Amount From", "number_input", "Numeric", "Optional",
         "Condition — lower bound of the amount band this rule applies to."),
        ("amount_to", "Amount To", "number_input", "Numeric", "Optional",
         "Condition — upper bound of the amount band this rule applies to."),
        ("routing_preference", "Routing Preference", "dropdown", "Text", "Mandatory",
         "Condition — Cost-based | Time-Based | Optimal."),
        ("preference_scope", "Preference Scope", "dropdown", "Text", "Mandatory",
         "Condition — whether the preference is Customer-level or System-level."),
        ("next_party_role", "Next Party Role", "dropdown", "Text", "Mandatory",
         "Condition — next bank in the chain: Intermediary | Creditor | Debtor (ISO 20022 IntrmyAgt/CdtrAgt/DbtrAgt)."),
        ("priority", "Priority", "number_input", "Numeric", "Mandatory",
         "Rule evaluation order — lower number wins on a tie."),
        # Outcomes
        ("method_of_payment", "Method of Payment", "dropdown", "Text", "Mandatory",
         "Outcome — derived payment network/MOP, e.g. SWIFT, RTGS (references Method of Payment Master; ISO 20022 ClrSys/PmtTpInf)."),
        ("target_payment_system_id", "Target Payment System ID", "text_input", "Alphanumeric (35)", "Optional",
         "Outcome — target payment system / bank identifier the message is routed to."),
        ("effective_from", "Effective From", "date_picker", "Date", "Optional",
         "Outcome — date this routing rule becomes effective."),
        ("effective_to", "Effective To", "date_picker", "Date", "Optional",
         "Outcome — date this routing rule expires."),
    ],
}

# Masters whose rows are RULES (condition->outcome), not reference data. Tagged so the
# UI/resolver treat them as decision tables.
DECISION_TABLE_MASTERS = {"Intelligent Routing Rules Master"}


# Field → master value-list links: master -> { field_binding: (source_master, value_field, label_field) }.
# At runtime the dropdown sources its options live from the referenced master's records.
VALUE_SOURCES = {
    "Currency Master": {
        "currency_holiday_calendar": ("Holiday Calendar Master", "calendar_name", "calendar_name"),
    },
    "Country Master": {
        "currency": ("Currency Master", "currency", "currency_name"),
    },
    "Correspondent Bank Routing Master": {
        "currency": ("Currency Master", "currency", "currency_name"),
        "default_correspondent": ("Bank Master", "bank_name", "bank_name"),
    },
    "Intelligent Routing Rules Master": {
        "currency": ("Currency Master", "currency", "currency_name"),
        "destination_country": ("Country Master", "country_code", "country_name"),
        "method_of_payment": ("Method of Payment Master", "mop", "mop"),
    },
    "Membership Master": {
        "mop_media": ("Method of Payment Master", "mop", "mop"),
        "ncc_type": ("National Clearing Codes Master", "ncc_type", "ncc_type"),
    },
}


def _apply_value_sources(db) -> None:
    # Resolve each source master to its current screen_id and stamp value_source on
    # the linked dropdown component. Re-run after any reseed (screen_ids regenerate).
    name_to_id = {
        s.screen_name: s.screen_id
        for s in db.query(models.ScreenTemplate).filter_by(screen_template_category="MAINTENANCE").all()
    }
    for master_name, links in VALUE_SOURCES.items():
        m = db.query(models.ScreenTemplate).filter_by(screen_name=master_name).first()
        if not m:
            continue
        # Deep-copy so SQLAlchemy sees a brand-new object graph (in-place nested JSONB
        # edits aren't auto-detected; flag_modified forces the UPDATE regardless).
        defn = copy.deepcopy(dict(m.definition or {}))
        comps = defn.get("components", [])
        linked = 0
        for c in comps:
            link = links.get(c.get("field_binding"))
            if not link:
                continue
            src_name, value_field, label_field = link
            src_id = name_to_id.get(src_name)
            if not src_id:
                print(f"[warn] {master_name}.{c['field_binding']} -> source '{src_name}' not found")
                continue
            c.setdefault("properties", {})["value_source"] = {
                "master_screen_id": src_id, "master_name": src_name,
                "value_field": value_field, "label_field": label_field,
            }
            linked += 1
        defn["components"] = comps
        m.definition = defn
        flag_modified(m, "definition")
        db.commit()
        if linked:
            print(f"[value-source] linked {linked} field(s) on {master_name}")


def _apply_manual_definitions(db) -> None:
    for name, fields in MANUAL_MASTER_DEFINITIONS.items():
        m = db.query(models.ScreenTemplate).filter_by(screen_name=name).first()
        if not m:
            print(f"[warn] manual master '{name}' not found")
            continue
        comps = [{
            "component_type": ctype, "field_binding": slug,
            "label_token": "LBL_" + slug.upper(), "requirement_status": _requirement(mo),
            "properties": {"display_label": label, "data_type": dtype,
                           "input_mode": "Drop-down" if ctype == "dropdown" else "Text Box",
                           "description": desc},
        } for slug, label, ctype, dtype, mo, desc in fields]
        defn = {"components": comps, "action_buttons": [], "value_list_groups": []}
        if name in DECISION_TABLE_MASTERS:
            defn["master_type"] = "DECISION_TABLE"  # rows are rules, not reference data
        m.definition = defn
        db.commit()
        kind = "decision-table" if name in DECISION_TABLE_MASTERS else "reference"
        print(f"[manual] configured {name} ({len(comps)} fields, {kind})")


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
        _ensure_account_ids(db)
        _apply_manual_definitions(db)
        _apply_value_sources(db)  # must run last — needs all masters configured
        return configured
    finally:
        db.close()


if __name__ == "__main__":
    n = run()
    print(f"Done — {n} master(s) configured from the spec.")
