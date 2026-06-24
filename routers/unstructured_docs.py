# WHY THIS FILE EXISTS (WS-9 — Unstructured Document Studio):
# REST endpoints for AI-driven document extraction blueprints.
# Handles documents that structured file parsing cannot read:
#   PDF_STRUCTURED — invoices, bank statements (predictable layout + OCR zones)
#   PDF_AGENTIC    — legal contracts, KYC packs (section-aware LLM chain)
#   IMAGE_OCR      — scanned/photographed documents (pre-process + OCR)
#
# Document type classification is USER-DEFINED via DocumentMaster (not a hardcoded
# enum) — consistent with ADR #3 no-code principle.
#
# ai_extraction_config JSONB structure per profile:
#
# PDF_STRUCTURED / IMAGE_OCR:
# { "extraction_rules": [
#     { "rule_name": "Invoice Total",
#       "page": 1,
#       "position_hint": "bottom-right, last row of amount table",
#       "iso_field": "ISO.InstructedAmount",
#       "is_mandatory": true,
#       "confidence_threshold": 0.9,
#       "default_value": null }
#   ],
#   "pre_processing": ["deskew", "denoise"],  # IMAGE_OCR only
#   "language": "en"                          # IMAGE_OCR only
# }
#
# PDF_AGENTIC:
# { "sections": [
#     { "section_name": "Governing Law",
#       "section_prompt": "Find the governing law or jurisdiction clause in this contract",
#       "fields": [
#         { "field_name": "Jurisdiction",
#           "extraction_prompt": "What is the governing legal jurisdiction?",
#           "iso_field": "ISO.LegalJurisdiction",
#           "is_mandatory": true,
#           "default_value": null }
#       ]
#     }
#   ]
# }
#
# Lifecycle: DRAFT → PENDING_APPROVAL → LIVE → ARCHIVED
# 4-Eye on make-live. Auto-registers in Entitlement Module on LIVE.

import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
from database import get_db
from auth import get_current_user, require_designer_privileges, CurrentUser
from routers.entitlements import register_entity

router = APIRouter(prefix="/api/v1/unstructured-docs", tags=["Unstructured Document Studio"])

VALID_PROFILES = {"PDF_STRUCTURED", "PDF_AGENTIC", "IMAGE_OCR"}
VALID_FALLBACK_MODES = {"SKIP_FIELD", "HUMAN_REVIEW", "USE_DEFAULT"}


def _serialize(b: models.UnstructuredExtractionBlueprint, doc_type_name: str = None) -> dict:
    return {
        "blueprint_id": b.blueprint_id,
        "blueprint_name": b.blueprint_name,
        "description": b.description,
        "document_type_id": b.document_type_id,
        "document_type_name": doc_type_name,
        "extraction_profile": b.extraction_profile,
        "ai_extraction_config": b.ai_extraction_config or {},
        "confidence_threshold": b.confidence_threshold,
        "fallback_mode": b.fallback_mode,
        "application_package_id": b.application_package_id,
        "version_number": b.version_number,
        "parent_blueprint_id": b.parent_blueprint_id,
        "status": b.status,
        "created_at": b.created_at,
        "updated_at": b.updated_at,
        "created_by": b.created_by,
        "made_live_at": b.made_live_at,
        "made_live_by": b.made_live_by,
    }


def _with_doc_type(db: Session, b: models.UnstructuredExtractionBlueprint) -> dict:
    doc_type_name = None
    if b.document_type_id:
        dm = db.query(models.DocumentMaster).filter(
            models.DocumentMaster.document_id == b.document_type_id
        ).first()
        doc_type_name = dm.document_name if dm else None
    return _serialize(b, doc_type_name)


