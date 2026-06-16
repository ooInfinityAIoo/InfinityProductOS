from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Header, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from sqlalchemy import func
import uuid
import asyncio
import datetime
import base64

from database import get_db, SessionLocal
import models
import schemas
from event_bus import global_event_bus, SystemEvent
from auth import get_current_user, require_admin, require_designer_privileges, CurrentUser
from tasks import process_file_task

router = APIRouter(
    prefix="/api/v1/ingestion",
    tags=["Data Ingestion"]
)

@router.get("/jobs/", response_model=schemas.IngestionJobListResponse, summary="List Ingestion Jobs")
def list_ingestion_jobs(skip: int = 0, limit: int = 50, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of recent file ingestion jobs and their statuses.
    """
    jobs = db.query(models.IngestionJob).order_by(models.IngestionJob.created_at.desc()).offset(skip).limit(limit).all()
    return {"jobs": jobs}

@router.get("/jobs/{job_id}", response_model=schemas.IngestionJobResponse, summary="Get Job Status")
def get_ingestion_job_status(job_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves the detailed status of a specific file ingestion job.
    """
    job = db.query(models.IngestionJob).filter(models.IngestionJob.job_id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ingestion job with ID '{job_id}' not found."
        )
    return job

@router.get("/jobs/stats", response_model=schemas.IngestionStatsResponse, summary="Get Ingestion Job Statistics")
def get_ingestion_stats(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves statistics on the number of jobs in each state (pending, processing, completed, etc.).
    """
    # Efficiently count jobs by status in a single query
    counts = db.query(models.IngestionJob.status, func.count(models.IngestionJob.status)).group_by(models.IngestionJob.status).all()
    
    stats = {
        "pending": 0,
        "processing": 0,
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

@router.post("/jobs/{job_id}/cancel", response_model=schemas.IngestionJobResponse, summary="Cancel a Pending Job")
def cancel_ingestion_job(job_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Cancels a file ingestion job, but only if it is still in 'PENDING' status.
    """
    job = db.query(models.IngestionJob).filter(models.IngestionJob.job_id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ingestion job with ID '{job_id}' not found."
        )

    if job.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job cannot be cancelled. Status is '{job.status}'. Only PENDING jobs can be cancelled."
        )

    job.status = "CANCELLED"
    job.completed_at = datetime.datetime.utcnow().isoformat()
    job.error_message = f"Job cancelled by user '{current_user.id}'."
    db.commit()
    db.refresh(job)

    # --- BROADCAST JOB CANCELLED EVENT ---
    event_payload = {
        "job_id": job.job_id,
        "filename": job.filename,
        "cancelled_by": current_user.id
    }
    asyncio.run(global_event_bus.broadcast(SystemEvent(
        event_type="JOB_CANCELLED",
        source_context="IngestionRouter",
        payload=event_payload
    )))
    
    return job

@router.post("/jobs/{job_id}/requeue", response_model=schemas.IngestionJobResponse, status_code=status.HTTP_202_ACCEPTED, summary="Re-queue a Failed Job")
async def requeue_ingestion_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    x_tenant_region: Optional[str] = Header("DEFAULT"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Re-queues a FAILED ingestion job for processing by providing a new file.
    The original file content is not stored, so it must be uploaded again.
    This is useful for retrying a job with corrected data.
    """
    job = db.query(models.IngestionJob).filter(models.IngestionJob.job_id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ingestion job with ID '{job_id}' not found."
        )

    if job.status != "FAILED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job cannot be re-queued. Status is '{job.status}'. Only FAILED jobs can be re-queued."
        )

    if not file.filename.lower().endswith(('.csv', '.xls', '.xlsx', '.xml', '.pdf', '.dbf', '.doc', '.docx', '.txt')):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type. Please upload a valid document or data file.")

    file_contents = await file.read()

    # Reset job status and metadata for the new run
    job.status = "PENDING"
    job.filename = file.filename
    job.error_message = None
    job.completed_at = None
    job.processed_records = 0
    job.total_records = None
    job.created_by = current_user.id # Stamp the user who re-queued the job
    job.created_at = datetime.datetime.utcnow().isoformat() # Update timestamp to reflect re-queue time
    db.commit()

    # Dispatch the heavy processing to the distributed task queue (e.g., Celery).
    file_contents_b64 = base64.b64encode(file_contents).decode('utf-8')
    process_file_task.delay(job.job_id, job.mapper_id, job.workflow_id, file_contents_b64, file.filename, x_tenant_region)
    print(f"Re-dispatching job {job_id} to distributed task queue.")

    db.refresh(job)
    return job

@router.post("/files/{mapper_id}/{workflow_id}", status_code=status.HTTP_202_ACCEPTED, summary="Upload a File for Processing")
async def upload_files_for_processing(
    mapper_id: str,
    workflow_id: str,
    files: List[UploadFile] = File(...),
    instance_id: Optional[str] = Query(None, description="Comma-separated target instance IDs for resuming paused workflows"),
    document_type: Optional[str] = Query(None, description="The document checklist type being fulfilled"),
    x_tenant_region: Optional[str] = Header("DEFAULT"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Accepts MULTIPLE files and processes their records asynchronously.
    Supports M:N routing: Multiple files can trigger multiple workflows (Fan-Out) 
    or resume multiple paused instances (Convergence).
    """
    job_ids = []
    
    for file in files:
        if not file.filename.lower().endswith(('.csv', '.xls', '.xlsx', '.xml', '.pdf', '.dbf', '.doc', '.docx', '.txt')):
            continue # Skip unsupported files in the batch

        job_id = f"JOB-{uuid.uuid4().hex[:12].upper()}"
        file_contents = await file.read()

        new_job = models.IngestionJob(
            job_id=job_id,
            filename=file.filename,
            status="PENDING",
            mapper_id=mapper_id,
            workflow_id=workflow_id, # Can be a comma-separated list of workflows
            created_by=current_user.id,
            created_at=datetime.datetime.utcnow().isoformat()
        )
        db.add(new_job)
        db.commit()

        # Dispatch to distributed workers, passing the multi-routing parameters
        file_contents_b64 = base64.b64encode(file_contents).decode('utf-8')
        process_file_task.delay(job_id, mapper_id, workflow_id, file_contents_b64, file.filename, x_tenant_region, instance_id, document_type)
        job_ids.append(job_id)

    if not job_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid files provided for ingestion.")

    return {"message": f"{len(job_ids)} files accepted for asynchronous M:N processing.", "job_ids": job_ids}