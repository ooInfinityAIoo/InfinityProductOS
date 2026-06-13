from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import datetime

from database import get_db 
import models
import schemas

router = APIRouter(
    prefix="/api/v1/fields/registry",
    tags=["Field Registry"]
)

@router.post("/", response_model=schemas.ISOFieldDefinitionResponse, status_code=status.HTTP_201_CREATED, summary="Register a New ISO Field")
def register_iso_field(payload: schemas.ISOFieldDefinitionCreate, db: Session = Depends(get_db)):
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
    
    new_field = models.ISOFieldDefinition(
        field_id=field_id,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by="API_USER",
        **payload.dict()
    )
    
    db.add(new_field)
    db.commit()
    db.refresh(new_field)
    return new_field

@router.get("/", response_model=schemas.ISOFieldDefinitionListResponse, summary="List and Filter ISO Fields")
def list_iso_fields(filters: schemas.FieldRegistryFilterParams = Depends(), db: Session = Depends(get_db)):
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

    fields = query.offset(filters.skip).limit(filters.limit).all()
    return {"fields": fields}

@router.get("/{field_id}", response_model=schemas.ISOFieldDefinitionResponse, summary="Get a Specific ISO Field")
def get_iso_field(field_id: str, db: Session = Depends(get_db)):
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
def update_iso_field(field_id: str, payload: schemas.ISOFieldDefinitionCreate, db: Session = Depends(get_db)):
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

@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an ISO Field")
def delete_iso_field(field_id: str, db: Session = Depends(get_db)):
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