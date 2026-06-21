# WHY THIS FILE EXISTS (WS-5 — Document Template Designer):
# REST endpoints for Communication Templates — EMAIL, LETTER (PDF), SMS.
# Templates are designed in the Document Template Designer studio and attached
# to workflow nodes. The Notification Engine reads them at runtime, substitutes
# ISO field placeholders with live transaction values, and dispatches the message.
#
# Full lifecycle: DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED
# Versioned: editing a LIVE template creates a new version; old stays live until new approved.
# 4-Eye: promoting to LIVE requires a second approver (not the creator).

import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

import models
from database import get_db
from auth import get_current_user, require_designer_privileges, CurrentUser
from routers.entitlements import register_entity

router = APIRouter(prefix="/api/v1/comm-templates", tags=["Document Template Designer"])

VALID_TYPES = {"EMAIL", "LETTER", "SMS"}
VALID_STATUSES = {"DRAFT", "PENDING_APPROVAL", "LIVE", "ARCHIVED"}


def _serialize(t: models.CommunicationTemplate) -> dict:
    return {
        "template_id": t.template_id,
        "template_name": t.template_name,
        "description": t.description,
        "template_type": t.template_type,
        "subject_line": t.subject_line,
        "body_content": t.body_content,
        "referenced_iso_fields": t.referenced_iso_fields or [],
        "version_number": t.version_number,
        "parent_template_id": t.parent_template_id,
        "status": t.status,
        "application_package_id": t.application_package_id,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
        "created_by": t.created_by,
        "made_live_at": t.made_live_at,
        "made_live_by": t.made_live_by,
    }


