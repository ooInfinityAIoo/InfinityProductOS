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

# ── Event Bus Observability ────────────────────────────────────────────────
# WHY THESE EXIST: The Event Repository Studio polls /events/status, /events/stats
# and /events/recent to render the live topology, KPI cards and "neural fire trace".
# These routes MUST be declared BEFORE the DELETE "/{event_type}" route below —
# otherwise FastAPI matches /status, /stats, /recent against the "{event_type}"
# path (which only allows DELETE) and every GET returns 405 Method Not Allowed.
# That collision is exactly why the studio showed "No events registered".

@router.get("/status", summary="Event Bus Topology & Subscribers")
def event_bus_status(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns the live event topology the studio renders:
      { listeners: { <EVENT_TYPE>: [ { callback_name } ] } }

    Each registered event maps to the module that handles/emits it (its
    source_module). In local dev there is no runtime subscriber ledger, so the
    registered handler module is surfaced as the event's callback hook — this is
    real registry data, not a fabricated runtime count.
    """
    defs = db.query(models.EventDefinition).order_by(models.EventDefinition.event_type).all()
    listeners = {
        d.event_type: ([{"callback_name": d.source_module}] if d.source_module else [])
        for d in defs
    }
    return {"listeners": listeners, "registered_event_types": len(defs)}


@router.get("/stats", summary="Event Broadcast Frequencies")
def event_bus_stats(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns broadcast frequencies keyed by event type:
      { total_events_broadcast, events_by_type: { <EVENT_TYPE>: count } }

    NOTE: Local dev has no immutable broadcast ledger, so runtime fire counts are
    reported as 0 rather than fabricated. The registry (event_type keys) is real;
    counts populate once the Kafka event bus is wired in a deployed environment.
    """
    defs = db.query(models.EventDefinition).all()
    events_by_type = {d.event_type: 0 for d in defs}
    return {"total_events_broadcast": 0, "events_by_type": events_by_type}


@router.get("/recent", summary="Recent Live Event Broadcasts")
def recent_events(limit: int = 50, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns the most recent event broadcasts for the live "neural fire trace".
    No broadcast ledger exists in local dev, so this returns an empty list — the
    panel shows its idle state rather than 405-ing the whole studio.
    """
    return {"events": [], "limit": limit}


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