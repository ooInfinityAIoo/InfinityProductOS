from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    AUDITOR = "auditor"
    VIEWER = "viewer"
    SALES = "sales"
    RISK = "risk"
    C_LEVEL = "c_level"

class CurrentUser(BaseModel):
    id: str
    role: UserRole

# =====================================================================
# --- FOUNDATIONAL WORKFLOW BLUEPRINT SCHEMAS ---
# =====================================================================

class IngestedFieldBase(BaseModel):
    name: str
    type: str
    gui: str
    enum_vals: Optional[str] = None
    status: str = "PENDING"

class WorkflowStepBase(BaseModel):
    sequence: int
    name: str
    is_last: bool
    conditions: List[str]
    rules: List[str]
    roles: List[str]
    fields: List[IngestedFieldBase]

class WorkflowTemplateCreate(BaseModel):
    template_name: str
    product: str
    sub_product: str
    steps: List[WorkflowStepBase]


# =====================================================================
# --- DYNAMIC COMMON CORE MASTERS SCHEMAS ---
# =====================================================================

class DynamicMasterRecordCreate(BaseModel):
    record_data: Dict[str, Any] = Field(..., description="The JSON payload matching the Screen Designer form.")
    status: str = Field("DRAFT", description="Record lifecycle status.")

class DynamicMasterRecordResponse(DynamicMasterRecordCreate):
    record_id: str
    screen_id: str
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    class Config:
        from_attributes = True

class DynamicMasterRecordListResponse(BaseModel):
    records: List[DynamicMasterRecordResponse]
    total_count: int

class TenantThemeCreate(BaseModel):
    brand_name: str = Field(..., description="The name of the deploying bank or institution.")
    logo_url: Optional[str] = Field(None, description="URL or Base64 string of the bank's logo.")

class TenantThemeResponse(TenantThemeCreate):
    tenant_id: str
    class Config:
        from_attributes = True

class ConfigurationModuleTask(BaseModel):
    module_name: str = Field(..., description="The name of the Canva studio to configure.")
    owner: str = Field(..., description="The assigned team or user.")
    sla_days: int = Field(..., description="Target days to complete configuration.")
    is_configured: bool = Field(False, description="Whether the module has been fully configured.")

class ProductApplicationPackageCreate(BaseModel):
    package_name: str = Field(..., description="e.g., US Payment Hub")
    business_domain: str = Field(..., description="e.g., Payments, Treasury")
    jurisdiction_country_code: str = Field(..., description="e.g., US, IN")
    base_currency_code: str = Field(..., description="e.g., USD, INR")
    description: Optional[str] = None
    configuration_plan: List[ConfigurationModuleTask] = Field(default_factory=list)

class ProductApplicationPackageResponse(ProductApplicationPackageCreate):
    package_id: str
    status: str
    implementation_status: str
    created_at: str
    updated_at: Optional[str] = None
    class Config:
        from_attributes = True

class ProductApplicationPackageListResponse(BaseModel):
    packages: List[ProductApplicationPackageResponse]

class ProductMasterCreate(BaseModel):
    package_id: str
    product_name: str
    description: Optional[str] = None

class ProductMasterResponse(BaseModel):
    product_id: str
    package_id: str
    product_name: str
    description: Optional[str]
    created_at: str
    updated_at: Optional[str] = None
    class Config:
        from_attributes = True

class ProductMasterListResponse(BaseModel):
    products: List[ProductMasterResponse]

class SubproductMasterCreate(BaseModel):
    product_id: str
    subproduct_name: str
    description: Optional[str] = None

class SubproductMasterResponse(BaseModel):
    subproduct_id: str
    product_id: str
    subproduct_name: str
    description: Optional[str]
    created_at: str
    updated_at: Optional[str] = None
    class Config:
        from_attributes = True

class SubproductMasterListResponse(BaseModel):
    subproducts: List[SubproductMasterResponse]

class DocumentMasterCreate(BaseModel):
    document_name: str = Field(..., description="e.g., 'Signed Tax Return'")
    document_format: str = Field("ANY", description="Expected format: PDF, CSV, EXCEL, ANY")
    description: Optional[str] = None
    extraction_template_id: Optional[str] = Field(None, description="The ID of the File Layout Template used to read this document.")

class DocumentMasterResponse(DocumentMasterCreate):
    document_id: str
    created_at: str
    created_by: str
    class Config:
        from_attributes = True

# =====================================================================
# --- DATA INGESTION SCHEMAS ---
# =====================================================================

class IngestionJobResponse(BaseModel):
    job_id: str
    filename: str
    status: str
    mapper_id: str
    workflow_id: str
    total_records: Optional[int]
    processed_records: int
    error_message: Optional[str]
    created_by: Optional[str] = None
    created_at: str
    completed_at: Optional[str]

    class Config:
        from_attributes = True

class IngestionJobListResponse(BaseModel):
    jobs: List[IngestionJobResponse]

class IngestionStatsResponse(BaseModel):
    pending: int
    processing: int
    completed: int
    failed: int
    cancelled: int
    total: int

class IngestionJobArchiveFilterParams(BaseModel):
    job_id: Optional[str] = Field(None, description="Filter by job ID (case-insensitive search).")
    filename: Optional[str] = Field(None, description="Filter by the original filename (case-insensitive search).")
    status: Optional[str] = Field(None, description="Filter by the exact final job status (e.g., COMPLETED, FAILED).")
    mapper_id: Optional[str] = Field(None, description="Filter by the exact mapper ID used.")
    workflow_id: Optional[str] = Field(None, description="Filter by the exact workflow ID used.")
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=1000)

class IngestionJobArchiveResponse(BaseModel):
    job_id: str
    filename: str
    status: str
    mapper_id: str
    workflow_id: str
    total_records: Optional[int] = None
    processed_records: int
    error_message: Optional[str] = None
    created_by: Optional[str] = None
    processing_started_at: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    archived_at: str

    class Config:
        from_attributes = True

class IngestionJobArchiveListResponse(BaseModel):
    jobs: List[IngestionJobArchiveResponse]

# =====================================================================
# --- DATA ARCHIVAL SCHEMAS ---
# =====================================================================

class ArchivalStatsResponse(BaseModel):
    completed: int
    failed: int
    cancelled: int
    total: int

# =====================================================================
# --- PHASE 4: DYNAMIC PAYLOAD TRANSFORMATION SCHEMAS ---
# =====================================================================

class TemplateFieldAddressModelCreate(BaseModel):
    extracted_field_name: str = Field(..., description="The key to output in the JSON (e.g. 'amount')")
    reading_mode: str = Field("COLUMN", description="COLUMN, CELL, or PROMPT")
    sheet_name: Optional[str] = None
    sheet_sequence_no: int = 1
    start_row: int = 0
    stop_row: int = 0
    column_sequence_no: int = 0
    cell_address_or_prompt: Optional[str] = None
    fixed_length_start: int = 0
    fixed_length_end: int = 0
    padding_character: str = "0"
    padding_position: str = "PREFIX"
    data_type_spec: str = "Text"
    mandatory_status: str = "Optional"
    max_length: int = 9
    min_length: int = 9
    populate_default_value: bool = False
    default_value_fallback: Optional[str] = None
    is_amount_decimal: bool = False
    decimal_places_precision: int = 2
    currency_code: Optional[str] = None

class TemplateFieldAddressModelResponse(TemplateFieldAddressModelCreate):
    address_id: str
    template_id: str
    class Config:
        from_attributes = True

