from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
import datetime

from database import get_db
import models
import schemas
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/mappers",
    tags=["DataGateway Engine"]
)

@router.post("/", response_model=schemas.PayloadMapperBlueprintResponse, status_code=status.HTTP_201_CREATED, summary="Create a Mapper Blueprint")
def create_mapper_blueprint(payload: schemas.PayloadMapperBlueprintCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Creates a new payload transformation mapper blueprint, including all its field mappings, in a single atomic transaction.
    
    This corresponds to the 'Dynamic Payload Transformation' module in the architecture.
    """
    mapper_id = f"MAP-{uuid.uuid4().hex[:8].upper()}"

    # Create the parent blueprint object
    new_blueprint = models.PayloadMapperBlueprint(
        mapper_id=mapper_id,
        mapper_name=payload.mapper_name,
        source_format=payload.source_format,
        target_format=payload.target_format,
        created_at=datetime.datetime.utcnow().isoformat(),
        created_by=current_user.id,
    )

    # Create and append child mapping objects using the relationship
    for mapping_payload in payload.mappings:
        new_blueprint.mappings.append(
            models.PayloadFieldMapping(
                mapping_id=f"MAP-FIELD-{uuid.uuid4().hex[:8].upper()}",
                **mapping_payload.dict()
            )
        )

    db.add(new_blueprint)
    db.commit()
    db.refresh(new_blueprint)

    # The relationship handles loading mappings, so we can return the object directly
    return new_blueprint

@router.get("/", response_model=schemas.PayloadMapperBlueprintListResponse, summary="List All Mapper Blueprints")
def list_mapper_blueprints(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a paginated list of all payload transformation mapper blueprints, with their associated field mappings eagerly loaded.
    """
    # The lazy="joined" option on the model handles the eager loading automatically.
    blueprints = db.query(models.PayloadMapperBlueprint).offset(skip).limit(limit).all()
    return {"mappers": blueprints}

@router.get("/{mapper_id}", response_model=schemas.PayloadMapperBlueprintResponse, summary="Get a Specific Mapper Blueprint")
def get_mapper_blueprint(mapper_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves a specific payload transformation mapper blueprint by its ID, including all of its associated field mappings.
    """
    # With lazy="joined" on the model, mappings are automatically loaded via a JOIN.
    blueprint = db.query(models.PayloadMapperBlueprint).filter(
        models.PayloadMapperBlueprint.mapper_id == mapper_id
    ).first()

    if not blueprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mapper blueprint with ID '{mapper_id}' not found."
        )

    # FastAPI and Pydantic handle the conversion from the ORM model to the response model.
    return blueprint

@router.put("/{mapper_id}", response_model=schemas.PayloadMapperBlueprintResponse, summary="Update a Mapper Blueprint")
def update_mapper_blueprint(mapper_id: str, payload: schemas.PayloadMapperBlueprintCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Atomically updates a mapper blueprint, including all of its field mappings.
    This endpoint replaces the existing configuration and mappings with the new graph provided in the payload.
    """
    db_blueprint = db.query(models.PayloadMapperBlueprint).filter(
        models.PayloadMapperBlueprint.mapper_id == mapper_id
    ).first()

    if not db_blueprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mapper blueprint with ID '{mapper_id}' not found."
        )

    try:
        # Update scalar properties
        db_blueprint.mapper_name = payload.mapper_name
        db_blueprint.source_format = payload.source_format
        db_blueprint.target_format = payload.target_format

        # Clear existing mappings. SQLAlchemy's cascade will handle deletion.
        db_blueprint.mappings.clear()
        db.flush()  # Execute deletes before adds

        # Create and add new mappings from the payload
        for mapping_payload in payload.mappings:
            db_blueprint.mappings.append(
                models.PayloadFieldMapping(
                    mapping_id=f"MAP-FIELD-{uuid.uuid4().hex[:8].upper()}",
                    **mapping_payload.dict()
                )
            )

        db.commit()
        db.refresh(db_blueprint)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"An error occurred during mapper update: {str(e)}")

    return db_blueprint

@router.delete("/{mapper_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a Mapper Blueprint")
def delete_mapper_blueprint(mapper_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Deletes a mapper blueprint and all of its associated field mappings. The deletion is cascaded by the database relationship configuration.
    """
    blueprint = db.query(models.PayloadMapperBlueprint).filter(
        models.PayloadMapperBlueprint.mapper_id == mapper_id
    ).first()

    if not blueprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mapper blueprint with ID '{mapper_id}' not found."
        )
    
    db.delete(blueprint)
    db.commit()
    return

@router.post("/{mapper_id}/mappings", response_model=schemas.PayloadFieldMappingResponse, status_code=status.HTTP_201_CREATED, summary="Add a Field Mapping to a Blueprint")
def add_field_mapping_to_blueprint(mapper_id: str, payload: schemas.PayloadFieldMappingCreate, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Adds a new single field mapping to an existing mapper blueprint.
    
    Note: For adding multiple mappings, it is more efficient to use the `PUT` endpoint for the parent mapper blueprint.
    """
    if not db.query(models.PayloadMapperBlueprint).filter(models.PayloadMapperBlueprint.mapper_id == mapper_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Mapper blueprint with ID '{mapper_id}' not found.")
        
    mapping_id = f"MAP-FIELD-{uuid.uuid4().hex[:8].upper()}"
    new_mapping = models.PayloadFieldMapping(
        mapping_id=mapping_id,
        mapper_id=mapper_id,
        **payload.dict()
    )
    db.add(new_mapping)
    db.commit()
    db.refresh(new_mapping)
    
    return new_mapping