import os
from sqlalchemy import create_engine, Column, String, Integer, Boolean, Text, ForeignKey, Float, Index, JSON
from sqlalchemy.types import TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB

class JSONB(TypeDecorator):
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_JSONB())
        else:
            return dialect.type_descriptor(JSON())

from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./infinity_db.sqlite")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# =====================================================================
# --- CORE ARCHITECTURAL BLUEPRINT & LEDGER MODELS ---
# =====================================================================

class TenantThemeConfiguration(Base):
    __tablename__ = "tenant_theme_configuration"
    tenant_id = Column(String, primary_key=True, default="DEFAULT", index=True)
    brand_name = Column(String, default="Infinity ProductOS™")
    logo_url = Column(String, nullable=True)


class WorkflowManifest(Base):
    __tablename__ = "workflow_manifests"
    workflow_id = Column(String, primary_key=True, index=True)
    version = Column(String, default="1.0.0")
    domain_scope = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    state_sequence_dag = Column(JSONB, nullable=True)

class LegoBlockConfig(Base):
    __tablename__ = "lego_block_configs"
    block_id = Column(String, primary_key=True, index=True)
    block_type = Column(String, nullable=False)
    raw_properties = Column(JSONB, nullable=True)

class EvidencePacketRegistry(Base):
    """
    Layer 5: The Immutable Evidence Packet Ledger.
    This table serves as the primary audit trail for all significant state transitions.
    """
    __tablename__ = "evidence_packet_registry"
    packet_id = Column(String, primary_key=True, index=True)
    operator_maker = Column(String, nullable=False)
    authorizer_checker = Column(String, nullable=False)
    raw_payload_reference = Column(String, nullable=True)
    blockchain_tx_hash = Column(String, nullable=True)
    variance_metric_logged = Column(Text, nullable=True)
    execution_status = Column(String, nullable=False, index=True)
    created_at = Column(String, primary_key=True, nullable=False, index=True)
    updated_at = Column(String, nullable=True)

    __table_args__ = {
        'postgresql_partition_by': 'RANGE (created_at)'
    }

    # Relationship to comments
    comments = relationship("GovernanceTaskComment", primaryjoin="EvidencePacketRegistry.packet_id == GovernanceTaskComment.task_id", foreign_keys="[GovernanceTaskComment.task_id]", back_populates="task", cascade="all, delete-orphan", lazy="joined")

# --- STEP A & B: FILE TEMPLATE DESIGNER (Layout & Extraction) ---
class TemplateDesignerModel(Base):
    """
    Defines the physical layout or AI extraction strategy for an Upload or Download file.
    """
    __tablename__ = "template_designer_blueprints"

    template_id = Column(String, primary_key=True, index=True)
    template_name = Column(String, nullable=False)
    template_type = Column(String, nullable=False)  # UPLOAD vs DOWNLOAD
    file_type = Column(String, nullable=False)        # XLSX, PDF, CSV, JPEG, XLS, XML
    
    # Extraction Strategy
    extraction_mode = Column(String, default="STRUCTURED") # STRUCTURED vs AGENTIC_PROMPT
    
    # Structured File Properties
    is_multi_sheet = Column(Boolean, default=False)
    file_has_header_footer = Column(String, default="NONE") # HEADER, FOOTER, BOTH, NONE
    text_file_type = Column(String, nullable=True)   # DELIMITER vs FIXED_LENGTH
    delimiter_record_separator = Column(String, default=",")
    
    # Metadata
    status = Column(String, nullable=False, default="DRAFT", index=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")

    fields = relationship("TemplateFieldAddressModel", back_populates="template", cascade="all, delete-orphan", lazy="joined")

class TemplateFieldAddressModel(Base):
    """
    Defines how to locate a specific data point in the file, or the AI Prompt used to extract it.
    """
    __tablename__ = "template_field_addresses"

    address_id = Column(String, primary_key=True, index=True)
    template_id = Column(String, ForeignKey("template_designer_blueprints.template_id", ondelete="CASCADE"), nullable=False)
    
    # The Extracted Key Name (Output to intermediate JSON)
    extracted_field_name = Column(String, nullable=False)  
    
    reading_mode = Column(String, default="COLUMN")          # COLUMN, CELL, PROMPT
    
    # Structural File Addresses
    sheet_name = Column(String, nullable=True)
    sheet_sequence_no = Column(Integer, default=1)
    start_row = Column(Integer, default=0)
    stop_row = Column(Integer, default=0)
    column_sequence_no = Column(Integer, default=0)
    cell_address_or_prompt = Column(String, nullable=True) # e.g., 'B2' or 'Extract the net income amount'
    
    # Fixed Length Properties & Padding (Screenshot 00001)
    fixed_length_start = Column(Integer, default=0)
    fixed_length_end = Column(Integer, default=0)
    padding_character = Column(String, default="0")
    padding_position = Column(String, default="PREFIX")      # PREFIX vs SUFFIX
    
    # Constraints & Validations (Screenshot 00002)
    data_type_spec = Column(String, default="Text")          # Text, Alphanumeric, Amount, Date
    mandatory_status = Column(String, default="Optional")    # Mandatory, Optional, Conditional
    max_length = Column(Integer, default=9)
    min_length = Column(Integer, default=9)
    populate_default_value = Column(Boolean, default=False)
    default_value_fallback = Column(String, nullable=True)
    is_amount_decimal = Column(Boolean, default=False)
    decimal_places_precision = Column(Integer, default=2)
    currency_code = Column(String, default="USD")
    
    template = relationship("TemplateDesignerModel", back_populates="fields")

# --- LAYER 3: ISO BUSINESS FIELD REGISTRY (SEMANTIC BLOODSTREAM) ---
class ISOFieldDefinition(Base):
    """
    Layer 3: The Semantic Bloodstream.
    This table is the master source of truth for all data fields in the system.
    """
    __tablename__ = "iso_field_registry"
    
    field_id = Column(String, primary_key=True, index=True)
    technical_sys_name = Column(String, unique=True, nullable=False, index=True)
    client_business_name = Column(String, nullable=False)
    display_preference = Column(String, nullable=False, default="ISO")
    iso_business_name = Column(String, nullable=False, index=True)
    data_type = Column(String, nullable=False)  # Decimal, Alphanumeric, Amount, Date, Text
    domain_category = Column(String, nullable=False, index=True)  # e.g., HELOC, PAYMENTS, TREASURY
    subdomain_category = Column(String, nullable=True, index=True)  # e.g., FIGRE, RTGS, CLEARING
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="DRAFT", index=True) # DRAFT, PENDING_APPROVAL, ACTIVE, DELETED
    is_mandatory = Column(Boolean, default=False)
    is_pii = Column(Boolean, default=False, nullable=False, index=True)
    masking_strategy = Column(String, nullable=True) # e.g., REDACT_ALL, SHOW_LAST_4, EMAIL
    localized_overrides = Column(JSONB, nullable=True) # e.g., {"US_en": {"name": "SSN"}}
    default_value = Column(String, nullable=True)
    # WHY field_source IS A SEPARATE COLUMN FROM display_preference:
    # display_preference (ISO | CLIENT) controls which *name* to show — it is a display concern.
    # field_source controls *who created this field and what it represents* — it is a governance concern.
    # ISO_20022    — pre-seeded from the ISO 20022 standard catalogue (read-only)
    # BANK_CUSTOM  — bank-defined proprietary field added by a Field Registry admin
    # CALCULATED   — output token auto-registered when a Formula is saved/activated;
    #                formula_ref stores the program_id of the producing Formula
    field_source = Column(String, nullable=False, default="ISO_20022", index=True)
    formula_ref = Column(String, ForeignKey("calculation_programs.program_id"), nullable=True, index=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")


# --- LAYER 3 EXTENSION: ISO DOMAIN REGISTRY ---
class IsoDomain(Base):
    """
    WHY THIS EXISTS:
    Defines the business domain taxonomy for the ISO Field Registry.
    Every domain (e.g. Wire & SWIFT Payments) has one or more subdomains
    (e.g. SWIFT Cross-border, RTGS High Value). This table is the master
    reference — domain_category and subdomain_category on ISOFieldDefinition
    point here. Packages select which domains they cover via PackageIsoDomain.

    This replaces the flat 'PAYMENTS / ISO_GOLDEN_SOURCE' placeholder tagging
    that was applied to 3,000 fields during initial seed.
    """
    __tablename__ = "iso_domains"

    domain_code = Column(String, primary_key=True)          # e.g. WIRE_PAYMENTS
    domain_display_name = Column(String, nullable=False)    # e.g. Wire & SWIFT Payments
    subdomain_code = Column(String, primary_key=True)       # e.g. SWIFT_CROSS_BORDER
    subdomain_display_name = Column(String, nullable=False) # e.g. SWIFT / Cross-border
    description = Column(Text, nullable=True)
    icon = Column(String, nullable=True)                    # emoji for UI
    sort_order = Column(Integer, default=0)
    created_at = Column(String, nullable=False)


class PackageIsoDomain(Base):
    """
    WHY THIS EXISTS:
    Many-to-many join between a Package and the ISO Domains it covers.
    When a bank initialises "Payment Hub" and selects Wire & SWIFT + FX domains,
    those domain codes are stored here. The Field Registry filters by these
    domains when working inside that package context. The Package sidebar nav
    groups screens by the domains selected here.

    WHAT BREAKS IF REMOVED: Field Registry loses package-scoped filtering.
    Package sidebar cannot auto-group screens into correct domain sections.
    """
    __tablename__ = "package_iso_domains"

    package_id = Column(String, ForeignKey("master_product_application_packages.package_id", ondelete="CASCADE"), primary_key=True)
    domain_code = Column(String, nullable=False, primary_key=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")


# --- LAYER 6: GOVERNANCE HUB COMMENTS ---
class GovernanceTaskComment(Base):
    """
    Stores comments and notes associated with a governance task.
    """
    __tablename__ = "governance_task_comments"

    comment_id = Column(String, primary_key=True, index=True)
    task_id = Column(String, nullable=False, index=True) # Removed strict DB-level FK to allow Evidence table partitioning
    author = Column(String, nullable=False)
    comment = Column(Text, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)

    task = relationship("EvidencePacketRegistry", primaryjoin="GovernanceTaskComment.task_id == EvidencePacketRegistry.packet_id", foreign_keys="[GovernanceTaskComment.task_id]", back_populates="comments")

# --- LAYER 1: WORKFLOW DEFINITION PERSISTENCE ---
class WorkflowNode(Base):
    """
    Layer 1: Visual Multi-Canvas Studio (Backend Model).
    Represents a single node/step in a workflow canvas.
    """
    __tablename__ = "workflow_nodes"
    
    node_id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, ForeignKey("workflow_configurations.workflow_id", ondelete="CASCADE"), nullable=False, index=True)
    sequence_number = Column(Integer, nullable=False)
    node_title = Column(String, nullable=False)
    node_code = Column(String, nullable=False)  # e.g., DGE_INBOUND_GATEWAY
    canvas_x_position = Column(Integer, default=0)
    canvas_y_position = Column(Integer, default=0)
    
    # Node Configuration
    orchestration_steps = Column(JSONB, nullable=True) # A list of OrchestrationStep objects
    events_broadcast = Column(JSONB, nullable=True)  # JSON array of event types
    required_documents = Column(JSONB, nullable=True) # Array of required document/file types
    
    # Universal Step Type (21-type taxonomy) — the canonical node type on the canvas.
    # Maps to one of 8 groups: START, VALIDATE, DECIDE, APPROVE, CALCULATE, ACT, WAIT, END.
    # Controls color-coding, shape rendering, and executor dispatch.
    # Values: RECEIVE | SCHEDULE | EVENT_TRIGGER | VALIDATE | COMPLIANCE_SCREEN |
    #         LIMIT_CHECK | DOCUMENT_EXAMINE | DECISION | PARALLEL_SPLIT | PARALLEL_JOIN |
    #         HUMAN_APPROVAL | DIGITAL_SIGNATURE | CALCULATE | VALUATE | WATERFALL |
    #         SEND_MESSAGE | POST_ENTRY | CALL_SYSTEM | GENERATE_DOCUMENT |
    #         AWAIT_RESPONSE | HOLD | ESCALATE | COMPLETE | TERMINATE
    # NULL = legacy node created before taxonomy; rendered as default indigo.
    node_type = Column(String, nullable=True, index=True)

    # ISO 20022 Message Identity — populated when this node represents a specific
    # ISO message in a scenario workflow (e.g. an RTP Happy Path template).
    # These fields are OPTIONAL — existing custom workflow nodes leave them null.
    # iso_message_type: the canonical message ID e.g. "pacs.008.001.10"
    # message_direction: SEND | RECEIVE | PROCESS | BRANCH
    # party_from / party_to: human-readable party labels e.g. "Debtor FI", "RTP", "Creditor FI"
    # These make the canvas node card self-describing so the bank immediately knows
    # which message is being handled and in which direction — no documentation needed.
    iso_message_type = Column(String, nullable=True, index=True)
    message_direction = Column(String, nullable=True)
    party_from = Column(String, nullable=True)
    party_to = Column(String, nullable=True)

    # SLA Configuration
    # sla_days: legacy integer (kept for backward compat with existing nodes).
    # sla_config: structured SLA object (overrides sla_days when present).
    # sla_config shape: {value: int, unit: SECONDS|MINUTES|HOURS|CALENDAR_DAYS|BANKING_DAYS,
    #                    calendar?: TARGET2|FEDWIRE|NYSE|CUSTOM,
    #                    on_breach: ESCALATE|NOTIFY|REJECT|PROCEED,
    #                    breach_notify_role?: str}
    # WHY: A pacs.002 response has a 10-second SLA. An LC examination has a 5-banking-day SLA.
    # A single integer cannot express both. sla_config replaces it correctly.
    sla_days = Column(Integer, default=1)
    sla_config = Column(JSONB, nullable=True)
    sla_anchor_field = Column(String, nullable=True)

    # Screen Template
    screen_template = Column(String, nullable=True)
    
    # Metadata
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    
    # Relationships
    workflow = relationship("WorkflowConfiguration", back_populates="nodes")
    source_for_edges = relationship("WorkflowEdge", foreign_keys="[WorkflowEdge.source_node_id]", back_populates="source_node", cascade="all, delete-orphan")
    target_for_edges = relationship("WorkflowEdge", foreign_keys="[WorkflowEdge.target_node_id]", back_populates="target_node", cascade="all, delete-orphan")


class WorkflowEdge(Base):
    """
    Layer 1: Visual Multi-Canvas Studio (Backend Model).
    Represents a directed edge (connection) between two workflow nodes.
    """
    __tablename__ = "workflow_edges"
    
    edge_id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, ForeignKey("workflow_configurations.workflow_id", ondelete="CASCADE"), nullable=False, index=True)
    source_node_id = Column(String, ForeignKey("workflow_nodes.node_id"), nullable=False)
    target_node_id = Column(String, ForeignKey("workflow_nodes.node_id"), nullable=False)
    edge_condition = Column(JSONB, nullable=True)  # JSON condition for branching
    created_at = Column(String, nullable=False)

    # Relationships
    workflow = relationship("WorkflowConfiguration", back_populates="edges")
    source_node = relationship("WorkflowNode", foreign_keys=[source_node_id], back_populates="source_for_edges")
    target_node = relationship("WorkflowNode", foreign_keys=[target_node_id], back_populates="target_for_edges")


