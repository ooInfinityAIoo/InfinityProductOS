# ============================================================
# WHY THIS FILE EXISTS:
# This is the ISO Field Registry router — the gateway to the "Semantic Bloodstream"
# of the entire platform (Layer 3 in the 8-layer architecture).
#
# The ISO Field Registry stores 3,013 ISO 20022 standard financial data fields.
# Every studio (Workflow, Rules, Calculations, Screens, Mappers, etc.) references
# these fields when users build logic. This ensures the entire platform speaks one
# universal financial language — so a field called "InstructedAmount" means exactly
# the same thing whether it's in a workflow node, a business rule, or a screen form.
#
# WHAT BREAKS IF THIS ROUTER IS DOWN:
# All 10 studio modules lose their field-picker dropdowns. Business users cannot
# map data, build rules, or configure screens. The IsoFieldSelector component
# (src/components/IsoFieldSelector.tsx) calls this router on every keystroke.
#
# KEY CONCEPTS:
# - display_preference (ISO | CLIENT): Controls whether studios show the ISO standard
#   name ("InstructedAmount") or the bank's custom name ("Wire Transfer Amount").
#   Banks have their own terminology; this bridges the gap without changing the data.
# - technical_sys_name: The immutable system identifier used in all JSON logic (never changes).
# - is_pii: Marks fields containing Personally Identifiable Information. PII fields
#   are automatically masked in API responses by services/data_masking.py (Layer 6).
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, cast, String, text
from typing import List, Optional
import uuid
import datetime
from datetime import datetime as dt_datetime

from database import get_db
import models
import schemas
from auth import get_current_user, require_designer_privileges, require_admin_or_auditor, CurrentUser

router = APIRouter(
    prefix="/api/v1/fields/registry",
    tags=["Field Registry"]
)

