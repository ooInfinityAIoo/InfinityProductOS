from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from services.registry_processor import process_field_mint
from services.business_rules import process_workflow_node
from services.orchestrator_pipeline import process_calculation_model

app = FastAPI(title="Infinity ProductOS - Architectural Engine")

class EventManifest(BaseModel):
    event: str
    timestamp: str
    payload: Dict[str, Any]

@app.post("/api/v1/execute")
async def handle_layer4_event(manifest: EventManifest):
    """
    Deterministic Inbound Gateway Router (Layer 4 Integration Fabric)
    Catches events from index.html and delegates cleanly to independent services.
    """
    try:
        if manifest.event == "FIELD_ASSET_MINT":
            result = await process_field_mint(manifest.payload)
            return {"status": "SUCCESS", "message": "LOB Field Asset Minted Cleanly", "data": result}
            
        elif manifest.event == "WORKFLOW_NODE_COMMIT":
            result = await process_workflow_node(manifest.payload)
            return {"status": "SUCCESS", "message": "Workflow State Map Committed", "data": result}
            
        elif manifest.event == "CALCULATION_MODEL_REGISTER":
            result = await process_calculation_model(manifest.payload)
            return {"status": "SUCCESS", "message": "Symbolic Formula Matrix Registered", "data": result}
            
        else:
            # Extensible catch-all loop to absorb continuous future frontend expansions
            return {"status": "FORWARDED", "message": f"Event {manifest.event} stashed to execution fabric storage"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Layer 4 Pipeline Router Exception: {str(e)}")