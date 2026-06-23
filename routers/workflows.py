from fastapi import APIRouter, Depends, HTTPException, status, Response, Header, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any, Optional
import uuid
import datetime
import base64
import json
import os
import re

from database import get_db
import models
import schemas
from services.workflow_executor import WorkflowExecutor
from services.reporting_service import ReportingService
from auth import get_current_user, CurrentUser, require_designer_privileges, UserRole

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
        created_by=current_user.id,
        is_template=getattr(payload, 'is_template', False) or False,
        message_type=getattr(payload, 'message_type', None),
        clearing_network=getattr(payload, 'clearing_network', None),
        template_category=getattr(payload, 'template_category', None),
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
def list_workflows(
    skip: int = 0,
    limit: int = 100,
    is_template: Optional[bool] = Query(None, description="Filter to ISO message templates only (true) or user workflows only (false)"),
    clearing_network: Optional[str] = Query(None, description="Filter templates by clearing network: SWIFT | FEDNOW | RTP | CHIPS | SEPA | ACH | ALL"),
    template_category: Optional[str] = Query(None, description="Filter templates by category: PAYMENT_INITIATION | CLEARING_SETTLEMENT | CASH_MANAGEMENT | ADMINISTRATION"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Retrieves a paginated list of workflow configurations.
    Use is_template=true to fetch the ISO 20022 message template library for the
    'New from Template' picker in the Workflow Designer.
    Use is_template=false (default behaviour when omitted) to list user-created workflows.
    """
    q = db.query(models.WorkflowConfiguration)
    if is_template is not None:
        q = q.filter(models.WorkflowConfiguration.is_template == is_template)
    if clearing_network:
        q = q.filter(models.WorkflowConfiguration.clearing_network == clearing_network)
    if template_category:
        q = q.filter(models.WorkflowConfiguration.template_category == template_category)
    return q.offset(skip).limit(limit).all()

# ── Wiring Audit endpoints must be BEFORE /{workflow_id} to avoid route shadowing ──

@router.get("/wiring-audit", summary="Wiring Audit — Unwired Orchestration Steps",
    description="""
    WHY THIS EXISTS:
    ~35 RTP/FedNow workflow templates were seeded with step_type set (BUSINESS_RULE,
    CALCULATION, API_CALL) but no target_token — meaning those steps fire as no-ops
    at runtime. This endpoint scans every workflow node's orchestration_steps and
    returns only the steps that have a step-type requiring a target but no target set.
    The Workflow Designer Wiring Audit panel uses this to give designers a single view
    of everything that needs wiring, with inline dropdowns to fix it.
    """)
def get_wiring_audit(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    NEEDS_TARGET = {"INVOKE_RULE", "INVOKE_FORMULA", "INVOKE_API", "INVOKE_CALCULATION",
                    "BUSINESS_RULE", "CALCULATION", "API_CALL"}
    rules    = db.query(models.BusinessRuleSet).all()
    formulas = db.query(models.SymbolicFormulaAsset).all()
    apis     = db.query(models.ApiConfiguration).all()
    workflows_all = db.query(models.WorkflowConfiguration).all()
    rule_options    = [{"value": r.token_code, "label": f"{r.business_name} ({r.token_code})"} for r in rules]
    formula_options = [{"value": f.token_code, "label": f"{f.business_name} ({f.token_code})"} for f in formulas]
    api_options     = [{"value": a.api_name,   "label": f"{a.api_name} ({a.api_id})"}          for a in apis]
    workflow_options= [{"value": w.workflow_id, "label": f"{w.workflow_name} ({w.workflow_id})"} for w in workflows_all]
    unwired_by_workflow = {}
    for wf in workflows_all:
        for node in wf.nodes:
            for idx, step in enumerate(node.orchestration_steps or []):
                action = step.get("action") or step.get("step_type", "")
                if action not in NEEDS_TARGET:
                    continue
                has_target = bool(
                    step.get("target_token") or step.get("rule_token") or
                    step.get("formula_token") or step.get("api_id") or
                    step.get("api_name")
                )
                if not has_target:
                    if wf.workflow_id not in unwired_by_workflow:
                        unwired_by_workflow[wf.workflow_id] = {
                            "workflow_id": wf.workflow_id, "workflow_name": wf.workflow_name, "unwired_steps": [],
                        }
                    step_kind = ("RULE" if action in ("INVOKE_RULE","BUSINESS_RULE") else
                                 "FORMULA" if action in ("INVOKE_FORMULA","CALCULATION") else
                                 "API" if action in ("INVOKE_API","API_CALL") else "WORKFLOW")
                    unwired_by_workflow[wf.workflow_id]["unwired_steps"].append({
                        "node_id": node.node_id, "node_title": node.node_title,
                        "step_index": idx, "action": action, "step_kind": step_kind,
                        "description": step.get("description", ""),
                    })
    return {
        "workflows": list(unwired_by_workflow.values()),
        "total_unwired": sum(len(w["unwired_steps"]) for w in unwired_by_workflow.values()),
        "options": {"rules": rule_options, "formulas": formula_options,
                    "apis": api_options, "workflows": workflow_options},
    }


@router.patch("/wiring-audit/apply", summary="Apply Wiring — Set target_token on orchestration steps")
def apply_wiring(patches: List[Dict[str, Any]], db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """WHY THIS EXISTS: Persists wiring selections from the Wiring Audit panel per-step
    without requiring a full node PUT. Each patch has node_id, step_index, target, step_kind."""
    applied = 0
    for patch in patches:
        node_id    = patch.get("node_id")
        step_index = patch.get("step_index")
        target     = patch.get("target")
        step_kind  = patch.get("step_kind", "RULE")
        if not node_id or step_index is None or not target:
            continue
        node = db.query(models.WorkflowNode).filter(models.WorkflowNode.node_id == node_id).first()
        if not node:
            continue
        steps = list(node.orchestration_steps or [])
        if step_index >= len(steps):
            continue
        step = dict(steps[step_index])
        if step_kind == "RULE":     step["rule_token"]    = target
        elif step_kind == "FORMULA": step["formula_token"] = target
        elif step_kind == "API":    step["api_name"]      = target
        else:                       step["target_token"]  = target
        steps[step_index] = step
        node.orchestration_steps = steps
        applied += 1
    db.commit()
    return {"applied": applied}


@router.get("/reversal-recovery-queue",
    summary="Reversal Recovery Queue — Failed Reversals Awaiting Manual Intervention",
    description="""
    WHY THIS EXISTS:
    When a reversal (saga compensation) partially fails — the compensating API times out,
    the DB snapshot can't be restored, or the event broadcast fails — the transaction
    lands in REVERSAL_FAILED status. This endpoint surfaces every such instance so ops
    staff can see what failed, why, and take manual action (retry, force-reverse, escalate).

    ReversionRecoveryQueue.tsx polls this to populate the ops dashboard. Without it
    the dashboard shows an error and operators have no visibility into stuck reversals.

    Returns: { items: [...], total: N }
    Optional: assigned=true|false to filter by repair_queue_assigned presence.
    """,
    response_model=Dict[str, Any],
    tags=["Workflow Instances"])
def get_reversal_recovery_queue(
    assigned: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    WHY THIS EXISTS: Powers the Reversal Recovery Queue ops dashboard.
    Returns all WorkflowExecutionInstances in REVERSAL_FAILED status, optionally
    filtered by whether they have a repair_queue_assigned value.

    WHAT BREAKS IF REMOVED: ReversionRecoveryQueue.tsx gets 404 and ops staff
    lose visibility into stuck failed reversals.
    """
    q = db.query(models.WorkflowExecutionInstance).filter(
        models.WorkflowExecutionInstance.status == "REVERSAL_FAILED"
    )
    # Filter by assignment status when caller specifies
    if assigned == "true":
        q = q.filter(models.WorkflowExecutionInstance.repair_queue_assigned.isnot(None))
    elif assigned == "false":
        q = q.filter(models.WorkflowExecutionInstance.repair_queue_assigned.is_(None))

    instances = q.order_by(models.WorkflowExecutionInstance.updated_at.desc()).all()

    # Resolve node titles from workflow nodes table for richer UI display
    node_ids = [inst.current_node_id for inst in instances if inst.current_node_id]
    node_title_map: Dict[str, str] = {}
    if node_ids:
        nodes = db.query(models.WorkflowNode).filter(
            models.WorkflowNode.node_id.in_(node_ids)
        ).all()
        node_title_map = {n.node_id: n.node_title for n in nodes}

    items = []
    for inst in instances:
        # WHY queue_entry_id == instance_id: no separate reversal-queue table exists yet.
        # Each REVERSAL_FAILED instance IS the queue entry. This keeps the frontend key
        # stable and lets ops link directly to the metro tracker detail view.
        items.append({
            "queue_entry_id":  inst.instance_id,
            "instance_id":     inst.instance_id,
            "node_id":         inst.current_node_id,
            "node_title":      node_title_map.get(inst.current_node_id, inst.current_node_id),
            "landed_at":       inst.updated_at or inst.created_at,
            "last_error":      inst.cancelled_message or "Reversal compensation failed — see execution trace.",
            "assigned_to":     inst.repair_queue_assigned,
        })

    return {"items": items, "total": len(items)}


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
    # Tell the executor which existing instance to update on COMPLETED so it avoids
    # creating a duplicate — the instance was already persisted at the PAUSED step.
    merged_context["__resume_instance_id__"] = instance_id

    try:
        executor = WorkflowExecutor(db=db, workflow_id=workflow_id)
        result = executor.execute(initial_payload=merged_context, resume_from_node_id=instance.current_node_id, resume_trace=instance.execution_trace)

        # Executor handles COMPLETED update internally via __resume_instance_id__.
        # For non-COMPLETED terminal states (REJECTED, CANCELLED) sync the status here too.
        new_status = result.get("status", "FAILED")
        if new_status not in ("COMPLETED",):
            instance.status = new_status
            instance.updated_at = datetime.datetime.utcnow().isoformat()
            db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An error occurred during workflow resumption: {str(e)}")

@router.get("/instances/search", summary="Search Workflow Execution Instances",
    description="""
    WHY THIS EXISTS (E5 — TRANSACTION_SCREEN_DESIGN.md §6):
    The Transaction Workflow Screen can receive millions of transactions per day. Simple
    /instances/list is fine for the last-50 picker, but operators need to search by
    transaction reference, customer ID, amount range, or lifecycle state across the full
    history. This endpoint is the Postgres-first implementation of that search — no
    Elasticsearch dependency for MVP. Multi-field OR search on indexed string columns;
    status filtering as a multi-value IN clause; date range on created_at.

    WHAT BREAKS IF REMOVED: Operators can only browse the 50 most-recent instances;
    they cannot find specific transactions by ID or any business reference.
    """)
def search_workflow_instances(
    q: Optional[str] = None,          # free-text prefix on instance_id / master_transaction_id
    statuses: Optional[str] = None,   # comma-separated: PAUSED,RETRYING,COMPLETED
    workflow_id: Optional[str] = None,
    cancelled_by: Optional[str] = None,
    repair_queue: Optional[str] = None,
    date_from: Optional[str] = None,  # ISO date string, inclusive
    date_to: Optional[str] = None,    # ISO date string, inclusive
    assigned_team: Optional[str] = None, # team filter
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Multi-field transaction search for the Transaction Workflow Screen.
    Runs entirely in Postgres — uses indexed column LIKE for the free-text query,
    IN clause for status multi-select, and string comparison on ISO date columns.
    Paginated via limit + offset; returns total_count + has_more for UI pagination.
    """
    query = db.query(models.WorkflowExecutionInstance)

    # Entitlements enforcement
    if current_user.role not in [UserRole.ADMIN, UserRole.AUDITOR]:
        query = query.filter(models.WorkflowExecutionInstance.assigned_team == current_user.role.value)
    elif assigned_team:
        query = query.filter(models.WorkflowExecutionInstance.assigned_team == assigned_team)

    # Free-text — match instance_id prefix OR master_transaction_id prefix.
    # ilike is case-insensitive LIKE, safe for our ISO-style IDs.
    if q:
        search_pattern = f"{q}%"
        query = query.filter(
            models.WorkflowExecutionInstance.instance_id.ilike(search_pattern) |
            models.WorkflowExecutionInstance.master_transaction_id.ilike(search_pattern)
        )

    # Multi-status filter — comma-separated values e.g. "PAUSED,RETRYING"
    if statuses:
        status_list = [s.strip().upper() for s in statuses.split(",") if s.strip()]
        if status_list:
            query = query.filter(
                models.WorkflowExecutionInstance.status.in_(status_list)
            )

    # Exact workflow_id match — scopes search to one template
    if workflow_id:
        query = query.filter(
            models.WorkflowExecutionInstance.workflow_id == workflow_id
        )

    # Who cancelled it — 'rule' | 'operator' | 'system'
    if cancelled_by:
        query = query.filter(
            models.WorkflowExecutionInstance.cancelled_by == cancelled_by
        )

    # Which repair queue it's sitting in
    if repair_queue:
        query = query.filter(
            models.WorkflowExecutionInstance.repair_queue_assigned == repair_queue
        )

    # Date range on created_at (stored as ISO string — lexicographic comparison works
    # for YYYY-MM-DDTHH:MM:SS format, which is what we use everywhere)
    if date_from:
        query = query.filter(
            models.WorkflowExecutionInstance.created_at >= date_from
        )
    if date_to:
        # Append "Z" sentinel so date_to covers the full day
        query = query.filter(
            models.WorkflowExecutionInstance.created_at <= date_to + "T23:59:59"
        )

    # Total count (before pagination) — needed so the UI can show "X results"
    total_count = query.count()

    instances = (
        query
        .order_by(models.WorkflowExecutionInstance.created_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    return {
        "instances": [
            {
                "instance_id": i.instance_id,
                "workflow_id": i.workflow_id,
                "master_transaction_id": i.master_transaction_id,
                "current_node_id": i.current_node_id,
                "status": i.status,
                "created_at": i.created_at,
                "updated_at": i.updated_at,
                "cancelled_by": i.cancelled_by,
                "cancelled_reason_code": i.cancelled_reason_code,
                "repair_queue_assigned": i.repair_queue_assigned,
                "assigned_team": i.assigned_team,
            }
            for i in instances
        ],
        "total_count": total_count,
        "has_more": (offset + limit) < total_count,
        "limit": limit,
        "offset": offset,
    }


@router.get("/instances/list", summary="List Workflow Execution Instances")
def list_workflow_instances(
    workflow_id: Optional[str] = None,
    instance_status: Optional[str] = None,
    assigned_team: Optional[str] = None,
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

    # Entitlements enforcement
    if current_user.role not in [UserRole.ADMIN, UserRole.AUDITOR]:
        query = query.filter(models.WorkflowExecutionInstance.assigned_team == current_user.role.value)
    elif assigned_team:
        query = query.filter(models.WorkflowExecutionInstance.assigned_team == assigned_team)

    instances = query.order_by(models.WorkflowExecutionInstance.created_at.desc()).limit(limit).all()
    # E0 commit 5/N — surface the new lifecycle audit columns (from E0 commit 1/N)
    # so the Transaction Workflow Screen can render: the Cancelled / Repair Queue /
    # Retry / Failed states with their reasons + audit metadata, and the runtime
    # search index can populate WHY a transaction terminated. Older clients that
    # only read the original 8 fields keep working — these are additive keys.
    # See TRANSACTION_SCREEN_DESIGN.md §2.1 (state palette) + §8.2 (data model).
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
                # E0 audit columns — every key is nullable; clients should treat None as 'not set'.
                "retry_attempts_log": i.retry_attempts_log,
                "repair_queue_assigned": i.repair_queue_assigned,
                "cancelled_by": i.cancelled_by,
                "cancelled_reason_code": i.cancelled_reason_code,
                "cancelled_message": i.cancelled_message,
                "reversal_request_id": i.reversal_request_id,
                "template_version_pinned": i.template_version_pinned,
                "assigned_team": i.assigned_team,
            }
            for i in instances
        ],
        "total": len(instances),
    }

@router.get("/instances/{instance_id}", summary="Get a Single Workflow Execution Instance")
def get_workflow_instance(
    instance_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    WHY THIS EXISTS (E1 commit 1/N — TRANSACTION_SCREEN_DESIGN.md §1):
    The Transaction Workflow Screen renders ONE specific transaction at a time —
    its metro tracker needs the full instance (status, current_node_id, execution
    trace, full lifecycle audit columns) plus the parent workflow's node list so
    it can lay out the stations. The existing /instances/list returns batches
    scoped for the queue view; this endpoint returns a single instance for the
    detail view. Same payload shape as a row in the list response, plus the
    parent workflow's nodes (so the UI doesn't make a second round trip).

    WHAT BREAKS IF REMOVED: The Transaction Workflow Screen cannot fetch one
    transaction — it would have to /list and filter client-side, which doesn't
    scale and leaks every other operator's in-flight work into the response.

    Returns 404 when the instance_id is not found — the screen renders a clean
    'transaction not found' state rather than a 500.
    """
    instance = db.query(models.WorkflowExecutionInstance).filter(
        models.WorkflowExecutionInstance.instance_id == instance_id
    ).first()
    if not instance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow execution instance '{instance_id}' not found.",
        )

    # Fetch the parent workflow's nodes — the tracker needs sequence_number,
    # node_title, node_type, and the E0 authoring columns (on_failure,
    # reversibility, etc.) to color and label every station. Sorting by
    # sequence_number gives the UI a deterministic left-to-right station order.
    nodes = (
        db.query(models.WorkflowNode)
        .filter(models.WorkflowNode.workflow_id == instance.workflow_id)
        .order_by(models.WorkflowNode.sequence_number)
        .all()
    )

    return {
        "instance_id": instance.instance_id,
        "workflow_id": instance.workflow_id,
        "current_node_id": instance.current_node_id,
        "status": instance.status,
        "current_context": instance.current_context,
        "execution_trace": instance.execution_trace,
        "created_at": instance.created_at,
        "updated_at": instance.updated_at,
        # E0 lifecycle audit columns — feed the tracker's per-state sub-text.
        "retry_attempts_log": instance.retry_attempts_log,
        "repair_queue_assigned": instance.repair_queue_assigned,
        "cancelled_by": instance.cancelled_by,
        "cancelled_reason_code": instance.cancelled_reason_code,
        "cancelled_message": instance.cancelled_message,
        "reversal_request_id": instance.reversal_request_id,
        "template_version_pinned": instance.template_version_pinned,
        # The workflow shape — one round trip, no client-side join.
        "workflow_nodes": [
            {
                "node_id": n.node_id,
                "sequence_number": n.sequence_number,
                "node_title": n.node_title,
                "node_code": n.node_code,
                "node_type": n.node_type,
                "canvas_x_position": n.canvas_x_position,
                "canvas_y_position": n.canvas_y_position,
                "iso_message_type": n.iso_message_type,
                "message_direction": n.message_direction,
                # E0 authoring columns — the tracker uses these to show
                # reversibility (rollback icon), retry config, repair queue
                # routing, and cancellability per station.
                "on_failure": n.on_failure,
                "retry_config": n.retry_config,
                "repair_queue_name": n.repair_queue_name,
                "cancellable": n.cancellable,
                "skippable": n.skippable,
                "reversibility": n.reversibility,
                "reversal_recipe": n.reversal_recipe,
                "reversal_rules": n.reversal_rules,
            }
            for n in nodes
        ],
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


# ---------------------------------------------------------------------------
# DIAGRAM PARSER — Claude Vision → Workflow JSON
# ---------------------------------------------------------------------------

_PARSE_SYSTEM_PROMPT = """
You are a workflow diagram parser for a banking process automation platform.
The user will upload an image of a hand-drawn or digital workflow / BPMN diagram.

Your job: extract every node (box, diamond, circle, swimlane step) and every arrow from
the diagram and return a strictly valid JSON object.

Output schema (no markdown fences, plain JSON only):
{
  "workflow_name": "<inferred name or 'Parsed Workflow'>",
  "nodes": [
    {
      "id": "n1",
      "title": "<label on the shape>",
      "node_type": "<one of: RECEIVE|SCHEDULE|EVENT_TRIGGER|VALIDATE|COMPLIANCE_SCREEN|LIMIT_CHECK|DOCUMENT_EXAMINE|DECISION|PARALLEL_SPLIT|PARALLEL_JOIN|HUMAN_APPROVAL|DIGITAL_SIGNATURE|CALCULATE|VALUATE|WATERFALL|SEND_MESSAGE|POST_ENTRY|CALL_SYSTEM|GENERATE_DOCUMENT|AWAIT_RESPONSE|HOLD|ESCALATE|COMPLETE|TERMINATE>",
      "x": <integer canvas x position, spacing shapes 220px apart horizontally>,
      "y": <integer canvas y position, 200 for a single row>,
      "notes": "<any text near the shape that is not the label>"
    }
  ],
  "edges": [
    {
      "source": "n1",
      "target": "n2",
      "condition": "<label on the arrow, or empty string>"
    }
  ],
  "confidence": <0.0–1.0, how clearly readable the diagram was>,
  "warnings": ["<any ambiguous shapes or unreadable text>"]
}

Node type mapping rules:
- Rectangle / rounded rectangle = VALIDATE (default for process boxes)
- Diamond / rhombus = DECISION
- Circle / oval at start = RECEIVE
- Circle / oval at end = COMPLETE
- Parallelogram = SEND_MESSAGE (I/O shape)
- Cylinder / drum = POST_ENTRY (database/ledger)
- Document shape = GENERATE_DOCUMENT
- Person / actor icon = HUMAN_APPROVAL
- Clock / timer = SCHEDULE
- Bolt / lightning = EVENT_TRIGGER
- Crossed circle = TERMINATE

Position nodes left-to-right in flow order, y=200 for a single row.
For parallel branches, offset y by 200 for each branch.
Start at x=100. Space each node 220px apart on x.
""".strip()


@router.post(
    "/parse-diagram",
    summary="Parse a workflow diagram image into canvas JSON",
    description=(
        "Accepts a JPG/PNG/WebP image of a hand-drawn or digital workflow diagram "
        "and returns structured node/edge JSON that can be loaded directly onto the "
        "Workflow Designer canvas. Uses Claude claude-sonnet-4-6 vision. "
        "Requires ANTHROPIC_API_KEY environment variable."
    ),
)
async def parse_workflow_diagram(
    file: UploadFile = File(..., description="PNG / JPG / WebP diagram image, max 10 MB"),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    WHY THIS ENDPOINT EXISTS:
    Banks often start workflow design with a whiteboard sketch or a Visio diagram.
    Instead of manually recreating it in the canvas node by node, the designer uploads
    the image here. Claude vision reads the shapes and arrows and returns the node/edge
    JSON that the frontend loads directly onto the React Flow canvas.

    WHAT BREAKS IF REMOVED: The 'Parse Diagram' upload button in the Workflow Designer
    becomes a dead endpoint. The feature degrades gracefully — no canvas state is lost.
    """
    # Validate file type
    allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
    content_type = file.content_type or "image/png"
    if content_type not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{content_type}'. Upload PNG, JPG, WebP, or GIF."
        )

    # Read and base64-encode the image
    raw_bytes = await file.read()
    if len(raw_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MB limit.")

    image_b64 = base64.standard_b64encode(raw_bytes).decode("utf-8")

    # Check API key
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Set it in the environment to enable diagram parsing."
        )

    try:
        import anthropic as anthropic_sdk
        client = anthropic_sdk.Anthropic(api_key=api_key)

        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=_PARSE_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": content_type,
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Parse this workflow diagram. "
                            "Return the JSON schema described in the system prompt. "
                            "Plain JSON only — no markdown, no explanation."
                        ),
                    },
                ],
            }],
        )

        raw = response.content[0].text.strip()
        # Strip markdown code fences if Claude adds them despite instructions
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
            raw = raw.rstrip("`").strip()

        result = json.loads(raw)

        # Validate minimal structure
        if "nodes" not in result or "edges" not in result:
            raise ValueError("Response missing 'nodes' or 'edges' keys.")

        return {
            "workflow_name": result.get("workflow_name", "Parsed Workflow"),
            "nodes": result.get("nodes", []),
            "edges": result.get("edges", []),
            "confidence": result.get("confidence", 0.0),
            "warnings": result.get("warnings", []),
        }

    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Claude returned non-JSON output. Raw (first 300 chars): {raw[:300]}"
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Diagram parsing failed: {str(exc)}")
