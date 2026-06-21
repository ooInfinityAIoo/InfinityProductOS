# WHY THIS FILE EXISTS:
# Seeds the Workflow Designer with one ready-to-use template per major ISO 20022
# message type, covering every payment family (pacs, camt, pain, admi) plus
# network-specific messages for FedNow and RTP.
#
# A "template" is a WorkflowConfiguration with is_template=True.  It appears in the
# "New from Template" modal inside the Workflow Designer and can be cloned into a real
# workflow without touching a single field of the underlying ISO 20022 message schema.
#
# HOW TO RUN (after seed.py + seed_pkg.py):
#   python seed_iso_workflow_templates.py
#
# WHAT BREAKS IF REMOVED: the template picker in the Workflow Designer will be empty.
# Users would have to build all ISO 20022 message flows from scratch.

import uuid
import datetime
from database import SessionLocal, engine, Base
import models

Base.metadata.create_all(bind=engine)

# SQLite does not support ADD COLUMN IF NOT EXISTS — check manually.
# These columns were added to the ORM model but may not exist in the live DB yet.
def _add_columns_if_missing():
    from sqlalchemy import text, inspect as sa_inspect
    with engine.connect() as conn:
        inspector = sa_inspect(engine)
        existing_cols = {c['name'] for c in inspector.get_columns('workflow_configurations')}
        for col_def, col_name in [
            ("is_template BOOLEAN NOT NULL DEFAULT 0", "is_template"),
            ("message_type VARCHAR",                   "message_type"),
            ("clearing_network VARCHAR",               "clearing_network"),
            ("template_category VARCHAR",              "template_category"),
        ]:
            if col_name not in existing_cols:
                conn.execute(text(f"ALTER TABLE workflow_configurations ADD COLUMN {col_def}"))
                print(f"  ↳ Added column: {col_name}")
        conn.commit()

_add_columns_if_missing()

# ---------------------------------------------------------------------------
# Template catalogue
# Each entry describes one ISO 20022 message type.
# Fields:
#   name             – human-readable label in the template picker
#   message_type     – canonical ISO 20022 message ID (family.set.version)
#   clearing_network – SWIFT | FEDNOW | RTP | CHIPS | SEPA | ACH | ALL
#   category         – PAYMENT_INITIATION | CLEARING_SETTLEMENT | CASH_MANAGEMENT | ADMINISTRATION
#   domain           – domain_scope used for workflow filtering
#   description      – shown in the template detail panel
#   nodes            – pre-built DAG nodes seeded with the template
# ---------------------------------------------------------------------------

