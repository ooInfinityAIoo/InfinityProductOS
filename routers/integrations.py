from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import datetime

import models
from database import get_db
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/integrations",
    tags=["API Integrations"]
)

# --- RBAC Dependencies ---

# --- CRUD Endpoints ---

@router.post("/", response_model=schemas.ApiConfigurationResponse, status_code=status.HTTP_201_CREATED, summary="Create an API Integration")
def create_api_integration(payload: schemas.ApiConfigurationCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    existing = db.query(models.ApiConfiguration).filter(models.ApiConfiguration.api_name == payload.api_name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"API integration with name '{payload.api_name}' already exists.")

    new_api = models.ApiConfiguration(
        api_id=f"API-{uuid.uuid4().hex[:8].upper()}",
        created_by=current_user.id,
        created_at=datetime.datetime.utcnow().isoformat(),
        **payload.dict()
    )
    db.add(new_api)
    db.commit()
    db.refresh(new_api)
    return new_api

@router.get("/", response_model=schemas.ApiConfigurationListResponse, summary="List All API Integrations")
def list_api_integrations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    integrations = db.query(models.ApiConfiguration).order_by(models.ApiConfiguration.api_name).offset(skip).limit(limit).all()
    return {"integrations": integrations}

@router.get("/{api_id}", response_model=schemas.ApiConfigurationResponse, summary="Get a Specific API Integration")
def get_api_integration(api_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    api_config = db.query(models.ApiConfiguration).filter(models.ApiConfiguration.api_id == api_id).first()
    if not api_config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"API integration with ID '{api_id}' not found.")
    return api_config

@router.put("/{api_id}", response_model=schemas.ApiConfigurationResponse, summary="Update an API Integration")
def update_api_integration(api_id: str, payload: schemas.ApiConfigurationCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    db_api = db.query(models.ApiConfiguration).filter(models.ApiConfiguration.api_id == api_id).first()
    if not db_api:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"API integration with ID '{api_id}' not found.")

    if payload.api_name != db_api.api_name:
        existing = db.query(models.ApiConfiguration).filter(models.ApiConfiguration.api_name == payload.api_name).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"API integration with name '{payload.api_name}' already exists.")

    for key, value in payload.dict().items():
        setattr(db_api, key, value)
    
    db_api.updated_at = datetime.datetime.utcnow().isoformat()
    db_api.updated_by = current_user.id
    
    db.commit()
    db.refresh(db_api)
    return db_api

@router.delete("/{api_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an API Integration")
def delete_api_integration(api_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    db_api = db.query(models.ApiConfiguration).filter(models.ApiConfiguration.api_id == api_id).first()
    if db_api:
        db.delete(db_api)
        db.commit()
    return