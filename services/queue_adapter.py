# WHY THIS FILE EXISTS:
# Abstract adapter layer for external Message Queue systems. The Workflow Engine
# publishes payment instructions and awaits settlement responses via these adapters.
# The abstraction means the Workflow Engine never knows or cares whether the
# underlying system is IBM MQ, TIBCO EMS, Kafka, or SWIFT Alliance — it calls the
# same interface and the adapter handles the protocol.
#
# Industry context:
#   IBM MQ       — Tier-1 banks (JPMC, HSBC, Barclays). Transactional messaging:
#                  dequeue + DB commit in one atomic operation. Used for SWIFT/CHIPS.
#   TIBCO EMS    — Capital markets, Finastra shops. Topic-based pub/sub, high throughput.
#   Oracle AQ    — FLEXCUBE integration banks. Embedded in Oracle DB transaction.
#   Kafka        — Neo-banks, Thought Machine, modern cores. Event streaming with replay.
#   SWIFT Alliance — Every SWIFT member bank. FIN + ISO 20022 MX message exchange.
#   RabbitMQ     — Mid-tier banks, regional players. AMQP protocol.
#
# ADR #2: All credentials are fetched from a vault reference at runtime.
#          The connection_params and credential_ref stored in ExternalQueueConnection
#          never contain actual secrets — only references to where secrets live.
#
# Phase implementation status:
#   KafkaAdapter    — FUNCTIONAL (confluent-kafka-python)
#   IBMMQAdapter    — STUB (requires pymqi + IBM MQ client libraries, licensed)
#   TIBCOAdapter    — STUB (requires TIBCO EMS client, licensed)
#   OracleAQAdapter — STUB (requires cx_Oracle + Oracle DB license)
#   SWIFTAdapter    — STUB (requires SWIFT Alliance Gateway + certification)
#   RabbitMQAdapter — STUB (pika library, can be activated easily)

import abc
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Abstract base — all adapters implement this interface
# ---------------------------------------------------------------------------

