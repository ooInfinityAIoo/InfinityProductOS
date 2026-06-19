"""
Golden Path Seed: Cross-Border SWIFT Wire Transfer
Scenario: US Bank sends $1,000,000 USD to UK beneficiary via SWIFT pacs.008
This exercises every Canva Studio in the platform.
"""
import sqlite3
import json
import uuid
import datetime

DB = "infinity_db.sqlite"
NOW = datetime.datetime.utcnow().isoformat()
SEED_USER = "GOLDEN_PATH_SEED"

conn = sqlite3.connect(DB)
c = conn.cursor()

def uid(prefix=""):
    return f"{prefix}{str(uuid.uuid4())[:8].upper()}"

pkg_id = c.execute("SELECT package_id FROM master_product_application_packages WHERE package_name='Payment Hub' LIMIT 1").fetchone()
if not pkg_id:
    print("ERROR: Payment Hub package not found. Run seed.py first.")
    exit(1)
PKG_ID = pkg_id[0]
print(f"Using Package: {PKG_ID}")

# ─────────────────────────────────────────────
# 1. MASTERS: Product + SubProduct
# ─────────────────────────────────────────────
PROD_ID = uid("PROD-")
SUB_ID = uid("SUB-")

c.execute("""INSERT OR IGNORE INTO product_master 
    (product_id, package_id, product_name, description, created_at, updated_at)
    VALUES (?,?,?,?,?,?)""",
    (PROD_ID, PKG_ID, "Cross-Border Payments",
     "Handles all cross-border wire transfers including SWIFT, SEPA, and RTGS payments.", NOW, NOW))

c.execute("""INSERT OR IGNORE INTO subproduct_master
    (subproduct_id, subproduct_name, product_id, description, created_at, updated_at)
    VALUES (?,?,?,?,?,?)""",
    (SUB_ID, "SWIFT MT103 Wire", PROD_ID,
     "High-value single customer credit transfers via SWIFT pacs.008 / MT103 message format.", NOW, NOW))

print(f"✓ Masters seeded: {PROD_ID} / {SUB_ID}")

# ─────────────────────────────────────────────
# 2. FILE TEMPLATE DESIGNER: SWIFT MT103 template
# ─────────────────────────────────────────────
TPL_ID = uid("TPL-")

c.execute("""INSERT OR IGNORE INTO template_designer_blueprints
    (template_id, template_name, template_type, file_type, extraction_mode, is_multi_sheet,
     file_has_header_footer, text_file_type, delimiter_record_separator, status, created_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
    (TPL_ID, "SWIFT MT103 Inbound Wire",
     "INBOUND", "TXT", "FIXED_LENGTH", 0, 1, "FIXED_WIDTH", None, "ACTIVE", NOW, SEED_USER))

# Template field addresses (SWIFT MT103 fixed positions)
field_addresses = [
    ("20", "Transaction Reference",    None, 1, 1, 1,  20, "ALPHANUMERIC", 1, 35),
    ("23B", "Bank Operation Code",     None, 1, 2, 1,  4,  "ALPHANUMERIC", 1, 4),
    ("32A_DATE", "Value Date",         None, 1, 3, 1,  6,  "DATE",         1, 6),
    ("32A_CCY", "Currency Code",       None, 1, 3, 8,  3,  "ALPHANUMERIC", 1, 3),
    ("32A_AMT", "Instructed Amount",   None, 1, 3, 12, 15, "AMOUNT",       1, 15),
    ("50K_NAME", "Ordering Customer",  None, 1, 4, 1,  35, "ALPHANUMERIC", 0, 35),
    ("56A", "Intermediary Bank BIC",   None, 1, 5, 1,  11, "ALPHANUMERIC", 0, 11),
    ("57A", "Account with Bank BIC",   None, 1, 6, 1,  11, "ALPHANUMERIC", 1, 11),
    ("59_IBAN", "Beneficiary IBAN",    None, 1, 7, 1,  34, "ALPHANUMERIC", 1, 34),
    ("59_NAME", "Beneficiary Name",    None, 1, 8, 1,  35, "ALPHANUMERIC", 1, 35),
    ("70", "Remittance Information",   None, 1, 9, 1,  140,"ALPHANUMERIC", 0, 140),
    ("71A", "Details of Charges",      None, 1, 10,1,  3,  "ALPHANUMERIC", 1, 3),
    ("72", "Bank to Bank Info",        None, 1, 11,1,  35, "ALPHANUMERIC", 0, 35),
]

for fld in field_addresses:
    (tag, name, sheet, sheet_seq, start_row, col_seq, fl_end, dtype, mandatory, maxlen) = fld
    addr_id = uid("ADDR-")
    c.execute("""INSERT OR IGNORE INTO template_field_addresses
        (address_id, template_id, extracted_field_name, reading_mode, sheet_name, sheet_sequence_no,
         start_row, stop_row, column_sequence_no, cell_address_or_prompt, fixed_length_start, fixed_length_end,
         padding_character, padding_position, data_type_spec, mandatory_status, max_length, min_length,
         populate_default_value, is_amount_decimal, decimal_places_precision, currency_code)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (addr_id, TPL_ID, tag, "FIXED_LENGTH", "MT103", sheet_seq,
         start_row, start_row, col_seq, name, 1, fl_end,
         " ", "RIGHT", dtype, "MANDATORY" if mandatory else "NON_MANDATORY", maxlen, 1,
         0, 1 if dtype == "AMOUNT" else 0, 2 if dtype == "AMOUNT" else 0,
         "USD" if dtype == "AMOUNT" else None))

