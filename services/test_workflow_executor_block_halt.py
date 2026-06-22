"""
Unit test for Finding C3: the executor must HALT on a BLOCK_PAYMENT / REJECT_STEP action.

Strategy: build a real WorkflowExecutor against a mocked DB session and a single mocked
node, then mock _execute_node_actions to inject the block markers that the rule engine
would have set on the runtime context. We assert the executor terminates with
status=REJECTED, persists a REJECTED execution-instance, surfaces blocks[], and does
NOT walk to a next node.
"""
import unittest
from unittest.mock import MagicMock, patch

import models
from services.workflow_executor import WorkflowExecutor


class TestWorkflowBlockHalt(unittest.TestCase):

    def _make_executor(self):
        mock_db = MagicMock()
        mock_db.in_transaction.return_value = False
        mock_db.begin.return_value.__enter__.return_value = MagicMock()
        mock_db.begin_nested.return_value.__enter__.return_value = MagicMock()

        # One node — a simple validation step, no required documents, no approvals.
        node = models.WorkflowNode(
            node_id="NODE-1",
            sequence_number=1,
            node_title="AML & OFAC Screening",
            node_code="VALIDATE",
            orchestration_steps=[],
        )
        wf = MagicMock()
        wf.workflow_id = "WF-BLOCK-TEST"
        wf.workflow_name = "Block-Halt Test Workflow"
        wf.nodes = [node]
        mock_db.query.return_value.filter.return_value.first.return_value = wf

        ex = WorkflowExecutor(db=mock_db, workflow_id="WF-BLOCK-TEST")
        return ex, mock_db, node

    def test_block_halts_workflow_as_rejected(self):
        ex, mock_db, _node = self._make_executor()

        # Simulate the rule engine setting _blocked + _blocks on the context — this is
        # what happens after BusinessRuleEngine evaluates a rule with a BLOCK_PAYMENT action.
        def fake_actions(_node, context):
            context["_blocked"] = True
            context["_blocks"] = [{
                "type": "BLOCK_PAYMENT",
                "message": "Beneficiary matched OFAC SDN.",
            }]
            context["_emitted_events"] = ["EVT_OFAC_HIT_DETECTED"]
            return context

        with patch.object(ex, "_execute_node_actions", side_effect=fake_actions):
            result = ex.execute(initial_payload={"FIToFICstmrCdtTrf.CdtTrfTxInf.Cdtr.Nm": "ROSBANK"})

        # 1. Status
        self.assertEqual(result["status"], "REJECTED")
        # 2. Block context surfaced in the response
        self.assertEqual(result["blocked_at_node"], "AML & OFAC Screening")
        self.assertEqual(len(result["blocks"]), 1)
        self.assertEqual(result["blocks"][0]["type"], "BLOCK_PAYMENT")
        # 3. A REJECTED execution-instance was persisted
        # Find the WorkflowExecutionInstance that was added; assert its status.
        added = [c.args[0] for c in mock_db.add.call_args_list
                 if isinstance(c.args[0], models.WorkflowExecutionInstance)]
        self.assertTrue(added, "Expected the executor to persist a WorkflowExecutionInstance.")
        self.assertEqual(added[-1].status, "REJECTED")
        # 4. The trace contains the [REJECTED] line
        self.assertTrue(any("[REJECTED]" in line for line in result["trace"]),
                        msg=f"Expected a [REJECTED] line in trace; got: {result['trace']}")

    def test_unblocked_workflow_proceeds_past_node(self):
        """Regression guard: when _blocked is NOT set, the executor must NOT halt at the node."""
        ex, _mock_db, _node = self._make_executor()

        def fake_actions(_node, context):
            # No _blocked / _blocks — just record a flag like a normal AML high-value rule would.
            context["_review_flags"] = ["High-value cross-border transfer requires AML review."]
            return context

        with patch.object(ex, "_execute_node_actions", side_effect=fake_actions):
            result = ex.execute(initial_payload={})
        # Single-node workflow + no block -> COMPLETED, NOT rejected.
        self.assertEqual(result["status"], "COMPLETED")
        self.assertNotIn("blocked_at_node", result)


if __name__ == "__main__":
    unittest.main()