TEMPLATES = [
    # ── pacs — Payment Clearing and Settlement ────────────────────────────
    {
        "name": "pacs.008 — FI-to-FI Credit Transfer (Outbound)",
        "message_type": "pacs.008.001.10",
        "clearing_network": "SWIFT",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": "Standard SWIFT FI-to-FI credit transfer. Debits the nostro and credits the correspondent bank. Used for cross-border wire payments (MT103 replacement).",
        "nodes": [
            {"step": "INGEST",         "label": "Receive pacs.008 Message",    "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "Validate ISO Fields",          "step_type": "BUSINESS_RULE"},
            {"step": "SANCTIONS",      "label": "OFAC / Sanctions Screen",      "step_type": "BUSINESS_RULE"},
            {"step": "FX_ENRICH",      "label": "FX Rate Enrichment",           "step_type": "CALCULATION"},
            {"step": "APPROVE",        "label": "4-Eye Approval (AML / Value)", "step_type": "APPROVAL"},
            {"step": "SETTLE",         "label": "Post Nostro Debit & Credit",   "step_type": "API_CALL"},
            {"step": "CONFIRM",        "label": "Send pacs.002 Confirmation",   "step_type": "API_CALL"},
        ],
    },
    {
        "name": "pacs.002 — Payment Status Report (Inbound)",
        "message_type": "pacs.002.001.12",
        "clearing_network": "SWIFT",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": "Inbound payment status report acknowledging receipt or rejection of a pacs.008. Correlates to the originating outbound transfer via the end-to-end ID.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive pacs.002 Status",     "step_type": "TRIGGER"},
            {"step": "CORRELATE",      "label": "Match to Outbound pacs.008",  "step_type": "BUSINESS_RULE"},
            {"step": "BRANCH",         "label": "ACCP vs RJCT Branch",         "step_type": "BUSINESS_RULE"},
            {"step": "UPDATE_STATUS",  "label": "Update Payment Status",       "step_type": "API_CALL"},
            {"step": "NOTIFY",         "label": "Notify Originator",           "step_type": "EVENT"},
        ],
    },
    {
        "name": "pacs.004 — Payment Return",
        "message_type": "pacs.004.001.11",
        "clearing_network": "ALL",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": "Initiates return of a previously settled payment. Reverses the nostro/vostro posting and generates a credit back to the originating party.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive Return Request",      "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "Validate Return Reason Code", "step_type": "BUSINESS_RULE"},
            {"step": "REVERSE",        "label": "Reverse Original Settlement", "step_type": "API_CALL"},
            {"step": "CONFIRM",        "label": "Send Return Confirmation",    "step_type": "API_CALL"},
        ],
    },
    {
        "name": "pacs.009 — Financial Institution Credit Transfer (Cover)",
        "message_type": "pacs.009.001.09",
        "clearing_network": "SWIFT",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": "Cover payment — funds the correspondent bank to cover a pacs.008 customer credit transfer. Moves value between financial institutions on SWIFT.",
        "nodes": [
            {"step": "TRIGGER",        "label": "Initiate Cover Payment",      "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "Validate SWIFT BIC / IBAN",   "step_type": "BUSINESS_RULE"},
            {"step": "ROUTE",          "label": "Select Correspondent Route",  "step_type": "BUSINESS_RULE"},
            {"step": "SEND",           "label": "Transmit via SWIFT GPI",      "step_type": "API_CALL"},
        ],
    },
    {
        "name": "pacs.028 — Payment Status Request",
        "message_type": "pacs.028.001.04",
        "clearing_network": "ALL",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": "Queries the status of a payment that has not received a pacs.002 response within the SLA window. Used for exception management and payment tracing.",
        "nodes": [
            {"step": "DETECT",         "label": "SLA Breach Detection",        "step_type": "TRIGGER"},
            {"step": "LOOKUP",         "label": "Retrieve Original Payment",   "step_type": "BUSINESS_RULE"},
            {"step": "QUERY",          "label": "Send pacs.028 Status Request", "step_type": "API_CALL"},
            {"step": "AWAIT",          "label": "Await pacs.002 / Escalate",   "step_type": "BUSINESS_RULE"},
        ],
    },

    # ── pacs — FedNow-specific ─────────────────────────────────────────────
    {
        "name": "[FedNow] pacs.008 — Instant Credit Transfer",
        "message_type": "pacs.008.001.08",
        "clearing_network": "FEDNOW",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": "Real-time interbank credit transfer over the Federal Reserve FedNow Service. Must complete within 20-second RTP window. Includes mandatory admi.002 acknowledgement flow.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive FedNow pacs.008",     "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "Validate Mandatory Fields",   "step_type": "BUSINESS_RULE"},
            {"step": "FUNDS_CHECK",    "label": "Real-Time Funds Availability","step_type": "CALCULATION"},
            {"step": "SETTLE",         "label": "Post Master Account Debit",   "step_type": "API_CALL"},
            {"step": "ACK",            "label": "Return admi.002 Acknowledge", "step_type": "API_CALL"},
            {"step": "CREDIT",         "label": "Credit Beneficiary Account",  "step_type": "API_CALL"},
            {"step": "CONFIRM",        "label": "Return pacs.002 Confirmation","step_type": "API_CALL"},
        ],
    },
    {
        "name": "[FedNow] pacs.004 — Instant Payment Return",
        "message_type": "pacs.004.001.10",
        "clearing_network": "FEDNOW",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": "Instant payment return specific to FedNow. Reverses a previously settled FedNow credit within the 24-hour return window.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive FedNow Return",       "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "Validate Return Window (24h)","step_type": "BUSINESS_RULE"},
            {"step": "REVERSE",        "label": "Reverse FedNow Settlement",   "step_type": "API_CALL"},
            {"step": "NOTIFY",         "label": "Notify Original Sender",      "step_type": "EVENT"},
        ],
    },
    {
        "name": "[FedNow] admi.002 — System Event Notification",
        "message_type": "admi.002.001.01",
        "clearing_network": "FEDNOW",
        "category": "ADMINISTRATION",
        "domain": "OPERATIONS",
        "description": "FedNow administrative notification acknowledging receipt of a pacs.008 at the Fed. Triggers the 20-second settlement clock. Must be processed before SLA escalation.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive admi.002 Notification","step_type": "TRIGGER"},
            {"step": "MATCH",          "label": "Match to Pending pacs.008",   "step_type": "BUSINESS_RULE"},
            {"step": "START_TIMER",    "label": "Start 20s Settlement Timer",  "step_type": "EVENT"},
        ],
    },
    {
        "name": "[FedNow] admi.004 — System Event Acknowledgement",
        "message_type": "admi.004.001.02",
        "clearing_network": "FEDNOW",
        "category": "ADMINISTRATION",
        "domain": "OPERATIONS",
        "description": "FedNow system event acknowledgement sent back to the Fed confirming processing of a received message. Required by FedNow participation agreement.",
        "nodes": [
            {"step": "TRIGGER",        "label": "Detect Incoming admi.004",    "step_type": "TRIGGER"},
            {"step": "LOG",            "label": "Log to Evidence Ledger",      "step_type": "EVENT"},
            {"step": "ACK",            "label": "Respond to FedNow Hub",       "step_type": "API_CALL"},
        ],
    },

    # ── pacs — RTP-specific ────────────────────────────────────────────────
    {
        "name": "[RTP] pacs.008 — Real-Time Payment (TCH)",
        "message_type": "pacs.008.001.08",
        "clearing_network": "RTP",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": "Real-Time Payment credit transfer over The Clearing House RTP network. 24/7/365 settlement in seconds. Includes mandatory pacs.002 positive or negative acknowledgement.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive RTP pacs.008",        "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "RTP Field Validation",        "step_type": "BUSINESS_RULE"},
            {"step": "FUNDS_CHECK",    "label": "Real-Time Balance Check",     "step_type": "CALCULATION"},
            {"step": "SETTLE",         "label": "TCH Net Settlement Entry",    "step_type": "API_CALL"},
            {"step": "CREDIT",         "label": "Credit Beneficiary Account",  "step_type": "API_CALL"},
            {"step": "CONFIRM",        "label": "Return pacs.002 (ACCP/RJCT)", "step_type": "API_CALL"},
        ],
    },
    {
        "name": "[RTP] pain.013 — Request for Payment (RfP)",
        "message_type": "pain.013.001.09",
        "clearing_network": "RTP",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": "RTP-specific Request for Payment. Sent by a creditor to a debtor requesting authorisation to initiate a real-time debit. Debtor responds via pain.014. Used for bill pay and e-invoicing.",
        "nodes": [
            {"step": "CREATE",         "label": "Build pain.013 RfP Message",  "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "Validate Amount / Due Date",  "step_type": "BUSINESS_RULE"},
            {"step": "SEND",           "label": "Transmit RfP via TCH",        "step_type": "API_CALL"},
            {"step": "AWAIT",          "label": "Await pain.014 Response",     "step_type": "BUSINESS_RULE"},
            {"step": "INITIATE",       "label": "Auto-Initiate pacs.008 on OK","step_type": "SUB_WORKFLOW"},
        ],
    },
    {
        "name": "[RTP] pain.014 — Creditor Payment Activation Request Response",
        "message_type": "pain.014.001.09",
        "clearing_network": "RTP",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": "Debtor's response to a pain.013 Request for Payment. Accepted = trigger pacs.008; Rejected = close the RfP with reason code.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive pain.014 Response",   "step_type": "TRIGGER"},
            {"step": "CHECK",          "label": "Check Accept / Reject",       "step_type": "BUSINESS_RULE"},
            {"step": "BRANCH_ACCEPT",  "label": "Initiate pacs.008 (Accept)",  "step_type": "SUB_WORKFLOW"},
            {"step": "BRANCH_REJECT",  "label": "Close RfP with Reason Code", "step_type": "BUSINESS_RULE"},
        ],
    },

    # ── pain — Payment Initiation ──────────────────────────────────────────
    {
        "name": "pain.001 — Customer Credit Transfer Initiation",
        "message_type": "pain.001.001.12",
        "clearing_network": "ALL",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": "Corporate-to-bank payment instruction (MT101 replacement). Initiates one or many credit transfers on behalf of a customer. Gateway into the payment clearing chain.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive pain.001 from Corporate","step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "Validate Debtor Mandate",     "step_type": "BUSINESS_RULE"},
            {"step": "DEDUPE",         "label": "Duplicate Payment Check",     "step_type": "BUSINESS_RULE"},
            {"step": "ENRICH",         "label": "Enrich with ISO Fields",      "step_type": "CALCULATION"},
            {"step": "ROUTE",          "label": "Route to Clearing Rail",      "step_type": "BUSINESS_RULE"},
            {"step": "TRANSFORM",      "label": "Transform to pacs.008",       "step_type": "SUB_WORKFLOW"},
        ],
    },
    {
        "name": "pain.002 — Customer Payment Status Report",
        "message_type": "pain.002.001.14",
        "clearing_network": "ALL",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": "Bank-to-corporate status report on a pain.001 payment instruction. Communicates acceptance, rejection, or pending status back to the originating corporate.",
        "nodes": [
            {"step": "TRIGGER",        "label": "Payment Status Changed",      "step_type": "TRIGGER"},
            {"step": "BUILD",          "label": "Build pain.002 Response",     "step_type": "CALCULATION"},
            {"step": "SEND",           "label": "Deliver to Corporate Host",   "step_type": "API_CALL"},
        ],
    },
    {
        "name": "pain.008 — Customer Direct Debit Initiation",
        "message_type": "pain.008.001.11",
        "clearing_network": "SEPA",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": "SEPA Direct Debit initiation. Collects funds from debtors based on a signed mandate. Supports both CORE and B2B scheme variants.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive pain.008 File",       "step_type": "TRIGGER"},
            {"step": "MANDATE_CHECK",  "label": "Validate Mandate Signature",  "step_type": "BUSINESS_RULE"},
            {"step": "CUTOFF_CHECK",   "label": "Check Pre-Notification Deadline","step_type": "BUSINESS_RULE"},
            {"step": "SUBMIT",         "label": "Submit to SEPA Clearing",     "step_type": "API_CALL"},
            {"step": "CONFIRM",        "label": "Return pain.002 Status",      "step_type": "API_CALL"},
        ],
    },

    # ── camt — Cash Management ─────────────────────────────────────────────
    {
        "name": "camt.052 — Bank-to-Customer Account Report (Intraday)",
        "message_type": "camt.052.001.12",
        "clearing_network": "ALL",
        "category": "CASH_MANAGEMENT",
        "domain": "CASH_MANAGEMENT",
        "description": "Intraday account statement showing debit and credit entries booked since the last reporting point. Used by treasurers for real-time liquidity monitoring.",
        "nodes": [
            {"step": "TRIGGER",        "label": "Intraday Report Scheduled",   "step_type": "TRIGGER"},
            {"step": "QUERY",          "label": "Query Intraday Movements",    "step_type": "API_CALL"},
            {"step": "BUILD",          "label": "Build camt.052 Payload",      "step_type": "CALCULATION"},
            {"step": "DELIVER",        "label": "Deliver to Customer Portal",  "step_type": "API_CALL"},
        ],
    },
    {
        "name": "camt.053 — Bank-to-Customer Statement (End-of-Day)",
        "message_type": "camt.053.001.11",
        "clearing_network": "ALL",
        "category": "CASH_MANAGEMENT",
        "domain": "CASH_MANAGEMENT",
        "description": "End-of-day statement (MT940/MT942 replacement). Delivers the official account statement with opening balance, entries, and closing balance for bank reconciliation.",
        "nodes": [
            {"step": "EOD_TRIGGER",    "label": "EOD Statement Batch Trigger", "step_type": "TRIGGER"},
            {"step": "CLOSE_BOOKS",    "label": "Close Intraday Ledger",       "step_type": "BUSINESS_RULE"},
            {"step": "BUILD",          "label": "Build camt.053 Statement",    "step_type": "CALCULATION"},
            {"step": "SIGN",           "label": "Apply Digital Signature",     "step_type": "BUSINESS_RULE"},
            {"step": "DELIVER",        "label": "Deliver via SWIFT / SFTP",    "step_type": "API_CALL"},
            {"step": "ARCHIVE",        "label": "Archive to Evidence Ledger",  "step_type": "EVENT"},
        ],
    },
    {
        "name": "camt.054 — Bank-to-Customer Debit/Credit Notification",
        "message_type": "camt.054.001.11",
        "clearing_network": "ALL",
        "category": "CASH_MANAGEMENT",
        "domain": "CASH_MANAGEMENT",
        "description": "Real-time debit or credit advice for a single entry (MT900/MT910 replacement). Sent immediately when a significant debit or credit posts to the account.",
        "nodes": [
            {"step": "ENTRY_POSTED",   "label": "Account Entry Posted",        "step_type": "TRIGGER"},
            {"step": "THRESHOLD",      "label": "Amount Threshold Rule",       "step_type": "BUSINESS_RULE"},
            {"step": "BUILD",          "label": "Build camt.054 Notification", "step_type": "CALCULATION"},
            {"step": "DELIVER",        "label": "Push to Customer Webhook",    "step_type": "API_CALL"},
        ],
    },
    {
        "name": "camt.056 — FI-to-FI Payment Cancellation Request",
        "message_type": "camt.056.001.10",
        "clearing_network": "SWIFT",
        "category": "CASH_MANAGEMENT",
        "domain": "PAYMENTS",
        "description": "Recall request sent by the originating bank to cancel a settled pacs.008 payment. Triggers the beneficiary bank's recall workflow (camt.029 resolution).",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive camt.056 Recall",     "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "Validate Recall Eligibility", "step_type": "BUSINESS_RULE"},
            {"step": "HOLD",           "label": "Place Beneficiary Funds Hold","step_type": "API_CALL"},
            {"step": "REVIEW",         "label": "Compliance / Legal Review",   "step_type": "APPROVAL"},
            {"step": "RETURN",         "label": "Initiate pacs.004 Return",    "step_type": "SUB_WORKFLOW"},
            {"step": "RESOLVE",        "label": "Send camt.029 Resolution",    "step_type": "API_CALL"},
        ],
    },
    {
        "name": "camt.029 — Resolution of Investigation",
        "message_type": "camt.029.001.13",
        "clearing_network": "SWIFT",
        "category": "CASH_MANAGEMENT",
        "domain": "PAYMENTS",
        "description": "Response to a camt.056 recall request, confirming whether funds have been returned or providing a rejection reason.",
        "nodes": [
            {"step": "TRIGGER",        "label": "Recall Decision Made",        "step_type": "TRIGGER"},
            {"step": "BUILD",          "label": "Build camt.029 Resolution",   "step_type": "CALCULATION"},
            {"step": "SEND",           "label": "Transmit to Requester Bank",  "step_type": "API_CALL"},
        ],
    },
    {
        "name": "camt.060 — Account Reporting Request",
        "message_type": "camt.060.001.06",
        "clearing_network": "ALL",
        "category": "CASH_MANAGEMENT",
        "domain": "CASH_MANAGEMENT",
        "description": "On-demand account statement request sent by a corporate to its bank. Bank responds with a camt.052 (intraday) or camt.053 (EOD) depending on the requested period.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive camt.060 Request",    "step_type": "TRIGGER"},
            {"step": "AUTHORIZE",      "label": "Validate Account Ownership",  "step_type": "BUSINESS_RULE"},
            {"step": "ROUTE",          "label": "Route to camt.052 or .053",   "step_type": "BUSINESS_RULE"},
            {"step": "BUILD",          "label": "Build Statement Response",    "step_type": "SUB_WORKFLOW"},
        ],
    },

    # ── admi — Administration ──────────────────────────────────────────────
    {
        "name": "admi.998 — Proprietary System Message (FedNow)",
        "message_type": "admi.998.001.02",
        "clearing_network": "FEDNOW",
        "category": "ADMINISTRATION",
        "domain": "OPERATIONS",
        "description": "FedNow proprietary extension wrapper for messages not covered by standard ISO 20022. Used for FedNow-specific operational messages during network events and maintenance windows.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive admi.998 Message",    "step_type": "TRIGGER"},
            {"step": "CLASSIFY",       "label": "Classify Message SubType",    "step_type": "BUSINESS_RULE"},
            {"step": "HANDLE",         "label": "Route to Operational Handler","step_type": "BUSINESS_RULE"},
            {"step": "LOG",            "label": "Log to Operations Dashboard", "step_type": "EVENT"},
        ],
    },
    {
        "name": "admi.006 — Resend Request",
        "message_type": "admi.006.001.01",
        "clearing_network": "ALL",
        "category": "ADMINISTRATION",
        "domain": "OPERATIONS",
        "description": "Requests a counterparty to re-transmit a message that was not received or was corrupted in transit. Used during network recovery and exception handling.",
        "nodes": [
            {"step": "DETECT",         "label": "Missing Message Detected",    "step_type": "TRIGGER"},
            {"step": "IDENTIFY",       "label": "Identify Missing Message Ref","step_type": "BUSINESS_RULE"},
            {"step": "SEND",           "label": "Send admi.006 Resend Request","step_type": "API_CALL"},
            {"step": "AWAIT",          "label": "Await Re-transmission",       "step_type": "BUSINESS_RULE"},
        ],
    },
    {
        "name": "admi.007 — Receipt Acknowledgement",
        "message_type": "admi.007.001.01",
        "clearing_network": "ALL",
        "category": "ADMINISTRATION",
        "domain": "OPERATIONS",
        "description": "Generic acknowledgement confirming receipt of any ISO 20022 message. Used as a lightweight ACK where a full business response is not yet available.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Message Received",            "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "Schema Validation",           "step_type": "BUSINESS_RULE"},
            {"step": "ACK",            "label": "Return admi.007 ACK",         "step_type": "API_CALL"},
        ],
    },

    # ── CHIPS / ACH coverage ───────────────────────────────────────────────
    {
        "name": "[CHIPS] pacs.008 — High-Value USD Transfer",
        "message_type": "pacs.008.001.10",
        "clearing_network": "CHIPS",
        "category": "CLEARING_SETTLEMENT",
        "domain": "PAYMENTS",
        "description": "High-value USD credit transfer via The Clearing House CHIPS system. Used for large-value USD correspondent banking and FX settlement. Requires pre-funded CHIPS participant account.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive CHIPS Payment",       "step_type": "TRIGGER"},
            {"step": "PREFUND_CHECK",  "label": "CHIPS Pre-Fund Balance Check","step_type": "CALCULATION"},
            {"step": "SANCTIONS",      "label": "OFAC Real-Time Screen",       "step_type": "BUSINESS_RULE"},
            {"step": "SUBMIT",         "label": "Submit to CHIPS Network",     "step_type": "API_CALL"},
            {"step": "CONFIRM",        "label": "Receive CHIPS Settlement",    "step_type": "EVENT"},
        ],
    },
    {
        "name": "[ACH] pain.001 — ACH Credit Batch Initiation",
        "message_type": "pain.001.001.12",
        "clearing_network": "ACH",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": "Batch ACH credit origination (payroll, vendor payments). Groups multiple pain.001 entries into a NACHA-formatted batch and submits to the ACH operator.",
        "nodes": [
            {"step": "BATCH_TRIGGER",  "label": "Cutoff Window Batch Trigger", "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "NACHA Format Validation",     "step_type": "BUSINESS_RULE"},
            {"step": "BALANCE",        "label": "Control Total Balance Check", "step_type": "CALCULATION"},
            {"step": "TRANSMIT",       "label": "Submit Batch to ACH Operator","step_type": "API_CALL"},
            {"step": "CONFIRM",        "label": "Process RETURN / NOC Files",  "step_type": "EVENT"},
        ],
    },
    {
        "name": "[SEPA] pain.001 — SEPA Credit Transfer Initiation",
        "message_type": "pain.001.001.12",
        "clearing_network": "SEPA",
        "category": "PAYMENT_INITIATION",
        "domain": "PAYMENTS",
        "description": "SEPA Credit Transfer initiation (SCT / SCT Inst). Covers both standard next-day and SEPA Instant variants within the EPC payment scheme.",
        "nodes": [
            {"step": "RECEIVE",        "label": "Receive SEPA pain.001",       "step_type": "TRIGGER"},
            {"step": "VALIDATE",       "label": "IBAN / BIC / EPC Validation", "step_type": "BUSINESS_RULE"},
            {"step": "ROUTE",          "label": "SCT vs SCT Inst Decision",    "step_type": "BUSINESS_RULE"},
            {"step": "SUBMIT",         "label": "Submit to STEP2 / RT1",       "step_type": "API_CALL"},
            {"step": "CONFIRM",        "label": "Return pain.002 Status",      "step_type": "API_CALL"},
        ],
    },
]


