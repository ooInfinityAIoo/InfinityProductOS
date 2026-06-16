from typing import Dict, Any
from sqlalchemy.orm import Session
import models

class AssetCache:
    """
    LAYER 4: CENTRALIZED ASSET CACHE
    Pre-loads execution blueprints (Rules, Formulas, APIs, PII definitions) into memory
    dictionaries for high-speed, O(1) lookups during orchestration.
    """
    def __init__(self, db: Session):
        self.api_configs_by_id = {a.api_id: a for a in db.query(models.ApiConfiguration).all()}
        self.formulas_by_token_code = {f.token_code: f for f in db.query(models.SymbolicFormulaAsset).all()}
        self.composite_formulas_by_token_code = {c.token_code: c for c in db.query(models.CompositeFormulaBlueprint).all()}
        self.rule_sets_by_token_code = {rs.token_code: rs for rs in db.query(models.BusinessRuleSet).all()}
        self.recon_templates_by_id = {r.reconciliation_template_id: r for r in db.query(models.ReconciliationTemplate).all()}
        
        # Pre-load PII fields for Layer 6 data masking
        pii_fields_from_db = db.query(
            models.ISOFieldDefinition.technical_sys_name,
            models.ISOFieldDefinition.data_type,
            models.ISOFieldDefinition.masking_strategy
        ).filter(models.ISOFieldDefinition.is_pii == True).all()
        
        self.pii_field_properties = {
            item.technical_sys_name: {
                "data_type": item.data_type,
                "masking_strategy": item.masking_strategy
            } for item in pii_fields_from_db
        }