import json
import datetime
from typing import Dict, Any
from event_bus import SystemEvent
import os
import httpx

class SlackService:
    """
    Handles sending notifications to Slack for system events.
    For this implementation, it simulates sending a message by printing a JSON payload to the console.
    """

    def __init__(self):
        """
        Initializes the service and fetches the Slack webhook URL from environment variables.
        """
        self.webhook_url = os.getenv("SLACK_WEBHOOK_URL")

    def send_workflow_event_message(self, event: SystemEvent):
        """
        Formats and "sends" a Slack message based on a workflow event.
        """
        status_color = "#36a64f" # green
        if event.event_type.endswith("_FAILED") or event.event_type.endswith("_ERROR"):
            status_color = "#d50200" # red
        elif event.event_type == "GOVERNANCE_TASK_CREATED":
            status_color = "#ffab00" # yellow

        # Mimics Slack's Block Kit JSON payload
        slack_payload = {
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"InfinityOS Alert: {event.event_type}"
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Source:*\n`{event.source_context}`"},
                        {"type": "mrkdwn", "text": f"*Event ID:*\n`{event.event_id}`"}
                    ]
                },
                {
                    "type": "divider"
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Payload Details:*\n```\n{json.dumps(event.payload, indent=2)}\n```"
                    }
                }
            ],
            "attachments": [
                {
                    "color": status_color,
                    "blocks": [
                        {
                            "type": "context",
                            "elements": [
                                {
                                    "type": "mrkdwn",
                                    "text": f"Timestamp (UTC): {datetime.datetime.utcnow().isoformat()}"
                                }
                            ]
                        }
                    ]
                }
            ]
        }

        if self.webhook_url and "hooks.slack.com" in self.webhook_url:
            try:
                with httpx.Client() as client:
                    response = client.post(self.webhook_url, json=slack_payload)
                    response.raise_for_status()
                print(f"\n--- Slack Notification Sent to {self.webhook_url} ---")
            except httpx.RequestError as e:
                print(f"\n--- FAILED to Send Slack Notification ---")
                print(f"Error: Could not connect to Slack webhook URL. {e}")
                print("Payload (JSON):")
                print(json.dumps(slack_payload, indent=2))
                print("-----------------------------------------\n")
        else:
            print("\n--- SIMULATING SLACK NOTIFICATION (Webhook URL not configured) ---")
            print(json.dumps(slack_payload, indent=2))
            print("------------------------------------------------------------------\n")