# WHY THIS FILE EXISTS:
# REST endpoints for managing WorkflowParticipants — the swim-lane band entities
# that group nodes by role (e.g. "Debtor Bank", "RTP Network", "AML Team").
#
# A participant belongs to exactly one workflow. CRUD is workflow-scoped:
#   GET    /workflows/{workflow_id}/participants      → list all bands for a workflow
#   POST   /workflows/{workflow_id}/participants      → create a new band
#   PATCH  /workflows/{workflow_id}/participants/{id} → rename / recolor / reorder
#   DELETE /workflows/{workflow_id}/participants/{id} → delete band (nodes SET NULL, not deleted)
#
# Node assignment happens via PATCH /workflows/{wf}/nodes/{node} (existing router),
# which already accepts participant_id in the payload because WorkflowNodeCreate now
# includes the field and the router does **node_payload.dict() onto the ORM object.

from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from models import WorkflowParticipant, WorkflowConfiguration
from schemas import (
    WorkflowParticipantCreate,
    WorkflowParticipantResponse,
    WorkflowParticipantListResponse,
)

import uuid

router = APIRouter(
    prefix="/api/v1/workflows/{workflow_id}/participants",
    tags=["Workflow Participants"],
)


def _get_workflow_or_404(workflow_id: str, db: Session) -> WorkflowConfiguration:
    """Raise 404 if the parent workflow does not exist."""
    wf = db.query(WorkflowConfiguration).filter(
        WorkflowConfiguration.workflow_id == workflow_id
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    return wf


@router.get(
    "/",
    response_model=WorkflowParticipantListResponse,
    summary="List swim-lane participants for a workflow",
    description=(
        "Returns all participants (swim-lane bands) defined for a workflow, "
        "ordered by sort_order ascending. Each participant can be assigned to "
        "one or more nodes via the node properties panel."
    ),
)
def list_participants(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _get_workflow_or_404(workflow_id, db)
    rows = (
        db.query(WorkflowParticipant)
        .filter(WorkflowParticipant.workflow_id == workflow_id)
        .order_by(WorkflowParticipant.sort_order)
        .all()
    )
    return {"participants": rows}


@router.post(
    "/",
    response_model=WorkflowParticipantResponse,
    status_code=201,
    summary="Create a swim-lane participant",
    description=(
        "Adds a new swim-lane band to a workflow. Typical participants in a SWIFT "
        "pacs.008 flow: 'Ordering Bank', 'Correspondent Bank', 'Beneficiary Bank'. "
        "Color is a hex string rendered as the band header background."
    ),
)
def create_participant(
    workflow_id: str,
    payload: WorkflowParticipantCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _get_workflow_or_404(workflow_id, db)
    now = datetime.now(timezone.utc).isoformat()
    participant = WorkflowParticipant(
        participant_id=f"PART-{uuid.uuid4().hex[:12].upper()}",
        workflow_id=workflow_id,
        name=payload.name,
        role=payload.role,
        color=payload.color,
        sort_order=payload.sort_order,
        created_at=now,
        updated_at=now,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


@router.patch(
    "/{participant_id}",
    response_model=WorkflowParticipantResponse,
    summary="Update a swim-lane participant",
    description="Rename, recolor, or reorder a swim-lane band. Only provided fields are updated.",
)
def update_participant(
    workflow_id: str,
    participant_id: str,
    payload: WorkflowParticipantCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    participant = (
        db.query(WorkflowParticipant)
        .filter(
            WorkflowParticipant.participant_id == participant_id,
            WorkflowParticipant.workflow_id == workflow_id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=404, detail=f"Participant '{participant_id}' not found in workflow '{workflow_id}'")

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(participant, field, value)
    participant.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(participant)
    return participant


@router.delete(
    "/{participant_id}",
    status_code=204,
    summary="Delete a swim-lane participant",
    description=(
        "Removes a swim-lane band. Nodes that were assigned to this participant "
        "have their participant_id set to NULL (they remain in the workflow, "
        "just unassigned). No nodes are deleted."
    ),
)
def delete_participant(
    workflow_id: str,
    participant_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    participant = (
        db.query(WorkflowParticipant)
        .filter(
            WorkflowParticipant.participant_id == participant_id,
            WorkflowParticipant.workflow_id == workflow_id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=404, detail=f"Participant '{participant_id}' not found")
    db.delete(participant)
    db.commit()
    return None
