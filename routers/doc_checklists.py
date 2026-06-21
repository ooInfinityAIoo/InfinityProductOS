# WHY THIS FILE EXISTS (WS-6 — Document Checklist Canvas):
# REST endpoints for Document Checklists — named containers of document
# requirements attached to workflow nodes.
#
# A checklist defines WHAT documents are needed at a step, whether each is
# MANDATORY (blocks workflow) or OPTIONAL (informational), accepted formats,
# and upload instructions shown to the bank operator at runtime.
#
# Lifecycle: DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED (same as all platform entities)
# On LIVE: auto-registers in Entitlement Module (deny-by-default per role)

import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
from database import get_db
from auth import get_current_user, require_designer_privileges, CurrentUser
from routers.entitlements import register_entity

router = APIRouter(prefix="/api/v1/doc-checklists", tags=["Document Checklist Canvas"])


def _serialize_item(i: models.DocumentChecklistItem) -> dict:
    return {
        "item_id": i.item_id,
        "checklist_id": i.checklist_id,
        "document_master_id": i.document_master_id,
        "document_name": i.document_name,
        "is_mandatory": i.is_mandatory,
        "accepted_formats": i.accepted_formats or [],
        "max_file_size_mb": i.max_file_size_mb,
        "upload_instructions": i.upload_instructions,
        "sort_order": i.sort_order,
        "created_at": i.created_at,
    }


def _serialize(c: models.DocumentChecklist, items: list = None) -> dict:
    return {
        "checklist_id": c.checklist_id,
        "checklist_name": c.checklist_name,
        "description": c.description,
        "intended_workflow_step": c.intended_workflow_step,
        "application_package_id": c.application_package_id,
        "version_number": c.version_number,
        "parent_checklist_id": c.parent_checklist_id,
        "status": c.status,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "created_by": c.created_by,
        "made_live_at": c.made_live_at,
        "made_live_by": c.made_live_by,
        "items": [_serialize_item(i) for i in (items or [])],
        "mandatory_count": sum(1 for i in (items or []) if i.is_mandatory),
        "optional_count": sum(1 for i in (items or []) if not i.is_mandatory),
    }


def _get_items(db: Session, checklist_id: str):
    return db.query(models.DocumentChecklistItem).filter(
        models.DocumentChecklistItem.checklist_id == checklist_id
    ).order_by(models.DocumentChecklistItem.sort_order).all()


