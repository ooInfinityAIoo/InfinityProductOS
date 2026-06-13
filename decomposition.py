import re
from typing import Dict, Any, List
from pydantic import BaseModel


class DecompositionRequest(BaseModel):
    legacy_source_type: str  # PYTHON, EXCEL, PLAIN_TEXT
    raw_script_block: str
    target_domain: str


class DecomposedRuleOutput(BaseModel):
    rule_id: str
    condition_variable: str
    operator: str
    threshold_value: float
    consequent_action: str


class DecomposedManifest(BaseModel):
    status: str
    extracted_domain: str
    isolated_rules: List[DecomposedRuleOutput]
    mathematical_expressions: List[Dict[str, Any]]


class RulesDecompositionEngine:
    """
    Layer 2: Agentic Rules & Formulas Decomposition Module.
    Breaks down legacy code blocks into standardized JSON manifests.
    """

    @staticmethod
    def decompose_raw_logic(script: str, source_type: str) -> List[DecomposedRuleOutput]:
        decomposed_rules: List[DecomposedRuleOutput] = []
        lines = script.splitlines()
        rule_counter = 1

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Regex pattern to capture standard logic states: if variable > value: action
            if line.startswith("if ") or " if " in line:
                match = re.search(r"(\w+)\s*([><=]+)\s*([\d\.]+)", line)
                if match:
                    var, op, val = match.groups()

                    action = "FLAG_VARIANCE"
                    lowered = line.lower()
                    if "halt" in lowered or "raise" in lowered:
                        action = "HALTED_IN_GOVERNANCE"
                    elif "split" in lowered:
                        action = "PERCENTAGE_SPLIT"

                    decomposed_rules.append(DecomposedRuleOutput(
                        rule_id=f"RULE-DEC-{rule_counter:03d}",
                        condition_variable=var,
                        operator=op,
                        threshold_value=float(val),
                        consequent_action=action,
                    ))
                    rule_counter += 1

        return decomposed_rules

    @staticmethod
    def extract_mathematical_formulas(script: str) -> List[Dict[str, Any]]:
        expressions: List[Dict[str, Any]] = []
        matches = re.findall(r"(\w+)\s*=\s*(\w+)\s*([\*\/\+\-])\s*([\d\.]+)", script)
        for target, source, op, param in matches:
            if op == "*":
                operation_type = "PERCENTAGE_SPLIT"
            elif op == "/":
                operation_type = "DIVISION"
            elif op == "+":
                operation_type = "ADDITION"
            elif op == "-":
                operation_type = "SUBTRACTION"
            else:
                operation_type = "UNKNOWN_MATH"

            expressions.append({
                "target_field": target,
                "source_field": source,
                "operation": operation_type,
                "parameter": float(param),
            })

        return expressions


# Initialize the global Layer 2 Module Engine
decomposition_processor = RulesDecompositionEngine()
