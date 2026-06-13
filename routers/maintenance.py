from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from enum import Enum
from pydantic import BaseModel

import models
from database import get_db
import schemas
from services.archival_service import ArchivalService

router = APIRouter(
    prefix="/api/v1/maintenance",
    tags=["System Maintenance"]
)

# --- RBAC Dependencies and Models (copied from governance router) ---

class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    AUDITOR = "auditor"

class CurrentUser(BaseModel):
    id: str
    role: UserRole

def get_current_user(
    x_user_id: Optional[str] = Header(None, description="The ID of the user performing the action."),
    x_user_role: Optional[str] = Header(None, description="The role of the user (admin, operator, auditor).")
) -> CurrentUser:
    if not x_user_id or not x_user_role:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="X-User-ID and X-User-Role headers are required.")
    try:
        user_role = UserRole(x_user_role.lower())
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role '{x_user_role}'.")
    return CurrentUser(id=x_user_id, role=user_role)

def require_admin(current_user: CurrentUser = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This action requires admin privileges.")
    return current_user


@router.post("/archive-jobs", response_model=schemas.ArchivalSummaryResponse, summary="Archive Old Ingestion Jobs")
def trigger_ingestion_job_archival(
    retention_days: int = Query(30, ge=7, description="The number of days to retain completed jobs before archiving."),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Triggers a maintenance task to archive ingestion jobs that are older than the specified retention period.
    This moves records from the active jobs table to the archive table for historical purposes.
    """
    try:
        archival_service = ArchivalService()
        archived_count = archival_service.archive_old_ingestion_jobs(db=db, retention_days=retention_days, triggered_by=current_user.id)
        return {
            "archived_count": archived_count,
            "message": f"Successfully archived {archived_count} jobs older than {retention_days} days."
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during archival: {str(e)}")

@router.post("/cleanup-logs", response_model=schemas.CleanupSummaryResponse, summary="Cleanup Old Execution Logs")
def trigger_log_cleanup(
    retention_days: int = Query(90, ge=30, description="The number of days to retain terminal execution logs before deletion."),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Triggers a maintenance task to permanently delete execution logs (Evidence Packets) that are in a terminal state
    and older than the specified retention period.
    """
    try:
        archival_service = ArchivalService()
        deleted_count = archival_service.cleanup_old_execution_logs(db=db, retention_days=retention_days, triggered_by=current_user.id)
        return {
            "deleted_count": deleted_count,
            "message": f"Successfully deleted {deleted_count} execution logs older than {retention_days} days."
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during cleanup: {str(e)}")

@router.get("/archive-jobs", response_model=schemas.IngestionJobArchiveListResponse, summary="Query Archived Ingestion Jobs")
def query_archived_jobs(filters: schemas.IngestionJobArchiveFilterParams = Depends(), db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves a paginated and filterable list of jobs that have been archived for historical review.
    """
    query = db.query(models.IngestionJobArchive)

    if filters.job_id:
        query = query.filter(models.IngestionJobArchive.job_id.ilike(f"%{filters.job_id}%"))
    if filters.filename:
        query = query.filter(models.IngestionJobArchive.filename.ilike(f"%{filters.filename}%"))
    if filters.status:
        query = query.filter(models.IngestionJobArchive.status == filters.status.upper())
    if filters.mapper_id:
        query = query.filter(models.IngestionJobArchive.mapper_id == filters.mapper_id)
    if filters.workflow_id:
        query = query.filter(models.IngestionJobArchive.workflow_id == filters.workflow_id)

    jobs = query.order_by(models.IngestionJobArchive.archived_at.desc()).offset(filters.skip).limit(filters.limit).all()
    return {"jobs": jobs}

@router.get("/archive-jobs/stats", response_model=schemas.ArchivalStatsResponse, summary="Get Archived Job Statistics")
def get_archived_job_stats(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves statistics on the number of archived jobs, grouped by their final status.
    """
    # Efficiently count jobs by status in a single query
    counts = db.query(models.IngestionJobArchive.status, func.count(models.IngestionJobArchive.status)).group_by(models.IngestionJobArchive.status).all()
    
    stats = {
        "completed": 0,
        "failed": 0,
        "cancelled": 0,
    }
    
    for status, count in counts:
        if status.lower() in stats:
            stats[status.lower()] = count
            
    total = sum(stats.values())
    stats["total"] = total
    
    return stats

@router.post("/archive-jobs/{job_id}/restore", response_model=schemas.IngestionJobResponse, summary="Restore an Archived Job")
def restore_archived_job(job_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Restores a single job from the archive back to the active ingestion jobs table.
    This allows a previously archived job to be inspected or potentially re-queued.
    """
    try:
        archival_service = ArchivalService()
        restored_job = archival_service.restore_job_from_archive(db=db, job_id=job_id)
        return restored_job
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        elif "conflict" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
        else: # Catch any other ValueErrors as a bad request
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during restoration: {str(e)}")

@router.post("/flag-stuck-jobs", response_model=schemas.StuckJobSummaryResponse, summary="Flag Stuck Ingestion Jobs")
def trigger_stuck_job_detection(
    timeout_minutes: int = Query(60, ge=5, description="The number of minutes a job can be in 'PROCESSING' state before being flagged as stuck."),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Triggers a maintenance task to find and flag ingestion jobs that are 'stuck' in the PROCESSING state
    for longer than the specified timeout period.
    """
    try:
        archival_service = ArchivalService()
        flagged_count = archival_service.flag_stuck_ingestion_jobs(db=db, timeout_minutes=timeout_minutes, triggered_by=current_user.id)
        return {"flagged_count": flagged_count, "message": f"Successfully flagged {flagged_count} stuck jobs."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during stuck job detection: {str(e)}")

@router.post("/flag-stale-tasks", response_model=schemas.StaleTaskSummaryResponse, summary="Flag Stale Governance Tasks")
def trigger_stale_task_detection(
    timeout_days: int = Query(7, ge=1, description="The number of days a task can be in 'HALTED_IN_GOVERNANCE' state before being flagged as stale."),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Triggers a maintenance task to find and flag governance tasks that have been pending review for too long.
    This will broadcast an event for each stale task, triggering notifications.
    """
    try:
        archival_service = ArchivalService()
        flagged_count = archival_service.flag_stale_governance_tasks(db=db, timeout_days=timeout_days, triggered_by=current_user.id)
        return {"flagged_count": flagged_count, "message": f"Successfully flagged {flagged_count} stale governance tasks."}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during stale task detection: {str(e)}")

@router.get("/logs", response_model=schemas.MaintenanceTaskLogListResponse, summary="Get Maintenance Task Run History")
def get_maintenance_task_logs(filters: schemas.MaintenanceTaskLogFilterParams = Depends(), db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves a paginated and filterable list of all maintenance tasks that have been run. Requires admin privileges.
    """
    query = db.query(models.MaintenanceTaskLog)

    if filters.task_name:
        query = query.filter(models.MaintenanceTaskLog.task_name.ilike(f"%{filters.task_name}%"))
    if filters.status:
        query = query.filter(models.MaintenanceTaskLog.status == filters.status.upper())
    if filters.triggered_by:
        query = query.filter(models.MaintenanceTaskLog.triggered_by.ilike(f"%{filters.triggered_by}%"))
    if filters.triggered_after:
        query = query.filter(models.MaintenanceTaskLog.triggered_at > filters.triggered_after.isoformat())
    if filters.triggered_before:
        query = query.filter(models.MaintenanceTaskLog.triggered_at < filters.triggered_before.isoformat())

    logs = query.order_by(models.MaintenanceTaskLog.triggered_at.desc()).offset(filters.skip).limit(filters.limit).all()
    return {"logs": logs}