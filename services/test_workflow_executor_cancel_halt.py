"""
Unit test for E0 commit 3/N — the executor must HALT on a CANCEL_TRANSACTION action.

WHY THIS FILE EXISTS:
Mirrors test_workflow_executor_block_halt.py (Finding C3) for the new
CANCEL_TRANSACTION verb introduced in E0 commit 2/N. The semantics MUST be
distinct from BLOCK / REJECT:
  BLOCK_PAYMENT / REJECT_STEP  -> status=REJECTED  (system-driven, red on tracker)
  CANCEL_TRANSACTION           -> status=CANCELLED (policy-driven, purple on tracker)
Both terminate at the offending node; the difference is the audit reason and
the lifecycle state the runtime UI renders.

Strategy: build a real WorkflowExecutor against a mocked DB session and a single
mocked node, then mock _execute_node_actions to inject the cancellation markers
that the rule engine would have set on the runtime context. We assert the
executor terminates with status=CANCELLED, persists a CANCELLED
WorkflowExecutionInstance with cancelled_by='rule' + reason_code + message,
surfaces cancellations[] in the response, and does NOT walk to a next node.

WHAT BREAKS IF REMOVED:
A rule firing CANCEL_TRANSACTION could silently no-op (no halt, no persisted
audit row) and operators would lose visibility of policy-driven cancellations.
"""
import unittest
from unittest.mock import MagicMock, patch

import models
from services.workflow_executor import WorkflowExecutor


class TestWorkflowCancelHalt(unittest.TestCase):

    def _make_executor(self):
        mock_db = MagicMock()
        mock_db.in_transaction.return_value = False
        mock_db.begin.return_value.__enter__.return_value = MagicMock()
        mock_db.begin_nested.return_value.__enter__.return_value = MagicMock()

        # One node — a generic policy-check step.
        node = models.WorkflowNode(
            node_id="NODE-1",
            sequence_number=1,
            node_title="Pre-flight Policy Check",
            node_code="VALIDATE",
            orchestration_steps=[],
        )
        wf = MagicMock()
        wf.workflow_id = "WF-CANCEL-TEST"
        wf.workflow_name = "Cancel-Halt Test Workflow"
        wf.nodes = [node]
        mock_db.query.return_value.filter.return_value.first.return_value = wf

        ex = WorkflowExecutor(db=mock_db, workflow_id="WF-CANCEL-TEST")
        return ex, mock_db, node

    def test_cancel_halts_workflow_as_cancelled(self):
        ex, mock_db, _node = self._make_executor()

        # Simulate what BusinessRuleEngine's CANCEL_TRANSACTION handler sets on context
        # (verified by services/test_business_rule_engine_adapter.py commit 2/N tests).
        def fake_actions(_node, context):
            context["_cancelled"] = True
            context["_cancel_reason_code"] = "ACCOUNT_FROZEN"
            context["_cancel_message"] = "Customer account frozen mid-flight."
            context["_cancellations"] = [{
                "reason_code": "ACCOUNT_FROZEN",
                "message": "Customer account frozen mid-flight.",
            }]
            return context

        with patch.object(ex, "_execute_node_actions", side_effect=fake_actions):
            result = ex.execute(initial_payload={"customer_id": "CUST-001"})

        # 1. Status
        self.assertEqual(result["status"], "CANCELLED")
        # 2. Cancellation context surfaced in the response
        self.assertEqual(result["cancelled_at_node"], "Pre-flight Policy Check")
        self.assertEqual(result["cancelled_by"], "rule")
        self.assertEqual(result["cancelled_reason_code"], "ACCOUNT_FROZEN")
        self.assertEqual(result["cancelled_message"], "Customer account frozen mid-flight.")
        self.assertEqual(len(result["cancellations"]), 1)
        # 3. A CANCELLED execution-instance was persisted with the audit columns populated
        added = [c.args[0] for c in mock_db.add.call_args_list
                 if isinstance(c.args[0], models.WorkflowExecutionInstance)]
        self.assertTrue(added, "Expected the executor to persist a WorkflowExecutionInstance.")
        instance = added[-1]
        self.assertEqual(instance.status, "CANCELLED")
        self.assertEqual(instance.cancelled_by, "rule")
        self.assertEqual(instance.cancelled_reason_code, "ACCOUNT_FROZEN")
        self.assertEqual(instance.cancelled_message, "Customer account frozen mid-flight.")
        # 4. The trace contains the [CANCELLED] line
        self.assertTrue(any("[CANCELLED]" in line for line in result["trace"]),
                        msg=f"Expected a [CANCELLED] line in trace; got: {result['trace']}")

    def test_cancel_distinct_from_block(self):
        """A cancelled run must produce status=CANCELLED, not REJECTED.

        The whole point of E0's CANCEL_TRANSACTION verb is the distinct semantic vs.
        BLOCK / REJECT (Finding C3). If this assertion ever flips, the executor has
        collapsed the two into one — which would break the runtime UI's purple-vs-red
        color rule and lose the policy-driven audit trail.
        """
        ex, _mock_db, _node = self._make_executor()

        def fake_actions(_node, context):
            context["_cancelled"] = True
            context["_cancel_reason_code"] = "POLICY_DECISION"
            context["_cancel_message"] = "Cancelled by treasury policy."
            return context

        with patch.object(ex, "_execute_node_actions", side_effect=fake_actions):
            result = ex.execute(initial_payload={})
        self.assertEqual(result["status"], "CANCELLED")
        self.assertNotEqual(result["status"], "REJECTED")
        # REJECTED-shape keys must not appear in a CANCELLED response.
        self.assertNotIn("blocked_at_node", result)
        self.assertNotIn("blocks", result)

    def test_uncancelled_workflow_proceeds_past_node(self):
        """Regression guard: when _cancelled is NOT set, the executor must NOT halt."""
        ex, _mock_db, _node = self._make_executor()

        def fake_actions(_node, context):
            # Just record a flag like a normal review rule would — no cancel signal.
            context["_review_flags"] = ["Normal flag, not a cancel."]
            return context

        with patch.object(ex, "_execute_node_actions", side_effect=fake_actions):
            result = ex.execute(initial_payload={})
        # Single-node workflow + no cancel -> COMPLETED.
        self.assertEqual(result["status"], "COMPLETED")
        self.assertNotIn("cancelled_at_node", result)


if __name__ == "__main__":
    unittest.main()
