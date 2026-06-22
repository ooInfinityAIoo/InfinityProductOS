"""
WHY THIS FILE EXISTS:
137 workflow steps across 24 RTP/FedNow/SWIFT/SEPA/CHIPS/ACH workflow templates
were seeded with an action type (INVOKE_RULE / INVOKE_FORMULA / INVOKE_API) but no
target token — meaning those steps fire as no-ops at runtime.

This script wires each step to the most semantically appropriate artifact from the
platform's available rules, formulas, and APIs, based on node_title keyword matching.
The goal is every workflow produces a meaningful execution trace, not silent skips.

Run once:  python3 seed_wire_workflows.py
Idempotent — only updates steps that still have no target.
"""

import sqlite3, json

DB = "infinity_db.sqlite"

# ── Available artifacts (from the DB) ────────────────────────────────────────
# Rules
RULE_AML      = "BRE-XBDR-AML-HVT-V1"    # Amount threshold, high-value, NACHA totals
RULE_OFAC     = "BRE-XBDR-OFAC-SCRN-V1"  # OFAC / sanctions / signature / mandate checks
RULE_FX_STALE = "BRE-XBDR-FX-STALE-V1"   # FX freshness, time windows, date checks

# Formulas
FORMULA_FX    = "FX_CONVERTED_AMOUNT"      # FX enrichment / conversion / transformation
FORMULA_NET   = "NET_SETTLEMENT_AMOUNT"    # Balance / intraday / pre-funded / net settlement
FORMULA_FEE   = "CORRESPONDENT_FEE"        # Correspondent / fee / charge calculations

# APIs — using api_name so the dispatcher's name-fallback resolves them
API_SWIFT_GPI  = "SWIFT GPI Tracker — Submit Payment"
API_RTGS       = "Bank of England RTGS — Settlement Confirmation"
API_OFAC_SDN   = "OFAC SDN Screening API"
API_SWIFT_GPI2 = "SWIFT GPI Tracker"
API_FEDNOW     = "FedNow Real-Time Settlement"
API_WORLDCHECK = "Refinitiv World-Check Screening"
API_OPEN_FX    = "Open Exchange Rates Feed"
API_BOE_RTGS   = "Bank of England RTGS"


def pick_rule(node_title: str) -> str:
    t = node_title.lower()
    # OFAC / sanctions / screening / signature / mandate / rejection
    if any(x in t for x in ["ofac", "sanction", "screen", "signature",
                              "mandate", "return decision", "places hold",
                              "rejects", "detect high", "reject"]):
        return RULE_OFAC
    # Time/window/staleness checks
    if any(x in t for x in ["return window", "stale", "fx rate", "t+1"]):
        return RULE_FX_STALE
    # Everything else: AML / amount / format / enrichment / netting / balance
    return RULE_AML


def pick_formula(node_title: str) -> str:
    t = node_title.lower()
    if any(x in t for x in ["balance", "net", "ledger", "intraday",
                              "pre-funded", "settlement amount"]):
        return FORMULA_NET
    if any(x in t for x in ["fee", "correspondent", "charge"]):
        return FORMULA_FEE
    # FX enrichment / transform / build statement — default
    return FORMULA_FX


def pick_api(node_title: str, workflow_name: str) -> str:
    t  = node_title.lower()
    wf = workflow_name.lower()
    # OFAC / sanctions / world-check screening
    if any(x in t for x in ["ofac", "sanction", "world-check", "screening"]):
        return API_OFAC_SDN
    # FX / exchange rate feed
    if any(x in t for x in ["fx rate", "exchange rate", "open fx"]):
        return API_OPEN_FX
    # Statement / reporting delivery (camt.052 / camt.053)
    if any(x in t for x in ["statement", "camt.053", "camt.052", "report", "deliver camt"]):
        return API_RTGS
    # FedNow workflows
    if "fednow" in wf or "fednow" in t:
        return API_FEDNOW
    # RTP workflows → FedNow (closest US instant payment rail)
    if "rtp" in wf:
        return API_FEDNOW
    # SWIFT workflows
    if "swift" in wf or "swift" in t:
        return API_SWIFT_GPI
    # SEPA / CHIPS / ACH → SWIFT GPI as placeholder
    return API_SWIFT_GPI


# ── Main wiring loop ──────────────────────────────────────────────────────────

NEEDS_TARGET = {"INVOKE_RULE", "INVOKE_FORMULA", "INVOKE_API",
                "INVOKE_CALCULATION", "BUSINESS_RULE", "CALCULATION", "API_CALL"}

conn = sqlite3.connect(DB)
cur  = conn.cursor()

# Load all workflow names for context-aware API selection
cur.execute("SELECT workflow_id, workflow_name FROM workflow_configurations")
wf_names = {row[0]: row[1] for row in cur.fetchall()}

cur.execute("SELECT node_id, workflow_id, node_title, orchestration_steps FROM workflow_nodes")
nodes = cur.fetchall()

total_wired = 0
total_skipped = 0

for node_id, workflow_id, node_title, steps_json in nodes:
    steps = json.loads(steps_json) if steps_json else []
    changed = False

    for idx, step in enumerate(steps):
        action = step.get("action") or step.get("step_type", "")
        if action not in NEEDS_TARGET:
            continue

        # Already wired — skip
        already = (step.get("target_token") or step.get("rule_token") or
                   step.get("formula_token") or step.get("api_id") or
                   step.get("api_name"))
        if already:
            total_skipped += 1
            continue

        wf_name = wf_names.get(workflow_id, "")

        if action in ("INVOKE_RULE", "BUSINESS_RULE"):
            step["rule_token"] = pick_rule(node_title)
            total_wired += 1
            changed = True
        elif action in ("INVOKE_FORMULA", "CALCULATION"):
            step["formula_token"] = pick_formula(node_title)
            total_wired += 1
            changed = True
        elif action in ("INVOKE_API", "API_CALL"):
            step["api_name"] = pick_api(node_title, wf_name)
            total_wired += 1
            changed = True

    if changed:
        cur.execute(
            "UPDATE workflow_nodes SET orchestration_steps=? WHERE node_id=?",
            (json.dumps(steps), node_id),
        )
        print(f"  ✓ Wired node: {node_id} ({node_title})")

conn.commit()
conn.close()

print(f"\n✅ Done — {total_wired} steps wired, {total_skipped} already had targets.")
print("Run the wiring audit API to verify: GET /api/v1/workflows/wiring-audit")
