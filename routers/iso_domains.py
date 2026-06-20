# WHY THIS FILE EXISTS:
# Dedicated router for ISO Domain taxonomy endpoints, mounted at /api/v1/fields.
# Kept separate from registry.py because the registry router prefix is
# /api/v1/fields/registry, which has a catch-all /{field_id} route that
# would swallow /registry/domains before it could be matched.
# Mounting here at /api/v1/fields/domains avoids that conflict cleanly.

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime

from database import get_db
from auth import get_current_user, CurrentUser

router = APIRouter(
    prefix="/api/v1/fields",
    tags=["ISO Domain Taxonomy"],
)


@router.get("/domains", summary="List All ISO Domains and Subdomains")
def list_iso_domains(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns the full domain taxonomy grouped by parent domain.
    Used by the Package Initialization Wizard (domain multi-select)
    and the Field Registry Studio (domain filter tabs).
    """
    rows = db.execute(
        text("""SELECT domain_code, subdomain_code, domain_display_name,
                       subdomain_display_name, description, icon, sort_order
                FROM iso_domains ORDER BY domain_code, sort_order""")
    ).fetchall()

    grouped: dict = {}
    for row in rows:
        dc = row[0]
        if dc not in grouped:
            grouped[dc] = {
                "domain_code": dc,
                "domain_display_name": row[2],
                "icon": row[5],
                "subdomains": [],
            }
        grouped[dc]["subdomains"].append({
            "subdomain_code":       row[1],
            "subdomain_display_name": row[3],
            "description":          row[4],
            "sort_order":           row[6],
        })

    return {"domains": list(grouped.values()), "total_count": len(grouped)}


@router.get("/domains/package/{package_id}", summary="Get ISO Domains for a Package")
def get_package_domains(package_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """Returns which ISO domains a specific package has selected."""
    rows = db.execute(
        text("SELECT domain_code FROM package_iso_domains WHERE package_id = :pkg"),
        {"pkg": package_id}
    ).fetchall()
    return {"package_id": package_id, "domain_codes": [r[0] for r in rows]}


@router.put("/domains/package/{package_id}", summary="Set ISO Domains for a Package")
def set_package_domains(package_id: str, body: dict, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Replaces the domain associations for a package.
    Called by the Package Initialization Wizard when domains are confirmed.
    Body: { domain_codes: string[] }
    """
    now = datetime.utcnow().isoformat()
    domain_codes: list = body.get("domain_codes", [])

    db.execute(text("DELETE FROM package_iso_domains WHERE package_id = :pkg"), {"pkg": package_id})
    for dc in domain_codes:
        db.execute(
            text("INSERT INTO package_iso_domains (package_id, domain_code, created_at, created_by) VALUES (:pkg, :dc, :now, :by)"),
            {"pkg": package_id, "dc": dc, "now": now, "by": current_user.get("user_id", "SYSTEM")}
        )
    db.commit()
    return {"package_id": package_id, "domain_codes": domain_codes, "message": f"{len(domain_codes)} domains associated."}