class WorkflowConfiguration(Base):
    """
    Layer 1: Visual Multi-Canvas Studio (Backend Model).
    This is the main container for a complete workflow blueprint definition.
    """
    __tablename__ = "workflow_configurations"
    
    workflow_id = Column(String, primary_key=True, index=True)
    workflow_name = Column(String, nullable=False)
    domain_scope = Column(String, nullable=False, index=True)
    product_context = Column(String, nullable=False)  # e.g., ICICI Bank Payments Hub
    sub_product = Column(String, nullable=True)
    version = Column(String, default="1.0.0")
    status = Column(String, nullable=False, default="DRAFT", index=True)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, ForeignKey("product_master.product_id"), nullable=True, index=True)
    subproduct_id = Column(String, ForeignKey("subproduct_master.subproduct_id"), nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    description = Column(Text, nullable=True)

    # ISO 20022 Template fields — when is_template=True this record is a reusable
    # starting-point the user picks from "New from Template" in the Workflow Designer.
    # message_type: ISO 20022 message ID e.g. "pacs.008.001.10"
    # clearing_network: SWIFT | FEDNOW | RTP | CHIPS | SEPA | ACH | ALL
    # template_category: PAYMENT_INITIATION | CLEARING_SETTLEMENT | CASH_MANAGEMENT | ADMINISTRATION
    is_template = Column(Boolean, nullable=False, default=False, index=True)
    message_type = Column(String, nullable=True, index=True)
    clearing_network = Column(String, nullable=True, index=True)
    template_category = Column(String, nullable=True, index=True)

    # Embedded configuration as JSON
    # --- GAP 3: Sub-Workflow Data Scope Contracts ---
    input_schema = Column(JSONB, nullable=True)  # Array of ISO field keys allowed IN
    output_schema = Column(JSONB, nullable=True) # Array of ISO field keys allowed OUT
    
    formulas_defined = Column(JSONB, nullable=True)  # JSON array of formula objects
    
    # Metadata
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Relationships to automatically load the entire workflow graph.
    nodes = relationship("WorkflowNode", back_populates="workflow", cascade="all, delete-orphan", lazy="joined")
    edges = relationship("WorkflowEdge", back_populates="workflow", cascade="all, delete-orphan", lazy="joined")

class WorkflowVersion(Base):
    """
    Stores a historical snapshot of a workflow configuration at a specific version.
    """
    __tablename__ = "workflow_versions"

    version_id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, ForeignKey("workflow_configurations.workflow_id"), nullable=False, index=True)
    version = Column(String, nullable=False)
    definition = Column(JSONB, nullable=False) # Snapshot of the workflow graph (nodes, edges, etc.)
    created_at = Column(String, nullable=False)
    created_by = Column(String, nullable=False)

    workflow = relationship("WorkflowConfiguration")


class WorkflowExecutionInstance(Base):
    """
    Layer 1/4: Tracks live, long-running workflow instances that are paused
    (e.g., waiting for HUMAN_APPROVAL).
    """
    __tablename__ = "workflow_execution_instances"

    instance_id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, ForeignKey("workflow_configurations.workflow_id"), nullable=False, index=True)
    parent_instance_id = Column(String, ForeignKey("workflow_execution_instances.instance_id"), nullable=True, index=True) # Enables nested Sub-Workflows
    master_transaction_id = Column(String, nullable=True, index=True) # Ties infinite nested loops back to one origin
    current_node_id = Column(String, nullable=False)
    status = Column(String, nullable=False, default="PAUSED", index=True) # PAUSED, COMPLETED, FAILED
    current_context = Column(JSONB, nullable=False)
    execution_trace = Column(JSONB, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)


# --- LAYER 4: SYMBOLIC CALCULATION ENGINE ---
class SymbolicFormulaAsset(Base):
    """
    Layer 4: Deterministic Execution (Logic-as-Data).
    Stores a reusable, named mathematical formula or expression.
    """
    __tablename__ = "symbolic_formula_registry"
    
    asset_id = Column(String, primary_key=True, index=True)
    financial_domain = Column(String, nullable=True, index=True) # e.g., "Credit Risk", "Treasury"
    business_name = Column(String, nullable=False, index=True) # e.g., "Linear Scorecard Point Allocation"
    token_code = Column(String, unique=True, nullable=False, index=True) # e.g., CALC-REG-099
    target_output_field = Column(String, nullable=False) # e.g., interest_rate_margin
    mathematical_expression = Column(Text, nullable=False)
    parameters = Column(JSONB, nullable=True) # For static coefficients, e.g., {"alpha": 0.5, "beta_1": 1.2}
    status = Column(String, nullable=False, default="DRAFT", index=True)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, ForeignKey("product_master.product_id"), nullable=True, index=True)
    subproduct_id = Column(String, ForeignKey("subproduct_master.subproduct_id"), nullable=True, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

class CompositeFormulaBlueprint(Base):
    """
    Defines a composite formula, which is an ordered chain of simple symbolic formulas.
    """
    __tablename__ = "composite_formula_blueprints"

    composite_id = Column(String, primary_key=True, index=True)
    business_name = Column(String, nullable=False, unique=True, index=True)
    token_code = Column(String, unique=True, nullable=False, index=True)
    status = Column(String, nullable=False, default="DRAFT", index=True)
    description = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, nullable=False)

    steps = relationship("CompositeFormulaStep", back_populates="blueprint", cascade="all, delete-orphan", lazy="joined")

