from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid
import datetime

from database import get_db
import models
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/documents",
    tags=["Common Core Masters"]
)

@router.post("/", response_model=schemas.DocumentMasterResponse, status_code=status.HTTP_201_CREATED, summary="Register a Document Type")
def create_document_master(payload: schemas.DocumentMasterCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    existing = db.query(models.DocumentMaster).filter(models.DocumentMaster.document_name == payload.document_name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Document '{payload.document_name}' already exists.")

    new_doc = models.DocumentMaster(
        document_id=f"DOC-{uuid.uuid4().hex[:8].upper()}",
        document_name=payload.document_name,
        document_format=payload.document_format,
        description=payload.description,
        default_mapper_id=payload.default_mapper_id,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc

@router.get("/", response_model=List[schemas.DocumentMasterResponse], summary="List Document Types")
def list_document_masters(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    docs = db.query(models.DocumentMaster).order_by(models.DocumentMaster.document_name).all()
    return docs

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Document Type")
def delete_document_master(document_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    doc = db.query(models.DocumentMaster).filter(models.DocumentMaster.document_id == document_id).first()
    if doc:
        db.delete(doc)
        db.commit()
    return