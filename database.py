import os
from sqlalchemy import create_engine  # FIXED: Changed create_backend_engine to create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from fastapi import Header, HTTPException, status
from typing import Optional

# Migrate to enterprise PostgreSQL connection pool
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./infinity_db.sqlite")

# The base class that our database model classes will inherit from
Base = declarative_base()

# --- Multi-Region Sharding Implementation (Layer 7) ---
# This is the active implementation of the Dynamic Multi-Tenant Database Router.

regional_engines = {
    "DEFAULT": create_engine(DATABASE_URL, connect_args={"check_same_thread": False}),
    "EU": create_engine(os.getenv("DATABASE_URL_EU", DATABASE_URL), connect_args={"check_same_thread": False}),
    "IN": create_engine(os.getenv("DATABASE_URL_IN", DATABASE_URL), connect_args={"check_same_thread": False}),
    "US": create_engine(os.getenv("DATABASE_URL_US", DATABASE_URL), connect_args={"check_same_thread": False}),
}

RegionalSessionLocal = {
    region: sessionmaker(autocommit=False, autoflush=False, bind=_eng)
    for region, _eng in regional_engines.items()
}

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