def _make_node(wf_id: str, seq: int, n: dict) -> models.WorkflowNode:
    """Build a WorkflowNode ORM object from a compact node dict."""
    step_type = n.get("step_type", "BUSINESS_RULE")
    return models.WorkflowNode(
        node_id=f"NODE-{uuid.uuid4().hex[:8].upper()}",
        workflow_id=wf_id,
        sequence_number=seq + 1,
        node_title=n["label"],
        node_code=n.get("step", step_type).upper().replace(" ", "_"),
        orchestration_steps=[{"step_type": step_type, "label": n["label"]}],
        canvas_x_position=100 + seq * 200,
        canvas_y_position=200,
        created_at=datetime.datetime.utcnow().isoformat(),
    )


def _make_edge(wf_id: str, src_id: str, tgt_id: str, seq: int) -> models.WorkflowEdge:
    return models.WorkflowEdge(
        edge_id=f"EDGE-{uuid.uuid4().hex[:8].upper()}",
        workflow_id=wf_id,
        source_node_id=src_id,
        target_node_id=tgt_id,
        created_at=datetime.datetime.utcnow().isoformat(),
    )


def seed():
    db = SessionLocal()
    try:
        seeded = 0
        skipped = 0
        for t in TEMPLATES:
            # Idempotent — skip if a template with the same name already exists
            existing = db.query(models.WorkflowConfiguration).filter(
                models.WorkflowConfiguration.workflow_name == t["name"],
                models.WorkflowConfiguration.is_template == True,
            ).first()
            if existing:
                skipped += 1
                continue

            wf_id = f"TPL-{uuid.uuid4().hex[:8].upper()}"
            wf = models.WorkflowConfiguration(
                workflow_id=wf_id,
                workflow_name=t["name"],
                domain_scope=t["domain"],
                product_context="ISO 20022 Template Library",
                description=t["description"],
                version="1.0.0",
                status="ACTIVE",
                is_active=True,
                is_template=True,
                message_type=t["message_type"],
                clearing_network=t["clearing_network"],
                template_category=t["category"],
                created_at=datetime.datetime.utcnow().isoformat(),
                created_by="SYSTEM",
            )

            # Create nodes and chain edges
            node_ids = []
            for seq, nd in enumerate(t.get("nodes", [])):
                n = _make_node(wf_id, seq, nd)
                wf.nodes.append(n)
                node_ids.append(n.node_id)

            for i in range(len(node_ids) - 1):
                wf.edges.append(_make_edge(wf_id, node_ids[i], node_ids[i + 1], i + 1))

            db.add(wf)
            seeded += 1

        db.commit()
        print(f"✅  ISO workflow templates: {seeded} seeded, {skipped} already existed.")
    except Exception as e:
        db.rollback()
        print(f"❌  Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
