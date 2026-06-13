import asyncio
from typing import Dict, Any, List, Callable
from pydantic import BaseModel, Field
import uuid
from collections import deque
import datetime

# Import the new service
from services.notification_service import NotificationService # Email
from services.slack_service import SlackService # Slack

class SystemEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: f"EVT-{uuid.uuid4().hex[:12]}")
    broadcast_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())
    event_type: str  # STATE_TRANSITION, RULES_EXECUTION, CALCULATION_OUTPUT, EXCEPTION_ERROR
    source_context: str
    payload: Dict[str, Any]

class EventBusEngine:
    def __init__(self):
        self._listeners: Dict[str, List[Callable]] = {
            "STATE_TRANSITION": [],
            "RULES_EXECUTION": [],
            "CALCULATION_OUTPUT": [],
            "EXCEPTION_ERROR": [],
            "WORKFLOW_COMPLETED": [],
            "WORKFLOW_FAILED": [],
            "GOVERNANCE_TASK_CREATED": [],
            "ARCHIVAL_TASK_COMPLETED": [],
            "LOG_CLEANUP_COMPLETED": [],
            "JOB_RESTORED_FROM_ARCHIVE": [],
            "GOVERNANCE_TASK_RESOLVED": [],
            "JOB_CANCELLED": [],
            "STUCK_JOB_DETECTED": [],
            "STALE_GOVERNANCE_TASK_DETECTED": [],
        }
        self.notification_service = NotificationService()
        self.slack_service = SlackService()
        # Add stats tracking
        self._stats: Dict[str, Any] = {
            "total_events_broadcast": 0,
            "events_by_type": {event_type: 0 for event_type in self._listeners}
        }
        # Add a deque to store recent events
        self._recent_events: deque = deque(maxlen=100) # Store the last 100 events
        # Add paused state
        self._is_paused: bool = False
        # Add a deque to store dropped events
        self._dropped_events: deque = deque(maxlen=200) # Store the last 200 dropped events

    def register_listener(self, event_type: str, callback: Callable):
        event_type_upper = event_type.upper()
        if event_type_upper not in self._listeners:
            self._listeners[event_type_upper] = []
            # Also initialize stats counter for dynamically added event types
            self._stats["events_by_type"][event_type_upper] = 0
        self._listeners[event_type_upper].append(callback)

    def unregister_listener(self, event_type: str, callback: Callable) -> bool:
        """Removes a specific listener for a given event type."""
        event_type_upper = event_type.upper()
        if event_type_upper in self._listeners and callback in self._listeners[event_type_upper]:
            self._listeners[event_type_upper].remove(callback)
            return True
        return False

    def pause(self):
        """Pauses the event bus, preventing new events from being broadcast."""
        self._is_paused = True
        # Clear any previously dropped events to start a fresh log for this paused session
        self._dropped_events.clear()
        print("[EVENT BUS] Event bus has been PAUSED.")

    def resume(self):
        """Resumes the event bus, allowing events to be broadcast."""
        self._is_paused = False
        print("[EVENT BUS] Event bus has been RESUMED.")

    def clear_dropped_events(self) -> int:
        """Clears the log of dropped events and returns the number of events cleared."""
        count = len(self._dropped_events)
        self._dropped_events.clear()
        return count

    async def broadcast(self, event: SystemEvent):
        evt_type = event.event_type.upper()
        if self._is_paused:
            self._dropped_events.append(event)
            print(f"[EVENT BUS - PAUSED] Dropped event: {evt_type} from {event.source_context}")
            return

        # Update stats
        self._stats["total_events_broadcast"] += 1
        if evt_type in self._stats["events_by_type"]:
            self._stats["events_by_type"][evt_type] += 1
        else:
            # Handle case where an event is broadcast for which no listener was ever registered
            self._stats["events_by_type"][evt_type] = 1

        # Add event to recent events deque
        self._recent_events.append(event)

        if evt_type in self._listeners:
            print(f"[EVENT BUS] Intercepted Signal: {evt_type} from {event.source_context}")
            for callback in self._listeners[evt_type]:
                # Handle both sync and async callbacks
                if asyncio.iscoroutinefunction(callback):
                    await callback(event)
                else:
                    callback(event)

global_event_bus = EventBusEngine()

# Sample downstream automated actions
async def trigger_external_api(event: SystemEvent):
    print(f"  └── [Layer 4 Action] Executing REST API outbound broadcast for fields: {list(event.payload.keys())}")

# New listener for email notifications
def handle_email_notification(event: SystemEvent):
    """A wrapper function to call the notification service."""
    print(f"  └── [Layer 4 Action] Triggering Email Notification Service for event: {event.event_type}")
    global_event_bus.notification_service.send_workflow_event_email(event)

# New listener for Slack notifications
def handle_slack_notification(event: SystemEvent):
    """A wrapper function to call the Slack notification service."""
    print(f"  └── [Layer 4 Action] Triggering Slack Notification Service for event: {event.event_type}")
    global_event_bus.slack_service.send_workflow_event_message(event)


global_event_bus.register_listener("STATE_TRANSITION", trigger_external_api)
global_event_bus.register_listener("CALCULATION_OUTPUT", trigger_external_api)

# Register the new notification listener to key workflow and error events
global_event_bus.register_listener("WORKFLOW_COMPLETED", handle_email_notification)
global_event_bus.register_listener("WORKFLOW_COMPLETED", handle_slack_notification)
global_event_bus.register_listener("WORKFLOW_FAILED", handle_email_notification)
global_event_bus.register_listener("WORKFLOW_FAILED", handle_slack_notification)
global_event_bus.register_listener("EXCEPTION_ERROR", handle_email_notification)
global_event_bus.register_listener("EXCEPTION_ERROR", handle_slack_notification)
global_event_bus.register_listener("GOVERNANCE_TASK_CREATED", handle_email_notification)
global_event_bus.register_listener("GOVERNANCE_TASK_CREATED", handle_slack_notification)
global_event_bus.register_listener("ARCHIVAL_TASK_COMPLETED", handle_email_notification)
global_event_bus.register_listener("ARCHIVAL_TASK_COMPLETED", handle_slack_notification)
global_event_bus.register_listener("LOG_CLEANUP_COMPLETED", handle_email_notification)
global_event_bus.register_listener("LOG_CLEANUP_COMPLETED", handle_slack_notification)
global_event_bus.register_listener("JOB_RESTORED_FROM_ARCHIVE", handle_email_notification)
global_event_bus.register_listener("JOB_RESTORED_FROM_ARCHIVE", handle_slack_notification)
global_event_bus.register_listener("GOVERNANCE_TASK_RESOLVED", handle_email_notification)
global_event_bus.register_listener("GOVERNANCE_TASK_RESOLVED", handle_slack_notification)
global_event_bus.register_listener("JOB_CANCELLED", handle_email_notification)
global_event_bus.register_listener("JOB_CANCELLED", handle_slack_notification)
global_event_bus.register_listener("STUCK_JOB_DETECTED", handle_email_notification)
global_event_bus.register_listener("STUCK_JOB_DETECTED", handle_slack_notification)
global_event_bus.register_listener("STALE_GOVERNANCE_TASK_DETECTED", handle_email_notification)
global_event_bus.register_listener("STALE_GOVERNANCE_TASK_DETECTED", handle_slack_notification)