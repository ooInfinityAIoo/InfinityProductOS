from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import uuid
import datetime

from database import get_db
import models
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser
from services.data_masking import DataMaskingService
from services.asset_cache import AssetCache
from services.calculation_engine import CalculationEngine

router = APIRouter(
    prefix="/api/v1/reporting",
    tags=["Report Builder"]
)

@router.post("/", response_model=schemas.ReportBlueprintResponse, status_code=status.HTTP_201_CREATED, summary="Create a Report Blueprint")
def create_report_blueprint(payload: schemas.ReportBlueprintCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Creates a new Report Dashboard blueprint from the Report Designer Canva.
    Supports native widgets, headless data feeds, or third-party embedded URLs (e.g., Power BI).
    """
    existing = db.query(models.ReportBlueprint).filter(models.ReportBlueprint.report_name == payload.report_name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Report with name '{payload.report_name}' already exists.")

    report_id = f"RPT-{uuid.uuid4().hex[:8].upper()}"
    new_report = models.ReportBlueprint(
        report_id=report_id,
        report_name=payload.report_name,
        description=payload.description,
        is_third_party_embedded=payload.is_third_party_embedded,
        third_party_embed_url=payload.third_party_embed_url,
        expose_as_headless_api=payload.expose_as_headless_api,
        widgets=[w.dict() for w in payload.widgets],
        status="DRAFT",
        application_package_id=payload.application_package_id,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    return new_report

@router.get("/", response_model=schemas.ReportBlueprintListResponse, summary="List All Report Blueprints")
def list_report_blueprints(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    application_package_id: Optional[str] = Query(None, description="Filter by Application Package ID"),
    db: Session = Depends(get_db), 
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Retrieves a paginated list of all Report Blueprints, optionally filtered by package context.
    """
    query = db.query(models.ReportBlueprint)
    if application_package_id:
        query = query.filter(models.ReportBlueprint.application_package_id == application_package_id)
    
    total_count = query.count()
    reports = query.order_by(models.ReportBlueprint.report_name).offset(skip).limit(limit).all()
    return {"reports": reports, "total_count": total_count}

@router.get("/{report_id}", response_model=schemas.ReportBlueprintResponse, summary="Get a Specific Report Blueprint")
def get_report_blueprint(report_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves the full details of a specific Report Blueprint by its ID.
    """
    report = db.query(models.ReportBlueprint).filter(models.ReportBlueprint.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Report with ID '{report_id}' not found.")
    return report

@router.put("/{report_id}", response_model=schemas.ReportBlueprintResponse, summary="Update a Report Blueprint")
def update_report_blueprint(report_id: str, payload: schemas.ReportBlueprintCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Updates the definition of a Report Blueprint.
    """
    db_report = db.query(models.ReportBlueprint).filter(models.ReportBlueprint.report_id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Report with ID '{report_id}' not found.")

    if payload.report_name != db_report.report_name:
        existing = db.query(models.ReportBlueprint).filter(models.ReportBlueprint.report_name == payload.report_name).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Report with name '{payload.report_name}' already exists.")

    db_report.report_name = payload.report_name
    db_report.description = payload.description
    db_report.is_third_party_embedded = payload.is_third_party_embedded
    db_report.third_party_embed_url = payload.third_party_embed_url
    db_report.expose_as_headless_api = payload.expose_as_headless_api
    db_report.widgets = [w.dict() for w in payload.widgets]
    db_report.application_package_id = payload.application_package_id
    
    db.commit()
    db.refresh(db_report)
    return db_report

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Report Blueprint")
def delete_report_blueprint(report_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Deletes a Report Blueprint from the system.
    """
    db_report = db.query(models.ReportBlueprint).filter(models.ReportBlueprint.report_id == report_id).first()
    if db_report:
        db.delete(db_report)
        db.commit()
    return

@router.post("/{report_id}/execute", summary="Execute a Report Blueprint", response_model=Dict[str, Any])
def execute_report_blueprint(
    report_id: str, 
    payload: Optional[Dict[str, Any]] = None, 
    db: Session = Depends(get_db), 
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Executes a Report Blueprint at runtime.
    Dynamically queries the underlying data sources (Ledger or Telemetry),
    applies the requested aggregations (COUNT, SUM, AVG) or invokes the 
    Calculation Engine, applies PII masking, and returns the visualization dataset.
    """
    report = db.query(models.ReportBlueprint).filter(models.ReportBlueprint.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Report with ID '{report_id}' not found.")

    if report.is_third_party_embedded:
        return {"status": "SUCCESS", "report_id": report_id, "data": {"embed_url": report.third_party_embed_url}}

    # Initialize tools
    cache = AssetCache(db)
    calc_engine = CalculationEngine(formula_library=cache.formulas_by_token_code)
    masking_service = DataMaskingService()
    
    execution_results = {}

    for widget in report.widgets:
        widget_id = widget.get("widget_id")
        source_entity = widget.get("data_source_entity")
        x_axis = widget.get("x_axis_field")
        y_axis = widget.get("y_axis_field")
        agg_method = widget.get("aggregation_method", "COUNT")

        model_class = None
        if source_entity == "EvidencePacketRegistry":
            model_class = models.EvidencePacketRegistry
        elif source_entity == "UserInteractionEvent":
            model_class = models.UserInteractionEvent
        
        if not model_class:
            execution_results[widget_id] = {"error": f"Unsupported data source: {source_entity}"}
            continue

        try:
            raw_data = db.query(model_class).limit(1000).all()
            
            dataset = []
            for record in raw_data:
                record_dict = {}
                if source_entity == "EvidencePacketRegistry":
                    record_dict = {"status": record.execution_status, "created_at": record.created_at}
                elif source_entity == "UserInteractionEvent":
                    record_dict = {"event_type": record.event_type, "timestamp": record.timestamp}
                    if record.payload:
                        record_dict.update(record.payload)
                dataset.append(record_dict)

            masked_dataset = [masking_service.mask_pii_data(row, cache.pii_field_properties) for row in dataset]

            grouped_data = {}
            for row in masked_dataset:
                group_key = row.get(x_axis, "Unknown")
                if group_key not in grouped_data:
                    grouped_data[group_key] = []
                grouped_data[group_key].append(row)

            final_widget_data = []
            for key, rows in grouped_data.items():
                agg_value = 0
                if agg_method == "COUNT":
                    agg_value = len(rows)
                elif agg_method in ["SUM", "AVG"]:
                    values = [float(r.get(y_axis, 0)) for r in rows if str(r.get(y_axis, 0)).replace('.','',1).isdigit()]
                    if values:
                        agg_value = sum(values) if agg_method == "SUM" else sum(values)/len(values)
                else:
                    # Offload advanced math to the Calculation Engine
                    context = {str(x_axis): key, "row_count": len(rows)}
                    if y_axis:
                        context[str(y_axis)] = sum([float(r.get(y_axis, 0)) for r in rows if str(r.get(y_axis, 0)).replace('.','',1).isdigit()])
                    
                    calc_res = calc_engine.execute_formula_by_token(agg_method, context)
                    output_fields = [k for k in calc_res["final_context"].keys() if k not in context]
                    agg_value = calc_res["final_context"][output_fields[0]] if output_fields else calc_res["final_context"].get("temp_result", 0)

                final_widget_data.append({"x": key, "y": agg_value})

            execution_results[widget_id] = {
                "title": widget.get("title"),
                "chart_type": widget.get("chart_type"),
                "dataset": final_widget_data
            }

        except Exception as e:
            execution_results[widget_id] = {"error": str(e)}

    return {
        "status": "SUCCESS",
        "report_id": report_id,
        "report_name": report.report_name,
        "widgets_data": execution_results
    }