"""
seed_packages.py — Initialize the core banking product packages.

WHY THIS FILE EXISTS:
A Package is the top of the platform hierarchy (Package -> Product -> Sub-Product)
and the unit a bank "deploys". Beyond the Payment Hub golden path, the platform
ships these six domain packages as starting points. This script creates them
idempotently so they survive a database re-seed and are reproducible across the
two AI dev environments — run it any time after the DB exists.

HOW TO RUN:
    python seed_packages.py
"""
from __future__ import annotations

import datetime
import uuid

from database import SessionLocal
import models

# Standard module-configuration checklist (mirrors Payment Hub) so each package
# shows the same implementation tracker across the studios.
STD_PLAN = [
    {"module_name": "ISO Field Registry Sync", "owner": "Data Governance Team", "sla_days": 2, "is_configured": False},
    {"module_name": "DataGateway Mappers", "owner": "Integration Team", "sla_days": 5, "is_configured": False},
    {"module_name": "Business Rule Sets", "owner": "Risk Analysts", "sla_days": 4, "is_configured": False},
    {"module_name": "Calculation Engine", "owner": "Quantitative Team", "sla_days": 6, "is_configured": False},
    {"module_name": "API Designer", "owner": "Integration Team", "sla_days": 3, "is_configured": False},
    {"module_name": "Screen Designer", "owner": "UX Team", "sla_days": 5, "is_configured": False},
    {"module_name": "File Template Designer", "owner": "UX Team", "sla_days": 4, "is_configured": False},
    {"module_name": "Report Designer", "owner": "Reporting Team", "sla_days": 4, "is_configured": False},
    {"module_name": "Reconciliation Engine", "owner": "Finance Ops", "sla_days": 7, "is_configured": False},
    {"module_name": "Workflow Orchestration", "owner": "Product Ops", "sla_days": 7, "is_configured": False},
]

# (package_name, business_domain, jurisdiction, base_currency, description).
# Jurisdiction/currency default to US/USD — adjust per deployment.
PACKAGES = [
    ("Structured Finance", "Capital Markets", "US", "USD",
     "Securitisation & ABS servicing — collateral, waterfall calc, investor reporting, distributions."),
    ("Supply Chain Finance and Factoring", "Trade & Supply Chain Finance", "US", "USD",
     "Payables/receivables finance, reverse factoring, invoice discounting and factoring."),
    ("Trade Finance", "Trade Finance", "US", "USD",
     "Documentary credits (LC), guarantees, collections and trade document examination."),
    ("Cash Management", "Cash Management", "US", "USD",
     "Corporate cash operations — payments, collections, account services and pooling."),
    ("Liquidity Management", "Liquidity Management", "US", "USD",
     "Notional/physical pooling, sweeps, intercompany lending and position visibility."),
    ("Treasury System", "Treasury", "US", "USD",
     "FX, money markets, investments, hedging and treasury risk management."),
]


def run() -> int:
    db = SessionLocal()
    created = 0
    try:
        for name, domain, country, ccy, desc in PACKAGES:
            exists = (
                db.query(models.ProductApplicationPackage)
                .filter_by(package_name=name)
                .first()
            )
            if exists:
                print(f"[skip] '{name}' already exists ({exists.package_id})")
                continue
            pkg = models.ProductApplicationPackage(
                package_id=f"PKG-{uuid.uuid4().hex[:8].upper()}",
                package_name=name,
                business_domain=domain,
                jurisdiction_country_code=country,
                base_currency_code=ccy,
                description=desc,
                status="DRAFT",
                implementation_status="IN_PROGRESS",
                configuration_plan=STD_PLAN,
                created_at=datetime.datetime.utcnow().isoformat(),
            )
            db.add(pkg)
            db.commit()
            created += 1
            print(f"[created] {pkg.package_id}  {name}  ({domain})")
        return created
    finally:
        db.close()


if __name__ == "__main__":
    n = run()
    print(f"Done — {n} package(s) created.")