print(f"✓ File Template seeded: {TPL_ID} with {len(field_addresses)} field addresses")

# ─────────────────────────────────────────────
# 3. DATA GATEWAY MAPPER: MT103 → ISO pacs.008
# ─────────────────────────────────────────────
MAPPER_ID = uid("MAP-")

c.execute("""INSERT OR IGNORE INTO payload_mapper_blueprints
    (mapper_id, mapper_name, source_template_id, target_format, mapping_direction, status,
     application_package_id, product_id, subproduct_id, created_at, created_by, file_control_totals)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
    (MAPPER_ID, "MT103 → ISO pacs.008 Field Mapper",
     TPL_ID, "ISO_20022_PACS008", "INBOUND_TO_CANONICAL",
     "ACTIVE", PKG_ID, PROD_ID, SUB_ID, NOW, SEED_USER,
     json.dumps({"total_amount_field": "32A_AMT", "record_count_field": None})))

# Field mappings: MT103 tag → ISO field
field_mappings = [
    ("20",          "Message.ID",                                   "PASSTHROUGH",    None,   1),
    ("32A_DATE",    "FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt","PASSTHROUGH",    None,   1),
    ("32A_CCY",     "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Ccy",  "PASSTHROUGH",   None,   1),
    ("32A_AMT",     "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt",  "PASSTHROUGH",   None,   1),
    ("50K_NAME",    "FIToFICstmrCdtTrf.CdtTrfTxInf.Dbtr.Nm",       "PASSTHROUGH",   None,   0),
    ("57A",         "FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAgt.BICFI", "PASSTHROUGH",   None,   1),
    ("59_IBAN",     "FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAcct.Id",   "PASSTHROUGH",   None,   1),
    ("59_NAME",     "FIToFICstmrCdtTrf.CdtTrfTxInf.Cdtr.Nm",       "PASSTHROUGH",   None,   1),
    ("70",          "FIToFICstmrCdtTrf.CdtTrfTxInf.RmtInf.Ustrd",  "PASSTHROUGH",   None,   0),
    ("71A",         "FIToFICstmrCdtTrf.CdtTrfTxInf.ChrgBr",        "LOOKUP_TABLE",   None,  1),
    ("32A_AMT",     "FIToFICstmrCdtTrf.CdtTrfTxInf.SttlmAmt.Amt",  "CALCULATION",  "FX_CONVERTED_AMOUNT", 1),
]

for (src, tgt, rule, calc, mandatory) in field_mappings:
    mp_id = uid("MP-")
    c.execute("""INSERT OR IGNORE INTO payload_field_mappings
        (mapping_id, mapper_id, source_extracted_field, target_iso_field,
         transformation_rule_code, calculation_token_code, is_mandatory, default_value)
        VALUES (?,?,?,?,?,?,?,?)""",
        (mp_id, MAPPER_ID, src, tgt, rule, calc, mandatory, None))

print(f"✓ Data Gateway Mapper seeded: {MAPPER_ID} with {len(field_mappings)} mappings")

# ─────────────────────────────────────────────
# 4. CALCULATION ENGINE: FX Conversion Formula
# ─────────────────────────────────────────────
FORMULA_ID = uid("FORM-")

c.execute("""INSERT OR IGNORE INTO symbolic_formula_registry
    (asset_id, financial_domain, business_name, token_code, target_output_field,
     mathematical_expression, parameters, status, application_package_id, product_id,
     subproduct_id, description, created_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (FORMULA_ID, "PAYMENTS",
     "FX Converted Settlement Amount",
     "FX_CONVERTED_AMOUNT",
     "FIToFICstmrCdtTrf.CdtTrfTxInf.SttlmAmt.Amt",
     "(ATMAccountStatement2_Amount * ATMCurrencyConversion1_FinalRate)",
     json.dumps([
         {"name": "ATMAccountStatement2_Amount",       "iso_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt",  "type": "Amount"},
         {"name": "ATMCurrencyConversion1_FinalRate",  "iso_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.XchgRate",      "type": "Decimal"},
     ]),
     "ACTIVE", PKG_ID, PROD_ID, SUB_ID,
     "Converts the instructed amount to the settlement currency using the agreed FX rate from the currency conversion table.",
     NOW, SEED_USER))

print(f"✓ Calculation Engine formula seeded: FX_CONVERTED_AMOUNT ({FORMULA_ID})")

# ─────────────────────────────────────────────
# 5. BUSINESS RULES: 3 AML/Compliance rules
# ─────────────────────────────────────────────
rules = [
    {
        "id": uid("BRE-"),
        "name": "AML High-Value Threshold Alert",
        "token": "BRE-XBDR-AML-HVT-V1",
        "desc": "Flags any cross-border payment exceeding $500,000 USD for enhanced AML review before settlement.",
        "definition": {
            "conditions": [{"field": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt", "operator": "GREATER_THAN", "value": 500000}],
            "logical_operator": "AND",
            "actions": [
                {"type": "FLAG_FOR_REVIEW", "message": "High-value cross-border transfer requires AML enhanced due diligence review."},
                {"type": "EMIT_EVENT",      "event_code": "EVT_AML_HVT_FLAGGED"}
            ]
        }
    },
    {
        "id": uid("BRE-"),
        "name": "OFAC Beneficiary Screening",
        "token": "BRE-XBDR-OFAC-SCRN-V1",
        "desc": "Screens beneficiary name and bank BIC against OFAC SDN list. Blocks payment if match found.",
        "definition": {
            "conditions": [
                {"field": "FIToFICstmrCdtTrf.CdtTrfTxInf.Cdtr.Nm",        "operator": "NOT_IN_SANCTION_LIST", "list": "OFAC_SDN"},
                {"field": "FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAgt.BICFI",  "operator": "NOT_IN_SANCTION_LIST", "list": "OFAC_SDN"}
            ],
            "logical_operator": "AND",
            "actions": [
                {"type": "BLOCK_PAYMENT", "message": "Beneficiary or bank matched OFAC SDN list. Payment blocked pending compliance review."},
                {"type": "EMIT_EVENT",    "event_code": "EVT_OFAC_HIT_DETECTED"}
            ]
        }
    },
    {
        "id": uid("BRE-"),
        "name": "FX Rate Stale Check",
        "token": "BRE-XBDR-FX-STALE-V1",
        "desc": "Rejects the payment enrichment step if the provided FX rate is older than 15 minutes.",
        "definition": {
            "conditions": [{"field": "FIToFICstmrCdtTrf.CdtTrfTxInf.XchgRateAge_Mins", "operator": "LESS_THAN", "value": 15}],
            "logical_operator": "AND",
            "actions": [
                {"type": "REJECT_STEP", "message": "FX rate is stale (>15 minutes). Re-fetch current rate from treasury feed before proceeding."},
                {"type": "EMIT_EVENT",  "event_code": "EVT_FX_RATE_STALE"}
            ]
        }
    }
]

for rule in rules:
    c.execute("""INSERT OR IGNORE INTO business_rule_sets
        (rule_set_id, business_name, token_code, description, status,
         application_package_id, product_id, subproduct_id, definition, created_at, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (rule["id"], rule["name"], rule["token"], rule["desc"],
         "ACTIVE", PKG_ID, PROD_ID, SUB_ID, json.dumps(rule["definition"]), NOW, SEED_USER))
    print(f"  ✓ Rule: {rule['token']}")

print(f"✓ Business Rules seeded: {len(rules)} rules")

# ─────────────────────────────────────────────
# 6. WORKFLOW: 5-node Cross-Border Payment flow
# ─────────────────────────────────────────────
WF_ID = uid("WF-")

c.execute("""INSERT OR IGNORE INTO workflow_configurations
    (workflow_id, workflow_name, domain_scope, product_context, sub_product, version, status,
     application_package_id, product_id, subproduct_id, is_active, description,
     input_schema, output_schema, formulas_defined, created_at, created_by, updated_at, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (WF_ID, "Cross-Border SWIFT Wire Processing",
     "PAYMENTS", "Cross-Border Payments", "SWIFT MT103 Wire",
     "1.0", "ACTIVE", PKG_ID, PROD_ID, SUB_ID, 1,
     "End-to-end SWIFT pacs.008 payment processing: Ingestion → AML/OFAC screening → FX enrichment → Dual authorization → RTGS settlement → Reconciliation.",
     json.dumps({"transaction_reference": "string", "instructed_amount": "decimal", "currency": "string", "beneficiary_iban": "string", "beneficiary_name": "string", "value_date": "date"}),
     json.dumps({"settlement_status": "string", "settlement_amount": "decimal", "settlement_currency": "string", "gpi_uetr": "string"}),
     json.dumps([{"token": "FX_CONVERTED_AMOUNT", "applied_at_node": "ENRICH"}]),
     NOW, SEED_USER, NOW, SEED_USER))

# 5 workflow nodes
nodes = [
    ("NODE-01", 1, "MT103 Ingest & Parse",     "INGEST",
     [{"action": "INVOKE_TEMPLATE", "template_id": TPL_ID, "description": "Parse incoming SWIFT MT103 fixed-width file"},
      {"action": "INVOKE_MAPPER",   "mapper_id": MAPPER_ID, "description": "Map MT103 tags to ISO pacs.008 canonical fields"}],
     [], [], 1, None, 100, 100),

    ("NODE-02", 2, "AML & OFAC Screening",     "VALIDATE",
     [{"action": "INVOKE_RULE",  "rule_token": "BRE-XBDR-AML-HVT-V1",  "description": "Check if amount exceeds AML threshold"},
      {"action": "INVOKE_RULE",  "rule_token": "BRE-XBDR-OFAC-SCRN-V1", "description": "Screen beneficiary against OFAC SDN list"}],
     ["EVT_AML_HVT_FLAGGED", "EVT_OFAC_HIT_DETECTED"],
     ["SWIFT_KYC_CERT", "COUNTERPARTY_DUE_DILIGENCE_REPORT"],
     2, "FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt", 350, 100),

    ("NODE-03", 3, "FX Rate Enrichment",        "ENRICH",
     [{"action": "INVOKE_RULE",    "rule_token": "BRE-XBDR-FX-STALE-V1",  "description": "Validate FX rate freshness"},
      {"action": "INVOKE_FORMULA", "formula_token": "FX_CONVERTED_AMOUNT", "description": "Calculate GBP settlement amount at spot rate"}],
     ["EVT_FX_RATE_STALE"],
     [],
     1, None, 600, 100),

    ("NODE-04", 4, "Dual Authorization (4-Eyes)","APPROVE",
     [{"action": "REQUIRE_APPROVAL", "approvers": 2, "role": "PAYMENTS_MANAGER", "description": "Maker-checker authorization for high-value wires >$500k"},
      {"action": "EMIT_EVENT",       "event_code": "EVT_PAYMENT_AUTHORIZED"}],
     ["EVT_PAYMENT_AUTHORIZED"],
     [],
     1, "FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt", 850, 100),

    ("NODE-05", 5, "RTGS Settlement & GPI",     "SETTLE",
     [{"action": "INVOKE_API",   "api_name": "SWIFT_GPI_TRACKER_POST",   "description": "Submit payment to SWIFT gpi and receive UETR"},
      {"action": "INVOKE_API",   "api_name": "RTGS_SETTLEMENT_POST",     "description": "Confirm settlement via Bank of England RTGS"},
      {"action": "EMIT_EVENT",   "event_code": "EVT_PAYMENT_SETTLED"}],
     ["EVT_PAYMENT_SETTLED"],
     ["SETTLEMENT_CONFIRMATION"],
     1, None, 1100, 100),
]

for (nid, seq, title, code, steps, events, docs, sla, sla_anchor, cx, cy) in nodes:
    full_node_id = f"{WF_ID}_{nid}"
    c.execute("""INSERT OR IGNORE INTO workflow_nodes
        (node_id, workflow_id, sequence_number, node_title, node_code, canvas_x_position, canvas_y_position,
         orchestration_steps, events_broadcast, required_documents, sla_days, sla_anchor_field,
         screen_template, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (full_node_id, WF_ID, seq, title, code, cx, cy,
         json.dumps(steps), json.dumps(events), json.dumps(docs),
         sla, sla_anchor, None, NOW, NOW))

# Workflow edges (linear flow)
for i in range(len(nodes)-1):
    src_id = f"{WF_ID}_{nodes[i][0]}"
    tgt_id = f"{WF_ID}_{nodes[i+1][0]}"
    c.execute("""INSERT OR IGNORE INTO workflow_edges
        (edge_id, workflow_id, source_node_id, target_node_id, edge_condition, created_at)
        VALUES (?,?,?,?,?,?)""",
        (uid("EDGE-"), WF_ID, src_id, tgt_id, '"DEFAULT"', NOW))

print(f"✓ Workflow seeded: {WF_ID} with {len(nodes)} nodes")

# ─────────────────────────────────────────────
# 7. SCREEN DESIGNER: Payment Entry screen
# ─────────────────────────────────────────────
SCR_ID = uid("SCR-")

screen_components = [
    {"component_type": "text_input",  "label_token": "LBL_TXN_REF",       "field_binding": "Message.ID",                                               "requirement_status": "MANDATORY",     "conditional_rule_id": None},
    {"component_type": "date_picker", "label_token": "LBL_VALUE_DATE",     "field_binding": "FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt",            "requirement_status": "MANDATORY",     "conditional_rule_id": None},
    {"component_type": "number_input","label_token": "LBL_INSTD_AMT",      "field_binding": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt",             "requirement_status": "MANDATORY",     "conditional_rule_id": None},
    {"component_type": "dropdown",    "label_token": "LBL_CURRENCY",       "field_binding": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Ccy",             "requirement_status": "MANDATORY",     "conditional_rule_id": None},
    {"component_type": "text_input",  "label_token": "LBL_CDTR_NM",        "field_binding": "FIToFICstmrCdtTrf.CdtTrfTxInf.Cdtr.Nm",                 "requirement_status": "MANDATORY",     "conditional_rule_id": None},
    {"component_type": "text_input",  "label_token": "LBL_CDTR_IBAN",      "field_binding": "FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAcct.Id",             "requirement_status": "MANDATORY",     "conditional_rule_id": None},
    {"component_type": "text_input",  "label_token": "LBL_CDTR_BIC",       "field_binding": "FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAgt.BICFI",           "requirement_status": "MANDATORY",     "conditional_rule_id": None},
    {"component_type": "text_input",  "label_token": "LBL_RMTINF",         "field_binding": "FIToFICstmrCdtTrf.CdtTrfTxInf.RmtInf.Ustrd",            "requirement_status": "NON_MANDATORY", "conditional_rule_id": None},
    {"component_type": "dropdown",    "label_token": "LBL_CHRG_BR",        "field_binding": "FIToFICstmrCdtTrf.CdtTrfTxInf.ChrgBr",                  "requirement_status": "MANDATORY",     "conditional_rule_id": None},
    {"component_type": "number_input","label_token": "LBL_FX_RATE",        "field_binding": "FIToFICstmrCdtTrf.CdtTrfTxInf.XchgRate",                "requirement_status": "CONDITIONAL",   "conditional_rule_id": None},
]

c.execute("""INSERT OR IGNORE INTO screen_templates
    (screen_id, screen_name, description, status, screen_template_category,
     application_package_id, product_id, subproduct_id, workflow_id, workflow_step_id,
     definition, created_at, updated_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (SCR_ID, "SWIFT Wire Payment Entry",
     "Maker entry screen for initiating a new SWIFT MT103 cross-border wire transfer. All ISO fields are bound to the pacs.008 canonical model.",
     "ACTIVE", "DATA_ENTRY_FORM", PKG_ID, PROD_ID, SUB_ID,
     WF_ID, None,
     json.dumps({"components": screen_components, "layout": "SINGLE_COLUMN", "theme": "PAYMENT_BLUE"}),
     NOW, NOW, SEED_USER))

print(f"✓ Screen Designer seeded: {SCR_ID} with {len(screen_components)} components")

# ─────────────────────────────────────────────
# 8. API DESIGNER: SWIFT GPI + RTGS endpoints
# ─────────────────────────────────────────────
apis = [
    {
        "id": uid("API-"),
        "name": "SWIFT GPI Tracker — Submit Payment",
        "method": "POST",
        "url": "https://sandbox.swift.com/swift-apitracker/v4/payments",
        "request_body": json.dumps({
            "uetr": "{{generated_uuid}}",
            "transaction_reference": "{{Message.ID}}",
            "instructed_amount": "{{FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt}}",
            "instructed_currency": "{{FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Ccy}}",
            "creditor_bic": "{{FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAgt.BICFI}}",
            "value_date": "{{FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt}}"
        }),
        "headers": json.dumps({"Authorization": "Bearer {{swift_oauth_token}}", "X-BEID": "{{beid}}", "Content-Type": "application/json"}),
        "mask_pii": 1,
        "rate_limit": 50,
        "cb_threshold": 5,
        "cb_timeout": 30,
        "desc": "Submits a pacs.008 credit transfer to the SWIFT GPI network and returns a UETR tracking reference."
    },
    {
        "id": uid("API-"),
        "name": "Bank of England RTGS — Settlement Confirmation",
        "method": "POST",
        "url": "https://api.bankofengland.co.uk/rtgs/v2/settlements",
        "request_body": json.dumps({
            "settlement_amount": "{{FX_CONVERTED_AMOUNT}}",
            "settlement_currency": "GBP",
            "debtor_account": "{{nostro_account_number}}",
            "creditor_iban": "{{FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAcct.Id}}",
            "payment_reference": "{{Message.ID}}",
            "gpi_uetr": "{{swift_gpi_uetr}}"
        }),
        "headers": json.dumps({"Authorization": "Bearer {{boe_api_token}}", "Content-Type": "application/json"}),
        "mask_pii": 1,
        "rate_limit": 20,
        "cb_threshold": 3,
        "cb_timeout": 60,
        "desc": "Confirms final GBP settlement in the Bank of England RTGS system using the FX-converted amount."
    },
]

for api in apis:
    c.execute("""INSERT OR IGNORE INTO api_configurations
        (api_id, api_name, http_method, url_template, request_body_template, headers,
         mask_pii_in_body, rate_limit_rps, circuit_breaker_threshold, circuit_breaker_timeout_sec,
         description, status, application_package_id, product_id, subproduct_id, created_at, created_by,
         updated_at, updated_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (api["id"], api["name"], api["method"], api["url"], api["request_body"], api["headers"],
         api["mask_pii"], api["rate_limit"], api["cb_threshold"], api["cb_timeout"],
         api["desc"], "ACTIVE", PKG_ID, PROD_ID, SUB_ID, NOW, SEED_USER, NOW, SEED_USER))
    print(f"  ✓ API: {api['name']}")

print(f"✓ API Designer seeded: {len(apis)} endpoints")

# ─────────────────────────────────────────────
# 9. RECONCILIATION ENGINE: Nostro vs Vostro
# ─────────────────────────────────────────────
RECON_ID = uid("REC-")

c.execute("""INSERT OR IGNORE INTO reconciliation_templates
    (reconciliation_template_id, reconciliation_name, reconciliation_category,
     source_dataset_name, target_dataset_name, matching_rules, status, description,
     application_package_id, product_id, subproduct_id, created_at, created_by, updated_at, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
    (RECON_ID, "Nostro vs Vostro Daily Settlement Recon",
     "NOSTRO_VOSTRO",
     "Internal RTGS Ledger (Nostro)",
     "Correspondent Bank Statement (Vostro)",
     json.dumps([
         {"match_key": "transaction_reference",    "source_field": "Message.ID",                                             "target_field": "statement_ref",      "tolerance": None,   "match_type": "EXACT"},
         {"match_key": "settlement_amount",         "source_field": "FX_CONVERTED_AMOUNT",                                    "target_field": "credit_amount",      "tolerance": 0.01,   "match_type": "AMOUNT_TOLERANCE"},
         {"match_key": "value_date",                "source_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt",          "target_field": "value_date",         "tolerance": None,   "match_type": "EXACT"},
         {"match_key": "beneficiary_iban",          "source_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAcct.Id",            "target_field": "creditor_account",   "tolerance": None,   "match_type": "EXACT"},
     ]),
     "ACTIVE",
     "Matches internal RTGS ledger entries against incoming correspondent bank SWIFT MT940 statements. Flags any amount variance over 1 cent or missing entries for investigation.",
     PKG_ID, PROD_ID, SUB_ID, NOW, SEED_USER, NOW, SEED_USER))

print(f"✓ Reconciliation Engine seeded: {RECON_ID}")

# ─────────────────────────────────────────────
# 10. REPORT DESIGNER: Settlement Dashboard
# ─────────────────────────────────────────────
RPT_ID = uid("RPT-")

c.execute("""INSERT OR IGNORE INTO report_blueprints
    (report_id, report_name, description, is_third_party_embedded, third_party_embed_url,
     expose_as_headless_api, widgets, status, application_package_id, created_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
    (RPT_ID,
     "Cross-Border Payment Settlement Dashboard",
     "Real-time view of SWIFT wire settlement status, daily volumes, FX exposure, and reconciliation gaps for Operations and Treasury teams.",
     0, None, 1,
     json.dumps([
         {"widget_id": uid("WGT-"), "chart_type": "KPI_CARD",   "title": "Total Settlement Volume (USD)",  "data_source_entity": "EvidencePacketRegistry", "x_axis_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt",  "y_axis_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt",  "aggregation_method": "SUM",   "grid_layout": {"x":0,"y":0,"w":3,"h":2}},
         {"widget_id": uid("WGT-"), "chart_type": "KPI_CARD",   "title": "Active Payments in Flight",      "data_source_entity": "EvidencePacketRegistry", "x_axis_field": "Message.ID",                                    "y_axis_field": "Message.ID",                                    "aggregation_method": "COUNT", "grid_layout": {"x":3,"y":0,"w":3,"h":2}},
         {"widget_id": uid("WGT-"), "chart_type": "KPI_CARD",   "title": "FX Converted Amount (GBP)",      "data_source_entity": "EvidencePacketRegistry", "x_axis_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt",  "y_axis_field": "FX_CONVERTED_AMOUNT",                          "aggregation_method": "FX_CONVERTED_AMOUNT", "grid_layout": {"x":6,"y":0,"w":3,"h":2}},
         {"widget_id": uid("WGT-"), "chart_type": "BAR_CHART",  "title": "Daily Settlement Volume by CCY", "data_source_entity": "EvidencePacketRegistry", "x_axis_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Ccy",   "y_axis_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt",  "aggregation_method": "SUM",   "grid_layout": {"x":0,"y":2,"w":6,"h":4}},
         {"widget_id": uid("WGT-"), "chart_type": "LINE_CHART", "title": "Settlement Timeline",            "data_source_entity": "EvidencePacketRegistry", "x_axis_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.IntrBkSttlmDt",  "y_axis_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt",  "aggregation_method": "SUM",   "grid_layout": {"x":6,"y":2,"w":6,"h":4}},
         {"widget_id": uid("WGT-"), "chart_type": "DATA_GRID",  "title": "Reconciliation Exceptions",     "data_source_entity": "EvidencePacketRegistry", "x_axis_field": "Message.ID",                                    "y_axis_field": "FX_CONVERTED_AMOUNT",                          "aggregation_method": "COUNT", "grid_layout": {"x":0,"y":6,"w":12,"h":4}},
     ]),
     "ACTIVE", PKG_ID, NOW, SEED_USER))

print(f"✓ Report Designer seeded: {RPT_ID}")

# ─────────────────────────────────────────────
# COMMIT
# ─────────────────────────────────────────────
conn.commit()
conn.close()

print("\n" + "="*60)
print("✅ GOLDEN PATH SEED COMPLETE")
print("="*60)
print(f"  Product:          {PROD_ID} — Cross-Border Payments")
print(f"  Sub-Product:      {SUB_ID} — SWIFT MT103 Wire")
print(f"  File Template:    {TPL_ID} — SWIFT MT103 Inbound Wire")
print(f"  Data Mapper:      {MAPPER_ID} — MT103 → pacs.008")
print(f"  Formula:          {FORMULA_ID} — FX_CONVERTED_AMOUNT")
print(f"  Business Rules:   3 rules (AML, OFAC, FX Stale)")
print(f"  Workflow:         {WF_ID} — 5-node SWIFT processing")
print(f"  Screen:           {SCR_ID} — Wire Entry Form (10 ISO fields)")
print(f"  APIs:             2 endpoints (GPI + RTGS)")
print(f"  Reconciliation:   {RECON_ID} — Nostro vs Vostro")
print(f"  Report:           {RPT_ID} — Settlement Dashboard")
print("="*60)
