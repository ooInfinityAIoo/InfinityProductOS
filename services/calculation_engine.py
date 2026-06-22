# WHY THIS FILE EXISTS:
# The Calculation Program Execution Engine. Executes sequential, stateful computation
# programs stored as JSONB in the calculation_programs table.
#
# This is the replacement for Python scripts, MS Access macros, and UDTs that analytics
# teams currently maintain as black boxes. The engine reads a program's steps[] and
# inputs[] from the DB, resolves all variable sources, then executes steps in order,
# accumulating state in a namespace dict. Later steps can reference earlier results by name.
#
# ADR #7 compliance (non-negotiable):
#   - All numeric values cast to decimal.Decimal before evaluation — never native float
#   - simpleeval used for all expression evaluation — never raw eval()
#   - Function library registered explicitly — no arbitrary code execution
#
# Day count conventions: legally mandated in financial contracts. Wrong convention =
# incorrect calculation. Supported: ACT_360, ACT_365, 30_360, 30E_360, ACT_ACT.

import math
from decimal import Decimal, getcontext
from typing import Any, Dict, List, Optional, Tuple

from simpleeval import simple_eval

# 28-digit precision satisfies Basel III / IFRS 9 regulatory rounding requirements
getcontext().prec = 28


# ---------------------------------------------------------------------------
# Safe function library — registered with simpleeval so expressions can call
# these without enabling arbitrary Python execution (ADR #7).
# ---------------------------------------------------------------------------

def _safe_min(*args):
    return min(args)

def _safe_max(*args):
    return max(args)

def _safe_if(condition, true_val, false_val):
    # WHY: Excel-style IF() so analytics users who come from Excel find expressions natural.
    return true_val if condition else false_val

def _safe_abs(x):
    return abs(x)

def _safe_round(x, digits=2):
    return round(Decimal(str(x)), int(digits))

def _safe_floor(x):
    return Decimal(str(math.floor(float(x))))

def _safe_ceil(x):
    return Decimal(str(math.ceil(float(x))))

def _safe_power(base, exp):
    return Decimal(str(float(base) ** float(exp)))

def _safe_log(x, base=math.e):
    return Decimal(str(math.log(float(x), float(base))))

def _safe_norm_cdf(x):
    # WHY: Normal CDF is required for Black-Scholes options pricing and credit risk
    # PD (Probability of Default) calculations under Merton/KMV models.
    return Decimal(str(0.5 * (1 + math.erf(float(x) / math.sqrt(2)))))

FUNCTION_LIBRARY = {
    "MIN": _safe_min,
    "MAX": _safe_max,
    "IF": _safe_if,
    "ABS": _safe_abs,
    "ROUND": _safe_round,
    "FLOOR": _safe_floor,
    "CEIL": _safe_ceil,
    "POWER": _safe_power,
    "LOG": _safe_log,
    "NORM_CDF": _safe_norm_cdf,
}


# ---------------------------------------------------------------------------
# Day count convention resolver
# ---------------------------------------------------------------------------

def _day_count_30_360(start, end):
    d1, m1, y1 = start.day, start.month, start.year
    d2, m2, y2 = end.day, end.month, end.year
    if d1 == 31:
        d1 = 30
    if d2 == 31 and d1 == 30:
        d2 = 30
    return Decimal(360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1)) / Decimal("360")

def _day_count_30e_360(start, end):
    d1, m1, y1 = min(start.day, 30), start.month, start.year
    d2, m2, y2 = min(end.day, 30), end.month, end.year
    return Decimal(360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1)) / Decimal("360")

def _actual_year_days(start, end):
    import calendar
    return 366 if calendar.isleap(start.year) or calendar.isleap(end.year) else 365

DAY_COUNT_CONVENTIONS = {
    # US money market (T-Bills, commercial paper, FX swaps)
    "ACT_360": lambda start, end: (end - start).days / Decimal("360"),
    # UK gilt and sterling markets
    "ACT_365": lambda start, end: (end - start).days / Decimal("365"),
    # US corporate bonds (NASD convention)
    "30_360": _day_count_30_360,
    # Eurobond / EU convention
    "30E_360": _day_count_30e_360,
    # US Treasury and sovereign debt
    "ACT_ACT": lambda start, end: (end - start).days / Decimal(str(_actual_year_days(start, end))),
}


