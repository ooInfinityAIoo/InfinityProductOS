"""
WHY THIS SCRIPT EXISTS (Finding C1):
Seeds a small DEV sanctions list (OFAC_SDN) so the Business Rule Engine's sanctions
screening can actually evaluate. This is a tiny illustrative subset of well-known
public OFAC SDN entries — NOT a production feed. The real workflow is to swap this
seed for an OFAC daily-delta loader; the SanctionsService and BusinessRuleEngine
contracts are unchanged.

Idempotent: re-running upserts the OFAC_SDN list (does not create duplicates).

Run: python seed_sanctions_lists.py
"""
from datetime import datetime, timezone

from database import SessionLocal, engine
import models

# A handful of well-known publicly-listed SDN entries for development. The fields here
# (primary_name, aliases, bic, program, dod) are the schema the SanctionsService matches
# against — keep this shape stable. Real feed will populate the same dicts.
OFAC_SDN_DEV_ENTRIES = [
    {
        "primary_name": "ROSBANK",
        "aliases": ["PJSC ROSBANK", "OAO ROSBANK"],
        "bic": "RSBNRUMM",
        "program": "RUSSIA-EO14024",
        "dod": "2022-04-06",
    },
    {
        "primary_name": "SOVCOMBANK",
        "aliases": ["PJSC SOVCOMBANK"],
        "bic": "SOMRRUMM",
        "program": "RUSSIA-EO14024",
        "dod": "2022-02-24",
    },
    {
        "primary_name": "VTB BANK",
        "aliases": ["JSC VTB BANK", "BANK VTB"],
        "bic": "VTBRRUMM",
        "program": "RUSSIA-EO14024",
        "dod": "2022-02-24",
    },
    {
        "primary_name": "BANK MELLI IRAN",
        "aliases": ["BANK MELLI"],
        "bic": "MELIIRTH",
        "program": "IRAN",
        "dod": "2007-10-25",
    },
    {
        "primary_name": "ALPHA BANK GROUP",  # Fictional canary for testing
        "aliases": [],
        "bic": "ALPHABDS",
        "program": "TEST-CANARY",
        "dod": "2026-01-01",
    },
]


def upsert_ofac_sdn(db):
    """Create or update the OFAC_SDN list row, keyed by token_code."""
    now = datetime.now(timezone.utc).isoformat()
    existing = (
        db.query(models.SanctionsList)
        .filter(models.SanctionsList.token_code == "OFAC_SDN")
        .first()
    )
    if existing:
        existing.entries = OFAC_SDN_DEV_ENTRIES
        existing.updated_at = now
        existing.source = "DEV_STATIC"
        existing.description = (
            "Development static subset of public OFAC SDN entries — for engine testing only."
        )
        action = "updated"
    else:
        db.add(
            models.SanctionsList(
                list_id="SL-OFAC-SDN-001",
                token_code="OFAC_SDN",
                list_name="OFAC Specially Designated Nationals (DEV subset)",
                description=(
                    "Development static subset of public OFAC SDN entries — for engine testing only."
                ),
                entries=OFAC_SDN_DEV_ENTRIES,
                source="DEV_STATIC",
                updated_at=now,
            )
        )
        action = "created"
    db.commit()
    return action


def main():
    models.Base.metadata.create_all(bind=engine)  # ensure sanctions_lists table exists
    db = SessionLocal()
    try:
        action = upsert_ofac_sdn(db)
        print(f"OFAC_SDN list {action} with {len(OFAC_SDN_DEV_ENTRIES)} entries.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
