import json
import datetime
from typing import Dict, Any, TYPE_CHECKING
import os
if TYPE_CHECKING:
    from event_bus import SystemEvent
from jinja2 import Environment, FileSystemLoader

class NotificationService:
    """
    Handles sending notifications for system events (e.g., email, Slack).
    For this implementation, it simulates sending an email by printing to the console.
    """
    def __init__(self):
        """
        Initializes the service and sets up the Jinja2 templating environment.
        """
        # Assumes templates are in a 'templates/notifications' directory at the project root
        template_dir = os.path.join(os.path.dirname(__file__), '..', 'templates', 'notifications')
        self.env = Environment(loader=FileSystemLoader(template_dir), autoescape=True)

    def send_workflow_event_email(self, event: "SystemEvent"):
        """
        Formats and "sends" an email based on a workflow event using a Jinja2 template.
        """
        subject = f"InfinityOS Notification: {event.event_type} in {event.source_context}"
        
        try:
            template = self.env.get_template('workflow_event.html')
            # Render the HTML body from the template
            body = template.render(
                event=event,
                timestamp=datetime.datetime.utcnow().isoformat(),
                payload_json=json.dumps(event.payload, indent=2)
            )
        except Exception as e:
            # Fallback to simple text if template rendering fails for any reason
            print(f"[ERROR] Email template rendering failed: {e}")
            body = f"""
Dear User,

A system event has occurred:

Event ID: {event.event_id}
Event Type: {event.event_type}
Source: {event.source_context}
Timestamp: {datetime.datetime.utcnow().isoformat()}

Payload Details:
{json.dumps(event.payload, indent=2)}

This is an automated notification from InfinityProductOS.
(Note: Email template rendering failed, showing raw text.)
"""

        print("\n--- SIMULATING EMAIL NOTIFICATION ---")
        print(f"To: product.operations@example.com")
        print(f"Subject: {subject}")
        print("Content-Type: text/html") # To indicate it's an HTML email
        print(body)
        print("-------------------------------------\n")