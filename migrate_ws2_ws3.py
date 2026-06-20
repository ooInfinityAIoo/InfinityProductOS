"""
WHY THIS SCRIPT EXISTS:
Applies WS-2 (Screen Versioning) and WS-3 (Business Domain Entity) migrations
to the SQLite database. Run ONCE after the code changes are deployed.

    python migrate_ws2_ws3.py

Safe to re-run — uses ALTER TABLE IF NOT EXISTS patterns and INSERT OR IGNORE.
"""

import sqlite3
from datetime import datetime, timezone
import uuid

DB_PATH = "infinity_db.sqlite"

def run():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # ─────────────────────────────────────────────────────────────────────────
    # WS-2: Screen Versioning columns on screen_templates
    # ─────────────────────────────────────────────────────────────────────────
    print("WS-2: Adding versioning columns to screen_templates...")

    existing_cols = {row[1] for row in cur.execute("PRAGMA table_info(screen_templates)").fetchall()}

    if "version_number" not in existing_cols:
        cur.execute("ALTER TABLE screen_templates ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1")
        print("  + version_number")
    if "parent_screen_id" not in existing_cols:
        cur.execute("ALTER TABLE screen_templates ADD COLUMN parent_screen_id TEXT")
        print("  + parent_screen_id")
    if "made_live_at" not in existing_cols:
        cur.execute("ALTER TABLE screen_templates ADD COLUMN made_live_at TEXT")
        print("  + made_live_at")
    if "made_live_by" not in existing_cols:
        cur.execute("ALTER TABLE screen_templates ADD COLUMN made_live_by TEXT")
        print("  + made_live_by")

    # Migrate existing status values: ACTIVE → LIVE so existing screens stay visible
    cur.execute("UPDATE screen_templates SET status = 'LIVE' WHERE status = 'ACTIVE'")
    updated = cur.rowcount
    print(f"  → {updated} existing ACTIVE screens promoted to LIVE")

    # Migrate old screen_template_category values to new three-type model
    cur.execute("""
        UPDATE screen_templates SET screen_template_category = 'MAINTENANCE'
        WHERE screen_template_category IN ('COMMON_MASTER', 'Master Data', 'Business workflow Configurations')
    """)
    cur.execute("""
        UPDATE screen_templates SET screen_template_category = 'CONFIGURATION'
        WHERE screen_template_category IN ('BUSINESS_WORKFLOW', 'Configuration')
    """)
    cur.execute("""
        UPDATE screen_templates SET screen_template_category = 'TRANSACTION'
        WHERE screen_template_category IN ('PRODUCT_CONFIG', 'Transaction')
    """)
    print("  → screen_template_category values normalised to MAINTENANCE/CONFIGURATION/TRANSACTION")

    # ─────────────────────────────────────────────────────────────────────────
    # WS-3: business_domains table + default domains for Payment Hub
    # ─────────────────────────────────────────────────────────────────────────
    print("\nWS-3: Creating business_domains table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS business_domains (
            domain_id            TEXT PRIMARY KEY,
            package_id           TEXT NOT NULL,
            domain_name          TEXT NOT NULL,
            domain_code          TEXT NOT NULL,
            icon                 TEXT,
            description          TEXT,
            screen_type_affinity TEXT,
            is_system_default    INTEGER DEFAULT 1,
            sort_order           INTEGER DEFAULT 0,
            status               TEXT NOT NULL DEFAULT 'ACTIVE',
            created_at           TEXT NOT NULL,
            created_by           TEXT DEFAULT 'SYSTEM',
            FOREIGN KEY (package_id) REFERENCES master_product_application_packages(package_id)
        )
    """)

    # Add business_domain_id column to screen_templates if missing
    existing_cols = {row[1] for row in cur.execute("PRAGMA table_info(screen_templates)").fetchall()}
    if "business_domain_id" not in existing_cols:
        cur.execute("ALTER TABLE screen_templates ADD COLUMN business_domain_id TEXT")
        print("  + business_domain_id on screen_templates")

    # Seed default Business Domains for every existing package
    packages = cur.execute("SELECT package_id, package_name FROM master_product_application_packages").fetchall()
    print(f"\n  Seeding default domains for {len(packages)} package(s)...")

    # Default domain set for any package — covers the three screen types + common banking sections
    DEFAULT_DOMAINS = [
        ("MASTERS",        "Masters",              "🗂️",  "MAINTENANCE",   "Master and reference data screens (currencies, countries, banks)", 1),
        ("CONFIGURATION",  "Configuration",        "⚙️",  "CONFIGURATION", "Configuration screens that drive workflow routing conditions",    2),
        ("TRANSACTIONS",   "Transactions",         "✅",  "TRANSACTION",   "Transaction screens with human-in-loop workflow steps",          3),
        ("FX_OPS",         "FX Operations",        "💱",  None,            "Foreign exchange rates, currency configuration",                  4),
        ("WIRE_PAYMENTS",  "Wire Payments",        "🏦",  None,            "SWIFT, FEDWIRE, CHIPS, ACH payment processing",                  5),
        ("RECONCILIATION", "Reconciliation",       "⚖️",  None,            "Nostro/Vostro matching and settlement reconciliation",            6),
        ("REPORTS",        "Reports & Analytics",  "📊",  None,            "Settlement reports, regulatory returns, dashboards",             7),
    ]

    for pkg in packages:
        for (code, name, icon, affinity, desc, order) in DEFAULT_DOMAINS:
            domain_id = f"DOM-{pkg['package_id'][:8]}-{code}"
            cur.execute("""
                INSERT OR IGNORE INTO business_domains
                  (domain_id, package_id, domain_name, domain_code, icon, description,
                   screen_type_affinity, is_system_default, sort_order, status, created_at, created_by)
                VALUES (?,?,?,?,?,?,?,1,?,?,?,?)
            """, (domain_id, pkg["package_id"], name, code, icon, desc, affinity, order, "ACTIVE", now, "MIGRATION"))
        print(f"  → {pkg['package_name']}: 7 default domains seeded")

    # Auto-assign existing screens to their domain based on screen_template_category
    print("\n  Auto-assigning existing screens to domains...")
    screens = cur.execute("""
        SELECT s.screen_id, s.screen_template_category, s.application_package_id
        FROM screen_templates s
        WHERE s.business_domain_id IS NULL AND s.application_package_id IS NOT NULL
    """).fetchall()

    for screen in screens:
        category = screen["screen_template_category"]
        pkg_id = screen["application_package_id"]
        # Map screen type → domain code
        code = {"MAINTENANCE": "MASTERS", "CONFIGURATION": "CONFIGURATION", "TRANSACTION": "TRANSACTIONS"}.get(category, "MASTERS")
        domain_id = f"DOM-{pkg_id[:8]}-{code}"
        cur.execute("UPDATE screen_templates SET business_domain_id = ? WHERE screen_id = ?",
                    (domain_id, screen["screen_id"]))

    print(f"  → {len(screens)} screens assigned to domains")

    conn.commit()
    conn.close()
    print("\n✅ WS-2 + WS-3 migration complete.")


if __name__ == "__main__":
    run()
