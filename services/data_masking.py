import re
from typing import Dict, Any, List

class DataMaskingService:
    """
    A service to mask Personally Identifiable Information (PII) in data payloads.
    This aligns with Layer 6 (Governance & Compliance) of the architecture.
    """

    def mask_pii_data(self, context: Dict[str, Any], pii_fields: List[str]) -> Dict[str, Any]:
        """
        Takes a dictionary and a list of PII fields, and returns a new dictionary
        with the values of the PII fields masked. It does not modify the original dictionary.
        """
        masked_context = context.copy()
        for field in pii_fields:
            if field in masked_context and masked_context[field] is not None:
                masked_context[field] = self._mask_value(str(masked_context[field]))
        return masked_context

    def _mask_value(self, value: str) -> str:
        """
        Applies a simple masking rule to a single string value.
        - Shows the last 4 characters for values longer than 8 characters.
        - Shows the last 2 characters for values between 5 and 8 characters.
        - Fully masks values with 4 or fewer characters.
        """
        length = len(value)
        if length > 8:
            return f"{'*' * (length - 4)}{value[-4:]}"
        elif length > 4:
            return f"{'*' * (length - 2)}{value[-2:]}"
        else:
            return '*' * length