# ---------------------------------------------------------------------------
# Core utilities
# ---------------------------------------------------------------------------

def _to_decimal(v: Any) -> Any:
    """Cast numeric values to Decimal. Non-numeric values pass through unchanged."""
    # bool is a subclass of int, but True/False are flags, not money. Without this guard
    # _to_decimal(True) -> Decimal(str(True)) -> Decimal('True') raises ConversionSyntax,
    # which broke any calculation run after a rule put a boolean flag (e.g. _blocked) into
    # the shared runtime context.
    if isinstance(v, bool):
        return v
    if isinstance(v, Decimal):
        return v
    if isinstance(v, (int, float)):
        return Decimal(str(v))
    if isinstance(v, str):
        try:
            return Decimal(v)
        except Exception:
            return v
    return v


# ---------------------------------------------------------------------------
# Core executor
# ---------------------------------------------------------------------------

def execute_program(
    steps: List[Dict],
    inputs: List[Dict],
    runtime_values: Dict[str, Any],
) -> Tuple[List[Dict], Dict[str, Any], Optional[str]]:
    """
    WHY THIS EXISTS: Core sequential execution engine. Builds an initial namespace
    from the program's declared inputs[], then executes each step in seq order,
    accumulating results so later steps can reference earlier ones by var_name.

    Returns: (step_results, outputs, error_message)
    - step_results: per-step execution trace
    - outputs: dict of only is_output=true results keyed by output_token
    - error_message: None on full success, first error string encountered
    """
    # Build initial namespace from declared inputs
    namespace: Dict[str, Any] = {}

    for inp in inputs:
        name = inp.get("name", "")
        source_type = inp.get("source_type", "RUNTIME_INPUT")
        value = None

        if source_type == "POLICY_CONSTANT":
            value = inp.get("value")
        elif source_type in ("RUNTIME_INPUT", "ISO_FIELD", "RATE_FEED", "FORMULA_TOKEN"):
            value = runtime_values.get(name)
        elif source_type == "DAY_COUNT":
            # Day count fraction requires start/end dates in runtime_values
            convention = inp.get("convention", "ACT_360")
            from datetime import date
            raw_start = runtime_values.get(f"{name}_START") or runtime_values.get("start_date")
            raw_end = runtime_values.get(f"{name}_END") or runtime_values.get("end_date")
            if raw_start and raw_end:
                if isinstance(raw_start, str):
                    raw_start = date.fromisoformat(raw_start)
                if isinstance(raw_end, str):
                    raw_end = date.fromisoformat(raw_end)
                resolver = DAY_COUNT_CONVENTIONS.get(convention, DAY_COUNT_CONVENTIONS["ACT_360"])
                value = resolver(raw_start, raw_end)

        # Default missing inputs to zero rather than crashing the whole run
        namespace[name] = _to_decimal(value) if value is not None else Decimal("0")

    # Execute steps in declared sequence
    step_results = []
    outputs: Dict[str, Any] = {}
    error_message = None

    for step in sorted(steps, key=lambda s: s.get("seq", 0)):
        seq = step.get("seq", 0)
        var_name = step.get("var_name", f"_step{seq}")
        expression = step.get("expression", "0")
        is_output = step.get("is_output", False)
        output_token = step.get("output_token")

        try:
            # WHY simpleeval instead of eval(): ADR #7 — sandboxes to math operations only.
            result = simple_eval(expression, names=namespace, functions=FUNCTION_LIBRARY)
            # ADR #7: cast result to Decimal to prevent float accumulation errors in
            # multi-step programs (e.g., 100-step CLO waterfall with compounding).
            result = _to_decimal(result)
        except Exception as exc:
            if error_message is None:
                error_message = f"Step {seq} ({var_name}): {exc}"
            result = Decimal("0")

        # Accumulate into namespace so subsequent steps can reference this result by name
        namespace[var_name] = result

        step_results.append({
            "seq": seq,
            "var_name": var_name,
            "expression": expression,
            "result": result,
            "is_output": is_output,
            "output_token": output_token,
        })

        if is_output and output_token:
            outputs[output_token] = result

    return step_results, outputs, error_message


