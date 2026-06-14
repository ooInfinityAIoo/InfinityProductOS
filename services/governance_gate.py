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

    def create_concurrency_conflict_task(self, entity_type: str, entity_id: str, attempted_payload: Dict[str, Any], operator_id: str) -> Dict[str, Any]:
        """
        Intercepts an Optimistic Concurrency Control (OCC) collision (StaleDataError).
        Routes the conflicting update to the 4-Eye check queue instead of dropping the transaction.
        """
        task_id = f"TASK-{str(uuid.uuid4())[:8].upper()}"
        
        failed_packet = EvidencePacketRegistry(
            packet_id=task_id,
            operator_maker=operator_id,
            authorizer_checker="PENDING_SME_OVERRIDE",
            raw_payload_reference=str(entity_id),
            blockchain_tx_hash="CONCURRENT_UPDATE_CONFLICT",
            variance_metric_logged=f"Entity: {entity_type}",
            execution_status="HALTED_IN_GOVERNANCE",
            created_at=datetime.datetime.utcnow().isoformat()
        )
        self.db.add(failed_packet)
        self.db.commit()
        
        event_payload = {
            "task_id": task_id,
            "status": "PENDING_SME_REVIEW",
            "conflict_type": "OCC_STALE_DATA",
            "entity": entity_type,
            "entity_id": entity_id
        }
        asyncio.run(global_event_bus.broadcast(SystemEvent(
            event_type="GOVERNANCE_TASK_CREATED", source_context="GovernanceGateHub.Concurrency", payload=event_payload
        )))
        
        return {"task_id": task_id, "status": "PENDING_SME_REVIEW", "conflict_type": "OCC_STALE_DATA"}

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

    def bulk_authorize_exception_tasks(self, task_ids: List[str], authorizer_sme: str, action: str, comment_text: str) -> Dict[str, Any]:
        """
        Processes a list of governance tasks in bulk. This is an administrative function.
        """
        success_count = 0
        failed_count = 0
        details = []

        for task_id in task_ids:
            task = self.db.query(EvidencePacketRegistry).filter(EvidencePacketRegistry.packet_id == task_id).first()
            if not task:
                failed_count += 1
                details.append({"task_id": task_id, "status": "FAILED", "reason": "Task not found."})
                continue
            
            if task.execution_status != "HALTED_IN_GOVERNANCE":
                failed_count += 1
                details.append({"task_id": task_id, "status": "FAILED", "reason": f"Task already processed with status '{task.execution_status}'."})
                continue

            # Reuse the single-task authorization logic but without the event broadcast for each one
            task.execution_status = "AUTHORIZED_REPROCESSED" if action == "APPROVE" else "REJECTED_DEAD"
            task.authorizer_checker = authorizer_sme
            task.updated_at = datetime.datetime.utcnow().isoformat()
            if action == "APPROVE":
                task.blockchain_tx_hash = f"governance_sig_bulk_{uuid.uuid4().hex[:10]}"
            
            success_count += 1
            details.append({"task_id": task_id, "status": "SUCCESS", "reason": f"Task successfully {action.lower()}d."})

        self.db.commit()
        return {"success_count": success_count, "failed_count": failed_count, "details": details}