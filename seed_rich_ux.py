"""
WHY THIS FILE EXISTS:
Rich UX seed — populates every studio with 5-15 realistic records so the
full UI/UX audit can exercise all list views, detail drawers, filters, search,
pagination, empty states, and error surfaces.

Covers: Workflows, Business Rules, Calculation Engine, File Templates, Mappers,
API Configs, Screens, Reports, Notification Policies, Comm Templates, Reconciliation,
Governance Tasks, Batch Gateway, Unstructured Docs, Doc Checklists, Entitlements,
Roles & Users, Queue Infrastructure, Simulations, Events, Insights, Master Data.

Run: python seed_rich_ux.py
Safe to re-run — all inserts are idempotent (checked by PK before insert).
"""

import json
import datetime
import uuid
import sys

from database import engine, SessionLocal
from sqlalchemy import inspect, text
import models

db = SessionLocal()
now = datetime.datetime.utcnow().isoformat()

def uid(prefix=""):
    return f"{prefix}{uuid.uuid4().hex[:8].upper()}"

def exists(model, **filters):
    return db.query(model).filter_by(**filters).first() is not None

def commit(label):
    try:
        db.commit()
        print(f"  ✓ {label}")
    except Exception as e:
        db.rollback()
        print(f"  ⚠ {label} — skipped (conflict): {str(e)[:80]}")

# ── Pull existing PKG/PROD IDs ─────────────────────────────────────────────
pkg = db.query(models.ProductApplicationPackage).first()
if not pkg:
    sys.exit("Run seed_pkg.py first — no package found.")
PKG_ID = pkg.package_id

prod = db.query(models.ProductMaster).filter_by(package_id=PKG_ID).first()
PROD_ID = prod.product_id if prod else None

subprod = db.query(models.SubproductMaster).filter_by(product_id=PROD_ID).first() if PROD_ID else None
SUB_ID = subprod.subproduct_id if subprod else None

print(f"Package: {PKG_ID} | Product: {PROD_ID} | Subproduct: {SUB_ID}\n")

# ══════════════════════════════════════════════════════════════════════════════
# 1. ADDITIONAL PRODUCTS (need >1 product to test Two-Key Cockpit filtering)
# ══════════════════════════════════════════════════════════════════════════════
print("── Master Data: Products ──")
extra_products = [
    ("PROD-TRADE-001", "Trade Finance", "TRADE", "Letters of Credit, Documentary Collections, Trade Guarantees"),
    ("PROD-RETAIL-001", "Retail Payments", "RETAIL_PAY", "Domestic transfers, standing orders, direct debits"),
    ("PROD-TREASURY-001", "Treasury & FX", "TREASURY", "FX spot, forwards, swaps, money market"),
]
for prod_id, name, code, desc in extra_products:
    if not exists(models.ProductMaster, product_id=prod_id):
        db.add(models.ProductMaster(
            product_id=prod_id, package_id=PKG_ID,
            product_name=name, product_code=code,
            description=desc, created_at=now,
        ))
commit(f"3 extra products")

# ══════════════════════════════════════════════════════════════════════════════
# 2. WORKFLOW DESIGNER — 10 workflows, multiple statuses, node types
# ══════════════════════════════════════════════════════════════════════════════
print("── Workflow Designer ──")
workflows = [
    ("WF-SEPA-CT", "SEPA Credit Transfer", "DRAFT",
     "Processes inbound SEPA credit transfers: validate IBAN, check sanctions, post to core banking"),
    ("WF-ACH-BATCH", "ACH Batch Processing", "LIVE",
     "End-of-day ACH NACHA file processing: parse, validate, route to originating bank"),
    ("WF-CARD-AUTH", "Card Authorization Flow", "LIVE",
     "Real-time card authorization: limit check, fraud score, core banking debit, response"),
    ("WF-KYC-ONBOARD", "KYC Customer Onboarding", "PENDING_APPROVAL",
     "New customer KYC workflow: collect docs, ID verification, risk rating, compliance sign-off"),
    ("WF-LOAN-ORIG", "Loan Origination", "DRAFT",
     "Consumer loan origination: application intake, credit scoring, underwriting, disbursement"),
    ("WF-NOSTRO-RECON", "Nostro Reconciliation", "LIVE",
     "Daily nostro reconciliation: fetch statement, match GL entries, raise breaks for exceptions"),
    ("WF-TRADE-LC", "Trade Finance Letter of Credit", "DRAFT",
     "LC issuance workflow: applicant request, compliance check, issuing bank approval, SWIFT MT700"),
    ("WF-FX-SETTLE", "FX Trade Settlement", "LIVE",
     "FX trade settlement: confirmation matching, netting, CLS settlement, position update"),
    ("WF-FRAUD-ALERT", "Fraud Alert Review", "LIVE",
     "Real-time fraud alert triage: risk score review, customer contact, block/unblock decision"),
    ("WF-PAYROLL-DD", "Payroll Direct Debit", "PENDING_APPROVAL",
     "Payroll DD processing: employer file intake, validate payees, bulk debit, credit employees"),
]
node_types = ["INGEST", "VALIDATE", "ENRICH", "APPROVE", "SETTLE", "NOTIFY", "AUDIT"]
for wf_id, wf_name, status, desc in workflows:
    if not exists(models.WorkflowConfiguration, workflow_id=wf_id):
        db.add(models.WorkflowConfiguration(
            workflow_id=wf_id,
            workflow_name=wf_name,
            description=desc,
            status=status,
            domain_scope="PAYMENTS",
            product_context=PROD_ID,
            application_package_id=PKG_ID,
            product_id=PROD_ID,
            created_at=now,
            created_by="seed_rich_ux",
        ))
        # Add nodes per workflow
        for i, ntype in enumerate(node_types[:5]):
            node_id = f"{wf_id}-N{i+1}"
            if not exists(models.WorkflowNode, node_id=node_id):
                db.add(models.WorkflowNode(
                    node_id=node_id,
                    workflow_id=wf_id,
                    node_title=f"{ntype.title()} Step",
                    node_code=ntype,
                    canvas_x_position=100 + i * 200,
                    canvas_y_position=300,
                    orchestration_steps=[],
                    sequence_number=i + 1,
                    created_at=now,
                ))
commit("10 workflows + nodes")

