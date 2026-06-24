# WHY THIS FILE EXISTS (WS-7 — Notification Engine):
# REST endpoints for Notification Policies — versioned containers of notification
# triggers that attach to workflow nodes.
#
# A policy holds one or more triggers. Each trigger says:
#   "When this workflow node executes, send [template] to [recipient] via [channel]."
#
# SMS_WAIT triggers cause the Workflow Executor to PAUSE and wait for a customer reply.
# Timeout/escalation logic is NOT here — that belongs to the workflow graph (ADR #3).
#
# Recipient modes:
#   ROLE_BASED  → bank staff (RISK, OPS, ADMIN etc.)
#   ISO_FIELD   → end customer via transaction data (BeneficiaryPhone, OriginatorEmail)
#   STATIC      → external partners with fixed addresses
#
# Full lifecycle: DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED
# 4-Eye on make-live. Auto-registers in Entitlement Module on go-live.

import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
from database import get_db
from auth import get_current_user, require_designer_privileges, CurrentUser
from routers.entitlements import register_entity

router = APIRouter(prefix="/api/v1/notification-policies", tags=["Notification Engine"])

VALID_NOTIFICATION_TYPES = {"EMAIL", "SMS_WAIT", "LETTER"}
VALID_RECIPIENT_MODES = {"ROLE_BASED", "ISO_FIELD", "STATIC"}


def _serialize_trigger(t: models.NotificationTrigger) -> dict:
    return {
        "trigger_id": t.trigger_id,
        "policy_id": t.policy_id,
        "trigger_name": t.trigger_name,
        "comm_template_id": t.comm_template_id,
        "notification_type": t.notification_type,
        "recipient_mode": t.recipient_mode,
        "recipient_role": t.recipient_role,
        "recipient_iso_field": t.recipient_iso_field,
        "recipient_static": t.recipient_static,
        "audience_label": t.audience_label,
        "wait_for_reply": t.wait_for_reply,
        "timeout_minutes": t.timeout_minutes,
        "sort_order": t.sort_order,
        "created_at": t.created_at,
    }


def _get_triggers(db: Session, policy_id: str) -> list:
    return db.query(models.NotificationTrigger).filter(
        models.NotificationTrigger.policy_id == policy_id
    ).order_by(models.NotificationTrigger.sort_order).all()


def _serialize(p: models.NotificationPolicy, triggers: list = None) -> dict:
    triggers = triggers or []
    sms_wait_count = sum(1 for t in triggers if t.notification_type == "SMS_WAIT")
    return {
        "policy_id": p.policy_id,
        "policy_name": p.policy_name,
        "description": p.description,
        "application_package_id": p.application_package_id,
        "version_number": p.version_number,
        "parent_policy_id": p.parent_policy_id,
        "status": p.status,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
        "created_by": p.created_by,
        "made_live_at": p.made_live_at,
        "made_live_by": p.made_live_by,
        "triggers": [_serialize_trigger(t) for t in triggers],
        "trigger_count": len(triggers),
        "sms_wait_count": sms_wait_count,
    }