class CompositeFormulaStep(Base):
    """
    Represents a single step in a composite formula chain.
    """
    __tablename__ = "composite_formula_steps"

    step_id = Column(String, primary_key=True, index=True)
    composite_id = Column(String, ForeignKey("composite_formula_blueprints.composite_id"), nullable=False, index=True)
    sequence_number = Column(Integer, nullable=False)
    formula_token_code = Column(String, ForeignKey("symbolic_formula_registry.token_code"), nullable=False)

    blueprint = relationship("CompositeFormulaBlueprint", back_populates="steps")

class BusinessRuleSet(Base):
    """
    Defines a composite business rule, which is an ordered chain of IF-THEN conditions and actions.
    """
    __tablename__ = "business_rule_sets"

    rule_set_id = Column(String, primary_key=True, index=True)
    business_name = Column(String, nullable=False, unique=True, index=True)
    token_code = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="DRAFT", index=True)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, ForeignKey("product_master.product_id"), nullable=True, index=True)
    subproduct_id = Column(String, ForeignKey("subproduct_master.subproduct_id"), nullable=True, index=True)
    definition = Column(JSONB, nullable=False) # The full JSON definition of the rule set, including conditions and actions.
    created_at = Column(String, nullable=False)
    created_by = Column(String, nullable=False)

class InsightDefinition(Base):
    """
    Defines a blueprint for a business insight, created in the Insights Factory.
    """
    __tablename__ = "insight_definitions"

    insight_id = Column(String, primary_key=True, index=True)
    insight_name = Column(String, nullable=False, unique=True, index=True)
    insight_code = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="DRAFT", index=True)
    trigger_type = Column(String, nullable=False, index=True) # e.g., EVENT, SCHEDULED
    trigger_config = Column(JSONB, nullable=False) # e.g., {"event_type": "NEW_TRANSACTION"} or {"cron": "0 0 * * 0"}
    dashboard_category = Column(String, nullable=False, default="GLOBAL", index=True) # GLOBAL, 360_BUSINESS, TECHNICAL
    applicable_roles = Column(JSONB, nullable=True) # Array of roles: ["SALES", "RISK", "C_LEVEL"]
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    analysis_steps = Column(JSONB, nullable=False) # A list of OrchestrationStep objects
    created_at = Column(String, nullable=False)
    created_by = Column(String, nullable=False)

class ReportBlueprint(Base):
    """
    Defines a visual reporting dashboard or a headless BI dataset.
    Supports both Native React widgets and embedded Third-Party BI (Power BI/Cognos).
    """
    __tablename__ = "report_blueprints"
    
    report_id = Column(String, primary_key=True, index=True)
    report_name = Column(String, nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    is_third_party_embedded = Column(Boolean, default=False)
    third_party_embed_url = Column(String, nullable=True) # Used if embedded Power BI
    expose_as_headless_api = Column(Boolean, default=False) # Exposes the dataset for external BI ingestion
    widgets = Column(JSONB, nullable=False) # Array of chart definitions, data bindings, and layout grid coordinates
    status = Column(String, nullable=False, default="DRAFT", index=True)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, nullable=False)

