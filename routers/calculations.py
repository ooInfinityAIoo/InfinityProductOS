from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
import models
import schemas
from services.orchestrator_pipeline import process_calculation_model

router = APIRouter(
    prefix="/api/v1/calculations",
    tags=["Calculation Engine"]
)

@router.post("/", response_model=schemas.SymbolicFormulaResponse, status_code=status.HTTP_201_CREATED, summary="Register a New Formula")
def register_formula(payload: schemas.SymbolicFormulaCreate, db: Session = Depends(get_db)):
    """
    Registers a new symbolic formula asset in the Calculation Engine.
    
    This corresponds to the 'Symbolic Calculation Formula Designer' in the architecture.
    """
    # The core logic is preserved in the service layer function
    result = process_calculation_model(payload.dict(), db)
    
    if result.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("message")
        )
    
    # Fetch the newly created object to match the response_model contract
    new_formula = db.query(models.SymbolicFormulaAsset).filter(
        models.SymbolicFormulaAsset.token_code == payload.token_code
    ).first()
    
    if not new_formula:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve the formula asset after creation."
        )
        
    return new_formula

@router.get("/", response_model=schemas.SymbolicFormulaListResponse, summary="List All Formulas")
def list_formulas(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retrieves a paginated list of all registered symbolic formula assets.
    """
    formulas = db.query(models.SymbolicFormulaAsset).offset(skip).limit(limit).all()
    return {"formulas": formulas}

@router.get("/{asset_id}", response_model=schemas.SymbolicFormulaResponse, summary="Get a Specific Formula")
def get_formula(asset_id: str, db: Session = Depends(get_db)):
    """
    Retrieves a specific symbolic formula asset by its unique `asset_id`.
    """
    formula = db.query(models.SymbolicFormulaAsset).filter(
        models.SymbolicFormulaAsset.asset_id == asset_id
    ).first()
    
    if not formula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Formula asset with ID '{asset_id}' not found."
        )
        
    return formula

@router.put("/{asset_id}", response_model=schemas.SymbolicFormulaResponse, summary="Update a Formula")
def update_formula(asset_id: str, payload: schemas.SymbolicFormulaCreate, db: Session = Depends(get_db)):
    """
    Updates an existing symbolic formula asset.
    """
    db_formula = db.query(models.SymbolicFormulaAsset).filter(models.SymbolicFormulaAsset.asset_id == asset_id).first()
    
    if not db_formula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Formula asset with ID '{asset_id}' not found."
        )

    # Prevent unique constraint errors if the token_code is changed to one that already exists
    if payload.token_code != db_formula.token_code:
        existing_formula = db.query(models.SymbolicFormulaAsset).filter(models.SymbolicFormulaAsset.token_code == payload.token_code).first()
        if existing_formula:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Formula with token_code '{payload.token_code}' already exists."
            )

    for key, value in payload.dict().items():
        setattr(db_formula, key, value)

    db.commit()
    db.refresh(db_formula)
    return db_formula

@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Formula")
def delete_formula(asset_id: str, db: Session = Depends(get_db)):
    """
    Deletes a symbolic formula asset from the registry.
    """
    formula = db.query(models.SymbolicFormulaAsset).filter(
        models.SymbolicFormulaAsset.asset_id == asset_id
    ).first()
    
    if not formula:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Formula asset with ID '{asset_id}' not found."
        )
        
    db.delete(formula)
    db.commit()
    return