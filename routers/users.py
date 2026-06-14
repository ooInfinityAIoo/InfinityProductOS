from fastapi import APIRouter, Depends, HTTPException, status, Header, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, func, distinct
from typing import List, Optional

import models
from database import get_db
import schemas
from auth import get_current_user, require_admin_or_auditor, CurrentUser, UserRole

router = APIRouter(
    prefix="/api/v1/users",
    tags=["User Activity"]
)

@router.get("/{user_id}/activity-summary", response_model=schemas.UserActivitySummaryResponse, summary="Get a User's Activity Summary")
def get_user_activity_summary(user_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a summary of a specific user's activity across the system,
    including governance actions, comments, and maintenance tasks triggered.
    """
    # --- RBAC Check ---
    # Admins and auditors can view any user's activity.
    # Operators can only view their own activity.
    is_admin_or_auditor = current_user.role in [UserRole.ADMIN, UserRole.AUDITOR]
    if not is_admin_or_auditor and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this user's activity."
        )

    # --- Governance Actions ---
    governance_actions_query = db.query(models.EvidencePacketRegistry).filter(
        models.EvidencePacketRegistry.authorizer_checker == user_id,
        models.EvidencePacketRegistry.execution_status.in_(['AUTHORIZED_REPROCESSED', 'REJECTED_DEAD'])
    )
    governance_actions_count = governance_actions_query.count()
    recent_governance_actions = governance_actions_query.order_by(desc(models.EvidencePacketRegistry.updated_at)).limit(5).all()
    
    recent_actions_response = [
        schemas.UserActivityGovernanceAction(
            packet_id=action.packet_id,
            action=action.execution_status,
            resolved_at=action.updated_at
        ) for action in recent_governance_actions
    ]

    # --- Comments Made ---
    comments_query = db.query(models.GovernanceTaskComment).filter(models.GovernanceTaskComment.author == user_id)
    comments_made_count = comments_query.count()
    recent_comments = comments_query.order_by(desc(models.GovernanceTaskComment.created_at)).limit(5).all()

    # --- Maintenance Tasks ---
    maintenance_tasks_query = db.query(models.MaintenanceTaskLog).filter(models.MaintenanceTaskLog.triggered_by == user_id)
    maintenance_tasks_triggered_count = maintenance_tasks_query.count()
    recent_maintenance_tasks = maintenance_tasks_query.order_by(desc(models.MaintenanceTaskLog.triggered_at)).limit(5).all()

    return {
        "user_id": user_id,
        "governance_actions_count": governance_actions_count,
        "comments_made_count": comments_made_count,
        "maintenance_tasks_triggered_count": maintenance_tasks_triggered_count,
        "recent_governance_actions": recent_actions_response,
        "recent_comments": recent_comments,
        "recent_maintenance_tasks": recent_maintenance_tasks,
    }

@router.get("/{user_id}/tasks", response_model=schemas.ExecutionLogSearchResponse, summary="Get All Tasks a User Interacted With")
def get_user_interacted_tasks(
    user_id: str,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Retrieves a paginated list of all governance and execution log tasks
    that a specific user has interacted with (as creator, resolver, or commenter).
    """
    # --- RBAC Check ---
    is_admin_or_auditor = current_user.role in [UserRole.ADMIN, UserRole.AUDITOR]
    if not is_admin_or_auditor and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this user's tasks."
        )

    # Subquery to find all task IDs from comments made by the user
    commented_task_ids_subquery = db.query(models.GovernanceTaskComment.task_id).filter(
        models.GovernanceTaskComment.author == user_id
    ).distinct()

    # Query for tasks where the user is the maker, checker, or has commented
    tasks_query = db.query(models.EvidencePacketRegistry).filter(
        or_(
            models.EvidencePacketRegistry.operator_maker == user_id,
            models.EvidencePacketRegistry.authorizer_checker == user_id,
            models.EvidencePacketRegistry.packet_id.in_(commented_task_ids_subquery)
        )
    ).order_by(desc(models.EvidencePacketRegistry.created_at)).offset(skip).limit(limit).all()

    return {"logs": tasks_query}

@router.get("/", response_model=schemas.UserListResponse, summary="Get a List of All Unique Users")
def get_all_users(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin_or_auditor)):
    """
    Retrieves a list of all unique user IDs that have interacted with the system.
    This includes creators, resolvers, commenters, and maintenance task runners.
    Requires admin or auditor privileges.
    """
    # 1. Query each table for user IDs to build a comprehensive list of all users
    makers = db.query(models.EvidencePacketRegistry.operator_maker).distinct().all()
    checkers = db.query(models.EvidencePacketRegistry.authorizer_checker).distinct().all()
    commenters = db.query(models.GovernanceTaskComment.author).distinct().all()
    maintenance_runners = db.query(models.MaintenanceTaskLog.triggered_by).distinct().all()
    interaction_users = db.query(models.UserInteractionEvent.user_id).distinct().all()

    # 2. Aggregate all user IDs into a set to ensure uniqueness, filtering out system accounts
    all_user_ids = set()
    system_accounts = {"system_auto_flag", "system_auto_process", "pending_sme_override", "system_pre_auth", "system_scheduler"}

    user_id_sources = [makers, checkers, commenters, maintenance_runners, interaction_users]
    for source in user_id_sources:
        for user_id, in source:
            if user_id and user_id.lower() not in system_accounts:
                all_user_ids.add(user_id)

    # 3. Get interaction counts for all users in a single, efficient query
    interaction_counts_query = db.query(
        models.UserInteractionEvent.user_id,
        func.count(models.UserInteractionEvent.event_id).label('count')
    ).group_by(models.UserInteractionEvent.user_id).all()
    
    interaction_counts = {user_id: count for user_id, count in interaction_counts_query}

    # 4. Build the final response list, combining user IDs with their interaction counts
    sorted_users = sorted(list(all_user_ids))
    user_list = [
        schemas.UserListItem(
            user_id=user_id,
            interaction_count=interaction_counts.get(user_id, 0)
        ) for user_id in sorted_users
    ]

    return {"users": user_list, "total_count": len(user_list)}

@router.get("/active", response_model=schemas.UserListResponse, summary="Get Most Active Users by Interaction Count")
def get_most_active_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin_or_auditor)
):
    """
    Retrieves a paginated list of the most active users, ranked by their total number of interaction events.
    This provides insight into user engagement. Requires admin or auditor privileges.
    """
    system_accounts = {"system_auto_flag", "system_auto_process", "pending_sme_override", "system_pre_auth", "system_scheduler"}

    # Query for the paginated list of active users, ranked by interaction count
    active_users = db.query(
        models.UserInteractionEvent.user_id,
        func.count(models.UserInteractionEvent.event_id).label('interaction_count')
    ).filter(
        ~models.UserInteractionEvent.user_id.in_(system_accounts)
    ).group_by(
        models.UserInteractionEvent.user_id
    ).order_by(
        func.count(models.UserInteractionEvent.event_id).desc()
    ).offset(skip).limit(limit).all()

    # Query for the total count of unique, non-system users who have interactions
    total_count = db.query(func.count(distinct(models.UserInteractionEvent.user_id))).filter(
        ~models.UserInteractionEvent.user_id.in_(system_accounts)
    ).scalar()

    # The query returns Row objects that Pydantic can serialize since field names match the response model.
    return {"users": active_users, "total_count": total_count or 0}
