from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import uuid
import datetime

import models
from database import get_db
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/screens",
    tags=["Screen Designer"]
)

# --- RBAC Dependencies and Models ---

# --- Helper Function ---
def _construct_response(db_screen: models.ScreenTemplate) -> schemas.ScreenTemplateResponse:
    """Helper to unpack the JSONB definition into the response model."""
    definition_data = db_screen.definition or {}
    return schemas.ScreenTemplateResponse(
        screen_id=db_screen.screen_id,
        screen_name=db_screen.screen_name,
        description=db_screen.description,
        status=db_screen.status,
        screen_template_category=db_screen.screen_template_category,
        application_package_id=db_screen.application_package_id,
        product_id=db_screen.product_id,
        subproduct_id=db_screen.subproduct_id,
        workflow_id=db_screen.workflow_id,
        workflow_step_id=db_screen.workflow_step_id,
        created_at=db_screen.created_at,
        updated_at=db_screen.updated_at, # This was missing in the original helper
        created_by=db_screen.created_by,
        definition=definition_data.get("components", []),
        action_buttons=definition_data.get("action_buttons", []),
        value_list_groups=definition_data.get("value_list_groups", [])
    )

# --- CRUD Endpoints ---

@router.post("/", response_model=schemas.ScreenTemplateResponse, status_code=status.HTTP_201_CREATED, summary="Create a Screen Template")
def create_screen_template(payload: schemas.ScreenTemplateCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    existing = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_name == payload.screen_name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Screen template with name '{payload.screen_name}' already exists.")

    full_definition = {
        "components": [c.dict(exclude_unset=True) for c in payload.definition],
        "action_buttons": [b.dict(exclude_unset=True) for b in payload.action_buttons],
        "value_list_groups": [g.dict() for g in payload.value_list_groups]
    }

    new_template = models.ScreenTemplate(
        screen_id=f"SCRN-{uuid.uuid4().hex[:12].upper()}",
        screen_name=payload.screen_name,
        description=payload.description,
        screen_template_category=payload.screen_template_category,
        application_package_id=payload.application_package_id,
        product_id=payload.product_id,
        subproduct_id=payload.subproduct_id,
        workflow_id=payload.workflow_id,
        workflow_step_id=payload.workflow_step_id,
        definition=full_definition,
        created_by=current_user.id,
        created_at=datetime.datetime.utcnow().isoformat(),
    )
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return _construct_response(new_template)

@router.get("/", response_model=schemas.ScreenTemplateListResponse, summary="List All Screen Templates")
def list_screen_templates(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    query = db.query(models.ScreenTemplate)
    if status:
        query = query.filter(models.ScreenTemplate.status == status.upper())
    screens = query.order_by(models.ScreenTemplate.screen_name).offset(skip).limit(limit).all()
    response_screens = [_construct_response(s) for s in screens]
    return {"screens": response_screens}

@router.get("/{screen_id}", response_model=schemas.ScreenTemplateResponse, summary="Get a Specific Screen Template")
def get_screen_template(screen_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    screen = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_id == screen_id).first()
    if not screen:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Screen template with ID '{screen_id}' not found.")
    return _construct_response(screen)

@router.put("/{screen_id}", response_model=schemas.ScreenTemplateResponse, summary="Update a Screen Template")
def update_screen_template(screen_id: str, payload: schemas.ScreenTemplateCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    db_screen = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_id == screen_id).first()
    if not db_screen:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Screen template with ID '{screen_id}' not found.")

    if payload.screen_name != db_screen.screen_name:
        existing = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_name == payload.screen_name).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Screen template with name '{payload.screen_name}' already exists.")

    # Update scalar fields
    db_screen.screen_name = payload.screen_name
    db_screen.description = payload.description
    db_screen.screen_template_category = payload.screen_template_category
    db_screen.application_package_id = payload.application_package_id
    db_screen.product_id = payload.product_id
    db_screen.subproduct_id = payload.subproduct_id
    db_screen.workflow_id = payload.workflow_id
    db_screen.workflow_step_id = payload.workflow_step_id
    db_screen.updated_at = datetime.datetime.utcnow().isoformat()

    # Pack and update the JSONB definition field
    full_definition = {
        "components": [c.dict(exclude_unset=True) for c in payload.definition],
        "action_buttons": [b.dict(exclude_unset=True) for b in payload.action_buttons],
        "value_list_groups": [g.dict() for g in payload.value_list_groups]
    }
    db_screen.definition = full_definition
    
    db.commit()
    db.refresh(db_screen)
    return _construct_response(db_screen)

@router.delete("/{screen_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Screen Template")
def delete_screen_template(screen_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    db_screen = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_id == screen_id).first()
    if db_screen:
        db.delete(db_screen)
        db.commit()
    return

@router.get("/{screen_id}/nodes", response_model=schemas.WorkflowNodeListResponse, summary="List Workflow Nodes Using This Screen")
def get_nodes_using_screen(screen_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all workflow nodes that are configured to use a specific screen template.
    """
    # First, check if the screen template exists to give a proper 404.
    screen = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_id == screen_id).first()
    if not screen:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Screen template with ID '{screen_id}' not found.")

    # Query for all workflow nodes that reference this screen_id
    nodes = db.query(models.WorkflowNode).filter(models.WorkflowNode.screen_template == screen_id).all()
    
    return {"nodes": nodes}

@router.get("/stats/usage", response_model=schemas.ScreenUsageStatsResponse, summary="Get Screen Template Usage Statistics")
def get_screen_usage_stats(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves statistics on how many times each screen template is used across all workflow nodes.
    This provides insight into which screens are most common and which are unused.
    """
    stats_query = db.query(
        models.ScreenTemplate.screen_id,
        models.ScreenTemplate.screen_name,
        func.count(models.WorkflowNode.node_id).label('usage_count')
    ).outerjoin(
        models.WorkflowNode, models.ScreenTemplate.screen_id == models.WorkflowNode.screen_template
    ).group_by(
        models.ScreenTemplate.screen_id,
        models.ScreenTemplate.screen_name
    ).order_by(
        func.count(models.WorkflowNode.node_id).desc()
    ).all()

    # The query returns a list of Row objects which Pydantic can directly use for instantiation
    # as long as the field names in the query result match the response model.
    return {"stats": stats_query}

@router.get("/unused", response_model=schemas.ScreenTemplateListResponse, summary="List All Unused Screen Templates")
def get_unused_screen_templates(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all screen templates that are not currently being used by any workflow node.
    This is useful for identifying and cleaning up orphaned screen designs.
    """
    unused_screens = db.query(
        models.ScreenTemplate
    ).outerjoin(
        models.WorkflowNode, models.ScreenTemplate.screen_id == models.WorkflowNode.screen_template
    ).filter(
        models.WorkflowNode.node_id.is_(None)
    ).order_by(models.ScreenTemplate.screen_name).all()

    response_screens = [_construct_response(s) for s in unused_screens]
    return {"screens": response_screens}

@router.delete("/unused", response_model=schemas.BulkDeleteResponse, summary="Bulk Delete All Unused Screen Templates")
def bulk_delete_unused_screen_templates(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Finds and permanently deletes all screen templates that are not currently being used by any workflow node.
    This is a bulk cleanup operation and requires designer privileges.
    """
    # Build the query to find unused screens
    unused_screens_query = db.query(
        models.ScreenTemplate
    ).outerjoin(
        models.WorkflowNode, models.ScreenTemplate.screen_id == models.WorkflowNode.screen_template
    ).filter(
        models.WorkflowNode.node_id.is_(None)
    )

    # Execute the delete operation based on the query
    try:
        deleted_count = unused_screens_query.delete(synchronize_session=False)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An error occurred during bulk deletion: {str(e)}")

    return {"deleted_count": deleted_count, "message": f"Successfully deleted {deleted_count} unused screen templates."}