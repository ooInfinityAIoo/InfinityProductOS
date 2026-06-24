from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Any, Dict, List, Optional
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


# ---------------------------------------------------------------------------
# Calculation Program endpoints — new multi-step sequential program model
# ---------------------------------------------------------------------------
# WHY THESE ENDPOINTS EXIST:
# The Calculation Program is the replacement for Python scripts, MS Access macros, and
# User-Defined Tables. Analytics users configure programs via the UI; these endpoints
# are the CRUD + execution surface. The /execute endpoint runs a single-record test so
# users can trace step-by-step results like a debugger. The /batch endpoint runs the
# program against N records (e.g. 50,000 collateral records) and returns aggregate totals.
#
# WHY THESE ROUTES ARE DEFINED BEFORE /{asset_id}:
# FastAPI matches routes in registration order. If /{asset_id} appeared first, every
# request to /programs, /programs/{id}/execute, etc. would be caught by the wildcard
# before reaching the specific handlers. Specific routes must always precede wildcards.

import time as _time
from services.calculation_engine import execute_program, execute_program_batch


def _sync_calculated_fields(db: Session, program: models.CalculationProgram) -> None:
    """
    WHY THIS EXISTS:
    When a Formula is saved, every output step (is_output=True) produces a named token
    (e.g. TOTAL_FEE). That token must become a first-class field in the Field Registry
    so Business Rules, Workflow conditions, and other Formulas can reference it by name.

    This is the governance guarantee: you cannot reference a field that isn't registered.
    Calculated fields are auto-registered here — the user never has to manually add them
    to the Field Registry. But they ARE in the registry, so they are traceable and auditable.

    WHAT BREAKS IF REMOVED: Business Rules Engine field picker will not show calculated
    outputs. Formula chaining (one formula referencing another's output) will fail because
    the IsoFieldSelector won't find the field.
    """
    now = datetime.datetime.utcnow().isoformat()
    steps = program.steps or []

    for step in steps:
        if not step.get("is_output") or not step.get("output_token"):
            continue

        token = step["output_token"].strip().upper()
        # Idempotent — if a field with this technical_sys_name already exists and is CALCULATED,
        # just update its description and formula_ref (the formula may have been renamed).
        existing = db.query(models.ISOFieldDefinition).filter(
            models.ISOFieldDefinition.technical_sys_name == token
        ).first()

        if existing:
            if existing.field_source == "CALCULATED":
                existing.client_business_name = step.get("description") or program.business_name
                existing.iso_business_name = step.get("description") or program.business_name
                existing.formula_ref = program.program_id
                existing.description = f"Calculated output of Formula '{program.business_name}' (step {step.get('seq', '?')})"
        else:
            field = models.ISOFieldDefinition(
                field_id=f"CALC-{uuid.uuid4().hex[:8].upper()}",
                technical_sys_name=token,
                client_business_name=step.get("description") or token,
                iso_business_name=step.get("description") or token,
                display_preference="CLIENT",  # no ISO standard name — always show bank name
                data_type="Decimal",           # all formula outputs are numeric
                domain_category=program.domain or "GENERAL",
                subdomain_category=None,
                description=f"Calculated output of Formula '{program.business_name}' (step {step.get('seq', '?')}). Auto-registered when formula was saved.",
                status="ACTIVE",
                is_mandatory=False,
                is_pii=False,
                field_source="CALCULATED",
                formula_ref=program.program_id,
                created_at=now,
                created_by="SYSTEM",
            )
            db.add(field)


@router.post("/programs", response_model=schemas.CalcProgramResponse, status_code=status.HTTP_201_CREATED,
    summary="Create a Formula",
    description="Creates a new multi-step Formula. Each step defines a named variable computed from an expression referencing Field Registry fields or prior step results. Output steps are auto-registered as CALCULATED fields in the Field Registry.")
