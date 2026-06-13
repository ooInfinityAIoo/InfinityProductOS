from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime

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
# --- NEW ISO 20022 COMMON CORE MASTERS VALIDATION SCHEMAS ---
# =====================================================================

# --- SCREEN A: CURRENCY DEFINITION VALIDATOR ---
class CurrencyDefinitionCreate(BaseModel):
    currency_code: str = Field(..., description="ISO 3-Letter Currency Code Mapping")
    currency_name: str = Field(..., description="Standard Textual Identification Name")
    fraction_digits: int = Field(2, description="Decimal Rounding Formatting Limit Scale")
    source_currency_code: str = Field(..., description="Base Source Comparison Currency")
    target_currency_code: str = Field(..., description="Target Multiplier Currency")
    exchange_rate: float = Field(..., description="Numerical Multiplier Factor Value")
    associated_calendar_id: Optional[str] = Field(None, description="Linked Profile Calendar Anchor")

    @validator('currency_code', 'source_currency_code', 'target_currency_code')
    def validate_iso_currency_codes(cls, v):
        code = v.strip().upper()
        if len(code) != 3:
            raise ValueError("ISO standard restriction: Currency designations must be exactly 3 characters.")
        return code

    @validator('exchange_rate')
    def validate_rate_multiplier(cls, v):
        if v <= 0:
            raise ValueError("Financial valuation logic rule: Exchange rate multiplier factor must be greater than zero.")
        return v


# --- SCREEN B: OPERATIONAL CALENDAR VALIDATOR ---
class OperationalCalendarCreate(BaseModel):
    calendar_type: str = Field(..., description="Routing or Currency Rule Category Tracking Profile")
    calendar_year: int = Field(..., description="Numeric 4-Digit processing target year")
    weekly_holiday_mask: str = Field(..., description="Shorthand character mask tracking rest days")
    financial_year_start_date: str = Field(..., description="YYYY-MM-DD financial loop activation date")
    financial_year_end_date: str = Field(..., description="YYYY-MM-DD operational framework sunset expiration date")
    calendar_description: Optional[str] = Field(None, description="Explanatory operational documentation details")
    is_active_flag: bool = Field(True, description="System master validation status flag toggle")

    @validator('calendar_year')
    def validate_four_digit_year(cls, v):
        if v < 1900 or v > 2100:
            raise ValueError("Formatting rule: Target year parameter must match standard 4-digit YYYY arrays.")
        return v


# --- SCREEN C: ACCOUNT PROFILE VALIDATOR ---
class AccountProfileCreate(BaseModel):
    account_number: str = Field(..., description="Structural Unique alphanumeric account unique string layout")
    account_name_title: str = Field(..., description="Textual identification name profile heading string")
    currency_code: str = Field(..., description="ISO code linked directly to active currency master row lookup keys")
    clearing_system_member_id: str = Field(..., description="Systemic clearing route sorting member tracking code")
    branch_location_name: Optional[str] = Field(None, description="Localized processing bank center desk name string")
    is_frozen_flag: bool = Field(False, description="Strict operational freeze switch block constraint control")

    @validator('currency_code')
    def clean_ccy_string(cls, v):
        return v.strip().upper()


# --- SCREEN D: COUNTRY JURISDICTION VALIDATOR ---
class CountryJurisdictionCreate(BaseModel):
    country_iso_code: str = Field(..., description="ISO 2-character country alphabet marker sequence patterns")
    country_name_text: str = Field(..., description="Official state territorial designation string parameters")
    region_continent_name: str = Field(..., description="Regional localization group array criteria category label")
    check_digit_type_code: Optional[str] = Field(None, description="Algorithmic validation processing identifier routing tag")
    target_central_bank_routing_code: Optional[str] = Field(None, description="Sovereign clearing interface anchor ledger index node")
    iban_mandatory_flag: bool = Field(False, description="Enforces mandatory formatting check execution rules context")

    @validator('country_iso_code')
    def validate_alpha2_length(cls, v):
        code = v.strip().upper()
        if len(code) != 2:
            raise ValueError("ISO standard restriction: Country designation codes must be an exact 2-character string.")
        return code


