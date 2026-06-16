from fastapi import APIRouter, Depends, HTTPException, status
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

# --- Product and Subproduct Masters for Screen Designer ---

@router.get("/products", response_model=schemas.ProductMasterListResponse, summary="List All Products")
def list_products(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """Retrieves a list of all products for context selection."""
    products = db.query(models.ProductMaster).order_by(models.ProductMaster.product_name).all()
    return {"products": products}

@router.get("/subproducts", response_model=schemas.SubproductMasterListResponse, summary="List Subproducts for a Product")
def list_subproducts(product_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """Retrieves a list of subproducts filtered by a specific product_id."""
    subproducts = db.query(models.SubproductMaster).filter(
        models.SubproductMaster.product_id == product_id
    ).order_by(models.SubproductMaster.subproduct_name).all()
    return {"subproducts": subproducts}

```