class AbstractQueueAdapter(abc.ABC):
    """
    WHY THIS EXISTS:
    Single interface the Workflow Engine calls regardless of underlying MQ system.
    Adding a new MQ provider = subclass this, implement 4 methods, register in
    ADAPTER_REGISTRY below. Zero changes to the Workflow Engine.

    WHAT BREAKS IF REMOVED: PUBLISH_TO_QUEUE and AWAIT_QUEUE_RESPONSE step_types
    have no concrete implementation to call.
    """

    def __init__(self, connection_params: Dict[str, Any], credential_ref: Optional[str] = None):
        self.connection_params = connection_params
        self.credential_ref = credential_ref
        self._connected = False

    @abc.abstractmethod
    def connect(self) -> None:
        """Establish connection to the external MQ system."""

    @abc.abstractmethod
    def disconnect(self) -> None:
        """Gracefully close the connection."""

    @abc.abstractmethod
    def publish(
        self,
        physical_queue_name: str,
        payload: Dict[str, Any],
        correlation_id: str,
        message_format: str = "JSON",
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Publish a message to the named queue.
        Returns: (success, message_id, error_message)
        """

    @abc.abstractmethod
    def consume_one(
        self,
        physical_queue_name: str,
        timeout_sec: int = 30,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """
        Consume a single message from the named queue (blocking up to timeout_sec).
        Returns: (message_dict, error_message) — message_dict is None if timeout.
        The message_dict must contain 'correlation_id' for workflow resumption matching.
        """

    @abc.abstractmethod
    def health_check(self) -> Tuple[bool, str]:
        """
        Returns: (is_healthy, status_message)
        Called by the connection health monitor every heartbeat_interval_sec.
        """

    def _resolve_credential(self) -> Optional[str]:
        """
        WHY: ADR #2 — credentials must be fetched from vault, never stored in DB.
        In production this calls HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault.
        For local dev with no vault configured, logs a warning and returns None.
        """
        if not self.credential_ref:
            return None
        import os
        # Production: replace with vault SDK call using self.credential_ref
        env_val = os.getenv(self.credential_ref.replace("/", "_").upper())
        if not env_val:
            logger.warning(f"Credential ref '{self.credential_ref}' not found in environment. "
                           f"Configure vault integration for production.")
        return env_val


# ---------------------------------------------------------------------------
# Kafka Adapter — FUNCTIONAL
# ---------------------------------------------------------------------------

class KafkaAdapter(AbstractQueueAdapter):
    """
    WHY THIS EXISTS:
    Functional Kafka adapter using confluent-kafka-python. Kafka is the reference
    implementation — easiest to run locally (docker-compose), no license required.
    Used as the local dev / CI queue backend before IBM MQ / TIBCO are configured.

    connection_params shape:
      {
        "bootstrap_servers": "localhost:9092",
        "security_protocol": "PLAINTEXT",   # PLAINTEXT | SSL | SASL_SSL
        "group_id": "infinity-payment-hub",
        "auto_offset_reset": "earliest"
      }
    """

    def __init__(self, connection_params: Dict[str, Any], credential_ref: Optional[str] = None):
        super().__init__(connection_params, credential_ref)
        self._producer = None
        self._consumer = None

    def connect(self) -> None:
        try:
            from confluent_kafka import Producer, Consumer
            producer_conf = {
                "bootstrap.servers": self.connection_params.get("bootstrap_servers", "localhost:9092"),
                "security.protocol": self.connection_params.get("security_protocol", "PLAINTEXT"),
            }
            consumer_conf = {
                **producer_conf,
                "group.id": self.connection_params.get("group_id", "infinity-queue-listener"),
                "auto.offset.reset": self.connection_params.get("auto_offset_reset", "earliest"),
            }
            self._producer = Producer(producer_conf)
            self._consumer = Consumer(consumer_conf)
            self._connected = True
            logger.info("Kafka adapter connected to %s", self.connection_params.get("bootstrap_servers"))
        except ImportError:
            logger.warning("confluent-kafka not installed. Run: pip install confluent-kafka")
        except Exception as exc:
            logger.error("Kafka connect failed: %s", exc)
            raise

    def disconnect(self) -> None:
        if self._producer:
            self._producer.flush(timeout=10)
        if self._consumer:
            self._consumer.close()
        self._connected = False

    def publish(
        self,
        physical_queue_name: str,
        payload: Dict[str, Any],
        correlation_id: str,
        message_format: str = "JSON",
    ) -> Tuple[bool, str, Optional[str]]:
        if not self._connected or not self._producer:
            return False, "", "Kafka producer not connected"
        try:
            message_id = f"MSG-{uuid.uuid4().hex[:12].upper()}"
            envelope = {
                "message_id": message_id,
                "correlation_id": correlation_id,
                "timestamp": datetime.utcnow().isoformat(),
                "format": message_format,
                "payload": payload,
            }
            self._producer.produce(
                topic=physical_queue_name,
                key=correlation_id.encode(),
                value=json.dumps(envelope).encode(),
                # callback logged on delivery report
                on_delivery=lambda err, msg: logger.error("Kafka delivery error: %s", err) if err else None,
            )
            self._producer.poll(0)
            return True, message_id, None
        except Exception as exc:
            return False, "", str(exc)

    def consume_one(
        self,
        physical_queue_name: str,
        timeout_sec: int = 30,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        if not self._connected or not self._consumer:
            return None, "Kafka consumer not connected"
        try:
            self._consumer.subscribe([physical_queue_name])
            msg = self._consumer.poll(timeout=timeout_sec)
            if msg is None:
                return None, None  # timeout — no message
            if msg.error():
                return None, str(msg.error())
            envelope = json.loads(msg.value().decode())
            return envelope, None
        except Exception as exc:
            return None, str(exc)

    def health_check(self) -> Tuple[bool, str]:
        return (self._connected, "Connected" if self._connected else "Not connected")


# ---------------------------------------------------------------------------
# IBM MQ Adapter — STUB (requires pymqi + IBM MQ client libraries)
# ---------------------------------------------------------------------------

class IBMMQAdapter(AbstractQueueAdapter):
    """
    WHY THIS EXISTS:
    IBM MQ is the dominant MQ system in Tier-1 banks for SWIFT and CHIPS payment
    processing. It provides exactly-once delivery and transactional messaging —
    dequeue and DB commit happen in the same two-phase commit. This is the gold
    standard for payment reliability.

    TO ACTIVATE: pip install pymqi
    IBM MQ client libraries must be installed separately (licensed from IBM).
    Set connection_params:
      {
        "host": "mq.bank.internal",
        "port": 1414,
        "channel": "INFINITY.SVRCONN",
        "queue_manager": "QM_PAYMENTS"
      }
    """

    def connect(self) -> None:
        # WHY STUB: pymqi requires IBM MQ client C libraries which are licensed.
        # The interface is complete — swap this comment for the real implementation
        # once IBM MQ client is installed and the queue manager is provisioned.
        logger.warning("IBMMQAdapter: stub — install pymqi and IBM MQ client to activate. "
                       "See: https://github.com/dsuch/pymqi")
        self._connected = False

    def disconnect(self) -> None:
        pass

    def publish(self, physical_queue_name, payload, correlation_id, message_format="ISO_20022"):
        return False, "", "IBM MQ adapter not yet activated. Install pymqi + IBM MQ client."

    def consume_one(self, physical_queue_name, timeout_sec=30):
        return None, "IBM MQ adapter not yet activated."

    def health_check(self):
        return False, "IBM MQ adapter stub — not connected"


# ---------------------------------------------------------------------------
# TIBCO EMS Adapter — STUB (requires TIBCO EMS client)
# ---------------------------------------------------------------------------

class TIBCOAdapter(AbstractQueueAdapter):
    """
    WHY THIS EXISTS:
    TIBCO EMS is the dominant MQ in capital markets and Finastra-integrated banks.
    Topic-based pub/sub with durable subscriptions. High throughput for derivatives
    and FX trade processing.

    TO ACTIVATE: install TIBCO EMS Python client (proprietary, from TIBCO).
    Set connection_params:
      {
        "provider_url": "tcp://tibco.bank.internal:7222",
        "connection_factory": "ConnectionFactory"
      }
    """

    def connect(self) -> None:
        logger.warning("TIBCOAdapter: stub — requires TIBCO EMS Python client (licensed). "
                       "Contact TIBCO Software for client SDK.")
        self._connected = False

    def disconnect(self) -> None:
        pass

    def publish(self, physical_queue_name, payload, correlation_id, message_format="ISO_20022"):
        return False, "", "TIBCO EMS adapter not yet activated."

    def consume_one(self, physical_queue_name, timeout_sec=30):
        return None, "TIBCO EMS adapter not yet activated."

    def health_check(self):
        return False, "TIBCO EMS adapter stub — not connected"


# ---------------------------------------------------------------------------
# Oracle AQ Adapter — STUB (requires cx_Oracle + Oracle DB)
# ---------------------------------------------------------------------------

class OracleAQAdapter(AbstractQueueAdapter):
    """
    WHY THIS EXISTS:
    Oracle Advanced Queuing (AQ) is embedded in Oracle DB — used by banks running
    Oracle FLEXCUBE. Messages are stored in Oracle tables, making queue operations
    part of the same DB transaction as the payment record updates. Zero-loss guarantee.

    TO ACTIVATE: pip install cx_Oracle (or oracledb)
    Set connection_params:
      {
        "dsn": "oracle.bank.internal:1521/PAYMENTS",
        "schema": "FLEXCUBE_AQ"
      }
    """

    def connect(self) -> None:
        logger.warning("OracleAQAdapter: stub — install cx_Oracle or oracledb and configure DSN. "
                       "pip install oracledb")
        self._connected = False

    def disconnect(self) -> None:
        pass

    def publish(self, physical_queue_name, payload, correlation_id, message_format="ISO_20022"):
        return False, "", "Oracle AQ adapter not yet activated."

    def consume_one(self, physical_queue_name, timeout_sec=30):
        return None, "Oracle AQ adapter not yet activated."

    def health_check(self):
        return False, "Oracle AQ adapter stub — not connected"


# ---------------------------------------------------------------------------
# SWIFT Alliance Adapter — STUB (requires SWIFT Alliance Gateway + certification)
# ---------------------------------------------------------------------------

class SWIFTAllianceAdapter(AbstractQueueAdapter):
    """
    WHY THIS EXISTS:
    SWIFT Alliance Gateway is the connection point for SWIFT member banks. Messages
    are ISO 20022 MX (pacs.008 for credit transfers, pacs.002 for status reports)
    or legacy SWIFT FIN (MT103, MT202). The adapter handles message envelope wrapping
    (BizMsgIdr, MsgDefIdr, BizSvc headers) required by the SWIFT network.

    TO ACTIVATE: Requires SWIFT Alliance Access or SWIFT Alliance Gateway installation,
    SWIFT BIC registration, and network certification. This is months of enterprise work.

    connection_params:
      {
        "swift_bn": "BOFAUS3NXXX",
        "service_name": "swift.fin!p",
        "requestor_dn": "cn=infinity,o=bank,o=swift",
        "responder_dn": "cn=swift,o=swift"
      }
    """

    def connect(self) -> None:
        logger.warning("SWIFTAllianceAdapter: stub — requires SWIFT Alliance Gateway installation "
                       "and BIC registration. This is a certified enterprise integration. "
                       "See: https://www.swift.com/our-solutions/interfaces-and-integration/alliance-gateway")
        self._connected = False

    def disconnect(self) -> None:
        pass

    def publish(self, physical_queue_name, payload, correlation_id, message_format="ISO_20022"):
        return False, "", "SWIFT Alliance adapter not yet activated."

    def consume_one(self, physical_queue_name, timeout_sec=30):
        return None, "SWIFT Alliance adapter not yet activated."

    def health_check(self):
        return False, "SWIFT Alliance adapter stub — not connected"


# ---------------------------------------------------------------------------
# Adapter registry — maps provider string to adapter class
# ---------------------------------------------------------------------------

ADAPTER_REGISTRY: Dict[str, type] = {
    "KAFKA":           KafkaAdapter,
    "IBM_MQ":          IBMMQAdapter,
    "TIBCO_EMS":       TIBCOAdapter,
    "ORACLE_AQ":       OracleAQAdapter,
    "SWIFT_ALLIANCE":  SWIFTAllianceAdapter,
    # RabbitMQ: add RabbitMQAdapter class and register here when needed
}


def get_adapter(provider: str, connection_params: Dict[str, Any], credential_ref: Optional[str] = None) -> AbstractQueueAdapter:
    """
    Factory function. Returns an initialised (but not yet connected) adapter for
    the given provider. The Workflow Engine calls this, then calls adapter.connect()
    before publishing or consuming.
    """
    adapter_cls = ADAPTER_REGISTRY.get(provider.upper())
    if not adapter_cls:
        raise ValueError(f"Unknown queue provider '{provider}'. "
                         f"Supported: {list(ADAPTER_REGISTRY.keys())}")
    return adapter_cls(connection_params=connection_params, credential_ref=credential_ref)
