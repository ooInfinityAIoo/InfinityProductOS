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

# --- NEW ROUTER IMPORT ---
from routers import registry, workflows, governance, calculations, mappers, masters, ingestion, maintenance, users, dashboard, health, screens

app = FastAPI(title="InfinityProductOS")

# Keep your existing CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- INCLUDE THE ROUTERS ---
app.include_router(registry.router)
app.include_router(workflows.router)
app.include_router(governance.router)
app.include_router(calculations.router)
app.include_router(mappers.router)
app.include_router(masters.router)
app.include_router(ingestion.router)
app.include_router(maintenance.router)
app.include_router(users.router)
app.include_router(dashboard.router)
app.include_router(health.router)
app.include_router(screens.router)

@app.get("/")
def read_root():
    return {"status": "InfinityProductOS Core Engine Active"}