class PayloadFieldMappingCreate(BaseModel):
    source_extracted_field: str = Field(..., description="The key extracted from the File Template (e.g., 'net_income')")
    target_iso_field: str = Field(..., description="Target ISO Field Registry mapping (e.g., 'of_fintax_bal_01')")
    transformation_rule_code: Optional[str] = Field(None, description="Linked BRE rule to execute during mapping")
    calculation_token_code: Optional[str] = Field(None, description="Linked calculation token (e.g., 'CALC-REG-099')")
    is_mandatory: bool = False
    default_value: Optional[str] = None

class PayloadFieldMappingResponse(PayloadFieldMappingCreate):
    mapping_id: str
    mapper_id: str
    class Config:
        from_attributes = True

class PayloadMapperBlueprintCreate(BaseModel):
    mapper_name: str = Field(..., description="Name of the Canvas Mapping (e.g., 'SWIFT MT103 to ISO Pacs.008')")
    source_template_id: Optional[str] = Field(None, description="Links to the physical Layout Template")
    target_format: str = Field("ISO_20022_DICTIONARY", description="Target standard format")
    mapping_direction: str = Field("INBOUND", description="INBOUND (Ingest to ISO) or OUTBOUND (Extract from ISO to File)")
    file_control_totals: Optional[Any] = Field(None, description="File-level validation checks (array or object).")
    mappings: List[PayloadFieldMappingCreate] = Field(default_factory=list)
    application_package_id: Optional[str] = Field(None, description="The specific product package this mapper belongs to. Null for Global.")
    product_id: Optional[str] = Field(None, description="The specific product this mapper belongs to. Null for Global.")
    subproduct_id: Optional[str] = Field(None, description="The specific subproduct this mapper belongs to. Null for Global.")

class PayloadMapperBlueprintResponse(BaseModel):
    mapper_id: str
    mapper_name: str
    source_template_id: Optional[str] = None
    mapping_direction: str
    target_format: str
    file_control_totals: Optional[Any] = None
    status: str
    created_at: str
    created_by: str
    mappings: List[PayloadFieldMappingResponse] = []
    
    class Config:
        from_attributes = True

class PayloadMapperBlueprintListResponse(BaseModel):
    mappers: List[PayloadMapperBlueprintResponse]

class TemplateDesignerModelCreate(BaseModel):
    template_name: str = Field(..., description="Name of the template")
    template_type: str = Field(..., description="UPLOAD or DOWNLOAD")
    file_type: str = Field(..., description="XLSX, PDF, CSV, JPEG, XLS, XML")
    extraction_mode: str = Field("STRUCTURED", description="STRUCTURED or AGENTIC_PROMPT")
    is_multi_sheet: bool = False
    file_has_header_footer: str = "NONE"
    text_file_type: Optional[str] = None
    delimiter_record_separator: Optional[str] = None
    fields: List[TemplateFieldAddressModelCreate] = Field(default_factory=list)

class TemplateDesignerModelResponse(TemplateDesignerModelCreate):
    template_id: str
    status: str
    created_at: str
    created_by: str
    fields: List[TemplateFieldAddressModelResponse] = []
    class Config:
        from_attributes = True

class TemplateDesignerModelListResponse(BaseModel):
    templates: List[TemplateDesignerModelResponse]

# =====================================================================
# --- PHASE 1: FIELD REGISTRY & WORKFLOW PERSISTENCE SCHEMAS ---
# =====================================================================

# --- GENERIC FIELD REGISTRY SCHEMAS ---
class FieldRegistryBase(BaseModel):
    technical_key: str = Field(..., description="Internal system field identifier, must be unique.")
    display_name: str = Field(..., description="User-facing field label.")
    data_type: str = Field(..., description="Data type for the field (e.g., TEXT, NUMBER, DATE).")
    validation_rules: Optional[Dict[str, Any]] = Field(None, description="JSON object defining validation rules.")
    core_layer: str = Field(..., description="Core system layer this field belongs to.")

class FieldRegistryCreate(FieldRegistryBase):
    pass

class FieldRegistryResponse(FieldRegistryBase):
    id: str = Field(..., description="Unique identifier for the field registry entry.")

    class Config:
        from_attributes = True

class FieldRegistryListResponse(BaseModel):
    fields: List[FieldRegistryResponse]

class FieldRegistryFilterParams(BaseModel):
    domain_category: Optional[str] = None
    subdomain_category: Optional[str] = None
    data_type: Optional[str] = None
    skip: int = Field(0, ge=0)
    limit: int = Field(100, ge=1, le=1000)


# --- ISO FIELD REGISTRY SCHEMAS ---
class ISOFieldDefinitionCreate(BaseModel):
    technical_sys_name: str = Field(..., description="Internal system field identifier")
    client_business_name: str = Field(..., description="User-facing field label")
    display_preference: str = Field("ISO", description="Preference for UI rendering: ISO or CLIENT")
    iso_business_name: str = Field(..., description="ISO 20022 standard field mapping")
    localized_names: Optional[Dict[str, str]] = Field(None, description="A JSON object for multilingual field names, keyed by locale (e.g., {'es': 'Monto Principal'}).")
    data_type: str = Field(..., description="Decimal, Alphanumeric, Amount, Date, Text")
    domain_category: str = Field(..., description="Business domain (HELOC, PAYMENTS, TREASURY)")
    subdomain_category: Optional[str] = Field(None, description="Sub-domain (FIGRE, RTGS, CLEARING)")
    description: Optional[str] = Field(None, description="Field documentation")
    is_mandatory: bool = Field(False, description="Required field indicator")
    default_value: Optional[str] = Field(None, description="Default value if not provided")
    is_pii: bool = Field(False, description="Indicates if the field contains Personally Identifiable Information (PII).")
    masking_strategy: Optional[str] = Field(None, description="Explicit masking strategy to use (e.g., EMAIL, SHOW_LAST_4). Overrides data_type default.")
    localized_overrides: Optional[Dict[str, Dict[str, Any]]] = Field(None, description="JSON object for country-specific overrides (e.g., {'US_en': {'name': 'SSN'}}).")


class ISOFieldDefinitionResponse(ISOFieldDefinitionCreate):
    field_id: str
    status: str
    created_at: str
    created_by: str

    class Config:
        from_attributes = True

class ISOFieldDefinitionListResponse(BaseModel):
    fields: List[ISOFieldDefinitionResponse]
    total_count: int

class ISOFieldPreferencesUpdate(BaseModel):
    """Partial update: only client_business_name and display_preference are mutable by a bank tenant.
    iso_business_name and technical_sys_name are immutable golden-source values."""
    client_business_name: Optional[str] = Field(None, description="Bank's own name for the field")
    display_preference: Optional[str] = Field(None, description="ISO or CLIENT — controls what label is shown in all studio UIs")

class PIIFieldListResponse(BaseModel):
    pii_fields: List[ISOFieldDefinitionResponse]
    total_count: int

class PIIMaskingStrategyStatItem(BaseModel):
    masking_strategy: Optional[str]
    count: int

class PIIMaskingStrategyStatsResponse(BaseModel):
    stats: List[PIIMaskingStrategyStatItem]

class MaskingStrategyDefinition(BaseModel):
    strategy_name: str
    description: str

class MaskingStrategyListResponse(BaseModel):
    strategies: List[MaskingStrategyDefinition]

class DomainCategoryListResponse(BaseModel):
    domain_categories: List[str]

class SubdomainCategoryListResponse(BaseModel):
    subdomain_categories: List[str]


