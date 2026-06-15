import os
from sqlalchemy import create_engine, Column, String, Integer, Boolean, Text, ForeignKey, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./infinity_db.sqlite")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# =====================================================================
# --- CORE ARCHITECTURAL BLUEPRINT & LEDGER MODELS ---
# =====================================================================

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
    created_at = Column(String, nullable=False, index=True)
    updated_at = Column(String, nullable=True)

    # Relationship to comments
    comments = relationship("GovernanceTaskComment", back_populates="task", cascade="all, delete-orphan", lazy="joined")

# --- TRACKING CORES MATCHING SCREENSHOTS 00001 - 00005 ---
class TemplateDesignerModel(Base):
    """
    Captures Master Template Config (Screenshot 00005)
    """
    __tablename__ = "template_designer_blueprints"

    template_id = Column(String, primary_key=True, index=True)
    template_name = Column(String, nullable=False)
    template_type = Column(String, nullable=False)  # UPLOAD vs DOWNLOAD
    product = Column(String, nullable=False)         # e.g., HELOC
    sub_product = Column(String, nullable=True)      # e.g., FIGRE
    file_type = Column(String, nullable=False)        # XLSX, PDF, CSV, JPEG, XLS, XML
    is_multi_sheet = Column(Boolean, default=False)
    file_has_header_footer = Column(String, default="NONE") # HEADER, FOOTER, BOTH, NONE
    text_file_type = Column(String, nullable=True)   # DELIMITER vs FIXED_LENGTH
    delimiter_record_separator = Column(String, default=",")

class TemplateFieldAddressModel(Base):
    """
    Captures Field Address Mapping & Validations (Screenshots 00001, 00002, 00004)
    """
    __tablename__ = "template_field_addresses"

    address_id = Column(String, primary_key=True, index=True)
    template_id = Column(String, ForeignKey("template_designer_blueprints.template_id"), nullable=False)
    source_file_field_name = Column(String, nullable=False)  # e.g., Principal
    target_iso_field_name = Column(String, nullable=False)   # Linked Bloodstream Variable
    reading_mode = Column(String, default="COLUMN")          # COLUMN, CELL, HYBRID
    
    # Structural File Addresses
    sheet_name = Column(String, nullable=True)
    sheet_sequence_no = Column(Integer, default=1)
    start_row = Column(Integer, default=0)
    stop_row = Column(Integer, default=0)
    column_sequence_no = Column(Integer, default=0)
    cell_address = Column(String, nullable=True)
    
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

# --- LAYER 3: ISO BUSINESS FIELD REGISTRY (SEMANTIC BLOODSTREAM) ---
class ISOFieldDefinition(Base):
    """
    Layer 3: The Semantic Bloodstream.
    This table is the master source of truth for all data fields in the system.
    """
    __tablename__ = "iso_field_registry"
    
    field_id = Column(String, primary_key=True, index=True)
    technical_sys_name = Column(String, unique=True, nullable=False, index=True)
    preferred_business_name = Column(String, nullable=False)
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
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")


# --- LAYER 6: GOVERNANCE HUB COMMENTS ---
class GovernanceTaskComment(Base):
    """
    Stores comments and notes associated with a governance task.
    """
    __tablename__ = "governance_task_comments"

    comment_id = Column(String, primary_key=True, index=True)
    task_id = Column(String, ForeignKey("evidence_packet_registry.packet_id", ondelete="CASCADE"), nullable=False, index=True)
    author = Column(String, nullable=False)
    comment = Column(Text, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)

    task = relationship("EvidencePacketRegistry", back_populates="comments")

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
    
    # SLA Configuration
    sla_days = Column(Integer, default=1)
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
    is_active = Column(Boolean, default=True)
    description = Column(Text, nullable=True)
    
    # Embedded configuration as JSON
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
class OperationalCalendar(Base):
    __tablename__ = "master_calendar"
    calendar_id = Column(String, primary_key=True, index=True)
    calendar_type = Column(String, nullable=False)
    calendar_year = Column(Integer, nullable=False)
    weekly_holiday_mask = Column(String, nullable=False)
    financial_year_start_date = Column(String, nullable=False)
    financial_year_end_date = Column(String, nullable=False)
    calendar_description = Column(String, nullable=True)
    is_active_flag = Column(Boolean, default=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

class AccountProfile(Base):
    __tablename__ = "master_account_profile"
    account_number = Column(String, primary_key=True, index=True)
    account_name_title = Column(String, nullable=False)
    currency_code = Column(String, nullable=False)
    clearing_system_member_id = Column(String, nullable=False)
    data_residency_region = Column(String, nullable=False, index=True) # ISO 3166-1 alpha-2 code
    branch_location_name = Column(String, nullable=True)
    is_frozen_flag = Column(Boolean, default=False)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    
    # --- OPTIMISTIC CONCURRENCY CONTROL (OCC) ---
    # Protects against lost updates when concurrent users edit the same profile.
    version_id = Column(Integer, nullable=False, default=1)

    __mapper_args__ = {
        "version_id_col": version_id
    }

class CountryJurisdiction(Base):
    __tablename__ = "master_country_jurisdiction"
    country_iso_code = Column(String, primary_key=True, index=True)
    country_name_text = Column(String, nullable=False)
    region_continent_name = Column(String, nullable=False)
    check_digit_type_code = Column(String, nullable=True)
    target_central_bank_routing_code = Column(String, nullable=True)
    iban_mandatory_flag = Column(Boolean, default=False)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

class FeeConfiguration(Base):
    __tablename__ = "master_fee_configuration"
    fee_charge_code = Column(String, primary_key=True, index=True)
    fee_type_name = Column(String, nullable=False)
    effective_start_date = Column(String, nullable=False)
    effective_end_date = Column(String, nullable=False)
    fee_amount_value = Column(Float, nullable=False)
    fee_category_name = Column(String, nullable=True)
    is_active_flag = Column(Boolean, default=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

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

class ProductMaster(Base):
    """Level 2: The Core Product (e.g., "FEDWIRE", "CHIPS", "SWIFT")"""
    __tablename__ = "product_master"
    product_id = Column(String, primary_key=True, index=True)
    package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=False, index=True)
    product_name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)

