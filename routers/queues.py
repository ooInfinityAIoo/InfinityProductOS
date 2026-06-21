# WHY THIS FILE EXISTS:
# CRUD endpoints for the Message Queue Infrastructure masters:
#   ExternalQueueConnection — physical MQ system connections (IBM MQ, TIBCO, Kafka, SWIFT)
#   MessageQueue            — logical queue definitions with entitlements + SLA config
#   QueueRoutingRule        — response code → workflow state transition rules
#
# These masters are managed by System Administrators in the Master Data section.
# They are referenced at runtime by the Workflow Engine's PUBLISH_TO_QUEUE,
# AWAIT_QUEUE_RESPONSE, ROUTE_ON_RESPONSE, and QUEUE_TIMEOUT_ESCALATE step_types.
#
# Additionally exposes a /test-connection endpoint to verify MQ connectivity
# without publishing a real message — used during setup and troubleshooting.

import datetime
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser
from database import get_db

router = APIRouter(prefix="/api/v1/queues", tags=["Message Queue Infrastructure"])


# ---------------------------------------------------------------------------
# External Queue Connections
# ---------------------------------------------------------------------------

@router.post("/connections", response_model=schemas.ExternalQueueConnectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register an External Queue Connection",
    description="Registers a physical connection to an external MQ system (IBM MQ, TIBCO EMS, Oracle AQ, Kafka, SWIFT Alliance). Credentials must be a vault reference — never the actual secret (ADR #2).")