class DocumentChecklistItem(BaseModel):
    document_name: str = Field(..., description="The name of the document from Document Master.")
    checklist_category: str = Field("UPLOAD", description="UPLOAD, DOWNLOAD, or COVENANT")
    is_mandatory: bool = Field(True, description="Whether this document is strictly required to proceed.")
    linked_covenant_rule: Optional[str] = Field(None, description="Linked BRE rule for COVENANT type.")
    override_mapper_id: Optional[str] = Field(None, description="Optional override for the document's default extraction blueprint.")

class WorkflowNodeCreate(BaseModel):
    sequence_number: int = Field(..., description="Step sequence in workflow")
    node_title: str = Field(..., description="User-facing node label")
    node_code: str = Field(..., description="Internal node identifier")
    canvas_x_position: int = Field(default=0, description="Canvas X coordinate")
    canvas_y_position: int = Field(default=0, description="Canvas Y coordinate")
    orchestration_steps: Optional[Any] = Field(None, description="An ordered list of mixed-engine orchestration steps to execute.")
    events_broadcast: Optional[List[str]] = Field(None, description="Events to broadcast")
    required_documents: Optional[List[Union[str, DocumentChecklistItem]]] = Field(None, description="Categorized list of required document types needed to proceed.")
    sla_days: int = Field(default=1, description="SLA target in days")
    sla_anchor_field: Optional[str] = Field(None, description="Field to anchor SLA calculation")
    screen_template: Optional[str] = Field(None, description="Screen template for UI rendering")

    class Config:
        from_attributes = True

class WorkflowNodeResponse(WorkflowNodeCreate):
    node_id: str
    workflow_id: str
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

class WorkflowNodeListResponse(BaseModel):
    nodes: List[WorkflowNodeResponse]

# --- WORKFLOW EDGE SCHEMAS ---
class WorkflowEdgeCreate(BaseModel):
    source_node_id: str = Field(..., description="Source node ID")
    target_node_id: str = Field(..., description="Target node ID")
    edge_condition: Optional[Any] = Field(None, description="Structured JSON object or string defining the branching condition.")


class WorkflowEdgeResponse(WorkflowEdgeCreate):
    edge_id: str
    workflow_id: str
    created_at: str

    class Config:
        from_attributes = True


# --- WORKFLOW CONFIGURATION SCHEMAS ---
class WorkflowConfigurationCreate(BaseModel):
    workflow_name: str = Field(..., description="Workflow display name")
    domain_scope: str = Field(..., description="Business domain")
    product_context: str = Field(..., description="Product context (e.g., ICICI Bank Payments Hub)")
    sub_product: Optional[str] = Field(None, description="Sub-product specification")
    description: Optional[str] = Field(None, description="Workflow documentation")
    input_schema: Optional[List[str]] = Field(None, description="ISO fields required as input context.")
    output_schema: Optional[List[str]] = Field(None, description="ISO fields guaranteed as output context.")
    formulas_defined: Optional[List[dict]] = Field(None, description="Mathematical formulas")
    nodes: Optional[List[WorkflowNodeCreate]] = Field(None, description="Workflow nodes")
    edges: Optional[List[WorkflowEdgeCreate]] = Field(None, description="Workflow connections")
    application_package_id: Optional[str] = Field(None, description="The specific product package this workflow belongs to.")
    product_id: Optional[str] = Field(None, description="The specific product this workflow belongs to.")
    subproduct_id: Optional[str] = Field(None, description="The specific subproduct this workflow belongs to.")


class WorkflowConfigurationResponse(BaseModel):
    workflow_id: str
    workflow_name: str
    domain_scope: str
    product_context: str
    sub_product: Optional[str] = None
    version: str
    is_active: bool
    description: Optional[str] = None
    input_schema: Optional[Any] = None
    output_schema: Optional[Any] = None
    formulas_defined: Optional[Any] = None
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    nodes: Optional[List[WorkflowNodeResponse]] = None
    edges: Optional[List[WorkflowEdgeResponse]] = None

    class Config:
        from_attributes = True

class WorkflowDomainStatItem(BaseModel):
    domain_scope: str
    count: int

class WorkflowDomainStatsResponse(BaseModel):
    stats: List[WorkflowDomainStatItem]

class WorkflowVersionCreate(BaseModel):
    version_notes: Optional[str] = Field(None, description="Notes describing the changes in this new version.")

class WorkflowVersionResponse(BaseModel):
    version_id: str
    workflow_id: str
    version: str
    created_at: str
    created_by: str

    class Config:
        from_attributes = True

class RevertToVersionRequest(BaseModel):
    version_id: str = Field(..., description="The ID of the historical version to revert to.")

class WorkflowResumeRequest(BaseModel):
    additional_context: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional context to merge into the paused state.")

# =====================================================================
# --- BUSINESS RULE ENGINE (BRE) SCHEMAS ---
# =====================================================================

class ComparisonOperator(str, Enum):
    LESS_THAN = "LESS_THAN"
    GREATER_THAN = "GREATER_THAN"
    LESS_THAN_OR_EQUAL_TO = "LESS_THAN_OR_EQUAL_TO"
    GREATER_THAN_OR_EQUAL_TO = "GREATER_THAN_OR_EQUAL_TO"
    EQUAL_TO = "EQUAL_TO"
    NOT_EQUAL_TO = "NOT_EQUAL_TO"
    IN = "IN"
    NOT_IN = "NOT_IN"

class ArithmeticOperation(str, Enum):
    ADD = "ADD"
    SUBTRACT = "SUBTRACT"
    MULTIPLY = "MULTIPLY"
    DIVIDE = "DIVIDE"

class RuleConditionOperand(BaseModel):
    source_fields: Optional[List[str]] = Field(None, description="List of source ISO Field Names for this side of the condition.")
    arithmetic_operation: Optional[ArithmeticOperation] = Field(None, description="An optional arithmetic operation to perform on the source fields.")
    static_value: Optional[Any] = Field(None, description="A static value to use for the comparison (e.g., 10000, 'PENDING').")

class RuleCondition(BaseModel):
    left_hand_side: RuleConditionOperand = Field(..., description="The first operand of the comparison.")
    operator: ComparisonOperator = Field(..., description="The comparison operator.")
    right_hand_side: RuleConditionOperand = Field(..., description="The second operand of the comparison.")

class RuleActionType(str, Enum):
    SET_VALUE = "SET_VALUE"
    EXECUTE_CALCULATION = "EXECUTE_CALCULATION"

class RuleAction(BaseModel):
    action_type: RuleActionType = Field(..., description="The type of action to perform if the condition is true.")
    target_field: Optional[str] = Field(None, description="The destination field for a SET_VALUE action.")
    value: Optional[Any] = Field(None, description="The static value to set for a SET_VALUE action.")
    calculation_token: Optional[str] = Field(None, description="The token of the calculation to execute for an EXECUTE_CALCULATION action.")

class BusinessRule(BaseModel):
    priority: int = Field(100, description="Execution priority (lower numbers run first).")
    conditions: List[RuleCondition] = Field(..., description="A list of conditions that must all be true (AND logic).")
    actions: List[RuleAction] = Field(..., description="A list of actions to perform if all conditions are met.")

