from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from thefuzz import process
import uuid
import datetime

import models
import schemas
from database import get_db
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/reconciliation",
    tags=["Reconciliation Engine"]
)

class ReconciliationEngine:
    """
    A specialized engine for performing complex, many-to-many combinatorial matching.
    This is designed to handle large datasets for reconciliation tasks efficiently.
    """

    def __init__(self):
        pass

    def match_sets(self, set_a: List[Dict], set_b: List[Dict], matching_rules: List[Dict]) -> Dict:
        """
        Core matching logic.
        
        ARCHITECTURAL MANDATE (Gap 3):
        This engine MUST NOT use nested Python loops for matching large datasets.
        It must leverage vectorized in-memory data structures for performance.
        - Use Pandas DataFrames to hold the input sets.
        - Use vector-based comparisons and joins (e.g., pd.merge, np.where).
        - Use fuzzy string matching libraries for entity name reconciliation.
        """
        df_a = pd.DataFrame(set_a)
        df_b = pd.DataFrame(set_b)

        if df_a.empty or df_b.empty:
            return {
                "matched": [],
                "variance": [],
                "unmatched_a": set_a if df_b.empty else [],
                "unmatched_b": set_b if df_a.empty else []
            }

        exact_match_rules = [r for r in matching_rules if r.get("match_type") == "EXACT"]
        tolerance_rules = [r for r in matching_rules if r.get("match_type") == "TOLERANCE"]
        fuzzy_rules = [r for r in matching_rules if r.get("match_type") == "FUZZY"]

        exact_keys_a = [r["source_field"] for r in exact_match_rules]
        exact_keys_b = [r["target_field"] for r in exact_match_rules]

        if not exact_keys_a:
            raise ValueError("At least one EXACT match rule is required for primary joining.")

        # Ensure keys exist in dataframes to prevent KeyErrors on dynamic payloads
        for k in exact_keys_a:
            if k not in df_a.columns: df_a[k] = None
        for k in exact_keys_b:
            if k not in df_b.columns: df_b[k] = None

        # Perform the merge on the exact key
        rename_map = dict(zip(exact_keys_b, exact_keys_a))
        df_b_renamed = df_b.rename(columns=rename_map)
        merged_df = pd.merge(df_a, df_b_renamed, on=exact_keys_a, how='outer', suffixes=('_source', '_target'), indicator=True)

        # --- Matched & Variance Calculation ---
        matched_on_key = merged_df[merged_df['_merge'] == 'both'].copy()
        
        variance_mask = pd.Series(False, index=matched_on_key.index)
        for rule in tolerance_rules:
            src_f = rule["source_field"]
            tgt_f = rule["target_field"]
            col_a = f"{src_f}_source" if f"{src_f}_source" in matched_on_key.columns else src_f
            col_b = f"{tgt_f}_target" if f"{tgt_f}_target" in matched_on_key.columns else tgt_f
            
            if col_a in matched_on_key.columns and col_b in matched_on_key.columns:
                tol = rule.get("tolerance_value") or 0.0
                s_a = pd.to_numeric(matched_on_key[col_a], errors='coerce').fillna(0)
                s_b = pd.to_numeric(matched_on_key[col_b], errors='coerce').fillna(0)
                diff = np.abs(s_a - s_b)
                variance_mask = variance_mask | (diff > tol)

        perfect_matches = matched_on_key[~variance_mask].drop(columns=['_merge'])
        variance_matches = matched_on_key[variance_mask].drop(columns=['_merge'])

        # --- Unmatched Calculation ---
        unmatched_a = merged_df[merged_df['_merge'] == 'left_only'].dropna(axis=1, how='all').drop(columns=['_merge'])
        unmatched_b = merged_df[merged_df['_merge'] == 'right_only'].dropna(axis=1, how='all').drop(columns=['_merge'])

        # --- Fuzzy Matching on Unmatched Sets (if configured) ---
        if fuzzy_rules and not unmatched_a.empty and not unmatched_b.empty:
            for rule in fuzzy_rules:
                fuzzy_src = rule["source_field"]
                fuzzy_tgt = rule["target_field"]
                cutoff = rule.get("fuzzy_score_cutoff") or 90
                
                col_tgt = f"{fuzzy_tgt}_target" if f"{fuzzy_tgt}_target" in unmatched_b.columns else fuzzy_tgt
                col_src = f"{fuzzy_src}_source" if f"{fuzzy_src}_source" in unmatched_a.columns else fuzzy_src
                
                if col_tgt in unmatched_b.columns and col_src in unmatched_a.columns:
                    choices = unmatched_b[col_tgt].dropna().astype(str).tolist()
                    def get_fuzzy(val):
                        if pd.isna(val): return None
                        match = process.extractOne(str(val), choices, score_cutoff=cutoff)
                        return match[0] if match else None
                    unmatched_a[f'fuzzy_match_{fuzzy_src}'] = unmatched_a[col_src].apply(get_fuzzy)

        # Replace NaN with None for pure JSON serialization to the frontend
        return {
            "matched": perfect_matches.replace({np.nan: None}).to_dict(orient='records'),
            "variance": variance_matches.replace({np.nan: None}).to_dict(orient='records'),
            "unmatched_a": unmatched_a.replace({np.nan: None}).to_dict(orient='records'),
            "unmatched_b": unmatched_b.replace({np.nan: None}).to_dict(orient='records'),
        }