# --- SCREEN E: FEE CONFIGURATION VALIDATOR ---
class FeeConfigurationCreate(BaseModel):
    fee_charge_code: str = Field(..., description="Shorthand identification string mapping ledger lookup unique index keys")
    fee_type_name: str = Field(..., description="Calculation engine strategy selector path routing design pattern blueprint")
    effective_start_date: str = Field(..., description="Date profile component validation threshold start node")
    effective_end_date: str = Field(..., description="Expiry date pick restriction control checkpoint criteria tag")
    fee_amount_value: float = Field(0.00, description="Absolute baseline financial balance pricing limit value parameter")
    fee_category_name: Optional[str] = Field(None, description="General ledger bookkeeping split parameter category code text")
    is_active_flag: bool = Field(True, description="Master transaction execution eligibility evaluation checkbox flag")

    @validator('fee_amount_value')
    def check_floor_limits(cls, v):
        if v < 0.00:
            raise ValueError("Financial parameters boundary: System fee pricing parameters cannot drop below 0.00.")
        return v

class CurrencyDefinitionResponse(CurrencyDefinitionCreate):
    created_at: str
    class Config:
        from_attributes = True

class OperationalCalendarResponse(OperationalCalendarCreate):
    calendar_id: str
    created_at: str
    class Config:
        from_attributes = True

class AccountProfileResponse(AccountProfileCreate):
    created_at: str
    class Config:
        from_attributes = True

class CountryJurisdictionResponse(CountryJurisdictionCreate):
    created_at: str
    class Config:
        from_attributes = True

class FeeConfigurationResponse(FeeConfigurationCreate):
    created_at: str
    class Config:
        from_attributes = True

class CurrencyDefinitionListResponse(BaseModel):
    currencies: List[CurrencyDefinitionResponse]

class OperationalCalendarListResponse(BaseModel):
    calendars: List[OperationalCalendarResponse]

class AccountProfileListResponse(BaseModel):
    accounts: List[AccountProfileResponse]

class CountryJurisdictionListResponse(BaseModel):
    countries: List[CountryJurisdictionResponse]

class FeeConfigurationListResponse(BaseModel):
    fees: List[FeeConfigurationResponse]

class MastersSearchResults(BaseModel):
    currencies: List[CurrencyDefinitionResponse] = []
    calendars: List[OperationalCalendarResponse] = []
    accounts: List[AccountProfileResponse] = []
    countries: List[CountryJurisdictionResponse] = []
    fees: List[FeeConfigurationResponse] = []

class MastersCountResponse(BaseModel):
    currencies: int
    calendars: int
    accounts: int
    countries: int
    fees: int

class ProductMasterResponse(BaseModel):
    product_id: str
    product_name: str
    description: Optional[str]
    class Config:
        from_attributes = True

class ProductMasterListResponse(BaseModel):
    products: List[ProductMasterResponse]

class SubproductMasterResponse(BaseModel):
    subproduct_id: str
    subproduct_name: str
    product_id: str
    description: Optional[str]
    class Config:
        from_attributes = True

class SubproductMasterListResponse(BaseModel):
    subproducts: List[SubproductMasterResponse]


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

class PayloadFieldMappingCreate(BaseModel):
    source_path: str = Field(..., description="Source JSONPath, XML node, or SWIFT tag (e.g., '$.amount', 'Tag32A')")
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
    source_format: str = Field(..., description="Input format type (e.g., SWIFT_MT, JSON, XML)")
    target_format: str = Field("ISO_20022_DICTIONARY", description="Target standard format")
    mappings: List[PayloadFieldMappingCreate] = Field(default_factory=list)

