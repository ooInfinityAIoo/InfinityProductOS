from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import datetime

from database import get_db
import models
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/insights",
    tags=["Insights Factory"]
)

@router.post("/", response_model=schemas.InsightDefinitionResponse, status_code=status.HTTP_201_CREATED, summary="Create an Insight Blueprint")
def create_insight_definition(payload: schemas.InsightDefinitionCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Creates a new Insight blueprint in the Insights Factory.
    """
    existing = db.query(models.InsightDefinition).filter(models.InsightDefinition.insight_code == payload.insight_code).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Insight with code '{payload.insight_code}' already exists.")

    new_insight = models.InsightDefinition(
        insight_id=f"INSIGHT-{uuid.uuid4().hex[:8].upper()}",
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id,
        **payload.dict()
    )
    db.add(new_insight)
    db.commit()
    db.refresh(new_insight)
    return new_insight

@router.get("/", response_model=List[schemas.InsightDefinitionResponse], summary="List All Insight Blueprints")
def list_insight_definitions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a paginated list of all Insight blueprints.
    """
    insights = db.query(models.InsightDefinition).order_by(models.InsightDefinition.insight_name).offset(skip).limit(limit).all()
    return insights

@router.get("/widgets", response_model=List[schemas.InsightDefinitionResponse], summary="Get Role-Based Insight Widgets")
def get_dashboard_widgets(
    dashboard_category: str = Query(..., description="GLOBAL, 360_BUSINESS, or TECHNICAL"),
    application_package_id: Optional[str] = Query(None, description="The ID of the product package"),
    db: Session = Depends(get_db), 
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Retrieves all insight blueprints configured as dashboard widgets for a specific context.
    Automatically filters the returned widgets based on the user's RBAC role (e.g., Sales vs Risk).
    """
    query = db.query(models.InsightDefinition).filter(models.InsightDefinition.dashboard_category == dashboard_category.upper())
    
    if application_package_id:
        query = query.filter(models.InsightDefinition.application_package_id == application_package_id)
    else:
        query = query.filter(models.InsightDefinition.application_package_id.is_(None))

    all_insights = query.all()
    
    allowed_widgets = []
    for insight in all_insights:
        roles = insight.applicable_roles or ["ADMIN"]
        if current_user.role.value.upper() in [r.upper() for r in roles] or current_user.role.value.upper() == "ADMIN":
            allowed_widgets.append(insight)
            
    return allowed_widgets

@router.get("/{insight_id}", response_model=schemas.InsightDefinitionResponse, summary="Get a Specific Insight Blueprint")
def get_insight_definition(insight_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a specific Insight blueprint by its ID.
    """
    insight = db.query(models.InsightDefinition).filter(models.InsightDefinition.insight_id == insight_id).first()
    if not insight:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Insight with ID '{insight_id}' not found.")
    return insight

@router.put("/{insight_id}", response_model=schemas.InsightDefinitionResponse, summary="Update an Insight Blueprint")
def update_insight_definition(insight_id: str, payload: schemas.InsightDefinitionCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Updates an existing Insight blueprint.
    """
    db_insight = db.query(models.InsightDefinition).filter(models.InsightDefinition.insight_id == insight_id).first()
    if not db_insight:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Insight with ID '{insight_id}' not found.")
    
    update_data = payload.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_insight, key, value)
    
    db.commit()
    db.refresh(db_insight)
    return db_insight

@router.delete("/{insight_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an Insight Blueprint")
def delete_insight_definition(insight_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Deletes an Insight blueprint from the factory.
    """
    db_insight = db.query(models.InsightDefinition).filter(models.InsightDefinition.insight_id == insight_id).first()
    if db_insight:
        db.delete(db_insight)
        db.commit()
    return