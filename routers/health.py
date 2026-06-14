from fastapi import APIRouter, Depends, status, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import text
import datetime
from typing import List, Optional
import asyncio
import httpx

from database import get_db
from event_bus import global_event_bus, SystemEvent, trigger_external_api, handle_email_notification, handle_slack_notification
import schemas
from auth import get_current_user, require_admin, CurrentUser

router = APIRouter(
    prefix="/api/v1/health",
)

# --- RBAC Dependencies and Models (copied from governance router) ---

@router.get("/", response_model=schemas.SystemHealthResponse, summary="Get System Health Status")
def get_system_health(db: Session = Depends(get_db)):
    return {
        "system_status": "OK",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "checks": [
            {"check_name": "placeholder", "status": "OK", "details": "Basic health check passed."}
        ]
    }
@router.get("/db-sessions", response_model=schemas.DatabaseSessionListResponse, summary="Get Active Database Sessions")
def get_active_db_sessions(db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves a list of active sessions from the database.
    NOTE: This feature is specific to PostgreSQL and will not work with SQLite.
    Requires admin privileges.
    """
    if db.bind.dialect.name != 'postgresql':
        return schemas.DatabaseSessionListResponse(
