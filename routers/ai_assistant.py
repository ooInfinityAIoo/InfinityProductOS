from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
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

@router.post("/wireframe-to-screen", response_model=schemas.WireframeToScreenResponse, summary="Extract UI Components from a Wireframe Image")
def generate_screen_from_wireframe(
    payload: schemas.WireframeToScreenRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Accepts a base64 encoded image of a wireframe (e.g., from Figma, Excel, or a screenshot).
    Uses Vision AI to extract form fields and auto-map them to the ISO Field Registry.
    """
    ai_service = AIService()
    try:
        result = ai_service.generate_screen_from_wireframe(
            db=db,
            image_base64=payload.image_base64,
            mime_type=payload.image_mime_type,
            # extraction_mode from payload overrides EXTRACTION_MODE env var
            # Modes: IN_HOUSE_OCR (free, default) | ANTHROPIC_VISION | OPENAI_VISION
            extraction_mode=getattr(payload, 'extraction_mode', None)
        )
        if "message" not in result:
            mode = result.get("extraction_mode", "UNKNOWN")
            result["message"] = f"Successfully extracted {len(result.get('components', []))} components via {mode}."
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during vision extraction: {str(e)}")

@router.post("/auto-map-file", response_model=schemas.AutoMapFileResponse, summary="Auto-map File to ISO Registry")
async def auto_map_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Accepts a structured file (CSV, Excel) and uses AI to automatically infer the schema
    and map its columns to the ISO Field Registry.
    """
    ai_service = AIService()
    try:
        file_bytes = await file.read()
        result = ai_service.auto_map_file(db=db, file_bytes=file_bytes, filename=file.filename)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during auto-mapping: {str(e)}")

@router.post("/translate-field", response_model=schemas.TranslateFieldResponse, summary="Generate Multilingual Financial Translations")
def generate_field_translations(
    payload: schemas.TranslateFieldRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Accepts an English field name and uses AI to generate precise, financially-accurate 
    translations for major global locales. This populates the global dictionary aliases.
    """
    ai_service = AIService()
    try:
        translations = ai_service.generate_field_translations(business_name=payload.business_name, domain_category=payload.domain_category)
        return {"message": f"Successfully generated {len(translations)} localized aliases.", "translations": translations}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during translation: {str(e)}")

@router.post("/prompt-to-report", response_model=schemas.PromptToReportResponse, summary="Generate a Report Blueprint from a Natural Language Prompt")
def generate_report_from_prompt(
    payload: schemas.AICommandRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Accepts a natural language prompt and uses the AI Assistant to generate a complete
    JSON blueprint for a new Report Dashboard, mapping fields to the ISO Registry.
    """
    ai_service = AIService()
    try:
        result = ai_service.generate_report_from_prompt(db=db, prompt=payload.prompt, current_user=current_user)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during report generation: {str(e)}")

@router.post("/image-to-report", response_model=schemas.ImageToReportResponse, summary="Extract Report Layout from Image")
def generate_report_from_image_route(
    payload: schemas.ImageToReportRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_designer_privileges)
):
    """
    Accepts a base64 encoded image of a report mockup or PDF screenshot.
    Uses Vision AI to extract charts/metrics and auto-map them to the ISO Field Registry.
    """
    ai_service = AIService()
    try:
        result = ai_service.generate_report_from_image(db=db, image_base64=payload.image_base64, mime_type=payload.image_mime_type, current_user=current_user)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An unexpected error occurred during vision extraction: {str(e)}")