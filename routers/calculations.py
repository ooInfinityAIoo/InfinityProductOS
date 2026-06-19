from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
import datetime
import csv
import io
import uuid

from database import get_db
import models
import schemas
from services.orchestrator_pipeline import process_calculation_model
from auth import get_current_user, require_designer_privileges, require_admin_or_auditor, CurrentUser

router = APIRouter(
    prefix="/api/v1/calculations",
    tags=["Calculation Engine"]
)

@router.post("/", response_model=schemas.SymbolicFormulaResponse, status_code=status.HTTP_201_CREATED, summary="Register a New Formula")
def register_formula(payload: schemas.SymbolicFormulaCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Registers a new symbolic formula asset in the Calculation Engine.
    
    This corresponds to the 'Symbolic Calculation Formula Designer' in the architecture.
    """
    # Add the current user's ID to the payload for the service layer to process
    payload_dict = payload.dict()
    payload_dict['created_by'] = current_user.id
    # The core logic is preserved in the service layer function
    result = process_calculation_model(payload_dict, db)
    
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
def list_formulas(
    package_id: Optional[str] = None,
    product_id: Optional[str] = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db), 
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Retrieves a paginated list of all registered symbolic formula assets.
    Optionally filters by package_id and product_id to support Two-Key Lockdown.
    """
    query = db.query(models.SymbolicFormulaAsset)
    if package_id:
        query = query.filter(models.SymbolicFormulaAsset.application_package_id == package_id)
    if product_id:
        query = query.filter(models.SymbolicFormulaAsset.product_id == product_id)

    total_count = query.count()
    formulas = query.offset(skip).limit(limit).all()
    return {"formulas": formulas, "total_count": total_count}

@router.get("/{asset_id}", response_model=schemas.SymbolicFormulaResponse, summary="Get a Specific Formula")
def get_formula(asset_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
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

@router.get("/uncategorized", response_model=schemas.SymbolicFormulaListResponse, summary="List All Uncategorized Formulas")
def get_uncategorized_formulas(
    db: Session = Depends(get_db), 
    current_user: CurrentUser = Depends(require_admin_or_auditor)
):
    """
    Retrieves a list of all formula assets that do not have a financial_domain assigned.
    This is useful for data quality and cleanup operations. Requires admin or auditor privileges.
    """
    base_query = db.query(models.SymbolicFormulaAsset).filter(
        or_(
            models.SymbolicFormulaAsset.financial_domain.is_(None),
            models.SymbolicFormulaAsset.financial_domain == ''
        )
    )
    
    total_count = base_query.count()
    formulas = base_query.order_by(models.SymbolicFormulaAsset.business_name).all()
    
    return {"formulas": formulas, "total_count": total_count}

@router.get("/financial-domains", response_model=schemas.FinancialDomainListResponse, summary="List All Unique Financial Domains")
def list_financial_domains(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all unique, non-null financial domains present in the formula library.
    This is useful for populating filter dropdowns in a UI.
    """
    domains_query = db.query(
        models.SymbolicFormulaAsset.financial_domain
    ).distinct().filter(
        models.SymbolicFormulaAsset.financial_domain.isnot(None),
        models.SymbolicFormulaAsset.financial_domain != ''
    ).order_by(models.SymbolicFormulaAsset.financial_domain).all()
    
    # The query returns a list of tuples, e.g., [('Credit Risk',), ('Treasury',)]. Flatten it.
    domains = [domain for domain, in domains_query]
    
    return {"financial_domains": domains}

@router.get("/stats/by-domain", response_model=schemas.FormulaDomainStatsResponse, summary="Get Formula Counts by Financial Domain")
def get_formula_stats_by_domain(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin_or_auditor)
):
    """
    Retrieves a count of formulas, grouped by their `financial_domain`.
    This is useful for getting a high-level overview of the formula library's composition.
    Requires admin or auditor privileges.
    """
    stats_query = db.query(
        models.SymbolicFormulaAsset.financial_domain,
        func.count(models.SymbolicFormulaAsset.asset_id).label('count')
    ).filter(
        models.SymbolicFormulaAsset.financial_domain.isnot(None),
        models.SymbolicFormulaAsset.financial_domain != ''
    ).group_by(
        models.SymbolicFormulaAsset.financial_domain
    ).order_by(
        func.count(models.SymbolicFormulaAsset.asset_id).desc()
    ).all()
    return {"stats": stats_query}

@router.get("/search", response_model=schemas.SymbolicFormulaListResponse, summary="Search the Formula Library (with Pagination)")
def search_formulas(
    q: str = Query(..., description="Search term for financial domain, formula name, expression, or description."),
    skip: int = Query(0, ge=0, description="The number of records to skip for pagination."),
    limit: int = Query(100, ge=1, le=1000, description="The maximum number of records to return."),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Performs a paginated, case-insensitive search across the formula library, looking for matches in the
    financial domain, formula name, mathematical expression, and business description.
    """
    search_term = f"%{q}%"
    base_query = db.query(models.SymbolicFormulaAsset).filter(
        or_(
            models.SymbolicFormulaAsset.financial_domain.ilike(search_term),
            models.SymbolicFormulaAsset.business_name.ilike(search_term),
            models.SymbolicFormulaAsset.mathematical_expression.ilike(search_term),
            models.SymbolicFormulaAsset.description.ilike(search_term)
        )
    )
    
    total_count = base_query.count()
    
    formulas = base_query.order_by(models.SymbolicFormulaAsset.business_name).offset(skip).limit(limit).all()
    
    return {"formulas": formulas, "total_count": total_count}

@router.put("/{asset_id}", response_model=schemas.SymbolicFormulaResponse, summary="Update a Formula")
def update_formula(asset_id: str, payload: schemas.SymbolicFormulaCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
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

    db_formula.updated_at = datetime.datetime.utcnow().isoformat()
    db_formula.updated_by = current_user.id

    db.commit()
    db.refresh(db_formula)
    return db_formula

@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Formula")
def delete_formula(asset_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
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


# --- Composite Formula Endpoints ---

@router.post("/composites", response_model=schemas.CompositeFormulaBlueprintResponse, status_code=status.HTTP_201_CREATED, summary="Create a Composite Formula Blueprint")
def create_composite_formula(payload: schemas.CompositeFormulaBlueprintCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Creates a new composite formula blueprint, which is an ordered chain of simple formulas.
    """
    # Check for duplicate names or tokens
    if db.query(models.CompositeFormulaBlueprint).filter(or_(models.CompositeFormulaBlueprint.business_name == payload.business_name, models.CompositeFormulaBlueprint.token_code == payload.token_code)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A composite formula with this name or token code already exists.")

    new_composite = models.CompositeFormulaBlueprint(
        composite_id=f"COMPOSITE-{uuid.uuid4().hex[:8].upper()}",
        business_name=payload.business_name,
        token_code=payload.token_code,
        description=payload.description,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id
    )

    for step_payload in payload.steps:
        new_composite.steps.append(
            models.CompositeFormulaStep(
                step_id=f"CSTEP-{uuid.uuid4().hex[:8].upper()}",
                **step_payload.dict()
            )
        )
    
    db.add(new_composite)
    db.commit()
    db.refresh(new_composite)
    return new_composite

@router.get("/composites", response_model=List[schemas.CompositeFormulaBlueprintResponse], summary="List All Composite Formula Blueprints")
def list_composite_formulas(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a list of all composite formula blueprints.
    """
    composites = db.query(models.CompositeFormulaBlueprint).all()
    return composites

@router.get("/composites/{composite_id}", response_model=schemas.CompositeFormulaBlueprintResponse, summary="Get a Specific Composite Formula Blueprint")
def get_composite_formula(composite_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a specific composite formula blueprint by its ID.
    """
    composite = db.query(models.CompositeFormulaBlueprint).filter(models.CompositeFormulaBlueprint.composite_id == composite_id).first()
    if not composite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Composite formula with ID '{composite_id}' not found.")
    return composite

@router.post("/upload-library", response_model=schemas.FormulaBulkUploadResponse, summary="Bulk Upload a Formula Library via CSV")
async def upload_formula_library(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Allows for the bulk definition of templatized formulas by uploading a CSV file.
    
    The CSV file must contain the headers: `Financial Domain`, `Formula Name`, `Mathematical Formula`, `Formula Business Description`.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type. Please upload a CSV file.")

    successful_uploads = 0
    failed_entries = []
    
    try:
        contents = await file.read()
        decoded_content = contents.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(decoded_content))
        
        new_formulas = []
        for i, row in enumerate(csv_reader):
            # Normalize header names (case-insensitive, space-insensitive)
            normalized_row = {k.lower().replace(' ', '_'): v for k, v in row.items()}

            formula_name = normalized_row.get('formula_name')
            if not formula_name:
                failed_entries.append({"row": i + 2, "error": "Missing 'Formula Name'."})
                continue

            # Check for duplicates before adding
            if db.query(models.SymbolicFormulaAsset).filter(models.SymbolicFormulaAsset.business_name == formula_name).first():
                failed_entries.append({"row": i + 2, "formula_name": formula_name, "error": "Formula with this name already exists."})
                continue

            new_formula = models.SymbolicFormulaAsset(
                asset_id=f"CALC-ASSET-{uuid.uuid4().hex[:8].upper()}",
                financial_domain=normalized_row.get('financial_domain'),
                business_name=formula_name,
                token_code=f"CALC-BULK-{uuid.uuid4().hex[:6].upper()}",
                target_output_field="calculated_value", # Default target, can be changed later
                mathematical_expression=normalized_row.get('mathematical_formula'),
                description=normalized_row.get('formula_business_description'),
                created_at=datetime.datetime.utcnow().isoformat(),
                created_by=current_user.id
            )
            new_formulas.append(new_formula)

        db.add_all(new_formulas)
        db.commit()
        successful_uploads = len(new_formulas)

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An error occurred during file processing: {str(e)}")

    return {"successful_uploads": successful_uploads, "failed_entries": failed_entries}