"""
WHY THIS SCRIPT EXISTS:
Migrates the ISO Field Registry from a flat placeholder tagging
(all 3,000 fields tagged PAYMENTS / ISO_GOLDEN_SOURCE) to the
confirmed 9-domain taxonomy agreed with product owner on 2026-06-19.

Also seeds the iso_domains table with the full taxonomy and creates
the package_iso_domains table.

Run ONCE after confirming the taxonomy:
    python migrate_iso_domains.py

Safe to re-run — uses UPDATE not INSERT for field tags, and
INSERT OR IGNORE for domain seed rows.
"""

import sqlite3
import re
from datetime import datetime, timezone

DB_PATH = "infinity_db.sqlite"

# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN TAXONOMY
# (domain_code, subdomain_code, domain_display_name, subdomain_display_name,
#  description, icon, sort_order)
# ─────────────────────────────────────────────────────────────────────────────
DOMAINS = [
    ("WIRE_PAYMENTS", "SWIFT_CROSS_BORDER",  "Wire & SWIFT Payments", "SWIFT / Cross-border",      "MT103, pacs.008 international wires",              "🏦", 1),
    ("WIRE_PAYMENTS", "RTGS_HIGH_VALUE",     "Wire & SWIFT Payments", "RTGS / High Value",          "FEDWIRE, CHAPS, TARGET2 same-day settlements",     "🏦", 2),
    ("WIRE_PAYMENTS", "ACH_LOW_VALUE",       "Wire & SWIFT Payments", "ACH / Low Value",            "Batch, NACHA, BACS, SEPA credit transfers",        "🏦", 3),
    ("WIRE_PAYMENTS", "INSTANT_RTP",         "Wire & SWIFT Payments", "Instant / RTP",              "RTP, FPS, TIPS real-time payment rails",            "🏦", 4),

    ("CARD_PAYMENTS", "CARD_TRANSACTION",    "Card Payments",         "Card Transaction",           "Authorisation, clearing, settlement lifecycle",     "💳", 1),
    ("CARD_PAYMENTS", "CARD_AUTH",           "Card Payments",         "Card Authentication",        "3DS, token, PIN, EMV chip data",                   "💳", 2),
    ("CARD_PAYMENTS", "CARD_ACCOUNT",        "Card Payments",         "Card Account",               "Card account balance and statement fields",         "💳", 3),
    ("CARD_PAYMENTS", "CARD_BATCH",          "Card Payments",         "Card Batch & Aggregation",   "Batch transfer files and aggregated totals",        "💳", 4),

    ("ATM_CHANNEL",   "ATM_TRANSACTION",     "ATM Channel",           "ATM Transactions",           "Cash dispense, deposit, balance inquiry",           "🏧", 1),
    ("ATM_CHANNEL",   "ATM_STATEMENT",       "ATM Channel",           "ATM Account Statement",      "Balance and mini-statement at ATM",                "🏧", 2),
    ("ATM_CHANNEL",   "ATM_AMOUNTS",         "ATM Channel",           "ATM Amounts & Reconciliation","Cassette totals, ATM balancing fields",            "🏧", 3),

    ("ACCOUNT_MGMT",  "ACCOUNT_ID",          "Account Management",    "Account Identification",     "IBAN, BBAN, account name, purpose codes",          "📋", 1),
    ("ACCOUNT_MGMT",  "ACCOUNT_STATEMENT",   "Account Management",    "Account Statement & Balance", "Balance types, statement entries, cash entries",   "📋", 2),
    ("ACCOUNT_MGMT",  "ACCOUNT_PARTIES",     "Account Management",    "Account Parties",            "Owner, mandate holders, joint account parties",    "📋", 3),
    ("ACCOUNT_MGMT",  "ACCOUNT_NOTIFY",      "Account Management",    "Account Notifications",      "Status updates, alerts, account switching",        "📋", 4),

    ("FOREIGN_EXCHANGE", "CURRENCY_MASTER",  "Foreign Exchange",      "Currency Master",            "Currency codes, decimal places, active/historic",  "💱", 1),
    ("FOREIGN_EXCHANGE", "EXCHANGE_RATE",    "Foreign Exchange",      "Exchange Rate",              "Spot, forward and cross currency rates",           "💱", 2),
    ("FOREIGN_EXCHANGE", "FX_CONVERSION",    "Foreign Exchange",      "FX Conversion",              "Conversion amounts, acceptor response fields",     "💱", 3),

    ("AMOUNTS_CALC",  "AMOUNT_TYPES",        "Amounts & Calculations","Amount Types",               "Instructed, equivalent, authorised, haircut amounts","🧮", 1),
    ("AMOUNTS_CALC",  "PRICE_RATE",          "Amounts & Calculations","Price & Rate",               "Price per unit, rate status, quantity ratios",     "🧮", 2),
    ("AMOUNTS_CALC",  "TAX_CHARGES",         "Amounts & Calculations","Tax & Charges",              "Tax amounts, penalty charges, aggregated fees",    "🧮", 3),

    ("COUNTERPARTY",  "CUSTOMER_ID",         "Counterparty & Customer","Customer Identification",   "Name, address, identity documents, CIF number",   "🤝", 1),
    ("COUNTERPARTY",  "BENEFICIARY",         "Counterparty & Customer","Beneficiary",               "Payment destination party details",                "🤝", 2),
    ("COUNTERPARTY",  "ORDERING_PARTY",      "Counterparty & Customer","Ordering Party",            "Initiating party and debtor details",              "🤝", 3),

    ("COMPLIANCE",    "AML_SCREENING",       "Compliance & Risk",     "AML Screening",              "Transaction monitoring and alert fields",          "🛡️", 1),
    ("COMPLIANCE",    "SANCTIONS",           "Compliance & Risk",     "Sanctions / OFAC",           "Name screening, SDN list match fields",            "🛡️", 2),
    ("COMPLIANCE",    "KYC_CDD",             "Compliance & Risk",     "KYC / CDD",                  "Know Your Customer and due diligence fields",      "🛡️", 3),

    ("REPORTING_AUDIT","SETTLEMENT_RPT",     "Reporting & Audit",     "Settlement Reporting",       "End-of-day, position, nostro/vostro reports",      "📊", 1),
    ("REPORTING_AUDIT","REGULATORY_RPT",     "Reporting & Audit",     "Regulatory Reporting",       "SWIFT GPI, SEPA, regulatory returns",             "📊", 2),
    ("REPORTING_AUDIT","AUDIT_TRAIL",        "Reporting & Audit",     "Audit Trail",                "Event timestamps, actor IDs, status change logs", "📊", 3),
]