class ReconciliationTemplate(Base):
    """
    Defines the logic blueprint for universal data comparison (Reconciliation Engine Canva).
    """
    __tablename__ = "reconciliation_templates"

    reconciliation_template_id = Column(String, primary_key=True, index=True)
    reconciliation_name = Column(String, nullable=False, unique=True, index=True)
    reconciliation_category = Column(String, nullable=False, index=True) # e.g., NOSTRO_VOSTRO, SYSTEM_TO_SYSTEM
    source_dataset_name = Column(String, nullable=False)
    target_dataset_name = Column(String, nullable=False)
    matching_rules = Column(JSONB, nullable=False) # List of match criteria, tolerances, linked rules/calcs
    status = Column(String, nullable=False, default="DRAFT", index=True)
    description = Column(Text, nullable=True)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, ForeignKey("product_master.product_id"), nullable=True, index=True)
    subproduct_id = Column(String, ForeignKey("subproduct_master.subproduct_id"), nullable=True, index=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

class DocumentMaster(Base):
    """
    Layer 5: Common Core Masters.
    Defines standardized document types required for workflow orchestration convergence.
    """
    __tablename__ = "document_master"
    document_id = Column(String, primary_key=True, index=True)
    document_name = Column(String, nullable=False, unique=True, index=True) # e.g., "Signed Tax Return"
    document_format = Column(String, nullable=False, default="ANY") # e.g., "PDF", "CSV", "EXCEL", "ANY"
    description = Column(Text, nullable=True)
    extraction_template_id = Column(String, ForeignKey("template_designer_blueprints.template_id"), nullable=True) # The Layout Template used to read the file
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")

class ReconciliationExecutionJob(Base):
    """
    Tracks the asynchronous execution state of a massive reconciliation job.
    Provides checkpointing for resumability across distributed Celery workers.
    """
    __tablename__ = "reconciliation_execution_jobs"
    job_id = Column(String, primary_key=True, index=True)
    template_id = Column(String, ForeignKey("reconciliation_templates.reconciliation_template_id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="PENDING", index=True) # PENDING, PROCESSING, COMPLETED, FAILED
    total_records = Column(Integer, nullable=True)
    processed_records = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    completed_at = Column(String, nullable=True)

class DomainApiContract(Base):
    """
    Defines a domain-driven API contract blueprint, designed in the API Designer Studio.
    """
    __tablename__ = "domain_api_contracts"

    api_contract_id = Column(String, primary_key=True, index=True)
    api_name = Column(String, nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="DRAFT", index=True) # DRAFT, PENDING_APPROVAL, APPROVED, DELETED
    request_contract = Column(JSONB, nullable=True) # List of ISO field technical_sys_names
    response_contract = Column(JSONB, nullable=True) # List of ISO field technical_sys_names
    created_at = Column(String, nullable=False)
    created_by = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

# --- LAYER 5: COMMON CORE MASTERS ---
class DynamicMasterRecord(Base):
    """
    Dynamic configuration store for any Master data screen built in the UI.
    Replaces hardcoded tables (Currencies, Accounts, etc.) with pure JSONB.
    """
    __tablename__ = "dynamic_master_records"
    record_id = Column(String, primary_key=True, index=True)
    screen_id = Column(String, ForeignKey("screen_templates.screen_id"), nullable=False, index=True)
    record_data = Column(JSONB, nullable=False)
    status = Column(String, nullable=False, default="DRAFT", index=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    __table_args__ = (
        Index("ix_dynamic_master_records_data_gin", "record_data", postgresql_using="gin"),
    )

    # --- OPTIMISTIC CONCURRENCY CONTROL (OCC) ---
    version_id = Column(Integer, nullable=False, default=1)
    __mapper_args__ = {
        "version_id_col": version_id
    }

class ProductApplicationPackage(Base):
    """
    Level 1: The Top-Level Application Package (e.g., "Payment Hub", "Supply Chain Finance").
    Holds the global jurisdiction and currency configuration for the deployment.
    """
    __tablename__ = "master_product_application_packages"
    package_id = Column(String, primary_key=True, index=True)
    package_name = Column(String, nullable=False, unique=True, index=True) 
    business_domain = Column(String, nullable=False) # e.g., Payments, Treasury
    jurisdiction_country_code = Column(String, nullable=False) # e.g., US, IN
    base_currency_code = Column(String, nullable=False) # e.g., USD, INR
    status = Column(String, nullable=False, default="DRAFT", index=True)
    implementation_status = Column(String, nullable=False, default="NOT_STARTED", index=True) # NOT_STARTED, IN_PROGRESS, COMPLETED, CANCELLED
    configuration_plan = Column(JSONB, nullable=True) # Array of modules, SLAs, and Owners
    description = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)


class BusinessDomain(Base):
    """
    WHY THIS EXISTS (WS-3):
    Business Domains are the sections inside a Package's sidebar navigation.
    Examples for Payment Hub: "Masters", "FX Operations", "Wire Payments", "Settlements".

    Key design decisions:
    - Pre-seeded by us per package (we deliver Payment Hub with domains pre-configured)
    - Bank can add custom domains (is_system_default = False)
    - Screens auto-assigned to a domain based on screen_template_category:
        MAINTENANCE   → Masters domain
        CONFIGURATION → Configuration domain
        TRANSACTION   → Transactions domain (or the specific product domain)
    - Bank can move a screen to a different domain (entitlement-controlled action)
    - sort_order controls sidebar menu ordering within the package

    WHAT BREAKS IF REMOVED:
    Package sidebar navigation has nothing to group screens into.
    The "Make it Live" flow cannot place a screen in its home menu.
    """
    __tablename__ = "business_domains"

    domain_id = Column(String, primary_key=True, index=True)
    package_id = Column(String, ForeignKey("master_product_application_packages.package_id", ondelete="CASCADE"), nullable=False, index=True)
    domain_name = Column(String, nullable=False)           # e.g. "Masters", "FX Operations"
    domain_code = Column(String, nullable=False, index=True) # e.g. "MASTERS", "FX_OPS"
    icon = Column(String, nullable=True)                   # emoji for sidebar
    description = Column(Text, nullable=True)
    # screen_type_affinity: which screen types auto-land here (comma-separated or JSON)
    # e.g. "MAINTENANCE" means MAINTENANCE screens auto-assigned to this domain
    screen_type_affinity = Column(String, nullable=True)
    is_system_default = Column(Boolean, default=True)      # False = bank-created custom domain
    sort_order = Column(Integer, default=0)
    status = Column(String, nullable=False, default="ACTIVE", index=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")


class ProductMaster(Base):
    """
    WHY THIS EXISTS:
    Level 2 master — a Payment Product within a Package. Examples: SWIFT MT103 Wire,
    SEPA Credit Transfer, FEDWIRE, ACH, RTP, Letter of Credit, FX Spot.
    Each product is independently configurable with its own workflow, rules, screens.

    WHAT BREAKS IF REMOVED:
    All Designer Studio modules lose their product-scoped context. Business rules,
    workflows, and calculations would have no product boundary.
    """
    __tablename__ = "product_master"
    product_id     = Column(String, primary_key=True, index=True)   # Auto: PRD-{YYYYMM}-{seq3}
    product_code   = Column(String, nullable=True, index=True)       # Short code e.g. "SWIFT-WIRE"
    package_id     = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=False, index=True)
    product_name   = Column(String, nullable=False, index=True)      # Full name e.g. "SWIFT MT103 Cross-Border Wire"
    alias          = Column(String, nullable=True)                   # Short display name e.g. "SWIFT Wire"
    product_type   = Column(String, nullable=True, index=True)       # PAYMENTS | LENDING | TREASURY | TRADE_FINANCE | CARDS | FX | RECONCILIATION
    description    = Column(Text, nullable=True)                     # Purpose and scope of this product
    status         = Column(String, nullable=False, default="DRAFT", index=True)  # DRAFT | ACTIVE | DEPRECATED
    owner_user_id  = Column(String, nullable=True)                   # Business SME who owns this product
    effective_date = Column(String, nullable=True)                   # When this product goes live
    created_at     = Column(String, nullable=False)
    updated_at     = Column(String, nullable=True)
    created_by     = Column(String, nullable=True)

class SubproductMaster(Base):
    """
    WHY THIS EXISTS:
    Level 3 master — a variation of a Product. product_id is the required first field.
    Examples: "SWIFT MT103 - Corporate B2B", "SEPA - Germany Retail", "ACH - Payroll".
    Sub-products share the parent's product_type but carry their own studio configuration.

    WHAT BREAKS IF REMOVED:
    Studios cannot distinguish product variations. A Business Rule for "SWIFT B2B"
    would apply to "SWIFT B2C" with no separation boundary.
    """
    __tablename__ = "subproduct_master"
    subproduct_id   = Column(String, primary_key=True, index=True)  # Auto: SP-{YYYYMM}-{seq3}
    subproduct_code = Column(String, nullable=True, index=True)      # e.g. "SWIFT-WIRE-B2B"
    product_id      = Column(String, ForeignKey("product_master.product_id"), nullable=False, index=True)
    subproduct_name = Column(String, nullable=False)
    alias           = Column(String, nullable=True)                  # Short display name
    variation_type  = Column(String, nullable=True)                  # BY_GEOGRAPHY | BY_SEGMENT | BY_CHANNEL | BY_CURRENCY | BY_LIMIT
    description     = Column(Text, nullable=True)
    status          = Column(String, nullable=False, default="DRAFT", index=True)  # DRAFT | ACTIVE | DEPRECATED
    created_at      = Column(String, nullable=False)
    updated_at      = Column(String, nullable=True)
    created_by      = Column(String, nullable=True)

    product = relationship("ProductMaster")


# --- STEP C: TRANSFORMATION MAPPING DESIGNER ---
class PayloadMapperBlueprint(Base):
    """
    Maps extracted Template JSON to Downstream/DB formats, invoking Rules & Math.
    """
    __tablename__ = "payload_mapper_blueprints"
    mapper_id = Column(String, primary_key=True, index=True)
    mapper_name = Column(String, nullable=False)
    source_template_id = Column(String, ForeignKey("template_designer_blueprints.template_id"), nullable=True) # Links to Layout
    target_format = Column(String, default="ISO_20022_DICTIONARY")
    
    # --- GAP 2: Outbound Data Support ---
    mapping_direction = Column(String, default="INBOUND") # INBOUND (Read to ISO) vs OUTBOUND (ISO to Write)
    status = Column(String, nullable=False, default="DRAFT", index=True)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, ForeignKey("product_master.product_id"), nullable=True, index=True)
    subproduct_id = Column(String, ForeignKey("subproduct_master.subproduct_id"), nullable=True, index=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="API_USER")
    file_control_totals = Column(JSONB, nullable=True) # E.g., [{"sum_field": "amount", "target_cell_field": "summary_total"}]
    
    # Relationship to automatically load all field mappings associated with this blueprint.
    mappings = relationship("PayloadFieldMapping", back_populates="blueprint", cascade="all, delete-orphan", lazy="joined")

class PayloadFieldMapping(Base):
    """
    Translates an extracted field into the target system field, applying math/rules.
    """
    __tablename__ = "payload_field_mappings"
    mapping_id = Column(String, primary_key=True, index=True)
    mapper_id = Column(String, ForeignKey("payload_mapper_blueprints.mapper_id", ondelete="CASCADE"), nullable=False)
    source_extracted_field = Column(String, nullable=False) # e.g., 'net_income' from Template
    target_iso_field = Column(String, nullable=False)   # e.g., 'of_fintax_bal_01'
    
    # GUI Canvas Linked Hooks
    transformation_rule_code = Column(String, nullable=True)  # Links to BRE Rules
    calculation_token_code = Column(String, nullable=True)    # Links to SymbolicFormulaAsset
    
    is_mandatory = Column(Boolean, default=False)
    default_value = Column(String, nullable=True)
    
    # Relationship back to the parent blueprint.
    blueprint = relationship("PayloadMapperBlueprint", back_populates="mappings")

# --- LAYER 4: ASYNCHRONOUS JOB TRACKING ---
class IngestionJob(Base):
    """
    Layer 4: Dual-Lane Execution Gateway (Deferred Settlement Engine).
    Tracks the status of asynchronous file ingestion jobs.
    """
    __tablename__ = "ingestion_jobs"

    job_id = Column(String, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    status = Column(String, nullable=False, default="PENDING", index=True) # PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED
    mapper_id = Column(String, nullable=False)
    workflow_id = Column(String, nullable=False)
    total_records = Column(Integer, nullable=True)
    processed_records = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    processing_started_at = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    completed_at = Column(String, nullable=True)


# --- LAYER 5: DATA ARCHIVAL ---
class IngestionJobArchive(Base):
    """
    Layer 5: Persistent Storage.
    Stores historical records of completed, failed, or cancelled ingestion jobs.
    """
    __tablename__ = "ingestion_jobs_archive"

    job_id = Column(String, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    status = Column(String, nullable=False, index=True)
    mapper_id = Column(String, nullable=False)
    workflow_id = Column(String, nullable=False)
    total_records = Column(Integer, nullable=True)
    processed_records = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    processing_started_at = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    completed_at = Column(String, nullable=True)
    archived_at = Column(String, nullable=False)

class ScreenTemplate(Base):
    """
    WHY THIS EXISTS:
    Stores every version of every screen ever created. A screen goes through
    states: DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED. When a LIVE screen
    is edited, a new row is created (version_number incremented, parent_screen_id
    set to the original). The old LIVE version stays running until the new version
    is approved and promoted — bank users never lose access during a redesign.
    Old versions are ARCHIVED, never deleted — auditors must answer
    "what did this screen look like on [date]?"

    State model:
        DRAFT             — being designed, not visible to bank users
        PENDING_APPROVAL  — submitted for 4-Eye review
        LIVE              — active, visible in Package sidebar navigation
        ARCHIVED          — superseded by a newer version, read-only audit record
    """
    __tablename__ = "screen_templates"

    screen_id = Column(String, primary_key=True, index=True)
    screen_name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)

    # ── Versioning (WS-2) ────────────────────────────────────────────────────
    # version_number: 1 for first version, increments on each redesign
    # parent_screen_id: NULL for v1; points to screen_id of v1 for all later versions
    #   This lets us find all versions of a screen: WHERE parent_screen_id = <v1_id>
    # unique constraint moved from screen_name alone to (screen_name, version_number)
    version_number = Column(Integer, nullable=False, default=1)
    parent_screen_id = Column(String, nullable=True, index=True)  # NULL = this is v1

    # Status now drives the full lifecycle (extended from DRAFT/ACTIVE/DELETED)
    status = Column(String, nullable=False, default="DRAFT", index=True)
    # DRAFT | PENDING_APPROVAL | LIVE | ARCHIVED

    # ── Screen type (three-type model) ───────────────────────────────────────
    # MAINTENANCE   — master/reference data (Currency, Country, Bank)
    # CONFIGURATION — drives workflow routing when submitted
    # TRANSACTION   — human-in-loop approval attached to a workflow step
    screen_template_category = Column(String, nullable=False, default="MAINTENANCE", index=True)

    # ── Hierarchical scoping ─────────────────────────────────────────────────
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, nullable=True, index=True)
    subproduct_id = Column(String, nullable=True, index=True)
    workflow_id = Column(String, nullable=True)
    workflow_step_id = Column(String, nullable=True, index=True)
    linked_api_id = Column(String, nullable=True)

    # ── Business domain (WS-3) — which sidebar section this screen belongs to
    business_domain_id = Column(String, nullable=True, index=True)

    definition = Column(JSONB, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, default="SYSTEM")
    made_live_at = Column(String, nullable=True)   # timestamp when status → LIVE
    made_live_by = Column(String, nullable=True)   # who approved it live

class MaintenanceTaskLog(Base):
    """
    Layer 5: The Immutable Evidence Packet Ledger (Operational).
    Logs the execution of system maintenance tasks.
    """
    __tablename__ = "maintenance_task_logs"

    log_id = Column(String, primary_key=True, index=True)
    task_name = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False) # SUCCESS, FAILED
    summary = Column(JSONB, nullable=True)
    details = Column(Text, nullable=True)
    triggered_by = Column(String, nullable=False)
    triggered_at = Column(String, nullable=False)
    duration_ms = Column(Integer, nullable=True)

class ApiConfiguration(Base):
    """
    Layer 4: Integration Gateway.
    Stores definitions for external API integrations that can be triggered by a workflow node.
    """
    __tablename__ = "api_configurations"

    api_id = Column(String, primary_key=True, index=True)
    api_name = Column(String, nullable=False, unique=True)
    http_method = Column(String, nullable=False) # GET, POST, PUT
    url_template = Column(String, nullable=False) # e.g., https://api.example.com/users/{user_id}
    request_body_template = Column(JSONB, nullable=True) # For POST/PUT requests
    headers = Column(JSONB, nullable=True) # e.g., {"Authorization": "Bearer {SECRET_TOKEN}"}
    mask_pii_in_body = Column(Boolean, default=True) # If true, automatically mask PII in the request body
    
    # Fault Tolerance & Integration Patterns (Layer 4)
    rate_limit_rps = Column(Integer, default=10, nullable=False) # Requests Per Second maximum
    circuit_breaker_threshold = Column(Integer, default=5, nullable=False) # Failures before tripping
    circuit_breaker_timeout_sec = Column(Integer, default=60, nullable=False) # Cooldown before half-open state
    
    description = Column(Text, nullable=True)

    # Integration classification — added to support Integration Gateway quadrant model.
    # direction: which way data flows relative to InfinityProductOS.
    #   INBOUND  = external/internal system sends data TO this platform (webhooks, callbacks, push APIs)
    #   OUTBOUND = this platform calls external/internal system (POST payment, GET rates, trigger event)
    # scope: which boundary this integration crosses.
    #   EXTERNAL = outside the bank (SWIFT, regulators, correspondent banks, payment rails, KYC providers)
    #   INTERNAL = inside the bank (core banking T24/Flexcube, GL, fraud engine, CRM, internal microservices)
    direction = Column(String, nullable=False, default="OUTBOUND", index=True)  # INBOUND | OUTBOUND
    scope = Column(String, nullable=False, default="EXTERNAL", index=True)       # INTERNAL | EXTERNAL

    status = Column(String, nullable=False, default="DRAFT", index=True)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, ForeignKey("product_master.product_id"), nullable=True, index=True)
    subproduct_id = Column(String, ForeignKey("subproduct_master.subproduct_id"), nullable=True, index=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)


