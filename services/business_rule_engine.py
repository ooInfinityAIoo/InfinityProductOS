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
    # E0 (TRANSACTION_SCREEN_DESIGN.md §7.2): distinct from BLOCK_PAYMENT / REJECT_STEP.
    # BLOCK/REJECT mean "the system stopped this" (red on tracker); CANCEL_TRANSACTION
    # means "a policy/rule chose to terminate this voluntarily" (purple on tracker).
    # Same halt semantics in the executor, different audit reason and different UI color.
    "CANCEL_TRANSACTION": "CANCEL_TRANSACTION",
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
    def __init__(self, rule_set_definition: Dict[str, Any], calculation_engine: Any,
                 sanctions_service: Any = None):
        """
        sanctions_service (optional): an object with screen_against_list(candidate, list_token)
        returning {"matched": bool, "list_exists": bool, "entry": dict|None, "reason": str|None}.
        When provided, IN_SANCTION_LIST / NOT_IN_SANCTION_LIST conditions are evaluated against
        a real list (Finding C1). When absent, the engine falls back to the legacy honest
        NotImplementedError so the trace shows the gap, not a silent pass.
        """
        self.name = rule_set_definition.get("business_name", "Unnamed Rule Set")
        self.rules = rule_set_definition.get("rules", [])
        self.calculation_engine = calculation_engine
        self.sanctions_service = sanctions_service
        # Trace of the latest evaluation pass (cleared per execute() call) — surfaces WHICH
        # entry matched so the workflow trace is auditable.
        self._screening_trace: List[str] = []

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

        # Sanctions-screening conditions have their own authoring shape
        # ({field, operator, list}) which _evaluate_condition handles directly. Do
        # NOT translate them into LHS/RHS — that would clobber the 'list' attribute.
        raw_op_check = (condition.get("operator") or "").upper()
        if raw_op_check in ("IN_SANCTION_LIST", "NOT_IN_SANCTION_LIST"):
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

        # Sanctions / list-screening operators (Finding C1):
        # Shape:  { field: "<ISO field path>", operator: "IN_SANCTION_LIST"|"NOT_IN_SANCTION_LIST",
        #           list: "OFAC_SDN" }
        # The candidate value comes from context[field]; the list comes from the SanctionsService.
        # If no service is wired (e.g. unit tests that don't supply one), fall back to the honest
        # NotImplementedError so a missed wiring is visible in the trace.
        if op in ("NOT_IN_SANCTION_LIST", "IN_SANCTION_LIST"):
            list_token = condition.get("list", "")
            field = condition.get("field")
            candidate = context.get(field) if field else None

            if self.sanctions_service is None:
                raise NotImplementedError(
                    f"Sanctions screening operator '{op}' against '{list_token or 'unknown list'}' "
                    f"requires a SanctionsService — none was provided to BusinessRuleEngine."
                )

            screen = self.sanctions_service.screen_against_list(candidate, list_token)

            # An unknown list token is a CONFIGURATION error — surface it loudly. Returning
            # False here would silently let a sanctioned payment through; raising fails closed.
            if not screen.get("list_exists"):
                raise ValueError(
                    f"Sanctions list '{list_token}' not found. "
                    f"Cannot evaluate '{op}' for field '{field}'."
                )

            matched = bool(screen.get("matched"))
            if matched:
                # Audit detail: which entry, why. Read by execute() into the run log.
                self._screening_trace.append(
                    f"Sanctions HIT — field '{field}' (value: '{candidate}') matched "
                    f"{screen.get('list_name') or list_token}: {screen.get('reason')}"
                )

            # IN_SANCTION_LIST → True when matched. NOT_IN_SANCTION_LIST → True when NOT matched.
            return matched if op == "IN_SANCTION_LIST" else (not matched)

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
        # Per-execute() screening trace. Sanctions hits append to this from
        # _evaluate_condition; flushed into execution_logs after each rule so the
        # workflow trace records WHICH entry matched (Finding C1 audit requirement).
        self._screening_trace = []

        for rule in sorted_rules:
            screening_trace_before = len(self._screening_trace)
            try:
                # Combine conditions via the rule's logical_operator (default AND).
                # WHY this is configurable: sanctions-screening is OR (a hit on EITHER
                # the name OR the BIC blocks); AML thresholds are AND (amount above
                # cap AND cross-border AND high-risk-country). Normalize each condition
                # first so studio-authored {field, operator, value} rules evaluate (Finding D).
                logical_op = (rule.get("logical_operator") or "AND").upper()
                conditions = rule.get("conditions", [])
                # Force list materialization so _screening_trace appends survive even when
                # short-circuiting (any/all stops on the first determining condition).
                evaluated = [
                    self._evaluate_condition(self._normalize_condition(c), runtime_context)
                    for c in conditions
                ]
                if logical_op == "OR":
                    conditions_met = bool(conditions) and any(evaluated)
                else:
                    conditions_met = bool(conditions) and all(evaluated)
                # Surface any sanctions hits this rule produced — even if AND-logic stopped
                # before the second condition fired — into the run log for audit.
                for hit in self._screening_trace[screening_trace_before:]:
                    execution_logs.append(f"  {hit}")

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
                        elif action_type == "CANCEL_TRANSACTION":
                            # Studio verb (E0 — TRANSACTION_SCREEN_DESIGN.md §7.2): policy-driven
                            # voluntary cancellation. Distinct from BLOCK/REJECT — those are
                            # validation/compliance failures (red on the tracker); cancellation
                            # is a deliberate "stop this" decision (purple on the tracker).
                            #
                            # The signal is set on context here; the workflow executor watches
                            # for _cancelled and persists a CANCELLED WorkflowExecutionInstance
                            # (wired in E0 commit 3). reason_code + message ride through so the
                            # operator sees WHY the rule cancelled, not just THAT it cancelled.
                            #
                            # If multiple rules fire CANCEL on the same context, the first one
                            # to set _cancelled wins for the reason/code; the rest are appended
                            # to _cancellations[] for audit.
                            reason_code = action.get("reason_code") or "RULE_CANCEL"
                            message = action.get("message") or "Transaction cancelled by business rule."
                            runtime_context.setdefault("_cancellations", []).append(
                                {"reason_code": reason_code, "message": message}
                            )
                            if not runtime_context.get("_cancelled"):
                                runtime_context["_cancelled"] = True
                                runtime_context["_cancel_reason_code"] = reason_code
                                runtime_context["_cancel_message"] = message
                            execution_logs.append(f"  Action: CANCEL_TRANSACTION — [{reason_code}] {message}")
                        else:
                            execution_logs.append(f"  [WARN] Unknown action type '{action_type}' — skipped.")
            except Exception as e:
                execution_logs.append(f"[ERROR] Failed to execute rule with priority {rule.get('priority')}: {str(e)}")

        return any_rule_triggered, runtime_context, execution_logs