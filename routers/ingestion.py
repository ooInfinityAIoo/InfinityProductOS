from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
import csv
import io
import openpyxl
from typing import List, Dict, Any
from sqlalchemy import func
import uuid
import asyncio
import datetime

from database import get_db, SessionLocal
import models
from services.workflow_executor import WorkflowExecutor
import schemas
from event_bus import global_event_bus, SystemEvent

router = APIRouter(
    prefix="/api/v1/ingestion",
    tags=["Data Ingestion"]
)

def process_file_with_new_session(job_id: str, mapper_id: str, workflow_id: str, file_contents: bytes, filename: str):
    """
    This function is executed in the background to process the uploaded file.
    It creates its own database session to ensure thread safety.
    """
    db = SessionLocal()
    try:
        # 1. Update job status to PROCESSING
        job = db.query(models.IngestionJob).filter(models.IngestionJob.job_id == job_id).first()
        if not job:
            print(f"[BACKGROUND_TASK_ERROR] Job with ID '{job_id}' not found.")
            return
        
        job.status = "PROCESSING"
        job.processing_started_at = datetime.datetime.utcnow().isoformat()
        db.commit()

        # 1. Fetch Mapper and Workflow
        mapper = db.query(models.PayloadMapperBlueprint).filter(models.PayloadMapperBlueprint.mapper_id == mapper_id).first()
        if not mapper:
            error_msg = f"Mapper with ID '{mapper_id}' not found."
            print(f"[BACKGROUND_TASK_ERROR] {error_msg}")
            job.status = "FAILED"
            job.error_message = error_msg
            job.completed_at = datetime.datetime.utcnow().isoformat()
            db.commit()
            return

        # 2. Parse file and update total records
        records = []
        if filename.endswith('.csv'):
            decoded_file = file_contents.decode('utf-8')
            csv_reader = csv.DictReader(io.StringIO(decoded_file))
            records = [row for row in csv_reader]
        elif filename.endswith('.xlsx'):
            workbook = openpyxl.load_workbook(io.BytesIO(file_contents))
            sheet = workbook.active
            headers = [cell.value for cell in sheet[1]]
            for row in sheet.iter_rows(min_row=2, values_only=True):
                records.append(dict(zip(headers, row)))
        else:
            error_msg = f"Unsupported file type: {filename}"
            print(f"[BACKGROUND_TASK_ERROR] {error_msg}")
            job.status = "FAILED"
            job.error_message = error_msg
            job.completed_at = datetime.datetime.utcnow().isoformat()
            db.commit()
            return

        print(f"[BACKGROUND_TASK] Parsed {len(records)} records from {filename}.")
        job.total_records = len(records)
        db.commit()

        # 3. Process each record
        executor = WorkflowExecutor(db=db, workflow_id=workflow_id)
        processed_count = 0

        for i, record in enumerate(records):
            # 3a. Transform record using the mapper
            transformed_payload = {}
            for mapping in mapper.mappings:
                source_value = record.get(mapping.source_path)
                if source_value is not None:
                    transformed_payload[mapping.target_iso_field] = source_value
                elif mapping.is_mandatory:
                    print(f"[BACKGROUND_TASK_WARN] Mandatory source field '{mapping.source_path}' not found in record {i+1}. Skipping record.")
                    continue
                elif mapping.default_value is not None:
                     transformed_payload[mapping.target_iso_field] = mapping.default_value
            
            if not transformed_payload:
                print(f"[BACKGROUND_TASK_WARN] Record {i+1} resulted in an empty payload after transformation. Skipping.")
                continue

            # 3b. Execute workflow
            print(f"[BACKGROUND_TASK] Executing workflow for record {i+1}...")
            executor.execute(initial_payload=transformed_payload)
            processed_count += 1

        job.processed_records = processed_count
        job.status = "COMPLETED"
        job.completed_at = datetime.datetime.utcnow().isoformat()
        db.commit()
        print(f"[BACKGROUND_TASK] Finished processing file {filename}.")

    except Exception as e:
        print(f"[BACKGROUND_TASK_ERROR] An unexpected error occurred: {e}")
        if 'job' in locals() and db.is_active:
            job.status = "FAILED"
            job.error_message = str(e)
            job.completed_at = datetime.datetime.utcnow().isoformat()
            db.commit()
    finally:
        db.close()

@router.get("/jobs/", response_model=schemas.IngestionJobListResponse, summary="List Ingestion Jobs")
def list_ingestion_jobs(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    """
    Retrieves a list of recent file ingestion jobs and their statuses.
    """
    jobs = db.query(models.IngestionJob).order_by(models.IngestionJob.created_at.desc()).offset(skip).limit(limit).all()
    return {"jobs": jobs}

@router.get("/jobs/{job_id}", response_model=schemas.IngestionJobResponse, summary="Get Job Status")
def get_ingestion_job_status(job_id: str, db: Session = Depends(get_db)):
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
def get_ingestion_stats(db: Session = Depends(get_db)):
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
def cancel_ingestion_job(job_id: str, db: Session = Depends(get_db)):
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
    job.error_message = "Job cancelled by user request."
    db.commit()
    db.refresh(job)

    # --- BROADCAST JOB CANCELLED EVENT ---
    event_payload = {
        "job_id": job.job_id,
        "filename": job.filename,
        "cancelled_by": "user_request" # In a real system, you'd pass the user ID
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
    db: Session = Depends(get_db)
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

    if not file.filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type. Please upload a CSV or XLSX file.")

    file_contents = await file.read()

    # Reset job status and metadata for the new run
    job.status = "PENDING"
    job.filename = file.filename
    job.error_message = None
    job.completed_at = None
    job.processed_records = 0
    job.total_records = None
    job.created_at = datetime.datetime.utcnow().isoformat() # Update timestamp to reflect re-queue time
    db.commit()

    # Add the processing task to the background using the new file
    background_tasks.add_task(process_file_with_new_session, job.job_id, job.mapper_id, job.workflow_id, file_contents, file.filename)

    db.refresh(job)
    return job

@router.post("/files/{mapper_id}/{workflow_id}", status_code=status.HTTP_202_ACCEPTED, summary="Upload a File for Processing")
async def upload_file_for_processing(
    mapper_id: str,
    workflow_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Accepts a file (CSV or XLSX) and processes its records asynchronously using a specified mapper and workflow.
    This endpoint implements the 'Asynchronous Multi-File Upload Processing Pipeline' from Layer 4 of the architecture.
    """
    if not file.filename.endswith(('.csv', '.xlsx')):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type. Please upload a CSV or XLSX file.")

    job_id = f"JOB-{uuid.uuid4().hex[:12].upper()}"
    file_contents = await file.read()

    # Create the job record in the database
    new_job = models.IngestionJob(
        job_id=job_id,
        filename=file.filename,
        status="PENDING",
        mapper_id=mapper_id,
        workflow_id=workflow_id,
        created_at=datetime.datetime.utcnow().isoformat()
    )
    db.add(new_job)
    db.commit()

    # Add the processing task to the background
    background_tasks.add_task(process_file_with_new_session, job_id, mapper_id, workflow_id, file_contents, file.filename)

    return {"message": "File accepted for asynchronous processing.", "job_id": job_id, "filename": file.filename}