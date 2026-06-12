import datetime
from typing import Dict, Any

class CanonicalGatewayProcessor:
    """
    MANAGES THE INGESTION AND HARMONIZATION PIPELINE
    Transforms any raw incoming structure into a clean canonical metadata structure.
    """
    def __init__(self, domain_scope: str):
        self.domain_scope = domain_scope
        
    def process_incoming_payload(self, raw_file_data: Dict[str, Any], mapping_manifest: Dict[str, Any]) -> Dict[str, Any]:
        """
        Maps raw input structures dynamically to Global Canonical targets via the schema blueprint.
        Removes hardcoded legacy properties.
        """
        harmonized_output = {
            "canonical_metadata": {
                "domain_scope": self.domain_scope,
                "ingestion_timestamp": str(datetime.datetime.utcnow()),
                "schema_version": mapping_manifest.get("manifest_version", "1.0.0")
            },
            "mapped_fields": {}
        }
        
        for target_canonical_field, source_coordinate in mapping_manifest.get("field_links", {}).items():
            extracted_value = raw_file_data.get(source_coordinate)
            if extracted_value is not None:
                harmonized_output["mapped_fields"][target_canonical_field] = extracted_value
                
        harmonized_output["domain_extensions"] = raw_file_data.get("lob_custom_extensions", {})
        return harmonized_output