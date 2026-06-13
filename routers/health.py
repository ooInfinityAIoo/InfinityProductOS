from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import datetime
from typing import List, Optional
import asyncio
from enum import Enum
from pydantic import BaseModel
import httpx

from database import get_db
from event_bus import global_event_bus, SystemEvent, trigger_external_api, handle_email_notification, handle_slack_notification
import schemas

router = APIRouter(
    prefix="/api/v1/health",
    tags=["System Health"]
)

# --- RBAC Dependencies and Models (copied from governance router) ---

class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    AUDITOR = "auditor"

class CurrentUser(BaseModel):
    id: str
    role: UserRole

def get_current_user(
    x_user_id: Optional[str] = Header(None, description="The ID of the user performing the action."),
    x_user_role: Optional[str] = Header(None, description="The role of the user (admin, operator, auditor).")
) -> CurrentUser:
    if not x_user_id or not x_user_role:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="X-User-ID and X-User-Role headers are required.")
    try:
        user_role = UserRole(x_user_role.lower())
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role '{x_user_role}'.")
    return CurrentUser(id=x_user_id, role=user_role)

def require_admin(current_user: CurrentUser = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This action requires admin privileges.")
    return current_user

@router.get("/", response_model=schemas.SystemHealthResponse, summary="Get System Health Status")
def get_system_health(db: Session = Depends(get_db)):
    """
    Performs a health check on the system's core dependencies, such as the database connection.
    """
    checks = []
    overall_status = "OK"

    # 1. Database Health Check
    try:
        db.execute(text("SELECT 1"))
        db_check = schemas.SystemHealthCheck(check_name="database", status="OK", details="Database connection is healthy.")
    except Exception:
        overall_status = "UNHEALTHY"
        db_check = schemas.SystemHealthCheck(check_name="database", status="UNHEALTHY", details="Database connection failed.")
    
    checks.append(db_check)

    # 2. Event Bus Health Check
    try:
        # A simple check: verify the bus exists and has registered listeners.
        if global_event_bus and global_event_bus._listeners:
            listener_count = sum(len(listeners) for listeners in global_event_bus._listeners.values())
            
            if global_event_bus._is_paused:
                overall_status = "UNHEALTHY"
                eb_check = schemas.SystemHealthCheck(check_name="event_bus", status="UNHEALTHY", details=f"Event bus is PAUSED. {listener_count} listeners are registered but will not receive events.")
            elif listener_count > 0:
                eb_check = schemas.SystemHealthCheck(check_name="event_bus", status="OK", details=f"Event bus is ACTIVE with {listener_count} registered listener callbacks.")
            else:
                overall_status = "UNHEALTHY"
                eb_check = schemas.SystemHealthCheck(check_name="event_bus", status="UNHEALTHY", details="Event bus is active but has no registered listeners.")
        else:
            overall_status = "UNHEALTHY"
            eb_check = schemas.SystemHealthCheck(check_name="event_bus", status="UNHEALTHY", details="Event bus is not initialized.")
    except Exception:
        overall_status = "UNHEALTHY"
        eb_check = schemas.SystemHealthCheck(check_name="event_bus", status="UNHEALTHY", details="Failed to check event bus status.")
    
    checks.append(eb_check)

    # 3. External API Dependency Check (Example)
    try:
        # In a real system, use a dedicated health endpoint of the external service.
        # Using a well-known public API for demonstration.
        with httpx.Client(timeout=5.0) as client:
            response = client.get("https://api.github.com")
            response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)
        api_check = schemas.SystemHealthCheck(check_name="external_api_dependency", status="OK", details="Successfully connected to external API (e.g., Core Banking).")
    except httpx.RequestError as e:
        overall_status = "UNHEALTHY"
        api_check = schemas.SystemHealthCheck(check_name="external_api_dependency", status="UNHEALTHY", details=f"Failed to connect to external API: {e.__class__.__name__}")
    except Exception:
        overall_status = "UNHEALTHY"
        api_check = schemas.SystemHealthCheck(check_name="external_api_dependency", status="UNHEALTHY", details="An unexpected error occurred while checking external API.")
    checks.append(api_check)

    return {
        "system_status": overall_status,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "checks": checks
    }

