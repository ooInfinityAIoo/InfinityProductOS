from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid
import datetime

from database import get_db
import models
import schemas
from auth import get_current_user, require_designer_privileges, require_admin, CurrentUser

router = APIRouter(
    prefix="/api/v1/domain-apis",
    tags=["Domain API Designer"]
)

@router.post("/", response_model=schemas.DomainApiContractResponse, status_code=status.HTTP_201_CREATED, summary="Create a New Domain API Contract")
def create_api_contract(payload: schemas.DomainApiContractCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Creates a new Domain API Contract in a 'DRAFT' state.
    """
    existing = db.query(models.DomainApiContract).filter(models.DomainApiContract.api_name == payload.api_name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"An API contract with the name '{payload.api_name}' already exists.")

    new_contract = models.DomainApiContract(
        api_contract_id=f"DAPI-{uuid.uuid4().hex[:8].upper()}",
        status="DRAFT",
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id,
        **payload.dict()
    )
    db.add(new_contract)
    db.commit()
    db.refresh(new_contract)
    return new_contract

@router.get("/", response_model=List[schemas.DomainApiContractResponse], summary="List All Domain API Contracts")
def list_api_contracts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a paginated list of all defined Domain API Contracts.
    """
    contracts = db.query(models.DomainApiContract).order_by(models.DomainApiContract.api_name).offset(skip).limit(limit).all()
    return contracts

@router.get("/{api_contract_id}", response_model=schemas.DomainApiContractResponse, summary="Get a Specific Domain API Contract")
def get_api_contract(api_contract_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves the full details of a specific Domain API Contract by its ID.
    """
    contract = db.query(models.DomainApiContract).filter(models.DomainApiContract.api_contract_id == api_contract_id).first()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"API contract with ID '{api_contract_id}' not found.")
    return contract

@router.put("/{api_contract_id}", response_model=schemas.DomainApiContractResponse, summary="Update a Domain API Contract")
def update_api_contract(api_contract_id: str, payload: schemas.DomainApiContractCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Updates the definition of a Domain API Contract. Can only be updated in 'DRAFT' state.
    """
    db_contract = db.query(models.DomainApiContract).filter(models.DomainApiContract.api_contract_id == api_contract_id).first()
    if not db_contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"API contract with ID '{api_contract_id}' not found.")

    if db_contract.status != "DRAFT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"API contract cannot be updated. Status is '{db_contract.status}'. Only DRAFT contracts can be edited.")

    for key, value in payload.dict().items():
        setattr(db_contract, key, value)
    
    db_contract.updated_at = datetime.datetime.utcnow().isoformat()
    db_contract.updated_by = current_user.id
    
    db.commit()
    db.refresh(db_contract)
    return db_contract

@router.post("/{api_contract_id}/submit", response_model=schemas.DomainApiStateChangeResponse, summary="Submit a Draft for Approval")
def submit_api_contract(api_contract_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Submits a 'DRAFT' API contract, changing its status to 'PENDING_APPROVAL'.
    """
    db_contract = db.query(models.DomainApiContract).filter(models.DomainApiContract.api_contract_id == api_contract_id).first()
    if not db_contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"API contract with ID '{api_contract_id}' not found.")
    if db_contract.status != "DRAFT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Only DRAFT contracts can be submitted for approval. Current status is '{db_contract.status}'.")

    db_contract.status = "PENDING_APPROVAL"
    db_contract.updated_at = datetime.datetime.utcnow().isoformat()
    db_contract.updated_by = current_user.id
    db.commit()
    
    return {"message": "API contract submitted for approval.", "api_contract_id": api_contract_id, "new_status": "PENDING_APPROVAL"}

@router.post("/{api_contract_id}/approve", response_model=schemas.DomainApiStateChangeResponse, summary="Approve an API Contract")
def approve_api_contract(api_contract_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Approves a 'PENDING_APPROVAL' API contract, changing its status to 'APPROVED'. Requires admin privileges.
    """
    db_contract = db.query(models.DomainApiContract).filter(models.DomainApiContract.api_contract_id == api_contract_id).first()
    if not db_contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"API contract with ID '{api_contract_id}' not found.")
    if db_contract.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Only PENDING_APPROVAL contracts can be approved. Current status is '{db_contract.status}'.")

    db_contract.status = "APPROVED"
    db_contract.updated_at = datetime.datetime.utcnow().isoformat()
    db_contract.updated_by = current_user.id
    db.commit()
    
    return {"message": "API contract has been approved and is now active.", "api_contract_id": api_contract_id, "new_status": "APPROVED"}

@router.delete("/{api_contract_id}", response_model=schemas.DomainApiStateChangeResponse, summary="Delete an API Contract")
def delete_api_contract(api_contract_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_admin)):
    """
    Marks an API contract as 'DELETED'. This is a soft delete.
    This action is only permitted if the API contract is not currently linked to any workflow nodes.
    Requires admin privileges.
    """
    db_contract = db.query(models.DomainApiContract).filter(models.DomainApiContract.api_contract_id == api_contract_id).first()
    if not db_contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"API contract with ID '{api_contract_id}' not found.")

    # Orphan Guardrail: Check if the API contract is used in any workflow nodes.
    # This is a simplified check. A real system might need to check more places.
    usage_count = db.query(models.WorkflowNode).filter(models.WorkflowNode.api_triggers.contains([api_contract_id])).count()
    if usage_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete API contract. It is currently used in {usage_count} workflow node(s)."
        )

    db_contract.status = "DELETED"
    db_contract.updated_at = datetime.datetime.utcnow().isoformat()
    db_contract.updated_by = current_user.id
    db.commit()

    return {"message": "API contract has been marked as deleted.", "api_contract_id": api_contract_id, "new_status": "DELETED"}