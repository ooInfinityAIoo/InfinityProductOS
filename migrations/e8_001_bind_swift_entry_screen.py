"""
E8 commit 1 — Bind the SWIFT Wire Payment Entry screen to its workflow start node.

WHY THIS FILE EXISTS:
The Transaction Workflow Screen's manual-capture flow is being made
definition-driven (TXN_SCREEN_LAYOUT_LANGUAGE.md iteration 6): instead of a
hardcoded form, the operator captures a new transaction by filling in the
START node's authored screen, rendered by RuntimeScreenRenderer.

For that to work the START node must actually point at a screen. The golden-path
seed created the 'SWIFT Wire Payment Entry' screen (SCR-8AE80048, 10 ISO-bound
components) and the Cross-Border SWIFT Wire workflow (WF-ECC2B272) — but never
linked them. This migration sets workflow_nodes.screen_template on that
workflow's first node (by sequence_number) so the capture form has something to
render. Idempotent: running twice is a no-op.

HOW TO RUN:
    python -m migrations.e8_001_bind_swift_entry_screen
"""
from __future__ import annotations

from database import SessionLocal
import models

# The authored capture screen and the workflow whose entry node it belongs to.
SCREEN_ID = "SCR-8AE80048"          # 'SWIFT Wire Payment Entry'
WORKFLOW_ID = "WF-ECC2B272"         # 'Cross-Border SWIFT Wire Processing'


def run() -> int:
    db = SessionLocal()
    try:
        screen = db.query(models.ScreenTemplate).filter_by(screen_id=SCREEN_ID).first()
        if not screen:
            print(f"[skip] screen {SCREEN_ID} not found — run seed_golden_path.py first")
            return 0

        nodes = (
            db.query(models.WorkflowNode)
            .filter_by(workflow_id=WORKFLOW_ID)
            .order_by(models.WorkflowNode.sequence_number)
            .all()
        )
        if not nodes:
            print(f"[skip] workflow {WORKFLOW_ID} has no nodes")
            return 0

        start = nodes[0]
        if start.screen_template == SCREEN_ID:
            print(f"[ok] {start.node_id} ('{start.node_title}') already bound to {SCREEN_ID}")
            return 0

        start.screen_template = SCREEN_ID
        db.commit()
        print(f"[done] bound {SCREEN_ID} to start node {start.node_id} ('{start.node_title}')")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    run()
