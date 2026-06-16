from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import datetime

from database import get_db
import models
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/templates",
    tags=["File Template Designer"]
)

@router.post("/", response_model=schemas.TemplateDesignerModelResponse, status_code=status.HTTP_201_CREATED, summary="Create a File Template Blueprint")
def create_template(payload: schemas.TemplateDesignerModelCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Creates a new File Template blueprint. This defines the physical layout or AI extraction strategy 
    for UPLOAD or DOWNLOAD files, completely decoupled from transformation logic.
    """
    existing = db.query(models.TemplateDesignerModel).filter(models.TemplateDesignerModel.template_name == payload.template_name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Template with name '{payload.template_name}' already exists.")

    template_id = f"TPL-{uuid.uuid4().hex[:8].upper()}"
    
    new_template = models.TemplateDesignerModel(
        template_id=template_id,
        template_name=payload.template_name,
        template_type=payload.template_type,
        file_type=payload.file_type,
        extraction_mode=payload.extraction_mode,
        is_multi_sheet=payload.is_multi_sheet,
        file_has_header_footer=payload.file_has_header_footer,
        text_file_type=payload.text_file_type,
        delimiter_record_separator=payload.delimiter_record_separator,
        status="DRAFT",
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id
    )

    for field_payload in payload.fields:
        new_template.fields.append(
            models.TemplateFieldAddressModel(
                address_id=f"TPL-FLD-{uuid.uuid4().hex[:8].upper()}",
                **field_payload.dict()
            )
        )

    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return new_template

@router.get("/", response_model=schemas.TemplateDesignerModelListResponse, summary="List All File Templates")
def list_templates(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a paginated list of all physical File Layout templates. Eager loading automatically fetches nested field definitions.
    """
    templates = db.query(models.TemplateDesignerModel).order_by(models.TemplateDesignerModel.template_name).offset(skip).limit(limit).all()
    return {"templates": templates}

@router.get("/{template_id}", response_model=schemas.TemplateDesignerModelResponse, summary="Get a Specific File Template")
def get_template(template_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    template = db.query(models.TemplateDesignerModel).filter(models.TemplateDesignerModel.template_id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template with ID '{template_id}' not found.")
    return template

@router.put("/{template_id}", response_model=schemas.TemplateDesignerModelResponse, summary="Update a File Template Blueprint")
def update_template(template_id: str, payload: schemas.TemplateDesignerModelCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Atomically updates a File Template and all of its associated physical extraction fields.
    """
    db_template = db.query(models.TemplateDesignerModel).filter(models.TemplateDesignerModel.template_id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Template with ID '{template_id}' not found.")

    # Update scalar fields
    for key, value in payload.dict(exclude={"fields"}).items():
        setattr(db_template, key, value)

    # Clear existing fields and flush to prevent constraint collisions
    db_template.fields.clear()
    db.flush()

    for field_payload in payload.fields:
        db_template.fields.append(
            models.TemplateFieldAddressModel(
                address_id=f"TPL-FLD-{uuid.uuid4().hex[:8].upper()}",
                **field_payload.dict()
            )
        )

    db.commit()
    db.refresh(db_template)
    return db_template

@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a File Template")
def delete_template(template_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    db_template = db.query(models.TemplateDesignerModel).filter(models.TemplateDesignerModel.template_id == template_id).first()
    if db_template:
        db.delete(db_template)
        db.commit()
    return