# ---------------------------------------------------------------------------
# Batch execution (synchronous MVP — Celery async is Phase 2)
# ---------------------------------------------------------------------------

def execute_program_batch(
    steps: List[Dict],
    inputs: List[Dict],
    records: List[Dict[str, Any]],
) -> Dict:
    """
    WHY THIS EXISTS: Runs the same Calculation Program against N records (e.g. 50,000
    collateral records in a structured finance waterfall). Each record provides its own
    runtime_values; the program's inputs[] and steps[] are shared across all records.

    Phase 2 will move this to a Celery task for true async execution with progress
    tracking. For MVP, the caller is responsible for chunking large datasets before
    calling this function.
    """
    per_record_results = []
    output_totals: Dict[str, Decimal] = {}
    exceptions = []

    for idx, record in enumerate(records):
        step_results, outputs, error = execute_program(steps, inputs, record)

        if error:
            exceptions.append({"record_index": idx, "error": error})

        per_record_results.append({
            "record_index": idx,
            "outputs": {k: float(v) for k, v in outputs.items()},
            "error": error,
        })

        for token, value in outputs.items():
            output_totals[token] = output_totals.get(token, Decimal("0")) + value

    return {
        "total_records": len(records),
        "successful_records": len(records) - len(exceptions),
        "exception_count": len(exceptions),
        "per_record_results": per_record_results,
        "output_totals": {k: float(v) for k, v in output_totals.items()},
        "exceptions": exceptions,
    }


# ---------------------------------------------------------------------------
# Legacy single-formula executor — kept for backward compatibility with
# WorkflowExecutor nodes that still reference SymbolicFormulaAsset token codes.
# New code should use execute_program() directly.
# ---------------------------------------------------------------------------

class CalculationEngine:
    """Legacy engine. WorkflowExecutor uses this for CALCULATION step_type nodes."""

    def __init__(self, formula_library: Dict[str, Any]):
        getcontext().prec = 28
        self.formula_library = formula_library

    def execute_formula_by_token(self, token: str, runtime_context: Dict[str, Any]) -> Dict[str, Any]:
        execution_logs = []
        target_field = "temp_result"

        try:
            formula_asset = self.formula_library.get(token)
            if not formula_asset:
                raise ValueError(f"Formula with token '{token}' not found in library.")

            target_field = formula_asset.target_output_field
            expression = formula_asset.mathematical_expression
            param_specs = formula_asset.parameters or []

            eval_context = {}
            # WHY: `parameters` is a LIST of descriptors [{name, iso_field, type}], NOT a
            # name->value dict. The expression references the short `name`s
            # (e.g. ATMAccountStatement2_Amount), each of which is sourced from its mapped
            # `iso_field` in the runtime context. Previously this did
            # eval_context.update(param_specs) — calling dict.update() on a list of 3-key
            # dicts, which raised "dictionary update sequence element #0 has length 3;
            # 2 is required" and meant the formula variables were never bound at all.
            if isinstance(param_specs, dict):
                # Legacy/simple shape: already a name->value mapping.
                for k, v in param_specs.items():
                    eval_context[k] = _to_decimal(v) if isinstance(v, (int, float, Decimal, str)) else v
            elif isinstance(param_specs, list):
                for spec in param_specs:
                    if not isinstance(spec, dict) or not spec.get("name"):
                        continue
                    iso_field = spec.get("iso_field")
                    val = runtime_context.get(iso_field) if iso_field else spec.get("value")
                    eval_context[spec["name"]] = _to_decimal(val) if isinstance(val, (int, float, Decimal, str)) else val
            # Also expose the raw runtime context (ISO field names) so expressions that
            # reference ISO fields directly still resolve.
            for k, v in runtime_context.items():
                eval_context[k] = _to_decimal(v) if isinstance(v, (int, float, Decimal, str)) else v

            result = simple_eval(expression, names=eval_context, functions=FUNCTION_LIBRARY)
            runtime_context[target_field] = result
            execution_logs.append(f"Executed '{formula_asset.business_name}'. {target_field} = {result}")

        except Exception as e:
            execution_logs.append(f"[ERROR] Token '{token}': {str(e)}")
            runtime_context[target_field] = Decimal("0")

        return {"final_context": runtime_context, "logs": execution_logs}
