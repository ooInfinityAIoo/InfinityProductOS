from fastapi import APIRouter, Depends, HTTPException, Query, status, Body
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import datetime

from database import get_db
import models
import schemas
from sqlalchemy import or_
from sqlalchemy.orm.exc import StaleDataError
from auth import get_current_user, require_designer_privileges, CurrentUser
from services.governance_gate import GovernanceGateHub

router = APIRouter(
    prefix="/api/v1/masters",
    tags=["Common Core Masters"]
)

@router.get("/dynamic/{screen_id}", response_model=schemas.DynamicMasterRecordListResponse, summary="List Records for a Dynamic Master")
def list_dynamic_master_records(screen_id: str, skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """Retrieves all JSONB records associated with a dynamically designed Master screen."""
    records = db.query(models.DynamicMasterRecord).filter(models.DynamicMasterRecord.screen_id == screen_id).offset(skip).limit(limit).all()
    total = db.query(models.DynamicMasterRecord).filter(models.DynamicMasterRecord.screen_id == screen_id).count()
    return {"records": records, "total_count": total}

@router.post("/dynamic/{screen_id}", response_model=schemas.DynamicMasterRecordResponse, status_code=status.HTTP_201_CREATED, summary="Create a Dynamic Master Record")
def create_dynamic_master_record(screen_id: str, payload: schemas.DynamicMasterRecordCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """Creates a new record entry for a specific custom master screen."""
    record_id = f"REC-{uuid.uuid4().hex[:8].upper()}"
    new_record = models.DynamicMasterRecord(
        record_id=record_id,
        screen_id=screen_id,
        record_data=payload.record_data,
        status=payload.status,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id
    )
    db.add(new_record)
    db.commit()
    db.refresh(new_record)
    return new_record

@router.put("/dynamic/{screen_id}/{record_id}", response_model=schemas.DynamicMasterRecordResponse, summary="Update a Dynamic Master Record")
def update_dynamic_master_record(screen_id: str, record_id: str, payload: schemas.DynamicMasterRecordCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """Updates a dynamic record, subject to Optimistic Concurrency Control (OCC)."""
    db_record = db.query(models.DynamicMasterRecord).filter(models.DynamicMasterRecord.record_id == record_id, models.DynamicMasterRecord.screen_id == screen_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Record not found")
        
    db_record.record_data = payload.record_data
    db_record.status = payload.status
    db_record.updated_at = datetime.datetime.utcnow().isoformat()
    db_record.updated_by = current_user.id
    
    try:
        db.commit()
        db.refresh(db_record)
        return db_record
    except StaleDataError:
        db.rollback()
        hub = GovernanceGateHub(db=db)
        task = hub.create_concurrency_conflict_task(
            entity_type=f"DynamicMasterRecord:{screen_id}",
            entity_id=record_id,
            attempted_payload=payload.dict(),
            operator_id=current_user.id
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Concurrent update collision detected. Your changes were intercepted and routed to the Governance Hub (Task ID: {task['task_id']}) for manual SME resolution."
        )

@router.delete("/dynamic/{screen_id}/{record_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Dynamic Master Record")
def delete_dynamic_master_record(screen_id: str, record_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """Soft or hard deletes a dynamic master record."""
    db_record = db.query(models.DynamicMasterRecord).filter(models.DynamicMasterRecord.record_id == record_id, models.DynamicMasterRecord.screen_id == screen_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(db_record)
    db.commit()
    return

@router.patch("/{screen_id}/global-share", summary="Toggle a Master's Global Share flag")
def set_master_global_share(
    screen_id: str,
    is_global_shared: bool = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    """
    WHY THIS EXISTS (FIELD_REGISTRY_REQUIREMENTS.md §4):
    Lets a user toggle whether a master (a MAINTENANCE screen) is shared across ALL
    packages (e.g. Currency, Country) or stays scoped to its own package (e.g. BIC for
    domestic-only Commercial Lending). Availability rule for consumers: a package sees a
    master where application_package_id == pkg OR is_global_shared.
    """
    master = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_id == screen_id).first()
    if not master:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Master not found.")
    master.is_global_shared = is_global_shared
    master.updated_at = datetime.datetime.utcnow().isoformat()
    db.commit()
    return {"screen_id": screen_id, "is_global_shared": master.is_global_shared}


# --- Global Tenant Theme & Branding ---

@router.get("/theme", response_model=schemas.TenantThemeResponse, summary="Get Global Branding Theme")
def get_tenant_theme(db: Session = Depends(get_db)):
    """Fetches the global UX white-label configuration."""
    theme = db.query(models.TenantThemeConfiguration).filter(models.TenantThemeConfiguration.tenant_id == "DEFAULT").first()
    if not theme:
        # Auto-initialize default theme if it doesn't exist
        theme = models.TenantThemeConfiguration(tenant_id="DEFAULT")
        db.add(theme)
        db.commit()
        db.refresh(theme)
    return theme

@router.put("/theme", response_model=schemas.TenantThemeResponse, summary="Update Global Branding Theme")
def update_tenant_theme(payload: schemas.TenantThemeCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """Updates the global UX white-label configuration for the platform."""
    theme = db.query(models.TenantThemeConfiguration).filter(models.TenantThemeConfiguration.tenant_id == "DEFAULT").first()
    if not theme:
        theme = models.TenantThemeConfiguration(tenant_id="DEFAULT")
        db.add(theme)

    theme.brand_name = payload.brand_name
    theme.logo_url = payload.logo_url
    
    db.commit()
    db.refresh(theme)
    return theme

# --- Product Application Packages ---

@router.post("/packages", response_model=schemas.ProductApplicationPackageResponse, status_code=status.HTTP_201_CREATED, summary="Initialize a Product Package")
def create_product_package(payload: schemas.ProductApplicationPackageCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    db_package = models.ProductApplicationPackage(
        package_id=f"PKG-{uuid.uuid4().hex[:8].upper()}",
        created_at=datetime.datetime.utcnow().isoformat(),
        implementation_status="IN_PROGRESS",
        **payload.dict()
    )
    db.add(db_package)
    db.commit()
    db.refresh(db_package)
    return db_package

@router.get("/packages", response_model=schemas.ProductApplicationPackageListResponse, summary="List Product Packages")
def list_product_packages(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    packages = db.query(models.ProductApplicationPackage).order_by(models.ProductApplicationPackage.created_at.desc()).offset(skip).limit(limit).all()
    return {"packages": packages}

@router.put("/packages/{package_id}/cancel", response_model=schemas.ProductApplicationPackageResponse, summary="Cancel an In-Progress Product Package")
def cancel_product_package(package_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    db_package = db.query(models.ProductApplicationPackage).filter(models.ProductApplicationPackage.package_id == package_id).first()
    if not db_package:
        raise HTTPException(status_code=404, detail="Package not found")
    if db_package.implementation_status != "IN_PROGRESS":
        raise HTTPException(status_code=400, detail="Only IN_PROGRESS packages can be cancelled.")
    
    db_package.implementation_status = "CANCELLED"
    db_package.updated_at = datetime.datetime.utcnow().isoformat()
    db.commit()
    db.refresh(db_package)
    return db_package

@router.put("/packages/{package_id}", response_model=schemas.ProductApplicationPackageResponse, summary="Update a Product Package")
def update_product_package(package_id: str, payload: schemas.ProductApplicationPackageCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    db_package = db.query(models.ProductApplicationPackage).filter(models.ProductApplicationPackage.package_id == package_id).first()
    if not db_package:
        raise HTTPException(status_code=404, detail="Package not found")
    
    db_package.package_name = payload.package_name
    db_package.business_domain = payload.business_domain
    db_package.jurisdiction_country_code = payload.jurisdiction_country_code
    db_package.base_currency_code = payload.base_currency_code
    db_package.use_iso_standards = payload.use_iso_standards
    db_package.description = payload.description
    
    if payload.configuration_plan:
        db_package.configuration_plan = [m.dict() for m in payload.configuration_plan]
        
    db_package.updated_at = datetime.datetime.utcnow().isoformat()
    db.commit()
    db.refresh(db_package)
    return db_package

# --- Product and Subproduct Masters for Screen Designer ---

def _next_product_id(db: Session) -> str:
    """
    WHY THIS EXISTS: Generates a sequential, human-readable Product ID for audit trails.
    Format: PRD-YYYYMM-NNN (e.g., PRD-202606-001). Auditors and ops teams can read
    and sort these — random hex UUIDs cannot be reasoned about in incident reports.
    """
    ym = datetime.datetime.utcnow().strftime("%Y%m")
    prefix = f"PRD-{ym}-"
    count = db.query(models.ProductMaster).filter(models.ProductMaster.product_id.like(f"{prefix}%")).count()
    return f"{prefix}{str(count + 1).zfill(3)}"

def _next_subproduct_id(db: Session, product_id: str) -> str:
    """Sequential Sub-Product ID scoped to the parent product. Format: SP-YYYYMM-NNN."""
    ym = datetime.datetime.utcnow().strftime("%Y%m")
    prefix = f"SP-{ym}-"
    count = db.query(models.SubproductMaster).filter(models.SubproductMaster.subproduct_id.like(f"{prefix}%")).count()
    return f"{prefix}{str(count + 1).zfill(3)}"


@router.get("/products", response_model=schemas.ProductMasterListResponse, summary="List Products",
    description="Returns all products for the given package. Products are the top-level payment product definitions (e.g. SWIFT Wire, SEPA, ACH).")
def list_products(
    package_id: Optional[str] = None,
    product_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    query = db.query(models.ProductMaster)
    if package_id:
        query = query.filter(models.ProductMaster.package_id == package_id)
    if product_type:
        query = query.filter(models.ProductMaster.product_type == product_type.upper())
    if status:
        query = query.filter(models.ProductMaster.status == status.upper())
    return {"products": query.order_by(models.ProductMaster.product_name).all()}


@router.post("/products", response_model=schemas.ProductMasterResponse, status_code=status.HTTP_201_CREATED,
    summary="Create a Product",
    description="Defines a new Payment Product under a Package. Auto-generates a sequential Product ID (PRD-YYYYMM-NNN) immediately on creation.")
def create_product(payload: schemas.ProductMasterCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    package = db.query(models.ProductApplicationPackage).filter(models.ProductApplicationPackage.package_id == payload.package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="Parent package not found.")
    now = datetime.datetime.utcnow().isoformat()
    db_product = models.ProductMaster(
        product_id=_next_product_id(db),
        package_id=payload.package_id,
        product_name=payload.product_name,
        alias=payload.alias,
        product_code=payload.product_code,
        product_type=payload.product_type.upper() if payload.product_type else None,
        description=payload.description,
        owner_user_id=payload.owner_user_id,
        effective_date=payload.effective_date,
        status="DRAFT",
        created_at=now,
        updated_at=now,
        created_by=current_user.id,
    )
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product


@router.patch("/products/{product_id}", response_model=schemas.ProductMasterResponse, summary="Update a Product")
def update_product(product_id: str, payload: schemas.ProductMasterCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    product = db.query(models.ProductMaster).filter(models.ProductMaster.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    for field, value in payload.dict(exclude_unset=True, exclude={"package_id"}).items():
        if field == "product_type" and value:
            value = value.upper()
        setattr(product, field, value)
    product.updated_at = datetime.datetime.utcnow().isoformat()
    db.commit()
    db.refresh(product)
    return product


@router.patch("/products/{product_id}/status", response_model=schemas.ProductMasterResponse, summary="Update Product Status",
    description="Moves a product through DRAFT → ACTIVE → DEPRECATED lifecycle.")
def update_product_status(product_id: str, new_status: str = Query(..., description="DRAFT | ACTIVE | DEPRECATED"),
    db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    product = db.query(models.ProductMaster).filter(models.ProductMaster.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    product.status = new_status.upper()
    product.updated_at = datetime.datetime.utcnow().isoformat()
    db.commit()
    db.refresh(product)
    return product


@router.get("/subproducts", response_model=schemas.SubproductMasterListResponse, summary="List Sub-Products",
    description="Returns sub-products for a given product_id. Sub-products are variations of a product (by geography, segment, channel, currency, or limit band).")
def list_subproducts(
    product_id: Optional[str] = None,
    variation_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    query = db.query(models.SubproductMaster)
    if product_id:
        query = query.filter(models.SubproductMaster.product_id == product_id)
    if variation_type:
        query = query.filter(models.SubproductMaster.variation_type == variation_type.upper())
    if status:
        query = query.filter(models.SubproductMaster.status == status.upper())
    return {"subproducts": query.order_by(models.SubproductMaster.subproduct_name).all()}


@router.post("/subproducts", response_model=schemas.SubproductMasterResponse, status_code=status.HTTP_201_CREATED,
    summary="Create a Sub-Product",
    description="Defines a new Sub-Product variation under a Product. Parent Product ID is required. Auto-generates SP-YYYYMM-NNN ID on creation.")
def create_subproduct(payload: schemas.SubproductMasterCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    product = db.query(models.ProductMaster).filter(models.ProductMaster.product_id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Parent product not found.")
    now = datetime.datetime.utcnow().isoformat()
    db_subproduct = models.SubproductMaster(
        subproduct_id=_next_subproduct_id(db, payload.product_id),
        product_id=payload.product_id,
        subproduct_name=payload.subproduct_name,
        alias=payload.alias,
        subproduct_code=payload.subproduct_code,
        variation_type=payload.variation_type.upper() if payload.variation_type else None,
        description=payload.description,
        status="DRAFT",
        created_at=now,
        updated_at=now,
        created_by=current_user.id,
    )
    db.add(db_subproduct)
    db.commit()
    db.refresh(db_subproduct)
    return db_subproduct


@router.patch("/subproducts/{subproduct_id}", response_model=schemas.SubproductMasterResponse, summary="Update a Sub-Product")
def update_subproduct(subproduct_id: str, payload: schemas.SubproductMasterCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    sp = db.query(models.SubproductMaster).filter(models.SubproductMaster.subproduct_id == subproduct_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Sub-Product not found.")
    for field, value in payload.dict(exclude_unset=True, exclude={"product_id"}).items():
        if field == "variation_type" and value:
            value = value.upper()
        setattr(sp, field, value)
    sp.updated_at = datetime.datetime.utcnow().isoformat()
    db.commit()
    db.refresh(sp)
    return sp


@router.patch("/subproducts/{subproduct_id}/status", response_model=schemas.SubproductMasterResponse, summary="Update Sub-Product Status")
def update_subproduct_status(subproduct_id: str, new_status: str = Query(..., description="DRAFT | ACTIVE | DEPRECATED"),
    db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    sp = db.query(models.SubproductMaster).filter(models.SubproductMaster.subproduct_id == subproduct_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Sub-Product not found.")
    sp.status = new_status.upper()
    sp.updated_at = datetime.datetime.utcnow().isoformat()
    db.commit()
    db.refresh(sp)
    return sp