@router.post("/", response_model=schemas.ISOFieldDefinitionResponse, status_code=status.HTTP_201_CREATED, summary="Register a New ISO Field")
def register_iso_field(payload: schemas.ISOFieldDefinitionCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Registers a new ISO 20022-compliant data field in the Global Field Dictionary.
    """
    existing_field = db.query(models.ISOFieldDefinition).filter(
        models.ISOFieldDefinition.technical_sys_name == payload.technical_sys_name
    ).first()
    
    if existing_field:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Field with technical_sys_name '{payload.technical_sys_name}' already exists."
        )
        
    field_id = f"FIELD-{payload.domain_category[:4].upper()}-{str(uuid.uuid4())[:6].upper()}"

    # The Create schema and the ORM model have drifted apart: the schema exposes
    # `localized_names`, but the column is `localized_overrides`. Blindly splatting
    # payload.dict() into the model raised "invalid keyword argument" and 500'd EVERY
    # field registration (incl. BANK_CUSTOM non-ISO fields). Map the known rename and
    # drop any other schema-only keys so the registry create is resilient to drift.
    data = payload.dict()
    if "localized_names" in data:
        data["localized_overrides"] = data.pop("localized_names")
    valid_cols = {col.name for col in models.ISOFieldDefinition.__table__.columns}
    data = {k: v for k, v in data.items() if k in valid_cols}

    new_field = models.ISOFieldDefinition(
        field_id=field_id,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id,
        **data
    )
    
    db.add(new_field)
    db.commit()
    db.refresh(new_field)
    return new_field

@router.get("/", response_model=schemas.ISOFieldDefinitionListResponse, summary="List and Filter ISO Fields")
def list_iso_fields(filters: schemas.FieldRegistryFilterParams = Depends(), db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves registered fields from the ISO Field Registry, with pagination and dynamic filtering based on domain, subdomain, and data type.
    """
    query = db.query(models.ISOFieldDefinition)

    if filters.domain_category:
        query = query.filter(models.ISOFieldDefinition.domain_category == filters.domain_category)
    if filters.subdomain_category:
        query = query.filter(models.ISOFieldDefinition.subdomain_category == filters.subdomain_category)
    if filters.data_type:
        query = query.filter(models.ISOFieldDefinition.data_type == filters.data_type)

    total_count = query.count()
    fields = query.offset(filters.skip).limit(filters.limit).all()
    return {"fields": fields, "total_count": total_count}

@router.get("/domain-categories", response_model=schemas.DomainCategoryListResponse, summary="List All Unique Domain Categories")
def list_domain_categories(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all unique, non-null domain categories present in the ISO Field Registry.
    This is useful for populating filter dropdowns in a UI.
    """
    domains_query = db.query(
        models.ISOFieldDefinition.domain_category
    ).distinct().filter(
        models.ISOFieldDefinition.domain_category.isnot(None),
        models.ISOFieldDefinition.domain_category != ''
    ).order_by(models.ISOFieldDefinition.domain_category).all()
    
    # The query returns a list of tuples, e.g., [('HELOC',), ('PAYMENTS',)]. Flatten it.
    domains = [domain for domain, in domains_query]
    
    return {"domain_categories": domains}

@router.get("/subdomain-categories", response_model=schemas.SubdomainCategoryListResponse, summary="List All Unique Subdomain Categories")
def list_subdomain_categories(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all unique, non-null subdomain categories present in the ISO Field Registry.
    This is useful for populating dependent filter dropdowns in a UI.
    """
    subdomains_query = db.query(
        models.ISOFieldDefinition.subdomain_category
    ).distinct().filter(
        models.ISOFieldDefinition.subdomain_category.isnot(None),
        models.ISOFieldDefinition.subdomain_category != ''
    ).order_by(models.ISOFieldDefinition.subdomain_category).all()
    
    # The query returns a list of tuples, e.g., [('FIGRE',), ('RTGS',)]. Flatten it.
    subdomains = [subdomain for subdomain, in subdomains_query]
    
    return {"subdomain_categories": subdomains}

# Whitelist of sortable columns. Only these column names are accepted from the frontend
# to prevent SQL injection via dynamic ORDER BY. The frontend passes a string like
# "domain_category" and we map it to the actual SQLAlchemy column object here.
# If an unknown column name arrives, it safely falls back to iso_business_name.
SORTABLE_COLUMNS = {
    "iso_business_name": models.ISOFieldDefinition.iso_business_name,
    "client_business_name": models.ISOFieldDefinition.client_business_name,
    "data_type": models.ISOFieldDefinition.data_type,
    "domain_category": models.ISOFieldDefinition.domain_category,
    "created_at": models.ISOFieldDefinition.created_at,
}

@router.get("/search", response_model=schemas.ISOFieldDefinitionListResponse, summary="Search the ISO Field Registry")
def search_iso_fields(
    q: str = Query("", description="Search term for technical name, business name, description."),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    data_type: Optional[str] = Query(None, description="Filter by data type e.g. Amount, Date, Text"),
    is_pii: Optional[bool] = Query(None, description="Filter to only PII fields"),
    domain_category: Optional[str] = Query(None, description="Filter by domain"),
    display_preference: Optional[str] = Query(None, description="Filter by display preference: ISO or CLIENT"),
    sort_by: Optional[str] = Query("iso_business_name", description="Column to sort by"),
    sort_dir: Optional[str] = Query("asc", description="Sort direction: asc or desc"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Performs a paginated, case-insensitive search across the ISO Field Registry.
    Supports filtering by data_type, is_pii, domain_category, display_preference, and sorting.
    """
    base_query = db.query(models.ISOFieldDefinition)

    if q and len(q) >= 1:
        search_term = f"%{q}%"
        base_query = base_query.filter(
            or_(
                models.ISOFieldDefinition.technical_sys_name.ilike(search_term),
                models.ISOFieldDefinition.client_business_name.ilike(search_term),
                models.ISOFieldDefinition.iso_business_name.ilike(search_term),
                models.ISOFieldDefinition.description.ilike(search_term)
            )
        )

    if data_type:
        base_query = base_query.filter(models.ISOFieldDefinition.data_type == data_type)
    if is_pii is not None:
        base_query = base_query.filter(models.ISOFieldDefinition.is_pii == is_pii)
    if domain_category:
        base_query = base_query.filter(models.ISOFieldDefinition.domain_category == domain_category)
    if display_preference in ("ISO", "CLIENT"):
        base_query = base_query.filter(models.ISOFieldDefinition.display_preference == display_preference)

    sort_col = SORTABLE_COLUMNS.get(sort_by, models.ISOFieldDefinition.iso_business_name)
    order_expr = sort_col.desc() if sort_dir == "desc" else sort_col.asc()

    total_count = base_query.count()
    fields = base_query.order_by(order_expr).offset(skip).limit(limit).all()

    return {"fields": fields, "total_count": total_count}

@router.get("/{field_id}", response_model=schemas.ISOFieldDefinitionResponse, summary="Get a Specific ISO Field")
def get_iso_field(field_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a specific field configuration from the registry by its unique `field_id`.
    """
    field = db.query(models.ISOFieldDefinition).filter(
        models.ISOFieldDefinition.field_id == field_id
    ).first()
    
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Registry field with ID '{field_id}' not found."
        )
    return field

@router.put("/{field_id}", response_model=schemas.ISOFieldDefinitionResponse, summary="Update an ISO Field")
def update_iso_field(field_id: str, payload: schemas.ISOFieldDefinitionCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Updates an existing field definition in the ISO Field Registry.
    """
    db_field = db.query(models.ISOFieldDefinition).filter(models.ISOFieldDefinition.field_id == field_id).first()
    
    if not db_field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Registry field with ID '{field_id}' not found."
        )

    # Prevent unique constraint errors if the technical name is changed to one that already exists
    if payload.technical_sys_name != db_field.technical_sys_name:
        existing_field = db.query(models.ISOFieldDefinition).filter(models.ISOFieldDefinition.technical_sys_name == payload.technical_sys_name).first()
        if existing_field:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Field with technical_sys_name '{payload.technical_sys_name}' already exists."
            )

    for key, value in payload.dict().items():
        setattr(db_field, key, value)

    db.commit()
    db.refresh(db_field)
    return db_field

@router.patch("/{field_id}/preferences", response_model=schemas.ISOFieldDefinitionResponse, summary="Update Bank Display Preferences for a Field")
def update_field_preferences(
    field_id: str,
    payload: schemas.ISOFieldPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Allows a bank to update the client_business_name and display_preference for a field.
    The iso_business_name and technical_sys_name remain immutable.
    """
    db_field = db.query(models.ISOFieldDefinition).filter(models.ISOFieldDefinition.field_id == field_id).first()
    if not db_field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Field '{field_id}' not found.")

    if payload.client_business_name is not None:
        db_field.client_business_name = payload.client_business_name
    if payload.display_preference is not None:
        if payload.display_preference not in ("ISO", "CLIENT"):
            raise HTTPException(status_code=400, detail="display_preference must be 'ISO' or 'CLIENT'")
        db_field.display_preference = payload.display_preference

    db.commit()
    db.refresh(db_field)
    return db_field

@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an ISO Field")
def delete_iso_field(field_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Deletes a field definition from the ISO Field Registry.
    """
    field = db.query(models.ISOFieldDefinition).filter(
        models.ISOFieldDefinition.field_id == field_id
    ).first()
    
    if not field:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Registry field with ID '{field_id}' not found."
        )
    
    db.delete(field)
    db.commit()
    return

@router.get("/pii-fields", response_model=schemas.PIIFieldListResponse, summary="List All PII Fields and Masking Strategies")
def list_pii_fields(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin_or_auditor)):
    """
    Retrieves a list of all fields in the registry that are marked as PII (Personally Identifiable Information),
    along with their configured masking strategy.

    This is a security auditing endpoint and requires admin or auditor privileges.
    """
    pii_fields = db.query(models.ISOFieldDefinition).filter(
        models.ISOFieldDefinition.is_pii == True
    ).order_by(models.ISOFieldDefinition.domain_category, models.ISOFieldDefinition.technical_sys_name).all()

    return {
        "pii_fields": pii_fields,
        "total_count": len(pii_fields)
    }

@router.get("/pii-fields/stats", response_model=schemas.PIIMaskingStrategyStatsResponse, summary="Get PII Field Count by Masking Strategy")
def get_pii_field_stats(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin_or_auditor)):
    """
    Retrieves a count of PII fields, grouped by their configured masking strategy.
    This is useful for getting a high-level overview of data protection coverage.

    Requires admin or auditor privileges.
    """
    stats_query = db.query(
        models.ISOFieldDefinition.masking_strategy,
        func.count(models.ISOFieldDefinition.field_id).label('count')
    ).filter(
        models.ISOFieldDefinition.is_pii == True
    ).group_by(
        models.ISOFieldDefinition.masking_strategy
    ).order_by(
        func.count(models.ISOFieldDefinition.field_id).desc()
    ).all()

    # The query returns Row objects which Pydantic can serialize since the field names
    # ('masking_strategy', 'count') match the `PIIMaskingStrategyStatItem` model.
    return {"stats": stats_query}

@router.get("/pii-fields/unconfigured", response_model=schemas.PIIFieldListResponse, summary="Find PII Fields With No Masking Strategy")
def list_unconfigured_pii_fields(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin_or_auditor)):
    """
    Retrieves a list of all fields that are marked as PII but do not have an explicit
    masking strategy assigned. This is a critical endpoint for ensuring data
    protection policies are fully configured.

    Requires admin or auditor privileges.
    """
    unconfigured_pii_fields = db.query(models.ISOFieldDefinition).filter(
        models.ISOFieldDefinition.is_pii == True,
        models.ISOFieldDefinition.masking_strategy.is_(None)
    ).order_by(models.ISOFieldDefinition.domain_category, models.ISOFieldDefinition.technical_sys_name).all()

    return {
        "pii_fields": unconfigured_pii_fields,
        "total_count": len(unconfigured_pii_fields)
    }

@router.get("/masking-strategies", response_model=schemas.MaskingStrategyListResponse, summary="List All Available Masking Strategies")
def list_masking_strategies(current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all available masking strategies that can be assigned to a PII field.
    """
    strategies = [
        schemas.MaskingStrategyDefinition(
            strategy_name="REDACT_ALL",
            description="Masks the entire value with asterisks (e.g., '*********')."
        ),
        schemas.MaskingStrategyDefinition(
            strategy_name="SHOW_LAST_4",
            description="Masks all but the last 4 characters of the value (e.g., '*******1234')."
        ),
        schemas.MaskingStrategyDefinition(
            strategy_name="EMAIL",
            description="Masks the user part of an email address (e.g., 'j********@example.com')."
        ),
        schemas.MaskingStrategyDefinition(
            strategy_name="PHONE",
            description="An alias for SHOW_LAST_4, suitable for phone numbers (e.g., '*******1234')."
        ),
    ]
    
    return {"strategies": strategies}

# Domain taxonomy endpoints are in routers/iso_domains.py (mounted at /api/v1/fields)
# to avoid collision with the /{field_id} catch-all route in this router.
