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

    # --- E0 commit 2/N — CANCEL_TRANSACTION rule action ---
    # WHY: TRANSACTION_SCREEN_DESIGN.md §7.2 introduces CANCEL_TRANSACTION as a
    # distinct verb from BLOCK_PAYMENT/REJECT_STEP — same halt semantics but
    # different audit reason (voluntary, not validation) and different UI color
    # (purple, not red). These tests prove the rule engine emits the right
    # context signals so the executor (wired in commit 3) can halt and persist
    # status=CANCELLED.
    def test_cancel_transaction_action_sets_cancellation_signal(self):
        rule_def = {
            "rules": [{
                "priority": 100,
                "conditions": [{"field": "ACCT_STATUS", "operator": "EQUAL_TO", "value": 1}],
                "actions": [{
                    "type": "CANCEL_TRANSACTION",
                    "reason_code": "ACCOUNT_FROZEN",
                    "message": "Customer account was frozen mid-flight.",
                }],
            }],
        }
        bre = BusinessRuleEngine(rule_def, calculation_engine=None)
        triggered, ctx, logs = bre.execute({"ACCT_STATUS": 1})

        self.assertTrue(triggered)
        self.assertTrue(ctx.get("_cancelled"))
        self.assertEqual(ctx.get("_cancel_reason_code"), "ACCOUNT_FROZEN")
        self.assertEqual(ctx.get("_cancel_message"), "Customer account was frozen mid-flight.")
        self.assertEqual(len(ctx.get("_cancellations", [])), 1)
        self.assertTrue(any("CANCEL_TRANSACTION" in line for line in logs))
        # Must NOT set _blocked — that's reserved for BLOCK_PAYMENT/REJECT_STEP (red on tracker).
        self.assertFalse(ctx.get("_blocked"))

    def test_cancel_action_uses_defaults_when_reason_omitted(self):
        rule_def = {
            "rules": [{
                "priority": 100,
                "conditions": [{"field": "X", "operator": "EQUAL_TO", "value": 1}],
                "actions": [{"type": "CANCEL_TRANSACTION"}],  # no reason_code / message
            }],
        }
        bre = BusinessRuleEngine(rule_def, calculation_engine=None)
        _trig, ctx, _logs = bre.execute({"X": 1})
        self.assertTrue(ctx.get("_cancelled"))
        self.assertEqual(ctx.get("_cancel_reason_code"), "RULE_CANCEL")
        self.assertIn("cancelled", ctx.get("_cancel_message", "").lower())

    def test_multiple_cancel_actions_keep_first_reason_and_audit_all(self):
        # Two rules cancel for different reasons. First-wins for the reason shown to ops;
        # all reasons audited in _cancellations[] for the evidence ledger.
        rule_def = {
            "rules": [
                {
                    "priority": 1,  # runs first
                    "conditions": [{"field": "AMT", "operator": "GREATER_THAN", "value": 0}],
                    "actions": [{"type": "CANCEL_TRANSACTION", "reason_code": "FIRST", "message": "first"}],
                },
                {
                    "priority": 2,
                    "conditions": [{"field": "AMT", "operator": "GREATER_THAN", "value": 0}],
                    "actions": [{"type": "CANCEL_TRANSACTION", "reason_code": "SECOND", "message": "second"}],
                },
            ],
        }
        bre = BusinessRuleEngine(rule_def, calculation_engine=None)
        _trig, ctx, _logs = bre.execute({"AMT": 100})
        self.assertEqual(ctx.get("_cancel_reason_code"), "FIRST")
        self.assertEqual(len(ctx.get("_cancellations", [])), 2)
        codes = [c["reason_code"] for c in ctx.get("_cancellations", [])]
        self.assertEqual(codes, ["FIRST", "SECOND"])

    def test_cancel_is_distinct_from_block(self):
        # BLOCK_PAYMENT must still set _blocked (red on tracker); CANCEL_TRANSACTION
        # must set _cancelled (purple). They use different context keys so the executor
        # can route to different lifecycle states (REJECTED vs CANCELLED).
        block_def = {"rules": [{"priority": 1,
            "conditions": [{"field": "X", "operator": "EQUAL_TO", "value": 1}],
            "actions": [{"type": "BLOCK_PAYMENT", "message": "blocked"}]}]}
        cancel_def = {"rules": [{"priority": 1,
            "conditions": [{"field": "X", "operator": "EQUAL_TO", "value": 1}],
            "actions": [{"type": "CANCEL_TRANSACTION", "message": "cancelled"}]}]}

        _t, block_ctx, _l = BusinessRuleEngine(block_def, calculation_engine=None).execute({"X": 1})
        _t, cancel_ctx, _l = BusinessRuleEngine(cancel_def, calculation_engine=None).execute({"X": 1})

        self.assertTrue(block_ctx.get("_blocked"))
        self.assertFalse(block_ctx.get("_cancelled"))
        self.assertTrue(cancel_ctx.get("_cancelled"))
        self.assertFalse(cancel_ctx.get("_blocked"))


if __name__ == "__main__":
    unittest.main()
