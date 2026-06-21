# WHY THIS FILE EXISTS (WS-8):
# Entitlement Configuration Module router.
# Every entity (screen, workflow, rule, report, etc.) that goes LIVE is
# automatically registered here with deny-by-default permissions.
# Admins use this API to grant VIEW / MODIFY_DATA / MODIFY_DESIGN / APPROVE
# per entity per role — no code change, no redeploy, no developer needed.
#
# This is the central enforcement point for ADR #3 (no hardcoded access control).
# All frontend role-checks must query this API, never hardcode role logic.

import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(prefix="/entitlements", tags=["Entitlement Configuration"])

# Fallback roles used only when the RoleProfile master table is empty (first boot
# before any roles have been seeded). Once roles exist in the DB, register_entity()
# reads them from there — no hardcoded list needed (ADR #3).
_FALLBACK_ROLES = {
    "ADMIN":    {"can_view": True,  "can_modify_data": True,  "can_modify_design": True,  "can_approve": True},
    "OPERATOR": {"can_view": True,  "can_modify_data": True,  "can_modify_design": False, "can_approve": False},
    "AUDITOR":  {"can_view": True,  "can_modify_data": False, "can_modify_design": False, "can_approve": False},
    "VIEWER":   {"can_view": True,  "can_modify_data": False, "can_modify_design": False, "can_approve": False},
    "SALES":    {"can_view": True,  "can_modify_data": False, "can_modify_design": False, "can_approve": False},
    "RISK":     {"can_view": True,  "can_modify_data": False, "can_modify_design": False, "can_approve": True},
    "C_LEVEL":  {"can_view": True,  "can_modify_data": False, "can_modify_design": False, "can_approve": False},
}


def _get_roles_from_db(db: Session) -> dict:
    """
    WHY THIS EXISTS:
    Reads active RoleProfile records from the DB and returns a dict of
    {role_code: default_permissions}. Falls back to _FALLBACK_ROLES if the
    RoleProfile table is empty (first boot / DB not yet seeded).

    This makes register_entity() respect custom roles created by administrators
    without any code change — ADR #3 compliance.
    """
    try:
        db_roles = db.query(models.RoleProfile).filter(
            models.RoleProfile.status == "ACTIVE"
        ).all()
        if db_roles:
            return {r.role_code: r.default_permissions for r in db_roles}
    except Exception:
        pass  # table not yet created (pre-migration) — use fallback
    return _FALLBACK_ROLES


def register_entity(
    db: Session,
    entity_type: str,
    entity_id: str,
    entity_name: str,
    package_id: Optional[str],
    created_by: str = "SYSTEM"
) -> List[models.EntitlementPolicy]:
    """
    WHY THIS EXISTS:
    Called automatically whenever an entity goes LIVE (screen, workflow, rule, etc.).
    Creates one EntitlementPolicy row per platform role with sensible defaults.
    ADMIN gets full access; all other roles get view-only by default.
    Admin must explicitly grant additional permissions via PATCH /entitlements/{policy_id}.

    WHAT BREAKS IF REMOVED: New live entities become invisible in the entitlement
    module — admin cannot control access until they manually create policies.
    """
    # Avoid duplicate registration (idempotent)
    existing = db.query(models.EntitlementPolicy).filter(
        models.EntitlementPolicy.entity_type == entity_type,
        models.EntitlementPolicy.entity_id == entity_id
    ).first()
    if existing:
        return []

    now = datetime.now(timezone.utc).isoformat()
    role_map = _get_roles_from_db(db)
    policies = []
    for role, defaults in role_map.items():
        defaults = defaults or {"can_view": False, "can_modify_data": False, "can_modify_design": False, "can_approve": False}
        policy = models.EntitlementPolicy(
            policy_id=f"ENT-{uuid.uuid4().hex[:12].upper()}",
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            application_package_id=package_id,
            role_code=role,
            can_view=defaults["can_view"],
            can_modify_data=defaults["can_modify_data"],
            can_modify_design=defaults["can_modify_design"],
            can_approve=defaults["can_approve"],
            created_at=now,
            created_by=created_by
        )
        db.add(policy)
        policies.append(policy)
    db.commit()
    return policies