# ══════════════════════════════════════════════════════════════════════════════
# 3. BUSINESS RULES — 12 rules across different domains & statuses
# ══════════════════════════════════════════════════════════════════════════════
print("── Business Rules ──")
rules = [
    ("RS-SANCTION-CHECK", "SANCTION_SCREEN", "Sanctions Screening", "PAYMENTS",
     "Flag any payment where beneficiary name or BIC appears on OFAC/EU/UN watchlists"),
    ("RS-PEP-CHECK", "PEP_SCREEN", "PEP Screening", "COMPLIANCE",
     "Flag transactions where counterparty is classified as Politically Exposed Person"),
    ("RS-FX-STALE", "FX_RATE_STALE", "FX Rate Staleness Check", "TREASURY",
     "Reject FX conversion if rate feed is older than 15 minutes"),
    ("RS-LARGE-CASH", "LARGE_CASH_RPT", "Large Cash Reporting", "AML",
     "Trigger CTR filing for cash transactions exceeding $10,000"),
    ("RS-VELOCITY-CHK", "VELOCITY_CHECK", "Transaction Velocity Limit", "FRAUD",
     "Block customer if more than 5 transactions in 60 minutes exceed $500 each"),
    ("RS-IBAN-VALID", "IBAN_VALIDATE", "IBAN Format Validation", "PAYMENTS",
     "Validate IBAN checksum and country-specific length before processing SEPA transfer"),
    ("RS-CREDIT-LIMIT", "CREDIT_LIMIT", "Credit Limit Enforcement", "CREDIT_RISK",
     "Block drawdown if requested amount would exceed approved credit facility limit"),
    ("RS-DORMANT-ACCT", "DORMANT_FLAG", "Dormant Account Flag", "RETAIL",
     "Flag account as dormant if no debit transactions in 12 months"),
    ("RS-DUAL-CONTROL", "DUAL_CTRL", "Dual Control Threshold", "GOVERNANCE",
     "Require 4-eye approval for any single payment exceeding $500,000"),
    ("RS-NOSTRO-BREAK", "NOSTRO_BREAK", "Nostro Break Escalation", "RECONCILIATION",
     "Escalate to ops manager if reconciliation break exceeds $10,000 and is >2 days old"),
    ("RS-RATE-BAND", "RATE_BAND_CHK", "Interest Rate Band Check", "TREASURY",
     "Reject loan if proposed rate is outside ±50bps of benchmark + margin policy"),
    ("RS-KYC-EXPIRY", "KYC_EXPIRY", "KYC Document Expiry", "COMPLIANCE",
     "Block all new transactions if customer KYC documents are expired or expiring within 30 days"),
]
for rs_id, token, name, domain, desc in rules:
    if not exists(models.BusinessRuleSet, rule_set_id=rs_id) and not exists(models.BusinessRuleSet, business_name=name):
        db.add(models.BusinessRuleSet(
            rule_set_id=rs_id,
            business_name=name,
            token_code=token,
            description=desc,
            status="ACTIVE" if rules.index((rs_id, token, name, domain, desc)) % 3 != 2 else "DRAFT",
            application_package_id=PKG_ID,
            product_id=PROD_ID,
            definition={
                "business_name": name,
                "token_code": token,
                "description": desc,
                "domain": domain,
                "rules": [
                    {
                        "condition": f"INPUT_FIELD > THRESHOLD",
                        "action_on_true": "FLAG_FOR_REVIEW",
                        "action_on_false": "PASS",
                    }
                ],
            },
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("12 business rules")

# ══════════════════════════════════════════════════════════════════════════════
# 4. CALCULATION ENGINE — 10 programs across domains
# ══════════════════════════════════════════════════════════════════════════════
print("── Calculation Engine ──")
programs = [
    ("CP-INTEREST-001", "CPROG-INTEREST", "Loan Interest Accrual", "CREDIT_RISK", "T2",
     "Daily interest accrual on drawn loan balances using ACT/360 day count"),
    ("CP-NETTING-001", "CPROG-NETTING", "Bilateral Netting Calculator", "TREASURY", "T2",
     "Net offsetting FX positions between two counterparties before settlement"),
    ("CP-VAR-001", "CPROG-VAR", "Value at Risk (99% 1-Day)", "TREASURY", "T3",
     "Historical simulation VaR at 99% confidence for FX portfolio"),
    ("CP-MARGIN-001", "CPROG-MARGIN", "Initial Margin Calculator", "TREASURY", "T2",
     "Calculates initial margin required for uncleared OTC derivatives per SIMM"),
    ("CP-LATE-FEE-001", "CPROG-LATE-FEE", "Late Payment Fee", "CREDIT_RISK", "T1",
     "Charges daily late fee on overdue loan instalments after 3 grace days"),
    ("CP-FOREX-PNL-001", "CPROG-FX-PNL", "FX Revaluation P&L", "TREASURY", "T2",
     "Revalues open FX positions at mid-market rate to compute unrealised P&L"),
    ("CP-NOSTRO-BAL-001", "CPROG-NOSTRO-BAL", "Nostro Balance Projection", "PAYMENTS", "T1",
     "Projects end-of-day nostro balance from opening balance plus intraday flows"),
    ("CP-LC-UTILISATION-001", "CPROG-LC-UTIL", "Letter of Credit Utilisation", "TRADE_FINANCE", "T1",
     "Tracks LC utilisation vs. approved LC limit across all outstanding documentary credits"),
    ("CP-COMMISSION-001", "CPROG-COMM", "Trade Finance Commission", "TRADE_FINANCE", "T1",
     "Calculates commission on LC issuance, amendments and utilisation events"),
    ("CP-PREPAY-PENALTY-001", "CPROG-PREPAY", "Prepayment Penalty Calculator", "CREDIT_RISK", "T2",
     "Computes break cost on early loan repayment using yield maintenance formula"),
]
for prog_id, code, name, domain, tier, desc in programs:
    if not exists(models.CalculationProgram, program_id=prog_id):
        db.add(models.CalculationProgram(
            program_id=prog_id,
            program_code=code,
            business_name=name,
            description=desc,
            domain=domain,
            tier=tier,
            tags=[domain.lower(), tier.lower()],
            is_template=False,
            locked_steps=tier == "T3",
            steps=[
                {"seq": 1, "var_name": "STEP_1_RESULT", "expression": "INPUT_A * INPUT_B",
                 "description": "Primary calculation", "is_output": False},
                {"seq": 2, "var_name": "FINAL_OUTPUT", "expression": "STEP_1_RESULT * RATE_FACTOR",
                 "description": "Apply rate factor", "is_output": True, "output_token": f"{code}_OUTPUT"},
            ],
            inputs=[
                {"name": "INPUT_A", "source_type": "ISO_FIELD", "description": "Primary input amount"},
                {"name": "INPUT_B", "source_type": "POLICY_CONSTANT", "description": "Multiplier constant"},
                {"name": "RATE_FACTOR", "source_type": "RATE_FEED", "description": "Live rate from rate feed"},
            ],
            application_package_id=PKG_ID,
            product_id=PROD_ID,
            status="ACTIVE" if programs.index((prog_id, code, name, domain, tier, desc)) % 4 != 3 else "DRAFT",
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("10 calculation programs")

# ══════════════════════════════════════════════════════════════════════════════
# 5. FILE TEMPLATE DESIGNER — 8 templates
# ══════════════════════════════════════════════════════════════════════════════
print("── File Template Designer ──")
file_templates = [
    ("TMPL-SEPA-CT-001", "SEPA Credit Transfer pacs.008", "XML", "ISO20022_XML", "STRUCTURED"),
    ("TMPL-ACH-NACHA-001", "ACH NACHA Batch File", "FIXED_WIDTH", "FIXED_WIDTH", "POSITIONAL"),
    ("TMPL-BACS-STD18-001", "BACS Standard 18 Direct Debit", "FIXED_WIDTH", "FIXED_WIDTH", "POSITIONAL"),
    ("TMPL-CHAPS-XML-001", "CHAPS Real-Time Gross Settlement", "XML", "ISO20022_XML", "STRUCTURED"),
    ("TMPL-CAMT053-001", "Bank Statement camt.053", "XML", "ISO20022_XML", "STRUCTURED"),
    ("TMPL-NOSTRO-CSV-001", "Nostro Statement CSV", "CSV", "DELIMITED", "COLUMN_HEADER"),
    ("TMPL-SWIFT-MT940-001", "SWIFT MT940 Statement", "FIXED_WIDTH", "SWIFT_MT", "POSITIONAL"),
    ("TMPL-FED-WIRE-001", "Fedwire Funds Transfer", "FIXED_WIDTH", "FIXED_WIDTH", "POSITIONAL"),
]
for t_id, name, ftype, ext_mode, text_type in file_templates:
    if not exists(models.TemplateDesignerModel, template_id=t_id):
        db.add(models.TemplateDesignerModel(
            template_id=t_id,
            template_name=name,
            template_type="INBOUND",
            file_type=ftype,
            extraction_mode=ext_mode,
            is_multi_sheet=False,
            file_has_header_footer=True,
            text_file_type=text_type,
            status="ACTIVE",
            created_at=now,
            created_by="seed_rich_ux",
        ))
        # Add sample field addresses
        for i, field in enumerate(["MSG_ID", "AMOUNT", "DEBTOR_IBAN", "CREDITOR_BIC", "VALUE_DATE"]):
            db.add(models.TemplateFieldAddressModel(
                address_id=f"{t_id}-ADDR-{i+1}",
                template_id=t_id,
                extracted_field_name=field,
                reading_mode="FIELD",
                start_row=2 + i,
                stop_row=2 + i,
            ))
commit("8 file templates + field addresses")

# ══════════════════════════════════════════════════════════════════════════════
# 6. DATA GATEWAY MAPPER — 8 mappers
# ══════════════════════════════════════════════════════════════════════════════
print("── Data Gateway Mapper ──")
mappers = [
    ("MAP-SEPA-001", "SEPA pacs.008 → Core Banking", "INBOUND"),
    ("MAP-ACH-001", "ACH NACHA → ISO pacs.003", "INBOUND"),
    ("MAP-CAMT-001", "camt.053 Statement → Reconciliation Engine", "INBOUND"),
    ("MAP-FEDWIRE-001", "Fedwire → ISO pacs.009", "INBOUND"),
    ("MAP-MT103-OUT-001", "ISO pacs.008 → SWIFT MT103 Outbound", "OUTBOUND"),
    ("MAP-GL-001", "Settlements → GL Feed (CSV)", "OUTBOUND"),
    ("MAP-BACS-001", "Direct Debit Request → BACS Std18", "OUTBOUND"),
    ("MAP-TRADE-LC-001", "LC Application → SWIFT MT700", "OUTBOUND"),
]
for m_id, m_name, direction in mappers:
    if not exists(models.PayloadMapperBlueprint, mapper_id=m_id):
        db.add(models.PayloadMapperBlueprint(
            mapper_id=m_id,
            mapper_name=m_name,
            mapping_direction=direction,
            target_format="ISO20022_XML",
            status="ACTIVE",
            application_package_id=PKG_ID,
            product_id=PROD_ID,
            created_at=now,
            created_by="seed_rich_ux",
        ))
        for i, (src, tgt) in enumerate([
            ("MSG_ID", "FIToFICstmrCdtTrf.GrpHdr.MsgId"),
            ("AMOUNT", "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt"),
            ("CURRENCY", "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Ccy"),
            ("DEBTOR_IBAN", "FIToFICstmrCdtTrf.CdtTrfTxInf.Dbtr.IBAN"),
            ("VALUE_DATE", "FIToFICstmrCdtTrf.GrpHdr.CreDtTm"),
        ]):
            db.add(models.PayloadFieldMapping(
                mapping_id=f"{m_id}-FLD-{i+1}",
                mapper_id=m_id,
                source_extracted_field=src,
                target_iso_field=tgt,
                is_mandatory=i < 3,
            ))
commit("8 mappers + field mappings")

# ══════════════════════════════════════════════════════════════════════════════
# 7. API CONNECTOR — 10 API configurations
# ══════════════════════════════════════════════════════════════════════════════
print("── API Connector ──")
apis = [
    ("API-OFAC-001", "OFAC SDN Screening API", "POST",
     "https://api.treasury.gov/ofac/sdn/screen", 50, 5, 30, "AML"),
    ("API-SWIFT-GPI-001", "SWIFT GPI Tracker", "GET",
     "https://api.swift.com/v4/payments/{uetr}/status", 100, 3, 60, "PAYMENTS"),
    ("API-FEDNOW-001", "FedNow Real-Time Settlement", "POST",
     "https://fednow.frb.org/v1/payments", 500, 5, 15, "PAYMENTS"),
    ("API-WORLDCHECK-001", "Refinitiv World-Check Screening", "POST",
     "https://api.refinitiv.com/worldcheck/v2/cases", 30, 5, 60, "COMPLIANCE"),
    ("API-OPEN-FX-001", "Open Exchange Rates Feed", "GET",
     "https://openexchangerates.org/api/latest.json", 10, 3, 30, "TREASURY"),
    ("API-BOE-RTGS-001", "Bank of England RTGS", "POST",
     "https://rtgs.bankofengland.co.uk/v1/payments", 200, 5, 30, "PAYMENTS"),
    ("API-CREDIT-SCORE-001", "Equifax Credit Score", "POST",
     "https://api.equifax.com/business/credit-score/v1", 20, 3, 120, "CREDIT_RISK"),
    ("API-ESMA-001", "ESMA Trade Repository", "POST",
     "https://api.esma.europa.eu/tr/v1/reports", 10, 5, 60, "COMPLIANCE"),
    ("API-VISA-NET-001", "Visa Net Authorization", "POST",
     "https://sandbox.api.visa.com/vdp/v2/authorize", 1000, 3, 5, "CARDS"),
    ("API-COREBANK-001", "Core Banking System REST", "POST",
     "https://core.bank.internal/v2/accounts/debit", 500, 5, 10, "INTERNAL"),
]
for api_id, name, method, url, rps, cb_thresh, cb_timeout, domain in apis:
    if not exists(models.ApiConfiguration, api_id=api_id):
        db.add(models.ApiConfiguration(
            api_id=api_id,
            api_name=name,
            http_method=method,
            url_template=url,
            rate_limit_rps=rps,
            circuit_breaker_threshold=cb_thresh,
            circuit_breaker_timeout_sec=cb_timeout,
            mask_pii_in_body=domain in ("COMPLIANCE", "AML", "CREDIT_RISK"),
            request_body_template={"transaction_id": "${MSG_ID}", "amount": "${AMOUNT}"},
            headers={"Content-Type": "application/json", "Authorization": "Bearer ${API_KEY}"},
            application_package_id=PKG_ID,
            product_id=PROD_ID,
            status="ACTIVE",
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("10 API configurations")

# ══════════════════════════════════════════════════════════════════════════════
# 8. SCREEN DESIGNER — 8 screens
# ══════════════════════════════════════════════════════════════════════════════
print("── Screen Designer ──")
screens = [
    ("SCR-SWIFT-WIRE-001", "SWIFT Wire Payment Entry", "ENTRY_FORM"),
    ("SCR-SEPA-CT-001", "SEPA Credit Transfer Form", "ENTRY_FORM"),
    ("SCR-KYC-ONBOARD-001", "KYC Customer Onboarding", "WIZARD"),
    ("SCR-LOAN-APP-001", "Loan Application Form", "WIZARD"),
    ("SCR-TRADE-LC-001", "Letter of Credit Application", "ENTRY_FORM"),
    ("SCR-RECON-REVIEW-001", "Reconciliation Break Review", "REVIEW_PANEL"),
    ("SCR-FRAUD-ALERT-001", "Fraud Alert Triage Dashboard", "DASHBOARD"),
    ("SCR-CARD-MGMT-001", "Card Management Portal", "ENTRY_FORM"),
]
for s_id, s_name, s_cat in screens:
    if not exists(models.ScreenTemplate, screen_id=s_id) and not exists(models.ScreenTemplate, screen_name=s_name):
        db.add(models.ScreenTemplate(
            screen_id=s_id,
            screen_name=s_name,
            description=f"UI screen for {s_name}",
            status="ACTIVE",
            screen_template_category=s_cat,
            application_package_id=PKG_ID,
            product_id=PROD_ID,
            definition=[
                {"component_id": f"{s_id}-C1", "component_type": "TEXT_INPUT",
                 "label": "Reference Number", "iso_field": "FIToFICstmrCdtTrf.GrpHdr.MsgId", "required": True},
                {"component_id": f"{s_id}-C2", "component_type": "CURRENCY_INPUT",
                 "label": "Amount", "iso_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt", "required": True},
                {"component_id": f"{s_id}-C3", "component_type": "DATE_PICKER",
                 "label": "Value Date", "iso_field": "FIToFICstmrCdtTrf.GrpHdr.CreDtTm", "required": True},
                {"component_id": f"{s_id}-C4", "component_type": "TEXT_INPUT",
                 "label": "Beneficiary Account", "iso_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.CdtrAcct.Id.IBAN", "required": True},
                {"component_id": f"{s_id}-C5", "component_type": "DROPDOWN",
                 "label": "Currency", "iso_field": "FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Ccy", "required": True},
            ],
            created_at=now,
        ))
commit("8 screens")

# ══════════════════════════════════════════════════════════════════════════════
# 9. REPORT DESIGNER — 8 reports
# ══════════════════════════════════════════════════════════════════════════════
print("── Report Designer ──")
reports = [
    ("RPT-SETTLEMENT-001", "Daily Settlement Dashboard",
     [{"type": "KPI_CARD", "title": "Total Settled", "metric": "SUM(amount)", "format": "currency"},
      {"type": "BAR_CHART", "title": "Settlements by Currency", "x_axis": "currency", "y_axis": "amount"},
      {"type": "LINE_CHART", "title": "Hourly Volume", "x_axis": "hour", "y_axis": "count"},
      {"type": "DATA_GRID", "title": "Exception List", "columns": ["ref", "amount", "status", "reason"]}]),
    ("RPT-AML-001", "AML Alerts Summary",
     [{"type": "KPI_CARD", "title": "Open Alerts", "metric": "COUNT(alerts) WHERE status=OPEN"},
      {"type": "DONUT_CHART", "title": "Alert Type Breakdown", "dimension": "alert_type"},
      {"type": "DATA_GRID", "title": "High-Risk Transactions", "columns": ["ref", "amount", "customer", "rule_triggered"]}]),
    ("RPT-NOSTRO-001", "Nostro Position Report",
     [{"type": "KPI_CARD", "title": "Total Nostro Balance", "metric": "SUM(balance_usd)"},
      {"type": "BAR_CHART", "title": "Balance by Correspondent Bank", "x_axis": "bank", "y_axis": "balance_usd"},
      {"type": "DATA_GRID", "title": "Nostro Accounts", "columns": ["bank", "currency", "balance", "as_of"]}]),
    ("RPT-FX-001", "FX Trading P&L",
     [{"type": "KPI_CARD", "title": "Day P&L (USD)", "metric": "SUM(pnl_usd)"},
      {"type": "LINE_CHART", "title": "Intraday P&L", "x_axis": "time", "y_axis": "cumulative_pnl"},
      {"type": "SCATTER_CHART", "title": "Risk vs Return", "x": "var_usd", "y": "pnl_usd"}]),
    ("RPT-LOAN-001", "Loan Portfolio Dashboard",
     [{"type": "KPI_CARD", "title": "Total Exposure", "metric": "SUM(outstanding_balance)"},
      {"type": "DONUT_CHART", "title": "Portfolio by Credit Rating", "dimension": "credit_rating"},
      {"type": "BAR_CHART", "title": "NPL by Sector", "x_axis": "sector", "y_axis": "npl_amount"}]),
    ("RPT-RECON-001", "Reconciliation Breaks Dashboard",
     [{"type": "KPI_CARD", "title": "Open Breaks", "metric": "COUNT(breaks) WHERE status=OPEN"},
      {"type": "KPI_CARD", "title": "Aged Breaks >3 Days", "metric": "COUNT(breaks) WHERE age_days > 3"},
      {"type": "DATA_GRID", "title": "Break Details", "columns": ["break_id", "amount", "age_days", "assignee"]}]),
    ("RPT-COMPLIANCE-001", "Regulatory Reporting Dashboard",
     [{"type": "KPI_CARD", "title": "CTR Filed MTD", "metric": "COUNT(ctr_reports)"},
      {"type": "LINE_CHART", "title": "Monthly CTR Trend", "x_axis": "month", "y_axis": "count"},
      {"type": "DATA_GRID", "title": "Pending SAR", "columns": ["case_id", "customer", "amount", "due_date"]}]),
    ("RPT-TRADE-001", "Trade Finance Portfolio",
     [{"type": "KPI_CARD", "title": "Outstanding LCs", "metric": "COUNT(lc) WHERE status=ACTIVE"},
      {"type": "KPI_CARD", "title": "Total LC Exposure", "metric": "SUM(lc_amount)"},
      {"type": "BAR_CHART", "title": "LC by Counterparty", "x_axis": "counterparty", "y_axis": "exposure"}]),
]
for r_id, r_name, widgets in reports:
    if not exists(models.ReportBlueprint, report_id=r_id):
        db.add(models.ReportBlueprint(
            report_id=r_id,
            report_name=r_name,
            description=f"Executive dashboard: {r_name}",
            widgets=widgets,
            status="ACTIVE",
            is_third_party_embedded=False,
            expose_as_headless_api=True,
            application_package_id=PKG_ID,
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("8 reports")

# ══════════════════════════════════════════════════════════════════════════════
# 10. NOTIFICATION ENGINE — 8 policies + triggers
# ══════════════════════════════════════════════════════════════════════════════
print("── Notification Engine ──")
notif_policies = [
    ("NOTIF-PAYMENT-CONF", "Payment Confirmation Alert", "Notify customer and ops when payment settles successfully"),
    ("NOTIF-FRAUD-FLAG", "Fraud Flag Notification", "Alert fraud ops team + customer on suspicious transaction"),
    ("NOTIF-KYC-EXPIRY", "KYC Expiry Warning", "30-day and 7-day warning to relationship manager before KYC expires"),
    ("NOTIF-RECON-BREAK", "Reconciliation Break Alert", "Alert ops when nostro break exceeds $10K threshold"),
    ("NOTIF-LOAN-OVERDUE", "Loan Overdue Notice", "Customer notice on day 1, day 7, day 30 of overdue instalment"),
    ("NOTIF-FX-LIMIT", "FX Rate Limit Breach", "Treasury desk alert when FX rate moves outside approved band"),
    ("NOTIF-APPROVAL-REQ", "4-Eye Approval Request", "Notify approver when transaction requires dual control"),
    ("NOTIF-BATCH-COMPLETE", "Batch Job Completion", "Ops team confirmation when EOD batch completes or fails"),
]
for pol_id, pol_name, desc in notif_policies:
    if not exists(models.NotificationPolicy, policy_id=pol_id):
        db.add(models.NotificationPolicy(
            policy_id=pol_id,
            policy_name=pol_name,
            description=desc,
            application_package_id=PKG_ID,
            version_number=1,
            status="LIVE" if notif_policies.index((pol_id, pol_name, desc)) % 3 != 2 else "DRAFT",
            created_at=now,
            created_by="seed_rich_ux",
        ))
        db.add(models.NotificationTrigger(
            trigger_id=f"{pol_id}-TRG-1",
            policy_id=pol_id,
            trigger_name=f"{pol_name} — Primary Trigger",
            notification_type="EMAIL",
            recipient_mode="ROLE",
            recipient_role="OPS_ANALYST",
            created_at=now,
        ))
commit("8 notification policies + triggers")

# ══════════════════════════════════════════════════════════════════════════════
# 11. COMMUNICATION TEMPLATES — 8 templates
# ══════════════════════════════════════════════════════════════════════════════
print("── Comm Templates ──")
comm_templates = [
    ("COMM-PAY-CONF-001", "Payment Confirmation Email", "EMAIL",
     "Your Payment of {{AMOUNT}} {{CURRENCY}} to {{BENEFICIARY}} has been processed",
     "Dear {{CUSTOMER_NAME}},\n\nYour payment of {{AMOUNT}} {{CURRENCY}} (Ref: {{PAYMENT_REF}}) to {{BENEFICIARY}} was successfully processed on {{VALUE_DATE}}.\n\nBank reference: {{BANK_REF}}\n\nFor queries, contact {{OPS_EMAIL}}."),
    ("COMM-FRAUD-001", "Fraud Alert SMS", "SMS",
     None,
     "ALERT: Suspicious activity detected on your account ending {{ACCOUNT_LAST4}}. If not you, call {{FRAUD_HOTLINE}} immediately. Ref: {{CASE_ID}}"),
    ("COMM-KYC-WARN-001", "KYC Expiry Warning Email", "EMAIL",
     "Action Required: KYC Documents Expiring in {{DAYS_TO_EXPIRY}} Days",
     "Dear {{RM_NAME}},\n\nKYC documents for client {{CLIENT_NAME}} (ID: {{CLIENT_ID}}) will expire on {{EXPIRY_DATE}} ({{DAYS_TO_EXPIRY}} days). Please arrange renewal to avoid transaction restrictions."),
    ("COMM-RECON-BREAK-001", "Reconciliation Break Alert", "EMAIL",
     "Reconciliation Break Alert — {{BREAK_AMOUNT}} {{CURRENCY}}",
     "A reconciliation break of {{BREAK_AMOUNT}} {{CURRENCY}} has been identified on nostro account {{NOSTRO_ACCOUNT}}.\n\nAge: {{BREAK_AGE_DAYS}} days\nOriginal transaction: {{TXN_REF}}\n\nPlease investigate via the Reconciliation Engine."),
    ("COMM-APPROVAL-001", "4-Eye Approval Request", "EMAIL",
     "Approval Required: Payment {{PAYMENT_REF}} of {{AMOUNT}} {{CURRENCY}}",
     "Dear {{APPROVER_NAME}},\n\nA payment of {{AMOUNT}} {{CURRENCY}} to {{BENEFICIARY}} requires your approval.\n\nSubmitted by: {{MAKER_NAME}}\nTime: {{SUBMISSION_TIME}}\n\nReview in the Governance Hub."),
    ("COMM-LOAN-OVERDUE-001", "Loan Overdue Notice", "EMAIL",
     "Overdue Payment Notice — Loan {{LOAN_REF}}",
     "Dear {{CUSTOMER_NAME}},\n\nYour instalment of {{INSTALMENT_AMOUNT}} {{CURRENCY}} on Loan {{LOAN_REF}} was due on {{DUE_DATE}} and remains unpaid.\n\nDays overdue: {{DAYS_OVERDUE}}\nTotal outstanding: {{TOTAL_OUTSTANDING}}\n\nPlease make payment to avoid additional charges."),
    ("COMM-BATCH-OK-001", "Batch Job Success Notification", "EMAIL",
     "Batch Complete: {{JOB_NAME}} — {{RECORD_COUNT}} records processed",
     "Batch job {{JOB_NAME}} completed successfully at {{COMPLETION_TIME}}.\n\nRecords processed: {{RECORD_COUNT}}\nErrors: {{ERROR_COUNT}}\nDuration: {{DURATION_MINS}} minutes"),
    ("COMM-FX-BREACH-001", "FX Rate Band Breach Alert", "EMAIL",
     "FX Rate Alert: {{CCY_PAIR}} outside approved band",
     "FX rate for {{CCY_PAIR}} has moved to {{CURRENT_RATE}}, breaching the approved band ({{BAND_LOW}} – {{BAND_HIGH}}).\n\nTriggered rule: {{RULE_CODE}}\nTime: {{ALERT_TIME}}\n\nReview required before processing further FX transactions."),
]
for t_id, t_name, t_type, subject, body in comm_templates:
    if not exists(models.CommunicationTemplate, template_id=t_id):
        db.add(models.CommunicationTemplate(
            template_id=t_id,
            template_name=t_name,
            description=f"Template for {t_name}",
            template_type=t_type,
            subject_line=subject,
            body_content=body,
            version_number=1,
            status="LIVE",
            referenced_iso_fields=["FIToFICstmrCdtTrf.CdtTrfTxInf.InstdAmt.Amt"],
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("8 comm templates")

# ══════════════════════════════════════════════════════════════════════════════
# 12. RECONCILIATION ENGINE — 8 templates
# ══════════════════════════════════════════════════════════════════════════════
print("── Reconciliation Engine ──")
recon_templates = [
    ("RECON-NOSTRO-001", "Nostro vs GL Daily", "NOSTRO_GL",
     "Daily match of nostro account statement vs internal GL entries"),
    ("RECON-VOSTRO-001", "Vostro vs Correspondent Statement", "NOSTRO_GL",
     "Match correspondent bank statement against vostro ledger"),
    ("RECON-CARD-001", "Card Settlement vs Scheme", "CARD_SETTLEMENT",
     "Match Visa/MC scheme settlement file against internal card postings"),
    ("RECON-FX-001", "FX Trade Confirmation vs Internal Blotter", "TRADE_CONFIRM",
     "Match incoming SWIFT FX confirmations vs internal trading blotter"),
    ("RECON-PAYMENTS-001", "SWIFT MT940 vs Payment Ledger", "PAYMENT_LEDGER",
     "Match SWIFT end-of-day statement vs payment processing ledger"),
    ("RECON-CUSTODY-001", "Custody Holdings vs CSD", "CUSTODY",
     "Reconcile internal custody records against CSD (Euroclear/DTC) positions"),
    ("RECON-FEES-001", "Correspondent Bank Fees vs Invoice", "FEE_RECONCILIATION",
     "Match correspondent bank fee invoices against internal fee accruals"),
    ("RECON-INTEREST-001", "Interest Accruals vs Core Banking", "INTEREST",
     "Reconcile daily interest accrual calculations vs core banking postings"),
]
for r_id, r_name, r_cat, desc in recon_templates:
    if not exists(models.ReconciliationTemplate, reconciliation_template_id=r_id):
        db.add(models.ReconciliationTemplate(
            reconciliation_template_id=r_id,
            reconciliation_name=r_name,
            reconciliation_category=r_cat,
            source_dataset_name="Internal GL / Ledger",
            target_dataset_name="External Statement / Scheme File",
            description=desc,
            status="ACTIVE",
            # Shape MUST match schemas.MatchingRule: source_field/target_field/match_type
            # (+ tolerance_value for TOLERANCE, fuzzy_score_cutoff for FUZZY). A {field,tolerance}
            # shape fails Pydantic and 500s the whole template list endpoint.
            matching_rules=[
                {"source_field": "AMOUNT", "target_field": "AMOUNT", "match_type": "EXACT"},
                {"source_field": "VALUE_DATE", "target_field": "VALUE_DATE", "match_type": "EXACT"},
                {"source_field": "REFERENCE", "target_field": "REFERENCE", "match_type": "FUZZY", "fuzzy_score_cutoff": 80},
            ],
            application_package_id=PKG_ID,
            product_id=PROD_ID,
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("8 reconciliation templates")

# ══════════════════════════════════════════════════════════════════════════════
# 13. GOVERNANCE HUB — governance tasks (approval requests)
# ══════════════════════════════════════════════════════════════════════════════
print("── Governance Hub ──")
from models import WorkflowManifest
gov_tasks = [
    ("GT-001", "WF-SEPA-CT", "SEPA Credit Transfer — EUR 2,500,000", "PENDING_APPROVAL",
     "Large-value SEPA credit transfer requires 4-eye sign-off per ADR #7 threshold policy"),
    ("GT-002", "WF-FX-SETTLE", "FX Trade — USD/EUR 5,000,000", "PENDING_APPROVAL",
     "FX trade settlement above senior trader limit requires head of desk approval"),
    ("GT-003", "WF-LOAN-ORIG", "Loan Origination — Corporate EUR 15,000,000", "IN_REVIEW",
     "Corporate loan application pending credit committee review"),
    ("GT-004", "WF-TRADE-LC", "Letter of Credit — USD 800,000", "IN_REVIEW",
     "LC issuance for import transaction requires trade finance team approval"),
    ("GT-005", "WF-PAYROLL-DD", "Payroll Batch — 3,200 employees", "PENDING_APPROVAL",
     "Payroll direct debit batch requires ops manager and finance sign-off before execution"),
    ("GT-006", "WF-KYC-ONBOARD", "KYC Onboarding — PEP Customer", "ESCALATED",
     "New customer flagged as PEP — escalated to compliance for enhanced due diligence review"),
    ("GT-007", "WF-ACH-BATCH", "ACH Batch Retry — File Rejected", "PENDING_APPROVAL",
     "ACH file rejected by Fed — corrected file requires re-approval before resubmission"),
]
for t_id, wf_ref, task_name, status, desc in gov_tasks:
    if not exists(models.EvidencePacketRegistry, packet_id=t_id):
        db.add(models.EvidencePacketRegistry(
            packet_id=t_id,
            operator_maker="alice_chen",
            authorizer_checker="PENDING",
            raw_payload_reference=f"workflow_execution:{wf_ref}",
            execution_status=status,
            variance_metric_logged=json.dumps({"task_name": task_name, "description": desc}),
            created_at=now,
        ))
commit("7 governance task evidence packets")

# ══════════════════════════════════════════════════════════════════════════════
# 14. BATCH GATEWAY — 8 configs
# ══════════════════════════════════════════════════════════════════════════════
print("── Batch Gateway ──")
batch_configs = [
    ("BGC-SWIFT-STMT-001", "SWIFT MT940 Statement Ingest", "INBOUND", "SFTP", "0 6 * * 1-5"),
    ("BGC-BACS-DD-001", "BACS Direct Debit Submission", "OUTBOUND", "SFTP", "0 16 * * 1-5"),
    ("BGC-ACH-RETURN-001", "ACH Return File Processing", "INBOUND", "SFTP", "30 7 * * 1-5"),
    ("BGC-GL-FEED-001", "Core Banking GL Feed Export", "OUTBOUND", "S3", "0 19 * * *"),
    ("BGC-CARD-SETTLE-001", "Card Scheme Settlement Download", "INBOUND", "SFTP", "0 5 * * *"),
    ("BGC-PAYROLL-001", "Payroll File Intake", "INBOUND", "FILE_DROP", "0 8 * * 5"),
    ("BGC-REGULATORY-001", "Regulatory Reporting File Upload", "OUTBOUND", "SFTP", "0 9 1 * *"),
    ("BGC-NOSTRO-STMT-001", "Nostro Statement Download", "INBOUND", "SFTP", "30 5 * * 1-5"),
]
for c_id, c_name, direction, src_type, cron in batch_configs:
    if not exists(models.BatchGatewayConfiguration, config_id=c_id):
        db.add(models.BatchGatewayConfiguration(
            config_id=c_id,
            config_name=c_name,
            description=f"Scheduled batch: {c_name}",
            direction=direction,
            scope="EXTERNAL",
            source_type=src_type,
            connection_config={"host": "sftp.bank.com", "path": f"/{direction.lower()}/"},
            schedule_cron=cron,
            timezone="UTC",
            retry_max_attempts=3,
            retry_backoff_sec=60,
            alert_on_failure_email="ops@bank.com",
            status="LIVE" if batch_configs.index((c_id, c_name, direction, src_type, cron)) % 4 != 3 else "DRAFT",
            application_package_id=PKG_ID,
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("8 batch gateway configs")

# ══════════════════════════════════════════════════════════════════════════════
# 15. QUEUE INFRASTRUCTURE — routing rules per queue
# ══════════════════════════════════════════════════════════════════════════════
print("── Queue Routing Rules ──")
mq = db.query(models.MessageQueue).filter_by(queue_id="MQ-INBOUND-001").first()
if mq:
    routing_rules = [
        ("QRR-PRIORITY-001", "MQ-INBOUND-001", "High-Value Priority Route",
         "AMOUNT", ".*", "REGEX_GT_10000", "PRIORITY_PROCESSING"),
        ("QRR-SANCTIONS-001", "MQ-INBOUND-001", "Sanctions Screening Route",
         "BENEFICIARY_COUNTRY", "^(IR|SY|KP|CU)$", "REGEX", "SANCTIONS_HOLD"),
        ("QRR-CURRENCY-001", "MQ-OUTBOUND-001", "Currency-based Route",
         "CURRENCY", "^USD$", "EXACT", "USD_CORRESPONDENT"),
    ]
    for r_id, q_id, r_name, field, pattern, match_type, target in routing_rules:
        if not exists(models.QueueRoutingRule, rule_id=r_id):
            db.add(models.QueueRoutingRule(
                rule_id=r_id,
                queue_id=q_id,
                rule_name=r_name,
                match_field=field,
                match_pattern=pattern,
                match_type=match_type,
                target_workflow_state=target,
                created_at=now,
                created_by="seed_rich_ux",
            ))
    commit("3 queue routing rules")

# ══════════════════════════════════════════════════════════════════════════════
# 16. SIMULATION SANDBOX — 5 scenarios + jobs
# ══════════════════════════════════════════════════════════════════════════════
print("── Simulation Sandbox ──")
simulations = [
    ("SIM-RATE-HIKE-001", "Interest Rate Hike Stress Test",
     "Simulate impact of 200bps rate hike on loan portfolio NPL ratio",
     {"rate_hike_bps": 200, "stress_horizon_months": 12}),
    ("SIM-FX-SHOCK-001", "EUR/USD 15% Depreciation Shock",
     "Model P&L impact if EUR depreciates 15% against USD on open FX positions",
     {"eur_usd_move_pct": -15, "portfolio": "FX_BOOK"}),
    ("SIM-CREDIT-001", "Wholesale Credit Portfolio Stress",
     "Apply PD/LGD shocks to wholesale credit portfolio — adverse macro scenario",
     {"pd_multiplier": 2.5, "lgd_multiplier": 1.3, "scenario": "SEVERE_RECESSION"}),
    ("SIM-LIQUIDITY-001", "30-Day Liquidity Coverage Ratio",
     "Simulate LCR under stressed inflows/outflows for regulatory ILAAP reporting",
     {"outflow_shock_pct": 20, "inflow_credit_pct": 75}),
    ("SIM-FRAUD-RULES-001", "New Fraud Rule Impact Analysis",
     "Estimate false positive rate if new velocity rule RS-VELOCITY-CHK goes live",
     {"rule_id": "RS-VELOCITY-CHK", "sample_size": 10000, "lookback_days": 30}),
]
for s_id, s_name, desc, variables in simulations:
    if not exists(models.SimulationScenario, simulation_id=s_id):
        db.add(models.SimulationScenario(
            simulation_id=s_id,
            simulation_name=s_name,
            description=desc,
            target_workflow_id="WF-SEPA-CT",
            sample_size=1000,
            scenario_variables=variables,
            historical_dataset_source="PROD_ANONYMISED_2025",
            created_at=now,
        ))
        db.add(models.SimulationJob(
            job_id=f"{s_id}-JOB-001",
            simulation_id=s_id,
            status="COMPLETED",
            total_records=1000,
            processed_records=1000,
            results_summary={
                "outcome": "PASS" if simulations.index((s_id, s_name, desc, variables)) % 3 != 0 else "FAIL",
                "p99_latency_ms": 45,
                "throughput_tps": 220,
                "error_rate_pct": 0.3,
                "summary": f"Simulation completed. {s_name} — results within acceptable parameters.",
            },
            created_at=now,
        ))
commit("5 simulations + jobs")

# ══════════════════════════════════════════════════════════════════════════════
# 17. EVENTS — 10 event types
# ══════════════════════════════════════════════════════════════════════════════
print("── Event Repository ──")
events = [
    ("PAYMENT_SETTLED", "workflow-executor", "Payment successfully settled in core banking"),
    ("PAYMENT_REJECTED", "workflow-executor", "Payment rejected — validation or sanctions failure"),
    ("FRAUD_ALERT_RAISED", "business-rules-engine", "Fraud rule triggered — transaction flagged for review"),
    ("AML_FLAG_RAISED", "business-rules-engine", "AML rule triggered — CTR or SAR candidate identified"),
    ("RECON_BREAK_DETECTED", "reconciliation-worker", "Nostro/Vostro reconciliation break exceeds tolerance"),
    ("KYC_EXPIRY_WARNING", "scheduler", "KYC document expiry within 30-day warning window"),
    ("BATCH_JOB_COMPLETED", "batch-gateway", "Scheduled batch job completed — success or failure"),
    ("APPROVAL_REQUESTED", "governance-engine", "4-eye approval request raised for high-value transaction"),
    ("APPROVAL_GRANTED", "governance-engine", "4-eye approval granted by authorised checker"),
    ("FX_RATE_BREACH", "calculation-engine", "FX rate moved outside approved policy band"),
]
for ev_type, src, desc in events:
    if not exists(models.EventDefinition, event_type=ev_type):
        db.add(models.EventDefinition(
            event_type=ev_type,
            source_module=src,
            description=desc,
            created_at=now,
        ))
commit("10 event definitions")

# ══════════════════════════════════════════════════════════════════════════════
# 18. INSIGHTS FACTORY — 8 insight definitions
# ══════════════════════════════════════════════════════════════════════════════
print("── Insights Factory ──")
insights = [
    ("INS-PAYMENT-TREND-001", "Payment Volume Trend", "PAYMENT_TREND",
     "Tracks weekly payment volume changes — flags anomalies vs 4-week rolling average",
     "SCHEDULED", "OPERATIONS"),
    ("INS-FRAUD-HOTSPOT-001", "Fraud Hotspot Detection", "FRAUD_PATTERN",
     "Identifies merchant categories and geographies with above-average fraud rates",
     "EVENT_DRIVEN", "FRAUD"),
    ("INS-CREDIT-CONCENTR-001", "Credit Concentration Risk", "CREDIT_RISK",
     "Flags when single-sector exposure exceeds 25% of total credit portfolio",
     "SCHEDULED", "RISK"),
    ("INS-NOSTRO-FORECAST-001", "Nostro Balance Forecast", "LIQUIDITY",
     "7-day nostro balance projection using historical flow patterns and scheduled settlements",
     "SCHEDULED", "TREASURY"),
    ("INS-FX-VOLATILITY-001", "FX Volatility Alert", "MARKET_RISK",
     "Alerts treasury when implied volatility on key CCY pairs spikes >2 standard deviations",
     "EVENT_DRIVEN", "TREASURY"),
    ("INS-KYC-PIPELINE-001", "KYC Renewal Pipeline", "COMPLIANCE",
     "Shows upcoming KYC renewals by relationship manager — prioritised by client tier",
     "SCHEDULED", "COMPLIANCE"),
    ("INS-RECON-EFFICIENCY-001", "Reconciliation Auto-Match Rate", "OPERATIONS",
     "Tracks % of recon items auto-matched vs manually resolved — KPI for ops efficiency",
     "SCHEDULED", "OPERATIONS"),
    ("INS-CUSTOMER-CHURN-001", "Customer Churn Risk Score", "RETAIL",
     "ML-scored churn probability for retail customers based on product usage and transaction patterns",
     "SCHEDULED", "RETAIL"),
]
for i_id, i_name, i_code, desc, trigger, dashboard_cat in insights:
    if not exists(models.InsightDefinition, insight_id=i_id):
        db.add(models.InsightDefinition(
            insight_id=i_id,
            insight_name=i_name,
            insight_code=i_code,
            description=desc,
            status="ACTIVE",
            trigger_type=trigger,
            trigger_config={"schedule": "0 7 * * 1-5"} if trigger == "SCHEDULED" else {"event": "PAYMENT_SETTLED"},
            dashboard_category=dashboard_cat,
            analysis_steps=[],
            application_package_id=PKG_ID,
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("8 insight definitions")

# ══════════════════════════════════════════════════════════════════════════════
# 19. UNSTRUCTURED DOCS — 5 extraction blueprints
# ══════════════════════════════════════════════════════════════════════════════
print("── Unstructured Document Studio ──")
blueprints = [
    ("UEBP-INVOICE-001", "Trade Invoice Extractor",
     "Extract invoice number, amount, vendor, due date from PDF trade invoices",
     ["INVOICE_NUMBER", "INVOICE_AMOUNT", "VENDOR_NAME", "DUE_DATE", "PO_NUMBER"]),
    ("UEBP-BANKSTMT-001", "Bank Statement Parser",
     "Extract transactions, dates, balances from PDF bank statements",
     ["OPENING_BALANCE", "CLOSING_BALANCE", "TRANSACTION_DATE", "AMOUNT", "NARRATIVE"]),
    ("UEBP-CONTRACT-001", "Loan Agreement Extractor",
     "Extract key terms from loan facility agreements: principal, rate, tenor, covenants",
     ["PRINCIPAL_AMOUNT", "INTEREST_RATE", "TENOR_MONTHS", "COVENANT_CLAUSE", "EXECUTION_DATE"]),
    ("UEBP-IDENTITY-001", "ID Document Verifier",
     "Extract identity fields from passport, national ID, or driving licence",
     ["FULL_NAME", "DATE_OF_BIRTH", "NATIONALITY", "DOCUMENT_NUMBER", "EXPIRY_DATE"]),
    ("UEBP-SWIFT-CONF-001", "SWIFT Confirmation Extractor",
     "Extract settlement details from SWIFT MT300/MT320 confirmation PDFs",
     ["TRADE_DATE", "VALUE_DATE", "BOUGHT_AMOUNT", "SOLD_AMOUNT", "COUNTERPARTY_BIC"]),
]
for bp_id, bp_name, desc, fields in blueprints:
    if not exists(models.UnstructuredExtractionBlueprint, blueprint_id=bp_id):
        db.add(models.UnstructuredExtractionBlueprint(
            blueprint_id=bp_id,
            blueprint_name=bp_name,
            description=desc,
            extraction_profile=json.dumps({"mode": "AI_EXTRACT", "layout": "UNSTRUCTURED"}),
            ai_extraction_config=json.dumps({
                "model": "claude-sonnet-4-6",
                "prompt_template": f"Extract the following fields from this document: {', '.join(fields)}",
                "output_format": "JSON",
            }),
            confidence_threshold=0.85,
            fallback_mode="HUMAN_REVIEW",
            application_package_id=PKG_ID,
            version_number=1,
            status="ACTIVE",
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("5 unstructured extraction blueprints")

# ══════════════════════════════════════════════════════════════════════════════
# 20. DOC CHECKLISTS — 5 checklists with items
# ══════════════════════════════════════════════════════════════════════════════
print("── Document Checklists ──")
checklists = [
    ("DCL-LOAN-CORP-001", "Corporate Loan Documentation", "APPROVE",
     [("Audited Financial Statements — last 3 years", True, ["PDF"]),
      ("Management Accounts — last 6 months", True, ["PDF", "XLSX"]),
      ("Board Resolution authorising borrowing", True, ["PDF"]),
      ("Valuation Report — collateral property", False, ["PDF"]),
      ("Insurance Certificate", True, ["PDF"]),]),
    ("DCL-TRADE-LC-001", "Letter of Credit Documentation", "APPROVE",
     [("Commercial Invoice", True, ["PDF"]),
      ("Bill of Lading / Airway Bill", True, ["PDF"]),
      ("Certificate of Origin", True, ["PDF"]),
      ("Packing List", False, ["PDF", "XLSX"]),
      ("Insurance Policy", True, ["PDF"]),]),
    ("DCL-ONBOARD-RETAIL-001", "Retail Customer Onboarding", "ONBOARD",
     [("Passport or National ID", True, ["PDF", "JPG", "PNG"]),
      ("Proof of Address — utility bill", True, ["PDF", "JPG"]),
      ("Tax Identification Number", True, ["PDF"]),]),
    ("DCL-FX-TRADE-001", "FX Trade Documentation", "SETTLE",
     [("Signed Trade Confirmation", True, ["PDF"]),
      ("ISDA Master Agreement", True, ["PDF"]),
      ("Settlement Instructions", True, ["PDF"]),]),
    ("DCL-AML-EDD-001", "Enhanced Due Diligence — High Risk", "COMPLIANCE",
     [("Source of Funds Declaration", True, ["PDF"]),
      ("Ultimate Beneficial Owner Declaration", True, ["PDF"]),
      ("Politically Exposed Person Declaration", True, ["PDF"]),
      ("Enhanced Risk Assessment Report", True, ["PDF"]),]),
]
for cl_id, cl_name, wf_step, items in checklists:
    if not exists(models.DocumentChecklist, checklist_id=cl_id):
        db.add(models.DocumentChecklist(
            checklist_id=cl_id,
            checklist_name=cl_name,
            description=f"Document requirements for {cl_name}",
            intended_workflow_step=wf_step,
            application_package_id=PKG_ID,
            version_number=1,
            status="ACTIVE",
            created_at=now,
        ))
        for i, (doc_name, is_mandatory, formats) in enumerate(items):
            db.add(models.DocumentChecklistItem(
                item_id=f"{cl_id}-ITEM-{i+1}",
                checklist_id=cl_id,
                document_name=doc_name,
                is_mandatory=is_mandatory,
                accepted_formats=formats,
                max_file_size_mb=10,
                upload_instructions=f"Upload {doc_name} — max 10MB, accepted: {', '.join(formats)}",
                sort_order=i + 1,
                created_at=now,
            ))
commit("5 checklists + items")

# ══════════════════════════════════════════════════════════════════════════════
# 21. ROLES & USERS — 8 roles, 12 users
# ══════════════════════════════════════════════════════════════════════════════
print("── Roles & Users ──")
roles = [
    ("COMPLIANCE_OFFICER", "Compliance Officer",
     "AML/KYC oversight, regulatory reporting, sanctions screening review",
     {"can_view": True, "can_modify_data": True, "can_modify_design": False, "can_approve": True}),
    ("TREASURY_DEALER", "Treasury Dealer",
     "FX trading, money market, structured products — within approved limits",
     {"can_view": True, "can_modify_data": True, "can_modify_design": False, "can_approve": False}),
    ("TRADE_FINANCE_ANALYST", "Trade Finance Analyst",
     "LC processing, documentary collections, trade guarantee management",
     {"can_view": True, "can_modify_data": True, "can_modify_design": False, "can_approve": False}),
    ("CREDIT_ANALYST", "Credit Analyst",
     "Loan origination support, credit scoring, covenant monitoring",
     {"can_view": True, "can_modify_data": True, "can_modify_design": False, "can_approve": False}),
    ("OPS_MANAGER", "Operations Manager",
     "Oversees payment ops, recon, batch gateway, nostro management",
     {"can_view": True, "can_modify_data": True, "can_modify_design": False, "can_approve": True}),
    ("FRAUD_ANALYST", "Fraud Analyst",
     "Fraud alert triage, rule tuning, case management",
     {"can_view": True, "can_modify_data": True, "can_modify_design": False, "can_approve": False}),
    ("SYSTEM_DESIGNER", "System Designer",
     "Platform configuration — workflow, rules, screens, reports design",
     {"can_view": True, "can_modify_data": True, "can_modify_design": True, "can_approve": False}),
    ("SENIOR_APPROVER", "Senior Approver",
     "4-eye final approval for high-value transactions and compliance overrides",
     {"can_view": True, "can_modify_data": False, "can_modify_design": False, "can_approve": True}),
]
for role_code, role_name, desc, perms in roles:
    if not exists(models.RoleProfile, role_code=role_code):
        db.add(models.RoleProfile(
            role_id=uid("ROLE-"),
            role_code=role_code,
            role_name=role_name,
            description=desc,
            package_id=PKG_ID,
            is_system_role=False,
            default_permissions=perms,
            status="ACTIVE",
            created_at=now,
            created_by="seed_rich_ux",
        ))
commit("8 roles")

users = [
    ("bob_james", "Bob James", "bob.james@bank.com", "COMPLIANCE_OFFICER"),
    ("carol_white", "Carol White", "carol.white@bank.com", "TREASURY_DEALER"),
    ("david_chan", "David Chan", "david.chan@bank.com", "TRADE_FINANCE_ANALYST"),
    ("emma_patel", "Emma Patel", "emma.patel@bank.com", "CREDIT_ANALYST"),
    ("frank_obi", "Frank Obi", "frank.obi@bank.com", "OPS_MANAGER"),
    ("grace_kim", "Grace Kim", "grace.kim@bank.com", "FRAUD_ANALYST"),
    ("henry_silva", "Henry Silva", "henry.silva@bank.com", "SYSTEM_DESIGNER"),
    ("iris_brown", "Iris Brown", "iris.brown@bank.com", "SENIOR_APPROVER"),
    ("james_ng", "James Ng", "james.ng@bank.com", "COMPLIANCE_OFFICER"),
    ("kate_muller", "Kate Muller", "kate.muller@bank.com", "OPS_MANAGER"),
    ("leo_santos", "Leo Santos", "leo.santos@bank.com", "TREASURY_DEALER"),
    ("mary_foster", "Mary Foster", "mary.foster@bank.com", "FRAUD_ANALYST"),
]
for username, display_name, email, role in users:
    if not exists(models.UserProfile, username=username):
        db.add(models.UserProfile(
            user_id=uid("USR-"),
            username=username,
            display_name=display_name,
            email=email,
            primary_role_code=role,
            package_ids=[PKG_ID],
            status="ACTIVE",
            created_at=now,
        ))
commit("12 users")

# ══════════════════════════════════════════════════════════════════════════════
# 22. ENTITLEMENTS — 12 policies covering all roles
# ══════════════════════════════════════════════════════════════════════════════
print("── Entitlements ──")
entitlements = [
    ("ENT-COMP-RULES", "ACTION", "BUSINESS_RULES_VIEW", "Compliance Rules Access",
     "COMPLIANCE_OFFICER", True, True, False, True),
    ("ENT-TREAS-CALC", "ACTION", "CALCULATION_ENGINE_EXEC", "Treasury Calc Access",
     "TREASURY_DEALER", True, True, False, False),
    ("ENT-TRADE-SCREEN", "SCREEN", "SCR-TRADE-LC-001", "Trade Finance Screen",
     "TRADE_FINANCE_ANALYST", True, True, False, False),
    ("ENT-CREDIT-RPT", "REPORT", "RPT-LOAN-001", "Credit Portfolio Report",
     "CREDIT_ANALYST", True, False, False, False),
    ("ENT-OPS-RECON", "ACTION", "RECONCILIATION_MANAGE", "Ops Reconciliation Access",
     "OPS_MANAGER", True, True, False, True),
    ("ENT-FRAUD-RULES", "ACTION", "FRAUD_RULE_TUNE", "Fraud Rule Tuning",
     "FRAUD_ANALYST", True, True, False, False),
    ("ENT-DESIGNER-ALL", "ACTION", "DESIGNER_FULL_ACCESS", "Full Designer Access",
     "SYSTEM_DESIGNER", True, True, True, False),
    ("ENT-APPROVER-GOV", "ACTION", "GOVERNANCE_APPROVE", "Governance Approval Rights",
     "SENIOR_APPROVER", True, False, False, True),
    ("ENT-COMP-AML-RPT", "REPORT", "RPT-AML-001", "AML Report Access",
     "COMPLIANCE_OFFICER", True, False, False, False),
    ("ENT-OPS-BATCH", "ACTION", "BATCH_GATEWAY_MANAGE", "Batch Gateway Management",
     "OPS_MANAGER", True, True, False, False),
    ("ENT-TREAS-FX-RPT", "REPORT", "RPT-FX-001", "FX P&L Report",
     "TREASURY_DEALER", True, False, False, False),
    ("ENT-ADMIN-ALL", "ACTION", "ADMIN_FULL_ACCESS", "Admin Full Access",
     "APPROVER", True, True, True, True),
]
for e_id, e_type, e_entity_id, e_name, role, can_view, can_modify, can_design, can_approve in entitlements:
    if not exists(models.EntitlementPolicy, policy_id=e_id):
        db.add(models.EntitlementPolicy(
            policy_id=e_id,
            entity_type=e_type,
            entity_id=e_entity_id,
            entity_name=e_name,
            application_package_id=PKG_ID,
            role_code=role,
            can_view=can_view,
            can_modify_data=can_modify,
            can_modify_design=can_design,
            can_approve=can_approve,
            created_at=now,
        ))
commit("12 entitlement policies")

# ══════════════════════════════════════════════════════════════════════════════
# 23. WORKFLOW EXECUTION INSTANCES — execution history for governance + reporting
# ══════════════════════════════════════════════════════════════════════════════
print("── Workflow Execution History ──")
executions = [
    ("EXEC-001", "WF-SEPA-CT", "COMPLETED", "alice_chen", 1_500_000),
    ("EXEC-002", "WF-SEPA-CT", "FAILED", "bob_james", 2_500_000),
    ("EXEC-003", "WF-FX-SETTLE", "COMPLETED", "carol_white", 5_000_000),
    ("EXEC-004", "WF-KYC-ONBOARD", "PENDING_APPROVAL", "david_chan", 0),
    ("EXEC-005", "WF-FRAUD-ALERT", "COMPLETED", "grace_kim", 12_500),
    ("EXEC-006", "WF-ACH-BATCH", "COMPLETED", "frank_obi", 8_750_000),
    ("EXEC-007", "WF-NOSTRO-RECON", "COMPLETED", "frank_obi", 0),
    ("EXEC-008", "WF-LOAN-ORIG", "IN_REVIEW", "emma_patel", 15_000_000),
]
for ex_id, wf_id, status, user, amount in executions:
    if not exists(models.WorkflowExecutionInstance, instance_id=ex_id):
        db.add(models.WorkflowExecutionInstance(
            instance_id=ex_id,
            workflow_id=wf_id,
            status=status,
            current_node_id=f"{wf_id}-N1",
            current_context={"triggered_by": user, "amount": amount, "currency": "EUR", "reference": ex_id},
            execution_trace=[{"step": "TRIGGERED", "by": user, "at": now}],
            created_at=now,
            updated_at=now,
        ))
commit("8 workflow execution instances")

print("\n" + "═"*60)
print("✅  Rich UX seed complete!")
print("═"*60)
print(f"  Workflows:       10")
print(f"  Business Rules:  12")
print(f"  Calc Programs:   10")
print(f"  File Templates:   8")
print(f"  Mappers:          8")
print(f"  API Configs:     10")
print(f"  Screens:          8")
print(f"  Reports:          8")
print(f"  Notif Policies:   8")
print(f"  Comm Templates:   8")
print(f"  Recon Templates:  8")
print(f"  Batch Configs:    8")
print(f"  Simulations:      5")
print(f"  Insights:         8")
print(f"  Events:          10")
print(f"  Unstructured:     5")
print(f"  Doc Checklists:   5")
print(f"  Roles:            8")
print(f"  Users:           12")
print(f"  Entitlements:    12")
print(f"  Exec Instances:   8")
print(f"  Products:         3 (extra)")
print("═"*60)
db.close()
