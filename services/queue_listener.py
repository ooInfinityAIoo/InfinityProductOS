# WHY THIS FILE EXISTS:
# Celery-based queue response listener. When the Workflow Engine publishes a payment
# instruction via PUBLISH_TO_QUEUE and suspends in AWAITING_EXTERNAL_RESPONSE state,
# this listener runs as a background Celery task, polling the configured RESPONSE queue
# for an incoming pacs.002 message matching the workflow's CorrelationID.
#
# On receipt:
#   1. Parse the response (parse_pacs002)
#   2. Evaluate routing rules (evaluate_routing_rules)
#   3. Resume the suspended workflow instance via WorkflowExecutor
#   4. Transition to the correct state (COMPLETE / REPAIR / COMPLIANCE_HOLD etc.)
#
# On SLA breach (no response within sla_minutes):
#   1. Trigger on_sla_breach_action (ALERT | ESCALATE | BOTH)
#   2. Move workflow to ESCALATION state
#   3. Notify Queue Administrator roles
#
# WHY CELERY AND NOT ASYNCIO:
# Celery tasks survive server restarts — a payment waiting for settlement confirmation
# must survive if the application restarts. Asyncio coroutines do not. Celery checkpoints
# task state to Redis/RabbitMQ, so in-flight payments are never lost.

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Celery task — listen for queue response
# ---------------------------------------------------------------------------