@router.get(
    "/",
    summary="List Entitlement Policies",
    description="Returns all entitlement policies, optionally filtered by package, entity type, or role. Used by the Entitlement Configuration Module UI to show the permission matrix."
)
def list_policies(
    package_id: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    role_code: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    q = db.query(models.EntitlementPolicy)
    if package_id:
        q = q.filter(models.EntitlementPolicy.application_package_id == package_id)
    if entity_type:
        q = q.filter(models.EntitlementPolicy.entity_type == entity_type)
    if role_code:
        q = q.filter(models.EntitlementPolicy.role_code == role_code)
    if entity_id:
        q = q.filter(models.EntitlementPolicy.entity_id == entity_id)
    policies = q.order_by(
        models.EntitlementPolicy.entity_type,
        models.EntitlementPolicy.entity_name,
        models.EntitlementPolicy.role_code
    ).all()
    return {"policies": [_serialize(p) for p in policies], "total": len(policies)}


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register Entity for Entitlement Control",
    description="Called when an entity (screen, workflow, rule, etc.) goes LIVE. Creates deny-by-default policies for all roles. Idempotent — safe to call multiple times."
)
def register_entity_endpoint(
    entity_type: str,
    entity_id: str,
    entity_name: str,
    package_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    policies = register_entity(db, entity_type, entity_id, entity_name, package_id, current_user.user_id)
    return {
        "message": f"Registered {len(policies)} entitlement policies for {entity_type} '{entity_name}'",
        "policies_created": len(policies)
    }


@router.patch(
    "/{policy_id}",
    summary="Update Permission on a Policy",
    description="Grant or revoke a specific permission (can_view, can_modify_data, can_modify_design, can_approve) on an entitlement policy. Only ADMIN role can call this endpoint."
)
def update_policy(
    policy_id: str,
    can_view: Optional[bool] = None,
    can_modify_data: Optional[bool] = None,
    can_modify_design: Optional[bool] = None,
    can_approve: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    policy = db.query(models.EntitlementPolicy).filter(
        models.EntitlementPolicy.policy_id == policy_id
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail=f"Policy '{policy_id}' not found.")

    if can_view is not None:
        policy.can_view = can_view
    if can_modify_data is not None:
        policy.can_modify_data = can_modify_data
    if can_modify_design is not None:
        policy.can_modify_design = can_modify_design
    if can_approve is not None:
        policy.can_approve = can_approve

    policy.updated_at = datetime.now(timezone.utc).isoformat()
    policy.updated_by = current_user.user_id
    db.commit()
    return _serialize(policy)


@router.get(
    "/check",
    summary="Check Permission for a User Role on an Entity",
    description="Used by frontend studios to check if the current user's role has a specific permission on an entity. Returns a simple allowed: true/false. This is the runtime enforcement call."
)
def check_permission(
    entity_type: str,
    entity_id: str,
    permission: str = Query(..., description="can_view | can_modify_data | can_modify_design | can_approve"),
    role_code: str = Query(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    policy = db.query(models.EntitlementPolicy).filter(
        models.EntitlementPolicy.entity_type == entity_type,
        models.EntitlementPolicy.entity_id == entity_id,
        models.EntitlementPolicy.role_code == role_code
    ).first()

    if not policy:
        # No policy registered = deny by default
        return {"allowed": False, "reason": "No entitlement policy found — deny by default"}

    allowed = getattr(policy, permission, False)
    return {"allowed": allowed, "policy_id": policy.policy_id}


@router.get(
    "/summary",
    summary="Entitlement Summary Matrix",
    description="Returns a grouped matrix of all entities and their permissions per role. Used by the Entitlement Configuration Module UI to render the permission grid."
)
def entitlement_summary(
    package_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    WHY THIS EXISTS:
    The UI renders a matrix: rows = entities, columns = roles, cells = permission toggles.
    Fetching individual policies per entity would be N×7 API calls.
    This endpoint returns the whole matrix in one call, grouped by entity.
    """
    q = db.query(models.EntitlementPolicy)
    if package_id:
        q = q.filter(models.EntitlementPolicy.application_package_id == package_id)
    policies = q.order_by(models.EntitlementPolicy.entity_type, models.EntitlementPolicy.entity_name).all()

    # Group by entity
    matrix = {}
    for p in policies:
        key = f"{p.entity_type}::{p.entity_id}"
        if key not in matrix:
            matrix[key] = {
                "entity_type": p.entity_type,
                "entity_id": p.entity_id,
                "entity_name": p.entity_name,
                "package_id": p.application_package_id,
                "roles": {}
            }
        matrix[key]["roles"][p.role_code] = {
            "policy_id": p.policy_id,
            "can_view": p.can_view,
            "can_modify_data": p.can_modify_data,
            "can_modify_design": p.can_modify_design,
            "can_approve": p.can_approve
        }

    return {"matrix": list(matrix.values()), "total_entities": len(matrix)}


def _serialize(p: models.EntitlementPolicy) -> dict:
    return {
        "policy_id": p.policy_id,
        "entity_type": p.entity_type,
        "entity_id": p.entity_id,
        "entity_name": p.entity_name,
        "application_package_id": p.application_package_id,
        "role_code": p.role_code,
        "can_view": p.can_view,
        "can_modify_data": p.can_modify_data,
        "can_modify_design": p.can_modify_design,
        "can_approve": p.can_approve,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
        "created_by": p.created_by,
        "updated_by": p.updated_by
    }
