from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import desc
from sqlalchemy import func
from typing import List, Optional
import uuid
import datetime

from database import get_db
import models
import schemas
from services.governance_gate import GovernanceGateHub
from auth import get_current_user, require_admin, CurrentUser, UserRole

router = APIRouter(
    prefix="/api/v1/governance",
    tags=["Governance Hub"]
)

# --- RBAC Dependencies and Models ---


@router.get("/tasks/", response_model=schemas.GovernanceTaskSearchResponse, summary="Search and Filter Governance Tasks")
def search_governance_tasks(filters: schemas.GovernanceTaskFilterParams = Depends(), db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of governance tasks with dynamic filtering and pagination.
    Allows searching for specific tasks based on various criteria.
    """
    query = db.query(models.EvidencePacketRegistry)

    if filters.packet_id:
        query = query.filter(models.EvidencePacketRegistry.packet_id.ilike(f"%{filters.packet_id}%"))
    if filters.raw_payload_reference:
        query = query.filter(models.EvidencePacketRegistry.raw_payload_reference.ilike(f"%{filters.raw_payload_reference}%"))
    if filters.execution_status:
        # Use .ilike() for case-insensitive status matching
        query = query.filter(models.EvidencePacketRegistry.execution_status.ilike(f"%{filters.execution_status}%"))
    if filters.authorizer_sme:
        query = query.filter(models.EvidencePacketRegistry.authorizer_checker.ilike(f"%{filters.authorizer_sme}%"))

    tasks = query.order_by(desc(models.EvidencePacketRegistry.packet_id)).offset(filters.skip).limit(filters.limit).all()
    
    return {"tasks": tasks}

@router.get("/tasks/pending", response_model=schemas.GovernanceTaskListResponse, summary="List Tasks Pending Review")
def list_pending_governance_tasks(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves all tasks currently halted in the Governance Hub queue pending SME review.
    """
    pending_tasks = db.query(models.EvidencePacketRegistry).filter(
        models.EvidencePacketRegistry.execution_status == "HALTED_IN_GOVERNANCE"
    ).all()
    
    return {"pending_tasks": pending_tasks}

@router.get("/tasks/{task_id}", response_model=schemas.GovernanceTaskDetailResponse, summary="Get Full Details for a Single Task")
def get_governance_task_details(task_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves the complete details for a specific governance task by its packet_id.
    """
    task = db.query(models.EvidencePacketRegistry).filter(models.EvidencePacketRegistry.packet_id == task_id).first()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Governance task with ID '{task_id}' not found."
        )
        
    return task

@router.get("/tasks/{task_id}/participants", response_model=schemas.TaskParticipantListResponse, summary="Get All Users Who Interacted With a Task")
def get_task_participants(task_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all unique users who have interacted with a specific governance task,
    including the creator, resolver, and all commenters.
    """
    task = db.query(models.EvidencePacketRegistry).filter(models.EvidencePacketRegistry.packet_id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Governance task with ID '{task_id}' not found."
        )

    participants = {}

    # Helper to add a user and their role
    def add_participant(user_id, role):
        if user_id not in participants:
            participants[user_id] = set()
        participants[user_id].add(role)

    # Add creator
    if task.operator_maker:
        add_participant(task.operator_maker, "CREATOR")

    # Add resolver
    if task.authorizer_checker and task.authorizer_checker != "PENDING_SME_OVERRIDE":
        add_participant(task.authorizer_checker, "RESOLVER")

    # Add commenters (comments are eager-loaded via relationship)
    for comment in task.comments:
        add_participant(comment.author, "COMMENTER")
    
    response_list = [schemas.TaskParticipant(user_id=user, roles=sorted(list(roles))) for user, roles in participants.items()]

    return {"task_id": task_id, "participants": response_list}

@router.post("/tasks/{task_id}/comments", response_model=schemas.GovernanceCommentResponse, status_code=status.HTTP_201_CREATED, summary="Add a Comment to a Task")
def add_comment_to_governance_task(task_id: str, payload: schemas.GovernanceCommentCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Adds a comment or note to a specific governance task.
    This is useful for auditors or SMEs to record their findings or communications.
    """
    # --- RBAC Check ---
    if current_user.role == UserRole.AUDITOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Auditors are not permitted to add comments.")

    task = db.query(models.EvidencePacketRegistry).filter(models.EvidencePacketRegistry.packet_id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Governance task with ID '{task_id}' not found."
        )

    new_comment = models.GovernanceTaskComment(
        comment_id=f"CMT-{uuid.uuid4().hex[:12].upper()}",
        task_id=task_id,
        author=current_user.id,
        comment=payload.comment,
        created_at=datetime.datetime.utcnow().isoformat()
    )
    
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    
    return new_comment

@router.put("/tasks/{task_id}/comments/{comment_id}", response_model=schemas.GovernanceCommentResponse, summary="Edit a Comment")
def edit_governance_task_comment(task_id: str, comment_id: str, payload: schemas.GovernanceCommentUpdate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Edits the content of an existing comment on a governance task.
    Only the original author of the comment or an admin can edit it.
    Auditors cannot edit comments.
    """
    comment = db.query(models.GovernanceTaskComment).filter(
        models.GovernanceTaskComment.comment_id == comment_id,
        models.GovernanceTaskComment.task_id == task_id
    ).first()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Comment with ID '{comment_id}' not found on task '{task_id}'."
        )

    # --- RBAC Check ---
    is_admin = current_user.role == UserRole.ADMIN
    if comment.author != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to edit this comment. Only the author or an admin can edit."
        )

    comment.comment = payload.comment
    comment.updated_at = datetime.datetime.utcnow().isoformat()
    
    db.commit()
    db.refresh(comment)
    
    return comment

@router.delete("/tasks/{task_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Comment")
def delete_governance_task_comment(task_id: str, comment_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Deletes a comment from a governance task.
    Only the original author of the comment or an admin can delete it.
    Auditors cannot delete comments.
    """
    comment = db.query(models.GovernanceTaskComment).filter(
        models.GovernanceTaskComment.comment_id == comment_id,
        models.GovernanceTaskComment.task_id == task_id
    ).first()

    if not comment:
        # Return 204 even if not found to ensure idempotency for delete operations.
        return
    
    # --- RBAC Check ---
    is_admin = current_user.role == UserRole.ADMIN
    if comment.author != current_user.id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this comment. Only the author or an admin can delete."
        )
    
    db.delete(comment)
    db.commit()
    return

@router.get("/stats", response_model=schemas.GovernanceStatsResponse, summary="Get Governance Task Statistics")
def get_governance_stats(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves statistics on the number of tasks that are pending, approved, or rejected in the Governance Hub.
    """
    pending_count = db.query(models.EvidencePacketRegistry).filter(
        models.EvidencePacketRegistry.execution_status == "HALTED_IN_GOVERNANCE"
    ).count()
    
    approved_count = db.query(models.EvidencePacketRegistry).filter(
        models.EvidencePacketRegistry.execution_status == "AUTHORIZED_REPROCESSED"
    ).count()

    rejected_count = db.query(models.EvidencePacketRegistry).filter(
        models.EvidencePacketRegistry.execution_status == "REJECTED_DEAD"
    ).count()

    return {
        "pending_count": pending_count,
        "approved_count": approved_count,
        "rejected_count": rejected_count,
        "total_processed": approved_count + rejected_count,
    }

@router.get("/execution-logs/", response_model=schemas.ExecutionLogSearchResponse, summary="Search All Execution Logs")
def search_execution_logs(filters: schemas.ExecutionLogFilterParams = Depends(), db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a paginated and filterable list of all execution logs (Evidence Packets) in the system.
    """
    query = db.query(models.EvidencePacketRegistry)

    if filters.packet_id:
        query = query.filter(models.EvidencePacketRegistry.packet_id.ilike(f"%{filters.packet_id}%"))
    if filters.raw_payload_reference:
        query = query.filter(models.EvidencePacketRegistry.raw_payload_reference.ilike(f"%{filters.raw_payload_reference}%"))
    if filters.execution_status:
        query = query.filter(models.EvidencePacketRegistry.execution_status == filters.execution_status.upper())
    if filters.operator_maker:
        query = query.filter(models.EvidencePacketRegistry.operator_maker.ilike(f"%{filters.operator_maker}%"))
    if filters.created_after:
        query = query.filter(models.EvidencePacketRegistry.created_at > filters.created_after.isoformat())
    if filters.created_before:
        query = query.filter(models.EvidencePacketRegistry.created_at < filters.created_before.isoformat())

    logs = query.order_by(desc(models.EvidencePacketRegistry.created_at)).offset(filters.skip).limit(filters.limit).all()
    
    return {"logs": logs}

@router.get("/execution-logs/stats", response_model=schemas.ExecutionLogStatsResponse, summary="Get All Execution Log Statistics")
def get_execution_log_stats(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves statistics on all execution logs (Evidence Packets), grouped by their final status.
    """
    counts = db.query(models.EvidencePacketRegistry.execution_status, func.count(models.EvidencePacketRegistry.execution_status)).group_by(models.EvidencePacketRegistry.execution_status).all()
    
    stats = {
        "finalized_and_settled": 0,
        "halted_in_governance": 0,
        "authorized_reprocessed": 0,
        "rejected_dead": 0,
    }
    
    for status, count in counts:
        key = status.lower()
        if key in stats:
            stats[key] = count
            
    total = sum(stats.values())
    stats["total"] = total
    
    return stats

@router.post("/tasks/{task_id}/authorize", response_model=schemas.GovernanceTaskResponse, summary="Approve or Reject a Task", description="Allows an authorized SME to approve or reject a transaction held in the governance queue. This is the '4-Eye Check' step.")
def authorize_governance_task(task_id: str, payload: schemas.GovernanceTaskAction, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Allows an authorized SME to approve or reject a transaction held in the governance queue.
    This is the '4-Eye Check' step.
    """
    # --- RBAC Check ---
    if current_user.role == UserRole.AUDITOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Auditors are not permitted to authorize tasks.")

    hub = GovernanceGateHub(db=db)
    result = hub.authorize_exception_task(
        task_id=task_id,
        authorizer_sme=current_user.id,
        action=payload.action.value
    )
    
    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result["error"]
        )
        
    return result

@router.post("/tasks/bulk-action", response_model=schemas.GovernanceBulkActionResponse, summary="Approve or Reject Multiple Tasks in Bulk")
def bulk_authorize_governance_tasks(
    payload: schemas.GovernanceBulkActionRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Performs a bulk approval or rejection of multiple governance tasks.
    This is a privileged administrative action for managing the queue at scale.
    Requires admin privileges.
    """
    hub = GovernanceGateHub(db=db)
    
    # Add a single comment to all affected tasks for audit purposes
    comment_text = f"[BULK ACTION by {current_user.id}] {payload.comment}"
    for task_id in payload.task_ids:
        new_comment = models.GovernanceTaskComment(
            comment_id=f"CMT-{uuid.uuid4().hex[:12].upper()}",
            task_id=task_id,
            author=current_user.id,
            comment=comment_text,
            created_at=datetime.datetime.utcnow().isoformat()
        )
        db.add(new_comment)

    # Perform the bulk state change
    result = hub.bulk_authorize_exception_tasks(task_ids=payload.task_ids, authorizer_sme=current_user.id, action=payload.action.value, comment_text=comment_text)
    return result