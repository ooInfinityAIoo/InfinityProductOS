import re
from typing import Dict, Any, Optional

class DataMaskingService:
    """
    A service to mask Personally Identifiable Information (PII) in data payloads.
    This aligns with Layer 6 (Governance & Compliance) of the architecture.
    """

    def mask_pii_data(self, context: Dict[str, Any], pii_field_properties: Dict[str, Dict[str, str]]) -> Dict[str, Any]:
        """
        Takes a dictionary and a map of PII fields to their properties (data_type, masking_strategy),
        with the values of the PII fields masked. It does not modify the original dictionary.
        """
        masked_context = context.copy()
        for field, properties in pii_field_properties.items():
            if field in masked_context and masked_context[field] is not None:
                masked_context[field] = self._mask_value(
                    str(masked_context[field]),
                    properties.get("data_type"),
                    properties.get("masking_strategy")
                )
        return masked_context

    def _mask_default(self, value: str) -> str:
        """
        Applies a default masking rule to a string value, partially showing the end.
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

    def _mask_value(self, value: str, data_type: str, strategy: Optional[str] = None) -> str:
        """
        Applies a masking rule based on an explicit strategy, falling back to data_type.
        """
        strategy_lower = strategy.lower() if strategy else None

        # --- Strategy-based masking (priority 1) ---
        if strategy_lower == 'redact_all':
            return '*' * len(value)
        
        if strategy_lower in ['show_last_4', 'phone']:
            if len(value) > 4:
                return f"{'*' * (len(value) - 4)}{value[-4:]}"
            else:
                return '*' * len(value)

        if strategy_lower == 'email':
            try:
                user, domain = value.split('@')
                if len(user) > 1:
                    return f"{user[0]}{'*' * (len(user) - 1)}@{domain}"
                else:
                    return f"*@{domain}"
            except ValueError:
                return self._mask_default(value) # Fallback if not a valid email format

        # --- Data-type-based masking (priority 2, if no strategy matched) ---
        data_type_lower = data_type.lower() if data_type else ''

        if data_type_lower == 'date':
            # Masks a date like '2024-06-13' to '2024-**-**'
            if len(value) >= 10:
                return f"{value[:5]}**-**"
            else:
                return "****-**-**"  # Fallback for unexpected date format
        
        elif data_type_lower in ['amount', 'decimal']:
            # Masks a number like '12345.67' to '*******.67', preserving decimals
            try:
                float(value)  # Validate it's a number
                parts = value.split('.')
                if len(parts) == 2:
                    return f"{'*' * len(parts[0])}.{parts[1]}"
                else:
                    return '*' * len(value)
            except (ValueError, TypeError):
                # If it's not a valid number, use the default text masking
                return self._mask_default(value)
        
        elif data_type_lower == 'email':
            try:
                user, domain = value.split('@')
                if len(user) > 1:
                    return f"{user[0]}{'*' * (len(user) - 1)}@{domain}"
                else:
                    return f"*@{domain}"
            except ValueError:
                return self._mask_default(value)
        
        # --- Default masking (lowest priority) ---
        return self._mask_default(value)