import os
from sqlalchemy import create_engine, Column, String, Integer, Boolean, Text, ForeignKey, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./infinity_db.sqlite")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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
    Persistent ISO Business Field Registry
    Stores the global field dictionary with hierarchical domain/subdomain structure
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
    is_mandatory = Column(Boolean, default=False)
    is_pii = Column(Boolean, default=False, nullable=False, index=True)
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
    Represents a single node/step in a workflow canvas
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
    rules_applied = Column(JSONB, nullable=True)  # JSON array of rule IDs
    calculations = Column(JSONB, nullable=True)  # JSON array of calculation IDs
    api_triggers = Column(JSONB, nullable=True)  # JSON array of API endpoints
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
    Represents connections between workflow nodes
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
    Container for complete workflow definition (nodes + edges + metadata)
    """
    __tablename__ = "workflow_configurations"
    
    workflow_id = Column(String, primary_key=True, index=True)
    workflow_name = Column(String, nullable=False)
    domain_scope = Column(String, nullable=False, index=True)
    product_context = Column(String, nullable=False)  # e.g., ICICI Bank Payments Hub
    sub_product = Column(String, nullable=True)
    version = Column(String, default="1.0.0")
    is_active = Column(Boolean, default=True)
    description = Column(Text, nullable=True)
    
    # Embedded configuration as JSON
    formulas_defined = Column(JSONB, nullable=True)  # JSON array of formula objects
    rules_matrix = Column(JSONB, nullable=True)  # JSON array of BRE rule definitions
    
    # Metadata
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")
    updated_at = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    # Relationships to automatically load the entire workflow graph.
    nodes = relationship("WorkflowNode", back_populates="workflow", cascade="all, delete-orphan", lazy="joined")
    edges = relationship("WorkflowEdge", back_populates="workflow", cascade="all, delete-orphan", lazy="joined")


# --- LAYER 4: SYMBOLIC CALCULATION ENGINE ---
class SymbolicFormulaAsset(Base):
    """
    Standalone registry for mathematical formulas and logic-as-data rules
    """
    __tablename__ = "symbolic_formula_registry"
    
    asset_id = Column(String, primary_key=True, index=True)
    token_code = Column(String, unique=True, nullable=False, index=True) # e.g., CALC-REG-099
    target_output_field = Column(String, nullable=False) # e.g., interest_rate_margin
    mathematical_expression = Column(Text, nullable=False)
    created_at = Column(String, nullable=False)
    created_by = Column(String, default="SYSTEM")


# --- LAYER 5: COMMON CORE MASTERS ---
class CurrencyMaster(Base):
    __tablename__ = "master_currency"
    currency_code = Column(String, primary_key=True, index=True)
    currency_name = Column(String, nullable=False)
    fraction_digits = Column(Integer, default=2)
    source_currency_code = Column(String, nullable=False)
    target_currency_code = Column(String, nullable=False)
    exchange_rate = Column(Float, nullable=False)
    associated_calendar_id = Column(String, nullable=True)
    created_at = Column(String, nullable=False)

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

class AccountProfile(Base):
    __tablename__ = "master_account_profile"
    account_number = Column(String, primary_key=True, index=True)
    account_name_title = Column(String, nullable=False)
    currency_code = Column(String, nullable=False)
    clearing_system_member_id = Column(String, nullable=False)
    branch_location_name = Column(String, nullable=True)
    is_frozen_flag = Column(Boolean, default=False)
    created_at = Column(String, nullable=False)

class CountryJurisdiction(Base):
    __tablename__ = "master_country_jurisdiction"
    country_iso_code = Column(String, primary_key=True, index=True)
    country_name_text = Column(String, nullable=False)
    region_continent_name = Column(String, nullable=False)
    check_digit_type_code = Column(String, nullable=True)
    target_central_bank_routing_code = Column(String, nullable=True)
    iban_mandatory_flag = Column(Boolean, default=False)
    created_at = Column(String, nullable=False)

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

class ProductMaster(Base):
    __tablename__ = "product_master"
    product_id = Column(String, primary_key=True, index=True)
    product_name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)

class SubproductMaster(Base):
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
    created_at = Column(String, nullable=False)
    completed_at = Column(String, nullable=True)


# --- LAYER 5: DATA ARCHIVAL ---
class IngestionJobArchive(Base):
    """
    Stores archived records of completed or cancelled ingestion jobs for historical purposes.
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
    processing_started_at = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    completed_at = Column(String, nullable=True)
    archived_at = Column(String, nullable=False)

class ScreenTemplate(Base):
    """
    Stores the definition for a dynamic UI screen template, used by workflow nodes.
    """
    __tablename__ = "screen_templates"

    screen_id = Column(String, primary_key=True, index=True)
    screen_name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="DRAFT", index=True) -- DRAFT, IN_PROGRESS, PUBLISHED
    product_id = Column(String, nullable=True, index=True)
    subproduct_id = Column(String, nullable=True, index=True)
    workflow_id = Column(String, nullable=True, index=True)
    workflow_step_id = Column(String, nullable=True, index=True)
    definition = Column(JSONB, nullable=False) # The JSON definition of the screen layout and components
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=True)
    created_by = Column(String, default="SYSTEM")

class MaintenanceTaskLog(Base):
    """
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

def init_db():
    Base.metadata.create_all(bind=engine)