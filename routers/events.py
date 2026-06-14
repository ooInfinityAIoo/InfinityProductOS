from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import datetime

from database import get_db
import models
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/events",
    tags=["Event Repository"]
)

@router.post("/", response_model=schemas.EventDefinitionResponse, status_code=status.HTTP_201_CREATED, summary="Create an Event Definition")
def create_event_definition(payload: schemas.EventDefinitionCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Registers a new discoverable business event in the Event Repository.
    """
    existing = db.query(models.EventDefinition).filter(models.EventDefinition.event_type == payload.event_type).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Event type '{payload.event_type}' already exists.")

    new_event_def = models.EventDefinition(
        created_at=datetime.datetime.utcnow().isoformat(),
        **payload.dict()
    )
    db.add(new_event_def)
    db.commit()
    db.refresh(new_event_def)
    return new_event_def

@router.get("/", response_model=List[schemas.EventDefinitionResponse], summary="List All Event Definitions")
def list_event_definitions(skip: int = 0, limit: int = 200, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all discoverable business events in the system.
    """
    events = db.query(models.EventDefinition).order_by(models.EventDefinition.event_type).offset(skip).limit(limit).all()
    return events

@router.delete("/{event_type}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an Event Definition")
def delete_event_definition(event_type: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Deletes an event definition from the repository.
    """
    event_def = db.query(models.EventDefinition).filter(models.EventDefinition.event_type == event_type).first()
    if not event_def:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event type '{event_type}' not found."
        )
    
    db.delete(event_def)
    db.commit()
    return