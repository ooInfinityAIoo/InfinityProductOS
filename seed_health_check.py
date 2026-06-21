# WHY THIS FILE EXISTS:
# Health-check seed script that fills every studio module with realistic mock data
# so the full audit can verify every frontend list, form, and save action.
# Safe to re-run — checks for existence before inserting (idempotent).
# Run: python seed_health_check.py

import datetime, uuid, json
from database import SessionLocal, engine
from models import Base
import models

db = SessionLocal()
now = datetime.datetime.utcnow().isoformat()

def uid(prefix=""):
    return f"{prefix}{str(uuid.uuid4())[:8].upper()}"

def exists(model, **filters):
    return db.query(model).filter_by(**filters).first() is not None

# ── Resolve package + product ──────────────────────────────────────────────────
pkg = db.query(models.ProductApplicationPackage).first()
prod = db.query(models.ProductMaster).first()
if not pkg or not prod:
    print("ERROR: Run seed.py + seed_pkg.py first — no package/product found.")
    exit(1)

PKG_ID = pkg.package_id
PROD_ID = prod.product_id
print(f"Package: {pkg.package_name} ({PKG_ID})")
print(f"Product: {prod.product_name} ({PROD_ID})")
print()

# ── 1. Notification Policies ───────────────────────────────────────────────────
print("Seeding Notification Policies...")
notif_policies = [
    ("NOTIF-AML-ALERT", "AML High-Value Alert", "Alerts compliance team when AML rule triggers on transactions above $50k"),
    ("NOTIF-SLA-BREACH", "SLA Breach Warning", "Fires when a workflow node exceeds its configured SLA days"),
    ("NOTIF-RECON-BREAK", "Reconciliation Break Detected", "Daily digest of unmatched nostro/vostro entries"),
]
for pol_id, name, desc in notif_policies:
    if not exists(models.NotificationPolicy, policy_id=pol_id):
        db.add(models.NotificationPolicy(
            policy_id=pol_id,
            policy_name=name,
            description=desc,
            application_package_id=PKG_ID,
            version_number=1,
            status="ACTIVE",
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + Notification: {name}")

# ── 2. Communication Templates ─────────────────────────────────────────────────
print("Seeding Communication Templates...")
comm_templates = [
    ("COMM-AML-001", "AML Alert Email", "EMAIL",
     "AML Alert: Transaction {{transaction_id}}",
     "Dear {{recipient_name}},\n\nAn AML alert was triggered for {{currency}} {{amount}}.\n\nPlease review immediately.\n\nCompliance Team",
     ["recipient_name", "transaction_id", "currency", "amount"]),
    ("COMM-SLA-001", "SLA Breach Notification", "EMAIL",
     "SLA BREACH: {{workflow_name}}",
     "Workflow {{workflow_name}} node {{node_title}} has exceeded {{sla_days}} days. Status: {{status}}. Please escalate.",
     ["workflow_name", "node_title", "sla_days", "status"]),
    ("COMM-RECON-001", "Daily Reconciliation Report", "EMAIL",
     "Recon Report: {{break_count}} breaks",
     "Daily Recon Report — {{break_count}} unmatched entries. Total: {{currency}} {{unmatched_amount}}.",
     ["break_count", "currency", "unmatched_amount"]),
]
for tmpl_id, name, tmpl_type, subject, body, fields in comm_templates:
    if not exists(models.CommunicationTemplate, template_id=tmpl_id):
        db.add(models.CommunicationTemplate(
            template_id=tmpl_id,
            template_name=name,
            description=f"System notification template: {name}",
            template_type=tmpl_type,
            subject_line=subject,
            body_content=body,
            referenced_iso_fields=fields,
            version_number=1,
            application_package_id=PKG_ID,
            status="LIVE",
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + Comm Template: {name}")

# ── 3. Event Definitions ───────────────────────────────────────────────────────
print("Seeding Event Definitions...")
events = [
    ("PAYMENT_RECEIVED", "workflow-engine", "Fired when an inbound payment message is ingested and validated"),
    ("AML_ALERT_TRIGGERED", "rules-engine", "Fired when the AML high-value business rule evaluates to true"),
    ("WORKFLOW_COMPLETED", "workflow-engine", "Fired when all nodes in a workflow DAG reach terminal state"),
    ("RECONCILIATION_BREAK", "recon-engine", "Fired when a nostro/vostro entry cannot be matched"),
    ("SLA_BREACH_DETECTED", "sla-monitor", "Fired when a workflow node exceeds its configured SLA days"),
    ("PAYMENT_SETTLED", "settlement-engine", "Fired when final settlement confirmation is received from RTGS"),
    ("DOCUMENT_VERIFIED", "doc-engine", "Fired when all required documents for a workflow node are verified"),
]
for event_type, source, desc in events:
    if not exists(models.EventDefinition, event_type=event_type):
        db.add(models.EventDefinition(
            event_type=event_type,
            source_module=source,
            description=desc,
            created_at=now,
        ))
        print(f"  + Event: {event_type}")

# ── 4. Simulation Scenarios ────────────────────────────────────────────────────
print("Seeding Simulation Scenarios...")
wf = db.query(models.WorkflowConfiguration).first()
if wf:
    sims = [
        ("SIM-001", "SWIFT MT103 Happy Path", "Clean cross-border payment with no AML/OFAC hits"),
        ("SIM-002", "AML High-Value Trigger", "$75k wire that triggers AML rule → compliance review"),
        ("SIM-003", "OFAC Beneficiary Hit", "Beneficiary name matches OFAC sanctions list → reject"),
    ]
    for sim_id, name, desc in sims:
        if not exists(models.SimulationScenario, simulation_id=sim_id):
            db.add(models.SimulationScenario(
                simulation_id=sim_id,
                simulation_name=name,
                description=desc,
                target_workflow_id=wf.workflow_id,
                sample_size=50,
                scenario_variables={"currency": "USD", "amount": 75000},
                created_at=now,
            ))
            print(f"  + Simulation: {name}")

# ── 5. Additional Business Rules ───────────────────────────────────────────────
print("Seeding Business Rules...")
rules_data = [
    ("RSET-FX-STALE", "FX-RATE-STALE", "FX Rate Staleness Check",
     "Rejects payment if FX rate is older than 15 minutes",
     {"conditions": [{"field": "FX_RATE_TIMESTAMP", "operator": "OLDER_THAN_MINUTES", "value": 15}], "action_on_true": "REJECT"}),
    ("RSET-DAILY-LIMIT", "DAILY-LIMIT-CHECK", "Daily Transaction Limit",
     "Blocks any single payment exceeding $1,000,000",
     {"conditions": [{"field": "INSTRUCTED_AMOUNT", "operator": "GREATER_THAN", "value": 1000000}], "action_on_true": "HOLD"}),
    ("RSET-DOC-COMPLETE", "DOCS-VERIFIED", "Required Documents Present",
     "Ensures all mandatory documents are verified before settlement",
     {"conditions": [{"field": "DOCS_VERIFIED", "operator": "EQUALS", "value": True}], "action_on_true": "PASS"}),
]
for rule_set_id, token, name, desc, definition in rules_data:
    if not exists(models.BusinessRuleSet, rule_set_id=rule_set_id):
        db.add(models.BusinessRuleSet(
            rule_set_id=rule_set_id,
            business_name=name,
            token_code=token,
            description=desc,
            definition=definition,
            application_package_id=PKG_ID,
            product_id=PROD_ID,
            status="ACTIVE",
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + Rule: {name}")

# ── 6. Additional Formulas ─────────────────────────────────────────────────────
print("Seeding Formulas...")
formulas_data = [
    ("FASSET-FEE-CALC", "PAYMENTS", "Correspondent Bank Fee", "CORRESPONDENT_FEE",
     "INSTRUCTED_AMOUNT * FEE_RATE",
     "Calculates the correspondent bank fee as % of instructed amount",
     [{"name": "INSTRUCTED_AMOUNT", "data_type": "decimal"}, {"name": "FEE_RATE", "data_type": "decimal"}]),
    ("FASSET-NET-SETTLE", "PAYMENTS", "Net Settlement Amount", "NET_SETTLEMENT_AMOUNT",
     "FX_CONVERTED_AMOUNT - CORRESPONDENT_FEE",
     "Final net amount after FX conversion and fee deduction",
     [{"name": "FX_CONVERTED_AMOUNT", "data_type": "decimal"}, {"name": "CORRESPONDENT_FEE", "data_type": "decimal"}]),
    ("FASSET-DAYS-OUT", "PAYMENTS", "Days Outstanding", "DAYS_OUTSTANDING",
     "(CURRENT_DATE - VALUE_DATE) / 86400",
     "Days a payment has been outstanding since value date",
     [{"name": "CURRENT_DATE", "data_type": "integer"}, {"name": "VALUE_DATE", "data_type": "integer"}]),
]
for asset_id, domain, name, output_field, expr, desc, params in formulas_data:
    if not exists(models.SymbolicFormulaAsset, asset_id=asset_id):
        db.add(models.SymbolicFormulaAsset(
            asset_id=asset_id,
            financial_domain=domain,
            business_name=name,
            token_code=output_field,
            target_output_field=output_field,
            mathematical_expression=expr,
            description=desc,
            parameters=params,
            application_package_id=PKG_ID,
            product_id=PROD_ID,
            status="ACTIVE",
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + Formula: {name}")

# ── 7. Queue Connections ───────────────────────────────────────────────────────
print("Seeding Queue Connections...")
queue_conns = [
    ("QCONN-IBMMQ-01", "IBM MQ — SWIFT Gateway", "IBM_MQ",
     {"host": "mq.bank.internal", "port": 1414, "queue_manager": "QM.SWIFT", "channel": "SWIFT.CLIENT.CHL"}),
    ("QCONN-KAFKA-01", "Kafka — Event Bus", "KAFKA",
     {"bootstrap_servers": "kafka.bank.internal:9092", "security_protocol": "SASL_SSL"}),
]
for conn_id, name, provider, config in queue_conns:
    if not exists(models.ExternalQueueConnection, connection_id=conn_id):
        db.add(models.ExternalQueueConnection(
            connection_id=conn_id,
            connection_name=name,
            description=f"Connection to {provider} for payment message routing",
            provider=provider,
            connection_params=config,
            tls_enabled=True,
            package_id=PKG_ID,
            status="ACTIVE",
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + Queue Connection: {name}")

# ── 8. Message Queues ──────────────────────────────────────────────────────────
print("Seeding Message Queues...")
conn = db.query(models.ExternalQueueConnection).first()
if conn:
    queues_data = [
        ("MQ-INBOUND-001", "Inbound Payments", "SWIFT_INBOUND_PMT", "INBOUND",
         "Receives inbound MT103 SWIFT messages from correspondent banks"),
        ("MQ-OUTBOUND-001", "Outbound ACK", "SWIFT_OUTBOUND_ACK", "OUTBOUND",
         "Sends payment acknowledgements back to originating banks"),
        ("MQ-DLQ-001", "Dead Letter Queue", "SWIFT_DLQ", "DEAD_LETTER",
         "Catches messages that failed processing after 3 retries"),
    ]
    for q_id, q_name, q_code, q_type, desc in queues_data:
        if not exists(models.MessageQueue, queue_id=q_id):
            db.add(models.MessageQueue(
                queue_id=q_id,
                queue_name=q_name,
                queue_code=q_code,
                description=desc,
                queue_type=q_type,
                external_connection_id=conn.connection_id,
                physical_queue_name=q_code,
                message_format="ISO20022_XML",
                package_id=PKG_ID,
                product_id=PROD_ID,
                max_retry_count=3,
                retry_interval_sec=30,
                status="ACTIVE",
                created_at=now,
                created_by="seed_health_check",
            ))
            print(f"  + Queue: {q_name}")

# ── 9. Document Checklists ─────────────────────────────────────────────────────
print("Seeding Document Checklists...")
doc_checklists = [
    ("DCL-KYC-001", "KYC Document Checklist", "KYC_ONBOARDING",
     "Mandatory KYC documents required before processing cross-border payments"),
    ("DCL-SETTLE-001", "Settlement Document Checklist", "SETTLEMENT",
     "Documents required at the settlement stage of a SWIFT wire"),
]
for cl_id, name, step, desc in doc_checklists:
    if not exists(models.DocumentChecklist, checklist_id=cl_id):
        db.add(models.DocumentChecklist(
            checklist_id=cl_id,
            checklist_name=name,
            description=desc,
            intended_workflow_step=step,
            application_package_id=PKG_ID,
            version_number=1,
            status="LIVE",
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + Checklist: {name}")

# ── 10. Entitlement Policies ───────────────────────────────────────────────────
print("Seeding Entitlement Policies...")
entitlements_data = [
    ("ENT-WORKFLOW-001", "MODULE", "WORKFLOW_DESIGNER", "Workflow Designer",
     PKG_ID, "DESIGNER", True, True, True, False),
    ("ENT-AI-001", "MODULE", "AI_ASSISTANT", "AI Assistant",
     PKG_ID, "DESIGNER", True, False, False, False),
    ("ENT-GOV-APPROVE", "ACTION", "GOVERNANCE_APPROVE", "4-Eye Approval Rights",
     PKG_ID, "APPROVER", True, False, False, True),
    ("ENT-REPORT-EXPORT", "MODULE", "REPORTING", "Report Export",
     PKG_ID, "ANALYST", True, False, False, False),
]
for pol_id, etype, eid, ename, pkg_id, role_code, can_view, can_mod_data, can_mod_design, can_approve in entitlements_data:
    if not exists(models.EntitlementPolicy, policy_id=pol_id):
        db.add(models.EntitlementPolicy(
            policy_id=pol_id,
            entity_type=etype,
            entity_id=eid,
            entity_name=ename,
            application_package_id=pkg_id,
            role_code=role_code,
            can_view=can_view,
            can_modify_data=can_mod_data,
            can_modify_design=can_mod_design,
            can_approve=can_approve,
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + Entitlement: {ename} → {role_code}")

# ── 11. Roles ──────────────────────────────────────────────────────────────────
print("Seeding Roles...")
roles_data = [
    ("ROLE-DESIGNER", "DESIGNER", "Workflow Designer",
     "Full access to all designer studios. Can create and edit workflows, rules, formulas, screens.",
     {"workflows": ["READ","WRITE"], "rules": ["READ","WRITE"], "calculations": ["READ","WRITE"]}),
    ("ROLE-APPROVER", "APPROVER", "4-Eye Approver",
     "Can review and approve/reject governance tasks. Read-only on studios.",
     {"workflows": ["READ"], "governance": ["READ","WRITE","APPROVE"]}),
    ("ROLE-ANALYST", "ANALYST", "Business Analyst",
     "Read-only access to all studios plus report export rights.",
     {"workflows": ["READ"], "reporting": ["READ","EXPORT"]}),
    ("ROLE-ADMIN", "ADMIN", "Platform Administrator",
     "Unrestricted access to all modules including user management and entitlements.",
     {"*": ["READ","WRITE","DELETE","ADMIN"]}),
]
for role_id, role_code, name, desc, perms in roles_data:
    if not exists(models.RoleProfile, role_id=role_id):
        db.add(models.RoleProfile(
            role_id=role_id,
            role_code=role_code,
            role_name=name,
            description=desc,
            package_id=PKG_ID,
            is_system_role=False,
            default_permissions=perms,
            status="ACTIVE",
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + Role: {name}")

# ── 12. Users ──────────────────────────────────────────────────────────────────
print("Seeding Users...")
users_data = [
    ("USER-001", "alice_chen", "Alice Chen", "alice.chen@bank.com", "DESIGNER"),
    ("USER-002", "bob_okafor", "Bob Okafor", "bob.okafor@bank.com", "APPROVER"),
    ("USER-003", "carol_patel", "Carol Patel", "carol.patel@bank.com", "ANALYST"),
    ("USER-004", "david_kim", "David Kim", "david.kim@bank.com", "ADMIN"),
]
for user_id, username, display_name, email, role_code in users_data:
    if not exists(models.UserProfile, user_id=user_id):
        db.add(models.UserProfile(
            user_id=user_id,
            username=username,
            display_name=display_name,
            email=email,
            primary_role_code=role_code,
            additional_role_codes=[],
            package_ids=[PKG_ID],
            status="ACTIVE",
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + User: {display_name} ({role_code})")

# ── 13. Unstructured Extraction Blueprints ─────────────────────────────────────
print("Seeding Unstructured Doc Blueprints...")
blueprints_data = [
    ("UEBP-001", "SWIFT MT103 Extractor", "SWIFT_MT103",
     [
         {"field_name": "sender_bic", "extraction_prompt": "Extract the sender BIC code from the :52A or :52D field", "confidence_threshold": 0.9},
         {"field_name": "instructed_amount", "extraction_prompt": "Extract the instructed amount from the :32A field", "confidence_threshold": 0.95},
         {"field_name": "beneficiary_name", "extraction_prompt": "Extract the beneficiary name from the :59 field", "confidence_threshold": 0.85},
     ]),
    ("UEBP-002", "KYC Passport Extractor", "PASSPORT",
     [
         {"field_name": "full_name", "extraction_prompt": "Extract the full name from the MRZ or data page", "confidence_threshold": 0.95},
         {"field_name": "passport_number", "extraction_prompt": "Extract the passport number", "confidence_threshold": 0.99},
         {"field_name": "expiry_date", "extraction_prompt": "Extract the expiry date in YYYY-MM-DD format", "confidence_threshold": 0.95},
     ]),
]
for bp_id, name, doc_type, fields in blueprints_data:
    if not exists(models.UnstructuredExtractionBlueprint, blueprint_id=bp_id):
        db.add(models.UnstructuredExtractionBlueprint(
            blueprint_id=bp_id,
            blueprint_name=name,
            description=f"AI extraction blueprint for {doc_type} documents",
            document_type_id=doc_type,
            extraction_profile=json.dumps(fields),
            ai_extraction_config=json.dumps({"model": "claude-sonnet-4-6", "max_tokens": 1024}),
            confidence_threshold=0.9,
            fallback_mode="MANUAL_REVIEW",
            application_package_id=PKG_ID,
            version_number=1,
            status="LIVE",
            created_at=now,
            created_by="seed_health_check",
        ))
        print(f"  + Extraction Blueprint: {name}")

# ── Commit ─────────────────────────────────────────────────────────────────────
db.commit()
print()
print("=" * 55)
print("Phase 0-B COMPLETE — Mock data seeded across all modules")
print("=" * 55)
db.close()
