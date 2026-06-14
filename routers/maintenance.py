from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any, cast

import models
from database import get_db
import schemas
from services.archival_service import ArchivalService
from services.ai_services import AIService
from auth import get_current_user, require_admin, CurrentUser
from scheduler import scheduler
from enum import Enum

router = APIRouter(
    prefix="/api/v1/maintenance",
    tags=["System Maintenance"]
)

# --- RBAC Dependencies and Models (copied from governance router) ---

class MaintenanceJobName(str, Enum):
    ARCHIVE_INGESTION_JOBS = "archive_ingestion_jobs"
    CLEANUP_EXECUTION_LOGS = "cleanup_execution_logs"
    FLAG_STUCK_JOBS = "flag_stuck_ingestion_jobs"
    FLAG_STALE_TASKS = "flag_stale_governance_tasks"
    SUMMARIZE_AI_STATS = "summarize_ai_stats"
    CLEANUP_INTERACTION_EVENTS = "cleanup_interaction_events"
    CHECK_UNCONFIGURED_PII = "check_unconfigured_pii_fields"

@router.get("/jobs", response_model=schemas.MaintenanceJobListResponse, summary="List All Available Maintenance Jobs")
def list_available_maintenance_jobs(current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all available maintenance jobs that can be manually triggered, along with their descriptions.
    """
    job_descriptions = {
        MaintenanceJobName.ARCHIVE_INGESTION_JOBS: "Archives old, completed ingestion jobs from the active table to the archive table.",
        MaintenanceJobName.CLEANUP_EXECUTION_LOGS: "Permanently deletes old, terminal-state execution logs (Evidence Packets).",
        MaintenanceJobName.FLAG_STUCK_JOBS: "Finds and flags ingestion jobs that are stuck in the 'PROCESSING' state for too long.",
        MaintenanceJobName.FLAG_STALE_TASKS: "Finds and flags governance tasks that have been pending review for too long, triggering notifications.",
        MaintenanceJobName.SUMMARIZE_AI_STATS: "Calculates system-wide statistics on user interactions and logs them.",
        MaintenanceJobName.CLEANUP_INTERACTION_EVENTS: "Permanently deletes old user interaction events to manage data retention.",
        MaintenanceJobName.CHECK_UNCONFIGURED_PII: "Checks for PII fields that are missing an explicit masking strategy and sends a notification."
    }
    
    available_jobs = [
        schemas.MaintenanceJobDefinition(
            job_name=job.value,
            description=job_descriptions.get(job, "No description available.")
        ) for job in MaintenanceJobName
    ]
    
    return {"jobs": available_jobs}

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

@router.get("/logs/failed", response_model=schemas.MaintenanceTaskLogListResponse, summary="Get All Failed Maintenance Tasks")
def get_failed_maintenance_tasks(
    task_name: Optional[str] = Query(None, description="Filter failed tasks by a specific task name (case-insensitive search)."),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Retrieves a paginated list of all maintenance tasks that have failed.
    This is a convenience endpoint for auditing and debugging. Can be filtered by task name.
    Requires admin privileges.
    """
    query = db.query(models.MaintenanceTaskLog).filter(
        models.MaintenanceTaskLog.status == "FAILED"
    )
    if task_name:
        query = query.filter(models.MaintenanceTaskLog.task_name.ilike(f"%{task_name}%"))

    failed_logs = query.order_by(
        models.MaintenanceTaskLog.triggered_at.desc()
    ).offset(skip).limit(limit).all()

    return {"logs": failed_logs}

@router.get("/logs/successful", response_model=schemas.MaintenanceTaskLogListResponse, summary="Get All Successful Maintenance Tasks")
def get_successful_maintenance_tasks(
    task_name: Optional[str] = Query(None, description="Filter successful tasks by a specific task name (case-insensitive search)."),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Retrieves a paginated list of all maintenance tasks that have completed successfully.
    This is a convenience endpoint for auditing. Can be filtered by task name.
    Requires admin privileges.
    """
    query = db.query(models.MaintenanceTaskLog).filter(
        models.MaintenanceTaskLog.status == "SUCCESS"
    )
    if task_name:
        query = query.filter(models.MaintenanceTaskLog.task_name.ilike(f"%{task_name}%"))

    successful_logs = query.order_by(
        models.MaintenanceTaskLog.triggered_at.desc()
    ).offset(skip).limit(limit).all()

    return {"logs": successful_logs}

@router.get("/logs/frequently-failing", response_model=schemas.FrequentlyFailingTaskListResponse, summary="Get Frequently Failing Maintenance Tasks")
def get_frequently_failing_tasks(
    hours_window: int = Query(24, ge=1, description="The time window in hours to check for failures."),
    failure_threshold: int = Query(3, ge=0, description="The number of failures a task must exceed to be included."),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Retrieves a list of maintenance tasks that have failed more than a specified
    number of times within a given time window. This is useful for identifying
    'flaky' or problematic jobs. Requires admin privileges.
    """
    archival_service = ArchivalService()
    failing_tasks = archival_service.get_frequently_failing_tasks(
        db=db,
        hours_window=hours_window,
        failure_threshold=failure_threshold
    )
    
    return {
        "tasks": failing_tasks,
        "time_window_hours": hours_window,
        "failure_threshold": failure_threshold
    }

@router.get("/logs/{log_id}", response_model=schemas.MaintenanceTaskLogResponse, summary="Get Details of a Single Maintenance Task Log")
def get_maintenance_task_log_details(
    log_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Retrieves the full details for a single maintenance task log entry by its unique log_id.
    Requires admin privileges.
    """
    log_entry = db.query(models.MaintenanceTaskLog).filter(models.MaintenanceTaskLog.log_id == log_id).first()
    
    if not log_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Maintenance task log with ID '{log_id}' not found."
        )
    return log_entry

@router.post("/jobs/{job_name}/trigger", response_model=schemas.ManualJobTriggerResponse, summary="Manually Trigger a Specific Maintenance Job")
def trigger_specific_maintenance_job(
    job_name: MaintenanceJobName,
    payload: schemas.ManualJobTriggerRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Manually triggers a specific, named maintenance job.
    This allows administrators to run scheduled tasks on demand.
    """
    archival_service = ArchivalService()
    ai_service = AIService()
    params = payload.parameters or {}
    
    try:
        if job_name == MaintenanceJobName.ARCHIVE_INGESTION_JOBS:
            retention_days = params.get("retention_days", 30)
            archived_count = archival_service.archive_old_ingestion_jobs(db=db, retention_days=retention_days, triggered_by=current_user.id)
            summary = {"archived_count": archived_count}
            message = f"Successfully archived {archived_count} jobs older than {retention_days} days."
        
        elif job_name == MaintenanceJobName.CLEANUP_EXECUTION_LOGS:
            retention_days = params.get("retention_days", 90)
            deleted_count = archival_service.cleanup_old_execution_logs(db=db, retention_days=retention_days, triggered_by=current_user.id)
            summary = {"deleted_count": deleted_count}
            message = f"Successfully deleted {deleted_count} execution logs older than {retention_days} days."

        elif job_name == MaintenanceJobName.FLAG_STUCK_JOBS:
            timeout_minutes = params.get("timeout_minutes", 60)
            flagged_count = archival_service.flag_stuck_ingestion_jobs(db=db, timeout_minutes=timeout_minutes, triggered_by=current_user.id)
            summary = {"flagged_count": flagged_count}
            message = f"Successfully flagged {flagged_count} stuck jobs."

        elif job_name == MaintenanceJobName.FLAG_STALE_TASKS:
            timeout_days = params.get("timeout_days", 7)
            flagged_count = archival_service.flag_stale_governance_tasks(db=db, timeout_days=timeout_days, triggered_by=current_user.id)
            summary = {"flagged_count": flagged_count}
            message = f"Successfully flagged {flagged_count} stale governance tasks."

        elif job_name == MaintenanceJobName.SUMMARIZE_AI_STATS:
            summary = ai_service.summarize_interaction_stats_for_logging(db=db, triggered_by=current_user.id)
            message = "Successfully summarized and logged AI interaction statistics."

        elif job_name == MaintenanceJobName.CLEANUP_INTERACTION_EVENTS:
            retention_days = params.get("retention_days", 180)
            deleted_count = ai_service.cleanup_old_interaction_events(db=db, retention_days=retention_days, triggered_by=current_user.id)
            summary = {"deleted_count": deleted_count}
            message = f"Successfully deleted {deleted_count} interaction events older than {retention_days} days."

        elif job_name == MaintenanceJobName.CHECK_UNCONFIGURED_PII:
            unconfigured_count = archival_service.check_for_unconfigured_pii_fields(db=db, triggered_by=current_user.id)
            summary = {"unconfigured_pii_field_count": unconfigured_count}
            message = f"Data Governance Alert: Found {unconfigured_count} PII fields with no masking strategy." if unconfigured_count > 0 else "Scan complete. All PII fields have an explicit masking strategy."

        return {"job_name": job_name.value, "status": "SUCCESS", "message": message, "summary": summary}

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred while running job '{job_name.value}': {str(e)}")

@router.get("/logs/stats", response_model=schemas.MaintenanceTaskStatsResponse, summary="Get Maintenance Task Statistics")
def get_maintenance_task_stats(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves statistics on maintenance task runs, such as success/failure rates per task.
    Requires admin privileges.
    """
    try:
        archival_service = ArchivalService()
        stats = archival_service.get_maintenance_task_statistics(db=db)
        return stats
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred while generating statistics: {str(e)}")

@router.get("/scheduler/jobs", response_model=schemas.SchedulerStatusResponse, summary="Get the Status of the Background Job Scheduler")
def get_scheduler_status(current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves the current status of the background job scheduler, including a list of all scheduled jobs and their next run times.
    Requires admin privileges.
    """
    jobs = scheduler.get_jobs()
    job_list = []
    for job in jobs:
        job_list.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": job.next_run_time,
            "trigger": str(job.trigger)
        })
    
    return {
        "is_running": scheduler.running,
        "job_count": len(job_list),
        "jobs": job_list
    }

@router.post("/scheduler/pause", response_model=schemas.SchedulerControlResponse, summary="Pause the Background Job Scheduler")
def pause_scheduler(current_user: CurrentUser = Depends(require_admin)):
    """
    Pauses the entire background job scheduler. No new jobs will be started until it is resumed.
    Requires admin privileges.
    """
    if not scheduler.running:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scheduler is not running.")
    
    scheduler.pause()
    return {"status": "PAUSED", "message": "Background job scheduler has been paused."}

@router.post("/scheduler/resume", response_model=schemas.SchedulerControlResponse, summary="Resume the Background Job Scheduler")
def resume_scheduler(current_user: CurrentUser = Depends(require_admin)):
    """
    Resumes a paused background job scheduler. Requires admin privileges.
    """
    if not scheduler.running:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scheduler is not running.")
        
    scheduler.resume()
    return {"status": "RUNNING", "message": "Background job scheduler has been resumed."}