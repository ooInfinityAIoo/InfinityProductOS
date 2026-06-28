"""
WHY THIS FILE EXISTS (E6 test / QA):
Seeds WorkflowExecutionInstance rows covering all key metro tracker lifecycle
states so the Transaction Workflow Screen can be manually verified end-to-end
against real data without needing to re-execute the golden-path workflow.

Each instance is seeded at a meaningful point in the 5-node WF-ECC2B272
(MT103 Ingest → AML/OFAC → FX Enrichment → Dual Auth → RTGS Settlement).

Run once:  python3 seed_tws_test_data.py
The script is idempotent — it upserts by instance_id so re-running is safe.
"""

import sqlite3, json, datetime

DB = "infinity_db.sqlite"

conn = sqlite3.connect(DB)
cur  = conn.cursor()

# Resolve workflow ID dynamically
row = cur.execute("SELECT workflow_id FROM workflow_configurations WHERE workflow_name LIKE '%SWIFT%' LIMIT 1").fetchone()
if not row:
    print("ERROR: Golden Path workflow not found. Run seed_golden_path.py first.")
    exit(1)
WF = row[0]

# Resolve nodes dynamically
node_rows = cur.execute("SELECT node_id FROM workflow_nodes WHERE workflow_id = ? ORDER BY sequence_number ASC", (WF,)).fetchall()
if len(node_rows) < 5:
    print(f"ERROR: Expected at least 5 nodes, found {len(node_rows)}")
    exit(1)
NODES = [r[0] for r in node_rows]

def ts(offset_hours=0):
    """ISO timestamp relative to now, offset_hours can be negative for past."""
    t = datetime.datetime.utcnow() + datetime.timedelta(hours=offset_hours)
    return t.isoformat()

# One representative instance per lifecycle state we want to verify.
# Format: (instance_id, status, current_node_id, extra_cols_dict)
SEED = [
    # ── Active / in-flight ─────────────────────────────────────────────────
    ("TWS-PAUSED-01",
     "PAUSED",
     NODES[3],   # stuck at Dual Auth waiting for 4-eye sign-off
     {}),

    ("TWS-RUNNING-01",
     "RUNNING",
     NODES[2],   # FX enrichment in progress
     {}),

    ("TWS-RETRYING-01",
     "RETRYING",
     NODES[2],   # FX rate API timing out, 2 retries so far
     {
       "retry_attempts_log": json.dumps([
           {"attempt": 1, "timestamp": ts(-0.5), "error_code": "FX_TIMEOUT",
            "error_message": "FX rate service returned 504 after 30s"},
           {"attempt": 2, "timestamp": ts(-0.1), "error_code": "FX_TIMEOUT",
            "error_message": "FX rate service returned 504 after 30s"},
       ]),
     }),

    ("TWS-REPAIR-01",
     "AWAITING_REPAIR",
     NODES[1],   # AML screening routed to manual review queue
     {
       "repair_queue_assigned": "AML_MANUAL_REVIEW",
       "retry_attempts_log": json.dumps([
           {"attempt": 1, "timestamp": ts(-2), "error_code": "AML_SCREENING_ERR",
            "error_message": "Sanctions list service unavailable"},
           {"attempt": 2, "timestamp": ts(-1.5), "error_code": "AML_SCREENING_ERR",
            "error_message": "Sanctions list service unavailable"},
           {"attempt": 3, "timestamp": ts(-1), "error_code": "AML_SCREENING_ERR",
            "error_message": "Sanctions list service unavailable"},
       ]),
     }),

    # ── Terminal — system-driven failures ──────────────────────────────────
    ("TWS-REJECTED-01",
     "REJECTED",
     NODES[1],   # blocked at OFAC node
     {}),

    ("TWS-FAILED-01",
     "FAILED_TECHNICAL",
     NODES[4],   # RTGS settlement hard-failed after all retries
     {
       "retry_attempts_log": json.dumps([
           {"attempt": 1, "timestamp": ts(-3), "error_code": "RTGS_CONN_REFUSED",
            "error_message": "Connection refused by RTGS gateway"},
           {"attempt": 2, "timestamp": ts(-2.5), "error_code": "RTGS_CONN_REFUSED",
            "error_message": "Connection refused by RTGS gateway"},
           {"attempt": 3, "timestamp": ts(-2), "error_code": "RTGS_TIMEOUT",
            "error_message": "RTGS gateway timed out after 60s"},
       ]),
     }),

    # ── Terminal — voluntary / compliance ─────────────────────────────────
    ("TWS-CANCELLED-01",
     "CANCELLED",
     NODES[2],   # cancelled by AML rule
     {
       "cancelled_by": "rule",
       "cancelled_reason_code": "OFAC_HIT",
       "cancelled_message": "Beneficiary matched OFAC SDN list — transaction auto-cancelled",
     }),

    # ── Terminal — success ─────────────────────────────────────────────────
    ("TWS-COMPLETED-01",
     "COMPLETED",
     NODES[4],   # all 5 nodes completed
     {}),

    ("TWS-REVERSED-01",
     "REVERSED",
     NODES[3],   # completed then reversed at Dual Auth node
     {
       "reversal_request_id": "REV-2026-06-22-001",
     }),
]

# Database connection is already open and initialized at the top of the file

for inst_id, status, node_id, extras in SEED:
    # Build base context
    context = {"FIToFICstmrCdtTrf": {"CdtTrfTxInf": {"InstdAmt": {"Amt": 592500, "Ccy": "USD"}}}}

    # Build the upsert
    cols = {
        "instance_id":      inst_id,
        "workflow_id":      WF,
        "current_node_id":  node_id,
        "status":           status,
        "current_context":  json.dumps(context),
        "execution_trace":  json.dumps([]),
        "created_at":       ts(-24),   # seeded "yesterday"
        "updated_at":       ts(-1),
    }
    cols.update(extras)

    placeholders = ", ".join(["?"] * len(cols))
    col_names    = ", ".join(cols.keys())
    values       = list(cols.values())

    cur.execute(
        f"INSERT OR REPLACE INTO workflow_execution_instances ({col_names}) VALUES ({placeholders})",
        values,
    )
    print(f"  ✓ {inst_id:30s}  status={status:20s}  node={node_id}")

conn.commit()
conn.close()
print(f"\nSeeded {len(SEED)} test instances into {DB}.")
print("Open the Transaction Workflow Screen and use ⊕ Recent or 🔍 Search to load them.")
print("Key IDs to test:")
for inst_id, status, node_id, _ in SEED:
    print(f"  {inst_id}  →  {status}")
