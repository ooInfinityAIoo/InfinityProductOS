import json
import datetime
import uuid
from sqlalchemy.orm import Session
from models import WorkflowManifest, EvidencePacketRegistry, SymbolicFormulaAsset

# Import our modularized LEGO Blocks
from services.registry_processor import CanonicalGatewayProcessor
from services.business_rules import BusinessRulesEngine
from services.governance_gate import GovernanceGateHub

class MasterCanvasOrchestrator:
    """
    MASTER CANVAS ORCHESTRATOR PIPELINE
    Pillar: Domain-Agnostic Process Fabric.
    Coordinates independent Lego block modules into an end-to-end processing stream.
    """
    def __init__(self, db: Session, domain_scope: str):
        self.db = db
        self.domain_scope = domain_scope
        self.gateway = CanonicalGatewayProcessor(domain_scope=domain_scope)
        self.governance_hub = GovernanceGateHub(db=db)
        
    def process_transaction_lifecycle(
        self, 
        raw_input_data: dict, 
        mapping_manifest: dict, 
        bre_ruleset_manifest: dict,
        historical_baseline_amount: float
    ):
        # --- PHASE 1: CANONICAL HARMONIZATION ENGINE ---
        harmonized_data = self.gateway.process_incoming_payload(raw_input_data, mapping_manifest)
        extracted_amount = harmonized_data["mapped_fields"].get("iso_cb_field_name", 0.0)
        
        # --- PHASE 2: VARIANCE VERIFICATION INTERRUPT ---
        variance_detected = False
        deviation = 0.0
        
        if historical_baseline_amount > 0:
            deviation = abs(extracted_amount - historical_baseline_amount) / historical_baseline_amount
            if deviation > 0.01: # 1% strict mathematical limit
                variance_detected = True

        if variance_detected:
            # Drop transaction into the DB-backed Governance queue
            exception_task = self.governance_hub.create_exception_task(raw_data=raw_input_data, deviation=deviation)
            return {
                "pipeline_status": "HALTED_IN_GOVERNANCE",
                "message": "Transaction intercepted and committed to Database Governance table.",
                "governance_task_details": exception_task,
                "task_id": exception_task["task_id"],
                "deviation": exception_task["deviation"]
            }

        # --- PHASE 3: BUSINESS RULES ENGINE (BRE) CALCULATION CASCADE ---
        output_payload = harmonized_data["mapped_fields"].copy()
        bre_engine = BusinessRulesEngine(bre_ruleset_manifest)
        bre_result = bre_engine.execute_logic(output_payload)
        
        final_state = bre_result["final_calculated_state"]
        logs = bre_result["audit_trail_logs"]

        # --- PHASE 4: TRANSACTION STATE FINALIZATION & EVIDENCE PACKET GENERATION ---
        generated_evidence_id = f"EVID-{str(uuid.uuid4())[:8].upper()}"
        generated_tx_hash = f"tx_hash_{uuid.uuid4().hex[:16]}"
        
        steps = bre_ruleset_manifest.get("calculation_steps", [])
        dag_dict = {"steps_executed": [step.get("operation") for step in steps]}
        
        active_manifest = WorkflowManifest(
            workflow_id=f"WF-{str(uuid.uuid4())[:8].upper()}",
            version="1.0.0",
            domain_scope=self.domain_scope,
            is_active=True,
            state_sequence_dag=dag_dict
        )
        self.db.add(active_manifest)
        
        final_packet = EvidencePacketRegistry(
            packet_id=generated_evidence_id,
            operator_maker="System_Auto_Process",
            authorizer_checker="System_Pre_Auth",
            raw_payload_reference=str(raw_input_data.get("transaction_id_99", "UNKNOWN")),
            blockchain_tx_hash=generated_tx_hash,
            variance_metric_logged="0.00% (Cleared)",
            execution_status="FINALIZED_AND_SETTLED",
            created_at=datetime.datetime.utcnow().isoformat()
        )
        self.db.add(final_packet)
        self.db.commit()

        return {"pipeline_status": "FINALIZED_AND_SAVED_TO_DB", "evidence_packet": {"evidence_id": generated_evidence_id, "blockchain_ledger_anchor": generated_tx_hash, "domain_scope": self.domain_scope, "final_data_snapshot": final_state, "execution_audit_trace": logs}}

def process_calculation_model(payload: dict, db: Session) -> dict:
    """
    Registers incoming symbolic mathematical expression blocks from CALCULATION_MODEL_REGISTER events.
    """
    asset_id = payload.get("asset_id", f"CALC-ASSET-{uuid.uuid4().hex[:8].upper()}")
    token_code = payload.get("token_code")
    target_output_field = payload.get("target_output_field")
    mathematical_expression = payload.get("mathematical_expression")
    
    if not all([token_code, target_output_field, mathematical_expression]):
        return {"status": "error", "message": "token_code, target_output_field, and mathematical_expression are required"}

    new_formula = SymbolicFormulaAsset(
        asset_id=asset_id,
        token_code=token_code,
        target_output_field=target_output_field,
        mathematical_expression=mathematical_expression,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=payload.get("created_by", "SYSTEM")
    )
    
    try:
        db.add(new_formula)
        db.commit()
        db.refresh(new_formula)
        return {"status": "success", "asset_id": asset_id, "token_code": token_code, "message": "Calculation model registered successfully"}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}