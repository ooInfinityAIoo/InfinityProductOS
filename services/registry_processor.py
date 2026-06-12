import datetime
import uuid
from typing import Dict, Any
from database import SessionLocal
from models import ISOFieldDefinition

class CanonicalGatewayProcessor:
    """
    Infrastructure Layer 3 Gateway:
    Handles serialization and ingestion parsing for incoming multi-format line files.
    """
    @staticmethod
    def parse_raw_ingestion(raw_file_data: Dict[str, Any]) -> Dict[str, Any]:
        harmonized_output = {}
        harmonized_output["domain_extensions"] = raw_file_data.get("lob_custom_extensions", {})
        return harmonized_output

async def process_field_mint(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Processes incoming FIELD_ASSET_MINT events to securely map dynamic canvas attributes
    to the master database schema, ensuring core code remains unaltered.
    """
    db = SessionLocal()
    try:
        # Dynamically map the payload attributes, aligning with UI keys and fallback defaults
        technical_sys_name = payload.get("technical_sys_name") or payload.get("id", f"FIELD-{str(uuid.uuid4())[:8]}")
        preferred_business_name = payload.get("preferred_business_name") or payload.get("label", "Unknown Field Label")
        iso_business_name = payload.get("iso_business_name") or payload.get("mapping", "Custom.Mapping")
        data_type = payload.get("data_type") or payload.get("type", "Text")
                
        domain_category = payload.get("domain_category", "GENERAL")
        subdomain_category = payload.get("subdomain_category", "CUSTOM")
        description = payload.get("description", "Minted via UI Canvas Layer")
        is_mandatory = bool(payload.get("is_mandatory") or payload.get("isMandat", False))
        default_value = payload.get("default_value")
                
        # Unique identifier ensuring decoupling of logic from ID generation
        field_id = f"FIELD-{domain_category[:4].upper()}-{str(uuid.uuid4())[:6].upper()}"
                
        new_asset = ISOFieldDefinition(
            field_id=field_id,
            technical_sys_name=technical_sys_name,
            preferred_business_name=preferred_business_name,
            iso_business_name=iso_business_name,
            data_type=data_type,
            domain_category=domain_category,
            subdomain_category=subdomain_category,
            description=description,
            is_mandatory=is_mandatory,
            default_value=default_value,
            created_at=str(datetime.datetime.utcnow()),
            created_by="CANVAS_UI_OPERATOR"
        )
                
        db.add(new_asset)
        db.commit()
        db.refresh(new_asset)
                
        return {
            "field_id": new_asset.field_id,
            "technical_sys_name": new_asset.technical_sys_name,
            "preferred_business_name": new_asset.preferred_business_name,
            "status": "ASSET_SECURELY_MINTED"
        }
    except Exception as e:
        db.rollback()
        raise ValueError(f"Failed to securely mint field asset: {str(e)}")
    finally:
        db.close()