class BusinessRuleSet(BaseModel):
    business_name: str = Field(..., description="A user-friendly name for this composite rule set.")
    token_code: str = Field(..., description="A unique token code for this rule set (e.g., 'BRE-CREDIT-POLICY-V1').")
    description: Optional[str] = Field(None, description="A detailed description of the rule set's purpose.")
    status: str = Field("DRAFT", description="Lifecycle status of the rule set.")
    triggering_event_type: Optional[str] = Field(None, description="If set, this rule set will be automatically executed when the specified event occurs.")
    rules: Optional[Any] = Field(None, description="The ordered list of business rules (flexible format).")
    application_package_id: Optional[str] = Field(None, description="The specific product package this rule set belongs to. Null for Global.")
    product_id: Optional[str] = Field(None, description="The specific product this rule set belongs to. Null for Global.")
    subproduct_id: Optional[str] = Field(None, description="The specific subproduct this rule set belongs to. Null for Global.")

# =====================================================================
# --- ORCHESTRATION ENGINE SCHEMAS ---
# =====================================================================

class OrchestrationStepType(str, Enum):
    BUSINESS_RULE = "BUSINESS_RULE"
    CALCULATION = "CALCULATION"
    API_CALL = "API_CALL"
    EVENT_BROADCAST = "EVENT_BROADCAST"
    RECONCILIATION = "RECONCILIATION"
    SUB_WORKFLOW = "SUB_WORKFLOW"
    GENERATE_DOCUMENT = "GENERATE_DOCUMENT"

class OrchestrationStep(BaseModel):
    sequence_number: int = Field(..., description="The execution order for this step within the node (lower numbers run first).")
    step_type: OrchestrationStepType = Field(..., description="The type of engine to invoke for this step.")
    target_token: Optional[str] = Field(None, description="The ID of the asset or sub-workflow to execute.")
    target_event_type: Optional[str] = Field(None, description="The event type to broadcast (for EVENT_BROADCAST).")
    invocation_rule_token: Optional[str] = Field(None, description="If provided, this step will only be executed if the referenced Business Rule Set evaluates to true.")

class PromptToRuleRequest(BaseModel):
    prompt: str = Field(..., description="A natural language prompt describing a conditional rule and action.")

class PromptToRuleResponse(BaseModel):
    message: str
    generated_rule_token: Optional[str] = None
    suggested_workflow_node: Optional[WorkflowNodeCreate] = None
    suggested_edge_condition: Optional[Dict[str, Any]] = None
    notes: List[str] = Field(default_factory=list, description="Notes and suggestions for the user.")

# =====================================================================
# --- INSIGHTS FACTORY SCHEMAS ---
# =====================================================================

class InsightDefinitionCreate(BaseModel):
    insight_name: str = Field(..., description="A user-friendly name for the insight (e.g., 'Duplicate Subscription Detector').")
    insight_code: str = Field(..., description="A unique token code for this insight (e.g., 'INSIGHT-001').")
    description: Optional[str] = Field(None, description="A detailed description of what this insight detects and why it's valuable.")
    trigger_type: str = Field(..., description="The type of trigger for this insight ('EVENT' or 'SCHEDULED').")
    trigger_config: Dict[str, Any] = Field(..., description="Configuration for the trigger (e.g., {'event_type': 'NEW_TRANSACTION'}).")
    dashboard_category: str = Field("GLOBAL", description="The dashboard this widget appears on: GLOBAL, 360_BUSINESS, TECHNICAL.")
    applicable_roles: Optional[List[str]] = Field(["ADMIN"], description="The user roles authorized to view this insight widget.")
    application_package_id: Optional[str] = Field(None, description="The specific product package this insight belongs to. Null for Global.")
    analysis_steps: List[OrchestrationStep] = Field(..., description="The sequence of orchestration steps to perform for the analysis.")

class InsightDefinitionResponse(InsightDefinitionCreate):
    insight_id: str
    created_at: str
    created_by: str

    class Config:
        from_attributes = True

# =====================================================================
# --- REPORT DESIGNER & BI SCHEMAS ---
# =====================================================================

class ChartType(str, Enum):
    BAR_CHART = "BAR_CHART"
    LINE_CHART = "LINE_CHART"
    PIE_CHART = "PIE_CHART"
    DATA_GRID = "DATA_GRID"
    KPI_CARD = "KPI_CARD"
    EMBEDDED_BI = "EMBEDDED_BI" # Power BI / Cognos / Tableau

class ReportWidgetConfig(BaseModel):
    widget_id: str = Field(..., description="Unique ID for the widget.")
    chart_type: ChartType = Field(..., description="The visual representation type.")
    title: str = Field(..., description="Display title of the widget.")
    data_source_entity: str = Field(..., description="The backend table or event stream to query (e.g., 'EvidencePacketRegistry', 'UserInteractionEvent').")
    x_axis_field: Optional[str] = Field(None, description="The ISO Field technical name for the X-axis grouping.")
    y_axis_field: Optional[str] = Field(None, description="The ISO Field technical name for the Y-axis measurement.")
    aggregation_method: Optional[str] = Field("COUNT", description="Standard SQL agg (SUM, AVG, COUNT) or a CalculationEngine Token Code.")
    grid_layout: Dict[str, int] = Field(..., description="React-Grid-Layout coordinates: {'x': 0, 'y': 0, 'w': 6, 'h': 4}")

class ReportBlueprintCreate(BaseModel):
    report_name: str = Field(..., description="A user-friendly name for the dashboard.")
    description: Optional[str] = Field(None, description="What this report visualizes.")
    is_third_party_embedded: bool = Field(False, description="True if this report is just an iframe wrapper for external BI.")
    third_party_embed_url: Optional[str] = Field(None, description="The secure embed URL for Power BI/Cognos.")
    expose_as_headless_api: bool = Field(False, description="True if the widget data bindings should be exposed as an OData API for external ingestion.")
    widgets: List[ReportWidgetConfig] = Field(default_factory=list, description="The native charts and data grids.")
    application_package_id: Optional[str] = Field(None, description="Package scoping for isolation.")

class ReportBlueprintResponse(ReportBlueprintCreate):
    report_id: str
    status: str
    created_at: str
    created_by: str
    
    class Config:
        from_attributes = True

class ReportBlueprintListResponse(BaseModel):
    reports: List[ReportBlueprintResponse]
    total_count: int

# =====================================================================
# --- RECONCILIATION ENGINE SCHEMAS ---
# =====================================================================

class MatchType(str, Enum):
    EXACT = "EXACT"
    FUZZY = "FUZZY"
    TOLERANCE = "TOLERANCE"
    AMOUNT_TOLERANCE = "AMOUNT_TOLERANCE"

class ReconciliationCategory(str, Enum):
    NOSTRO_VOSTRO = "NOSTRO_VOSTRO"
    MIGRATION = "MIGRATION"
    FILE_TO_FILE = "FILE_TO_FILE"
    CONTROL_TOTALS = "CONTROL_TOTALS"
    DATA_COMPARE = "DATA_COMPARE"
    SYSTEM_TO_SYSTEM = "SYSTEM_TO_SYSTEM"

class MatchingRule(BaseModel):
    source_field: str = Field(..., description="Field from the source dataset.")
    target_field: str = Field(..., description="Field from the target dataset.")
    match_type: MatchType = Field(..., description="Type of matching to perform.")
    tolerance_value: Optional[float] = Field(None, description="Allowed variance if using TOLERANCE match type.")
    fuzzy_score_cutoff: Optional[int] = Field(None, description="Score 0-100 if using FUZZY match type.")
    pre_calculation_token: Optional[str] = Field(None, description="Calculation token to apply to source before comparing.")
    business_rule_token: Optional[str] = Field(None, description="Rule token to evaluate before considering a match valid.")