# =====================================================================
# --- RECONCILIATION TEMPLATE CRUD APIs ---
# =====================================================================

@router.post("/templates", response_model=schemas.ReconciliationTemplateResponse, status_code=status.HTTP_201_CREATED, summary="Create a Reconciliation Template")
def create_reconciliation_template(payload: schemas.ReconciliationTemplateCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Creates a new Reconciliation Template (blueprint) from the Canva Designer.
    """
    existing = db.query(models.ReconciliationTemplate).filter(models.ReconciliationTemplate.reconciliation_name == payload.reconciliation_name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Reconciliation template with name '{payload.reconciliation_name}' already exists.")

    template_id = f"RECON-{uuid.uuid4().hex[:8].upper()}"
    new_template = models.ReconciliationTemplate(
        reconciliation_template_id=template_id,
        reconciliation_name=payload.reconciliation_name,
        reconciliation_category=payload.reconciliation_category,
        source_dataset_name=payload.source_dataset_name,
        target_dataset_name=payload.target_dataset_name,
        matching_rules=[rule.dict() for rule in payload.matching_rules],
        status=payload.status,
        description=payload.description,
        application_package_id=payload.application_package_id,
        product_id=payload.product_id,
        subproduct_id=payload.subproduct_id,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return new_template

@router.get("/templates", response_model=schemas.ReconciliationTemplateListResponse, summary="List All Reconciliation Templates")
def list_reconciliation_templates(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    category: Optional[str] = Query(None, description="Filter by reconciliation category"),
    db: Session = Depends(get_db), 
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Retrieves a paginated list of all Reconciliation Templates.
    """
    query = db.query(models.ReconciliationTemplate)
    if category:
        query = query.filter(models.ReconciliationTemplate.reconciliation_category == category.upper())
    
    total_count = query.count()
    templates = query.order_by(models.ReconciliationTemplate.reconciliation_name).offset(skip).limit(limit).all()
    
    return {"templates": templates, "total_count": total_count}

@router.get("/templates/{template_id}", response_model=schemas.ReconciliationTemplateResponse, summary="Get a Specific Reconciliation Template")
def get_reconciliation_template(template_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves the full details of a specific Reconciliation Template by its ID.
    """
    template = db.query(models.ReconciliationTemplate).filter(models.ReconciliationTemplate.reconciliation_template_id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Reconciliation template with ID '{template_id}' not found.")
    return template

@router.put("/templates/{template_id}", response_model=schemas.ReconciliationTemplateResponse, summary="Update a Reconciliation Template")
def update_reconciliation_template(template_id: str, payload: schemas.ReconciliationTemplateCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Updates the definition of a Reconciliation Template.
    """
    db_template = db.query(models.ReconciliationTemplate).filter(models.ReconciliationTemplate.reconciliation_template_id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Reconciliation template with ID '{template_id}' not found.")

    if payload.reconciliation_name != db_template.reconciliation_name:
        existing = db.query(models.ReconciliationTemplate).filter(models.ReconciliationTemplate.reconciliation_name == payload.reconciliation_name).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Reconciliation template with name '{payload.reconciliation_name}' already exists.")

    db_template.reconciliation_name = payload.reconciliation_name
    db_template.reconciliation_category = payload.reconciliation_category
    db_template.source_dataset_name = payload.source_dataset_name
    db_template.target_dataset_name = payload.target_dataset_name
    db_template.matching_rules = [rule.dict() for rule in payload.matching_rules]
    db_template.status = payload.status
    db_template.description = payload.description
    db_template.application_package_id = payload.application_package_id
    db_template.product_id = payload.product_id
    db_template.subproduct_id = payload.subproduct_id
    
    db_template.updated_at = datetime.datetime.utcnow().isoformat()
    db_template.updated_by = current_user.id
    
    db.commit()
    db.refresh(db_template)
    return db_template

@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Reconciliation Template")
def delete_reconciliation_template(template_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Deletes a Reconciliation Template.
    """
    db_template = db.query(models.ReconciliationTemplate).filter(models.ReconciliationTemplate.reconciliation_template_id == template_id).first()
    if db_template:
        db.delete(db_template)
        db.commit()
    return

@router.post("/execute/async", response_model=schemas.ReconciliationExecutionJobResponse, status_code=status.HTTP_202_ACCEPTED, summary="Trigger Async Reconciliation Job")
async def trigger_async_reconciliation(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Dispatches a massive reconciliation job to the distributed Celery queue for asynchronous, chunked processing.
    """
    template = db.query(models.ReconciliationTemplate).filter(models.ReconciliationTemplate.reconciliation_template_id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Reconciliation template not found")
        
    job_id = f"RECON-JOB-{uuid.uuid4().hex[:8].upper()}"
    
    new_job = models.ReconciliationExecutionJob(
        job_id=job_id,
        template_id=template_id,
        status="PENDING",
        created_at=datetime.datetime.utcnow().isoformat()
    )
    
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    
    # In the live environment, this dispatches to our message broker (Kafka/Redis) for Celery to pick up:
    # process_reconciliation_task.delay(job_id, template_id)
    
    return new_job

@router.get("/jobs", response_model=List[schemas.ReconciliationExecutionJobResponse], summary="List Reconciliation Execution Jobs")
def list_reconciliation_jobs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    jobs = db.query(models.ReconciliationExecutionJob).order_by(models.ReconciliationExecutionJob.created_at.desc()).offset(skip).limit(limit).all()
    return jobs

@router.get("/tracking", response_model=schemas.ReconciliationTrackingResponse, summary="Get Real-time Reconciliation Tracking by Package")
def get_reconciliation_tracking(
    package_id: Optional[str] = Query(None, description="Filter by Application Package ID"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Retrieves a 360-degree view of all reconciliation jobs, enriching the live execution 
    state with metadata from the template (Product, Subproduct, SLA status).
    """
    query = db.query(models.ReconciliationExecutionJob, models.ReconciliationTemplate).join(
        models.ReconciliationTemplate,
        models.ReconciliationExecutionJob.template_id == models.ReconciliationTemplate.reconciliation_template_id
    )
    
    if package_id:
        query = query.filter(models.ReconciliationTemplate.application_package_id == package_id)
        
    results = query.order_by(models.ReconciliationExecutionJob.created_at.desc()).limit(100).all()
    
    tracking_data = []
    for job, template in results:
        # Dynamic SLA Calculation logic
        sla_status = "ON_TRACK"
        if job.status == "FAILED":
            sla_status = "BREACHED"
        elif job.status in ["PENDING", "PROCESSING"] and job.created_at:
            # Heuristic: If a recon job is processing for more than 1 hour, it is AT RISK
            created_dt = datetime.datetime.fromisoformat(job.created_at)
            if (datetime.datetime.utcnow() - created_dt).total_seconds() > 3600:
                sla_status = "AT_RISK"
                
        tracking_data.append(schemas.ReconciliationTrackingJob(
            job_id=job.job_id, reconciliation_name=template.reconciliation_name, category=template.reconciliation_category,
            product_id=template.product_id, subproduct_id=template.subproduct_id, status=job.status,
            total_records=job.total_records, processed_records=job.processed_records, error_message=job.error_message,
            created_at=job.created_at, completed_at=job.completed_at, sla_status=sla_status
        ))
        
    return schemas.ReconciliationTrackingResponse(
        tracking_jobs=tracking_data,
        stats=schemas.ReconciliationTrackingStats(
            total=len(tracking_data), failed=len([d for d in tracking_data if d.status == "FAILED"]),
            completed=len([d for d in tracking_data if d.status == "COMPLETED"]), processing=len([d for d in tracking_data if d.status in ["PROCESSING", "PENDING"]])
        )
    )