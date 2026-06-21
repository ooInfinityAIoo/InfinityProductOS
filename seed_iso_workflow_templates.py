# WHY THIS FILE EXISTS:
# Seeds the Workflow Designer with scenario-based ISO 20022 workflow templates.
#
# ARCHITECTURE PRINCIPLE (critical):
# A template = one complete BUSINESS SCENARIO, not one ISO message type.
# Each NODE in the workflow = one ISO 20022 message event (send/receive/process).
# The edge chain = the message choreography between parties.
#
# Example: "RTP Credit Transfer — Happy Path" has nodes for:
#   pain.001 receive → pacs.008 send (to RTP) → pacs.008 route → pacs.002 receive → pacs.002 return
#   ...not five separate templates.
#
# WHY THIS MATTERS:
# Banks configure the FULL TRANSACTION LIFECYCLE in one canvas view.
# They see exactly which parties exchange which messages in which sequence.
# Templates give a correct starting point; the Workflow Designer lets them
# add/remove nodes, rewire edges, add business rules, calculations, approvals.
# Modularity is PRESERVED — templates just pre-populate the canvas.
#
# HOW TO RUN (after seed.py + seed_pkg.py):
#   python3 seed_iso_workflow_templates.py
#
# WHAT BREAKS IF REMOVED: Template picker shows no starting points.
# Users must build every scenario from scratch including the message sequence logic.

import uuid
import datetime
from database import SessionLocal, engine, Base
import models

Base.metadata.create_all(bind=engine)


def _migrate_columns():
    """
    Add new columns to existing tables if they don't yet exist.
    SQLite does not support ADD COLUMN IF NOT EXISTS — we check manually.
    """
    from sqlalchemy import text, inspect as sa_inspect
    with engine.connect() as conn:
        inspector = sa_inspect(engine)

        wf_cols = {c['name'] for c in inspector.get_columns('workflow_configurations')}
        for col_def, col_name in [
            ("is_template BOOLEAN NOT NULL DEFAULT 0", "is_template"),
            ("message_type VARCHAR",                   "message_type"),
            ("clearing_network VARCHAR",               "clearing_network"),
            ("template_category VARCHAR",              "template_category"),
        ]:
            if col_name not in wf_cols:
                conn.execute(text(f"ALTER TABLE workflow_configurations ADD COLUMN {col_def}"))
                print(f"  ↳ workflow_configurations: added {col_name}")

        node_cols = {c['name'] for c in inspector.get_columns('workflow_nodes')}
        for col_def, col_name in [
            ("iso_message_type VARCHAR",  "iso_message_type"),
            ("message_direction VARCHAR", "message_direction"),
            ("party_from VARCHAR",        "party_from"),
            ("party_to VARCHAR",          "party_to"),
            # WS-15c Universal Taxonomy: node-level type (RECEIVE, DECISION, COMPLIANCE_SCREEN…)
            ("node_type VARCHAR",         "node_type"),
            # WS-15c Structured SLA: replaces sla_days integer with typed config object
            ("sla_config JSON",           "sla_config"),
        ]:
            if col_name not in node_cols:
                conn.execute(text(f"ALTER TABLE workflow_nodes ADD COLUMN {col_def}"))
                print(f"  ↳ workflow_nodes: added {col_name}")

        conn.commit()


# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO TEMPLATE CATALOGUE
#
# Each entry is one complete business transaction scenario.
# "nodes" list: each dict = one ISO message event in the sequence.
#   title        – node card label (verb + message context)
#   msg          – ISO 20022 message ID
#   dir          – SEND | RECEIVE | PROCESS | BRANCH | APPROVE | VALIDATE
#   frm          – party sending the message
#   to           – party receiving the message
#   step_type    – maps to existing Workflow Engine step_type enum
#
# Parties used: Debtor Customer, Debtor FI, RTP, Creditor FI, SWIFT Network,
#               Correspondent Bank, SEPA Clearing, Originator, Beneficiary FI
# ─────────────────────────────────────────────────────────────────────────────

