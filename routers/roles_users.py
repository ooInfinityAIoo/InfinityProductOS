# WHY THIS FILE EXISTS:
# CRUD endpoints for Role Profiles and User Profiles — the two identity masters
# that underpin the entire access control layer.
#
# Previously, roles were hardcoded as ALL_ROLES = ["ADMIN", "OPERATOR", ...] in
# routers/entitlements.py. That violated ADR #3 (no hardcoded business logic) and
# meant adding a new role (e.g. COMPLIANCE_OFFICER) required a code change + redeploy.
#
# Now roles are DB records. entitlements.py reads them from the DB at runtime, so:
#   - A System Administrator creates a new role via POST /roles-users/roles
#   - The Entitlement Configuration studio auto-shows the new role as a column
#   - No developer involvement, no redeploy needed
#
# User Profiles serve two purposes beyond standard auth:
#   1. Queue entitlements: MessageQueue.allowed_user_ids references user_ids here —
#      an individual user can be granted temporary queue access without a role change
#   2. Audit trail: every created_by / updated_by string in the platform links to a
#      UserProfile so auditors can see real names, not just string IDs

import datetime
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser
from database import get_db

router = APIRouter(prefix="/api/v1/roles-users", tags=["Role & User Profiles"])


# ── Role Profiles ─────────────────────────────────────────────────────────────

@router.post("/roles", response_model=schemas.RoleProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Role Profile",
    description="Creates a named role master. role_code must be UPPER_SNAKE_CASE. "
                "Set is_system_role=True only for built-in platform roles that must not be deleted. "
                "default_permissions seeds the EntitlementPolicy matrix when a new entity goes LIVE.")
def create_role(
    payload: schemas.RoleProfileCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    existing = db.query(models.RoleProfile).filter(
        models.RoleProfile.role_code == payload.role_code.upper()
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Role code {payload.role_code} already exists")

    now = datetime.datetime.utcnow().isoformat()
    role = models.RoleProfile(
        role_id=f"ROLE-{uuid.uuid4().hex[:8].upper()}",
        role_code=payload.role_code.upper().replace(" ", "_"),
        role_name=payload.role_name,
        description=payload.description,
        package_id=payload.package_id,
        is_system_role=payload.is_system_role,
        default_permissions=payload.default_permissions,
        status=payload.status,
        created_at=now,
        created_by=current_user.id,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.get("/roles", response_model=schemas.RoleProfileListResponse,
    summary="List Role Profiles",
    description="Returns all role masters. Filter by package_id to see package-specific roles. "
                "Always includes platform-wide roles (package_id IS NULL).")
def list_roles(
    package_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(models.RoleProfile)
    if package_id:
        # Return platform-wide roles AND package-specific roles
        q = q.filter(
            (models.RoleProfile.package_id == package_id) |
            (models.RoleProfile.package_id.is_(None))
        )
    if status:
        q = q.filter(models.RoleProfile.status == status.upper())
    roles = q.order_by(models.RoleProfile.role_name).all()
    return {"roles": roles, "total_count": len(roles)}


@router.get("/roles/{role_id}", response_model=schemas.RoleProfileResponse,
    summary="Get Role Profile")
def get_role(
    role_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    role = db.query(models.RoleProfile).filter(models.RoleProfile.role_id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.patch("/roles/{role_id}", response_model=schemas.RoleProfileResponse,
    summary="Update Role Profile")
def update_role(
    role_id: str,
    payload: schemas.RoleProfileCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    role = db.query(models.RoleProfile).filter(models.RoleProfile.role_id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    for field, val in payload.dict(exclude_unset=True).items():
        if field == "role_code":
            val = val.upper().replace(" ", "_")
        setattr(role, field, val)
    role.updated_at = datetime.datetime.utcnow().isoformat()
    role.updated_by = current_user.id
    db.commit()
    db.refresh(role)
    return role


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Role Profile",
    description="Cannot delete a system role (is_system_role=True). "
                "Deleting a role does not cascade to EntitlementPolicy — existing policies retain the role_code.")
def delete_role(
    role_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    role = db.query(models.RoleProfile).filter(models.RoleProfile.role_id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system_role:
        raise HTTPException(status_code=400, detail="System roles cannot be deleted")
    db.delete(role)
    db.commit()


# ── User Profiles ─────────────────────────────────────────────────────────────

@router.post("/users", response_model=schemas.UserProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a User Profile",
    description="Creates a platform user. primary_role_code must reference an existing RoleProfile. "
                "In production, the OIDC JWT provides the user_id — this endpoint is used for "
                "pre-provisioning users before their first login.")
def create_user(
    payload: schemas.UserProfileCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    # Validate primary role exists
    role = db.query(models.RoleProfile).filter(
        models.RoleProfile.role_code == payload.primary_role_code.upper()
    ).first()
    if not role:
        raise HTTPException(status_code=400, detail=f"Role {payload.primary_role_code} not found in RoleProfile master")

    existing = db.query(models.UserProfile).filter(
        models.UserProfile.username == payload.username
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Username {payload.username} already exists")

    now = datetime.datetime.utcnow().isoformat()
    user = models.UserProfile(
        user_id=f"USR-{uuid.uuid4().hex[:8].upper()}",
        username=payload.username,
        display_name=payload.display_name,
        email=payload.email,
        primary_role_code=payload.primary_role_code.upper(),
        additional_role_codes=payload.additional_role_codes,
        package_ids=payload.package_ids,
        explicit_queue_ids=payload.explicit_queue_ids,
        status=payload.status,
        created_at=now,
        created_by=current_user.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users", response_model=schemas.UserProfileListResponse,
    summary="List User Profiles",
    description="Returns all users. Filter by role_code or package_id.")
def list_users(
    role_code: Optional[str] = None,
    package_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(models.UserProfile)
    if role_code:
        q = q.filter(models.UserProfile.primary_role_code == role_code.upper())
    if status:
        q = q.filter(models.UserProfile.status == status.upper())
    users = q.order_by(models.UserProfile.display_name).all()
    # package_id filter: done in Python since package_ids is a JSON array
    if package_id:
        users = [u for u in users if not u.package_ids or package_id in u.package_ids]
    return {"users": users, "total_count": len(users)}


@router.get("/users/{user_id}", response_model=schemas.UserProfileResponse,
    summary="Get User Profile")
def get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    user = db.query(models.UserProfile).filter(models.UserProfile.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=schemas.UserProfileResponse,
    summary="Update User Profile")
def update_user(
    user_id: str,
    payload: schemas.UserProfileCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    user = db.query(models.UserProfile).filter(models.UserProfile.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for field, val in payload.dict(exclude_unset=True).items():
        setattr(user, field, val)
    user.updated_at = datetime.datetime.utcnow().isoformat()
    user.updated_by = current_user.id
    db.commit()
    db.refresh(user)
    return user