class BatchGatewayConfiguration(Base):
    """
    WHY THIS EXISTS:
    Batch Gateway Designer — defines scheduled/file-based integration jobs.
    Complements ApiConfiguration (real-time) with the async/bulk data movement pattern.

    Banks run hundreds of batch jobs daily: EOD settlement files to SWIFT, BACS/SEPA
    bulk payment files, inbound nostro statements from correspondents, internal GL feeds.
    This model stores the WHAT/HOW/WHEN of each job. Execution is triggered by Celery
    scheduler referencing these configs — no hardcoded cron scripts needed.

    direction + scope: same quadrant model as ApiConfiguration.
    source_type: where the batch originates (SFTP server, S3 bucket, file drop, API poll).
    file_template_id: optional reference to a FileTemplate defining the expected layout.
    """
    __tablename__ = "batch_gateway_configurations"

    config_id = Column(String, primary_key=True, index=True)
    config_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Integration quadrant — same axes as ApiConfiguration
    direction = Column(String, nullable=False, default="INBOUND", index=True)   # INBOUND | OUTBOUND
    scope = Column(String, nullable=False, default="EXTERNAL", index=True)       # INTERNAL | EXTERNAL

    # Source/destination details
    source_type = Column(String, nullable=False, default="SFTP")  # SFTP | S3 | FILE_DROP | API_POLL | MQ
    connection_config = Column(JSONB, nullable=True)  # host, port, path, credential_key_ref — never raw secrets

    # Schedule — cron expression interpreted by Celery beat
    schedule_cron = Column(String, nullable=True)   # e.g., "0 18 * * 1-5" = weekdays at 6pm
    timezone = Column(String, nullable=False, default="UTC")

    # Optional reference to a File Template for layout validation
    file_template_id = Column(String, ForeignKey("template_designer_blueprints.template_id"), nullable=True, index=True)

    # Fault tolerance
    retry_max_attempts = Column(Integer, default=3)
    retry_backoff_sec = Column(Integer, default=60)
    alert_on_failure_email = Column(String, nullable=True)

    # Lifecycle: DRAFT → PENDING_APPROVAL → LIVE → DISABLED
    status = Column(String, nullable=False, default="DRAFT", index=True)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)

    # Audit
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)


class UserInteractionEvent(Base):
    """
    Layer 2: Agentic Alignment Layer (Behavioural AI).
    Logs user interactions for Behavioural AI analysis and model training.
    """
    __tablename__ = "user_interaction_events"

    event_id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=True, index=True)
    event_type = Column(String, nullable=False, index=True) # e.g., SCREEN_VIEW, BUTTON_CLICK, FIELD_UPDATE
    target_component_id = Column(String, nullable=True) # e.g., the ID of a button or input field
    payload = Column(JSONB, nullable=True) # Rich context, e.g., {"field_value": "new text", "screen_name": "Login"}
    timestamp = Column(String, primary_key=True, nullable=False, index=True)

    __table_args__ = {
        'postgresql_partition_by': 'RANGE (timestamp)'
    }

class CustomerBehavioralProfile(Base):
    """
    Layer 2: Agentic Alignment Layer (Behavioral AI).
    Stores an aggregated, stateful profile of a user's learned habits and preferences.
    """
    __tablename__ = "customer_behavioral_profiles"

    user_id = Column(String, primary_key=True, index=True)
    ranked_journeys = Column(JSONB, nullable=True) # e.g., [{"journey_id": "RTP_PAYMENT", "rank": 0.98, "interaction_count": 150}]
    common_devices = Column(JSONB, nullable=True) # e.g., [{"fingerprint": "...", "type": "mobile", "last_seen": "..."}]
    typical_locations = Column(JSONB, nullable=True) # e.g., [{"city": "New York", "country": "US", "last_seen": "..."}]
    avg_transaction_value = Column(Float, nullable=True)
    net_worth_estimate = Column(Float, nullable=True)
    last_calculated_at = Column(String, nullable=False)
    profile_version = Column(Integer, default=1)

class BehavioralProfileUpdateJob(Base):
    """
    Layer 8: Fault Tolerance.
    Tracks the asynchronous execution state of Behavioral AI profile updates.
    Provides checkpointing for resumability across massive datasets.
    """
    __tablename__ = "behavioral_profile_update_jobs"
    job_id = Column(String, primary_key=True, index=True)
    status = Column(String, nullable=False, default="PENDING", index=True) # PENDING, PROCESSING, COMPLETED, FAILED
    total_users = Column(Integer, nullable=True)
    processed_users = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    completed_at = Column(String, nullable=True)

class TransactionalOutboxEvent(Base):
    """
    Layer 4: Transactional Outbox Pattern for Distributed Systems.
    Guarantees 100% event delivery to Kafka by tying event creation 
    to the same atomic database transaction as the business state change.
    """
    __tablename__ = "transactional_outbox_events"

    event_id = Column(String, primary_key=True, index=True)
    aggregate_type = Column(String, nullable=False, index=True) # e.g., "WorkflowExecution", "GovernanceTask"
    aggregate_id = Column(String, nullable=False, index=True)   # e.g., "WF-12345"
    event_type = Column(String, nullable=False, index=True)     # e.g., "WORKFLOW_COMPLETED"
    payload = Column(JSONB, nullable=False)                     # The full event data payload
    
    # Auditing and Poller tracking
    created_at = Column(String, nullable=False, index=True)
    status = Column(String, default="PENDING", index=True)      # PENDING, PUBLISHED, FAILED


class SimulationScenario(Base):
    __tablename__ = "simulation_scenarios"
    simulation_id = Column(String, primary_key=True, index=True)
    simulation_name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    target_workflow_id = Column(String, nullable=False, index=True)
    sample_size = Column(Integer, default=100)
    scenario_variables = Column(JSONB, nullable=True)
    historical_dataset_source = Column(String, nullable=True)
    created_at = Column(String, nullable=False)

class SimulationJob(Base):
    __tablename__ = "simulation_jobs"
    job_id = Column(String, primary_key=True, index=True)
    simulation_id = Column(String, nullable=False, index=True)
    status = Column(String, default="PENDING", index=True)
    processed_records = Column(Integer, default=0)
    total_records = Column(Integer, default=0)
    results_summary = Column(JSONB, nullable=True)
    created_at = Column(String, nullable=False)


class DocumentChecklist(Base):
    """
    WHY THIS EXISTS (WS-6 — Document Checklist Canvas):
    Defines which documents must be collected at a specific workflow step before
    the workflow can advance. A checklist is a named container (e.g. "KYC Checklist
    for Corporate Onboarding") that holds one or more DocumentChecklistItem rows.

    At runtime the workflow node references a checklist_id. Before allowing the
    operator to advance to the next step, the Runtime Engine checks:
      - All MANDATORY items have been uploaded and marked verified
      - OPTIONAL items are flagged but do not block progression

    A checklist can be reused across multiple workflow nodes and packages.
    Versioned and 4-Eye approved — same lifecycle as screens and templates.

    WHAT BREAKS IF REMOVED:
    Workflow steps that require document collection (KYC, credit approval,
    compliance sign-off) have no enforcement gate — operators can skip past
    them without uploading required documents.
    """
    __tablename__ = "document_checklists"

    checklist_id = Column(String, primary_key=True, index=True)
    checklist_name = Column(String, nullable=False, index=True)     # e.g. "Corporate KYC Checklist"
    description = Column(Text, nullable=True)

    # Which workflow step this checklist is designed for (informational — actual
    # attachment is done in the workflow node config panel, WS-10)
    intended_workflow_step = Column(String, nullable=True)          # e.g. "Credit Approval", "Account Opening"

    # Package scope
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)

    # Versioning — same pattern as ScreenTemplate and CommunicationTemplate
    version_number = Column(Integer, nullable=False, default=1)
    parent_checklist_id = Column(String, nullable=True, index=True)

    # Lifecycle
    status = Column(String, nullable=False, default="DRAFT", index=True)
    # DRAFT | PENDING_APPROVAL | LIVE | ARCHIVED

    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, default="SYSTEM")
    made_live_at = Column(String, nullable=True)
    made_live_by = Column(String, nullable=True)


