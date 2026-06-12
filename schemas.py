from pydantic import BaseModel, Field, validator
from typing import List, Optional

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

# =====================================================================
# --- PHASE 1: FIELD REGISTRY & WORKFLOW PERSISTENCE SCHEMAS ---
# =====================================================================

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


class ISOFieldDefinitionResponse(ISOFieldDefinitionCreate):
    field_id: str
    created_at: str
    created_by: str

    class Config:
        from_attributes = True


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