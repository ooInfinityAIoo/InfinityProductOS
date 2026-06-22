import os
import json
from sqlalchemy import create_engine  # FIXED: Changed create_backend_engine to create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from fastapi import Header, HTTPException, status
from typing import Optional

# Migrate to enterprise PostgreSQL connection pool
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./infinity_db.sqlite")


# WHY THIS EXISTS:
# JSON/JSONB columns persist runtime data — workflow execution-instance context,
# immutable evidence payloads, orchestration step results. The Calculation Engine puts
# decimal.Decimal values into that context (ADR #7 — Decimal for money, never float),
# and timestamps arrive as datetime. Python's stdlib JSON encoder can serialize neither,
# so persisting a paused workflow instance (or any row holding computed money) crashed
# with "Object of type Decimal is not JSON serializable" — which silently aborted live
# workflow execution the moment a calc ran before a pause.
# default=str converts ONLY the otherwise-unserializable types (Decimal, datetime) to
# strings; all standard JSON types pass through unchanged. Decimal -> str keeps the exact
# value, so the resumed context re-casts losslessly via Decimal(str(value)).
def _json_serializer(obj) -> str:
    return json.dumps(obj, default=str)


def _make_engine(url: str):
    return create_engine(
        url,
        connect_args={"check_same_thread": False},
        json_serializer=_json_serializer,
    )

# The base class that our database model classes will inherit from
Base = declarative_base()

# --- Multi-Region Sharding Implementation (Layer 7) ---
# This is the active implementation of the Dynamic Multi-Tenant Database Router.

regional_engines = {
    "DEFAULT": _make_engine(DATABASE_URL),
    "EU": _make_engine(os.getenv("DATABASE_URL_EU", DATABASE_URL)),
    "IN": _make_engine(os.getenv("DATABASE_URL_IN", DATABASE_URL)),
    "US": _make_engine(os.getenv("DATABASE_URL_US", DATABASE_URL)),
}

RegionalSessionLocal = {
    region: sessionmaker(autocommit=False, autoflush=False, bind=_eng)
    for region, _eng in regional_engines.items()
}

engine = regional_engines["DEFAULT"]
SessionLocal = RegionalSessionLocal["DEFAULT"]

def get_db(x_tenant_region: Optional[str] = Header("DEFAULT")):
    """
    Dependency provider that yields a database session connected to the appropriate
    regional database shard based on the X-Tenant-Region header.
    """
    region_key = x_tenant_region.upper() if x_tenant_region else "DEFAULT"
    SessionLocal = RegionalSessionLocal.get(region_key, RegionalSessionLocal["DEFAULT"])
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()