@router.get("/", summary="List Document Checklists")
def list_checklists(
    package_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    q = db.query(models.DocumentChecklist)
    if package_id:
        q = q.filter(models.DocumentChecklist.application_package_id == package_id)
    if status:
        q = q.filter(models.DocumentChecklist.status == status.upper())
    checklists = q.order_by(models.DocumentChecklist.checklist_name).all()
    return {
        "checklists": [_serialize(c, _get_items(db, c.checklist_id)) for c in checklists],
        "total": len(checklists)
    }


@router.post("/", status_code=201, summary="Create Document Checklist")
def create_checklist(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    now = datetime.now(timezone.utc).isoformat()
    checklist = models.DocumentChecklist(
        checklist_id=f"CHKL-{uuid.uuid4().hex[:10].upper()}",
        checklist_name=payload["checklist_name"],
        description=payload.get("description"),
        intended_workflow_step=payload.get("intended_workflow_step"),
        application_package_id=payload.get("application_package_id"),
        version_number=1,
        status="DRAFT",
        created_at=now,
        created_by=current_user.user_id,
    )
    db.add(checklist)
    db.flush()

    # Create items in one pass
    for idx, item in enumerate(payload.get("items", [])):
        db.add(models.DocumentChecklistItem(
            item_id=f"CHKI-{uuid.uuid4().hex[:10].upper()}",
            checklist_id=checklist.checklist_id,
            document_master_id=item.get("document_master_id"),
            document_name=item["document_name"],
            is_mandatory=item.get("is_mandatory", True),
            accepted_formats=item.get("accepted_formats", ["PDF"]),
            max_file_size_mb=item.get("max_file_size_mb", 10),
            upload_instructions=item.get("upload_instructions"),
            sort_order=item.get("sort_order", idx),
            created_at=now,
        ))
    db.commit()
    db.refresh(checklist)
    return _serialize(checklist, _get_items(db, checklist.checklist_id))


@router.get("/{checklist_id}", summary="Get Checklist with Items")
def get_checklist(
    checklist_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    c = db.query(models.DocumentChecklist).filter(
        models.DocumentChecklist.checklist_id == checklist_id
    ).first()
    if not c:
        raise HTTPException(404, f"Checklist '{checklist_id}' not found.")
    return _serialize(c, _get_items(db, c.checklist_id))


@router.post("/{checklist_id}/items", status_code=201, summary="Add Item to Checklist")
def add_item(
    checklist_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    c = db.query(models.DocumentChecklist).filter(
        models.DocumentChecklist.checklist_id == checklist_id
    ).first()
    if not c:
        raise HTTPException(404, f"Checklist '{checklist_id}' not found.")
    if c.status == "LIVE":
        raise HTTPException(400, "Cannot add items to a LIVE checklist. Create a new version first.")

    existing = _get_items(db, checklist_id)
    item = models.DocumentChecklistItem(
        item_id=f"CHKI-{uuid.uuid4().hex[:10].upper()}",
        checklist_id=checklist_id,
        document_master_id=payload.get("document_master_id"),
        document_name=payload["document_name"],
        is_mandatory=payload.get("is_mandatory", True),
        accepted_formats=payload.get("accepted_formats", ["PDF"]),
        max_file_size_mb=payload.get("max_file_size_mb", 10),
        upload_instructions=payload.get("upload_instructions"),
        sort_order=len(existing),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(item)
    db.commit()
    return _serialize_item(item)


@router.delete("/{checklist_id}/items/{item_id}", status_code=204, summary="Remove Item from Checklist")
def remove_item(
    checklist_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    c = db.query(models.DocumentChecklist).filter(
        models.DocumentChecklist.checklist_id == checklist_id
    ).first()
    if c and c.status == "LIVE":
        raise HTTPException(400, "Cannot remove items from a LIVE checklist. Create a new version first.")
    item = db.query(models.DocumentChecklistItem).filter(
        models.DocumentChecklistItem.item_id == item_id,
        models.DocumentChecklistItem.checklist_id == checklist_id
    ).first()
    if item:
        db.delete(item)
        db.commit()


@router.post("/{checklist_id}/submit", summary="Submit for 4-Eye Approval")
def submit(
    checklist_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    c = db.query(models.DocumentChecklist).filter(
        models.DocumentChecklist.checklist_id == checklist_id
    ).first()
    if not c:
        raise HTTPException(404, f"Checklist '{checklist_id}' not found.")
    if c.status != "DRAFT":
        raise HTTPException(400, f"Only DRAFT checklists can be submitted. Current: {c.status}")
    items = _get_items(db, checklist_id)
    if not items:
        raise HTTPException(400, "Cannot submit an empty checklist. Add at least one document requirement.")
    c.status = "PENDING_APPROVAL"
    c.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {**_serialize(c, items), "_note": "Submitted for 4-Eye approval."}


@router.post("/{checklist_id}/make-live", summary="Make Checklist Live (4-Eye)")
def make_live(
    checklist_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    WHY: A checklist going LIVE means workflow steps will enforce its document
    requirements in production. A wrong mandatory item could block an entire
    payment processing team. Second approver required.
    Archives any currently LIVE version of same checklist name.
    Auto-registers in Entitlement Module on LIVE.
    """
    c = db.query(models.DocumentChecklist).filter(
        models.DocumentChecklist.checklist_id == checklist_id
    ).first()
    if not c:
        raise HTTPException(404, f"Checklist '{checklist_id}' not found.")
    if c.status != "PENDING_APPROVAL":
        raise HTTPException(400, f"Only PENDING_APPROVAL checklists can go live. Current: {c.status}")
    if c.created_by == current_user.user_id:
        raise HTTPException(403, "4-Eye violation: approver cannot be the same as the creator.")

    now = datetime.now(timezone.utc).isoformat()

    # Archive sibling LIVE versions
    siblings = db.query(models.DocumentChecklist).filter(
        models.DocumentChecklist.status == "LIVE",
        models.DocumentChecklist.checklist_name == c.checklist_name,
        models.DocumentChecklist.checklist_id != checklist_id
    ).all()
    for s in siblings:
        s.status = "ARCHIVED"
        s.updated_at = now

    c.status = "LIVE"
    c.made_live_at = now
    c.made_live_by = current_user.user_id
    c.updated_at = now
    db.commit()

    register_entity(
        db, "DOC_CHECKLIST", c.checklist_id,
        c.checklist_name, c.application_package_id, current_user.user_id
    )

    items = _get_items(db, checklist_id)
    return {**_serialize(c, items), "_note": "Checklist is now LIVE. Registered in Entitlement Module."}
