from typing import Dict, Any, List
from decimal import Decimal, getcontext

# Use a secure evaluation library instead of native eval()
from simpleeval import simple_eval

class CalculationEngine:
    """
    CALCULATION ENGINE (CE) CORE RUNTIME ENGINE
    Pillar: Logic-as-Data. Executes mathematical formulas from the Formula Library.
    """
    def __init__(self, formula_library: Dict[str, Any]):
        # Set precision for Decimal calculations
        getcontext().prec = 28 
        self.formula_library = formula_library

    def execute_formula_by_token(self, token: str, runtime_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes a single formula from the library by its token code.
        """
        execution_logs = []
        target_field = "temp_result" # Default target if not specified

        try:
            formula_asset = self.formula_library.get(token)
            if not formula_asset:
                raise ValueError(f"Formula with token '{token}' not found in library.")

            target_field = formula_asset.target_output_field
            expression = formula_asset.mathematical_expression
            static_params = formula_asset.parameters or {}

            # Create the evaluation context, starting with static parameters.
            eval_context = {}
            if static_params:
                eval_context.update(static_params)
            
            # Update with runtime variables, safely converting to Decimal
            for k, v in runtime_context.items():
                if isinstance(v, (int, float, Decimal)):
                    eval_context[k] = Decimal(str(v))
                elif isinstance(v, str):
                    try:
                        eval_context[k] = Decimal(v)
                    except Exception:
                        eval_context[k] = v

            # Secure evaluation using a sandboxed interpreter
            result = simple_eval(expression, names=eval_context)
            runtime_context[target_field] = result
            execution_logs.append(f"Executed library formula '{formula_asset.business_name}'. Result stored to {target_field} = {result}")

        except Exception as e:
            execution_logs.append(f"[ERROR] Failed to execute calculation for token '{token}': {str(e)}")
            runtime_context[target_field] = 0.0 # Fail-safe

        return {"final_context": runtime_context, "logs": execution_logs}