# WHY THIS FILE EXISTS (Finding C regression guard):
# Surfaced while running the golden-path workflow end-to-end. Two calc-engine bugs
# stopped any formula whose parameters are authored as a list of {name, iso_field, type}
# descriptors (which is what the studio / golden-path seed produce):
#   1. execute_formula_by_token did eval_context.update(param_specs) on a LIST of dicts,
#      raising "dictionary update sequence element #0 has length 3; 2 is required", and
#      never bound the formula variables to their ISO-field values.
#   2. _to_decimal(True) -> Decimal('True') (bool is a subclass of int) crashed any calc
#      that ran after a rule put a boolean flag into the shared runtime context.

import unittest
from decimal import Decimal
from services.calculation_engine import CalculationEngine, _to_decimal


class _FakeFormula:
    """Minimal stand-in for models.SymbolicFormulaAsset."""
    def __init__(self):
        self.business_name = "FX Converted Settlement Amount"
        self.target_output_field = "SttlmAmt"
        self.mathematical_expression = "(AMOUNT * RATE)"
        self.parameters = [
            {"name": "AMOUNT", "iso_field": "InstdAmt.Amt", "type": "Amount"},
            {"name": "RATE", "iso_field": "XchgRate", "type": "Decimal"},
        ]


class TestCalculationEngineParams(unittest.TestCase):
    def test_list_parameters_bind_from_iso_fields(self):
        ce = CalculationEngine(formula_library={"FX": _FakeFormula()})
        ctx = {"InstdAmt.Amt": 750000, "XchgRate": "0.79"}
        out = ce.execute_formula_by_token("FX", dict(ctx))
        # 750000 * 0.79 = 592500, computed in Decimal (ADR #7)
        self.assertEqual(out["final_context"]["SttlmAmt"], Decimal("592500.00"))

    def test_boolean_flag_in_context_does_not_break_calc(self):
        # A rule may drop a bool (e.g. _blocked) into the shared context before a calc runs.
        ce = CalculationEngine(formula_library={"FX": _FakeFormula()})
        ctx = {"InstdAmt.Amt": 100, "XchgRate": "2", "_blocked": True, "_review": False}
        out = ce.execute_formula_by_token("FX", dict(ctx))
        self.assertEqual(out["final_context"]["SttlmAmt"], Decimal("200"))

    def test_to_decimal_bool_guard(self):
        self.assertIs(_to_decimal(True), True)
        self.assertIs(_to_decimal(False), False)
        self.assertEqual(_to_decimal(5), Decimal("5"))
        self.assertEqual(_to_decimal("nonnumeric"), "nonnumeric")


if __name__ == "__main__":
    unittest.main()
