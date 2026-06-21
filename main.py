from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import uuid
import datetime
import io
import os
import json
import csv
import xml.etree.ElementTree as ET

# Your existing SQLAlchemy & Local Imports
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import models
from models import Base, WorkflowManifest, LegoBlockConfig, EvidencePacketRegistry
from decomposition import decomposition_processor
from event_bus import global_event_bus, SystemEvent
from services.orchestrator_pipeline import MasterCanvasOrchestrator
import schemas
import openpyxl

# --- Router Imports ---
from routers import registry, workflows, governance, calculations, mappers, masters, ingestion, maintenance, users, dashboard, health, screens, integrations, mock_services, ai_module, rules, domain_apis, ai_assistant, events, insights, reconciliation_engine, reporting, documents, templates, simulations, iso_domains, entitlements, comm_templates, doc_checklists, notification_policies, unstructured_docs, batch_gateway, queues, roles_users

api_description = """
**Infinity ProductOS Core Execution Engine API** 🚀

This is the master API gateway for the Infinity ProductOS enterprise architecture.
It exposes the stateless execution engines, governance guardrails, and dynamic "Logic-as-Data" blueprints to the visual Canva studios.

### Key Subsystems:
* **Workflow Engine**: Manages state transitions and Directed Acyclic Graph (DAG) executions.
* **Business Rules Engine**: Evaluates complex IF-THEN logic matrices.
* **Calculation Engine**: Evaluates symbolic financial mathematical expressions securely.
* **File Template Designer**: Handles Step A/B structure and layout mapping for files.
* **Transformation Mapper**: Step C integration to transform and route structured payloads.
* **Insights Factory**: Orchestrates scheduled and event-driven AI insights.
* **Governance Hub**: Enforces 4-Eye checks, PII masking, and immutable execution logging.
* **Report Builder**: Drag-and-drop Canva dashboards and Headless BI connections.
"""

tags_metadata = [
    {"name": "Workflow Engine", "description": "Layer 1 & 4: Manage and execute DAG workflows."},
    {"name": "Business Rule Engine", "description": "Layer 4: Define and evaluate IF-THEN logic sets."},
    {"name": "Calculation Engine", "description": "Layer 4: Define and evaluate symbolic financial math."},
    {"name": "File Template Designer", "description": "Step A & B: Define physical file layouts and agentic extraction prompts."},
    {"name": "DataGateway Engine", "description": "Step C: Transform extracted templates to downstream schemas via Rules & Math."},
    {"name": "Data Ingestion", "description": "Layer 4: Asynchronous background bulk file processing (Celery)."},
    {"name": "Governance Hub", "description": "Layer 5 & 6: 4-Eye exception queue, execution logs, and auditing."},
    {"name": "Insights Factory", "description": "Layer 2: AI-driven smart insights and orchestration."},
    {"name": "Behavioral AI Module", "description": "Layer 2: User interaction tracking and predictive insights."},
    {"name": "AI Assistant", "description": "Layer 2: Natural Language Prompt-to-Canvas commands."},
    {"name": "Event Repository", "description": "Layer 4: Distributed event catalog and Kafka streaming management."},
    {"name": "Field Registry", "description": "Layer 3: The Semantic Bloodstream. Central ISO 20022 dictionary."},
    {"name": "Common Core Masters", "description": "Layer 5: Master configurations for calendars, currencies, fees, etc."},
    {"name": "Report Builder", "description": "Dashboard Canvas metrics, headless data exposure, and embedded BI."},
]

app = FastAPI(
    title="Infinity ProductOS Enterprise API",
    description=api_description,
    version="1.0.0",
    openapi_tags=tags_metadata
)

# Keep your existing CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Scheduler Setup ---
from scheduler import scheduler, start_scheduler

# --- Event Bus Setup ---
from event_bus import global_event_bus
from services.event_handlers import handle_rule_engine_triggers

@app.on_event("startup")
def startup_event():
    """On application startup, start the background scheduler."""
    start_scheduler()
    # Register the master event handler for event-driven rules
    global_event_bus.register_listener("*", handle_rule_engine_triggers)

@app.on_event("shutdown")
def shutdown_event():
    """On application shutdown, gracefully stop the scheduler."""
    scheduler.shutdown()

# --- INCLUDE THE ROUTERS ---
app.include_router(iso_domains.router)  # must be before registry to avoid /{field_id} catch-all
app.include_router(entitlements.router)
app.include_router(comm_templates.router)
app.include_router(doc_checklists.router)
app.include_router(notification_policies.router)
app.include_router(unstructured_docs.router)
app.include_router(registry.router)
app.include_router(workflows.router)
app.include_router(governance.router)
app.include_router(rules.router)
app.include_router(calculations.router)
app.include_router(mappers.router)
app.include_router(masters.router)
app.include_router(ingestion.router)
app.include_router(maintenance.router)
app.include_router(users.router)
app.include_router(dashboard.router)
app.include_router(health.router)
app.include_router(integrations.router)
app.include_router(batch_gateway.router)
app.include_router(mock_services.router)
app.include_router(ai_module.router)
app.include_router(ai_assistant.router)
app.include_router(insights.router)
app.include_router(events.router)
app.include_router(screens.router)
app.include_router(domain_apis.router)
app.include_router(reconciliation_engine.router)
app.include_router(reporting.router)
app.include_router(documents.router)
app.include_router(templates.router)
app.include_router(simulations.router)
app.include_router(queues.router)
app.include_router(roles_users.router)

@app.get("/")
def read_root():
    return {"status": "InfinityProductOS Core Engine Active"}