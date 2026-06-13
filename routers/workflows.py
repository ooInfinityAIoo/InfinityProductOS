from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import uuid
import datetime

from database import get_db
import models
import schemas
from services.workflow_executor import WorkflowExecutor
from services.reporting_service import ReportingService

router = APIRouter(
    prefix="/api/v1/workflows",
    tags=["Workflow Engine"]
)

@router.post("/", response_model=schemas.WorkflowConfigurationResponse, status_code=status.HTTP_201_CREATED, summary="Create a Full Workflow Graph")
def create_workflow(payload: schemas.WorkflowConfigurationCreate, db: Session = Depends(get_db)):
    """
    Registers a new workflow configuration, including all its nodes and edges, in a single atomic transaction. This is the primary endpoint for creating new workflow blueprints.
    """
    workflow_id = f"WF-{uuid.uuid4().hex[:8].upper()}"
    
    # Create the main workflow configuration object
    new_workflow = models.WorkflowConfiguration(
        workflow_id=workflow_id,
        workflow_name=payload.workflow_name,
        domain_scope=payload.domain_scope,
        product_context=payload.product_context,
        sub_product=payload.sub_product,
        version="1.0.0", # Default version
        is_active=True,
        description=payload.description,
        formulas_defined=payload.formulas_defined,
        rules_matrix=payload.rules_matrix,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by="system_admin" # Or from an auth dependency
    )

    # Create and append node objects using the relationship
    if payload.nodes:
        for node_payload in payload.nodes:
            new_workflow.nodes.append(
                models.WorkflowNode(
                    node_id=f"NODE-{uuid.uuid4().hex[:8].upper()}",
                    workflow_id=workflow_id,
                    created_at=datetime.datetime.utcnow().isoformat(),
                    **node_payload.dict()
                )
            )

    # Create and append edge objects using the relationship
    if payload.edges:
        for edge_payload in payload.edges:
            new_workflow.edges.append(
                models.WorkflowEdge(
                    edge_id=f"EDGE-{uuid.uuid4().hex[:8].upper()}",
                    workflow_id=workflow_id,
                    created_at=datetime.datetime.utcnow().isoformat(),
                    **edge_payload.dict()
                )
            )
    
    try:
        db.add(new_workflow)
        db.commit()
        db.refresh(new_workflow)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    # The relationships with lazy='joined' will ensure nodes and edges are returned
    return new_workflow