# ─────────────────────────────────────────────────────────────────────────────
# FIELD CLASSIFICATION RULES
# Rules are evaluated top-to-bottom; first match wins.
# (prefix_pattern, domain_code, subdomain_code)
# ─────────────────────────────────────────────────────────────────────────────
CLASSIFICATION_RULES = [
    # ATM — before Card so ATM* doesn't fall into Card catch-all
    (r"^ATMTransaction",            "ATM_CHANNEL",      "ATM_TRANSACTION"),
    (r"^ATMTransactionAmounts",     "ATM_CHANNEL",      "ATM_AMOUNTS"),
    (r"^ATMAccountStatement",       "ATM_CHANNEL",      "ATM_STATEMENT"),

    # Card payments
    (r"^CardPaymentTransaction",    "CARD_PAYMENTS",    "CARD_TRANSACTION"),
    (r"^CardPaymentDataSet",        "CARD_PAYMENTS",    "CARD_BATCH"),
    (r"^CardPaymentBatchTransfer",  "CARD_PAYMENTS",    "CARD_BATCH"),
    (r"^CardPaymentEnvironment",    "CARD_PAYMENTS",    "CARD_TRANSACTION"),
    (r"^CardPaymentToken",          "CARD_PAYMENTS",    "CARD_AUTH"),
    (r"^CardAuthenticationData",    "CARD_PAYMENTS",    "CARD_AUTH"),
    (r"^CardData",                  "CARD_PAYMENTS",    "CARD_TRANSACTION"),
    (r"^CardAccount",               "CARD_PAYMENTS",    "CARD_ACCOUNT"),
    (r"^CardIndividualTransaction", "CARD_PAYMENTS",    "CARD_TRANSACTION"),
    (r"^CardAggregated",            "CARD_PAYMENTS",    "CARD_BATCH"),
    (r"^CardAcquisition",           "CARD_PAYMENTS",    "CARD_TRANSACTION"),
    (r"^CardNotReceived",           "CARD_PAYMENTS",    "CARD_TRANSACTION"),
    (r"^CardExchangeRate",          "FOREIGN_EXCHANGE", "EXCHANGE_RATE"),
    (r"^AttendanceCard",            "CARD_PAYMENTS",    "CARD_TRANSACTION"),

    # FX / Currency
    (r"^AcceptorCurrencyConversion","FOREIGN_EXCHANGE", "FX_CONVERSION"),
    (r"^ActiveCurrencyAndAmount",   "FOREIGN_EXCHANGE", "CURRENCY_MASTER"),
    (r"^ActiveOrHistoricCurrency",  "FOREIGN_EXCHANGE", "CURRENCY_MASTER"),
    (r"^AmountAndCurrencyExchange", "FOREIGN_EXCHANGE", "FX_CONVERSION"),
    (r"^AmountAndForeignExchange",  "FOREIGN_EXCHANGE", "FX_CONVERSION"),
    (r"^AmountAndCurrency$",        "FOREIGN_EXCHANGE", "CURRENCY_MASTER"),
    (r"^BreakdownByCurrency",       "FOREIGN_EXCHANGE", "CURRENCY_MASTER"),

    # Account management
    (r"^AccountNotification",       "ACCOUNT_MGMT",     "ACCOUNT_NOTIFY"),
    (r"^AccountStatement",          "ACCOUNT_MGMT",     "ACCOUNT_STATEMENT"),
    (r"^AccountStatementData",      "ACCOUNT_MGMT",     "ACCOUNT_STATEMENT"),
    (r"^AccountStatementDetails",   "ACCOUNT_MGMT",     "ACCOUNT_STATEMENT"),
    (r"^AccountReport",             "ACCOUNT_MGMT",     "ACCOUNT_STATEMENT"),
    (r"^AccountBalance",            "ACCOUNT_MGMT",     "ACCOUNT_STATEMENT"),
    (r"^AccountBalanceSD",          "ACCOUNT_MGMT",     "ACCOUNT_STATEMENT"),
    (r"^AccountAndBalance",         "ACCOUNT_MGMT",     "ACCOUNT_STATEMENT"),
    (r"^AccountCashEntry",          "ACCOUNT_MGMT",     "ACCOUNT_STATEMENT"),
    (r"^BalanceAmounts",            "ACCOUNT_MGMT",     "ACCOUNT_STATEMENT"),
    (r"^AccountIdentification",     "ACCOUNT_MGMT",     "ACCOUNT_ID"),
    (r"^AccountAndParties",         "ACCOUNT_MGMT",     "ACCOUNT_PARTIES"),
    (r"^AccountParties",            "ACCOUNT_MGMT",     "ACCOUNT_PARTIES"),
    (r"^AccountRole",               "ACCOUNT_MGMT",     "ACCOUNT_PARTIES"),
    (r"^AccountSubLevel",           "ACCOUNT_MGMT",     "ACCOUNT_PARTIES"),
    (r"^AccountSwitchDetails",      "ACCOUNT_MGMT",     "ACCOUNT_NOTIFY"),
    (r"^AccountLink",               "ACCOUNT_MGMT",     "ACCOUNT_NOTIFY"),
    (r"^AccountManagement",         "ACCOUNT_MGMT",     "ACCOUNT_ID"),
    (r"^AccountingAccount",         "ACCOUNT_MGMT",     "ACCOUNT_ID"),
    (r"^Account",                   "ACCOUNT_MGMT",     "ACCOUNT_ID"),   # catch-all for Account*

    # Amounts & calculations
    (r"^AmountAndTax",              "AMOUNTS_CALC",     "TAX_CHARGES"),
    (r"^AggregatedPenaltyAmount",   "AMOUNTS_CALC",     "TAX_CHARGES"),
    (r"^AggregatedIndependentAmount","AMOUNTS_CALC",    "TAX_CHARGES"),
    (r"^AmountPrice",               "AMOUNTS_CALC",     "PRICE_RATE"),
    (r"^AmountToAmountRatio",       "AMOUNTS_CALC",     "PRICE_RATE"),
    (r"^AmountAndQuantityRatio",    "AMOUNTS_CALC",     "PRICE_RATE"),
    (r"^AmountAndRateStatus",       "AMOUNTS_CALC",     "PRICE_RATE"),
    (r"^AmountAndRate",             "AMOUNTS_CALC",     "PRICE_RATE"),
    (r"^AmountAndPeriod",           "AMOUNTS_CALC",     "PRICE_RATE"),
    (r"^AmountHaircutMargin",       "AMOUNTS_CALC",     "PRICE_RATE"),
    (r"^AmountOrPercentageRange",   "AMOUNTS_CALC",     "PRICE_RATE"),
    (r"^AmountRangeBoundary",       "AMOUNTS_CALC",     "PRICE_RATE"),
    (r"^Amount",                    "AMOUNTS_CALC",     "AMOUNT_TYPES"),  # catch-all
    (r"^AdditionalAmounts",         "AMOUNTS_CALC",     "AMOUNT_TYPES"),
    (r"^AmountsAndValueDate",       "AMOUNTS_CALC",     "AMOUNT_TYPES"),
    (r"^AvailableFinancialResources","AMOUNTS_CALC",    "AMOUNT_TYPES"),
    (r"^AuthorisedAmount",          "AMOUNTS_CALC",     "AMOUNT_TYPES"),
    (r"^AggregationTransaction",    "AMOUNTS_CALC",     "AMOUNT_TYPES"),
    (r"^AmountAndDirection",        "AMOUNTS_CALC",     "AMOUNT_TYPES"),

    # Counterparty
    (r"^customer",                  "COUNTERPARTY",     "CUSTOMER_ID"),

    # Reporting / audit
    (r"^BankTransactionCode",       "REPORTING_AUDIT",  "AUDIT_TRAIL"),

    # Wire payments — catch-all for anything unmatched that had PAYMENTS domain
    (r"^",                          "WIRE_PAYMENTS",    "SWIFT_CROSS_BORDER"),
]