@router.get("/", summary="List Extraction Blueprints")
def list_blueprints(
    package_id: Optional[str] = Query(None),
    extraction_profile: Optional[str] = Query(None),
    document_type_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Returns all AI extraction blueprints, optionally filtered by package, profile,
    document type, or status. Used by the list view and also by the Ingestion
    Pipeline when selecting which blueprint to apply to an uploaded file.
    """
    q = db.query(models.UnstructuredExtractionBlueprint)
    if package_id:
        q = q.filter(models.UnstructuredExtractionBlueprint.application_package_id == package_id)
    if extraction_profile:
        q = q.filter(models.UnstructuredExtractionBlueprint.extraction_profile == extraction_profile.upper())
    if document_type_id:
        q = q.filter(models.UnstructuredExtractionBlueprint.document_type_id == document_type_id)
    if status:
        q = q.filter(models.UnstructuredExtractionBlueprint.status == status.upper())
    blueprints = q.order_by(models.UnstructuredExtractionBlueprint.blueprint_name).all()
    return {
        "blueprints": [_with_doc_type(db, b) for b in blueprints],
        "total": len(blueprints)
    }


@router.get("/document-types", summary="List user-defined document types from Document Master")
def list_document_types(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    WHY: The extraction blueprint needs to classify which document type it handles.
    This endpoint returns the user-defined types from Document Master (not a
    hardcoded enum) so the studio dropdown reflects whatever the bank has registered.
    """
    types = db.query(models.DocumentMaster).order_by(models.DocumentMaster.document_name).all()
    return {
        "document_types": [
            {
                "document_id": t.document_id,
                "document_name": t.document_name,
                "document_format": t.document_format,
                "description": t.description,
            }
            for t in types
        ]
    }


@router.post("/", status_code=201, summary="Create Extraction Blueprint")
def create_blueprint(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    profile = payload.get("extraction_profile", "").upper()
    if profile not in VALID_PROFILES:
        raise HTTPException(400, f"extraction_profile must be one of {VALID_PROFILES}")
    fallback = payload.get("fallback_mode", "HUMAN_REVIEW").upper()
    if fallback not in VALID_FALLBACK_MODES:
        raise HTTPException(400, f"fallback_mode must be one of {VALID_FALLBACK_MODES}")

    now = datetime.now(timezone.utc).isoformat()
    b = models.UnstructuredExtractionBlueprint(
        blueprint_id=f"UEB-{uuid.uuid4().hex[:10].upper()}",
        blueprint_name=payload["blueprint_name"],
        description=payload.get("description"),
        document_type_id=payload.get("document_type_id"),
        extraction_profile=profile,
        ai_extraction_config=payload.get("ai_extraction_config", {}),
        confidence_threshold=float(payload.get("confidence_threshold", 0.80)),
        fallback_mode=fallback,
        application_package_id=payload.get("application_package_id"),
        version_number=1,
        status="DRAFT",
        created_at=now,
        created_by=current_user.id,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _with_doc_type(db, b)


@router.get("/{blueprint_id}", summary="Get Blueprint")
def get_blueprint(
    blueprint_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    b = db.query(models.UnstructuredExtractionBlueprint).filter(
        models.UnstructuredExtractionBlueprint.blueprint_id == blueprint_id
    ).first()
    if not b:
        raise HTTPException(404, f"Blueprint '{blueprint_id}' not found.")
    return _with_doc_type(db, b)


@router.put("/{blueprint_id}", summary="Update Blueprint (DRAFT only)")
def update_blueprint(
    blueprint_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    WHY: Only DRAFT blueprints can be edited directly.
    For LIVE blueprints, editing creates a new version (old stays LIVE until new is approved).
    This endpoint handles DRAFT-only updates. The new-version path is /new-version.
    """
    b = db.query(models.UnstructuredExtractionBlueprint).filter(
        models.UnstructuredExtractionBlueprint.blueprint_id == blueprint_id
    ).first()
    if not b:
        raise HTTPException(404, f"Blueprint '{blueprint_id}' not found.")
    if b.status == "LIVE":
        raise HTTPException(400, "Cannot edit a LIVE blueprint directly. Use /new-version to create a new version.")

    if "blueprint_name" in payload:
        b.blueprint_name = payload["blueprint_name"]
    if "description" in payload:
        b.description = payload["description"]
    if "document_type_id" in payload:
        b.document_type_id = payload["document_type_id"]
    if "ai_extraction_config" in payload:
        b.ai_extraction_config = payload["ai_extraction_config"]
    if "confidence_threshold" in payload:
        b.confidence_threshold = float(payload["confidence_threshold"])
    if "fallback_mode" in payload:
        fm = payload["fallback_mode"].upper()
        if fm not in VALID_FALLBACK_MODES:
            raise HTTPException(400, f"fallback_mode must be one of {VALID_FALLBACK_MODES}")
        b.fallback_mode = fm
    b.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(b)
    return _with_doc_type(db, b)


@router.post("/{blueprint_id}/new-version", status_code=201, summary="Create new version of a LIVE blueprint")
def new_version(
    blueprint_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    WHY: A LIVE blueprint is in active use by the Ingestion Pipeline — editing it
    directly would break running jobs. Creating a new version lets the old LIVE
    version keep working until the new one is approved and published.
    """
    parent = db.query(models.UnstructuredExtractionBlueprint).filter(
        models.UnstructuredExtractionBlueprint.blueprint_id == blueprint_id
    ).first()
    if not parent:
        raise HTTPException(404, f"Blueprint '{blueprint_id}' not found.")

    now = datetime.now(timezone.utc).isoformat()
    b = models.UnstructuredExtractionBlueprint(
        blueprint_id=f"UEB-{uuid.uuid4().hex[:10].upper()}",
        blueprint_name=payload.get("blueprint_name", parent.blueprint_name),
        description=payload.get("description", parent.description),
        document_type_id=payload.get("document_type_id", parent.document_type_id),
        extraction_profile=payload.get("extraction_profile", parent.extraction_profile),
        ai_extraction_config=payload.get("ai_extraction_config", parent.ai_extraction_config),
        confidence_threshold=float(payload.get("confidence_threshold", parent.confidence_threshold)),
        fallback_mode=payload.get("fallback_mode", parent.fallback_mode),
        application_package_id=parent.application_package_id,
        version_number=parent.version_number + 1,
        parent_blueprint_id=blueprint_id,
        status="DRAFT",
        created_at=now,
        created_by=current_user.id,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _with_doc_type(db, b)


@router.post("/{blueprint_id}/submit", summary="Submit for 4-Eye Approval")
def submit(
    blueprint_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    b = db.query(models.UnstructuredExtractionBlueprint).filter(
        models.UnstructuredExtractionBlueprint.blueprint_id == blueprint_id
    ).first()
    if not b:
        raise HTTPException(404, f"Blueprint '{blueprint_id}' not found.")
    if b.status != "DRAFT":
        raise HTTPException(400, f"Only DRAFT blueprints can be submitted. Current: {b.status}")

    # Validate that extraction config has at least one rule/section
    config = b.ai_extraction_config or {}
    if b.extraction_profile in ("PDF_STRUCTURED", "IMAGE_OCR"):
        if not config.get("extraction_rules"):
            raise HTTPException(400, "Add at least one extraction rule before submitting.")
    elif b.extraction_profile == "PDF_AGENTIC":
        if not config.get("sections"):
            raise HTTPException(400, "Add at least one section before submitting.")

    b.status = "PENDING_APPROVAL"
    b.updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {**_with_doc_type(db, b), "_note": "Submitted for 4-Eye approval."}


@router.post("/{blueprint_id}/make-live", summary="Make Blueprint Live (4-Eye)")
def make_live(
    blueprint_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    WHY: A blueprint going LIVE means the Ingestion Pipeline will use its AI
    extraction config on real documents in production. A wrong OCR zone or
    agentic prompt will silently misread financial data. Second approver required.
    Archives any currently LIVE version of the same blueprint name.
    Auto-registers in Entitlement Module.
    """
    b = db.query(models.UnstructuredExtractionBlueprint).filter(
        models.UnstructuredExtractionBlueprint.blueprint_id == blueprint_id
    ).first()
    if not b:
        raise HTTPException(404, f"Blueprint '{blueprint_id}' not found.")
    if b.status != "PENDING_APPROVAL":
        raise HTTPException(400, f"Only PENDING_APPROVAL blueprints can go live. Current: {b.status}")
    if b.created_by == current_user.id:
        raise HTTPException(403, "4-Eye violation: approver cannot be the same as the creator.")

    now = datetime.now(timezone.utc).isoformat()

    siblings = db.query(models.UnstructuredExtractionBlueprint).filter(
        models.UnstructuredExtractionBlueprint.status == "LIVE",
        models.UnstructuredExtractionBlueprint.blueprint_name == b.blueprint_name,
        models.UnstructuredExtractionBlueprint.blueprint_id != blueprint_id
    ).all()
    for s in siblings:
        s.status = "ARCHIVED"
        s.updated_at = now

    b.status = "LIVE"
    b.made_live_at = now
    b.made_live_by = current_user.id
    b.updated_at = now
    db.commit()

    register_entity(
        db, "EXTRACTION_BLUEPRINT", b.blueprint_id,
        b.blueprint_name, b.application_package_id, current_user.id
    )

    return {**_with_doc_type(db, b), "_note": "Blueprint is now LIVE. Registered in Entitlement Module."}