@router.get("/db-sessions", response_model=schemas.DatabaseSessionListResponse, summary="Get Active Database Sessions")
def get_active_db_sessions(db: Session = Depends(get_db)):
    """
    Retrieves a list of active sessions from the database.
    NOTE: This feature is specific to PostgreSQL and will not work with SQLite.
    """
    if db.bind.dialect.name != 'postgresql':
        return schemas.DatabaseSessionListResponse(
            sessions=[],
            message=f"This feature is only supported for PostgreSQL. Current dialect: {db.bind.dialect.name}"
        )
    
    try:
        # Query for active sessions, excluding the current query itself.
        query = text("""
            SELECT pid, usename, client_addr::text, state, query 
            FROM pg_stat_activity 
            WHERE state = 'active' AND query NOT ILIKE '%%pg_stat_activity%%';
        """)
        result = db.execute(query).mappings().all()
        
        return {"sessions": result}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query database sessions: {str(e)}"
        )

@router.delete("/db-sessions/{pid}", response_model=schemas.TerminateSessionResponse, summary="Terminate a Database Session")
def terminate_db_session(pid: int, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Terminates a specific database session by its Process ID (PID).
    This is a privileged operation and requires admin rights.
    NOTE: This feature is specific to PostgreSQL.
    """
    if db.bind.dialect.name != 'postgresql':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This feature is only supported for PostgreSQL. Current dialect: {db.bind.dialect.name}"
        )
    
    try:
        # pg_terminate_backend returns true if successful, false otherwise (e.g., PID doesn't exist)
        query = text("SELECT pg_terminate_backend(:pid);")
        result = db.execute(query, {"pid": pid}).scalar()
        
        if result:
            return {"success": True, "message": f"Successfully requested termination for session with PID {pid}."}
        else:
            # This can happen if the PID does not exist or has already terminated.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session with PID {pid} not found or already terminated."
            )
            
    except Exception as e:
        # This could catch permission errors from the database user
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to terminate database session: {str(e)}"
        )

@router.get("/event-bus-listeners", response_model=schemas.EventBusStatusResponse, summary="Get All Registered Event Listeners")
def get_event_bus_listeners(current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves a list of all registered event types and their listener callbacks.
    This is useful for debugging the event-driven architecture. Requires admin privileges.
    """
    listeners_dict = {}
    try:
        for event_type, callbacks in global_event_bus._listeners.items():
            listeners_dict[event_type] = [{"callback_name": cb.__name__} for cb in callbacks]
        return {"listeners": listeners_dict}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to inspect event bus listeners: {str(e)}")

# A registry of allowed, safe-to-register callback functions.
# This prevents arbitrary code execution.
ALLOWED_CALLBACKS = {
    "trigger_external_api": trigger_external_api,
    "handle_email_notification": handle_email_notification,
    "handle_slack_notification": handle_slack_notification,
}

@router.post("/event-bus-listeners", response_model=schemas.EventListenerRegistrationResponse, summary="Dynamically Register an Event Listener")
def register_event_listener(
    payload: schemas.EventListenerRegistration,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Dynamically registers a new listener for a specific event type.
    The callback must be from a predefined list of allowed functions.
    This is a privileged operation for debugging and requires admin rights.
    """
    event_type = payload.event_type.upper()
    callback_name = payload.callback_name

    # 1. Validate the event type
    if event_type not in global_event_bus._listeners:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid event_type '{payload.event_type}'. Not a known event."
        )

    # 2. Validate the callback name against the allowed registry
    if callback_name not in ALLOWED_CALLBACKS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid callback_name '{callback_name}'. Not an allowed callback."
        )

    callback_func = ALLOWED_CALLBACKS[callback_name]

    # 3. Check if this listener is already registered to avoid duplicates
    if callback_func in global_event_bus._listeners[event_type]:
        return {"success": True, "message": f"Listener '{callback_name}' is already registered for event '{event_type}'."}

    # 4. Register the listener
    global_event_bus.register_listener(event_type, callback_func)
    return {"success": True, "message": f"Successfully registered listener '{callback_name}' for event '{event_type}'."}

@router.delete("/event-bus-listeners", response_model=schemas.EventListenerRegistrationResponse, summary="Dynamically Unregister an Event Listener")
def unregister_event_listener(
    payload: schemas.EventListenerRegistration,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Dynamically unregisters a listener for a specific event type.
    This is a privileged operation for debugging and requires admin rights.
    """
    event_type = payload.event_type.upper()
    callback_name = payload.callback_name

    # 1. Validate the event type
    if event_type not in global_event_bus._listeners:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid event_type '{payload.event_type}'. Not a known event."
        )

    # 2. Validate the callback name against the allowed registry
    if callback_name not in ALLOWED_CALLBACKS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid callback_name '{callback_name}'. Not an allowed callback."
        )

    callback_func = ALLOWED_CALLBACKS[callback_name]

    # 3. Unregister the listener
    success = global_event_bus.unregister_listener(event_type, callback_func)
    if success:
        return {"success": True, "message": f"Successfully unregistered listener '{callback_name}' from event '{event_type}'."}
    else:
        return {"success": False, "message": f"Listener '{callback_name}' was not registered for event '{event_type}'. No action taken."}

