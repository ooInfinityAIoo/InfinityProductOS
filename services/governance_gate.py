import uuid
import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session
from models import EvidencePacketRegistry
import asyncio
from event_bus import global_event_bus, SystemEvent

class GovernanceGateHub:
    """
    GOVERNANCE ENGINE HUB (4-EYE NODE)
    Pillar: Audit-by-Design and Multi-Party Control.
    Safeguards the state engine by catching exceptions and managing manual overrides.
    """
    def __init__(self, db: Session):
        self.db = db

    def create_exception_task(self, raw_data: Dict[str, Any], deviation: float) -> Dict[str, Any]:
        """
        Intercepts a failed data stream step and writes it securely to the database.
        Requires an explicit SME action before it can proceed.
        """
        task_id = f"TASK-{str(uuid.uuid4())[:8].upper()}"
        
        failed_packet = EvidencePacketRegistry(
            packet_id=task_id,
            operator_maker="System_Auto_Flag",
            authorizer_checker="PENDING_SME_OVERRIDE",
            raw_payload_reference=str(raw_data.get("transaction_id_99", "UNKNOWN")),
            blockchain_tx_hash="HALTED_LIMIT_BREACH",
            variance_metric_logged=f"Deviation: {deviation:.2%}",
            execution_status="HALTED_IN_GOVERNANCE",
            created_at=datetime.datetime.utcnow().isoformat()
        )
        self.db.add(failed_packet)
        self.db.commit()
        
        # --- BROADCAST GOVERNANCE TASK CREATED EVENT ---
        event_payload = {
            "task_id": task_id,
            "status": "PENDING_SME_REVIEW",
            "deviation": f"{deviation:.2%}",
            "raw_payload_reference": failed_packet.raw_payload_reference
        }
        asyncio.run(global_event_bus.broadcast(SystemEvent(
            event_type="GOVERNANCE_TASK_CREATED",
            source_context="GovernanceGateHub",
            payload=event_payload
        )))
        
        return {
            "task_id": task_id,
            "status": "PENDING_SME_REVIEW",
            "deviation": f"{deviation:.2%}"
        }

    def authorize_exception_task(self, task_id: str, authorizer_sme: str, action: str) -> Dict[str, Any]:
        """
        Implements the 4-Eye Checker step. An SME authorizes or rejects the held exception transaction.
        """
        task = self.db.query(EvidencePacketRegistry).filter(EvidencePacketRegistry.packet_id == task_id).first()
        if not task:
            return {"error": f"Task {task_id} not found in governance queue."}
            
        if task.execution_status != "HALTED_IN_GOVERNANCE":
            return {"error": f"Task {task_id} has already been processed."}
            
        task.execution_status = "AUTHORIZED_REPROCESSED" if action == "APPROVE" else "REJECTED_DEAD"
        task.authorizer_checker = authorizer_sme
        task.updated_at = datetime.datetime.utcnow().isoformat()
        if action == "APPROVE":
            task.blockchain_tx_hash = f"governance_sig_{uuid.uuid4().hex[:16]}"
        self.db.commit()
        
        # --- BROADCAST GOVERNANCE TASK RESOLVED EVENT ---
        event_payload = {
            "task_id": task.packet_id,
            "status": task.execution_status,
            "resolved_by": authorizer_sme,
            "action": action
        }
        asyncio.run(global_event_bus.broadcast(SystemEvent(
            event_type="GOVERNANCE_TASK_RESOLVED",
            source_context="GovernanceGateHub",
            payload=event_payload
        )))
        
        return {
            "task_id": task.packet_id, "status": task.execution_status, "checker_identity": task.authorizer_checker,
            "resolution_action": action, "resolved_at": str(datetime.datetime.utcnow()), "governance_signature_token": task.blockchain_tx_hash if action == "APPROVE" else None
        }