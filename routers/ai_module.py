from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any

import schemas
from database import get_db
from services.ai_services import AIService
from auth import get_current_user, require_admin, require_admin_or_auditor, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/ai",
    tags=["Behavioral AI Module"]
)

# --- RBAC Dependencies (copied from other routers) ---

@router.post("/log-interaction", response_model=schemas.UserInteractionEventResponse, status_code=status.HTTP_201_CREATED, summary="Log a User Interaction Event")
def log_user_interaction(
    payload: schemas.UserInteractionEventCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Receives and logs a user interaction event from the frontend for Behavioural AI analysis.
    """
    ai_service = AIService()
    logged_event = ai_service.log_user_interaction(db=db, user_id=current_user.id, event_data=payload)
    return logged_event

@router.get("/users/{user_id}/interactions", response_model=schemas.UserInteractionSummaryResponse, summary="Get a User's Recent Interactions")
def get_user_interaction_summary(
    user_id: str,
    limit: int = Query(20, ge=1, le=100, description="Number of recent interactions to return."),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Retrieves a summary of a specific user's most recent interaction events,
    which are logged for Behavioural AI analysis.
    """
    # --- RBAC Check ---
    is_admin_or_auditor = current_user.role in [schemas.UserRole.ADMIN, schemas.UserRole.AUDITOR]
    if not is_admin_or_auditor and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this user's interactions."
        )

    ai_service = AIService()
    summary = ai_service.get_user_interaction_summary(db=db, user_id=user_id, limit=limit)
    
    return summary

@router.post("/predict-next-action", response_model=schemas.PredictiveInsightResponse, summary="Predict a User's Next Action")
def predict_next_action(
    payload: schemas.PredictiveInsightRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Processes a user's interaction history to generate a simple predictive insight
    about their most likely next action.
    """
    ai_service = AIService()
    prediction = ai_service.generate_predictive_insight(
        db=db, 
        user_id=current_user.id, 
        current_event_type=payload.current_event_type,
        current_target_id=payload.current_target_component_id
    )
    
    return prediction

@router.post("/conversational-insight", response_model=schemas.ConversationalInsightResponse, summary="Get a Conversational AI Response")
def get_conversational_insight(
    payload: schemas.ConversationalInsightRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Processes a user's natural language query and provides a conversational response
    based on their recent interaction history.
    """
    ai_service = AIService()
    insight = ai_service.generate_conversational_insight(
        db=db, 
        user_id=current_user.id, 
        query=payload.query
    )
    
    return insight

@router.get("/stats/interactions", response_model=schemas.UserInteractionStatsResponse, summary="Get User Interaction Statistics")
def get_interaction_statistics(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin_or_auditor)
):
    """
    Retrieves system-wide statistics on user interaction events, such as the most
    common event types and total number of interactions.

    Requires admin or auditor privileges.
    """
    ai_service = AIService()
    stats = ai_service.get_interaction_statistics(db=db)
    
    return stats

@router.delete("/users/{user_id}/interactions", response_model=schemas.CleanupSummaryResponse, summary="Clear a User's Interaction History")
def clear_user_interaction_history(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin)
):
    """
    Permanently deletes all interaction history for a specific user.
    This is a destructive operation intended for fulfilling data privacy requests (e.g., GDPR 'right to be forgotten').

    Requires admin privileges.
    """
    ai_service = AIService()
    try:
        deleted_count = ai_service.clear_user_interaction_history(db=db, user_id=user_id, triggered_by=current_user.id)
        return {
            "deleted_count": deleted_count,
            "message": f"Successfully deleted {deleted_count} interaction events for user '{user_id}'."
        }
    except Exception as e:
        # The service layer will have already rolled back and logged the failure.
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during history cleanup: {str(e)}")

@router.get("/privacy/cleared-users", response_model=schemas.ClearedUserHistoryListResponse, summary="Get History of Cleared User Data")
def get_cleared_user_history(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin_or_auditor)
):
    """
    Retrieves a list of all unique users who have had their interaction history cleared,
    showing the most recent clearance event for each.

    This is a data privacy audit endpoint and requires admin or auditor privileges.
    """
    ai_service = AIService()
    cleared_users_list = ai_service.get_cleared_user_history(db=db)
    
    return {
        "cleared_users": cleared_users_list,
        "total_count": len(cleared_users_list)
    }
    
@router.get("/profiles", response_model=schemas.BehavioralProfileListResponse, summary="List All Customer Behavioral Profiles")
def list_behavioral_profiles(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin_or_auditor)
):
    """
    Retrieves a paginated list of all generated Customer Behavioral Profiles.
    Requires admin or auditor privileges.
    """
    profiles = db.query(models.CustomerBehavioralProfile).order_by(
        models.CustomerBehavioralProfile.user_id
    ).offset(skip).limit(limit).all()
    return {"profiles": profiles}

@router.get("/profiles/{user_id}", response_model=schemas.CustomerBehavioralProfileResponse, summary="Get a Specific Customer's Behavioral Profile")
def get_behavioral_profile(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_admin_or_auditor)
):
    """
    Retrieves the aggregated behavioral profile for a specific user.
    Requires admin or auditor privileges.
    """
    profile = db.query(models.CustomerBehavioralProfile).filter(
        models.CustomerBehavioralProfile.user_id == user_id
    ).first()

    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Behavioral profile for user '{user_id}' not found. It may not have been generated yet.")
    
    return profile