def classify_field(technical_sys_name: str) -> tuple[str, str]:
    """Match field name against classification rules, return (domain, subdomain)."""
    # Strip trailing version numbers and the underscore-separated rest to get the class name
    class_name = technical_sys_name.split("_")[0]
    for pattern, domain, subdomain in CLASSIFICATION_RULES:
        if re.match(pattern, class_name):
            return domain, subdomain
    return "WIRE_PAYMENTS", "SWIFT_CROSS_BORDER"


def run_migration():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    print("Step 1: Creating iso_domains and package_iso_domains tables...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS iso_domains (
            domain_code          TEXT NOT NULL,
            subdomain_code       TEXT NOT NULL,
            domain_display_name  TEXT NOT NULL,
            subdomain_display_name TEXT NOT NULL,
            description          TEXT,
            icon                 TEXT,
            sort_order           INTEGER DEFAULT 0,
            created_at           TEXT NOT NULL,
            PRIMARY KEY (domain_code, subdomain_code)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS package_iso_domains (
            package_id   TEXT NOT NULL,
            domain_code  TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            created_by   TEXT DEFAULT 'SYSTEM',
            PRIMARY KEY (package_id, domain_code)
        )
    """)

    print("Step 2: Seeding iso_domains taxonomy...")
    for row in DOMAINS:
        cur.execute("""
            INSERT OR REPLACE INTO iso_domains
              (domain_code, subdomain_code, domain_display_name, subdomain_display_name,
               description, icon, sort_order, created_at)
            VALUES (?,?,?,?,?,?,?,?)
        """, (*row, now))
    print(f"  → {len(DOMAINS)} domain/subdomain rows seeded.")

    print("Step 3: Re-tagging all ISO fields by domain taxonomy...")
    cur.execute("SELECT field_id, technical_sys_name FROM iso_field_registry")
    fields = cur.fetchall()
    counts = {}
    for field in fields:
        domain, subdomain = classify_field(field["technical_sys_name"])
        cur.execute("""
            UPDATE iso_field_registry
            SET domain_category = ?, subdomain_category = ?
            WHERE field_id = ?
        """, (domain, subdomain, field["field_id"]))
        counts[domain] = counts.get(domain, 0) + 1

    print(f"  → {len(fields)} fields re-tagged:")
    for domain, count in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"       {count:4d}  {domain}")

    print("Step 4: Associating existing Payment Hub package with its domains...")
    cur.execute("SELECT package_id FROM master_product_application_packages LIMIT 1")
    pkg = cur.fetchone()
    if pkg:
        payment_hub_domains = [
            "WIRE_PAYMENTS", "FOREIGN_EXCHANGE", "ACCOUNT_MGMT",
            "COUNTERPARTY", "COMPLIANCE", "REPORTING_AUDIT"
        ]
        for domain_code in payment_hub_domains:
            cur.execute("""
                INSERT OR IGNORE INTO package_iso_domains (package_id, domain_code, created_at, created_by)
                VALUES (?, ?, ?, 'MIGRATION')
            """, (pkg["package_id"], domain_code, now))
        print(f"  → Payment Hub ({pkg['package_id']}) associated with {len(payment_hub_domains)} domains.")
    else:
        print("  → No packages found — run seed_pkg.py first to create Payment Hub.")

    conn.commit()
    conn.close()
    print("\n✅ Migration complete.")


if __name__ == "__main__":
    run_migration()
