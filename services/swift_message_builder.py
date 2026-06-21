# WHY THIS FILE EXISTS:
# ISO 20022 message serialisation and deserialisation for SWIFT payment processing.
# The two messages that drive cross-border payment workflows:
#
#   pacs.008.001.10 — FI to FI Customer Credit Transfer
#     Outbound: our workflow publishes this to instruct the correspondent bank
#     Fields sourced from the ISO 20022 Field Registry via the workflow context
#
#   pacs.002.001.10 — Payment Status Report
#     Inbound: correspondent bank or clearing system sends this back
#     Content drives ROUTE_ON_RESPONSE to COMPLETE, REPAIR, or COMPLIANCE queues
#
# WHY WE USE THE FIELD REGISTRY AS THE MAPPING LAYER:
# The Field Registry contains all 3,013 ISO 20022 fields with their technical_sys_name
# as the stable machine-readable identifier. The DGE Mapper maps incoming raw messages
# to these technical_sys_names. The pacs.008 builder reads from those same names.
# This means the entire data pipeline — inbound file → Field Registry → Formula Engine
# → Business Rules → Workflow → pacs.008 outbound — uses a single consistent vocabulary.
#
# Phase 4 implementation status:
#   build_pacs008()   — functional field mapping, XML envelope generation
#   parse_pacs002()   — functional response code extraction for queue routing
#   Full SWIFT Alliance Gateway integration requires certification (enterprise work)

import uuid
import logging
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# pacs.008 field mapping — ISO 20022 technical_sys_name → XML path
# ---------------------------------------------------------------------------
# WHY THIS MAP EXISTS:
# Every field name here is a technical_sys_name from the ISO 20022 Field Registry.
# This is not arbitrary — it's the exact field the DGE Mapper writes into the
# workflow context when it processes an inbound payment file. The pacs.008 builder
# reads from the same keys, ensuring the end-to-end pipeline is vocabulary-consistent.

PACS008_FIELD_MAP = {
    # Credit Transfer Transaction Information
    "INSTRUCTED_AMOUNT":        "CdtTrfTxInf/Amt/InstdAmt",
    "INSTRUCTED_CURRENCY":      "CdtTrfTxInf/Amt/InstdAmt/@Ccy",
    "INTERBANK_SETTLEMENT_AMT": "CdtTrfTxInf/IntrBkSttlmAmt",
    "SETTLEMENT_CURRENCY":      "CdtTrfTxInf/IntrBkSttlmAmt/@Ccy",
    "CHARGE_BEARER":            "CdtTrfTxInf/ChrgBr",        # DEBT | CRED | SHAR | SLEV
    "PAYMENT_END_TO_END_ID":    "CdtTrfTxInf/PmtId/EndToEndId",
    "PAYMENT_INSTRUCTION_ID":   "CdtTrfTxInf/PmtId/InstrId",
    "TRANSACTION_ID":           "CdtTrfTxInf/PmtId/TxId",
    "CLEARING_SYSTEM_REF":      "CdtTrfTxInf/PmtId/ClrSysRef",

    # Debtor (sending customer)
    "DEBTOR_NAME":              "CdtTrfTxInf/Dbtr/Nm",
    "DEBTOR_ACCOUNT_IBAN":      "CdtTrfTxInf/DbtrAcct/Id/IBAN",
    "DEBTOR_ACCOUNT_OTHER":     "CdtTrfTxInf/DbtrAcct/Id/Othr/Id",
    "DEBTOR_AGENT_BIC":         "CdtTrfTxInf/DbtrAgt/FinInstnId/BICFI",
    "DEBTOR_COUNTRY":           "CdtTrfTxInf/Dbtr/PstlAdr/Ctry",

    # Creditor (receiving customer)
    "CREDITOR_NAME":            "CdtTrfTxInf/Cdtr/Nm",
    "CREDITOR_ACCOUNT_IBAN":    "CdtTrfTxInf/CdtrAcct/Id/IBAN",
    "CREDITOR_ACCOUNT_OTHER":   "CdtTrfTxInf/CdtrAcct/Id/Othr/Id",
    "CREDITOR_AGENT_BIC":       "CdtTrfTxInf/CdtrAgt/FinInstnId/BICFI",
    "CREDITOR_COUNTRY":         "CdtTrfTxInf/Cdtr/PstlAdr/Ctry",

    # Remittance information (payment reference for the beneficiary)
    "REMITTANCE_INFO_UNSTRUCTURED": "CdtTrfTxInf/RmtInf/Ustrd",
    "REMITTANCE_INFO_REFERENCE":    "CdtTrfTxInf/RmtInf/Strd/CdtrRefInf/Ref",

    # Regulatory / compliance fields
    "PURPOSE_CODE":             "CdtTrfTxInf/Purp/Cd",
    "REGULATORY_REPORTING":     "CdtTrfTxInf/RgltryRptg/Dtls/Cd",
}