class ReconciliationTemplateCreate(BaseModel):
    reconciliation_name: str = Field(..., description="Name of the template (e.g., 'CHIPS Daily Settlement').")
    reconciliation_category: ReconciliationCategory = Field(..., description="Category of the reconciliation.")
    source_dataset_name: str = Field(..., description="Logical name of the left-side data.")
    target_dataset_name: str = Field(..., description="Logical name of the right-side data.")
    matching_rules: List[MatchingRule] = Field(..., description="The criteria for matching records.")
    description: Optional[str] = None
    status: str = Field("DRAFT", description="Lifecycle status.")
    application_package_id: Optional[str] = Field(None, description="The Application Package ID if scoped to a package.")
    product_id: Optional[str] = Field(None, description="The product this reconciliation is associated with.")
    subproduct_id: Optional[str] = Field(None, description="The subproduct this reconciliation is associated with.")

class ReconciliationTemplateResponse(ReconciliationTemplateCreate):
    reconciliation_template_id: str
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    class Config:
        from_attributes = True

class ReconciliationTemplateListResponse(BaseModel):
    templates: List[ReconciliationTemplateResponse]
    total_count: int

class ReconciliationResult(BaseModel):
    reconciliation_execution_id: str = Field(..., description="Unique execution ID generated during workflow run.")
    reconciliation_template_id: str = Field(..., description="The template blueprint invoked.")
    matched_records: List[Dict[str, Any]]
    unmatched_source_records: List[Dict[str, Any]]
    unmatched_target_records: List[Dict[str, Any]]
    variance_breaches: List[Dict[str, Any]]

class ReconciliationExecutionJobResponse(BaseModel):
    job_id: str
    template_id: str
    status: str
    total_records: Optional[int] = None
    processed_records: int
    error_message: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    class Config:
        from_attributes = True

class ReconciliationTrackingJob(BaseModel):
    job_id: str
    reconciliation_name: str
    category: str
    product_id: Optional[str] = None
    subproduct_id: Optional[str] = None
    status: str
    total_records: Optional[int] = None
    processed_records: int
    error_message: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    sla_status: str

class ReconciliationTrackingStats(BaseModel):
    total: int
    failed: int
    completed: int
    processing: int

class ReconciliationTrackingResponse(BaseModel):
    tracking_jobs: List[ReconciliationTrackingJob]
    stats: ReconciliationTrackingStats

# =====================================================================
# --- EVENT REPOSITORY SCHEMAS ---
# =====================================================================

class EventDefinitionCreate(BaseModel):
    event_type: str = Field(..., description="The unique name of the event (e.g., 'GOVERNANCE_TASK_CREATED').")
    source_module: str = Field(..., description="The name of the service or module that emits this event.")
    description: Optional[str] = Field(None, description="A clear description of what this event signifies.")

class EventDefinitionResponse(EventDefinitionCreate):
    created_at: str

    class Config:
        from_attributes = True

# =====================================================================
# --- AI ASSISTANT SCHEMAS ---
# =====================================================================

class AICommandRequest(BaseModel):
    prompt: str = Field(..., description="The natural language command for the AI Assistant to execute.")

class AICommandResponse(BaseModel):
    status: str = Field(..., description="The status of the command execution (e.g., SUCCESS, FAILED, REQUIRES_CLARIFICATION).")
    message: str = Field(..., description="A human-readable message summarizing the result.")
    executed_action: Optional[str] = Field(None, description="The specific action the AI took (e.g., CREATE_CURRENCY).")
    details: Optional[Dict[str, Any]] = Field(None, description="A dictionary containing details of the result, like the ID of a created object.")


class SymbolicFormulaCreate(BaseModel):
    financial_domain: Optional[str] = Field(None, description="The financial domain this formula belongs to (e.g., 'Credit Risk', 'Treasury').")
    business_name: str = Field(..., description="A user-friendly name for the formula (e.g., 'Linear Scorecard Point Allocation').")
    token_code: str = Field(..., description="Calculation Token Identifier Code (e.g., CALC-REG-099)")
    target_output_field: str = Field(..., description="Target Binding Dictionary Output Field")
    mathematical_expression: str = Field(..., description="Symbolic Formula Mathematical String Expression")
    parameters: Optional[Any] = Field(None, description="A JSON object or list of parameter definitions used in the formula.")
    description: Optional[str] = Field(None, description="A detailed description of the formula's business purpose and context.")
    application_package_id: Optional[str] = Field(None, description="The specific product package this formula belongs to. Null for Global.")
    product_id: Optional[str] = Field(None, description="The specific product this formula belongs to. Null for Global.")
    subproduct_id: Optional[str] = Field(None, description="The specific subproduct this formula belongs to. Null for Global.")

class SymbolicFormulaResponse(SymbolicFormulaCreate):
    asset_id: str
    status: str
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True

class SymbolicFormulaListResponse(BaseModel):
    formulas: List[SymbolicFormulaResponse]
    total_count: int

class FormulaBulkUploadResponse(BaseModel):
    successful_uploads: int
    failed_entries: List[Dict[str, Any]]

class FinancialDomainListResponse(BaseModel):
    financial_domains: List[str]

class FormulaDomainStatItem(BaseModel):
    financial_domain: str
    count: int

class FormulaDomainStatsResponse(BaseModel):
    stats: List[FormulaDomainStatItem]

class CompositeFormulaStepCreate(BaseModel):
    sequence_number: int = Field(..., description="The execution order for this step (lower numbers run first).")
    formula_token_code: str = Field(..., description="The token_code of the SymbolicFormulaAsset to execute in this step.")

class CompositeFormulaStepResponse(CompositeFormulaStepCreate):
    step_id: str

    class Config:
        from_attributes = True

class CompositeFormulaBlueprintCreate(BaseModel):
    business_name: str = Field(..., description="A user-friendly name for the composite formula (e.g., 'Retail Credit Scorecard v2').")
    token_code: str = Field(..., description="A unique token code for this composite blueprint (e.g., 'COMPOSITE-CREDIT-V2').")
    description: Optional[str] = Field(None, description="A detailed description of the composite formula's purpose.")
    steps: List[CompositeFormulaStepCreate] = Field(..., description="The ordered list of formula steps.")

class CompositeFormulaBlueprintResponse(BaseModel):
    composite_id: str
    business_name: str
    token_code: str
    description: Optional[str] = None
    steps: List[CompositeFormulaStepResponse]

# =====================================================================
# --- MAINTENANCE SCHEMAS ---
# =====================================================================

class CleanupSummaryResponse(BaseModel):
    deleted_count: int
    message: str

class ManualJobTriggerRequest(BaseModel):
    parameters: Optional[Dict[str, Any]] = Field(None, description="Optional parameters for the job, e.g., {'retention_days': 60}.")

class ManualJobTriggerResponse(BaseModel):
    job_name: str
    status: str
    message: str
    summary: Optional[Dict[str, Any]]

class MaintenanceJobDefinition(BaseModel):
    job_name: str = Field(..., description="The unique identifier for the maintenance job.")
    description: str = Field(..., description="A human-readable description of what the job does.")

class MaintenanceJobListResponse(BaseModel):
    jobs: List[MaintenanceJobDefinition]

class MaintenanceTaskLogResponse(BaseModel):
    log_id: str
    task_name: str
    status: str
    summary: Optional[Dict[str, Any]]
    details: Optional[str]
    triggered_by: str
    triggered_at: str
    duration_ms: Optional[int] = None

    class Config:
        from_attributes = True