class DocumentChecklistItem(Base):
    """
    WHY THIS EXISTS:
    One row per document required within a checklist. Separating items into their
    own table (rather than a JSONB array on DocumentChecklist) allows:
    - Independent sort ordering
    - FK reference to DocumentMaster for type safety
    - Granular status tracking per item at runtime (uploaded / verified / rejected)

    accepted_formats: comma-separated or JSON list e.g. ["PDF", "JPG", "PNG"]
    is_mandatory: False = document shown and encouraged but does not block workflow
    upload_instructions: plain text shown to the bank operator at runtime
    """
    __tablename__ = "document_checklist_items"

    item_id = Column(String, primary_key=True, index=True)
    checklist_id = Column(String, ForeignKey("document_checklists.checklist_id", ondelete="CASCADE"), nullable=False, index=True)

    # Reference to the document type master (what kind of doc is this?)
    document_master_id = Column(String, ForeignKey("document_master.document_id"), nullable=True, index=True)
    document_name = Column(String, nullable=False)       # denormalised for display when no FK

    is_mandatory = Column(Boolean, nullable=False, default=True)
    accepted_formats = Column(JSONB, nullable=True)      # e.g. ["PDF", "JPG"]
    max_file_size_mb = Column(Integer, nullable=True, default=10)
    upload_instructions = Column(Text, nullable=True)    # shown to operator at runtime
    sort_order = Column(Integer, nullable=False, default=0)

    created_at = Column(String, nullable=False)


class CommunicationTemplate(Base):
    """
    WHY THIS EXISTS (WS-5 — Document Template Designer):
    Stores reusable communication templates for EMAIL, LETTER (PDF), and SMS
    that are attached to workflow nodes and dispatched by the Notification Engine
    at runtime. Templates contain ISO field placeholders (e.g. {{Currency.Amount}},
    {{Counterparty.Name}}) that are substituted with live transaction data when sent.

    Design principles:
    - Versioned: same lifecycle as ScreenTemplate (DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED)
    - ISO-anchored: placeholders reference iso_business_name fields — not hardcoded strings
    - Type-specific: EMAIL has subject+body, LETTER has full rich body for PDF render,
      SMS has short body only (160 char guidance enforced at UI level)
    - 4-Eye approved before live: a template going live is a governance action
      (a wrong template could send incorrect info to bank customers)

    WHAT BREAKS IF REMOVED:
    Workflow Notification Engine has no templates to render — cannot send
    emails, letters, or SMS at any workflow step.
    """
    __tablename__ = "communication_templates"

    template_id = Column(String, primary_key=True, index=True)
    template_name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)

    # Template type drives which fields are required and how it's rendered
    template_type = Column(String, nullable=False, index=True)  # EMAIL | LETTER | SMS

    # EMAIL fields
    subject_line = Column(String, nullable=True)        # supports placeholders: "Your {{Currency.Amount}} transfer is confirmed"

    # Shared body — plain text with {{ISO.Field}} placeholders
    # EMAIL: HTML-safe rich text; LETTER: formatted for PDF; SMS: max 160 chars guidance
    body_content = Column(Text, nullable=False)

    # ISO field placeholders used in this template — stored as JSON array of iso_business_name strings
    # e.g. ["Currency.Amount", "Counterparty.Name", "Account1.Identification"]
    # Populated automatically when user inserts a placeholder; used by runtime to pre-fetch fields
    referenced_iso_fields = Column(JSONB, nullable=True)

    # Versioning — same pattern as ScreenTemplate (WS-2)
    version_number = Column(Integer, nullable=False, default=1)
    parent_template_id = Column(String, nullable=True, index=True)  # NULL = v1

    # Lifecycle state
    status = Column(String, nullable=False, default="DRAFT", index=True)
    # DRAFT | PENDING_APPROVAL | LIVE | ARCHIVED

    # Package scope
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)

    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, default="SYSTEM")
    made_live_at = Column(String, nullable=True)
    made_live_by = Column(String, nullable=True)


class RoleProfile(Base):
    """
    WHY THIS EXISTS:
    Role Profiles are the master definition of who can do what on this platform.
    Previously roles were hardcoded as a Python list in routers/entitlements.py
    (ALL_ROLES = ["ADMIN", "OPERATOR", ...]). That meant adding a new role required
    a code change and redeploy — violating ADR #3 (no hardcoded logic).

    By storing roles as DB records, a System Administrator can:
      1. Create a new role (e.g. "COMPLIANCE_OFFICER") without touching code
      2. Assign that role to users via UserProfile
      3. Grant it permissions via EntitlementPolicy — all from the UI

    is_system_role = True means this role was seeded at startup and cannot be
    deleted (ADMIN, AUDITOR, VIEWER must always exist for the platform to function).

    WHAT BREAKS IF REMOVED: EntitlementPolicy.role_code references become orphaned.
    The Entitlement Configuration studio cannot auto-populate role columns.
    """
    __tablename__ = "role_profiles"

    role_id = Column(String, primary_key=True, index=True)
    role_code = Column(String, nullable=False, unique=True, index=True)
    # e.g. ADMIN, OPERATOR, RISK, AUDITOR, VIEWER, SALES, C_LEVEL, COMPLIANCE_OFFICER

    role_name = Column(String, nullable=False)
    # Display name, e.g. "Risk Manager"
    description = Column(Text, nullable=True)

    # NULL = platform-wide role; set package_id for package-specific roles
    package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)

    # System roles are seeded at startup and cannot be deleted
    is_system_role = Column(Boolean, nullable=False, default=False)

    # Default permission template — used when auto-registering a new entity
    # Stored as JSONB: { "can_view": true, "can_modify_data": false, "can_modify_design": false, "can_approve": false }
    default_permissions = Column(JSONB, nullable=False, default=dict)

    status = Column(String, nullable=False, default="ACTIVE", index=True)
    # ACTIVE | INACTIVE

    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, nullable=False, default="SYSTEM")
    updated_by = Column(String, nullable=True)


class UserProfile(Base):
    """
    WHY THIS EXISTS:
    User Profiles are the person-level record for everyone who logs into the platform.
    Currently the frontend injects X-User-Id: designer_admin as a header (local dev
    mode — see auth.py). In production, the OIDC JWT provides the user_id.

    Having users as DB records enables:
      1. Auditors can see "who" made every change (user_id links to a name/email)
      2. Queue entitlements: allowed_user_ids on MessageQueue reference these user_ids
         for temporary access overrides (weekend cover, staff absence)
      3. 4-Eye approval: the second approver is a UserProfile, not an anonymous string

    primary_role_code: the main role that determines default permissions.
    additional_role_codes: multi-role support (e.g. someone who is both OPERATOR and RISK).
    package_ids: which packages this user can access (empty = access all).

    WHAT BREAKS IF REMOVED: Queue entitlement user overrides have no validation source.
    Audit logs show user_id strings with no way to resolve them to real names.
    """
    __tablename__ = "user_profiles"

    user_id = Column(String, primary_key=True, index=True)
    username = Column(String, nullable=False, unique=True, index=True)
    display_name = Column(String, nullable=False)
    email = Column(String, nullable=True, unique=True, index=True)

    primary_role_code = Column(String, ForeignKey("role_profiles.role_code"), nullable=False)
    # Additional roles — evaluated with OR logic (user has permission if ANY role grants it)
    additional_role_codes = Column(JSONB, nullable=False, default=list)

    # Package access scope — empty list means user has access to all packages
    package_ids = Column(JSONB, nullable=False, default=list)

    # Optional: direct queue access overrides (referenced by MessageQueue.allowed_user_ids)
    # These are queue_ids, not queue_codes — for explicit per-user queue access
    explicit_queue_ids = Column(JSONB, nullable=False, default=list)

    status = Column(String, nullable=False, default="ACTIVE", index=True)
    # ACTIVE | SUSPENDED | LOCKED

    last_login_at = Column(String, nullable=True)

    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, nullable=False, default="SYSTEM")
    updated_by = Column(String, nullable=True)


class EntitlementPolicy(Base):
    """
    WHY THIS EXISTS (WS-8 — Entitlement Configuration Module):
    Every entity that goes LIVE on this platform (screen, workflow, report, rule,
    calculation) is automatically registered here. An admin then assigns permissions
    per entity per role — no developer involvement, no code change, no redeploy.

    This replaces ALL hardcoded access control in the frontend (ADR #3 violation
    that was caught and reverted in session on 2026-06-19).

    Two distinct permission levels per entity+role pair:
      MODIFY_DATA   — user can view and enter/edit data in this entity (e.g. open
                      Currency Master screen and add a currency). No approval needed.
      MODIFY_DESIGN — user can open the entity in its designer studio and change
                      its structure. Triggers full lifecycle: Draft → Approval → Live.

    Entity types covered:
      SCREEN       — a Screen Designer screen
      WORKFLOW     — a Workflow Designer workflow
      REPORT       — a Report Designer report
      RULE         — a Business Rules rule set
      CALCULATION  — a Calculation Engine formula
      INTEGRATION  — an API Designer integration
      RECONCILIATION — a Reconciliation Engine template
      BUSINESS_DOMAIN — the domain/menu section itself (who can move screens between domains)

    Auto-registration flow:
      Entity goes LIVE → backend calls register_entitlement() →
      creates one EntitlementPolicy row per role defined in the system →
      all permissions default to False (deny-by-default) →
      admin opens this module and grants what's needed.

    WHAT BREAKS IF REMOVED:
      Every studio becomes accessible to every user. Bank would need developer
      involvement to control access, defeating the no-code principle.
    """
    __tablename__ = "entitlement_policies"

    policy_id = Column(String, primary_key=True, index=True)

    # What entity this policy controls
    entity_type = Column(String, nullable=False, index=True)   # SCREEN, WORKFLOW, REPORT, RULE, etc.
    entity_id = Column(String, nullable=False, index=True)     # the actual screen_id / workflow_id etc.
    entity_name = Column(String, nullable=False)               # human-readable, denormalised for display

    # Package scope — NULL means platform-level (applies across all packages)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)

    # Role this policy applies to
    role_code = Column(String, nullable=False, index=True)     # ADMIN, OPERATOR, AUDITOR, VIEWER, SALES, RISK, C_LEVEL

    # Permissions — deny by default, admin must explicitly grant
    can_view = Column(Boolean, default=False, nullable=False)
    can_modify_data = Column(Boolean, default=False, nullable=False)   # enter/edit data inside entity
    can_modify_design = Column(Boolean, default=False, nullable=False) # change entity structure (triggers lifecycle)
    can_approve = Column(Boolean, default=False, nullable=False)       # 4-Eye approver for this entity

    # Audit
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, default="SYSTEM")
    updated_by = Column(String, nullable=True)


