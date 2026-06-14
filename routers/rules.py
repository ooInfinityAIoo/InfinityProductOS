from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid
import datetime

from database import get_db
import models
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/rules",
    tags=["Business Rule Engine"]
)

@router.post("/", response_model=schemas.BusinessRuleSet, status_code=status.HTTP_201_CREATED, summary="Create a Business Rule Set")
def create_rule_set(payload: schemas.BusinessRuleSet, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Creates a new composite business rule set blueprint.
    """
    existing = db.query(models.BusinessRuleSet).filter(models.BusinessRuleSet.token_code == payload.token_code).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Rule set with token code '{payload.token_code}' already exists.")

    new_rule_set = models.BusinessRuleSet(
        rule_set_id=f"BRE-{uuid.uuid4().hex[:8].upper()}",
        business_name=payload.business_name,
        token_code=payload.token_code,
        description=payload.description,
        definition=payload.dict(), # Store the whole Pydantic model as JSON
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id
    )
    db.add(new_rule_set)
    db.commit()
    db.refresh(new_rule_set)
    return new_rule_set.definition

@router.get("/", response_model=List[schemas.BusinessRuleSet], summary="List All Business Rule Sets")
def list_rule_sets(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all business rule set blueprints.
    """
    rule_sets = db.query(models.BusinessRuleSet).all()
    # Unpack the definition from each record
    return [rs.definition for rs in rule_sets]

@router.get("/{token_code}", response_model=schemas.BusinessRuleSet, summary="Get a Specific Business Rule Set")
def get_rule_set(token_code: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a specific business rule set by its unique token_code.
    """
    rule_set = db.query(models.BusinessRuleSet).filter(models.BusinessRuleSet.token_code == token_code).first()
    if not rule_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Rule set with token code '{token_code}' not found.")
    return rule_set.definition

@router.put("/{token_code}", response_model=schemas.BusinessRuleSet, summary="Update a Business Rule Set")
def update_rule_set(token_code: str, payload: schemas.BusinessRuleSet, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Updates an existing business rule set blueprint.
    """
    db_rule_set = db.query(models.BusinessRuleSet).filter(models.BusinessRuleSet.token_code == token_code).first()
    if not db_rule_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Rule set with token code '{token_code}' not found.")
    
    db_rule_set.definition = payload.dict()
    db_rule_set.business_name = payload.business_name
    db_rule_set.description = payload.description
    
    db.commit()
    db.refresh(db_rule_set)
    return db_rule_set.definition

@router.delete("/{token_code}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Business Rule Set")
def delete_rule_set(token_code: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    db_rule_set = db.query(models.BusinessRuleSet).filter(models.BusinessRuleSet.token_code == token_code).first()
    if db_rule_set:
        db.delete(db_rule_set)
        db.commit()
    return