def build_pacs008(context: Dict[str, Any], sending_bic: str, business_msg_id: Optional[str] = None) -> Tuple[str, str]:
    """
    WHY THIS EXISTS:
    Builds a pacs.008.001.10 (FI to FI Customer Credit Transfer) XML message
    from the workflow runtime context. The context keys are technical_sys_names
    from the ISO 20022 Field Registry — the same vocabulary used across all studios.

    Returns: (xml_string, business_msg_id)
    The business_msg_id is used as the CorrelationID when publishing to the queue,
    so the incoming pacs.002 response can be matched back to this workflow instance.

    WHAT BREAKS IF REMOVED: PUBLISH_TO_QUEUE step_type cannot generate the ISO 20022
    message body. The outbound payment to SWIFT/CHIPS has no content.
    """
    if not business_msg_id:
        business_msg_id = f"BIZID-{uuid.uuid4().hex[:16].upper()}"

    now = datetime.utcnow()
    creation_dt = now.strftime("%Y-%m-%dT%H:%M:%S")
    settlement_date = context.get("SETTLEMENT_DATE") or now.strftime("%Y-%m-%d")

    # Extract key fields from workflow context
    instructed_amount = context.get("INSTRUCTED_AMOUNT", "0")
    instructed_ccy = context.get("INSTRUCTED_CURRENCY", "USD")
    end_to_end_id = context.get("PAYMENT_END_TO_END_ID") or f"E2E-{uuid.uuid4().hex[:12].upper()}"
    instr_id = context.get("PAYMENT_INSTRUCTION_ID") or f"INSTR-{uuid.uuid4().hex[:8].upper()}"
    tx_id = context.get("TRANSACTION_ID") or f"TXN-{uuid.uuid4().hex[:12].upper()}"

    debtor_name = context.get("DEBTOR_NAME", "")
    debtor_iban = context.get("DEBTOR_ACCOUNT_IBAN", "")
    debtor_other = context.get("DEBTOR_ACCOUNT_OTHER", "")
    debtor_bic = context.get("DEBTOR_AGENT_BIC", sending_bic)

    creditor_name = context.get("CREDITOR_NAME", "")
    creditor_iban = context.get("CREDITOR_ACCOUNT_IBAN", "")
    creditor_other = context.get("CREDITOR_ACCOUNT_OTHER", "")
    creditor_bic = context.get("CREDITOR_AGENT_BIC", "")

    remittance = context.get("REMITTANCE_INFO_UNSTRUCTURED", "")
    charge_bearer = context.get("CHARGE_BEARER", "SLEV")

    # Debtor account element — prefer IBAN, fall back to Othr
    if debtor_iban:
        debtor_acct_xml = f"<IBAN>{debtor_iban}</IBAN>"
    else:
        debtor_acct_xml = f"<Othr><Id>{debtor_other}</Id></Othr>"

    # Creditor account element
    if creditor_iban:
        creditor_acct_xml = f"<IBAN>{creditor_iban}</IBAN>"
    else:
        creditor_acct_xml = f"<Othr><Id>{creditor_other}</Id></Othr>"

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>{business_msg_id}</MsgId>
      <CreDtTm>{creation_dt}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <TtlIntrBkSttlmAmt Ccy="{instructed_ccy}">{instructed_amount}</TtlIntrBkSttlmAmt>
      <IntrBkSttlmDt>{settlement_date}</IntrBkSttlmDt>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>{instr_id}</InstrId>
        <EndToEndId>{end_to_end_id}</EndToEndId>
        <TxId>{tx_id}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="{instructed_ccy}">{instructed_amount}</IntrBkSttlmAmt>
      <ChrgBr>{charge_bearer}</ChrgBr>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>{debtor_bic}</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <Dbtr>
        <Nm>{debtor_name}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>{debtor_acct_xml}</Id>
      </DbtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>{creditor_bic}</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>{creditor_name}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>{creditor_acct_xml}</Id>
      </CdtrAcct>
      <RmtInf>
        <Ustrd>{remittance}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>"""

    return xml.strip(), business_msg_id


def parse_pacs002(message_body: Any) -> Dict[str, Any]:
    """
    WHY THIS EXISTS:
    Parses a pacs.002.001.10 (Payment Status Report) message — the response from
    SWIFT or a clearing system confirming whether a payment was accepted, rejected,
    or is pending. The parsed fields drive the QueueRoutingRule matching in
    ROUTE_ON_RESPONSE workflow step_type.

    Key pacs.002 status codes (ISO 20022 standard):
      TxSts = ACSC → Accepted Settlement Completed → workflow COMPLETE
      TxSts = RJCT → Rejected → check StsRsnInf.Rsn.Cd for specific reason:
        AC01 → Incorrect account number → REPAIR queue
        AM04 → Insufficient funds → FUNDS queue
        AM05 → Duplicate payment → DUPLICATE queue
        BE04 → Missing beneficiary address → REPAIR queue
        ED05 → Settlement failed → ESCALATION queue
        MS03 → Reason not specified → MANUAL queue
      TxSts = PDNG → Pending → stay AWAITING_RESPONSE
      TxSts = ACCP → Accepted and pending → stay AWAITING_RESPONSE

    Handles both XML (real SWIFT) and JSON (internal / test) formats.

    Returns a flat dict of extracted fields suitable for QueueRoutingRule match_field lookup.
    """
    extracted: Dict[str, Any] = {}

    if isinstance(message_body, dict):
        # JSON format (internal messages, test harness, Kafka envelopes)
        payload = message_body.get("payload", message_body)
        extracted["TxSts"] = payload.get("TxSts") or payload.get("transaction_status")
        extracted["StsRsnInf.Rsn.Cd"] = (
            payload.get("StsRsnInf", {}).get("Rsn", {}).get("Cd")
            or payload.get("status_reason_code")
        )
        extracted["OrgnlEndToEndId"] = payload.get("OrgnlEndToEndId") or payload.get("original_end_to_end_id")
        extracted["OrgnlTxId"] = payload.get("OrgnlTxId") or payload.get("original_transaction_id")
        extracted["correlation_id"] = message_body.get("correlation_id") or payload.get("correlation_id")
        extracted["raw"] = message_body

    elif isinstance(message_body, (str, bytes)):
        # XML format (real SWIFT pacs.002)
        try:
            import xml.etree.ElementTree as ET
            body = message_body if isinstance(message_body, str) else message_body.decode()
            ns = {"p": "urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10"}
            root = ET.fromstring(body)

            # Navigate pacs.002 structure
            tx_inf = root.find(".//p:TxInfAndSts", ns) or root.find(".//TxInfAndSts")
            if tx_inf is not None:
                tx_sts = tx_inf.find("p:TxSts", ns) or tx_inf.find("TxSts")
                if tx_sts is not None:
                    extracted["TxSts"] = tx_sts.text

                rsn = tx_inf.find(".//p:Rsn/p:Cd", ns) or tx_inf.find(".//Rsn/Cd")
                if rsn is not None:
                    extracted["StsRsnInf.Rsn.Cd"] = rsn.text

                orig_e2e = tx_inf.find("p:OrgnlEndToEndId", ns) or tx_inf.find("OrgnlEndToEndId")
                if orig_e2e is not None:
                    extracted["OrgnlEndToEndId"] = orig_e2e.text

                orig_tx = tx_inf.find("p:OrgnlTxId", ns) or tx_inf.find("OrgnlTxId")
                if orig_tx is not None:
                    extracted["OrgnlTxId"] = orig_tx.text

            # BizMsgIdr in business application header = our CorrelationID
            hdr = root.find(".//p:BizMsgIdr", ns) or root.find(".//BizMsgIdr")
            if hdr is not None:
                extracted["correlation_id"] = hdr.text

            extracted["raw"] = body

        except Exception as exc:
            logger.error("pacs.002 XML parse error: %s", exc)
            extracted["parse_error"] = str(exc)

    else:
        logger.warning("parse_pacs002: unexpected message_body type %s", type(message_body))

    # Derive composite status code for simpler QueueRoutingRule matching
    # e.g. "RJCT:AC01" for rejected + account error — matches rule pattern "RJCT:AC01"
    tx_sts = extracted.get("TxSts", "")
    rsn_cd = extracted.get("StsRsnInf.Rsn.Cd", "")
    if tx_sts and rsn_cd:
        extracted["composite_status"] = f"{tx_sts}:{rsn_cd}"
    else:
        extracted["composite_status"] = tx_sts

    return extracted


def evaluate_routing_rules(parsed_response: Dict[str, Any], rules: list) -> Optional[Dict[str, Any]]:
    """
    WHY THIS EXISTS:
    Evaluates QueueRoutingRule records against a parsed pacs.002 response.
    Rules are sorted by priority (ascending — lowest number wins).
    Returns the first matching rule, or None if no rule matches (logs a warning —
    an unmatched response should never silently pass through as COMPLETE).

    Called by the ROUTE_ON_RESPONSE workflow step_type in the WorkflowExecutor.
    """
    import re

    sorted_rules = sorted(rules, key=lambda r: getattr(r, "priority", 100))

    for rule in sorted_rules:
        field_value = str(parsed_response.get(rule.match_field, ""))
        pattern = rule.match_pattern
        match_type = rule.match_type.upper()

        matched = False
        if match_type == "EXACT":
            matched = field_value == pattern
        elif match_type == "STARTSWITH":
            matched = field_value.startswith(pattern)
        elif match_type == "CONTAINS":
            matched = pattern in field_value
        elif match_type == "REGEX":
            matched = bool(re.match(pattern, field_value))

        if matched:
            return {
                "rule_id": rule.rule_id,
                "rule_name": rule.rule_name,
                "target_workflow_state": rule.target_workflow_state,
                "target_queue_id": rule.target_queue_id,
                "alert_queue_administrators": rule.alert_queue_administrators,
                "alert_message": rule.alert_message,
            }

    logger.warning(
        "evaluate_routing_rules: no rule matched for response %s. "
        "This is a configuration gap — add a catch-all rule for unmatched responses.",
        parsed_response.get("composite_status", "UNKNOWN"),
    )
    return None