def listen_for_queue_response(
    workflow_instance_id: str,
    queue_id: str,
    correlation_id: str,
    sla_minutes: int,
    db_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    WHY THIS EXISTS:
    Long-running Celery task that waits for an external MQ response matching
    correlation_id on the specified queue. Called by AWAIT_QUEUE_RESPONSE
    workflow step_type immediately after PUBLISH_TO_QUEUE.

    Polls the queue adapter every poll_interval_sec seconds until:
      a) A message matching correlation_id arrives → evaluate routing rules → resume workflow
      b) SLA expires → trigger breach action → move workflow to ESCALATION

    In production this runs as: celery -A celery_app worker --loglevel=info
    For local dev without Celery, this function can be called synchronously
    with a short timeout for testing.
    """
    try:
        from celery_app import celery_app
        # Dispatch as async Celery task
        result = celery_app.send_task(
            "services.queue_listener._celery_listen_for_response",
            args=[workflow_instance_id, queue_id, correlation_id, sla_minutes, db_url],
            task_id=f"qlistener-{workflow_instance_id}-{correlation_id[:8]}",
        )
        return {
            "status": "DISPATCHED",
            "celery_task_id": result.id,
            "correlation_id": correlation_id,
            "queue_id": queue_id,
            "sla_deadline": (datetime.utcnow() + timedelta(minutes=sla_minutes)).isoformat(),
        }
    except ImportError:
        # Celery not configured — run synchronously for local dev/testing
        logger.warning(
            "Celery not configured. Running queue listener synchronously (dev mode only). "
            "Configure Celery + Redis for production."
        )
        return _sync_listen(workflow_instance_id, queue_id, correlation_id, sla_minutes, db_url)


def _sync_listen(
    workflow_instance_id: str,
    queue_id: str,
    correlation_id: str,
    sla_minutes: int,
    db_url: Optional[str],
    poll_interval_sec: int = 5,
) -> Dict[str, Any]:
    """
    WHY THIS EXISTS:
    Synchronous fallback for local dev. Polls for up to min(sla_minutes, 2) minutes
    with poll_interval_sec between polls. In production this MUST be a Celery task —
    blocking an HTTP worker thread for hours waiting for SWIFT confirmation is wrong.
    """
    import time
    from database import SessionLocal
    from services.queue_adapter import get_adapter
    from services.swift_message_builder import parse_pacs002, evaluate_routing_rules
    import models

    db = SessionLocal()
    deadline = datetime.utcnow() + timedelta(minutes=min(sla_minutes, 2))  # cap at 2min in sync mode

    try:
        # Resolve queue and connection from DB
        queue = db.query(models.MessageQueue).filter(models.MessageQueue.queue_id == queue_id).first()
        if not queue:
            return {"status": "ERROR", "error": f"Queue {queue_id} not found"}

        connection = None
        if queue.external_connection_id:
            connection = db.query(models.ExternalQueueConnection).filter(
                models.ExternalQueueConnection.connection_id == queue.external_connection_id
            ).first()

        if not connection:
            logger.warning("Queue %s has no external connection configured. Cannot listen.", queue_id)
            return {
                "status": "NO_CONNECTION",
                "message": "Queue has no external MQ connection configured. Configure an ExternalQueueConnection.",
            }

        adapter = get_adapter(
            provider=connection.provider,
            connection_params=connection.connection_params,
            credential_ref=connection.credential_ref,
        )

        try:
            adapter.connect()
        except Exception as exc:
            return {"status": "CONNECTION_FAILED", "error": str(exc)}

        # Poll loop
        while datetime.utcnow() < deadline:
            msg, err = adapter.consume_one(
                physical_queue_name=queue.physical_queue_name or queue.queue_code,
                timeout_sec=poll_interval_sec,
            )

            if err:
                logger.error("Queue consume error on %s: %s", queue_id, err)
                time.sleep(poll_interval_sec)
                continue

            if msg is None:
                # Timeout — no message yet, keep polling
                continue

            # Check if this message is for our workflow instance
            msg_corr_id = msg.get("correlation_id", "")
            if msg_corr_id != correlation_id:
                # Not for us — re-queue or ignore (adapter should handle uncommitted offset)
                logger.debug("Skipping message with correlation_id %s (expecting %s)", msg_corr_id, correlation_id)
                continue

            # Found our response — parse and route
            parsed = parse_pacs002(msg)

            # Load routing rules for this queue
            routing_rules = db.query(models.QueueRoutingRule).filter(
                models.QueueRoutingRule.queue_id == queue_id,
                models.QueueRoutingRule.status == "ACTIVE",
            ).all()

            matched_rule = evaluate_routing_rules(parsed, routing_rules)

            adapter.disconnect()

            return {
                "status": "RESPONSE_RECEIVED",
                "correlation_id": correlation_id,
                "parsed_response": parsed,
                "matched_rule": matched_rule,
                "target_workflow_state": matched_rule["target_workflow_state"] if matched_rule else "COMPLETE",
                "target_queue_id": matched_rule.get("target_queue_id") if matched_rule else None,
            }

        # SLA breach
        adapter.disconnect()
        _handle_sla_breach(db, queue, workflow_instance_id, correlation_id)
        return {
            "status": "SLA_BREACH",
            "correlation_id": correlation_id,
            "queue_id": queue_id,
            "target_workflow_state": "ESCALATION",
        }

    finally:
        db.close()


def _handle_sla_breach(db, queue, workflow_instance_id: str, correlation_id: str) -> None:
    """
    WHY THIS EXISTS:
    SLA breach means a payment instruction was sent to an external system but no
    response arrived within the configured sla_minutes. This is operationally serious:
    the payment may have been lost in transit, the external system may be down, or
    there may be a network issue. The Queue Administrator must be notified immediately.

    Actions per on_sla_breach_action:
      ALERT     → log + notify Queue Administrator roles (email/notification)
      ESCALATE  → move payment to ESCALATION_QUEUE for manual investigation
      BOTH      → do both
    """
    action = queue.on_sla_breach_action or "ALERT"
    logger.error(
        "SLA BREACH: Queue %s (%s) — workflow instance %s correlation %s exceeded %s minutes. "
        "Action: %s. Queue administrators must investigate immediately.",
        queue.queue_id, queue.queue_name, workflow_instance_id, correlation_id,
        queue.sla_minutes, action,
    )
    # TODO Phase 2 extension: send notification via NotificationEngine to administrator_role_ids
    # TODO Phase 2 extension: write to transactional_outbox_events for audit trail