class MaintenanceTaskLogListResponse(BaseModel):
    logs: List[MaintenanceTaskLogResponse]

class MaintenanceTaskLogFilterParams(BaseModel):
    task_name: Optional[str] = Field(None, description="Filter by task name (case-insensitive search).")
    status: Optional[str] = Field(None, description="Filter by exact status (SUCCESS, FAILED).")
    triggered_by: Optional[str] = Field(None, description="Filter by the user who triggered the task (case-insensitive search).")
    triggered_after: Optional[datetime] = Field(None, description="Filter for logs created after this timestamp (ISO 8601).")
    triggered_before: Optional[datetime] = Field(None, description="Filter for logs created before this timestamp (ISO 8601).")
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=1000)

class MaintenanceTaskStatItem(BaseModel):
    task_name: str
    success_count: int
    failed_count: int
    total_runs: int
    success_rate: float = Field(..., description="Success rate for this specific task (0.0 to 1.0).")

class MaintenanceTaskStatsResponse(BaseModel):
    overall_total_runs: int
    overall_success_count: int
    overall_failed_count: int
    overall_success_rate: float = Field(..., description="Success rate across all tasks (0.0 to 1.0).")
    stats_by_task: List[MaintenanceTaskStatItem]

class MaintenanceTaskPerformanceStat(BaseModel):
    task_name: str
    run_count: int
    avg_duration_ms: Optional[float] = None
    min_duration_ms: Optional[int] = None
    max_duration_ms: Optional[int] = None

class MaintenanceTaskPerformanceStatsResponse(BaseModel):
    stats: List[MaintenanceTaskPerformanceStat]

class FrequentlyFailingTask(BaseModel):
    task_name: str
    failure_count: int

class FrequentlyFailingTaskListResponse(BaseModel):
    tasks: List[FrequentlyFailingTask]
    time_window_hours: int
    failure_threshold: int

class ScheduledJob(BaseModel):
    id: str
    name: str
    next_run_time: Optional[datetime] = None
    trigger: str

class SchedulerStatusResponse(BaseModel):
    is_running: bool
    job_count: int
    jobs: List[ScheduledJob]

class SchedulerControlResponse(BaseModel):
    status: str
    message: str

# =====================================================================
# --- USER ACTIVITY & AUDIT SCHEMAS ---
# =====================================================================

class UserActivityGovernanceAction(BaseModel):
    packet_id: str
    action: str
    resolved_at: Optional[str] = None

    class Config:
        from_attributes = True

class UserActivityComment(BaseModel):
    comment_id: str
    task_id: str
    comment: str
    created_at: str

    class Config:
        from_attributes = True

class UserActivityMaintenanceTask(BaseModel):
    log_id: str
    task_name: str
    status: str
    triggered_at: str

    class Config:
        from_attributes = True

class UserActivitySummaryResponse(BaseModel):
    user_id: str
    governance_actions_count: int
    comments_made_count: int
    maintenance_tasks_triggered_count: int
    recent_governance_actions: List[UserActivityGovernanceAction]
    recent_comments: List[UserActivityComment]
    recent_maintenance_tasks: List[UserActivityMaintenanceTask]

class UserListItem(BaseModel):
    user_id: str
    interaction_count: int = Field(0, description="The total number of interaction events logged for this user.")

class UserListResponse(BaseModel):
    users: List[UserListItem]
    total_count: int

class ScreenComponentCategory(str, Enum):
    READ_ONLY = "READ_ONLY"
    USER_DEFINED = "USER_DEFINED"

class ScreenComponentRequirement(str, Enum):
    MANDATORY = "MANDATORY"
    NON_MANDATORY = "NON_MANDATORY"
    CONDITIONAL = "CONDITIONAL"

class ScreenComponent(BaseModel):
    component_type: str = Field(..., description="Type of UI component (e.g., text_input, number_input, date_picker, dropdown, label).")
    field_binding: Optional[str] = Field(None, description="The technical_sys_name of the ISOFieldDefinition this component is bound to.")
    label_token: str = Field(..., description="The i18n token for the user-facing label (e.g., 'LBL_CUSTOMER_NAME').")
    properties: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Component-specific properties like placeholder, readonly, or dropdown options.")
    category: ScreenComponentCategory = Field(ScreenComponentCategory.USER_DEFINED, description="Defines if the field is for display or user input.")
    requirement_status: ScreenComponentRequirement = Field(ScreenComponentRequirement.NON_MANDATORY, description="Defines the field's validation requirement.")
    conditional_rule_id: Optional[str] = Field(None, description="ID of the rule from the Rules Engine that makes this field mandatory.")
    value_list_group_id: Optional[str] = Field(None, description="Groups this field with others to form a single dropdown.")

class ScreenActionButton(BaseModel):
    button_id: str = Field(..., description="A unique ID for the button on this screen.")
    label_token: str = Field(..., description="The i18n token for the button label (e.g., 'BTN_SUBMIT').")
    action_type: str = Field(..., description="The behavior on click (e.g., NAVIGATE, DELETE_INSTANCE, CANCEL_SESSION).")
    target_screen_id: Optional[str] = Field(None, description="The screen_id to navigate to if action_type is NAVIGATE.")

class ValueListGroup(BaseModel):
    group_id: str = Field(..., description="A unique ID for this value list group.")
    label_token: str = Field(..., description="The i18n token for the final rendered dropdown component's label.")

class ScreenTemplateCreate(BaseModel):
    screen_name: str = Field(..., description="A unique name for the screen template.")
    description: Optional[str] = Field(None, description="A description of the screen's purpose.")
    screen_template_category: str = Field("Business workflow Configurations", description="Category like 'Static Data screen', 'Master Screen', 'Product', etc.")
    application_package_id: Optional[str] = Field(None, description="The Application Package ID if scoped to a package. Null if globally scoped.")
    product_id: Optional[str] = Field(None, description="The product this screen is associated with.")
    subproduct_id: Optional[str] = Field(None, description="The subproduct this screen is associated with.")
    workflow_id: Optional[str] = Field(None, description="The workflow this screen is part of.")
    workflow_step_id: Optional[str] = Field(None, description="The specific workflow step this screen is for.")
    status: Optional[str] = Field(None, description="Optional status update (e.g., DELETED, INACTIVE).")
    linked_api_id: Optional[str] = Field(None, description="The ID of a linked API configuration.")
    pending_api_config: Optional[Dict[str, Any]] = Field(None, description="An inline API Configuration to be created atomically with this screen.")
    definition: Optional[Any] = Field(None, description="The list of UI components that make up the screen, or a structured definition object.")
    action_buttons: List[ScreenActionButton] = Field(default_factory=list, description="The list of global action buttons for the screen.")
    value_list_groups: List[ValueListGroup] = Field(default_factory=list, description="Definitions for grouped dropdowns.")

class ScreenTemplateResponse(ScreenTemplateCreate):
    screen_id: str
    status: str
    created_at: str
    updated_at: Optional[str] = None
    created_by: str

    class Config:
        from_attributes = True

class ScreenTemplateListResponse(BaseModel):
    screens: List[ScreenTemplateResponse]

class ScreenUsageStat(BaseModel):
    screen_id: str
    screen_name: str
    usage_count: int

class ScreenUsageStatsResponse(BaseModel):
    stats: List[ScreenUsageStat]

class BulkDeleteResponse(BaseModel):
    deleted_count: int
    message: str

class GovernanceStatsResponse(BaseModel):
    pending: int
    resolved: int
    total: int