class PayloadMapperBlueprintResponse(BaseModel):
    mapper_id: str
    mapper_name: str
    source_format: str
    target_format: str
    created_at: str
    created_by: str
    mappings: List[PayloadFieldMappingResponse] = []
    
    class Config:
        from_attributes = True

class PayloadMapperBlueprintListResponse(BaseModel):
    mappers: List[PayloadMapperBlueprintResponse]

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


# --- ISO FIELD REGISTRY SCHEMAS ---
class ISOFieldDefinitionCreate(BaseModel):
    technical_sys_name: str = Field(..., description="Internal system field identifier")
    preferred_business_name: str = Field(..., description="User-facing field label")
    iso_business_name: str = Field(..., description="ISO 20022 standard field mapping")
    data_type: str = Field(..., description="Decimal, Alphanumeric, Amount, Date, Text")
    domain_category: str = Field(..., description="Business domain (HELOC, PAYMENTS, TREASURY)")
    subdomain_category: Optional[str] = Field(None, description="Sub-domain (FIGRE, RTGS, CLEARING)")
    description: Optional[str] = Field(None, description="Field documentation")
    is_mandatory: bool = Field(False, description="Required field indicator")
    default_value: Optional[str] = Field(None, description="Default value if not provided")
    is_pii: bool = Field(False, description="Indicates if the field contains Personally Identifiable Information (PII).")


class ISOFieldDefinitionResponse(ISOFieldDefinitionCreate):
    field_id: str
    created_at: str
    created_by: str

    class Config:
        from_attributes = True

class ISOFieldDefinitionListResponse(BaseModel):
    fields: List[ISOFieldDefinitionResponse]


# --- WORKFLOW NODE SCHEMAS ---
class WorkflowNodeCreate(BaseModel):
    sequence_number: int = Field(..., description="Step sequence in workflow")
    node_title: str = Field(..., description="User-facing node label")
    node_code: str = Field(..., description="Internal node identifier")
    canvas_x_position: int = Field(default=0, description="Canvas X coordinate")
    canvas_y_position: int = Field(default=0, description="Canvas Y coordinate")
    rules_applied: Optional[List[str]] = Field(None, description="Business rules to execute")
    calculations: Optional[List[str]] = Field(None, description="Calculations to perform")
    api_triggers: Optional[List[str]] = Field(None, description="External APIs to call")
    events_broadcast: Optional[List[str]] = Field(None, description="Events to broadcast")
    sla_days: int = Field(default=1, description="SLA target in days")
    sla_anchor_field: Optional[str] = Field(None, description="Field to anchor SLA calculation")
    screen_template: Optional[str] = Field(None, description="Screen template for UI rendering")


class WorkflowNodeResponse(WorkflowNodeCreate):
    node_id: str
    workflow_id: str
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


# --- WORKFLOW EDGE SCHEMAS ---
class WorkflowEdgeCreate(BaseModel):
    source_node_id: str = Field(..., description="Source node ID")
    target_node_id: str = Field(..., description="Target node ID")
    edge_condition: Optional[str] = Field(None, description="Branching condition (JSON)")


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
    formulas_defined: Optional[List[dict]] = Field(None, description="Mathematical formulas")
    rules_matrix: Optional[List[dict]] = Field(None, description="Business rules configuration")
    nodes: Optional[List[WorkflowNodeCreate]] = Field(None, description="Workflow nodes")
    edges: Optional[List[WorkflowEdgeCreate]] = Field(None, description="Workflow connections")


class WorkflowConfigurationResponse(BaseModel):
    workflow_id: str
    workflow_name: str
    domain_scope: str
    product_context: str
    sub_product: Optional[str] = None
    version: str
    is_active: bool
    description: Optional[str] = None
    formulas_defined: Optional[List[dict]] = None
    rules_matrix: Optional[List[dict]] = None
    created_at: str
    created_by: str
    updated_at: Optional[str] = None
    nodes: Optional[List[WorkflowNodeResponse]] = None
    edges: Optional[List[WorkflowEdgeResponse]] = None

    class Config:
        from_attributes = True


