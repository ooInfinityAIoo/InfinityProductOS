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
    """Helper to unpack the JSONB definition into the response model.

    WHY THE SHAPE GUARD: Screens created through the Screen Designer store
    `definition` as a dict: {components, action_buttons, value_list_groups}.
    But some records (older seeds / external imports) stored the raw components
    list directly. Calling .get() on a list raises AttributeError and 500s the
    ENTIRE list endpoint — one malformed record blanks out the whole Screen
    Library. We normalize both shapes here so the studio is resilient.
    """
    raw = db_screen.definition or {}
    if isinstance(raw, list):
        # Legacy/seed shape: definition IS the components array itself
        definition_data = {"components": raw, "action_buttons": [], "value_list_groups": []}
    elif isinstance(raw, dict):
        definition_data = raw
    else:
        definition_data = {}
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
        linked_api_id=getattr(db_screen, 'linked_api_id', None),
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

    # `definition` is typed Any on the schema, so over the wire it arrives as plain
    # JSON (a list of component dicts, OR a {components, action_buttons, ...} object,
    # OR None) — NOT Pydantic models. Normalise defensively instead of assuming
    # every element has .dict(); the previous code crashed on all real API input.
    def _as_dict(x):
        return x.dict(exclude_unset=True) if hasattr(x, "dict") else x

    defn = payload.definition
    if isinstance(defn, dict):
        raw_components = defn.get("components", [])
        embedded_buttons = defn.get("action_buttons", [])
    elif isinstance(defn, list):
        raw_components = defn
        embedded_buttons = []
    else:
        raw_components = []
        embedded_buttons = []

    full_definition = {
        "components": [_as_dict(c) for c in raw_components],
        "action_buttons": [_as_dict(b) for b in (payload.action_buttons or embedded_buttons)],
        "value_list_groups": [_as_dict(g) for g in payload.value_list_groups],
    }
    
    # GAP 2: Atomic Creation of the pending API
    linked_api_id = payload.linked_api_id
    if payload.pending_api_config:
        linked_api_id = f"API-{uuid.uuid4().hex[:8].upper()}"
        new_api = models.ApiConfiguration(
            api_id=linked_api_id,
            created_by=current_user.id,
            created_at=datetime.datetime.utcnow().isoformat(),
            status="DRAFT", # Ensure the API starts in DRAFT mode initially
            **payload.pending_api_config
        )
        db.add(new_api)

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
        linked_api_id=linked_api_id,
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
    package_id: Optional[str] = None,
    domain_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    WHY package_id + domain_id filters exist:
    WS-12 Package Sidebar Navigation fetches LIVE screens grouped by BusinessDomain.
    Without these filters the frontend would have to load all screens and filter client-side,
    which is unworkable once a bank has hundreds of screens per package.
    """
    query = db.query(models.ScreenTemplate)
    if status:
        query = query.filter(models.ScreenTemplate.status == status.upper())
    if package_id:
        query = query.filter(models.ScreenTemplate.application_package_id == package_id)
    if domain_id:
        query = query.filter(models.ScreenTemplate.business_domain_id == domain_id)
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
    db_screen.linked_api_id = payload.linked_api_id
    
    # GAP 4: Tying the Deactivation Lifecycles
    if payload.status:
        db_screen.status = payload.status
        if payload.status in ["DELETED", "INACTIVE"] and db_screen.linked_api_id:
            linked_api = db.query(models.ApiConfiguration).filter(models.ApiConfiguration.api_id == db_screen.linked_api_id).first()
            if linked_api:
                linked_api.status = payload.status
                linked_api.updated_at = datetime.datetime.utcnow().isoformat()
                
    db_screen.updated_at = datetime.datetime.utcnow().isoformat()

    # Pack and update the JSONB definition field
    # `definition` is typed Any on the schema, so over the wire it arrives as plain
    # JSON (a list of component dicts, OR a {components, action_buttons, ...} object,
    # OR None) — NOT Pydantic models. Normalise defensively instead of assuming
    # every element has .dict(); the previous code crashed on all real API input.
    def _as_dict(x):
        return x.dict(exclude_unset=True) if hasattr(x, "dict") else x

    defn = payload.definition
    if isinstance(defn, dict):
        raw_components = defn.get("components", [])
        embedded_buttons = defn.get("action_buttons", [])
    elif isinstance(defn, list):
        raw_components = defn
        embedded_buttons = []
    else:
        raw_components = []
        embedded_buttons = []

    full_definition = {
        "components": [_as_dict(c) for c in raw_components],
        "action_buttons": [_as_dict(b) for b in (payload.action_buttons or embedded_buttons)],
        "value_list_groups": [_as_dict(g) for g in payload.value_list_groups],
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

# ─────────────────────────────────────────────────────────────────────────────
# WS-2: SCREEN LIFECYCLE — "Make it Live" + versioning
# WS-3: BUSINESS DOMAIN endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{screen_id}/submit-for-approval", summary="Submit Screen for 4-Eye Approval")
def submit_screen_for_approval(screen_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    Moves a DRAFT screen to PENDING_APPROVAL.
    A second approver must then call /make-live to promote it.
    Builder cannot approve their own screen (4-Eye rule enforced at make-live).
    """
    screen = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_id == screen_id).first()
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found.")
    if screen.status != "DRAFT":
        raise HTTPException(status_code=400, detail=f"Only DRAFT screens can be submitted. Current status: {screen.status}")
    screen.status = "PENDING_APPROVAL"
    screen.updated_at = datetime.datetime.utcnow().isoformat()
    db.commit()
    return {"screen_id": screen_id, "status": "PENDING_APPROVAL", "message": "Screen submitted for 4-Eye approval."}


