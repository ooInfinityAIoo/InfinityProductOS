import unittest
from unittest.mock import MagicMock
import models
from services.workflow_executor import WorkflowExecutor

class TestWorkflowExecutorInvariants(unittest.TestCase):
    """
    Test suite to prove the absolute structural safety of the WorkflowExecutor.
    Specifically tests Layer 6 Guardrails: Double-Entry Balancing and Atomic Rollbacks.
    """

    def setUp(self):
        # 1. Create a mocked Database Session
        self.mock_db = MagicMock()
        
        # Mock the context manager for db.begin() so it safely executes in our test
        self.mock_db.begin.return_value.__enter__.return_value = MagicMock()
        
        # 2. Construct a mock Workflow Configuration and Financial Node
        self.mock_workflow = MagicMock()
        self.mock_workflow.workflow_id = "WF-TEST-001"
        self.mock_workflow.workflow_name = "Invariant Test Workflow"
        
        # We deliberately set node_code to 'POST_LEDGER' to trigger the Layer 6 guardrails
        self.mock_node = models.WorkflowNode(
            node_id="NODE-TEST",
            sequence_number=1,
            node_title="Test Financial Ledger Node",
            node_code="POST_LEDGER",
            orchestration_steps=[]
        )
        self.mock_workflow.nodes = [self.mock_node]
        
        # Route our mock DB to return the mocked workflow blueprint
        self.mock_db.query.return_value.filter.return_value.first.return_value = self.mock_workflow
        
        # Initialize the Executor
        self.executor = WorkflowExecutor(db=self.mock_db, workflow_id="WF-TEST-001")

    def test_balanced_ledger_passes_invariant(self):
        """Tests that a perfectly balanced transaction commits successfully."""
        context = {
            "api_responses": {
                "core_banking_api": {
                    "legs": [
                        {"type": "DEBIT", "amount": 150000.50},
                        {"type": "CREDIT", "amount": 150000.50}
                    ]
                }
            }
        }
        
        # Execute node actions; it should complete without raising an error
        self.executor._execute_node_actions(self.mock_node, context)
        
        # Verify the transaction block was initiated and passed
        self.mock_db.begin.assert_called_once()
        self.assertIn("✓ Invariant State Verification Passed", self.executor.execution_trace[-1])

    def test_unbalanced_ledger_triggers_fatal_rollback(self):
        """Tests that a ledger variance immediately triggers a ValueError to force a DB Rollback."""
        context = {
            "api_responses": {
                "core_banking_api": {
                    "legs": [
                        {"type": "DEBIT", "amount": 150000.50},
                        {"type": "CREDIT", "amount": 150000.00} # $0.50 missing!
                    ]
                }
            }
        }
        
        # Execute node actions; it MUST raise a ValueError to trip the 'with db.begin():' rollback
        with self.assertRaises(ValueError) as exception_context:
            self.executor._execute_node_actions(self.mock_node, context)
        
        # Verify the specific exception and trace log
        self.assertIn("Imbalanced transaction", str(exception_context.exception))
        self.assertIn("[FATAL_INVARIANT_ERROR]", self.executor.execution_trace[-1])

if __name__ == '__main__':
    unittest.main()