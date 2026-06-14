from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from typing import Dict, Any
import schemas
from database import get_db
from services.ai_services import AIService
from auth import get_current_user, require_designer_privileges, CurrentUser

router = APIRouter(
    prefix="/api/v1/assistant",
    tags=["AI Assistant"]
)

@router.post("/execute-command", response_model=schemas.AICommandResponse, summary="Execute a Natural Language Command")
def execute_ai_command(
    payload: schemas.AICommandRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Accepts a natural language command and uses the AI Assistant to parse the intent
    and execute the corresponding action by calling the appropriate system APIs.
    """
    ai_service = AIService()
    try:
        result = ai_service.parse_and_execute_command(db=db, prompt=payload.prompt, current_user=current_user)
        return result
    except ValueError as e:
        # ValueErrors are used for clarification requests or parsing failures
        return {
            "status": "REQUIRES_CLARIFICATION",
            "message": str(e),
            "executed_action": None,
            "details": None
        }
    except Exception as e:
        # Other exceptions are treated as internal errors
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred: {str(e)}")

@router.post("/prompt-to-insight", response_model=Dict[str, Any], summary="Generate an Insight Blueprint from a Natural Language Prompt")
def generate_insight_from_prompt(
    payload: schemas.AICommandRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Accepts a natural language command and uses the AI Assistant to generate a complete
    JSON blueprint for a new Insight, ready to be saved in the Insights Factory.
    """
    ai_service = AIService()
    try:
        result = ai_service.generate_insight_from_prompt(db=db, prompt=payload.prompt, current_user=current_user)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred: {str(e)}")

@router.post("/prompt-to-rule", response_model=schemas.PromptToRuleResponse, summary="Generate a Business Rule from a Natural Language Prompt")
def generate_rule_from_prompt(
    payload: schemas.PromptToRuleRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Accepts a natural language prompt and generates a reusable Business Rule Set asset.
    It also suggests the corresponding workflow node and conditional edge to implement the rule's action.
    """
    ai_service = AIService()
    try:
        result = ai_service.generate_rule_from_prompt(db=db, prompt=payload.prompt, current_user=current_user)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during rule generation: {str(e)}")