class NotificationPolicy(Base):
    """
    WHY THIS EXISTS (WS-7 — Notification Engine):
    A named, versioned collection of notification triggers that can be attached
    to a workflow node. When the node executes, the Workflow Executor fires every
    LIVE trigger in the attached policy in sort_order sequence.

    Separating the policy from the workflow node lets the same policy be reused
    across nodes (e.g. "AML Alert Policy" used by the Credit Approval node in both
    FX Hub and Trade Finance Hub). Versioned lifecycle means you can update
    notification config without touching the workflow graph itself.

    WHAT BREAKS IF REMOVED:
    Workflow nodes have no notification capability — no customer confirmations,
    no risk team alerts, no SMS-wait gates.
    """
    __tablename__ = "notification_policies"

    policy_id = Column(String, primary_key=True, index=True)
    policy_name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)

    # Scoped to a package — NULL means platform-wide (shared across packages)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)

    # Versioning — editing a LIVE policy creates a new version; old stays live
    version_number = Column(Integer, nullable=False, default=1)
    parent_policy_id = Column(String, nullable=True, index=True)

    # Lifecycle: DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED
    status = Column(String, nullable=False, default="DRAFT", index=True)

    # Audit
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, nullable=False)
    made_live_at = Column(String, nullable=True)
    made_live_by = Column(String, nullable=True)


class NotificationTrigger(Base):
    """
    WHY THIS EXISTS:
    An individual notification instruction within a NotificationPolicy.
    Defines WHO gets notified, via WHAT channel, using WHICH template,
    and whether the workflow should PAUSE waiting for their reply (SMS-Wait).

    Recipient resolution at runtime:
    - ROLE_BASED → all platform users with the given role_code in this package
    - ISO_FIELD  → contact pulled from the live transaction record
                   (e.g. ISO.BeneficiaryPhone, ISO.OriginatorEmail)
                   Works for end customers — their data lives in the transaction
    - STATIC     → fixed address for external partners / vendor integrations
                   (accepted override of ADR #3 for truly external systems)

    SMS-Wait: the Workflow Executor sends the SMS then enters WAITING state.
    It does NOT decide what to do on timeout — that is the workflow graph's job
    (a timeout branch edge, or a business rule on the next node). Clean separation.
    """
    __tablename__ = "notification_triggers"

    trigger_id = Column(String, primary_key=True, index=True)
    policy_id = Column(String, ForeignKey("notification_policies.policy_id", ondelete="CASCADE"), nullable=False, index=True)

    trigger_name = Column(String, nullable=False)

    # Which comm template provides the content (body, subject, channel type)
    comm_template_id = Column(String, ForeignKey("communication_templates.template_id"), nullable=True)

    # Channel — EMAIL | SMS_WAIT | LETTER
    # SMS_WAIT = send SMS and pause the workflow until customer replies (or timeout)
    notification_type = Column(String, nullable=False)

    # Who gets this notification
    recipient_mode = Column(String, nullable=False)  # ROLE_BASED | ISO_FIELD | STATIC
    recipient_role = Column(String, nullable=True)   # e.g. RISK, OPERATOR (ROLE_BASED mode)
    recipient_iso_field = Column(String, nullable=True)  # e.g. ISO.BeneficiaryEmail (ISO_FIELD mode)
    recipient_static = Column(String, nullable=True) # e.g. compliance@partner.com (STATIC mode)

    # Human-readable label for who this reaches — shown in the studio UI
    # e.g. "Customer", "Risk Team", "External Compliance Partner"
    audience_label = Column(String, nullable=True)

    # SMS-Wait config — only relevant when notification_type = SMS_WAIT
    # The workflow PAUSES after sending. Timeout = how long to wait for reply.
    # What happens AFTER timeout is the Workflow Executor's responsibility (graph logic).
    wait_for_reply = Column(Boolean, nullable=False, default=False)
    timeout_minutes = Column(Integer, nullable=True)  # NULL = wait indefinitely

    # Execution order within the policy
    sort_order = Column(Integer, nullable=False, default=0)

    created_at = Column(String, nullable=False)


class UnstructuredExtractionBlueprint(Base):
    """
    WHY THIS EXISTS (WS-9 — Unstructured Document Studio):
    Configuration blueprint for AI-driven extraction from documents that cannot
    be read with simple column/cell addressing (unlike File Template Designer,
    which handles structured CSV/Excel/SWIFT layouts).

    Three extraction profiles:
      PDF_STRUCTURED — PDF with predictable layout (invoices, bank statements).
                       Uses OCR zone config: "amount table bottom-right page 1".
      PDF_AGENTIC    — Long-form documents (legal contracts, KYC packs, compliance
                       reports). Section-aware agentic chain: the AI reads the whole
                       document to find governing law, jurisdiction, obligations etc.
      IMAGE_OCR      — Scanned/photographed documents requiring pre-processing
                       (deskew, denoise) before OCR zone extraction.

    document_type_id links to DocumentMaster (user-defined, not hardcoded enum).
    Users create their own types ("Invoice", "Legal Contract", "AML Certificate")
    in Document Master Studio first — consistent with ADR #3 no-code principle.

    ai_extraction_config JSONB structure varies by profile (see router comments).
    fallback_mode defines what happens when confidence < threshold:
      SKIP_FIELD    — leave the ISO field empty, continue processing
      HUMAN_REVIEW  — flag the extraction for human verification before proceeding
      USE_DEFAULT   — fill with the default_value specified per rule

    WHAT BREAKS IF REMOVED:
    PDFs, scanned documents, and long legal contracts cannot be ingested into
    the platform. KYC document automation, invoice processing, and contract
    analysis all stop working.
    """
    __tablename__ = "unstructured_extraction_blueprints"

    blueprint_id = Column(String, primary_key=True, index=True)
    blueprint_name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)

    # User-defined document type from DocumentMaster — NOT a hardcoded enum (ADR #3)
    # e.g., "Invoice", "Legal Contract", "KYC Pack", "AML Certificate"
    document_type_id = Column(String, ForeignKey("document_master.document_id"), nullable=True, index=True)

    # Which AI extraction approach to use
    extraction_profile = Column(String, nullable=False)  # PDF_STRUCTURED | PDF_AGENTIC | IMAGE_OCR

    # Profile-specific extraction rules stored as JSONB
    # PDF_STRUCTURED: {"extraction_rules": [{rule_name, page, position_hint, iso_field, is_mandatory, confidence_threshold}]}
    # PDF_AGENTIC:    {"sections": [{section_name, section_prompt, fields: [{field_name, extraction_prompt, iso_field, is_mandatory}]}]}
    # IMAGE_OCR:      {"pre_processing": ["deskew","denoise"], "language": "en", "extraction_rules": [...same as PDF_STRUCTURED...]}
    ai_extraction_config = Column(JSONB, nullable=True)

    # Global confidence threshold — per-rule overrides live inside ai_extraction_config
    confidence_threshold = Column(Float, nullable=False, default=0.80)

    # What to do when confidence < threshold
    fallback_mode = Column(String, nullable=False, default="HUMAN_REVIEW")  # SKIP_FIELD | HUMAN_REVIEW | USE_DEFAULT

    # Scoped to a package
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)

    # Lifecycle: DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED
    version_number = Column(Integer, nullable=False, default=1)
    parent_blueprint_id = Column(String, nullable=True, index=True)
    status = Column(String, nullable=False, default="DRAFT", index=True)

    # Audit
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, nullable=False)
    made_live_at = Column(String, nullable=True)
    made_live_by = Column(String, nullable=True)


class CalculationProgram(Base):
    """
    WHY THIS MODEL EXISTS:
    The new first-class entity for the Calculation Engine. Replaces the old single-expression
    SymbolicFormulaAsset paradigm with a sequential, stateful computation program — the
    direct replacement for Python scripts, MS Access macros, and User-Defined Tables that
    analytics teams currently maintain as black boxes.

    A Calculation Program is an ordered list of steps. Each step assigns a named variable
    from a formula expression. State accumulates through the namespace so later steps can
    reference earlier results. One or more steps can be marked as outputs (published tokens).

    This model serves BOTH the Formula Registry (is_template=True) AND user programs
    (is_template=False). A simple 1-step formula is just a program with one step.
    A 12-step CLO waterfall is a program with 12 steps. Same table, same engine.

    JSON shape for steps[]:
      [{
        "seq": 1,
        "var_name": "GROSS_INT",
        "expression": "OUTSTANDING_BAL * COUPON / 360 * DAYS",
        "description": "Gross interest on the period",
        "is_output": false,
        "output_token": null
      }, ...]

    JSON shape for inputs[]:
      [{
        "name": "OUTSTANDING_BAL",
        "source_type": "RUNTIME_INPUT",   # ISO_FIELD | RATE_FEED | POLICY_CONSTANT | FORMULA_TOKEN | RUNTIME_INPUT | DAY_COUNT
        "iso_field_id": null,
        "value": null,
        "feed_code": null,
        "convention": null,               # for DAY_COUNT: ACT_360 | ACT_365 | 30_360 | 30E_360 | ACT_ACT
        "description": "Outstanding principal balance of the collateral record"
      }, ...]
    """
    __tablename__ = "calculation_programs"

    program_id = Column(String, primary_key=True, index=True)
    program_code = Column(String, unique=True, nullable=False, index=True)   # e.g. CP-SF-001
    business_name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)

    # Classification
    domain = Column(String, nullable=True, index=True)       # PAYMENTS | CREDIT_RISK | TREASURY | STRUCTURED_FINANCE | INVESTMENT_BANKING | RETAIL_BANKING | CORPORATE_BANKING
    tier = Column(String, nullable=True)                     # T1 | T2 | T3
    tags = Column(JSONB, nullable=True)

    # Template vs user program
    is_template = Column(Boolean, nullable=False, default=False, index=True)
    locked_steps = Column(Boolean, nullable=False, default=False)

    # Core logic
    steps = Column(JSONB, nullable=False, default=list)
    inputs = Column(JSONB, nullable=False, default=list)

    # Product scoping
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, ForeignKey("product_master.product_id"), nullable=True, index=True)
    subproduct_id = Column(String, ForeignKey("subproduct_master.subproduct_id"), nullable=True, index=True)

    status = Column(String, nullable=False, default="DRAFT", index=True)

    # Audit
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, nullable=False, default="SYSTEM")
    updated_by = Column(String, nullable=True)