@router.get("/", response_model=List[schemas.WorkflowConfigurationResponse], summary="List All Workflow Graphs")
def list_workflows(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retrieves a paginated list of all workflow configurations. Thanks to relationship loading, each workflow includes its full graph of nodes and edges.
    """
    workflows = db.query(models.WorkflowConfiguration).offset(skip).limit(limit).all()
    return workflows

@router.get("/{workflow_id}", response_model=schemas.WorkflowConfigurationResponse, summary="Get a Specific Workflow Graph")
def get_workflow(workflow_id: str, db: Session = Depends(get_db)):
    """
    Retrieves a single complete workflow configuration by its ID. The response includes the full graph of the workflow's nodes and edges.
    """
    workflow = db.query(models.WorkflowConfiguration).filter(
        models.WorkflowConfiguration.workflow_id == workflow_id
    ).first()
    
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow with ID '{workflow_id}' not found."
        )
        
    # Because of lazy="joined" on the model, the nodes and edges are already loaded.
    # Pydantic's from_attributes mode will handle the conversion.
    return workflow

@router.put("/{workflow_id}", response_model=schemas.WorkflowConfigurationResponse, summary="Update a Full Workflow Graph")
def update_workflow(workflow_id: str, payload: schemas.WorkflowConfigurationCreate, db: Session = Depends(get_db)):
    """
    Atomically updates an entire workflow graph. This endpoint replaces the existing configuration, nodes, and edges of a workflow with the new graph provided in the payload. It's a "replace" operation, ensuring the final state perfectly matches the input.
    """
    workflow = db.query(models.WorkflowConfiguration).filter(
        models.WorkflowConfiguration.workflow_id == workflow_id
    ).first()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow with ID '{workflow_id}' not found."
        )

    try:
        # Update scalar properties of the workflow
        workflow.workflow_name = payload.workflow_name
        workflow.domain_scope = payload.domain_scope
        workflow.product_context = payload.product_context
        workflow.sub_product = payload.sub_product
        workflow.description = payload.description
        workflow.formulas_defined = payload.formulas_defined
        workflow.rules_matrix = payload.rules_matrix
        workflow.updated_at = datetime.datetime.utcnow().isoformat()
        workflow.updated_by = "system_admin_update" # Or from auth

        # Clear existing nodes and edges. Thanks to `cascade="all, delete-orphan"`,
        # SQLAlchemy will handle the deletion from the database.
        workflow.nodes.clear()
        workflow.edges.clear()
        
        # Flush the session to execute the deletes before the adds.
        db.flush()

        # Create and add new nodes from the payload
        if payload.nodes:
            for node_payload in payload.nodes:
                workflow.nodes.append(
                    models.WorkflowNode(
                        node_id=f"NODE-{uuid.uuid4().hex[:8].upper()}",
                        workflow_id=workflow_id,
                        created_at=datetime.datetime.utcnow().isoformat(),
                        **node_payload.dict()
                    )
                )

        # Create and add new edges from the payload
        if payload.edges:
            for edge_payload in payload.edges:
                workflow.edges.append(
                    models.WorkflowEdge(
                        edge_id=f"EDGE-{uuid.uuid4().hex[:8].upper()}",
                        workflow_id=workflow_id,
                        created_at=datetime.datetime.utcnow().isoformat(),
                        **edge_payload.dict()
                    )
                )

        db.commit()
        db.refresh(workflow)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred during workflow update: {str(e)}")

    return workflow

@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Workflow Graph")
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    """
    Deletes a workflow and all of its associated nodes and edges.
    The deletion is cascaded by the database relationship configuration.
    """
    workflow = db.query(models.WorkflowConfiguration).filter(
        models.WorkflowConfiguration.workflow_id == workflow_id
    ).first()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow with ID '{workflow_id}' not found."
        )
    
    db.delete(workflow)
    db.commit()
    return

@router.post("/{workflow_id}/execute", summary="Execute a Workflow", response_model=Dict[str, Any])
def execute_workflow_run(workflow_id: str, payload: Dict[str, Any], db: Session = Depends(get_db)):
    """
    Executes a defined workflow blueprint against a given input payload.
    The engine will traverse the workflow's nodes and edges, executing rules and calculations.
    """
    try:
        executor = WorkflowExecutor(db=db, workflow_id=workflow_id)
        result = executor.execute(initial_payload=payload)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An error occurred during workflow execution: {str(e)}")

@router.post("/{workflow_id}/execute/download-report", summary="Execute Workflow and Download PDF Report")
def execute_workflow_and_download_report(workflow_id: str, payload: Dict[str, Any], db: Session = Depends(get_db)):
    """
    Executes a defined workflow and immediately generates a PDF report of the execution results,
    including the final context and a detailed execution trace.
    """
    try:
        # 1. Execute the workflow
        executor = WorkflowExecutor(db=db, workflow_id=workflow_id)
        result = executor.execute(initial_payload=payload)

        # 2. Generate the PDF report
        reporting_service = ReportingService()
        pdf_buffer = reporting_service.generate_execution_report(result)

        # 3. Return the PDF as a streaming response
        headers = {
            'Content-Disposition': f'attachment; filename="workflow_report_{workflow_id}_{datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")}.pdf"'
        }
        return Response(content=pdf_buffer.getvalue(), media_type='application/pdf', headers=headers)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An error occurred during report generation: {str(e)}")