@router.post("/{screen_id}/make-live", summary="Make a Screen Live (4-Eye approval)")
def make_screen_live(screen_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    WHY THIS EXISTS:
    The "Make it Live" action — promotes a PENDING_APPROVAL screen to LIVE.
    When approved:
    1. The previous LIVE version (if any) is ARCHIVED — never deleted.
    2. This version becomes LIVE and appears in the Package sidebar navigation.
    3. bank users can now see and use this screen.

    4-Eye rule: the user making it live must not be the same as created_by.
    (Currently a warning — full entitlement enforcement comes with WS-8.)
    """
    screen = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_id == screen_id).first()
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found.")
    if screen.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=400, detail=f"Only PENDING_APPROVAL screens can go live. Current status: {screen.status}")

    now = datetime.datetime.utcnow().isoformat()
    approver = current_user.id

    # Soft 4-Eye check — warn but don't hard-block until Entitlement module (WS-8) is live
    if screen.created_by == approver:
        raise HTTPException(status_code=403, detail="4-Eye rule: the person who created this screen cannot approve it live. A second reviewer must approve.")

    # Archive any currently LIVE version of this screen (same name, same package)
    # parent_screen_id=None means this IS the root version; find siblings via parent or self
    root_id = screen.parent_screen_id or screen.screen_id
    db.query(models.ScreenTemplate).filter(
        models.ScreenTemplate.status == "LIVE",
        models.ScreenTemplate.screen_id != screen_id,
        (models.ScreenTemplate.screen_id == root_id) |
        (models.ScreenTemplate.parent_screen_id == root_id)
    ).update({"status": "ARCHIVED", "updated_at": now}, synchronize_session=False)

    # Promote this version to LIVE
    screen.status = "LIVE"
    screen.made_live_at = now
    screen.made_live_by = approver
    screen.updated_at = now
    db.commit()

    return {
        "screen_id": screen_id,
        "status": "LIVE",
        "made_live_at": now,
        "made_live_by": approver,
        "message": f"Screen '{screen.screen_name}' v{screen.version_number} is now LIVE."
    }


@router.post("/{screen_id}/create-new-version", summary="Create New Draft Version of a Live Screen")
def create_new_version(screen_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(require_designer_privileges)):
    """
    WHY THIS EXISTS:
    When a bank wants to modify a LIVE screen (e.g. add a holiday calendar field),
    they must not edit the live version directly. This endpoint creates a new DRAFT
    copy with version_number incremented. The LIVE version keeps running uninterrupted
    until the new version passes 4-Eye approval and is made live.
    """
    live_screen = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_id == screen_id).first()
    if not live_screen:
        raise HTTPException(status_code=404, detail="Screen not found.")
    if live_screen.status != "LIVE":
        raise HTTPException(status_code=400, detail="Only LIVE screens can spawn a new version.")

    # Find the highest existing version number for this screen lineage
    root_id = live_screen.parent_screen_id or live_screen.screen_id
    max_version = db.query(func.max(models.ScreenTemplate.version_number)).filter(
        (models.ScreenTemplate.screen_id == root_id) |
        (models.ScreenTemplate.parent_screen_id == root_id)
    ).scalar() or 1

    now = datetime.datetime.utcnow().isoformat()
    new_screen = models.ScreenTemplate(
        screen_id=f"SCRN-{uuid.uuid4().hex[:12].upper()}",
        screen_name=live_screen.screen_name,
        description=live_screen.description,
        version_number=max_version + 1,
        parent_screen_id=root_id,
        status="DRAFT",
        screen_template_category=live_screen.screen_template_category,
        application_package_id=live_screen.application_package_id,
        product_id=live_screen.product_id,
        subproduct_id=live_screen.subproduct_id,
        workflow_id=live_screen.workflow_id,
        workflow_step_id=live_screen.workflow_step_id,
        linked_api_id=live_screen.linked_api_id,
        business_domain_id=live_screen.business_domain_id,
        definition=live_screen.definition,
        created_at=now,
        updated_at=now,
        created_by=current_user.id,
    )
    db.add(new_screen)
    db.commit()
    db.refresh(new_screen)

    return {
        "screen_id": new_screen.screen_id,
        "version_number": new_screen.version_number,
        "parent_screen_id": root_id,
        "status": "DRAFT",
        "message": f"New draft v{new_screen.version_number} created. Live v{live_screen.version_number} continues running."
    }


@router.get("/{screen_id}/versions", summary="Get All Versions of a Screen")
def get_screen_versions(screen_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """Returns the full version history of a screen (for audit and design review)."""
    screen = db.query(models.ScreenTemplate).filter(models.ScreenTemplate.screen_id == screen_id).first()
    if not screen:
        raise HTTPException(status_code=404, detail="Screen not found.")
    root_id = screen.parent_screen_id or screen.screen_id
    versions = db.query(models.ScreenTemplate).filter(
        (models.ScreenTemplate.screen_id == root_id) |
        (models.ScreenTemplate.parent_screen_id == root_id)
    ).order_by(models.ScreenTemplate.version_number).all()
    return {
        "screen_name": screen.screen_name,
        "versions": [{"screen_id": v.screen_id, "version_number": v.version_number,
                      "status": v.status, "created_at": v.created_at,
                      "made_live_at": v.made_live_at, "made_live_by": v.made_live_by} for v in versions]
    }


# ── WS-3: Business Domain endpoints ──────────────────────────────────────────

@router.get("/domains/package/{package_id}", summary="Get Business Domains for a Package")
def get_business_domains(package_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Returns all Business Domains for a package, ordered by sort_order.
    Used to build the Package sidebar navigation sections.
    Each domain also returns a count of LIVE screens in that section.
    """
    domains = db.query(models.BusinessDomain).filter(
        models.BusinessDomain.package_id == package_id,
        models.BusinessDomain.status == "ACTIVE"
    ).order_by(models.BusinessDomain.sort_order).all()

    result = []
    for d in domains:
        live_count = db.query(models.ScreenTemplate).filter(
            models.ScreenTemplate.business_domain_id == d.domain_id,
            models.ScreenTemplate.status == "LIVE"
        ).count()
        result.append({
            "domain_id": d.domain_id,
            "domain_name": d.domain_name,
            "domain_code": d.domain_code,
            "icon": d.icon,
            "description": d.description,
            "screen_type_affinity": d.screen_type_affinity,
            "is_system_default": bool(d.is_system_default),
            "sort_order": d.sort_order,
            "live_screen_count": live_count,
        })

    return {"package_id": package_id, "domains": result, "total": len(result)}
