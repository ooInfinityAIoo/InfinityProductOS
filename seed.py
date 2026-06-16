import os
import json
import datetime
import uuid
from database import SessionLocal, engine
import models
from models import ISOFieldDefinition, WorkflowConfiguration, WorkflowNode, WorkflowEdge, BusinessRuleSet

# Initialize clean database schema
models.Base.metadata.create_all(bind=engine)

db = SessionLocal()

try:
    # Check if fields already exist (idempotent seeding)
    existing_fields = db.query(ISOFieldDefinition).count()
    
    if existing_fields == 0:
        print("✓ Seeding ISO Field Registry with initial definitions...")
        
        # Bootstrap with core HELOC/FIGRE fields from index.html
        initial_fields = [
            {
                "technical_sys_name": "of_fintax_bal_01",
                "preferred_business_name": "Principal Amount",
                "iso_business_name": "Balances.Principal",
                "data_type": "Decimal",
                "domain_category": "HELOC",
                "subdomain_category": "FIGRE",
                "description": "Primary loan balance amount",
                "is_mandatory": True,
                "default_value": "0.00",
                "is_pii": False
            },
            {
                "technical_sys_name": "of_fintax_rate_05",
                "preferred_business_name": "Interest Rate Margin",
                "iso_business_name": "Rates.Margin",
                "data_type": "Alphanumeric",
                "domain_category": "HELOC",
                "subdomain_category": "FIGRE",
                "description": "Interest rate margin percentage",
                "is_mandatory": True,
                "default_value": "0.00",
                "is_pii": False
            },
            {
                "technical_sys_name": "of_fintax_date_09",
                "preferred_business_name": "Value Date",
                "iso_business_name": "Timeline.ValueDate",
                "data_type": "Date",
                "domain_category": "HELOC",
                "subdomain_category": "FIGRE",
                "description": "Effective date of transaction",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": False
            },
            {
                "technical_sys_name": "of_fintax_date_12",
                "preferred_business_name": "Ingestion Date",
                "iso_business_name": "Timeline.IngestDate",
                "data_type": "Date",
                "domain_category": "HELOC",
                "subdomain_category": "FIGRE",
                "description": "System ingestion timestamp",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": False
            },
            # Additional ISO 20022 fields for payments domain
            {
                "technical_sys_name": "iso_msg_id",
                "preferred_business_name": "Message ID",
                "iso_business_name": "Message.ID",
                "data_type": "Alphanumeric",
                "domain_category": "PAYMENTS",
                "subdomain_category": "RTGS",
                "description": "Unique message identifier",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": False
            },
            {
                "technical_sys_name": "iso_cb_field_name",
                "preferred_business_name": "Transaction Amount",
                "iso_business_name": "Amounts.TransactionAmount",
                "data_type": "Amount",
                "domain_category": "PAYMENTS",
                "subdomain_category": "RTGS",
                "description": "Core settlement amount",
                "is_mandatory": True,
                "default_value": "0.00",
                "is_pii": False
            },
            # Treasury domain fields
            {
                "technical_sys_name": "tsy_ccy_code",
                "preferred_business_name": "Currency Code",
                "iso_business_name": "Settlement.CurrencyCode",
                "data_type": "Alphanumeric",
                "domain_category": "TREASURY",
                "subdomain_category": "FX_TRADING",
                "description": "ISO 4217 currency code",
                "is_mandatory": True,
                "default_value": "USD",
                "is_pii": False
            },
            {
                "technical_sys_name": "tsy_settlement_date",
                "preferred_business_name": "Settlement Date",
                "iso_business_name": "Settlement.Date",
                "data_type": "Date",
                "domain_category": "TREASURY",
                "subdomain_category": "FX_TRADING",
                "description": "Date funds are settled",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": False
            },
            # New PII fields for demonstration
            {
                "technical_sys_name": "customer_name",
                "preferred_business_name": "Customer Name",
                "iso_business_name": "Customer.Name",
                "data_type": "Text",
                "domain_category": "PAYMENTS",
                "subdomain_category": "CUSTOMER_DATA",
                "description": "Full legal name of the customer.",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": True,
                "masking_strategy": "REDACT_ALL"
            },
            {
                "technical_sys_name": "account_number",
                "preferred_business_name": "Account Number",
                "iso_business_name": "Account.Number",
                "data_type": "Alphanumeric",
                "domain_category": "PAYMENTS",
                "subdomain_category": "CUSTOMER_DATA",
                "description": "The customer's account number.",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": True,
                "masking_strategy": "SHOW_LAST_4"
            },
            {
                "technical_sys_name": "customer_email",
                "preferred_business_name": "Customer Email",
                "iso_business_name": "Customer.Contact.Email",
                "data_type": "Email",
                "domain_category": "PAYMENTS",
                "subdomain_category": "CUSTOMER_DATA",
                "description": "The customer's primary email address.",
                "is_mandatory": False,
                "default_value": None,
                "is_pii": True,
                "masking_strategy": "EMAIL"
            },
            {
                "technical_sys_name": "customer_phone",
                "preferred_business_name": "Customer Phone",
                "iso_business_name": "Customer.Contact.Phone",
                "data_type": "Alphanumeric",
                "domain_category": "PAYMENTS",
                "subdomain_category": "CUSTOMER_DATA",
                "description": "The customer's primary phone number.",
                "is_mandatory": False,
                "default_value": None,
                "is_pii": True,
                "masking_strategy": "PHONE"
            },
            # Polymorphic field for Layer 3 demonstration
            {
                "technical_sys_name": "tax_identifier",
                "preferred_business_name": "Taxpayer Identification Number",
                "iso_business_name": "Party.TaxIdentification.Number",
                "data_type": "Alphanumeric",
                "domain_category": "CUSTOMER_DATA",
                "subdomain_category": "IDENTIFICATION",
                "description": "A generic taxpayer identification number.",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": True,
                "masking_strategy": "SHOW_LAST_4",
                "localized_overrides": {
                    "US": {"preferred_business_name": "Social Security Number (SSN)"}
                }
            }
        ]
        
        current_time = str(datetime.datetime.utcnow())
        
        for idx, field_spec in enumerate(initial_fields):
            field_id = f"FIELD-{field_spec['domain_category'][:4]}-{str(idx).zfill(4)}"
            
            field = ISOFieldDefinition(
                field_id=field_id,
                technical_sys_name=field_spec["technical_sys_name"],
                preferred_business_name=field_spec["preferred_business_name"],
                iso_business_name=field_spec["iso_business_name"],
                data_type=field_spec["data_type"],
                domain_category=field_spec["domain_category"],
                subdomain_category=field_spec["subdomain_category"],
                description=field_spec["description"],
                is_mandatory=field_spec["is_mandatory"],
                is_pii=field_spec.get("is_pii", False),
                masking_strategy=field_spec.get("masking_strategy"),
                localized_overrides=field_spec.get("localized_overrides"),
                default_value=field_spec["default_value"],
                created_at=current_time,
                created_by="SEED_BOOTSTRAP"
            )
            db.add(field)
        
        db.commit()
        print(f"✓ Seeded {len(initial_fields)} ISO field definitions")
    else:
        print(f"✓ Field registry already populated with {existing_fields} fields")
    
    # --- Seed Core Business Rules ---
    print("\n✓ Seeding Core Business Rules...")
    rules_to_seed = [
        {
            "business_name": "Check if User Confirmed",
            "token_code": "BRE-IS-USER-CONFIRMED-V1",
            "description": "Checks if the user_confirmation_status field is 'CONFIRMED'.",
            "rules": [{
                "priority": 100,
                "conditions": [{
                    "left_hand_side": {"source_fields": ["user_confirmation_status"]},
                    "operator": "EQUAL_TO",
                    "right_hand_side": {"static_value": "CONFIRMED"}
                }],
                "actions": []
            }]
        },
        {
            "business_name": "Check if User Denied",
            "token_code": "BRE-IS-USER-DENIED-V1",
            "description": "Checks if the user_confirmation_status field is 'DENIED'.",
            "rules": [{
                "priority": 100,
                "conditions": [{
                    "left_hand_side": {"source_fields": ["user_confirmation_status"]},
                    "operator": "EQUAL_TO",
                    "right_hand_side": {"static_value": "DENIED"}
                }],
                "actions": []
            }]
        }
    ]
    for rule_data in rules_to_seed:
        existing_rule = db.query(BusinessRuleSet).filter(BusinessRuleSet.token_code == rule_data["token_code"]).first()
        if not existing_rule:
            new_rule = BusinessRuleSet(
                rule_set_id=f"BRE-SEED-{str(uuid.uuid4())[:4].upper()}",
                business_name=rule_data["business_name"],
                token_code=rule_data["token_code"],
                description=rule_data["description"],
                definition=rule_data,
                created_at=str(datetime.datetime.utcnow()),
                created_by="SEED_BOOTSTRAP"
            )
            db.add(new_rule)
            print(f"  - Seeded rule: {rule_data['token_code']}")
    db.commit()

    # --- Seed Anomaly Intervention Workflow ---
    print("\n✓ Seeding Anomaly Intervention Workflow...")
    workflow_name = "Behavioral Anomaly Intervention Workflow"
    existing_workflow = db.query(WorkflowConfiguration).filter(WorkflowConfiguration.workflow_name == workflow_name).first()
    if not existing_workflow:
        workflow_id = f"WF-SEED-{str(uuid.uuid4())[:4].upper()}"
        
        node_definitions = [
            {"sequence_number": 10, "node_title": "Place Transaction on Hold", "node_code": "HOLD_TRANSACTION", "orchestration_steps": [{"sequence_number": 10, "step_type": "API_CALL", "target_token": "API-HOLD-TXN-V1"}]},
            {"sequence_number": 20, "node_title": "Notify User for Confirmation", "node_code": "NOTIFY_USER_FOR_CONFIRMATION", "screen_template": "GENERIC_CONFIRMATION_PROMPT_V1", "orchestration_steps": [{"sequence_number": 10, "step_type": "API_CALL", "target_token": "API-SEND-PUSH-CONFIRM-V1"}]},
            {"sequence_number": 30, "node_title": "Release Hold & Learn New Behavior", "node_code": "RELEASE_AND_LEARN", "orchestration_steps": [{"sequence_number": 10, "step_type": "API_CALL", "target_token": "API-RELEASE-TXN-HOLD-V1"}, {"sequence_number": 20, "step_type": "EVENT_BROADCAST", "target_event_type": "NEW_BEHAVIOR_CONFIRMED"}]},
            {"sequence_number": 40, "node_title": "Deny Transaction & Alert Fraud Team", "node_code": "DENY_AND_ALERT", "orchestration_steps": [{"sequence_number": 10, "step_type": "API_CALL", "target_token": "API-CANCEL-TXN-V1"}, {"sequence_number": 20, "step_type": "EVENT_BROADCAST", "target_event_type": "FRAUD_ALERT_TRIGGERED"}]}
        ]

        edge_definitions = [
            {"source_node_code": "HOLD_TRANSACTION", "target_node_code": "NOTIFY_USER_FOR_CONFIRMATION", "edge_condition": None},
            {"source_node_code": "NOTIFY_USER_FOR_CONFIRMATION", "target_node_code": "RELEASE_AND_LEARN", "edge_condition": {"type": "BUSINESS_RULE", "token_code": "BRE-IS-USER-CONFIRMED-V1"}},
            {"source_node_code": "NOTIFY_USER_FOR_CONFIRMATION", "target_node_code": "DENY_AND_ALERT", "edge_condition": {"type": "BUSINESS_RULE", "token_code": "BRE-IS-USER-DENIED-V1"}}
        ]

        new_workflow = WorkflowConfiguration(
            workflow_id=workflow_id,
            workflow_name=workflow_name,
            domain_scope="SECURITY",
            product_context="Real-time Fraud & Anomaly Detection",
            description="This workflow is triggered when a behavioral anomaly is detected. It holds the transaction and notifies the user for confirmation before proceeding.",
            version="1.0.0",
            is_active=True,
            created_at=str(datetime.datetime.utcnow()),
            created_by="SEED_BOOTSTRAP"
        )

        node_code_to_id_map = {}
        for node_def in node_definitions:
            node_id = f"NODE-SEED-{str(uuid.uuid4())[:4].upper()}"
            node_code_to_id_map[node_def["node_code"]] = node_id
            new_workflow.nodes.append(
                WorkflowNode(
                    node_id=node_id,
                    workflow_id=workflow_id,
                    created_at=str(datetime.datetime.utcnow()),
                    **node_def
                )
            )

        for edge_def in edge_definitions:
            source_id = node_code_to_id_map.get(edge_def["source_node_code"])
            target_id = node_code_to_id_map.get(edge_def["target_node_code"])
            if source_id and target_id:
                new_workflow.edges.append(
                    WorkflowEdge(
                        edge_id=f"EDGE-SEED-{str(uuid.uuid4())[:4].upper()}",
                        workflow_id=workflow_id,
                        source_node_id=source_id,
                        target_node_id=target_id,
                        edge_condition=edge_def["edge_condition"],
                        created_at=str(datetime.datetime.utcnow())
                    )
                )
        
        db.add(new_workflow)
        db.commit()
        print(f"  - Seeded workflow: {workflow_name}")
    else:
        print(f"✓ Workflow '{workflow_name}' already exists.")

    # Initialize database with clean schema
    print("✓ Database initialized with schema")
    db.commit()
    
except Exception as e:
    db.rollback()
    print(f"✗ Seeding error: {str(e)}")
finally:
    db.close()