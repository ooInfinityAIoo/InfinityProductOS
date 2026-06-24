# WHY THIS FILE EXISTS:
# Batch Gateway Designer router — CRUD for BatchGatewayConfiguration records.
# These define scheduled/file-based integration jobs: inbound SFTP file pulls,
# outbound BACS/SEPA bulk payment file generation, S3 batch feeds, MQ consumers.
#
# Complements routers/integrations.py (real-time API Gateway) with the async
# bulk data movement pattern. Both use the same direction/scope quadrant model:
#   direction: INBOUND | OUTBOUND
#   scope:     INTERNAL | EXTERNAL
#
# WHAT BREAKS IF REMOVED:
# Batch Gateway Designer has no persistence. All batch job definitions would be lost.

import uuid
import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from auth import get_current_user, CurrentUser, require_designer_privileges

router = APIRouter(prefix="/api/v1/batch-gateway", tags=["Batch Gateway Designer"])


@router.get(
    "/",
    response_model=schemas.BatchGatewayConfigListResponse,
    summary="List Batch Gateway Configurations",
    description="Returns all batch job configurations, optionally filtered by direction, scope, or package."
)
def list_batch_configs(
    direction: Optional[str] = Query(None, description="INBOUND | OUTBOUND"),
    scope: Optional[str] = Query(None, description="INTERNAL | EXTERNAL"),
    status: Optional[str] = Query(None),
    package_id: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(models.BatchGatewayConfiguration)
    if direction:
        q = q.filter(models.BatchGatewayConfiguration.direction == direction.upper())
    if scope:
        q = q.filter(models.BatchGatewayConfiguration.scope == scope.upper())
    if status:
        q = q.filter(models.BatchGatewayConfiguration.status == status.upper())
    if package_id:
        q = q.filter(models.BatchGatewayConfiguration.application_package_id == package_id)
    configs = q.offset(skip).limit(limit).all()
    return {"configurations": configs}


@router.post(
    "/",
    response_model=schemas.BatchGatewayConfigResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Batch Gateway Configuration",
    description="Defines a new scheduled/file-based integration job. Starts in DRAFT lifecycle."
)
def create_batch_config(
    payload: schemas.BatchGatewayConfigCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    now = datetime.datetime.utcnow().isoformat()
    config = models.BatchGatewayConfiguration(
        config_id=str(uuid.uuid4()),
        created_at=now,
        updated_at=now,
        created_by=current_user.id,
        status="DRAFT",
        **payload.dict(),
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.get(
    "/{config_id}",
    response_model=schemas.BatchGatewayConfigResponse,
    summary="Get Batch Gateway Configuration"
)
def get_batch_config(
    config_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    config = db.query(models.BatchGatewayConfiguration).filter(
        models.BatchGatewayConfiguration.config_id == config_id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Batch gateway configuration not found.")
    return config


@router.patch(
    "/{config_id}",
    response_model=schemas.BatchGatewayConfigResponse,
    summary="Update Batch Gateway Configuration"
)
def update_batch_config(
    config_id: str,
    payload: schemas.BatchGatewayConfigCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    config = db.query(models.BatchGatewayConfiguration).filter(
        models.BatchGatewayConfiguration.config_id == config_id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Batch gateway configuration not found.")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(config, field, value)
    config.updated_at = datetime.datetime.utcnow().isoformat()
    config.updated_by = current_user.id
    db.commit()
    db.refresh(config)
    return config


@router.patch(
    "/{config_id}/status",
    response_model=schemas.BatchGatewayConfigResponse,
    summary="Update Batch Config Lifecycle Status",
    description="Moves a batch config through DRAFT → PENDING_APPROVAL → LIVE → DISABLED. 4-Eye: approver must differ from creator."
)
def update_batch_status(
    config_id: str,
    new_status: str = Query(..., description="DRAFT | PENDING_APPROVAL | LIVE | DISABLED"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    config = db.query(models.BatchGatewayConfiguration).filter(
        models.BatchGatewayConfiguration.config_id == config_id
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Batch gateway configuration not found.")
    # Layer 6 Guardrail: 4-Eye — cannot approve your own batch config
    if new_status == "LIVE" and config.created_by == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="4-Eye policy violation: the creator cannot approve their own batch gateway configuration."
        )
    config.status = new_status.upper()
    config.updated_at = datetime.datetime.utcnow().isoformat()
    config.updated_by = current_user.id
    db.commit()
    db.refresh(config)
    return config
