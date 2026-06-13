import json
import datetime
import uuid

# Import our validated Lego Blocks from our previous execution steps
from registry_processor import CanonicalGatewayProcessor
from business_rules import BusinessRulesEngine
from governance_gate import GovernanceGateHub

class MasterCanvasOrchestrator:
    """
    MASTER CANVAS ORCHESTRATOR PIPELINE
    Pillar: Domain-Agnostic Process Fabric.
    Coordinates independent Lego block modules into an end-to-end processing stream.
    """
    def __init__(self, domain_scope: str):
        self.domain_scope = domain_scope
        self.gateway = CanonicalGatewayProcessor(domain_scope=domain_scope)
        self.governance_hub = GovernanceGateHub()
        
    def process_transaction_lifecycle(
        self, 
        raw_input_data: dict, 
        mapping_manifest: dict, 
        bre_ruleset_manifest: dict,
        historical_baseline_amount: float
    ):
        print(f"\n========================================================")
        print(f"STARTING TRANSACTION RUNTIME FOR DOMAIN: {self.domain_scope.upper()}")
        print(f"========================================================")

        # STEP 1: CANONICAL INGESTION & HARMONIZATION
        print("\n[Executing Lego Block 1/4]: Canonical Data Gateway Ingestion")
        harmonized_data = self.gateway.process_incoming_payload(raw_input_data, mapping_manifest)
        print("-> Output: Data successfully formatted to canonical BIAN/ISO parameters.")

        # Extract mapped calculation fields
        extracted_amount = harmonized_data["mapped_fields"].get("iso_cb_field_name", 0.0)

        # STEP 2: VARIANCE VERIFICATION & STATE VALIDATION
        print("\n[Executing Lego Block 2/4]: Variance Verification Guardrail")
        variance_detected = False
        
        if historical_baseline_amount > 0:
            deviation_percentage = abs(extracted_amount - historical_baseline_amount) / historical_baseline_amount
            if deviation_percentage > 0.01: # 1% strict mathematical limit
                variance_detected = True

        if variance_detected:
            print("!! SYSTEM RISK FLAG DETECTED: Variance exceeds 1% mathematical limit threshold !!")
            print("-> Diverting transaction execution sequence directly to Governance Queue...")
            
            # STEP 3A: GOVERNANCE INTERCEPT DROPS
            exception_task = self.governance_hub.create_exception_task(
                failed_execution_payload=harmonized_data,
                breach_reason=f"Transaction value deviates from baseline history by {deviation_percentage:.2%}"
            )
            return {
                "pipeline_status": "HALTED_IN_GOVERNANCE",
                "reason": "Variance Verification Exception",
                "governance_task_details": exception_task
            }

        print("-> Success: Variance checks clear. Transaction within safe operational boundaries.")

        # STEP 3B: BUSINESS RULES ENGINE (BRE) CALCULATION CASCADE
        print("\n[Executing Lego Block 3/4]: Business Rules Engine (BRE) Matrix")
        bre_engine = BusinessRulesEngine(bre_ruleset_manifest)
        calculation_output = bre_engine.execute_logic(harmonized_data)
        print("-> Success: Business rules and fractional splits processed.")

        # STEP 4: TRANSACTION STATE FINALIZATION & EVIDENCE PACKET GENERATION
        print("\n[Executing Lego Block 4/4]: Evidence Packet State Finalization")
        evidence_packet = {
            "evidence_id": f"EVID-{str(uuid.uuid4())[:8].upper()}",
            "anchored_timestamp": str(datetime.datetime.utcnow()),
            "domain_scope": self.domain_scope,
            "immutable_state_hash": str(uuid.uuid4()), # Distributed Trust Ledger integration hook
            "final_data_snapshot": calculation_output["final_calculated_state"],
            "execution_audit_trace": calculation_output["audit_trail_logs"]
        }
        
        print("-> Success: Evidence Packet hash anchor prepared for ledger commitment.")
        return {
            "pipeline_status": "FINALIZED_SUCCESSFULLY",
            "evidence_packet": evidence_packet
        }


if __name__ == "__main__":
    # Create an active runtime orchestrator engine instance
    orchestrator = MasterCanvasOrchestrator(domain_scope="Treasury")

    # Establish mock mapping configurations built via our frontend UI
    mock_mapping_manifest = {
        "manifest_version": "v2.1.0",
        "field_links": {
            "iso_msg_id": "transaction_id_99",
            "iso_cb_field_name": "raw_amount_field"
        }
    }

    # Establish mock business rule calculations stored as parameter data matrices
    mock_bre_manifest = {
        "rule_id": "RULE-CALC-GLOBAL-V4",
        "version": "v4.2.1",
        "calculation_steps": [
            {
                "step_name": "Operational Fee Split",
                "operation": "PERCENTAGE_SPLIT",
                "source_field": "iso_cb_field_name",
                "parameter": "0.02",
                "target_field": "allocated_fees"
            },
            {
                "step_name": "Maximum Safety Fee Cap",
                "operation": "CAP_LIMIT",
                "source_field": "allocated_fees",
                "parameter": "8000.00",
                "target_field": "final_sanitized_fees"
            }
        ]
    }

    # --- SIMULATION RUN 1: A PERFECTLY VALID TRANSACTION ---
    mock_valid_file_payload = {
        "transaction_id_99": "TXN-GOOD-101",
        "raw_amount_field": 540000.00,
        "lob_custom_extensions": {"asset_class": "GreenHydrogen"}
    }
    
    run_1_result = orchestrator.process_transaction_lifecycle(
        raw_input_data=mock_valid_file_payload,
        mapping_manifest=mock_mapping_manifest,
        bre_ruleset_manifest=mock_bre_manifest,
        historical_baseline_amount=539995.00 # Deviates by almost 0%, safely passing validation
    )
    print("\n[RUN 1 RESULT]:")
    print(json.dumps(run_1_result, indent=2))


    # --- SIMULATION RUN 2: AN ANOMALOUS TRANSACTION BREACHING THE CEILING ---
    mock_anomalous_file_payload = {
        "transaction_id_99": "TXN-SUSPECT-202",
        "raw_amount_field": 540000.00,
        "lob_custom_extensions": {"asset_class": "CleanEnergy"}
    }
    
    run_2_result = orchestrator.process_transaction_lifecycle(
        raw_input_data=mock_anomalous_file_payload,
        mapping_manifest=mock_mapping_manifest,
        bre_ruleset_manifest=mock_bre_manifest,
        historical_baseline_amount=400000.00 # Deviates heavily, breaching limit guardrails
    )
    print("\n[RUN 2 RESULT]:")
    print(json.dumps(run_2_result, indent=2))