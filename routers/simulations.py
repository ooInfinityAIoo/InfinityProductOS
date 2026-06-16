from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import uuid
import datetime
import random
import json

from database import get_db, SessionLocal
import models
import schemas
from services.workflow_executor import WorkflowExecutor
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/simulations",
    tags=["Stress-Testing Simulation Sandbox"]
)

def run_simulation_job_task(job_id: str, simulation_id: str):
    """
    Background worker function that runs the simulation scenarios.
    """
    db = SessionLocal()
    try:
        # 1. Fetch the scenario and job
        scenario = db.query(models.SimulationScenario).filter(models.SimulationScenario.simulation_id == simulation_id).first()
        job = db.query(models.SimulationJob).filter(models.SimulationJob.job_id == job_id).first()
        
        if not scenario or not job:
            return
            
        job.status = "PROCESSING"
        db.commit()
        
        sample_size = scenario.sample_size or 100
        scenario_vars = scenario.scenario_variables or {}
        
        successful_count = 0
        failed_count = 0
        
        # 2. Run simulation loop
        for i in range(sample_size):
            # Generate a baseline mock payload
            # For general HELOC/FIGRE payments:
            # - Principal Amount
            # - User Confirmation Status (50/50 confirmation/denial unless overridden)
            # - Currency code
            random_amount = round(random.uniform(1000.0, 50000.0), 2)
            random_conf = random.choice(["CONFIRMED", "DENIED"])
            
            payload = {
                "of_fintax_bal_01": random_amount,
                "user_confirmation_status": random_conf,
                "tsy_ccy_code": "USD",
                "customer_name": f"Synthetic User {i}",
                "account_number": f"123456{i:04d}",
                "customer_email": f"user{i}@example.com",
                "customer_phone": f"+1555019{i:04d}"
            }
            
            # Merge scenario variables (overrides)
            payload.update(scenario_vars)
            
            try:
                executor = WorkflowExecutor(db=db, workflow_id=scenario.target_workflow_id)
                result = executor.execute(initial_payload=payload)
                
                # Check status
                if result.get("status") == "COMPLETED":
                    successful_count += 1
                else:
                    failed_count += 1
            except Exception:
                failed_count += 1
                
            # Periodically write progress to database
            if (i + 1) % 50 == 0 or (i + 1) == sample_size:
                job.processed_records = i + 1
                db.commit()
                
        # 3. Finalize job metrics
        success_rate = f"{(successful_count / sample_size) * 100:.1f}%"
        results_summary = {
            "success_rate": success_rate,
            "total_successful": successful_count,
            "total_failed": failed_count,
            "notes": f"Simulation run completed successfully. Tested {sample_size} synthetic transactions using scenario overrides."
        }
        
        job.status = "COMPLETED"
        job.results_summary = results_summary
        db.commit()
        
    except Exception as e:
        db.rollback()
        # Mark job as failed
        job = db.query(models.SimulationJob).filter(models.SimulationJob.job_id == job_id).first()
        if job:
            job.status = "FAILED"
            job.results_summary = {
                "success_rate": "0.0%",
                "total_successful": 0,
                "total_failed": scenario.sample_size if scenario else 100,
                "notes": f"Simulation failed with error: {str(e)}"
            }
            db.commit()
    finally:
        db.close()

@router.get("/", response_model=List[schemas.SimulationScenarioResponse], summary="List All Stress Test Scenarios")
def list_simulations(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Lists all stress test simulation scenarios in the sandbox.
    """
    scenarios = db.query(models.SimulationScenario).order_by(models.SimulationScenario.created_at.desc()).all()
    return scenarios

@router.post("/", response_model=schemas.SimulationScenarioResponse, status_code=status.HTTP_201_CREATED, summary="Create a New Stress Test Scenario")
def create_simulation(payload: schemas.SimulationScenarioCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Saves a new stress test simulation scenario definition.
    """
    # Verify target workflow exists
    workflow = db.query(models.WorkflowConfiguration).filter(
        models.WorkflowConfiguration.workflow_id == payload.target_workflow_id
    ).first()
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target workflow '{payload.target_workflow_id}' not found."
        )
        
    sim_id = f"SIM-{uuid.uuid4().hex[:8].upper()}"
    new_scenario = models.SimulationScenario(
        simulation_id=sim_id,
        simulation_name=payload.simulation_name,
        description=payload.description,
        target_workflow_id=payload.target_workflow_id,
        sample_size=payload.sample_size,
        scenario_variables=payload.scenario_variables,
        historical_dataset_source=payload.historical_dataset_source,
        created_at=datetime.datetime.utcnow().isoformat()
    )
    db.add(new_scenario)
    db.commit()
    db.refresh(new_scenario)
    return new_scenario

@router.post("/{sim_id}/execute", response_model=schemas.SimulationJobResponse, summary="Trigger Scenario Execution")
def execute_simulation_scenario(
    sim_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Triggers execution of stress tests using background tasks.
    """
    scenario = db.query(models.SimulationScenario).filter(models.SimulationScenario.simulation_id == sim_id).first()
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation scenario '{sim_id}' not found."
        )
        
    job_id = f"SJOB-{uuid.uuid4().hex[:8].upper()}"
    new_job = models.SimulationJob(
        job_id=job_id,
        simulation_id=sim_id,
        status="PENDING",
        processed_records=0,
        total_records=scenario.sample_size,
        created_at=datetime.datetime.utcnow().isoformat()
    )
    
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    
    # Schedule background worker
    background_tasks.add_task(run_simulation_job_task, job_id, sim_id)
    
    return new_job

@router.get("/jobs/{job_id}", response_model=schemas.SimulationJobResponse, summary="Poll Job Progress & Results")
def get_simulation_job_status(job_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns the status and aggregated results of a simulation run job.
    """
    job = db.query(models.SimulationJob).filter(models.SimulationJob.job_id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation job '{job_id}' not found."
        )
    return job