def create_calc_program(
    payload: schemas.CalcProgramCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    now = datetime.datetime.utcnow().isoformat()
    program_id = f"CP-{uuid.uuid4().hex[:8].upper()}"

    db_program = models.CalculationProgram(
        program_id=program_id,
        program_code=payload.program_code,
        business_name=payload.business_name,
        description=payload.description,
        domain=payload.domain,
        tier=payload.tier,
        tags=payload.tags,
        is_template=payload.is_template,
        locked_steps=payload.locked_steps,
        steps=[s.dict() for s in payload.steps],
        inputs=[i.dict() for i in payload.inputs],
        application_package_id=payload.application_package_id,
        product_id=payload.product_id,
        subproduct_id=payload.subproduct_id,
        status="DRAFT",
        created_at=now,
        created_by=current_user.id,
    )
    db.add(db_program)
    db.flush()  # flush to get program_id before _sync needs it for formula_ref FK

    # Auto-register output tokens as CALCULATED fields in the Field Registry
    _sync_calculated_fields(db, db_program)

    db.commit()
    db.refresh(db_program)
    return db_program


@router.get("/programs", response_model=schemas.CalcProgramListResponse,
    summary="List Calculation Programs",
    description="Returns all Calculation Programs, optionally filtered by domain, package, product, or template flag. Use is_template=true to browse the formula registry.")
def list_calc_programs(
    package_id: Optional[str] = None,
    product_id: Optional[str] = None,
    domain: Optional[str] = None,
    is_template: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = db.query(models.CalculationProgram)
    if package_id:
        query = query.filter(models.CalculationProgram.application_package_id == package_id)
    if product_id:
        query = query.filter(models.CalculationProgram.product_id == product_id)
    if domain:
        query = query.filter(models.CalculationProgram.domain == domain.upper())
    if is_template is not None:
        query = query.filter(models.CalculationProgram.is_template == is_template)
    if search:
        query = query.filter(
            or_(
                models.CalculationProgram.business_name.ilike(f"%{search}%"),
                models.CalculationProgram.description.ilike(f"%{search}%"),
                models.CalculationProgram.program_code.ilike(f"%{search}%"),
            )
        )
    total = query.count()
    programs = query.order_by(models.CalculationProgram.business_name).offset(skip).limit(limit).all()
    return {"programs": programs, "total_count": total}


@router.get("/programs/{program_id}", response_model=schemas.CalcProgramResponse,
    summary="Get a Calculation Program")
def get_calc_program(
    program_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    program = db.query(models.CalculationProgram).filter(models.CalculationProgram.program_id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Calculation Program not found")
    return program


@router.patch("/programs/{program_id}", response_model=schemas.CalcProgramResponse,
    summary="Update a Calculation Program",
    description="Updates a Calculation Program. If locked_steps=true, the steps[] array cannot be modified (T3 template protection).")
def update_calc_program(
    program_id: str,
    payload: schemas.CalcProgramCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    program = db.query(models.CalculationProgram).filter(models.CalculationProgram.program_id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Calculation Program not found")

    # T3 template protection — steps cannot be modified
    if program.locked_steps:
        raise HTTPException(status_code=403, detail="This program's steps are locked (T3 template). Clone it to create an editable copy.")

    program.business_name = payload.business_name
    program.description = payload.description
    program.domain = payload.domain
    program.tier = payload.tier
    program.tags = payload.tags
    program.steps = [s.dict() for s in payload.steps]
    program.inputs = [i.dict() for i in payload.inputs]
    program.product_id = payload.product_id
    program.subproduct_id = payload.subproduct_id
    program.updated_at = datetime.datetime.utcnow().isoformat()
    program.updated_by = current_user.id

    # Re-sync calculated fields — output tokens may have been added, removed, or renamed
    _sync_calculated_fields(db, program)

    db.commit()
    db.refresh(program)
    return program


@router.post("/programs/{program_id}/clone", response_model=schemas.CalcProgramResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Clone a Calculation Program",
    description="Creates an editable copy of any program (including locked T3 templates). The clone is always non-template and non-locked.")
def clone_calc_program(
    program_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges),
):
    source = db.query(models.CalculationProgram).filter(models.CalculationProgram.program_id == program_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source program not found")

    now = datetime.datetime.utcnow().isoformat()
    clone = models.CalculationProgram(
        program_id=f"CP-{uuid.uuid4().hex[:8].upper()}",
        program_code=f"{source.program_code}-COPY-{uuid.uuid4().hex[:4].upper()}",
        business_name=f"Copy of {source.business_name}",
        description=source.description,
        domain=source.domain,
        tier=source.tier,
        tags=source.tags,
        is_template=False,   # clones are always user programs, never templates
        locked_steps=False,  # clones are always editable
        steps=source.steps,
        inputs=source.inputs,
        application_package_id=source.application_package_id,
        product_id=source.product_id,
        subproduct_id=source.subproduct_id,
        status="DRAFT",
        created_at=now,
        created_by=current_user.id,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return clone


@router.post("/programs/{program_id}/execute", response_model=schemas.CalcProgramExecuteResponse,
    summary="Test-Execute a Calculation Program",
    description="Runs a single-record test execution. Returns per-step results so users can trace through the logic like a debugger. Equivalent to entering values into an Excel spreadsheet and seeing all intermediate cell values.")
def execute_calc_program(
    program_id: str,
    payload: schemas.CalcProgramExecuteRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    program = db.query(models.CalculationProgram).filter(models.CalculationProgram.program_id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Calculation Program not found")

    t_start = _time.time()
    step_results, outputs, error = execute_program(
        steps=program.steps or [],
        inputs=program.inputs or [],
        runtime_values=payload.runtime_values,
    )
    elapsed_ms = (_time.time() - t_start) * 1000

    # Convert Decimal results to float for JSON serialization
    serialized_steps = [
        {**s, "result": float(s["result"]) if s["result"] is not None else None}
        for s in step_results
    ]
    serialized_outputs = {k: float(v) for k, v in outputs.items()}

    return {
        "program_id": program_id,
        "status": "ERROR" if error and not outputs else ("PARTIAL_FAILURE" if error else "SUCCESS"),
        "step_results": serialized_steps,
        "outputs": serialized_outputs,
        "error": error,
        "execution_time_ms": round(elapsed_ms, 2),
    }


@router.post("/programs/{program_id}/batch", summary="Batch-Execute a Calculation Program",
    description="Runs the Calculation Program against a list of records (e.g. 50,000 collateral records). Returns per-record outputs and portfolio-level totals. Phase 2 will move this to a Celery async job.")
def batch_execute_calc_program(
    program_id: str,
    records: List[Dict[str, Any]],
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if len(records) > 10000:
        raise HTTPException(
            status_code=400,
            detail="Synchronous batch is limited to 10,000 records. For larger datasets, split into chunks or use the async batch endpoint (coming in Phase 2)."
        )

    program = db.query(models.CalculationProgram).filter(models.CalculationProgram.program_id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Calculation Program not found")

    result = execute_program_batch(
        steps=program.steps or [],
        inputs=program.inputs or [],
        records=records,
    )
    return result


# ---------------------------------------------------------------------------
# Legacy SymbolicFormulaAsset endpoint — single formula by asset_id
# ---------------------------------------------------------------------------
# WHY /{asset_id} IS LAST:
# This wildcard route must be registered AFTER all /programs/* specific routes.
# FastAPI matches routes in registration order — if this appeared first, requests
# to /programs, /programs/{id}/execute, etc. would all be caught here and fail.

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