# ===========================================================================
# MESSAGE QUEUE INFRASTRUCTURE
# ===========================================================================
# WHY THIS EXISTS:
# External message queues (IBM MQ, TIBCO EMS, Oracle AQ, Kafka, SWIFT Alliance)
# are the backbone of real payment processing. The Workflow Engine does not decide
# when a payment is complete — the queue acknowledgement does. A pacs.002
# ACSC response from SWIFT moves the workflow to SETTLED. A RJCT code routes it
# to a specific exception child queue for repair or compliance investigation.
#
# Three tables form the Queue Infrastructure master:
#   1. ExternalQueueConnection — physical connection to an MQ system
#   2. MessageQueue            — logical queue definition (MASTER | CHILD | DLQ | RESPONSE)
#   3. QueueRoutingRule        — response code → workflow state transition mapping
#
# These tables are referenced by the Workflow Engine's PUBLISH_TO_QUEUE,
# AWAIT_QUEUE_RESPONSE, ROUTE_ON_RESPONSE, and QUEUE_TIMEOUT_ESCALATE step_types.

class ExternalQueueConnection(Base):
    """
    WHY THIS EXISTS:
    Physical connection configuration for an external MQ system. Banks connect to
    IBM MQ for SWIFT/CHIPS, TIBCO EMS for capital markets, Oracle AQ for FLEXCUBE
    integration, Kafka for real-time event streaming, or SWIFT Alliance Gateway for
    cross-border payments. Each Package can have multiple connections (e.g. one IBM MQ
    for SWIFT, one Kafka for internal event bus).

    Credentials are stored as vault references (ADR #2) — never the actual secret.
    The adapter layer reads the vault ref at runtime and fetches the real credential.

    WHAT BREAKS IF REMOVED: PUBLISH_TO_QUEUE and AWAIT_QUEUE_RESPONSE workflow
    step_types cannot resolve which physical system to send to. All queue-driven
    payment workflows fall back to synchronous API_CALL only.
    """
    __tablename__ = "external_queue_connections"

    connection_id = Column(String, primary_key=True, index=True)
    connection_name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)

    # MQ provider — determines which adapter class to instantiate at runtime
    provider = Column(String, nullable=False, index=True)
    # IBM_MQ | TIBCO_EMS | ORACLE_AQ | KAFKA | SWIFT_ALLIANCE | RABBITMQ | ACTIVEMQ

    # Connection parameters — provider-specific, stored as JSONB for flexibility
    # IBM MQ:   {host, port, channel, queue_manager, transport_type}
    # Kafka:    {bootstrap_servers, security_protocol, group_id}
    # TIBCO:    {provider_url, connection_factory}
    # Oracle AQ:{dsn, schema}
    # SWIFT:    {swift_bn, service_name, requestor_dn, responder_dn}
    connection_params = Column(JSONB, nullable=False, default=dict)

    # Credential vault reference — ADR #2: never store actual secrets in the DB
    credential_ref = Column(String, nullable=True)

    # TLS / certificate configuration
    tls_enabled = Column(Boolean, nullable=False, default=True)
    tls_config = Column(JSONB, nullable=True)  # {cert_path_ref, key_path_ref, ca_cert_ref}

    # Reconnect / reliability settings
    max_reconnect_attempts = Column(Integer, nullable=False, default=5)
    reconnect_interval_sec = Column(Integer, nullable=False, default=30)
    heartbeat_interval_sec = Column(Integer, nullable=True)

    # Scoping — a connection belongs to a package
    package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)

    status = Column(String, nullable=False, default="DRAFT", index=True)
    # DRAFT | ACTIVE | SUSPENDED | ERROR

    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, nullable=False, default="SYSTEM")
    updated_by = Column(String, nullable=True)


class MessageQueue(Base):
    """
    WHY THIS EXISTS:
    Logical queue definitions scoped to Package / Product / Sub-Product. Every payment
    product needs at minimum: an INBOUND queue (incoming instructions), an OUTBOUND
    queue (instructions to clearing), a RESPONSE queue (settlement confirmations), and
    a DEAD_LETTER queue (unprocessable messages). Child queues handle specific exception
    categories (AML, OFAC, insufficient funds, duplicate detection).

    Entitlements on each queue are defined at two levels (industry standard pattern):
      1. Role-based:  roles that can see/process items in this queue
      2. User-based:  individual user IDs for temporary access overrides (weekend cover,
                      staff absence) — the OR condition means a user lacking the role
                      can still access if their user_id is explicitly listed

    SLA timers: each queue has a breach threshold. Breaching triggers on_sla_breach_action
    (ESCALATE to escalation queue, ALERT to Queue Administrator, or BOTH).

    WHAT BREAKS IF REMOVED: ROUTE_ON_RESPONSE cannot direct exceptions to the right
    child queue. Entitlement enforcement on queue access has no configuration to read.
    """
    __tablename__ = "message_queues"

    queue_id = Column(String, primary_key=True, index=True)
    queue_name = Column(String, nullable=False, index=True)
    queue_code = Column(String, nullable=False, unique=True, index=True)
    # e.g. SWIFT_INBOUND, AML_HOLDS, FUNDS_INSUFF, OFAC_HITS, DLQ_SWIFT

    description = Column(Text, nullable=True)

    queue_type = Column(String, nullable=False, index=True)
    # MASTER | CHILD | DLQ | RESPONSE | ESCALATION

    # Hierarchy — child queues reference their master queue
    parent_queue_id = Column(String, ForeignKey("message_queues.queue_id"), nullable=True, index=True)

    # Physical connection
    external_connection_id = Column(String, ForeignKey("external_queue_connections.connection_id"), nullable=True, index=True)

    # Physical queue name on the external MQ system (may differ from our logical name)
    # IBM MQ: actual queue name on queue manager; Kafka: topic name
    physical_queue_name = Column(String, nullable=True)

    # Message format — drives serialiser/deserialiser selection in the adapter
    message_format = Column(String, nullable=False, default="ISO_20022")
    # ISO_20022 | SWIFT_FIN | NACHA | CHIPS | JSON | XML | PROPRIETARY

    # Exception category — drives ROUTE_ON_RESPONSE routing logic
    exception_category = Column(String, nullable=True)
    # AML | OFAC | FUNDS | DUPLICATE | FORMAT | RATE | MANUAL | ESCALATION

    # Product scoping
    package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, ForeignKey("product_master.product_id"), nullable=True, index=True)
    subproduct_id = Column(String, ForeignKey("subproduct_master.subproduct_id"), nullable=True, index=True)

    # SLA configuration
    sla_minutes = Column(Integer, nullable=True)
    # Minutes before a message sitting in this queue triggers SLA breach action
    on_sla_breach_action = Column(String, nullable=False, default="ALERT")
    # ESCALATE | ALERT | BOTH
    escalation_queue_id = Column(String, ForeignKey("message_queues.queue_id"), nullable=True)

    # Entitlements — industry standard: role-based OR user-based (OR condition)
    # A user with any of these role_ids can access this queue
    allowed_role_ids = Column(JSONB, nullable=False, default=list)
    # Explicit user_id overrides — for temporary access without role elevation
    allowed_user_ids = Column(JSONB, nullable=False, default=list)
    # Queue administrators — can perform intra-queue transfers and approve queue actions
    administrator_role_ids = Column(JSONB, nullable=False, default=list)

    # Retry / dead letter config
    max_retry_count = Column(Integer, nullable=False, default=3)
    retry_interval_sec = Column(Integer, nullable=False, default=60)
    # After max_retry_count failures, message moves to DLQ

    status = Column(String, nullable=False, default="DRAFT", index=True)

    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, nullable=False, default="SYSTEM")
    updated_by = Column(String, nullable=True)


class QueueRoutingRule(Base):
    """
    WHY THIS EXISTS:
    Maps external system response codes to workflow state transitions and exception
    queue routing. When a pacs.002 message arrives on the RESPONSE queue, the
    ROUTE_ON_RESPONSE workflow step_type evaluates these rules in priority order to
    determine next action.

    Examples:
      pacs.002 TxSts=ACSC → workflow COMPLETE (Accepted Settlement Completed)
      pacs.002 TxSts=RJCT + StsRsnInf=AC01 → REPAIR queue (invalid account)
      pacs.002 TxSts=RJCT + StsRsnInf=AM04 → FUNDS queue (insufficient funds)
      pacs.002 TxSts=PDNG → workflow stays AWAITING_RESPONSE, SLA timer reset
      No response in sla_minutes → ESCALATION queue

    match_field: which field in the incoming message to evaluate
    match_pattern: value or pattern to match against
    match_type: EXACT | STARTSWITH | CONTAINS | REGEX

    WHAT BREAKS IF REMOVED: All queue responses default to COMPLETE regardless of
    content. AML hits, rejected payments, and insufficient funds are silently ignored.
    """
    __tablename__ = "queue_routing_rules"

    rule_id = Column(String, primary_key=True, index=True)
    queue_id = Column(String, ForeignKey("message_queues.queue_id"), nullable=False, index=True)
    # The RESPONSE queue this rule applies to

    rule_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Message field to evaluate (ISO 20022 path or proprietary key)
    match_field = Column(String, nullable=False)
    # e.g. "TxSts", "StsRsnInf.Rsn.Cd", "status_code"

    match_pattern = Column(String, nullable=False)
    # e.g. "ACSC", "RJCT:AC01", "PDNG", ".*SANCTION.*"

    match_type = Column(String, nullable=False, default="EXACT")
    # EXACT | STARTSWITH | CONTAINS | REGEX

    # What happens when this rule matches
    target_workflow_state = Column(String, nullable=False)
    # COMPLETE | REPAIR | COMPLIANCE_HOLD | FUNDS_HOLD | AWAITING_RESPONSE | FAILED | ESCALATION

    target_queue_id = Column(String, ForeignKey("message_queues.queue_id"), nullable=True)
    # If routing to an exception child queue, which one

    # Alert configuration on match
    alert_queue_administrators = Column(Boolean, nullable=False, default=False)
    alert_message = Column(String, nullable=True)

    # Priority — rules evaluated in ascending priority order; first match wins
    priority = Column(Integer, nullable=False, default=100)

    status = Column(String, nullable=False, default="ACTIVE", index=True)

    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, nullable=False, default="SYSTEM")
    updated_by = Column(String, nullable=True)


def init_db():
    Base.metadata.create_all(bind=engine)