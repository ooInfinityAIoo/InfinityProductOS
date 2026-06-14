from typing import Dict, Any, List

class BusinessRuleEngine:
    """
    BUSINESS RULE ENGINE (BRE) CORE RUNTIME ENGINE
    Pillar: Logic-as-Data. Evaluates complex IF-THEN conditional logic.
    """
    def __init__(self, rule_set_definition: Dict[str, Any], calculation_engine: Any):
        self.name = rule_set_definition.get("business_name", "Unnamed Rule Set")
        self.rules = rule_set_definition.get("rules", [])
        self.calculation_engine = calculation_engine

    def _resolve_operand(self, operand: Dict[str, Any], context: Dict[str, Any]) -> float:
        """
        Resolves an operand, which can be a single field or an arithmetic combination of fields.
        """
        source_fields = operand.get("source_fields", [])
        op = operand.get("arithmetic_operation")
        static_value = operand.get("static_value")

        if static_value is not None:
            # Allow static value to be a list for IN/NOT_IN checks
            if isinstance(static_value, list):
                return static_value
            else:
                return float(static_value)
        
        source_values = [float(context.get(field, 0.0)) for field in source_fields]
        if not source_values:
            raise ValueError("Operand has no source fields.")

        if not op:
            return source_values[0]

        if op == "ADD":
            return sum(source_values)
        elif op == "SUBTRACT":
            return source_values[0] - sum(source_values[1:])
        elif op == "MULTIPLY":
            result = 1
            for val in source_values: result *= val
            return result
        elif op == "DIVIDE":
            if len(source_values) != 2: raise ValueError("Division requires exactly two source fields.")
            if source_values[1] == 0: raise ZeroDivisionError("Division by zero.")
            return source_values[0] / source_values[1]
        
        raise ValueError(f"Unsupported arithmetic operation: {op}")

    def _evaluate_condition(self, condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
        """
        Evaluates a single IF condition.
        """
        lhs_val = self._resolve_operand(condition.get("left_hand_side", {}), context)
        rhs_val = self._resolve_operand(condition.get("right_hand_side", {}), context)
        op = condition.get("operator")

        if op == "EQUAL_TO": return lhs_val == rhs_val
        if op == "NOT_EQUAL_TO": return lhs_val != rhs_val
        if op == "GREATER_THAN": return lhs_val > rhs_val
        if op == "LESS_THAN": return lhs_val < rhs_val
        if op == "GREATER_THAN_OR_EQUAL_TO": return lhs_val >= rhs_val
        if op == "LESS_THAN_OR_EQUAL_TO": return lhs_val <= rhs_val
        if op == "IN":
            # Expects RHS to be a list and LHS to be a single value
            return lhs_val in rhs_val
        if op == "NOT_IN":
            # Expects RHS to be a list and LHS to be a single value
            return lhs_val not in rhs_val
        
        return False

    def execute(self, runtime_context: Dict[str, Any]) -> (bool, Dict[str, Any], List[str]):
        """
        Executes the entire rule set against the runtime context.
        Returns a tuple: (any_rule_triggered, final_context, logs)
        """
        execution_logs = []
        any_rule_triggered = False
        sorted_rules = sorted(self.rules, key=lambda r: r.get('priority', 100))

        for rule in sorted_rules:
            try:
                # All conditions in a rule must be true (AND logic)
                conditions_met = all(self._evaluate_condition(cond, runtime_context) for cond in rule.get("conditions", []))

                if conditions_met:
                    any_rule_triggered = True
                    execution_logs.append(f"Rule with priority {rule.get('priority')} met. Executing actions.")
                    for action in rule.get("actions", []):
                        action_type = action.get("action_type")
                        if action_type == "SET_VALUE":
                            target_field = action.get("target_field")
                            value = action.get("value")
                            runtime_context[target_field] = value
                            execution_logs.append(f"  Action: Set {target_field} to {value}.")
                        elif action_type == "EXECUTE_CALCULATION":
                            calc_token = action.get("calculation_token")
                            if not self.calculation_engine:
                                execution_logs.append(f"[ERROR] Cannot execute calculation '{calc_token}'. CalculationEngine not provided to BRE.")
                                continue
                            # Use the passed-in CalculationEngine to run the library formula
                            calc_result = self.calculation_engine.execute_formula_by_token(calc_token, runtime_context)
                            runtime_context = calc_result["final_context"]
                            execution_logs.extend(calc_result["logs"])
            except Exception as e:
                execution_logs.append(f"[ERROR] Failed to execute rule with priority {rule.get('priority')}: {str(e)}")

        return any_rule_triggered, runtime_context, execution_logs