# --- REGISTRY QUERY SCHEMAS ---
class FieldRegistryFilterParams(BaseModel):
    domain_category: Optional[str] = None
    subdomain_category: Optional[str] = None
    data_type: Optional[str] = None
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=1000)

# =====================================================================
# --- GOVERNANCE HUB SCHEMAS ---
# =====================================================================
from enum import Enum

class GovernanceAction(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"

class GovernanceTaskAction(BaseModel):
    action: GovernanceAction = Field(..., description="The resolution action (APPROVE or REJECT).")

class GovernanceTaskResponse(BaseModel):
    task_id: str
    status: str
    checker_identity: str
    resolution_action: str
    resolved_at: str
    governance_signature_token: Optional[str] = None

class GovernanceTaskItem(BaseModel):
    packet_id: str
    variance_metric_logged: Optional[str]
    execution_status: str
    class Config:
        from_attributes = True

class GovernanceTaskListResponse(BaseModel):
    pending_tasks: List[GovernanceTaskItem]

class GovernanceCommentCreate(BaseModel):
    comment: str = Field(..., min_length=1, description="The content of the comment or note.")

class GovernanceCommentUpdate(BaseModel):
    comment: str = Field(..., min_length=1, description="The updated content of the comment.")

class GovernanceCommentResponse(GovernanceCommentCreate):
    author: str
    comment_id: str
    task_id: str
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

class GovernanceTaskDetailResponse(BaseModel):
    packet_id: str
    operator_maker: str
    authorizer_checker: str
    raw_payload_reference: Optional[str]
    blockchain_tx_hash: Optional[str]
    variance_metric_logged: Optional[str]
    execution_status: str
    comments: List[GovernanceCommentResponse] = []

    class Config:
        from_attributes = True

class GovernanceTaskFilterParams(BaseModel):
    packet_id: Optional[str] = Field(None, description="Filter by the unique task/packet ID.")
    raw_payload_reference: Optional[str] = Field(None, description="Filter by the raw payload reference (e.g., original transaction ID).")
    execution_status: Optional[str] = Field(None, description="Filter by the current execution status of the task.")
    authorizer_sme: Optional[str] = Field(None, description="Filter by the SME who authorized/rejected the task.")
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=1000)

class GovernanceTaskSearchResponse(BaseModel):
    tasks: List[GovernanceTaskItem]

class TaskParticipant(BaseModel):
    user_id: str
    roles: List[str] = Field(..., description="A list of roles this user played in the task's lifecycle (e.g., CREATOR, RESOLVER, COMMENTER).")

class TaskParticipantListResponse(BaseModel):
    task_id: str
    participants: List[TaskParticipant]

class GovernanceStatsResponse(BaseModel):
    pending_count: int = Field(..., description="Number of tasks awaiting SME review.")
    approved_count: int = Field(..., description="Number of tasks approved by an SME.")
    rejected_count: int = Field(..., description="Number of tasks rejected by an SME.")
    total_processed: int = Field(..., description="Total number of tasks that have been processed (approved or rejected).")

class ExecutionLogItem(BaseModel):
    packet_id: str
    execution_status: str
    raw_payload_reference: Optional[str]
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

class ExecutionLogSearchResponse(BaseModel):
    logs: List[ExecutionLogItem]

class ExecutionLogFilterParams(BaseModel):
    packet_id: Optional[str] = Field(None, description="Filter by a partial packet ID (case-insensitive).")
    raw_payload_reference: Optional[str] = Field(None, description="Filter by a partial raw payload reference (case-insensitive).")
    execution_status: Optional[str] = Field(None, description="Filter by an exact execution status (e.g., FINALIZED_AND_SETTLED).")
    operator_maker: Optional[str] = Field(None, description="Filter by the creating operator (case-insensitive).")
    created_after: Optional[datetime] = Field(None, description="Filter for logs created after this timestamp (ISO 8601).")
    created_before: Optional[datetime] = Field(None, description="Filter for logs created before this timestamp (ISO 8601).")
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=100, ge=1, le=1000)