@router.get("/event-bus/stats", response_model=schemas.EventBusStatsResponse, summary="Get Event Bus Statistics")
def get_event_bus_stats(current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves statistics from the Event Bus, such as the total number of events broadcast
    and counts for each event type. Requires admin privileges.
    """
    try:
        stats = global_event_bus._stats
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve event bus stats: {str(e)}")

@router.get("/event-bus/recent-events", response_model=schemas.RecentEventListResponse, summary="Get Most Recent Events")
def get_recent_events(current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves a list of the most recent events broadcast by the event bus.
    This is useful for real-time debugging. Requires admin privileges.
    """
    try:
        # The deque stores events with the newest on the right.
        # We reverse it to show the absolute most recent event first.
        recent_events = list(reversed(global_event_bus._recent_events))
        return {"events": recent_events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve recent events: {str(e)}")

@router.post("/event-bus/pause", response_model=schemas.EventBusControlResponse, summary="Pause the Event Bus")
def pause_event_bus(current_user: CurrentUser = Depends(require_admin)):
    """
    Temporarily pauses the entire event bus. While paused, the bus will not broadcast any new events.
    This is a privileged operation for system maintenance and requires admin rights.
    """
    try:
        global_event_bus.pause()
        return {"status": "PAUSED", "message": "Event bus has been paused. No new events will be broadcast."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to pause event bus: {str(e)}")

@router.post("/event-bus/resume", response_model=schemas.EventBusControlResponse, summary="Resume the Event Bus")
def resume_event_bus(current_user: CurrentUser = Depends(require_admin)):
    """
    Resumes a paused event bus, allowing it to broadcast events again.
    This is a privileged operation for system maintenance and requires admin rights.
    """
    try:
        global_event_bus.resume()
        return {"status": "ACTIVE", "message": "Event bus has been resumed. Event broadcasting is now active."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resume event bus: {str(e)}")

@router.post("/event-bus/broadcast", response_model=schemas.EventListenerRegistrationResponse, summary="Manually Broadcast a Custom Event")
def broadcast_manual_event(
    payload: schemas.ManualEventBroadcast,
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Manually broadcasts a custom event on the event bus.
    This is a privileged operation for testing and debugging. Requires admin rights.
    """
    try:
        event_to_broadcast = SystemEvent(
            event_type=payload.event_type,
            source_context=payload.source_context,
            payload=payload.payload
        )
        asyncio.run(global_event_bus.broadcast(event_to_broadcast))
        
        return {"success": True, "message": f"Successfully broadcast event '{payload.event_type}'."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to broadcast event: {str(e)}")

@router.get("/event-bus/dropped-events", response_model=schemas.RecentEventListResponse, summary="Get Events Dropped While Paused")
def get_dropped_events(current_user: CurrentUser = Depends(require_admin)):
    """
    Retrieves a list of events that were dropped while the event bus was in a 'PAUSED' state.
    This is useful for debugging and understanding what actions were missed during a maintenance window.
    Requires admin privileges.
    """
    try:
        # The deque stores events with the newest on the right.
        # We reverse it to show the most recently dropped event first.
        dropped_events = list(reversed(global_event_bus._dropped_events))
        return {"events": dropped_events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve dropped events: {str(e)}")

@router.delete("/event-bus/dropped-events", response_model=schemas.ClearEventsResponse, summary="Clear the Log of Dropped Events")
def clear_dropped_events(current_user: CurrentUser = Depends(require_admin)):
    """
    Clears the in-memory log of events that were dropped while the event bus was paused.
    This is an administrative action to acknowledge and reset the log.
    Requires admin privileges.
    """
    try:
        cleared_count = global_event_bus.clear_dropped_events()
        return {
            "cleared_count": cleared_count,
            "message": f"Successfully cleared {cleared_count} dropped events from the log."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear dropped events: {str(e)}")