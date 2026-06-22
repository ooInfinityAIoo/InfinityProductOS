from typing import Dict, Any, List

# WHY THIS MAP EXISTS (Finding D adapter):
# The Business Rules studio and this engine were built to two different operator
# vocabularies. The studio writes short names (GREATER_THAN, EQUALS, GTE...) onto
# the condition; the engine's _evaluate_condition() matches the long canonical names
# (GREATER_THAN_OR_EQUAL_TO etc.). This normalizes the studio's names — and a few
# common shorthands — to the canonical set so an authored rule evaluates instead of
# silently returning False on an unrecognized operator.
_OPERATOR_ALIASES = {
    "EQUALS": "EQUAL_TO", "EQUAL": "EQUAL_TO", "==": "EQUAL_TO",
    "NOT_EQUALS": "NOT_EQUAL_TO", "NOT_EQUAL": "NOT_EQUAL_TO", "!=": "NOT_EQUAL_TO",
    "GREATER_THAN": "GREATER_THAN", ">": "GREATER_THAN",
    "LESS_THAN": "LESS_THAN", "<": "LESS_THAN",
    "GREATER_THAN_OR_EQUAL": "GREATER_THAN_OR_EQUAL_TO", "GTE": "GREATER_THAN_OR_EQUAL_TO", ">=": "GREATER_THAN_OR_EQUAL_TO",
    "LESS_THAN_OR_EQUAL": "LESS_THAN_OR_EQUAL_TO", "LTE": "LESS_THAN_OR_EQUAL_TO", "<=": "LESS_THAN_OR_EQUAL_TO",
}

# Studio action `type` -> engine `action_type`. Identity for names the engine already
# knows; FLAG_FOR_REVIEW / EMIT_EVENT are the studio's authoring verbs (see Finding D).
_ACTION_TYPE_ALIASES = {
    "SET_VALUE": "SET_VALUE",
    "EXECUTE_CALCULATION": "EXECUTE_CALCULATION",
    "FLAG_FOR_REVIEW": "FLAG_FOR_REVIEW",
    "EMIT_EVENT": "EMIT_EVENT",
}