class ExecutionLogStatsResponse(BaseModel):
    success: int
    failed: int
    total: int

class SystemActivitySummaryResponse(BaseModel):
    total_workflows: int
    total_mappers: int
    total_field_definitions: int
    ingestion_jobs: IngestionStatsResponse
    governance_tasks: GovernanceStatsResponse
    execution_logs: ExecutionLogStatsResponse
    total_comments: int
    total_maintenance_runs: int

# =====================================================================
# --- GOVERNANCE HUB SCHEMAS ---
# =====================================================================

class EvidencePacketRegistryResponse(BaseModel):
    packet_id: str
    operator_maker: str
    authorizer_checker: str
    raw_payload_reference: Optional[str] = None
    blockchain_tx_hash: str
    variance_metric_logged: Optional[str] = None
    execution_status: str
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

class GovernanceTaskSearchResponse(BaseModel):
    tasks: List[EvidencePacketRegistryResponse]

class GovernanceTaskFilterParams(BaseModel):
    packet_id: Optional[str] = None
    raw_payload_reference: Optional[str] = None
    execution_status: Optional[str] = None
    authorizer_sme: Optional[str] = None
    skip: int = Field(0, ge=0)
    limit: int = Field(100, ge=1, le=1000)

class GovernanceTaskListResponse(BaseModel):
    pending_tasks: List[EvidencePacketRegistryResponse]

class GovernanceTaskDetailResponse(EvidencePacketRegistryResponse):
    pass

class TaskParticipant(BaseModel):
    user_id: str
    roles: List[str]

class TaskParticipantListResponse(BaseModel):
    task_id: str
    participants: List[TaskParticipant]

class GovernanceCommentCreate(BaseModel):
    comment: str

class GovernanceCommentUpdate(BaseModel):
    comment: str

class GovernanceCommentResponse(BaseModel):
    comment_id: str
    task_id: str
    author: str
    comment: str
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

class ExecutionLogSearchResponse(BaseModel):
    logs: List[EvidencePacketRegistryResponse]

class ExecutionLogFilterParams(BaseModel):
    packet_id: Optional[str] = None
    raw_payload_reference: Optional[str] = None
    execution_status: Optional[str] = None
    operator_maker: Optional[str] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    skip: int = Field(0, ge=0)
    limit: int = Field(100, ge=1, le=1000)

class GovernanceTaskResponse(BaseModel):
    task_id: str
    status: str
    checker_identity: Optional[str] = None
    resolution_action: Optional[str] = None
    resolved_at: Optional[str] = None
    governance_signature_token: Optional[str] = None