SCENARIOS = [

    # ══════════════════════════════════════════════════════════════════════════
    # RTP (The Clearing House) — ISO 20022
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "RTP — Credit Transfer (Happy Path)",
        "clearing_network": "RTP",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "Complete RTP credit transfer — the standard happy path. "
            "Debtor FI sends pacs.008 to TCH RTP, RTP forwards to Creditor FI, "
            "Creditor FI credits the beneficiary account and returns pacs.002 ACCP. "
            "RTP relays pacs.002 back to Debtor FI. Settlement is final within seconds."
        ),
        "nodes": [
            {"title": "Receive Credit Transfer Instruction",      "msg": "pain.001.001.12", "dir": "RECEIVE",  "frm": "Debtor Customer",  "to": "Debtor FI",    "step": "TRIGGER"},
            {"title": "Validate & Enrich Payment",               "msg": None,              "dir": "PROCESS",  "frm": "Debtor FI",        "to": "Debtor FI",    "step": "BUSINESS_RULE"},
            {"title": "Send pacs.008 Credit Transfer → RTP",     "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "Debtor FI",        "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Validates & Routes pacs.008",         "msg": "pacs.008.001.08", "dir": "PROCESS",  "frm": "RTP",              "to": "Creditor FI",  "step": "BUSINESS_RULE"},
            {"title": "Receive pacs.008 Credit Transfer",        "msg": "pacs.008.001.08", "dir": "RECEIVE",  "frm": "RTP",              "to": "Creditor FI",  "step": "TRIGGER"},
            {"title": "Credit Beneficiary Account",              "msg": None,              "dir": "PROCESS",  "frm": "Creditor FI",      "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "Return pacs.002 ACCP → RTP",             "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "Creditor FI",      "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Relays pacs.002 → Debtor FI",        "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "RTP",              "to": "Debtor FI",    "step": "API_CALL"},
            {"title": "Receive pacs.002 Confirmation",           "msg": "pacs.002.001.10", "dir": "RECEIVE",  "frm": "RTP",              "to": "Debtor FI",    "step": "EVENT"},
            {"title": "Notify Debtor Customer — Payment Sent",   "msg": None,              "dir": "PROCESS",  "frm": "Debtor FI",        "to": "Debtor Customer","step": "EVENT"},
        ],
    },

    {
        "name": "RTP — Signature Validation Error (Creditor FI Reject)",
        "clearing_network": "RTP",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "RTP error path: Creditor FI rejects pacs.008 due to signature validation failure. "
            "Creditor FI sends pacs.002 RJCT back to RTP. RTP detects the error, issues admi.002 "
            "with reject code 690, and initiates camt.056 Payment Cancellation Request to Creditor FI. "
            "Final pacs.002 RJCT is relayed to Debtor FI — full rollback."
        ),
        "nodes": [
            {"title": "Receive Credit Transfer Instruction",      "msg": "pain.001.001.12", "dir": "RECEIVE",  "frm": "Debtor Customer",  "to": "Debtor FI",    "step": "TRIGGER"},
            {"title": "Send pacs.008 Credit Transfer → RTP",     "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "Debtor FI",        "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Routes pacs.008 → Creditor FI",      "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "RTP",              "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "Signature Validation Fails at Creditor FI","msg": None,             "dir": "VALIDATE", "frm": "Creditor FI",      "to": "Creditor FI",  "step": "BUSINESS_RULE"},
            {"title": "Creditor FI Returns pacs.002 RJCT → RTP", "msg": "pacs.002.001.10", "dir": "SEND",    "frm": "Creditor FI",      "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Detects Reject — admi.002 (Code 690)","msg": "admi.002.001.01", "dir": "PROCESS",  "frm": "RTP",              "to": "Debtor FI",    "step": "EVENT"},
            {"title": "RTP Sends camt.056 Cancellation → Creditor FI","msg": "camt.056.001.10","dir": "SEND", "frm": "RTP",              "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "RTP Relays pacs.002 RJCT → Debtor FI",   "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "RTP",              "to": "Debtor FI",    "step": "API_CALL"},
            {"title": "Return Reject to Debtor Customer",        "msg": None,              "dir": "PROCESS",  "frm": "Debtor FI",        "to": "Debtor Customer","step": "EVENT"},
        ],
    },

    {
        "name": "RTP — Credit Transfer with Remittance Advice (remt.001)",
        "clearing_network": "RTP",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "RTP happy path extended with optional remt.001 Remittance Advice. "
            "Used for B2B payments where the creditor needs structured invoice/remittance data "
            "alongside the payment. remt.001 flows in parallel with pacs.008 and requires "
            "its own pacs.002 acknowledgement from the Creditor FI."
        ),
        "nodes": [
            {"title": "Receive Payment + Remittance Instruction", "msg": "pain.001.001.12", "dir": "RECEIVE",  "frm": "Debtor Customer",  "to": "Debtor FI",    "step": "TRIGGER"},
            {"title": "Send pacs.008 Credit Transfer → RTP",     "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "Debtor FI",        "to": "RTP",          "step": "API_CALL"},
            {"title": "Send remt.001 Remittance Advice → RTP",   "msg": "remt.001.001.05", "dir": "SEND",     "frm": "Debtor FI",        "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Routes pacs.008 → Creditor FI",      "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "RTP",              "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "RTP Routes remt.001 → Creditor FI",      "msg": "remt.001.001.05", "dir": "SEND",     "frm": "RTP",              "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "Creditor FI Credits + Links Remittance",  "msg": None,              "dir": "PROCESS",  "frm": "Creditor FI",      "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "pacs.002 ACCP for Payment → RTP",        "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "Creditor FI",      "to": "RTP",          "step": "API_CALL"},
            {"title": "pacs.002 ACCP for remt.001 → RTP",       "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "Creditor FI",      "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Relays Both pacs.002 → Debtor FI",   "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "RTP",              "to": "Debtor FI",    "step": "API_CALL"},
        ],
    },

    {
        "name": "RTP — Payment Acknowledgement by Receiver (camt.035)",
        "clearing_network": "RTP",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "Optional RTP flow where the Creditor FI explicitly acknowledges receipt "
            "of funds to the Payer's FI using camt.035 Payment Acknowledgement by Receiver. "
            "Used when the payer requires proof-of-credit confirmation beyond the standard pacs.002."
        ),
        "nodes": [
            {"title": "Send pacs.008 Credit Transfer → RTP",     "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "Debtor FI",        "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Routes pacs.008 → Creditor FI",      "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "RTP",              "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "Creditor FI Credits Beneficiary",         "msg": None,              "dir": "PROCESS",  "frm": "Creditor FI",      "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "Return pacs.002 ACCP → RTP",             "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "Creditor FI",      "to": "RTP",          "step": "API_CALL"},
            {"title": "Send camt.035 Payment Acknowledgement → RTP","msg": "camt.035.001.06","dir": "SEND",   "frm": "Creditor FI",      "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Routes camt.035 → Debtor FI",        "msg": "camt.035.001.06", "dir": "SEND",     "frm": "RTP",              "to": "Debtor FI",    "step": "API_CALL"},
            {"title": "RTP Returns pacs.002 ACCP for camt.035", "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "RTP",              "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "Debtor FI Receives Proof-of-Credit",      "msg": "camt.035.001.06", "dir": "RECEIVE",  "frm": "RTP",              "to": "Debtor FI",    "step": "EVENT"},
        ],
    },

    {
        "name": "RTP — Request for Payment (pain.013 → pain.014 → pacs.008)",
        "clearing_network": "RTP",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": (
            "End-to-end RTP Request for Payment flow (e-invoice / bill pay). "
            "Creditor FI initiates pain.013 RfP to Debtor FI via RTP. "
            "Debtor FI responds with pain.014 (accept), then auto-initiates pacs.008 "
            "credit transfer to settle. Rejected RfPs terminate without a payment."
        ),
        "nodes": [
            {"title": "Creditor Initiates pain.013 Request for Payment","msg": "pain.013.001.09","dir": "SEND","frm": "Creditor FI","to": "RTP","step": "TRIGGER"},
            {"title": "RTP Routes pain.013 → Debtor FI",         "msg": "pain.013.001.09", "dir": "SEND",     "frm": "RTP",              "to": "Debtor FI",    "step": "API_CALL"},
            {"title": "Debtor FI Reviews RfP — Accept/Reject",   "msg": None,              "dir": "BRANCH",   "frm": "Debtor FI",        "to": "Debtor FI",    "step": "APPROVAL"},
            {"title": "Send pain.014 Accept → RTP",              "msg": "pain.014.001.09", "dir": "SEND",     "frm": "Debtor FI",        "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Routes pain.014 → Creditor FI",      "msg": "pain.014.001.09", "dir": "SEND",     "frm": "RTP",              "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "Auto-Initiate pacs.008 Credit Transfer",  "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "Debtor FI",        "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Routes pacs.008 → Creditor FI",      "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "RTP",              "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "Creditor FI Credits & Returns pacs.002",  "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "Creditor FI",      "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Relays pacs.002 → Debtor FI",        "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "RTP",              "to": "Debtor FI",    "step": "API_CALL"},
        ],
    },

    {
        "name": "RTP — Payment Return (pacs.004)",
        "clearing_network": "RTP",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "RTP payment return initiated by Creditor FI within the allowable return window. "
            "Creditor FI sends pacs.004 to RTP; RTP credits back the Debtor FI; "
            "original transaction is reversed in the settlement ledger."
        ),
        "nodes": [
            {"title": "Creditor FI Initiates Return Decision",   "msg": None,              "dir": "PROCESS",  "frm": "Creditor FI",      "to": "Creditor FI",  "step": "BUSINESS_RULE"},
            {"title": "Send pacs.004 Payment Return → RTP",     "msg": "pacs.004.001.10", "dir": "SEND",     "frm": "Creditor FI",      "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Validates Return Window & Reason",    "msg": None,              "dir": "VALIDATE", "frm": "RTP",              "to": "RTP",          "step": "BUSINESS_RULE"},
            {"title": "RTP Credits Debtor FI — Reversal Posted", "msg": None,              "dir": "PROCESS",  "frm": "RTP",              "to": "Debtor FI",    "step": "API_CALL"},
            {"title": "pacs.002 ACCP for Return → Creditor FI", "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "RTP",              "to": "Creditor FI",  "step": "API_CALL"},
            {"title": "Notify Debtor FI — Funds Returned",       "msg": None,              "dir": "PROCESS",  "frm": "Debtor FI",        "to": "Debtor Customer","step": "EVENT"},
        ],
    },

    {
        "name": "RTP — via TPSP (Third-Party Service Provider) pacs.008",
        "clearing_network": "RTP",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "RTP credit transfer where Creditor FI is connected via a TPSP (Third-Party "
            "Service Provider / processor). Routing passes through TPSP (Member ID 111111111A1) "
            "which distributes to multiple downstream Participants (Participant 2, Participant 3). "
            "BAH From/To reflects TPSP IDs per TCH Member ID spec Figure 2."
        ),
        "nodes": [
            {"title": "Participant 1 Sends pacs.008 → RTP",     "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "Participant 1 (000000001PT)", "to": "RTP (990000001S1)",   "step": "API_CALL"},
            {"title": "RTP Routes pacs.008 → TPSP",             "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "RTP (990000001S1)",  "to": "TPSP 1 (111111111A1)",        "step": "API_CALL"},
            {"title": "TPSP Distributes to Downstream Participants","msg": "pacs.008.001.08","dir": "SEND",   "frm": "TPSP 1 (111111111A1)","to": "Participant 2 / Participant 3","step": "API_CALL"},
            {"title": "Participants Credit Beneficiary Accounts","msg": None,              "dir": "PROCESS",  "frm": "Participant 2",      "to": "Creditor Customer",            "step": "API_CALL"},
            {"title": "TPSP Aggregates pacs.002 ACCP → RTP",   "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "TPSP 1 (111111111A1)","to": "RTP (990000001S1)",           "step": "API_CALL"},
            {"title": "RTP Returns pacs.002 → Participant 1",   "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "RTP (990000001S1)",  "to": "Participant 1 (000000001PT)", "step": "API_CALL"},
        ],
    },

    {
        "name": "RTP — Request for Information (camt.026)",
        "clearing_network": "RTP",
        "category": "CASH_MANAGEMENT",
        "domain": "PAYMENTS",
        "description": (
            "Optional RTP flow initiated when the Payee's FI needs additional information "
            "about a received pacs.008 payment before crediting the beneficiary. "
            "camt.026 flows from Creditor FI → RTP → Debtor FI. "
            "Debtor FI responds; Creditor FI releases the credit."
        ),
        "nodes": [
            {"title": "Receive pacs.008 — Hold Pending Info",    "msg": "pacs.008.001.08", "dir": "RECEIVE",  "frm": "RTP",              "to": "Creditor FI",  "step": "TRIGGER"},
            {"title": "Send camt.026 Request for Info → RTP",    "msg": "camt.026.001.09", "dir": "SEND",     "frm": "Creditor FI",      "to": "RTP",          "step": "API_CALL"},
            {"title": "RTP Routes camt.026 → Debtor FI",        "msg": "camt.026.001.09", "dir": "SEND",     "frm": "RTP",              "to": "Debtor FI",    "step": "API_CALL"},
            {"title": "pacs.002 ACCP for camt.026 Receipt",     "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "Debtor FI",        "to": "RTP",          "step": "API_CALL"},
            {"title": "Debtor FI Provides Info Response",        "msg": None,              "dir": "PROCESS",  "frm": "Debtor FI",        "to": "RTP",          "step": "API_CALL"},
            {"title": "Creditor FI Receives Info & Credits",     "msg": None,              "dir": "PROCESS",  "frm": "Creditor FI",      "to": "Creditor Customer","step": "API_CALL"},
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # SWIFT ISO 20022 — Cross-Border Payments
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "SWIFT — Cross-Border Credit Transfer (pacs.008 Direct)",
        "clearing_network": "SWIFT",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "Standard SWIFT ISO 20022 cross-border credit transfer — direct method. "
            "Originating FI sends pacs.008 directly to Beneficiary FI via the SWIFT network. "
            "Used when Originator maintains a bilateral correspondent relationship. "
            "Replaces MT103 in the ISO 20022 migration."
        ),
        "nodes": [
            {"title": "Receive Customer Credit Transfer Instruction","msg": "pain.001.001.12","dir": "RECEIVE","frm": "Corporate / Customer","to": "Originating FI","step": "TRIGGER"},
            {"title": "AML / Sanctions Screening",               "msg": None,              "dir": "VALIDATE", "frm": "Originating FI",   "to": "Originating FI","step": "BUSINESS_RULE"},
            {"title": "FX Rate Enrichment",                      "msg": None,              "dir": "PROCESS",  "frm": "Originating FI",   "to": "Originating FI","step": "CALCULATION"},
            {"title": "4-Eye Approval (High Value / AML)",       "msg": None,              "dir": "APPROVE",  "frm": "Originating FI",   "to": "Originating FI","step": "APPROVAL"},
            {"title": "Send pacs.008 → Beneficiary FI (SWIFT)",  "msg": "pacs.008.001.10", "dir": "SEND",     "frm": "Originating FI",   "to": "Beneficiary FI","step": "API_CALL"},
            {"title": "Beneficiary FI Credits Account",          "msg": None,              "dir": "PROCESS",  "frm": "Beneficiary FI",   "to": "Beneficiary Customer","step": "API_CALL"},
            {"title": "Receive pacs.002 Confirmation",           "msg": "pacs.002.001.12", "dir": "RECEIVE",  "frm": "Beneficiary FI",   "to": "Originating FI","step": "EVENT"},
            {"title": "Return pain.002 Status to Corporate",     "msg": "pain.002.001.14", "dir": "SEND",     "frm": "Originating FI",   "to": "Corporate / Customer","step": "API_CALL"},
        ],
    },

    {
        "name": "SWIFT — Cross-Border Cover Method (pacs.008 + pacs.009)",
        "clearing_network": "SWIFT",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "SWIFT cover method: two parallel flows. pacs.008 carries payment instructions "
            "direct to Beneficiary FI. Separately, pacs.009 cover payment moves funds via "
            "a Correspondent Bank to pre-fund the nostro. Beneficiary FI releases credit "
            "once both pacs.008 and cover settlement are confirmed."
        ),
        "nodes": [
            {"title": "Receive Payment Instruction",             "msg": "pain.001.001.12", "dir": "RECEIVE",  "frm": "Corporate",        "to": "Originating FI","step": "TRIGGER"},
            {"title": "AML / Sanctions Screen",                  "msg": None,              "dir": "VALIDATE", "frm": "Originating FI",   "to": "Originating FI","step": "BUSINESS_RULE"},
            {"title": "Send pacs.008 Instructions → Beneficiary FI","msg": "pacs.008.001.10","dir": "SEND",   "frm": "Originating FI",   "to": "Beneficiary FI","step": "API_CALL"},
            {"title": "Send pacs.009 Cover → Correspondent Bank","msg": "pacs.009.001.09", "dir": "SEND",     "frm": "Originating FI",   "to": "Correspondent Bank","step": "API_CALL"},
            {"title": "Correspondent Bank Settles Nostro",       "msg": None,              "dir": "PROCESS",  "frm": "Correspondent Bank","to": "Beneficiary FI","step": "API_CALL"},
            {"title": "Beneficiary FI Confirms Cover Receipt",   "msg": "pacs.002.001.12", "dir": "SEND",     "frm": "Correspondent Bank","to": "Originating FI","step": "API_CALL"},
            {"title": "Beneficiary FI Credits Account",          "msg": None,              "dir": "PROCESS",  "frm": "Beneficiary FI",   "to": "Beneficiary Customer","step": "API_CALL"},
            {"title": "Return pacs.002 ACCP → Originating FI",  "msg": "pacs.002.001.12", "dir": "SEND",     "frm": "Beneficiary FI",   "to": "Originating FI","step": "API_CALL"},
        ],
    },

    {
        "name": "SWIFT — Payment Recall (camt.056 → camt.029)",
        "clearing_network": "SWIFT",
        "category": "CASH_MANAGEMENT",
        "domain": "PAYMENTS",
        "description": (
            "SWIFT ISO 20022 payment recall lifecycle. Originating FI sends camt.056 "
            "to recall a settled pacs.008. Beneficiary FI investigates, places a hold, "
            "and responds with camt.029 Resolution of Investigation — either confirmed "
            "return (pacs.004) or rejection with reason code."
        ),
        "nodes": [
            {"title": "Trigger Recall Request (STP or Manual)",  "msg": None,              "dir": "PROCESS",  "frm": "Originating FI",   "to": "Originating FI","step": "TRIGGER"},
            {"title": "Send camt.056 Cancellation → SWIFT",     "msg": "camt.056.001.10", "dir": "SEND",     "frm": "Originating FI",   "to": "Beneficiary FI","step": "API_CALL"},
            {"title": "Beneficiary FI Places Funds Hold",        "msg": None,              "dir": "PROCESS",  "frm": "Beneficiary FI",   "to": "Beneficiary FI","step": "BUSINESS_RULE"},
            {"title": "Compliance / Legal Review at Beneficiary","msg": None,              "dir": "APPROVE",  "frm": "Beneficiary FI",   "to": "Beneficiary FI","step": "APPROVAL"},
            {"title": "Initiate pacs.004 Return (if approved)",  "msg": "pacs.004.001.11", "dir": "SEND",     "frm": "Beneficiary FI",   "to": "Originating FI","step": "API_CALL"},
            {"title": "Send camt.029 Resolution → Originating FI","msg": "camt.029.001.13","dir": "SEND",    "frm": "Beneficiary FI",   "to": "Originating FI","step": "API_CALL"},
            {"title": "Originating FI Receives Return Funds",    "msg": None,              "dir": "PROCESS",  "frm": "Originating FI",   "to": "Originating FI","step": "EVENT"},
        ],
    },

    {
        "name": "SWIFT — EOD Statement (camt.053) Delivery",
        "clearing_network": "SWIFT",
        "category": "CASH_MANAGEMENT",
        "domain": "CASH_MANAGEMENT",
        "description": (
            "End-of-day bank statement delivery (MT940 replacement). "
            "Bank builds camt.053 from the closed intraday ledger, applies digital signature, "
            "and delivers to corporate customers via SWIFT FileAct or SFTP. "
            "Archived to immutable evidence ledger for regulatory reporting."
        ),
        "nodes": [
            {"title": "EOD Batch Window Opens",                  "msg": None,              "dir": "PROCESS",  "frm": "Bank",             "to": "Bank",         "step": "TRIGGER"},
            {"title": "Close Intraday Ledger — Compute Balances","msg": None,              "dir": "PROCESS",  "frm": "Bank",             "to": "Bank",         "step": "CALCULATION"},
            {"title": "Build camt.053 Statement",                "msg": "camt.053.001.11", "dir": "PROCESS",  "frm": "Bank",             "to": "Bank",         "step": "CALCULATION"},
            {"title": "Apply Digital Signature",                 "msg": None,              "dir": "VALIDATE", "frm": "Bank",             "to": "Bank",         "step": "BUSINESS_RULE"},
            {"title": "Deliver camt.053 → Customer (SWIFT / SFTP)","msg": "camt.053.001.11","dir": "SEND",   "frm": "Bank",             "to": "Corporate Customer","step": "API_CALL"},
            {"title": "Archive to Evidence Ledger",              "msg": None,              "dir": "PROCESS",  "frm": "Bank",             "to": "Audit Store",  "step": "EVENT"},
        ],
    },

    {
        "name": "SWIFT — Intraday Liquidity Report (camt.052 + camt.054)",
        "clearing_network": "SWIFT",
        "category": "CASH_MANAGEMENT",
        "domain": "CASH_MANAGEMENT",
        "description": (
            "Real-time liquidity monitoring flow. camt.052 intraday report is pushed "
            "at configurable intervals. Significant single entries trigger an immediate "
            "camt.054 debit/credit notification (MT900/MT910 replacement). "
            "Gives treasury teams live visibility without waiting for EOD."
        ),
        "nodes": [
            {"title": "Intraday Reporting Interval Trigger",     "msg": None,              "dir": "PROCESS",  "frm": "Bank",             "to": "Bank",         "step": "TRIGGER"},
            {"title": "Query Intraday Movements",                "msg": None,              "dir": "PROCESS",  "frm": "Bank",             "to": "Bank",         "step": "API_CALL"},
            {"title": "Build & Deliver camt.052 Report",         "msg": "camt.052.001.12", "dir": "SEND",     "frm": "Bank",             "to": "Corporate Treasury","step": "API_CALL"},
            {"title": "Detect High-Value Entry",                 "msg": None,              "dir": "BRANCH",   "frm": "Bank",             "to": "Bank",         "step": "BUSINESS_RULE"},
            {"title": "Build camt.054 Entry Notification",       "msg": "camt.054.001.11", "dir": "SEND",     "frm": "Bank",             "to": "Corporate Treasury","step": "API_CALL"},
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # FedNow — Federal Reserve Real-Time Payments
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "FedNow — Instant Credit Transfer (Happy Path)",
        "clearing_network": "FEDNOW",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "FedNow Service instant credit transfer — standard happy path. "
            "20-second settlement window. Sending FI submits pacs.008; FedNow Hub "
            "returns admi.002 ACK, routes to Receiving FI, Receiving FI credits "
            "beneficiary and returns pacs.002 ACCP. FedNow posts to Master Accounts."
        ),
        "nodes": [
            {"title": "Receive Payment Instruction from Customer","msg": "pain.001.001.12", "dir": "RECEIVE",  "frm": "Customer",         "to": "Sending FI",   "step": "TRIGGER"},
            {"title": "Validate ISO Fields + Funds Availability", "msg": None,              "dir": "VALIDATE", "frm": "Sending FI",       "to": "Sending FI",   "step": "BUSINESS_RULE"},
            {"title": "Send pacs.008 → FedNow Hub",              "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "Sending FI",       "to": "FedNow Hub",   "step": "API_CALL"},
            {"title": "Receive admi.002 ACK — Settlement Clock Starts","msg": "admi.002.001.01","dir": "RECEIVE","frm": "FedNow Hub",    "to": "Sending FI",   "step": "EVENT"},
            {"title": "FedNow Routes pacs.008 → Receiving FI",  "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "FedNow Hub",       "to": "Receiving FI", "step": "API_CALL"},
            {"title": "Receiving FI Credits Beneficiary Account","msg": None,              "dir": "PROCESS",  "frm": "Receiving FI",     "to": "Beneficiary",  "step": "API_CALL"},
            {"title": "Receiving FI Returns pacs.002 ACCP",      "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "Receiving FI",     "to": "FedNow Hub",   "step": "API_CALL"},
            {"title": "FedNow Posts to Master Accounts",          "msg": None,              "dir": "PROCESS",  "frm": "FedNow Hub",       "to": "Fed Reserve",  "step": "API_CALL"},
            {"title": "FedNow Relays pacs.002 → Sending FI",    "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "FedNow Hub",       "to": "Sending FI",   "step": "API_CALL"},
            {"title": "Notify Customer — Payment Complete",       "msg": None,              "dir": "PROCESS",  "frm": "Sending FI",       "to": "Customer",     "step": "EVENT"},
        ],
    },

    {
        "name": "FedNow — Reject Path (pacs.002 RJCT + admi.002)",
        "clearing_network": "FEDNOW",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "FedNow reject path: Receiving FI rejects pacs.008 (e.g., account closed, "
            "invalid beneficiary). Receiving FI sends pacs.002 RJCT; FedNow returns admi.002 "
            "with error details to Sending FI; Sending FI reverses the debit and notifies customer."
        ),
        "nodes": [
            {"title": "Send pacs.008 → FedNow Hub",              "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "Sending FI",       "to": "FedNow Hub",   "step": "API_CALL"},
            {"title": "FedNow Routes pacs.008 → Receiving FI",  "msg": "pacs.008.001.08", "dir": "SEND",     "frm": "FedNow Hub",       "to": "Receiving FI", "step": "API_CALL"},
            {"title": "Receiving FI Rejects — pacs.002 RJCT",   "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "Receiving FI",     "to": "FedNow Hub",   "step": "BUSINESS_RULE"},
            {"title": "FedNow Sends admi.002 Error → Sending FI","msg": "admi.002.001.01", "dir": "SEND",     "frm": "FedNow Hub",       "to": "Sending FI",   "step": "EVENT"},
            {"title": "Sending FI Reverses Debit",               "msg": None,              "dir": "PROCESS",  "frm": "Sending FI",       "to": "Sending FI",   "step": "API_CALL"},
            {"title": "Notify Customer — Payment Rejected",       "msg": None,              "dir": "PROCESS",  "frm": "Sending FI",       "to": "Customer",     "step": "EVENT"},
        ],
    },

    {
        "name": "FedNow — Payment Return (pacs.004)",
        "clearing_network": "FEDNOW",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "FedNow return of a previously settled instant payment. Receiving FI "
            "initiates pacs.004 within the allowable return window. FedNow credits "
            "the Sending FI's Master Account and generates a final pacs.002 confirmation."
        ),
        "nodes": [
            {"title": "Receiving FI Initiates Return",           "msg": None,              "dir": "PROCESS",  "frm": "Receiving FI",     "to": "Receiving FI", "step": "TRIGGER"},
            {"title": "Send pacs.004 Payment Return → FedNow",  "msg": "pacs.004.001.10", "dir": "SEND",     "frm": "Receiving FI",     "to": "FedNow Hub",   "step": "API_CALL"},
            {"title": "FedNow Validates Return Window (T+1)",    "msg": None,              "dir": "VALIDATE", "frm": "FedNow Hub",       "to": "FedNow Hub",   "step": "BUSINESS_RULE"},
            {"title": "FedNow Credits Sending FI Master Account","msg": None,              "dir": "PROCESS",  "frm": "FedNow Hub",       "to": "Sending FI",   "step": "API_CALL"},
            {"title": "pacs.002 ACCP for Return → Receiving FI","msg": "pacs.002.001.10", "dir": "SEND",     "frm": "FedNow Hub",       "to": "Receiving FI", "step": "API_CALL"},
            {"title": "Sending FI Notifies Customer — Refund",   "msg": None,              "dir": "PROCESS",  "frm": "Sending FI",       "to": "Customer",     "step": "EVENT"},
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # SEPA — Single Euro Payments Area
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "SEPA — Credit Transfer (SCT) — pain.001 → pacs.008",
        "clearing_network": "SEPA",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": (
            "Standard SEPA Credit Transfer (SCT) end-to-end. Corporate submits pain.001 "
            "to Originating FI. FI validates IBAN/BIC and EPC scheme rules, transforms "
            "to pacs.008, submits to STEP2 clearing. Beneficiary FI credits account next day."
        ),
        "nodes": [
            {"title": "Receive pain.001 — Corporate Batch",      "msg": "pain.001.001.12", "dir": "RECEIVE",  "frm": "Corporate",        "to": "Originating FI","step": "TRIGGER"},
            {"title": "IBAN / BIC / EPC Scheme Validation",      "msg": None,              "dir": "VALIDATE", "frm": "Originating FI",   "to": "Originating FI","step": "BUSINESS_RULE"},
            {"title": "Return pain.002 Status — Accepted",       "msg": "pain.002.001.14", "dir": "SEND",     "frm": "Originating FI",   "to": "Corporate",    "step": "API_CALL"},
            {"title": "Transform pain.001 → pacs.008",           "msg": "pacs.008.001.10", "dir": "PROCESS",  "frm": "Originating FI",   "to": "Originating FI","step": "CALCULATION"},
            {"title": "Submit pacs.008 → STEP2 Clearing",        "msg": "pacs.008.001.10", "dir": "SEND",     "frm": "Originating FI",   "to": "STEP2",        "step": "API_CALL"},
            {"title": "STEP2 Routes to Beneficiary FI",          "msg": "pacs.008.001.10", "dir": "SEND",     "frm": "STEP2",            "to": "Beneficiary FI","step": "API_CALL"},
            {"title": "Beneficiary FI Credits Account",          "msg": None,              "dir": "PROCESS",  "frm": "Beneficiary FI",   "to": "Beneficiary",  "step": "API_CALL"},
        ],
    },

    {
        "name": "SEPA — Direct Debit CORE (pain.008 → pacs.003)",
        "clearing_network": "SEPA",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": (
            "SEPA Core Direct Debit — mandate-based collection. Creditor FI submits "
            "pain.008 with signed mandate reference to STEP2. Debtor FI validates "
            "the mandate and debits the customer account. Returns pacs.002 or R-message "
            "if refused. Pre-notification to debtor must be sent D-14 days."
        ),
        "nodes": [
            {"title": "Creditor Submits pain.008 Direct Debit",  "msg": "pain.008.001.11", "dir": "SEND",     "frm": "Creditor FI",      "to": "STEP2",        "step": "TRIGGER"},
            {"title": "Validate Mandate Reference & Signature",  "msg": None,              "dir": "VALIDATE", "frm": "STEP2",            "to": "STEP2",        "step": "BUSINESS_RULE"},
            {"title": "STEP2 Routes to Debtor FI",              "msg": "pacs.003.001.07", "dir": "SEND",     "frm": "STEP2",            "to": "Debtor FI",    "step": "API_CALL"},
            {"title": "Debtor FI Validates Mandate + Balance",   "msg": None,              "dir": "VALIDATE", "frm": "Debtor FI",        "to": "Debtor FI",    "step": "BUSINESS_RULE"},
            {"title": "Debtor FI Debits Customer Account",       "msg": None,              "dir": "PROCESS",  "frm": "Debtor FI",        "to": "Debtor Customer","step": "API_CALL"},
            {"title": "Return pacs.002 ACCP to STEP2",          "msg": "pacs.002.001.12", "dir": "SEND",     "frm": "Debtor FI",        "to": "STEP2",        "step": "API_CALL"},
            {"title": "STEP2 Credits Creditor FI",              "msg": None,              "dir": "PROCESS",  "frm": "STEP2",            "to": "Creditor FI",  "step": "API_CALL"},
        ],
    },

    {
        "name": "SEPA — Instant Credit Transfer (SCT Inst) — RT1",
        "clearing_network": "SEPA",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "SEPA Instant Credit Transfer (SCT Inst) — 10-second settlement via EBA RT1. "
            "Same message flow as SCT but with strict time constraint: Beneficiary FI must "
            "respond within 10 seconds or RT1 auto-rejects. Amount limit €100,000 per transaction."
        ),
        "nodes": [
            {"title": "Receive Instant Payment Request",         "msg": "pain.001.001.12", "dir": "RECEIVE",  "frm": "Corporate",        "to": "Originating FI","step": "TRIGGER"},
            {"title": "Amount Limit Check (≤ €100,000)",         "msg": None,              "dir": "VALIDATE", "frm": "Originating FI",   "to": "Originating FI","step": "BUSINESS_RULE"},
            {"title": "Send pacs.008 → RT1 (10s clock starts)", "msg": "pacs.008.001.10", "dir": "SEND",     "frm": "Originating FI",   "to": "EBA RT1",      "step": "API_CALL"},
            {"title": "RT1 Routes to Beneficiary FI",           "msg": "pacs.008.001.10", "dir": "SEND",     "frm": "EBA RT1",          "to": "Beneficiary FI","step": "API_CALL"},
            {"title": "Beneficiary FI Credits (within 10s)",     "msg": None,              "dir": "PROCESS",  "frm": "Beneficiary FI",   "to": "Beneficiary",  "step": "API_CALL"},
            {"title": "Return pacs.002 ACCP within 10s",        "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "Beneficiary FI",   "to": "EBA RT1",      "step": "API_CALL"},
            {"title": "RT1 Relays pacs.002 → Originating FI",  "msg": "pacs.002.001.10", "dir": "SEND",     "frm": "EBA RT1",          "to": "Originating FI","step": "API_CALL"},
        ],
    },

    # ══════════════════════════════════════════════════════════════════════════
    # ACH / CHIPS — High-Value / Batch Domestic (US)
    # ══════════════════════════════════════════════════════════════════════════

    {
        "name": "CHIPS — High-Value USD Credit Transfer",
        "clearing_network": "CHIPS",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": (
            "CHIPS high-value USD credit transfer. Originating FI submits pacs.008 "
            "to CHIPS. CHIPS matches with netting pool; bilateral credit/debit positions "
            "net at EOD. Requires pre-funded CHIPS participant account. "
            "Real-time OFAC screening mandatory."
        ),
        "nodes": [
            {"title": "Receive Large-Value USD Payment Instruction","msg": "pain.001.001.12","dir": "RECEIVE","frm": "Corporate",        "to": "Originating FI","step": "TRIGGER"},
            {"title": "OFAC Real-Time Screening",                "msg": None,              "dir": "VALIDATE", "frm": "Originating FI",   "to": "Originating FI","step": "BUSINESS_RULE"},
            {"title": "CHIPS Pre-Funded Balance Check",          "msg": None,              "dir": "VALIDATE", "frm": "Originating FI",   "to": "CHIPS",        "step": "CALCULATION"},
            {"title": "Send pacs.008 → CHIPS Network",           "msg": "pacs.008.001.10", "dir": "SEND",     "frm": "Originating FI",   "to": "CHIPS",        "step": "API_CALL"},
            {"title": "CHIPS Netting & Bilateral Position Update","msg": None,             "dir": "PROCESS",  "frm": "CHIPS",            "to": "CHIPS",        "step": "BUSINESS_RULE"},
            {"title": "CHIPS Routes to Beneficiary FI",         "msg": "pacs.008.001.10", "dir": "SEND",     "frm": "CHIPS",            "to": "Beneficiary FI","step": "API_CALL"},
            {"title": "Beneficiary FI Credits Account",          "msg": None,              "dir": "PROCESS",  "frm": "Beneficiary FI",   "to": "Beneficiary",  "step": "API_CALL"},
            {"title": "EOD CHIPS Net Settlement via Fedwire",    "msg": None,              "dir": "PROCESS",  "frm": "CHIPS",            "to": "Fed Reserve",  "step": "API_CALL"},
        ],
    },

    {
        "name": "ACH — Bulk Credit Origination (pain.001 Batch → NACHA)",
        "clearing_network": "ACH",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": (
            "ACH credit origination batch — payroll, vendor payments. "
            "Corporate submits pain.001 batch; Originating FI validates NACHA format "
            "and control totals, submits to ACH Operator by cutoff window. "
            "ACH Operator distributes to Receiving FIs; handles RETURN/NOC files next day."
        ),
        "nodes": [
            {"title": "Receive pain.001 Batch — Payroll / Vendor","msg": "pain.001.001.12","dir": "RECEIVE",  "frm": "Corporate",        "to": "ODFI",         "step": "TRIGGER"},
            {"title": "NACHA Format + Control Total Validation",  "msg": None,              "dir": "VALIDATE", "frm": "ODFI",             "to": "ODFI",         "step": "BUSINESS_RULE"},
            {"title": "Return pain.002 — Batch Accepted",         "msg": "pain.002.001.14", "dir": "SEND",     "frm": "ODFI",             "to": "Corporate",    "step": "API_CALL"},
            {"title": "Submit ACH Batch to ACH Operator (Cutoff)","msg": None,              "dir": "SEND",     "frm": "ODFI",             "to": "ACH Operator", "step": "API_CALL"},
            {"title": "ACH Operator Distributes to RDFIs",        "msg": None,              "dir": "SEND",     "frm": "ACH Operator",     "to": "RDFI",         "step": "API_CALL"},
            {"title": "RDFI Credits / Debits Accounts",           "msg": None,              "dir": "PROCESS",  "frm": "RDFI",             "to": "Receivers",    "step": "API_CALL"},
            {"title": "Process RETURN / NOC Files (T+2)",         "msg": None,              "dir": "RECEIVE",  "frm": "ACH Operator",     "to": "ODFI",         "step": "EVENT"},
        ],
    },

]


# Maps the per-node "dir" shorthand to the Universal Taxonomy node_type.
# The canvas uses node_type for color-coding and shape selection.
_DIR_TO_NODE_TYPE = {
    "RECEIVE":  "RECEIVE",
    "SEND":     "SEND_MESSAGE",
    "PROCESS":  "CALL_SYSTEM",
    "VALIDATE": "VALIDATE",
    "APPROVE":  "HUMAN_APPROVAL",
    "BRANCH":   "DECISION",
}

# Default structured SLA per node_type.
# Replaces the flat sla_days=1 integer with domain-appropriate config.
# Payment network messages (SEND/RECEIVE) have second-level SLAs per ISO 20022 timing rules.
# Human tasks and validation steps have banking-day SLAs per industry practice.
_NODE_TYPE_SLA = {
    "RECEIVE":        {"value": 30,  "unit": "SECONDS",       "on_breach": "ESCALATE"},
    "SEND_MESSAGE":   {"value": 10,  "unit": "SECONDS",       "on_breach": "ESCALATE"},
    "CALL_SYSTEM":    {"value": 5,   "unit": "MINUTES",       "on_breach": "NOTIFY"},
    "VALIDATE":       {"value": 2,   "unit": "MINUTES",       "on_breach": "REJECT"},
    "HUMAN_APPROVAL": {"value": 2,   "unit": "BANKING_DAYS",  "on_breach": "ESCALATE"},
    "DECISION":       {"value": 1,   "unit": "MINUTES",       "on_breach": "PROCEED"},
}


def _make_node(wf_id: str, seq: int, n: dict) -> models.WorkflowNode:
    """Build a WorkflowNode ORM object from a scenario node dict."""
    direction = n.get("dir", "PROCESS")
    node_type = _DIR_TO_NODE_TYPE.get(direction, "CALL_SYSTEM")
    sla_config = _NODE_TYPE_SLA.get(node_type)
    return models.WorkflowNode(
        node_id=f"NODE-{uuid.uuid4().hex[:8].upper()}",
        workflow_id=wf_id,
        sequence_number=seq + 1,
        node_title=n["title"],
        node_code=f"{direction}_{n.get('msg','INTERNAL') or 'INTERNAL'}".upper().replace(".", "_")[:64],
        orchestration_steps=[{
            "step_type": n.get("step", "BUSINESS_RULE"),
            "label": n["title"],
            "iso_message_type": n.get("msg"),
            "direction": direction,
            "party_from": n.get("frm"),
            "party_to": n.get("to"),
        }],
        node_type=node_type,
        sla_config=sla_config,
        iso_message_type=n.get("msg"),
        message_direction=direction,
        party_from=n.get("frm"),
        party_to=n.get("to"),
        canvas_x_position=100 + seq * 220,
        canvas_y_position=200,
        created_at=datetime.datetime.now(datetime.UTC).isoformat(),
    )


def _make_edge(wf_id: str, src_id: str, tgt_id: str, seq: int) -> models.WorkflowEdge:
    return models.WorkflowEdge(
        edge_id=f"EDGE-{uuid.uuid4().hex[:8].upper()}",
        workflow_id=wf_id,
        source_node_id=src_id,
        target_node_id=tgt_id,
        created_at=datetime.datetime.now(datetime.UTC).isoformat(),
    )


def seed():
    db = SessionLocal()
    try:
        # Remove ALL previous single-message templates (the old wrong design)
        old = db.query(models.WorkflowConfiguration).filter(
            models.WorkflowConfiguration.is_template == True
        ).all()
        if old:
            for o in old:
                db.delete(o)
            db.commit()
            print(f"  ↳ Removed {len(old)} old single-message templates")

        seeded = 0
        for s in SCENARIOS:
            wf_id = f"TPL-{uuid.uuid4().hex[:8].upper()}"
            wf = models.WorkflowConfiguration(
                workflow_id=wf_id,
                workflow_name=s["name"],
                domain_scope=s["domain"],
                product_context="ISO 20022 Scenario Template Library",
                description=s["description"],
                version="1.0.0",
                status="ACTIVE",
                is_active=True,
                is_template=True,
                clearing_network=s["clearing_network"],
                template_category=s["category"],
                created_at=datetime.datetime.now(datetime.UTC).isoformat(),
                created_by="SYSTEM",
            )

            node_ids = []
            for seq, nd in enumerate(s.get("nodes", [])):
                n = _make_node(wf_id, seq, nd)
                wf.nodes.append(n)
                node_ids.append(n.node_id)

            for i in range(len(node_ids) - 1):
                wf.edges.append(_make_edge(wf_id, node_ids[i], node_ids[i + 1], i + 1))

            db.add(wf)
            seeded += 1

        db.commit()
        print(f"✅  Scenario templates seeded: {seeded}")
        print()
        for s in SCENARIOS:
            net = s['clearing_network']
            print(f"  [{net:7}] {s['name']} ({len(s['nodes'])} nodes)")

    except Exception as e:
        db.rollback()
        print(f"❌  Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    _migrate_columns()
    seed()