class BusinessRuleEngine:
    """
    BUSINESS RULE ENGINE (BRE) CORE RUNTIME ENGINE
    Pillar: Logic-as-Data. Evaluates complex IF-THEN conditional logic.

    Accepts two condition/action authoring shapes (see Finding D in
    INTEGRATION_AUDIT_FINDINGS.md):
      - the studio shape:  condition {field, operator, value};
                           action {type, message/event_code}
      - the engine shape:  condition {left_hand_side, right_hand_side, operator};
                           action {action_type, ...}
    _normalize_condition / _normalize_action translate the studio shape into the
    engine shape at evaluation time, so rules authored in the studio actually fire.
    """
    def __init__(self, rule_set_definition: Dict[str, Any], calculation_engine: Any):
        self.name = rule_set_definition.get("business_name", "Unnamed Rule Set")
        self.rules = rule_set_definition.get("rules", [])
        self.calculation_engine = calculation_engine

    def _normalize_condition(self, condition: Dict[str, Any]) -> Dict[str, Any]:
        """
        WHY THIS EXISTS: makes the engine accept the studio's authored condition shape
        {field, operator, value} by translating it into the engine's internal
        {left_hand_side, right_hand_side, operator} shape. Before this, a studio-authored
        condition resolved both operands to empty and raised 'Operand has no source
        fields.' — so no studio rule could evaluate (Finding D, Critical).

        WHAT BREAKS IF REMOVED: every rule authored in the Business Rules studio throws
        at runtime and the workflow executor logs a rule failure instead of a decision.
        """
        # Already in engine shape — pass through untouched.
        if "left_hand_side" in condition or "right_hand_side" in condition:
            return condition

        # Studio shape: {field, operator, value}. Build operands the engine understands.
        field = condition.get("field")
        if field is None:
            return condition  # nothing we can do; let the engine handle/raise as before

        value = condition.get("value")
        raw_op = (condition.get("operator") or "").upper()
        return {
            "left_hand_side": {"source_fields": [field]},
            # A list value (IN / NOT_IN) or scalar both ride on static_value; _resolve_operand
            # already returns lists as-is and casts scalars to float.
            "right_hand_side": {"static_value": value},
            "operator": _OPERATOR_ALIASES.get(raw_op, raw_op),
        }

    def _normalize_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """
        WHY THIS EXISTS: the studio authors actions as {type, message/event_code} while
        the engine dispatches on action_type. Without this, a rule could pass its
        conditions but its actions were silently skipped (action_type was None). This
        maps the studio's `type` to `action_type` so FLAG_FOR_REVIEW / EMIT_EVENT
        actually take effect.
        """
        if "action_type" in action:
            return action
        raw_type = action.get("type")
        if raw_type is None:
            return action
        return {**action, "action_type": _ACTION_TYPE_ALIASES.get(raw_type, raw_type)}

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
        op = condition.get("operator")

        # Sanctions/list-screening operators (NOT_IN_SANCTION_LIST, IN_SANCTION_LIST) are a
        # distinct capability: they screen a string name/BIC against a named external list
        # (e.g. OFAC_SDN). The numeric comparison engine does not implement them and no list
        # data is loaded. Raise an HONEST, specific error (instead of the cryptic "Operand
        # has no source fields") so the workflow trace makes the gap obvious and a real
        # sanctions-screening integration can be slotted in later. Tracked as Finding C1.
        if op in ("NOT_IN_SANCTION_LIST", "IN_SANCTION_LIST"):
            list_name = condition.get("list", "the configured sanctions list")
            raise NotImplementedError(
                f"Sanctions screening operator '{op}' against '{list_name}' is not implemented "
                f"(no sanctions-list data loaded). Manual screening required."
            )

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
                # All conditions in a rule must be true (AND logic).
                # Normalize each condition first so studio-authored {field,operator,value}
                # rules evaluate instead of raising (Finding D).
                conditions_met = all(
                    self._evaluate_condition(self._normalize_condition(cond), runtime_context)
                    for cond in rule.get("conditions", [])
                )

                if conditions_met:
                    any_rule_triggered = True
                    execution_logs.append(f"Rule with priority {rule.get('priority')} met. Executing actions.")
                    for raw_action in rule.get("actions", []):
                        action = self._normalize_action(raw_action)
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
                        elif action_type == "FLAG_FOR_REVIEW":
                            # Studio verb: record the flag on the context so the workflow
                            # executor / governance can see the rule's decision. Accumulates
                            # in a list so multiple rules can each contribute a flag.
                            message = action.get("message") or "Flagged for review."
                            runtime_context.setdefault("_review_flags", []).append(message)
                            execution_logs.append(f"  Action: FLAG_FOR_REVIEW — {message}")
                        elif action_type == "EMIT_EVENT":
                            # Studio verb: record the event code. Actual broadcast is owned
                            # by the workflow executor's EVENT step; here we surface intent.
                            event_code = action.get("event_code") or action.get("event_type")
                            runtime_context.setdefault("_emitted_events", []).append(event_code)
                            execution_logs.append(f"  Action: EMIT_EVENT — {event_code}")
                        elif action_type in ("BLOCK_PAYMENT", "REJECT_STEP"):
                            # Hard-stop verbs: a compliance/validation rule has decided the
                            # transaction must not proceed. Record a block decision on the
                            # context so the workflow executor can halt/route accordingly.
                            message = action.get("message") or f"{action_type} triggered by rule."
                            runtime_context.setdefault("_blocks", []).append({"type": action_type, "message": message})
                            runtime_context["_blocked"] = True
                            execution_logs.append(f"  Action: {action_type} — {message}")
                        else:
                            execution_logs.append(f"  [WARN] Unknown action type '{action_type}' — skipped.")
            except Exception as e:
                execution_logs.append(f"[ERROR] Failed to execute rule with priority {rule.get('priority')}: {str(e)}")

        return any_rule_triggered, runtime_context, execution_logs