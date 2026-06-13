import json
import uuid
import datetime
from typing import Dict, Any, List

class GovernanceGateHub:
    """
    GOVERNANCE ENGINE HUB (4-EYE NODE)
    Pillar: Audit-by-Design and Multi-Party Control.
    Safeguards the state engine by catching exceptions and managing manual overrides.
    """
    def __init__(self):
        # Local mock registry simulating our pending task queue
        self.pending_approval_queue: Dict[str, Dict[str, Any]] = {}

    def create_exception_task(self, failed_execution_payload: Dict[str, Any], breach_reason: str) -> Dict[str, Any]:
        """
        Intercepts a failed data stream step and holds it securely in a pending state.
        Requires an explicit SME action before it can proceed.
        """
        task_id = f"TASK-{str(uuid.uuid4())[:8].upper()}"
        
        task_record = {
            "task_id": task_id,
            "created_at": str(datetime.datetime.utcnow()),
            "status": "PENDING_SME_REVIEW",
            "breach_reason": breach_reason,
            "original_payload": failed_execution_payload,
            "maker_identity": "System_Auto_Flag",
            "checker_identity": None,
            "resolution_action": None
        }
        
        # Save to our local in-memory registry database
        self.pending_approval_queue[task_id] = task_record
        return task_record

    def authorize_exception_task(self, task_id: str, authorizer_sme: str, action: str) -> Dict[str, Any]:
        """
        Implements the 4-Eye Checker step. An SME authorizes or rejects 
        the held exception transaction.
        """
        if task_id not in self.pending_approval_queue:
            return {"error": f"Task {task_id} not found in governance queue."}
            
        task = self.pending_approval_queue[task_id]
        
        if task["status"] != "PENDING_SME_REVIEW":
            return {"error": f"Task {task_id} has already been processed."}
            
        # Update the task state parameters
        task["status"] = "AUTHORIZED_REPROCESSED" if action == "APPROVE" else "REJECTED_DEAD"
        task["checker_identity"] = authorizer_sme
        task["resolution_action"] = action
        task["resolved_at"] = str(datetime.datetime.utcnow())
        
        # Generate the signature hash token for the final Evidence Packet
        task["governance_signature_token"] = str(uuid.uuid4()) if action == "APPROVE" else None
        
        return task


if __name__ == "__main__":
    print("Initializing test run of the Governance Hub Engine...")
    hub = GovernanceGateHub()
    
    # 1. Simulate a transaction payload that breached the 1% variance ceiling earlier
    mock_failed_payload = {
        "block_type": "VarianceVerification",
        "amount": 540000.00,
        "baseline_history_amount": 400000.00
    }
    
    # 2. Intercept and create a pending 4-Eye exception task
    print("\n[Step 1] Intercepting anomalous transaction and routing to queue...")
    new_task = hub.create_exception_task(mock_failed_payload, breach_reason="Mathematical variance limit exceeded 1% threshold.")
    print(json.dumps(new_task, indent=2))
    
    # 3. Simulate a secondary SME (Checker) logging in to authorize the item
    target_id = new_task["task_id"]
    print(f"\n[Step 2] Simulating secondary checker approving Task ID: {target_id}...")
    approval_result = hub.authorize_exception_task(task_id=target_id, authorizer_sme="Nisarg_Shah_SME", action="APPROVE")
    
    print("\n--- GOVERNANCE HUB 4-EYE EXECUTION COMPLETE ---")
    print(json.dumps(approval_result, indent=2))