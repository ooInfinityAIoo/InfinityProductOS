# WHY THIS FILE EXISTS (Finding D regression guard):
# The Business Rules studio and the rule engine were built to two different condition/
# action schemas, and NO test crossed that boundary — so studio-authored rules silently
# raised "Operand has no source fields." at runtime and nobody caught it until the
# integration audit. These tests author rules in the *studio* shape ({field, operator,
# value} / {type, message}) and assert the engine evaluates and acts on them, plus prove
# the engine's native shape still works. If the two schemas ever diverge again, this fails.

import unittest
from services.business_rule_engine import BusinessRuleEngine


class TestBusinessRuleEngineAdapter(unittest.TestCase):
    def test_studio_shape_triggers_above_threshold(self):
        # Exact shape the Business Rules studio writes (and seed_golden_path seeds).
        rule_def = {
            "business_name": "AML High-Value Threshold Alert",
            "rules": [{
                "priority": 100,
                "conditions": [{"field": "AMT", "operator": "GREATER_THAN", "value": 500000}],
                "actions": [
                    {"type": "FLAG_FOR_REVIEW", "message": "AML review required."},
                    {"type": "EMIT_EVENT", "event_code": "EVT_AML_HVT_FLAGGED"},
                ],
            }],
        }
        bre = BusinessRuleEngine(rule_def, calculation_engine=None)

        triggered, ctx, _logs = bre.execute({"AMT": 600000})
        self.assertTrue(triggered, "Rule should trigger when AMT > 500000")
        self.assertEqual(ctx.get("_review_flags"), ["AML review required."])
        self.assertEqual(ctx.get("_emitted_events"), ["EVT_AML_HVT_FLAGGED"])

    def test_studio_shape_does_not_trigger_below_threshold(self):
        rule_def = {
            "business_name": "AML High-Value Threshold Alert",
            "rules": [{
                "priority": 100,
                "conditions": [{"field": "AMT", "operator": "GREATER_THAN", "value": 500000}],
                "actions": [{"type": "FLAG_FOR_REVIEW", "message": "AML review required."}],
            }],
        }
        bre = BusinessRuleEngine(rule_def, calculation_engine=None)
        triggered, ctx, _logs = bre.execute({"AMT": 400000})
        self.assertFalse(triggered, "Rule must not trigger when AMT < 500000")
        self.assertIsNone(ctx.get("_review_flags"))

    def test_operator_alias_is_normalized(self):
        # Studio shorthand 'GTE' must map to the engine's GREATER_THAN_OR_EQUAL_TO.
        rule_def = {
            "rules": [{
                "priority": 1,
                "conditions": [{"field": "AMT", "operator": "GTE", "value": 1000}],
                "actions": [{"type": "FLAG_FOR_REVIEW", "message": "hit"}],
            }],
        }
        bre = BusinessRuleEngine(rule_def, calculation_engine=None)
        self.assertTrue(bre.execute({"AMT": 1000})[0], "GTE should be inclusive at the boundary")
        self.assertFalse(bre.execute({"AMT": 999})[0])

    def test_engine_native_shape_still_works(self):
        # Backward compatibility: a rule already authored in the engine's shape must
        # continue to evaluate unchanged (the adapter only rewrites the studio shape).
        rule_def = {
            "rules": [{
                "priority": 1,
                "conditions": [{
                    "left_hand_side": {"source_fields": ["AMT"]},
                    "right_hand_side": {"static_value": 500000},
                    "operator": "GREATER_THAN",
                }],
                "actions": [{"action_type": "SET_VALUE", "target_field": "flagged", "value": True}],
            }],
        }
        bre = BusinessRuleEngine(rule_def, calculation_engine=None)
        triggered, ctx, _logs = bre.execute({"AMT": 600000})
        self.assertTrue(triggered)
        self.assertTrue(ctx.get("flagged"))


if __name__ == "__main__":
    unittest.main()
