from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from enum import Enum
import uuid
import datetime
from pydantic import BaseModel

import models
from database import get_db
import schemas

router = APIRouter(
    prefix="/api/v1/screens",
    tags=["Screen Designer"]
)

# --- RBAC Dependencies and Models ---
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

def require_designer_privileges(current_user: CurrentUser = Depends(get_current_user)):
    if current_user.role not in [UserRole.ADMIN, UserRole.OPERATOR]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This action requires admin or operator privileges.")
    return current_user

# --- Helper Function ---
def _construct_response(db_screen: models.ScreenTemplate) -> schemas.ScreenTemplateResponse:
    """Helper to unpack the JSONB definition into the response model."""
    definition_data = db_screen.definition or {}
    return schemas.ScreenTemplateResponse(
        screen_id=db_screen.screen_id,
        screen_name=db_screen.screen_name,
        description=db_screen.description,
        status=db_screen.status,
        product_id=db_screen.product_id,
        subproduct_id=db_screen.subproduct_id,
        workflow_id=db_screen.workflow_id,
        workflow_step_id=db_screen.workflow_step_id,
        created_at=db_screen.created_at,
        updated_at=db_screen.updated_at,
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
        "components": [c.dict() for c in payload.definition],
        "action_buttons": [b.dict() for b in payload.action_buttons],
        "value_list_groups": [g.dict() for g in payload.value_list_groups]
    }

    new_template = models.ScreenTemplate(
        screen_id=f"SCRN-{uuid.uuid4().hex[:12].upper()}",
        screen_name=payload.screen_name,
        description=payload.description,
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
def list_screen_templates(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    screens = db.query(models.ScreenTemplate).order_by(models.ScreenTemplate.screen_name).offset(skip).limit(limit).all()
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
    db_screen.product_id = payload.product_id
    db_screen.subproduct_id = payload.subproduct_id
    db_screen.workflow_id = payload.workflow_id
    db_screen.workflow_step_id = payload.workflow_step_id
    db_screen.updated_at = datetime.datetime.utcnow().isoformat()

    # Pack and update the JSONB definition field
    full_definition = {
        "components": [c.dict() for c in payload.definition],
        "action_buttons": [b.dict() for b in payload.action_buttons],
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