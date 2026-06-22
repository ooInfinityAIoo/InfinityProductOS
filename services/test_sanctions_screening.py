"""
Unit tests for sanctions-list screening in the Business Rule Engine (Finding C1).

These tests use a minimal in-memory fake SanctionsService rather than the DB-backed
one, so they prove the contract between the engine and the service without needing a
real DB session: any service implementing screen_against_list(candidate, list_token)
returning {"matched", "list_exists", "list_name", "entry", "reason"} works.
"""
import unittest

from services.business_rule_engine import BusinessRuleEngine


class FakeSanctionsService:
    """Minimal in-memory SanctionsService for tests. Substring-matches on name + exact on bic."""

    def __init__(self, lists):
        self.lists = lists  # { "OFAC_SDN": [ {primary_name, aliases, bic}, ... ] }

    def screen_against_list(self, candidate, list_token):
        if candidate is None:
            return {"list_exists": list_token in self.lists, "matched": False,
                    "list_name": list_token, "entry": None, "reason": None}
        entries = self.lists.get(list_token)
        if entries is None:
            return {"list_exists": False, "matched": False,
                    "list_name": None, "entry": None, "reason": None}
        c = str(candidate).lower()
        for e in entries:
            bic = (e.get("bic") or "").lower()
            if bic and bic == c:
                return {"list_exists": True, "matched": True, "list_name": list_token,
                        "entry": e, "reason": f"BIC '{e['bic']}' matched"}
            primary = (e.get("primary_name") or "").lower()
            if primary and primary in c:
                return {"list_exists": True, "matched": True, "list_name": list_token,
                        "entry": e, "reason": f"name matched '{e['primary_name']}'"}
        return {"list_exists": True, "matched": False, "list_name": list_token,
                "entry": None, "reason": None}


def _ofac_ruleset(logical_op="OR"):
    """Returns a rule set in the studio-authored shape that the engine adapter normalizes."""
    return {
        "business_name": "OFAC Beneficiary Screening",
        "rules": [{
            "priority": 100,
            "logical_operator": logical_op,
            "conditions": [
                {"field": "Cdtr.Nm",       "operator": "IN_SANCTION_LIST", "list": "OFAC_SDN"},
                {"field": "CdtrAgt.BICFI", "operator": "IN_SANCTION_LIST", "list": "OFAC_SDN"},
            ],
            "actions": [
                {"type": "BLOCK_PAYMENT", "message": "OFAC hit — payment blocked."},
                {"type": "EMIT_EVENT", "event_code": "EVT_OFAC_HIT_DETECTED"},
            ],
        }],
    }


SANCTIONS_FIXTURE = {"OFAC_SDN": [
    {"primary_name": "ROSBANK", "aliases": [], "bic": "RSBNRUMM"},
]}


class TestSanctionsScreening(unittest.TestCase):

    def setUp(self):
        self.svc = FakeSanctionsService(SANCTIONS_FIXTURE)

    def test_name_match_fires_block(self):
        """Beneficiary name contains a sanctioned entity -> rule fires, BLOCK + event recorded."""
        bre = BusinessRuleEngine(_ofac_ruleset(), calculation_engine=None,
                                 sanctions_service=self.svc)
        triggered, ctx, logs = bre.execute({
            "Cdtr.Nm": "Acme Corp c/o ROSBANK Treasury",
            "CdtrAgt.BICFI": "DEUTDEFF",   # clean
        })
        self.assertTrue(triggered)
        self.assertIn("EVT_OFAC_HIT_DETECTED", ctx.get("_emitted_events", []))
        # Audit detail surfaces in logs
        self.assertTrue(any("Sanctions HIT" in l and "ROSBANK" in l for l in logs),
                        msg=f"Expected an audit log line naming the matched entity; got {logs}")

    def test_bic_match_fires_block(self):
        """Beneficiary name is clean but BIC matches -> OR logic fires the rule via the BIC condition."""
        bre = BusinessRuleEngine(_ofac_ruleset(), calculation_engine=None,
                                 sanctions_service=self.svc)
        triggered, ctx, logs = bre.execute({
            "Cdtr.Nm": "Innocent Co.",
            "CdtrAgt.BICFI": "RSBNRUMM",
        })
        self.assertTrue(triggered)
        self.assertTrue(any("BIC 'RSBNRUMM' matched" in l for l in logs))

    def test_clean_beneficiary_does_not_fire(self):
        bre = BusinessRuleEngine(_ofac_ruleset(), calculation_engine=None,
                                 sanctions_service=self.svc)
        triggered, ctx, logs = bre.execute({
            "Cdtr.Nm": "Acme Corp",
            "CdtrAgt.BICFI": "DEUTDEFF",
        })
        self.assertFalse(triggered)
        self.assertNotIn("_emitted_events", ctx)  # no actions fired -> no events recorded

    def test_missing_service_raises_not_implemented(self):
        """A configuration check: forgetting to inject the service must FAIL CLOSED loudly."""
        bre = BusinessRuleEngine(_ofac_ruleset(), calculation_engine=None)  # no sanctions_service
        triggered, _ctx, logs = bre.execute({"Cdtr.Nm": "ROSBANK", "CdtrAgt.BICFI": "X"})
        self.assertFalse(triggered)  # error in execute() -> rule did not trigger
        self.assertTrue(any("not implemented" in l.lower() or "sanctionsservice" in l.lower()
                            for l in logs))

    def test_unknown_list_fails_closed(self):
        """If the rule references a list that doesn't exist, the engine must NOT silently pass."""
        bad = _ofac_ruleset()
        bad["rules"][0]["conditions"][0]["list"] = "FAKE_LIST"
        bre = BusinessRuleEngine(bad, calculation_engine=None, sanctions_service=self.svc)
        triggered, _, logs = bre.execute({"Cdtr.Nm": "Anyone", "CdtrAgt.BICFI": "Y"})
        # Error during evaluation -> the rule does not trigger; surfaced as a log line.
        self.assertFalse(triggered)
        self.assertTrue(any("FAKE_LIST" in l for l in logs))

    def test_and_logic_requires_both_conditions(self):
        """Sanity check: AND semantics still work (regression guard for logical_operator dispatch)."""
        bre = BusinessRuleEngine(_ofac_ruleset(logical_op="AND"), calculation_engine=None,
                                 sanctions_service=self.svc)
        triggered, _, _ = bre.execute({
            "Cdtr.Nm": "Acme Corp c/o ROSBANK Treasury",  # match
            "CdtrAgt.BICFI": "DEUTDEFF",                  # clean
        })
        # AND requires both -> should NOT fire
        self.assertFalse(triggered)


if __name__ == "__main__":
    unittest.main()