@router.get("/", summary="List Notification Policies")
def list_policies(
    package_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Returns all notification policies, optionally filtered by package and status.
    Each policy includes its full trigger list with recipient and wait configuration.
    """
    q = db.query(models.NotificationPolicy)
    if package_id:
        q = q.filter(models.NotificationPolicy.application_package_id == package_id)
    if status:
        q = q.filter(models.NotificationPolicy.status == status.upper())
    policies = q.order_by(models.NotificationPolicy.policy_name).all()
    return {
        "policies": [_serialize(p, _get_triggers(db, p.policy_id)) for p in policies],
        "total": len(policies)
    }


@router.post("/", status_code=201, summary="Create Notification Policy")
def create_policy(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    now = datetime.now(timezone.utc).isoformat()
    policy = models.NotificationPolicy(
        policy_id=f"NP-{uuid.uuid4().hex[:10].upper()}",
        policy_name=payload["policy_name"],
        description=payload.get("description"),
        application_package_id=payload.get("application_package_id"),
        version_number=1,
        status="DRAFT",
        created_at=now,
        created_by=current_user.id,
    )
    db.add(policy)
    db.flush()

    for idx, t in enumerate(payload.get("triggers", [])):
        _validate_trigger(t)
        db.add(models.NotificationTrigger(
            trigger_id=f"NT-{uuid.uuid4().hex[:10].upper()}",
            policy_id=policy.policy_id,
            trigger_name=t["trigger_name"],
            comm_template_id=t.get("comm_template_id"),
            notification_type=t["notification_type"].upper(),
            recipient_mode=t["recipient_mode"].upper(),
            recipient_role=t.get("recipient_role"),
            recipient_iso_field=t.get("recipient_iso_field"),
            recipient_static=t.get("recipient_static"),
            audience_label=t.get("audience_label"),
            wait_for_reply=t.get("wait_for_reply", False),
            timeout_minutes=t.get("timeout_minutes"),
            sort_order=t.get("sort_order", idx),
            created_at=now,
        ))
    db.commit()
    db.refresh(policy)
    return _serialize(policy, _get_triggers(db, policy.policy_id))


@router.get("/{policy_id}", summary="Get Policy with Triggers")
def get_policy(
    policy_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    p = db.query(models.NotificationPolicy).filter(
        models.NotificationPolicy.policy_id == policy_id
    ).first()
    if not p:
        raise HTTPException(404, f"Policy '{policy_id}' not found.")
    return _serialize(p, _get_triggers(db, p.policy_id))


@router.post("/{policy_id}/triggers", status_code=201, summary="Add Trigger to Policy")
def add_trigger(
    policy_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    WHY: Adds a single notification trigger to an existing DRAFT policy.
    Cannot add triggers to a LIVE policy — create a new version instead.
    Each trigger specifies channel (EMAIL/SMS_WAIT/LETTER), recipient, and wait config.
    """
    p = db.query(models.NotificationPolicy).filter(
        models.NotificationPolicy.policy_id == policy_id
    ).first()
    if not p:
        raise HTTPException(404, f"Policy '{policy_id}' not found.")
    if p.status == "LIVE":
        raise HTTPException(400, "Cannot add triggers to a LIVE policy. Create a new version first.")

    _validate_trigger(payload)
    existing = _get_triggers(db, policy_id)
    trigger = models.NotificationTrigger(
        trigger_id=f"NT-{uuid.uuid4().hex[:10].upper()}",
        policy_id=policy_id,
        trigger_name=payload["trigger_name"],
        comm_template_id=payload.get("comm_template_id"),
        notification_type=payload["notification_type"].upper(),
        recipient_mode=payload["recipient_mode"].upper(),
        recipient_role=payload.get("recipient_role"),
        recipient_iso_field=payload.get("recipient_iso_field"),
        recipient_static=payload.get("recipient_static"),
        audience_label=payload.get("audience_label"),
        wait_for_reply=payload.get("wait_for_reply", False),
        timeout_minutes=payload.get("timeout_minutes"),
        sort_order=len(existing),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(trigger)
    db.commit()
    return _serialize_trigger(trigger)


@router.delete("/{policy_id}/triggers/{trigger_id}", status_code=204, summary="Remove Trigger from Policy")
def remove_trigger(
    policy_id: str,
    trigger_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    p = db.query(models.NotificationPolicy).filter(
        models.NotificationPolicy.policy_id == policy_id
    ).first()
    if p and p.status == "LIVE":
        raise HTTPException(400, "Cannot remove triggers from a LIVE policy. Create a new version first.")
    trigger = db.query(models.NotificationTrigger).filter(
        models.NotificationTrigger.trigger_id == trigger_id,
        models.NotificationTrigger.policy_id == policy_id
    ).first()
    if trigger:
        db.delete(trigger)
        db.commit()


@router.post("/{policy_id}/submit", summary="Submit for 4-Eye Approval")
def submit(
    policy_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    p = db.query(models.NotificationPolicy).filter(
        models.NotificationPolicy.policy_id == policy_id
    ).first()
    if not p:
        raise HTTPException(404, f"Policy '{policy_id}' not found.")
    if p.status != "DRAFT":
        raise HTTPException(400, f"Only DRAFT policies can be submitted. Current: {p.status}")
    triggers = _get_triggers(db, policy_id)
    if not triggers:
        raise HTTPException(400, "Cannot submit an empty policy. Add at least one notification trigger.")
    p.status = "PENDING_APPROVAL"
    p.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {**_serialize(p, triggers), "_note": "Submitted for 4-Eye approval."}


@router.post("/{policy_id}/make-live", summary="Make Policy Live (4-Eye)")
def make_live(
    policy_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    WHY: A notification policy going LIVE means it will fire real communications
    to customers and staff in production. SMS-Wait triggers will pause live payment
    workflows. Second approver required — creator cannot approve their own policy.
    Archives any currently LIVE version of the same policy name.
    Auto-registers in Entitlement Module on LIVE.
    """
    p = db.query(models.NotificationPolicy).filter(
        models.NotificationPolicy.policy_id == policy_id
    ).first()
    if not p:
        raise HTTPException(404, f"Policy '{policy_id}' not found.")
    if p.status != "PENDING_APPROVAL":
        raise HTTPException(400, f"Only PENDING_APPROVAL policies can go live. Current: {p.status}")
    if p.created_by == current_user.id:
        raise HTTPException(403, "4-Eye violation: approver cannot be the same as the creator.")

    now = datetime.now(timezone.utc).isoformat()

    # Archive siblings — old version stays in DB for audit history
    siblings = db.query(models.NotificationPolicy).filter(
        models.NotificationPolicy.status == "LIVE",
        models.NotificationPolicy.policy_name == p.policy_name,
        models.NotificationPolicy.policy_id != policy_id
    ).all()
    for s in siblings:
        s.status = "ARCHIVED"
        s.updated_at = now

    p.status = "LIVE"
    p.made_live_at = now
    p.made_live_by = current_user.id
    p.updated_at = now
    db.commit()

    register_entity(
        db, "NOTIFICATION_POLICY", p.policy_id,
        p.policy_name, p.application_package_id, current_user.id
    )

    triggers = _get_triggers(db, policy_id)
    return {**_serialize(p, triggers), "_note": "Policy is now LIVE. Registered in Entitlement Module."}


@router.get("/comm-templates/live", summary="List LIVE comm templates for trigger picker")
def list_live_templates(
    package_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    WHY: The trigger editor needs to pick from LIVE comm templates only.
    A trigger pointing to a DRAFT template would fire nothing at runtime.
    Returns lightweight list for the dropdown — no body content.
    """
    q = db.query(models.CommunicationTemplate).filter(
        models.CommunicationTemplate.status == "LIVE"
    )
    if package_id:
        q = q.filter(
            (models.CommunicationTemplate.application_package_id == package_id) |
            (models.CommunicationTemplate.application_package_id.is_(None))
        )
    templates = q.order_by(models.CommunicationTemplate.template_name).all()
    return {
        "templates": [
            {
                "template_id": t.template_id,
                "template_name": t.template_name,
                "template_type": t.template_type,
                "subject_line": t.subject_line,
            }
            for t in templates
        ]
    }


def _validate_trigger(payload: dict):
    """Validate notification type and recipient mode before persisting."""
    n_type = payload.get("notification_type", "").upper()
    r_mode = payload.get("recipient_mode", "").upper()

    if n_type not in VALID_NOTIFICATION_TYPES:
        raise HTTPException(400, f"notification_type must be one of {VALID_NOTIFICATION_TYPES}")
    if r_mode not in VALID_RECIPIENT_MODES:
        raise HTTPException(400, f"recipient_mode must be one of {VALID_RECIPIENT_MODES}")

    # Recipient field must be provided for the chosen mode
    if r_mode == "ROLE_BASED" and not payload.get("recipient_role"):
        raise HTTPException(400, "recipient_role required when recipient_mode is ROLE_BASED")
    if r_mode == "ISO_FIELD" and not payload.get("recipient_iso_field"):
        raise HTTPException(400, "recipient_iso_field required when recipient_mode is ISO_FIELD")
    if r_mode == "STATIC" and not payload.get("recipient_static"):
        raise HTTPException(400, "recipient_static required when recipient_mode is STATIC")

    # SMS_WAIT: timeout_minutes should be set (warn if not — allow NULL = indefinite wait)
    if n_type == "SMS_WAIT" and payload.get("wait_for_reply") and not payload.get("timeout_minutes"):
        pass  # NULL timeout is valid — indefinite wait; workflow graph handles escalation