@router.get(
    "/",
    summary="List Communication Templates",
    description="List all templates, optionally filtered by type, status, or package."
)
def list_templates(
    template_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    package_id: Optional[str] = Query(None),
    live_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    q = db.query(models.CommunicationTemplate)
    if template_type:
        q = q.filter(models.CommunicationTemplate.template_type == template_type.upper())
    if status:
        q = q.filter(models.CommunicationTemplate.status == status.upper())
    if live_only:
        q = q.filter(models.CommunicationTemplate.status == "LIVE")
    if package_id:
        q = q.filter(models.CommunicationTemplate.application_package_id == package_id)
    templates = q.order_by(models.CommunicationTemplate.template_name).all()
    return {"templates": [_serialize(t) for t in templates], "total": len(templates)}


@router.post(
    "/",
    status_code=201,
    summary="Create Communication Template",
    description="Create a new EMAIL, LETTER, or SMS template in DRAFT state. Use {{ISO.FieldName}} placeholders in subject_line and body_content."
)
def create_template(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    t_type = payload.get("template_type", "").upper()
    if t_type not in VALID_TYPES:
        raise HTTPException(400, f"template_type must be one of {VALID_TYPES}")
    if not payload.get("body_content", "").strip():
        raise HTTPException(400, "body_content is required")
    if t_type == "EMAIL" and not payload.get("subject_line", "").strip():
        raise HTTPException(400, "subject_line is required for EMAIL templates")

    now = datetime.now(timezone.utc).isoformat()
    tmpl = models.CommunicationTemplate(
        template_id=f"CTMPL-{uuid.uuid4().hex[:10].upper()}",
        template_name=payload["template_name"],
        description=payload.get("description"),
        template_type=t_type,
        subject_line=payload.get("subject_line"),
        body_content=payload["body_content"],
        referenced_iso_fields=payload.get("referenced_iso_fields", []),
        version_number=1,
        parent_template_id=None,
        status="DRAFT",
        application_package_id=payload.get("application_package_id"),
        created_at=now,
        created_by=current_user.user_id,
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return _serialize(tmpl)


@router.get("/{template_id}", summary="Get Template")
def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    tmpl = db.query(models.CommunicationTemplate).filter(
        models.CommunicationTemplate.template_id == template_id
    ).first()
    if not tmpl:
        raise HTTPException(404, f"Template '{template_id}' not found.")
    return _serialize(tmpl)


@router.put("/{template_id}", summary="Update Template (DRAFT only)")
def update_template(
    template_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    WHY: Only DRAFT templates can be directly edited. If the template is LIVE,
    this endpoint creates a new version (v+1) and returns that instead,
    leaving the current LIVE version untouched until the new one is approved.
    """
    tmpl = db.query(models.CommunicationTemplate).filter(
        models.CommunicationTemplate.template_id == template_id
    ).first()
    if not tmpl:
        raise HTTPException(404, f"Template '{template_id}' not found.")

    if tmpl.status == "LIVE":
        # Create a new version — do not touch the live one
        now = datetime.now(timezone.utc).isoformat()
        origin_id = tmpl.parent_template_id or tmpl.template_id
        new_version = models.CommunicationTemplate(
            template_id=f"CTMPL-{uuid.uuid4().hex[:10].upper()}",
            template_name=tmpl.template_name,
            description=payload.get("description", tmpl.description),
            template_type=tmpl.template_type,
            subject_line=payload.get("subject_line", tmpl.subject_line),
            body_content=payload.get("body_content", tmpl.body_content),
            referenced_iso_fields=payload.get("referenced_iso_fields", tmpl.referenced_iso_fields),
            version_number=tmpl.version_number + 1,
            parent_template_id=origin_id,
            status="DRAFT",
            application_package_id=tmpl.application_package_id,
            created_at=now,
            created_by=current_user.user_id,
        )
        db.add(new_version)
        db.commit()
        db.refresh(new_version)
        return {**_serialize(new_version), "_note": "LIVE template unchanged. New draft version created."}

    # DRAFT or PENDING_APPROVAL — direct edit allowed
    tmpl.template_name = payload.get("template_name", tmpl.template_name)
    tmpl.description = payload.get("description", tmpl.description)
    tmpl.subject_line = payload.get("subject_line", tmpl.subject_line)
    tmpl.body_content = payload.get("body_content", tmpl.body_content)
    tmpl.referenced_iso_fields = payload.get("referenced_iso_fields", tmpl.referenced_iso_fields)
    tmpl.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return _serialize(tmpl)


@router.post(
    "/{template_id}/submit",
    summary="Submit for 4-Eye Approval",
    description="Move a DRAFT template to PENDING_APPROVAL. Creator cannot approve their own template."
)
def submit_for_approval(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    tmpl = db.query(models.CommunicationTemplate).filter(
        models.CommunicationTemplate.template_id == template_id
    ).first()
    if not tmpl:
        raise HTTPException(404, f"Template '{template_id}' not found.")
    if tmpl.status != "DRAFT":
        raise HTTPException(400, f"Only DRAFT templates can be submitted. Current status: {tmpl.status}")
    tmpl.status = "PENDING_APPROVAL"
    tmpl.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {**_serialize(tmpl), "_note": "Submitted for 4-Eye approval."}


@router.post(
    "/{template_id}/make-live",
    summary="Make Template Live (4-Eye approval)",
    description="Promote a PENDING_APPROVAL template to LIVE. The approver must be different from the creator. Auto-registers in Entitlement Module."
)
def make_live(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    WHY: Going LIVE is a governance action. A wrong email template could send
    incorrect information to bank customers at scale. Second approver required.
    On LIVE: auto-registers in Entitlement Module (deny-by-default per role).
    Any previously LIVE version of this template is ARCHIVED.
    """
    tmpl = db.query(models.CommunicationTemplate).filter(
        models.CommunicationTemplate.template_id == template_id
    ).first()
    if not tmpl:
        raise HTTPException(404, f"Template '{template_id}' not found.")
    if tmpl.status != "PENDING_APPROVAL":
        raise HTTPException(400, f"Only PENDING_APPROVAL templates can go live. Current: {tmpl.status}")
    if tmpl.created_by == current_user.user_id:
        raise HTTPException(403, "4-Eye violation: approver cannot be the same as the creator.")

    now = datetime.now(timezone.utc).isoformat()

    # Archive any currently LIVE version of the same template lineage
    origin_id = tmpl.parent_template_id or tmpl.template_id
    siblings = db.query(models.CommunicationTemplate).filter(
        models.CommunicationTemplate.status == "LIVE",
        models.CommunicationTemplate.template_name == tmpl.template_name,
        models.CommunicationTemplate.template_id != template_id
    ).all()
    for sib in siblings:
        sib.status = "ARCHIVED"
        sib.updated_at = now

    # Promote to LIVE
    tmpl.status = "LIVE"
    tmpl.made_live_at = now
    tmpl.made_live_by = current_user.user_id
    tmpl.updated_at = now
    db.commit()

    # Auto-register in Entitlement Module
    register_entity(
        db, "COMM_TEMPLATE", tmpl.template_id,
        f"{tmpl.template_type}: {tmpl.template_name}",
        tmpl.application_package_id,
        current_user.user_id
    )

    return {**_serialize(tmpl), "_note": "Template is now LIVE. Registered in Entitlement Module."}


@router.get(
    "/{template_id}/versions",
    summary="Get All Versions of a Template"
)
def get_versions(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    tmpl = db.query(models.CommunicationTemplate).filter(
        models.CommunicationTemplate.template_id == template_id
    ).first()
    if not tmpl:
        raise HTTPException(404, f"Template '{template_id}' not found.")

    origin_id = tmpl.parent_template_id or tmpl.template_id
    versions = db.query(models.CommunicationTemplate).filter(
        (models.CommunicationTemplate.template_id == origin_id) |
        (models.CommunicationTemplate.parent_template_id == origin_id)
    ).order_by(models.CommunicationTemplate.version_number.desc()).all()
    return {"versions": [_serialize(v) for v in versions], "total": len(versions)}