class SubproductMaster(Base):
    """Level 3: Product Variations (e.g., "FEDWIRE-B2B")"""
    __tablename__ = "subproduct_master"
    subproduct_id = Column(String, primary_key=True, index=True)
    subproduct_name = Column(String, nullable=False)
    product_id = Column(String, ForeignKey("product_master.product_id"), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)

    product = relationship("ProductMaster")


# --- LAYER 4: DYNAMIC PAYLOAD TRANSFORMATION MAPPERS ---
class PayloadMapperBlueprint(Base):
    """
    GUI-configured mapping canvas blueprint (e.g., SWIFT MT103 to ISO20022 Pacs.008)
    """
    __tablename__ = "payload_mapper_blueprints"
    mapper_id = Column(String, primary_key=True, index=True)
    mapper_name = Column(String, nullable=False)
    source_format = Column(String, nullable=False)  # SWIFT_MT, JSON, XML, FIX
    target_format = Column(String, default="ISO_20022_DICTIONARY")
    status = Column(String, nullable=False, default="DRAFT", index=True)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="API_USER")
    
    # Relationship to automatically load all field mappings associated with this blueprint.
    mappings = relationship("PayloadFieldMapping", back_populates="blueprint", cascade="all, delete-orphan", lazy="joined")

class PayloadFieldMapping(Base):
    """
    Individual GUI canvas links connecting source payload paths to the target ISO registry,
    along with conditional hooks to the Rules Engine and Calculation Engine.
    """
    __tablename__ = "payload_field_mappings"
    mapping_id = Column(String, primary_key=True, index=True)
    mapper_id = Column(String, ForeignKey("payload_mapper_blueprints.mapper_id", ondelete="CASCADE"), nullable=False)
    source_path = Column(String, nullable=False)        # e.g., 'Block4.Tag32A' or '$.transaction.amount'
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
    Layer 1: Visual Multi-Canvas Studio (Backend Model).
    Stores the definition for a dynamic UI screen template, used by workflow nodes.
    """
    __tablename__ = "screen_templates"

    screen_id = Column(String, primary_key=True, index=True)
    screen_name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="DRAFT", index=True) # DRAFT, PENDING_APPROVAL, ACTIVE, DELETED
    
    # GAP 4: The specific category of the screen UI
    screen_template_category = Column(String, nullable=False, default="Business workflow Configurations", index=True) 
    
    # GAP 3 & 4: Hierarchical Scoping (If application_package_id is NULL, the screen is Global)
    application_package_id = Column(String, ForeignKey("master_product_application_packages.package_id"), nullable=True, index=True)
    product_id = Column(String, nullable=True, index=True)
    subproduct_id = Column(String, nullable=True, index=True)
    workflow_id = Column(String, nullable=True)
    workflow_step_id = Column(String, nullable=True, index=True) # Aligned with payload
    definition = Column(JSONB, nullable=False) # The JSON definition of the screen layout and components
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, default="SYSTEM")

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
    status = Column(String, nullable=False, default="DRAFT", index=True)
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
    timestamp = Column(String, nullable=False, index=True)

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


def init_db():
    Base.metadata.create_all(bind=engine)