def create_connection(
    payload: schemas.ExternalQueueConnectionCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    now = datetime.datetime.utcnow().isoformat()
    conn = models.ExternalQueueConnection(
        connection_id=f"QC-{uuid.uuid4().hex[:8].upper()}",
        connection_name=payload.connection_name,
        description=payload.description,
        provider=payload.provider.upper(),
        connection_params=payload.connection_params,
        credential_ref=payload.credential_ref,
        tls_enabled=payload.tls_enabled,
        tls_config=payload.tls_config,
        max_reconnect_attempts=payload.max_reconnect_attempts,
        reconnect_interval_sec=payload.reconnect_interval_sec,
        heartbeat_interval_sec=payload.heartbeat_interval_sec,
        package_id=payload.package_id,
        status="DRAFT",
        created_at=now,
        created_by=current_user.user_id,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


@router.get("/connections", response_model=schemas.ExternalQueueConnectionListResponse,
    summary="List External Queue Connections",
    description="Returns all registered MQ connections, optionally filtered by package or provider.")
def list_connections(
    package_id: Optional[str] = None,
    provider: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(models.ExternalQueueConnection)
    if package_id:
        q = q.filter(models.ExternalQueueConnection.package_id == package_id)
    if provider:
        q = q.filter(models.ExternalQueueConnection.provider == provider.upper())
    connections = q.order_by(models.ExternalQueueConnection.connection_name).all()
    return {"connections": connections, "total_count": len(connections)}


@router.get("/connections/{connection_id}", response_model=schemas.ExternalQueueConnectionResponse,
    summary="Get External Queue Connection")
def get_connection(
    connection_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    conn = db.query(models.ExternalQueueConnection).filter(
        models.ExternalQueueConnection.connection_id == connection_id
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


@router.patch("/connections/{connection_id}", response_model=schemas.ExternalQueueConnectionResponse,
    summary="Update External Queue Connection")
def update_connection(
    connection_id: str,
    payload: schemas.ExternalQueueConnectionCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    conn = db.query(models.ExternalQueueConnection).filter(
        models.ExternalQueueConnection.connection_id == connection_id
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    conn.connection_name = payload.connection_name
    conn.description = payload.description
    conn.provider = payload.provider.upper()
    conn.connection_params = payload.connection_params
    conn.credential_ref = payload.credential_ref
    conn.tls_enabled = payload.tls_enabled
    conn.tls_config = payload.tls_config
    conn.max_reconnect_attempts = payload.max_reconnect_attempts
    conn.reconnect_interval_sec = payload.reconnect_interval_sec
    conn.heartbeat_interval_sec = payload.heartbeat_interval_sec
    conn.package_id = payload.package_id
    conn.updated_at = datetime.datetime.utcnow().isoformat()
    conn.updated_by = current_user.user_id

    db.commit()
    db.refresh(conn)
    return conn


@router.post("/connections/{connection_id}/test",
    summary="Test MQ Connection",
    description="Attempts to connect to the external MQ system and returns health status. Does not publish any message. Use during setup and troubleshooting.")
def test_connection(
    connection_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    conn = db.query(models.ExternalQueueConnection).filter(
        models.ExternalQueueConnection.connection_id == connection_id
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    from services.queue_adapter import get_adapter
    try:
        adapter = get_adapter(conn.provider, conn.connection_params, conn.credential_ref)
        adapter.connect()
        healthy, message = adapter.health_check()
        adapter.disconnect()
        return {
            "connection_id": connection_id,
            "provider": conn.provider,
            "healthy": healthy,
            "message": message,
            "tested_at": datetime.datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        return {
            "connection_id": connection_id,
            "provider": conn.provider,
            "healthy": False,
            "message": str(exc),
            "tested_at": datetime.datetime.utcnow().isoformat(),
        }


# ---------------------------------------------------------------------------
# Message Queues
# ---------------------------------------------------------------------------

@router.post("/message-queues", response_model=schemas.MessageQueueResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Message Queue",
    description="Defines a logical queue (MASTER, CHILD, DLQ, or RESPONSE) with SLA configuration and role/user entitlements. Child queues reference a parent MASTER queue. Entitlements follow the industry OR pattern: role-based access OR explicit user_id override.")
def create_queue(
    payload: schemas.MessageQueueCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    now = datetime.datetime.utcnow().isoformat()
    queue = models.MessageQueue(
        queue_id=f"MQ-{uuid.uuid4().hex[:8].upper()}",
        queue_name=payload.queue_name,
        queue_code=payload.queue_code.upper().replace(" ", "_"),
        description=payload.description,
        queue_type=payload.queue_type.upper(),
        parent_queue_id=payload.parent_queue_id,
        external_connection_id=payload.external_connection_id,
        physical_queue_name=payload.physical_queue_name,
        message_format=payload.message_format.upper(),
        exception_category=payload.exception_category,
        package_id=payload.package_id,
        product_id=payload.product_id,
        subproduct_id=payload.subproduct_id,
        sla_minutes=payload.sla_minutes,
        on_sla_breach_action=payload.on_sla_breach_action.upper(),
        escalation_queue_id=payload.escalation_queue_id,
        allowed_role_ids=payload.allowed_role_ids,
        allowed_user_ids=payload.allowed_user_ids,
        administrator_role_ids=payload.administrator_role_ids,
        max_retry_count=payload.max_retry_count,
        retry_interval_sec=payload.retry_interval_sec,
        status="DRAFT",
        created_at=now,
        created_by=current_user.user_id,
    )
    db.add(queue)
    db.commit()
    db.refresh(queue)
    return queue


@router.get("/message-queues", response_model=schemas.MessageQueueListResponse,
    summary="List Message Queues",
    description="Returns all message queues. Filter by package, product, queue_type, or parent_queue_id to browse the queue hierarchy.")
def list_queues(
    package_id: Optional[str] = None,
    product_id: Optional[str] = None,
    subproduct_id: Optional[str] = None,
    queue_type: Optional[str] = None,
    parent_queue_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(models.MessageQueue)
    if package_id:
        q = q.filter(models.MessageQueue.package_id == package_id)
    if product_id:
        q = q.filter(models.MessageQueue.product_id == product_id)
    if subproduct_id:
        q = q.filter(models.MessageQueue.subproduct_id == subproduct_id)
    if queue_type:
        q = q.filter(models.MessageQueue.queue_type == queue_type.upper())
    if parent_queue_id:
        q = q.filter(models.MessageQueue.parent_queue_id == parent_queue_id)
    queues = q.order_by(models.MessageQueue.queue_name).all()
    return {"queues": queues, "total_count": len(queues)}


@router.get("/message-queues/{queue_id}", response_model=schemas.MessageQueueResponse,
    summary="Get Message Queue")
def get_queue(
    queue_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    queue = db.query(models.MessageQueue).filter(models.MessageQueue.queue_id == queue_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    return queue


@router.patch("/message-queues/{queue_id}", response_model=schemas.MessageQueueResponse,
    summary="Update Message Queue")
def update_queue(
    queue_id: str,
    payload: schemas.MessageQueueCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    queue = db.query(models.MessageQueue).filter(models.MessageQueue.queue_id == queue_id).first()
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")

    for field, val in payload.dict(exclude_unset=True).items():
        setattr(queue, field, val)
    queue.updated_at = datetime.datetime.utcnow().isoformat()
    queue.updated_by = current_user.user_id

    db.commit()
    db.refresh(queue)
    return queue


# ---------------------------------------------------------------------------
# Queue Routing Rules
# ---------------------------------------------------------------------------

@router.post("/routing-rules", response_model=schemas.QueueRoutingRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Queue Routing Rule",
    description="Defines a response code → workflow state transition. Rules are evaluated in priority order (ascending) against incoming messages on a RESPONSE queue. First match wins. Always add a catch-all rule (priority=9999, match_type=REGEX, pattern=.*, target=MANUAL) to handle unexpected response codes.")
def create_routing_rule(
    payload: schemas.QueueRoutingRuleCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    now = datetime.datetime.utcnow().isoformat()
    rule = models.QueueRoutingRule(
        rule_id=f"RR-{uuid.uuid4().hex[:8].upper()}",
        queue_id=payload.queue_id,
        rule_name=payload.rule_name,
        description=payload.description,
        match_field=payload.match_field,
        match_pattern=payload.match_pattern,
        match_type=payload.match_type.upper(),
        target_workflow_state=payload.target_workflow_state,
        target_queue_id=payload.target_queue_id,
        alert_queue_administrators=payload.alert_queue_administrators,
        alert_message=payload.alert_message,
        priority=payload.priority,
        status="ACTIVE",
        created_at=now,
        created_by=current_user.user_id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/routing-rules", response_model=schemas.QueueRoutingRuleListResponse,
    summary="List Queue Routing Rules",
    description="Returns routing rules for a response queue, ordered by priority. Always review the full rule set to ensure there is a catch-all rule for unexpected response codes.")
def list_routing_rules(
    queue_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(models.QueueRoutingRule)
    if queue_id:
        q = q.filter(models.QueueRoutingRule.queue_id == queue_id)
    rules = q.order_by(models.QueueRoutingRule.priority).all()
    return {"rules": rules, "total_count": len(rules)}


@router.patch("/routing-rules/{rule_id}", response_model=schemas.QueueRoutingRuleResponse,
    summary="Update Queue Routing Rule")
def update_routing_rule(
    rule_id: str,
    payload: schemas.QueueRoutingRuleCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    rule = db.query(models.QueueRoutingRule).filter(models.QueueRoutingRule.rule_id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")

    for field, val in payload.dict(exclude_unset=True).items():
        setattr(rule, field, val)
    rule.updated_at = datetime.datetime.utcnow().isoformat()
    rule.updated_by = current_user.user_id

    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/routing-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Queue Routing Rule")
def delete_routing_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    rule = db.query(models.QueueRoutingRule).filter(models.QueueRoutingRule.rule_id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")
    db.delete(rule)
    db.commit()