class GovernanceAction(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"

class GovernanceTaskAction(BaseModel):
    action: GovernanceAction

class GovernanceBulkActionResponse(BaseModel):
    success_count: int
    failed_count: int
    details: List[Dict[str, Any]]

class GovernanceBulkActionRequest(BaseModel):
    task_ids: List[str]
    action: GovernanceAction
    comment: Optional[str] = ""

# =====================================================================
# --- SYSTEM HEALTH SCHEMAS ---
# =====================================================================

class SystemHealthCheck(BaseModel):
    check_name: str
    status: str
    details: Optional[str] = None

class SystemHealthResponse(BaseModel):
    system_status: str
    timestamp: str
    checks: List[SystemHealthCheck]

class DatabaseSession(BaseModel):
    pid: int
    usename: Optional[str] = None
    client_addr: Optional[str] = None
    state: Optional[str] = None
    query: Optional[str] = None

class DatabaseSessionListResponse(BaseModel):
    sessions: List[DatabaseSession]
    message: Optional[str] = None

class TerminateSessionResponse(BaseModel):
    success: bool
    message: str

class EventListener(BaseModel):
    callback_name: str

class EventBusStatusResponse(BaseModel):
    listeners: Dict[str, List[EventListener]]

class EventListenerRegistration(BaseModel):
    event_type: str = Field(..., description="The event type to subscribe to.")
    callback_name: str = Field(..., description="The name of the predefined callback function to register.")

class EventListenerRegistrationResponse(BaseModel):
    success: bool
    message: str

class EventBusStatsResponse(BaseModel):
    total_events_broadcast: int
    events_by_type: Dict[str, int]

class RecentEventItem(BaseModel):
    event_id: str
    broadcast_at: str
    event_type: str
    source_context: str
    payload: Dict[str, Any]

class RecentEventListResponse(BaseModel):
    events: List[RecentEventItem]

class EventBusControlResponse(BaseModel):
    status: str
    message: str

class ManualEventBroadcast(BaseModel):
    event_type: str = Field(..., description="The type of the event to broadcast.")
    source_context: str = Field(..., description="The source context for the event (e.g., 'ManualTest').")
    payload: Dict[str, Any] = Field(..., description="The JSON payload for the event.")

class ClearEventsResponse(BaseModel):
    cleared_count: int
    message: str

# =====================================================================
# --- API INTEGRATION SCHEMAS ---
# =====================================================================

class ApiConfigurationCreate(BaseModel):
    api_name: str = Field(..., description="A unique name for the API integration.")
    http_method: str = Field(..., description="The HTTP method to use (e.g., GET, POST).")
    url_template: str = Field(..., description="The URL for the API endpoint, with optional placeholders like {field_name}.")
    request_body_template: Optional[Dict[str, Any]] = Field(None, description="A JSON template for the request body for POST/PUT requests.")
    headers: Optional[Dict[str, Any]] = Field(None, description="A JSON object of headers to include in the request.")
    mask_pii_in_body: bool = Field(True, description="If true, automatically mask PII fields in the request body before sending to the external system.")
    rate_limit_rps: int = Field(10, description="The maximum number of requests per second allowed globally for this API.")
    circuit_breaker_threshold: int = Field(5, description="The number of consecutive failures before the circuit breaker trips open.")
    circuit_breaker_timeout_sec: int = Field(60, description="The cooldown duration in seconds before the circuit breaker tests recovery.")
    description: Optional[str] = Field(None, description="A description of the API's purpose.")
    # Integration Gateway quadrant classification
    direction: str = Field("OUTBOUND", description="INBOUND (system pushes to us) or OUTBOUND (we call the system).")
    scope: str = Field("EXTERNAL", description="EXTERNAL (outside bank boundary) or INTERNAL (inside bank, cross-system).")
    application_package_id: Optional[str] = Field(None)
    product_id: Optional[str] = Field(None)
    subproduct_id: Optional[str] = Field(None)

class ApiConfigurationResponse(ApiConfigurationCreate):
    api_id: str
    status: str
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    class Config:
        from_attributes = True

class ApiConfigurationListResponse(BaseModel):
    integrations: List[ApiConfigurationResponse]

# =====================================================================
# --- BATCH GATEWAY SCHEMAS ---
# =====================================================================

class BatchGatewayConfigCreate(BaseModel):
    """
    WHY: Batch Gateway Designer — defines scheduled/file-based integration jobs.
    Each record is one batch job: what data, which direction, where it comes from/goes,
    when it runs. Referenced by Celery beat scheduler at runtime.
    """
    config_name: str = Field(..., description="Unique name for this batch job (e.g. 'SWIFT MT940 EOD Inbound')")
    description: Optional[str] = None
    direction: str = Field("INBOUND", description="INBOUND (we receive a file/batch) or OUTBOUND (we send one)")
    scope: str = Field("EXTERNAL", description="EXTERNAL (outside bank) or INTERNAL (cross-system within bank)")
    source_type: str = Field("SFTP", description="SFTP | S3 | FILE_DROP | API_POLL | MQ")
    connection_config: Optional[Dict[str, Any]] = Field(None, description="host, port, path, credential_key_ref — never raw secrets")
    schedule_cron: Optional[str] = Field(None, description="Cron expression e.g. '0 18 * * 1-5' = weekdays 6pm")
    timezone: str = Field("UTC")
    file_template_id: Optional[str] = Field(None, description="Optional File Template for layout validation")
    retry_max_attempts: int = Field(3)
    retry_backoff_sec: int = Field(60)
    alert_on_failure_email: Optional[str] = None
    application_package_id: Optional[str] = None

class BatchGatewayConfigResponse(BatchGatewayConfigCreate):
    config_id: str
    status: str
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    class Config:
        from_attributes = True

class BatchGatewayConfigListResponse(BaseModel):
    configurations: List[BatchGatewayConfigResponse]

# =====================================================================
# --- AI & MACHINE LEARNING SCHEMAS ---
# =====================================================================

class UserInteractionEventCreate(BaseModel):
    session_id: Optional[str] = Field(None, description="A unique identifier for the user's session.")
    event_type: str = Field(..., description="The type of interaction (e.g., SCREEN_VIEW, BUTTON_CLICK).")
    target_component_id: Optional[str] = Field(None, description="The unique ID of the UI component that was interacted with.")
    payload: Optional[Dict[str, Any]] = Field(None, description="A JSON object containing contextual data about the event.")

class UserInteractionEventResponse(UserInteractionEventCreate):
    event_id: str
    user_id: str
    timestamp: str

    class Config:
        from_attributes = True

class UserInteractionEventSummaryItem(BaseModel):
    event_id: str
    event_type: str
    target_component_id: Optional[str]
    timestamp: str

    class Config:
        from_attributes = True

class UserInteractionSummaryResponse(BaseModel):
    user_id: str
    total_interactions: int
    recent_interactions: List[UserInteractionEventSummaryItem]

class PredictiveInsightRequest(BaseModel):
    current_event_type: str = Field(..., description="The user's last event type (e.g., SCREEN_VIEW).")
    current_target_component_id: Optional[str] = Field(None, description="The ID of the component related to the last event.")

class PredictiveInsightResponse(BaseModel):
    predicted_next_event_type: Optional[str] = Field(None, description="The most likely next event type.")
    predicted_target_component_id: Optional[str] = Field(None, description="The most likely next target component.")
    confidence: float = Field(0.0, description="The confidence score of the prediction (0.0 to 1.0).")
    message: str

class ConversationalInsightRequest(BaseModel):
    query: str = Field(..., description="The natural language query from the user.")

class ConversationalInsightResponse(BaseModel):
    answer: str
    context: Optional[Dict[str, Any]] = None

class UserInteractionStatItem(BaseModel):
    event_type: str
    count: int

class UserInteractionStatsResponse(BaseModel):
    total_interactions: int
    total_unique_users: int
    stats_by_event_type: List[UserInteractionStatItem]

class ClearedUserHistoryItem(BaseModel):
    user_id: str
    last_cleared_at: str
    cleared_by: str

class ClearedUserHistoryListResponse(BaseModel):
    cleared_users: List[ClearedUserHistoryItem]
    total_count: int

class PromptToCanvasRequest(BaseModel):
    prompt: str = Field(..., description="A natural language prompt describing the desired workflow.")
    workflow_name: str = Field("Generated Workflow", description="The name for the new workflow.")

class CustomerBehavioralProfileResponse(BaseModel):
    user_id: str
    ranked_journeys: Optional[List[Dict[str, Any]]] = None
    common_devices: Optional[List[Dict[str, Any]]] = None
    typical_locations: Optional[List[Dict[str, Any]]] = None
    avg_transaction_value: Optional[float] = None
    net_worth_estimate: Optional[float] = None
    last_calculated_at: str
    profile_version: int

    class Config:
        from_attributes = True

class BehavioralProfileListResponse(BaseModel):
    profiles: List[CustomerBehavioralProfileResponse]

class PromptToCanvasResponse(BaseModel):
    message: str
    generated_manifest: WorkflowConfigurationCreate
    
class PromptToReportResponse(BaseModel):
    message: str
    generated_report_blueprint: ReportBlueprintCreate
    notes: List[str] = Field(default_factory=list)

class ImageToReportRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded image string of the report mockup.")
    image_mime_type: str = Field(default="image/jpeg", description="MIME type of the uploaded image.")

class ImageToReportResponse(BaseModel):
    message: str
    generated_report_blueprint: ReportBlueprintCreate

class WireframeToScreenRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded image string of the wireframe.")
    image_mime_type: str = Field(default="image/jpeg", description="MIME type of the uploaded image.")
    # extraction_mode: bank selects their extraction engine at upload time.
    # IN_HOUSE_OCR = free, runs on-server, no API cost (default).
    # ANTHROPIC_VISION = Claude claude-sonnet-4-6 vision, paid per-extraction, highest accuracy.
    # OPENAI_VISION = GPT-4o vision, legacy path.
    # Omitting this field falls back to EXTRACTION_MODE env var, then IN_HOUSE_OCR.
    extraction_mode: Optional[str] = Field(None, description="IN_HOUSE_OCR | ANTHROPIC_VISION | OPENAI_VISION")

class WireframeToScreenResponse(BaseModel):
    message: str
    components: List[ScreenComponent]
    extraction_mode: Optional[str] = Field(None, description="Which extraction engine was used.")

class TranslateFieldRequest(BaseModel):
    business_name: str = Field(..., description="The English business name to translate.")
    domain_category: Optional[str] = Field(None, description="The financial domain for context (e.g., 'Retail Banking').")

class TranslateFieldResponse(BaseModel):
    message: str
    translations: Dict[str, str] = Field(..., description="A dictionary of locale codes to translated names.")

class AutoMapFieldSuggestion(BaseModel):
    source_path: str
    suggested_iso_field: Optional[str] = None
    confidence_score: float = 0.0
    is_new_field_required: bool = False
    inferred_data_type: str = "Text"

class AutoMapFileResponse(BaseModel):
    message: str
    suggested_mappings: List[AutoMapFieldSuggestion]
    file_type: str
    headers: Optional[List[str]] = None
    sample_row: Optional[List[str]] = None

class DomainApiContractCreate(BaseModel):
    api_name: str
    description: Optional[str] = None
    request_contract: Optional[List[str]] = None
    response_contract: Optional[List[str]] = None

class DomainApiContractResponse(BaseModel):
    api_contract_id: str
    api_name: str
    description: Optional[str] = None
    status: str
    request_contract: Optional[List[str]] = None
    response_contract: Optional[List[str]] = None
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True

class DomainApiStateChangeResponse(BaseModel):
    message: str
    api_contract_id: str
    new_status: str

class SimulationScenarioCreate(BaseModel):
    simulation_name: str
    description: Optional[str] = None
    target_workflow_id: str
    sample_size: Optional[int] = 100
    scenario_variables: Optional[Dict[str, Any]] = None
    historical_dataset_source: Optional[str] = "SYNTHETIC_GENERATION"

class SimulationScenarioResponse(SimulationScenarioCreate):
    simulation_id: str
    created_at: str

    class Config:
        from_attributes = True

class SimulationJobResponse(BaseModel):
    job_id: str
    simulation_id: str
    status: str
    processed_records: int
    total_records: int
    results_summary: Optional[Dict[str, Any]] = None
    created_at: str

    class Config:
        from_attributes = True