class ExecutionLogStatsResponse(BaseModel):
    finalized_and_settled: int
    halted_in_governance: int
    authorized_reprocessed: int
    rejected_dead: int
    total: int

# =====================================================================
# --- SYMBOLIC FORMULA ENGINE SCHEMAS ---
# =====================================================================

class SymbolicFormulaCreate(BaseModel):
    token_code: str = Field(..., description="Calculation Token Identifier Code (e.g., CALC-REG-099)")
    target_output_field: str = Field(..., description="Target Binding Dictionary Output Field")
    mathematical_expression: str = Field(..., description="Symbolic Formula Mathematical String Expression")

class SymbolicFormulaResponse(SymbolicFormulaCreate):
    asset_id: str
    created_at: str
    created_by: str

    class Config:
        from_attributes = True

class SymbolicFormulaListResponse(BaseModel):
    formulas: List[SymbolicFormulaResponse]

# =====================================================================
# --- MAINTENANCE SCHEMAS ---
# =====================================================================

class StaleTaskSummaryResponse(BaseModel):
    flagged_count: int
    message: str

class MaintenanceTaskLogResponse(BaseModel):
    log_id: str
    task_name: str
    status: str
    summary: Optional[Dict[str, Any]]
    details: Optional[str]
    triggered_by: str
    triggered_at: str

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
    label: str = Field(..., description="The user-facing label for the component.")
    properties: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Component-specific properties like placeholder, readonly, or dropdown options.")
    category: ScreenComponentCategory = Field(ScreenComponentCategory.USER_DEFINED, description="Defines if the field is for display or user input.")
    requirement_status: ScreenComponentRequirement = Field(ScreenComponentRequirement.NON_MANDATORY, description="Defines the field's validation requirement.")
    conditional_rule_id: Optional[str] = Field(None, description="ID of the rule from the Rules Engine that makes this field mandatory.")
    value_list_group_id: Optional[str] = Field(None, description="Groups this field with others to form a single dropdown.")

class ScreenActionButton(BaseModel):
    button_id: str = Field(..., description="A unique ID for the button on this screen.")
    button_label: str = Field(..., description="The text displayed on the button (e.g., 'Submit').")
    action_type: str = Field(..., description="The behavior on click (e.g., NAVIGATE, DELETE_INSTANCE, CANCEL_SESSION).")
    target_screen_id: Optional[str] = Field(None, description="The screen_id to navigate to if action_type is NAVIGATE.")

class ValueListGroup(BaseModel):
    group_id: str = Field(..., description="A unique ID for this value list group.")
    dropdown_label: str = Field(..., description="The label for the final rendered dropdown component.")

class ScreenTemplateCreate(BaseModel):
    screen_name: str = Field(..., description="A unique name for the screen template.")
    description: Optional[str] = Field(None, description="A description of the screen's purpose.")
    product_id: Optional[str] = Field(None, description="The product this screen is associated with.")
    subproduct_id: Optional[str] = Field(None, description="The subproduct this screen is associated with.")
    workflow_id: Optional[str] = Field(None, description="The workflow this screen is part of.")
    workflow_step_id: Optional[str] = Field(None, description="The specific workflow step this screen is for.")
    definition: List[ScreenComponent] = Field(default_factory=list, description="The list of UI components that make up the screen.")
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

# =====================================================================
# --- SYSTEM-WIDE DASHBOARD SCHEMAS ---
# =====================================================================

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
# --- SYSTEM-WIDE DASHBOARD SCHEMAS ---
# =====================================================================

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