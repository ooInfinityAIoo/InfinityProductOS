from fastapi import APIRouter, Depends, HTTPException, status, Response, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any, Optional
import uuid
import datetime

from database import get_db
import models
import schemas
from services.workflow_executor import WorkflowExecutor
from services.reporting_service import ReportingService
from auth import get_current_user, CurrentUser, require_designer_privileges

router = APIRouter(
    prefix="/api/v1/workflows",
    tags=["Workflow Engine"]
)

@router.post("/", response_model=schemas.WorkflowConfigurationResponse, status_code=status.HTTP_201_CREATED, summary="Create a Full Workflow Graph")
def create_workflow(payload: schemas.WorkflowConfigurationCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
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
        input_schema=payload.input_schema,
        output_schema=payload.output_schema,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id
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
def list_workflows(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a paginated list of all workflow configurations. Thanks to relationship loading, each workflow includes its full graph of nodes and edges.
    """
    workflows = db.query(models.WorkflowConfiguration).offset(skip).limit(limit).all()
    return workflows

@router.get("/{workflow_id}", response_model=schemas.WorkflowConfigurationResponse, summary="Get a Specific Workflow Graph")
def get_workflow(workflow_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
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
def update_workflow(workflow_id: str, payload: schemas.WorkflowConfigurationCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
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
        workflow.input_schema = payload.input_schema
        workflow.output_schema = payload.output_schema
        workflow.updated_at = datetime.datetime.utcnow().isoformat()
        workflow.updated_by = current_user.id

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
def delete_workflow(workflow_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
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
def execute_workflow_run(workflow_id: str, payload: Dict[str, Any], db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
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

@router.post("/{workflow_id}/resume/{instance_id}", summary="Resume a Paused Workflow", response_model=Dict[str, Any])
def resume_workflow_run(workflow_id: str, instance_id: str, payload: schemas.WorkflowResumeRequest, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Resumes a workflow instance that was previously paused (e.g., at a HUMAN_APPROVAL node).
    Accepts additional context injected by the user's manual action.
    """
    instance = db.query(models.WorkflowExecutionInstance).filter(models.WorkflowExecutionInstance.instance_id == instance_id).first()
    if not instance or instance.status != "PAUSED":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paused workflow instance not found or no longer paused.")
    
    if instance.workflow_id != workflow_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Instance does not belong to the specified workflow.")

    merged_context = instance.current_context.copy()
    if payload.additional_context:
        merged_context.update(payload.additional_context)

    try:
        executor = WorkflowExecutor(db=db, workflow_id=workflow_id)
        result = executor.execute(initial_payload=merged_context, resume_from_node_id=instance.current_node_id, resume_trace=instance.execution_trace)
        
        instance.status = result.get("status", "FAILED")
        instance.updated_at = datetime.datetime.utcnow().isoformat()
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An error occurred during workflow resumption: {str(e)}")

@router.get("/instances/list", summary="List Workflow Execution Instances")
def list_workflow_instances(
    workflow_id: Optional[str] = None,
    instance_status: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    WHY THIS EXISTS (WS-11 Runtime Transaction Shell):
    The runtime shell needs to show both active (PAUSED) and completed instances
    so operators can track in-flight transactions and view history.
    Filterable by workflow_id (to scope to a specific workflow) and status (PAUSED / COMPLETED / FAILED).
    WHAT BREAKS IF REMOVED: The transaction queue in the Runtime Transaction Shell goes blank.
    """
    query = db.query(models.WorkflowExecutionInstance)
    if workflow_id:
        query = query.filter(models.WorkflowExecutionInstance.workflow_id == workflow_id)
    if instance_status:
        query = query.filter(models.WorkflowExecutionInstance.status == instance_status.upper())
    instances = query.order_by(models.WorkflowExecutionInstance.created_at.desc()).limit(limit).all()
    return {
        "instances": [
            {
                "instance_id": i.instance_id,
                "workflow_id": i.workflow_id,
                "current_node_id": i.current_node_id,
                "status": i.status,
                "current_context": i.current_context,
                "execution_trace": i.execution_trace,
                "created_at": i.created_at,
                "updated_at": i.updated_at,
            }
            for i in instances
        ],
        "total": len(instances),
    }

@router.post("/{workflow_id}/execute/download-report", summary="Execute Workflow and Download PDF Report")
def execute_workflow_and_download_report(workflow_id: str, payload: Dict[str, Any], db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
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

@router.post("/generate-outbound-file/{mapper_id}", summary="Compile JSON into Physical File")
def compile_outbound_file(mapper_id: str, payload: List[Dict[str, Any]], db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Takes a raw JSON payload generated by the Workflow Executor and physically compiles it
    into a downloadable CSV or TXT file based on the Layout Template bound to the mapper.
    """
    mapper = db.query(models.PayloadMapperBlueprint).filter(models.PayloadMapperBlueprint.mapper_id == mapper_id).first()
    if not mapper or not mapper.source_template_id:
        raise HTTPException(status_code=400, detail="Invalid mapper or no layout template bound.")
    
    from services.file_generation_service import FileGenerationService
    svc = FileGenerationService(db)
    try:
        buffer, filename, media_type = svc.generate_file(mapper.source_template_id, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
    return Response(content=buffer.getvalue(), media_type=media_type, headers=headers)

@router.get("/search/financial-settlement", response_model=List[schemas.WorkflowConfigurationResponse], summary="List Workflows with Financial Settlement Nodes")
def list_financial_settlement_workflows(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all workflow configurations that contain at least one
    financial settlement node (i.e., a node with a code of 'POST_LEDGER' or 'SETTLE').
    This is useful for auditing and identifying all financial-impact workflows.
    """
    financial_node_codes = ["POST_LEDGER", "SETTLE"]

    # Subquery to find all workflow_ids that have at least one financial node
    subquery = db.query(models.WorkflowNode.workflow_id).filter(
        models.WorkflowNode.node_code.in_(financial_node_codes)
    ).distinct()

    # Main query to fetch the full workflow configurations for the IDs found
    workflows = db.query(models.WorkflowConfiguration).filter(
        models.WorkflowConfiguration.workflow_id.in_(subquery)
    ).order_by(models.WorkflowConfiguration.workflow_name).all()

    return workflows

@router.get("/search/empty", response_model=List[schemas.WorkflowConfigurationResponse], summary="List All Workflows With No Nodes")
def list_empty_workflows(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all workflow configurations that do not have any nodes defined.
    This is useful for identifying and cleaning up empty or orphaned workflow blueprints.
    """
    empty_workflows = db.query(
        models.WorkflowConfiguration
    ).outerjoin(
        models.WorkflowNode
    ).filter(
        models.WorkflowNode.node_id.is_(None)
    ).order_by(
        models.WorkflowConfiguration.workflow_name
    ).all()

    return empty_workflows

@router.delete("/empty", response_model=schemas.BulkDeleteResponse, summary="Bulk Delete All Empty Workflows")
def bulk_delete_empty_workflows(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Finds and permanently deletes all workflow configurations that do not have any nodes defined.
    This is a bulk cleanup operation and requires designer privileges.
    """
    empty_workflows_query = db.query(
        models.WorkflowConfiguration
    ).outerjoin(
        models.WorkflowNode
    ).filter(
        models.WorkflowNode.node_id.is_(None)
    )
    deleted_count = empty_workflows_query.delete(synchronize_session=False)
    db.commit()

    return {"deleted_count": deleted_count, "message": f"Successfully deleted {deleted_count} empty workflow blueprints."}

@router.get("/stats/by-domain", response_model=schemas.WorkflowDomainStatsResponse, summary="Get Workflow Counts by Domain Scope")
def get_workflow_stats_by_domain(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a count of workflows, grouped by their `domain_scope`.
    This is useful for getting a high-level overview of workflow distribution.
    """
    stats_query = db.query(
        models.WorkflowConfiguration.domain_scope,
        func.count(models.WorkflowConfiguration.workflow_id).label('count')
    ).group_by(
        models.WorkflowConfiguration.domain_scope
    ).order_by(
        func.count(models.WorkflowConfiguration.workflow_id).desc()
    ).all()

    # The query returns Row objects which Pydantic can serialize since the field names
    # in the query result ('domain_scope', 'count') match the `WorkflowDomainStatItem` model.
    return {"stats": stats_query}

@router.get("/search/needs-migration", response_model=List[schemas.WorkflowConfigurationResponse], summary="List Workflows Needing Migration")
def list_workflows_needing_migration(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Retrieves a list of all workflow configurations that contain at least one node
    that has not been migrated to the new 'orchestration_steps' model.

    This is a utility endpoint for identifying workflows that still use deprecated
    node structures and require updating. It works by finding workflows where at least one
    node has a `NULL` value for its `orchestration_steps`, indicating it hasn't been saved
    with the new structure.
    """
    # Subquery to find all workflow_ids that have at least one unmigrated node
    subquery = db.query(models.WorkflowNode.workflow_id).filter(
        models.WorkflowNode.orchestration_steps.is_(None)
    ).distinct()

    # Main query to fetch the full workflow configurations for the IDs found
    workflows = db.query(models.WorkflowConfiguration).filter(
        models.WorkflowConfiguration.workflow_id.in_(subquery)
    ).order_by(models.WorkflowConfiguration.workflow_name).all()

    return workflows

@router.get("/{workflow_id}/versions", response_model=List[schemas.WorkflowVersionResponse], summary="List All Versions of a Workflow")
def list_workflow_versions(workflow_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all historical versions that have been saved for a specific workflow.
    """
    versions = db.query(models.WorkflowVersion).filter(
        models.WorkflowVersion.workflow_id == workflow_id
    ).order_by(models.WorkflowVersion.created_at.desc()).all()
    return versions

@router.post("/{workflow_id}/versions", response_model=schemas.WorkflowVersionResponse, summary="Create a New Workflow Version")
def create_workflow_version(
    workflow_id: str,
    payload: schemas.WorkflowVersionCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Creates a new version of a workflow by taking a snapshot of its current state.
    This also increments the version number of the active workflow configuration.
    """
    workflow = db.query(models.WorkflowConfiguration).filter(
        models.WorkflowConfiguration.workflow_id == workflow_id
    ).first()

    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workflow with ID '{workflow_id}' not found.")

    try:
        # 1. Create a snapshot of the current definition
        current_definition = {
            "workflow_name": workflow.workflow_name,
            "domain_scope": workflow.domain_scope,
            "product_context": workflow.product_context,
            "sub_product": workflow.sub_product,
            "description": workflow.description,
            "formulas_defined": workflow.formulas_defined,
            "input_schema": workflow.input_schema,
            "output_schema": workflow.output_schema,
            "nodes": [
                {
                    "node_id": node.node_id,
                    "sequence_number": node.sequence_number,
                    "node_title": node.node_title,
                    "node_code": node.node_code,
                    "orchestration_steps": node.orchestration_steps,
                    "events_broadcast": node.events_broadcast,
                    "required_documents": node.required_documents,
                    "screen_template": node.screen_template,
                } for node in workflow.nodes
            ],
            "edges": [
                {
                    "edge_id": edge.edge_id,
                    "source_node_id": edge.source_node_id,
                    "target_node_id": edge.target_node_id,
                    "edge_condition": edge.edge_condition,
                } for edge in workflow.edges
            ]
        }

        # 2. Create the new version record
        new_version = models.WorkflowVersion(
            version_id=f"WFV-{uuid.uuid4().hex[:12].upper()}",
            workflow_id=workflow.workflow_id,
            version=workflow.version,
            definition=current_definition,
            created_at=datetime.datetime.utcnow().isoformat(),
            created_by=current_user.id
        )
        db.add(new_version)

        # 3. Increment the main workflow's version number (simple increment for now)
        major, minor, patch = map(int, workflow.version.split('.'))
        patch += 1
        workflow.version = f"{major}.{minor}.{patch}"
        workflow.updated_at = datetime.datetime.utcnow().isoformat()
        workflow.updated_by = current_user.id

        db.commit()
        db.refresh(new_version)
        return new_version
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred while creating new version: {str(e)}")

@router.post("/{workflow_id}/revert", response_model=schemas.WorkflowConfigurationResponse, summary="Revert to a Previous Workflow Version")
def revert_to_workflow_version(
    workflow_id: str,
    payload: schemas.RevertToVersionRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Reverts the active workflow configuration to a specific historical version.
    This is a powerful administrative action for rolling back changes.
    """
    # 1. Find the historical version to revert to
    historical_version = db.query(models.WorkflowVersion).filter(models.WorkflowVersion.version_id == payload.version_id).first()
    if not historical_version or historical_version.workflow_id != workflow_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Historical version with ID '{payload.version_id}' not found for this workflow.")

    # 2. Find the active workflow to update
    active_workflow = db.query(models.WorkflowConfiguration).filter(models.WorkflowConfiguration.workflow_id == workflow_id).first()
    if not active_workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Active workflow with ID '{workflow_id}' not found.")

    # 3. Apply the historical definition to the active workflow
    definition = historical_version.definition
    active_workflow.workflow_name = definition.get("workflow_name")
    active_workflow.input_schema = definition.get("input_schema")
    active_workflow.output_schema = definition.get("output_schema")
    # ... update all other fields from the 'definition' snapshot ...
    active_workflow.version = historical_version.version # Set version back to the historical one
    active_workflow.updated_at = datetime.datetime.utcnow().isoformat()
    active_workflow.updated_by = f"reverted_by_{current_user.id}"

    db.commit()
    db.refresh(active_workflow)
    return active_workflow
