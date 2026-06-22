# WHY THIS FILE EXISTS (Finding C1):
# The Business Rule Engine evaluates conditions like
#   { field: "Cdtr.Nm", operator: "IN_SANCTION_LIST", list: "OFAC_SDN" }
# but has no way to actually screen the candidate string against the named list.
# This service is that capability: given a list token and a candidate name/BIC,
# return True if the candidate matches any entry in the list. Engine-facing
# function: screen_against_list().
#
# WHAT BREAKS IF REMOVED:
# The OFAC rule (and any other list-screening rule) raises NotImplementedError
# and the workflow can't auto-block sanctioned beneficiaries.
#
# Matching strategy (intentional, documented):
# - Case-insensitive substring match against primary_name and each alias.
# - Exact case-insensitive match against bic (BICs are short, codified — substring
#   matching would produce false positives like 'RBANK' inside 'WORLDBANK').
# - This is the standard dev/baseline approach. Production should swap this for
#   fuzzy/phonetic matching (Levenshtein, double-metaphone) plus a feed loader.
#   The boolean contract of screen_against_list() does not change.

from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

import models


class SanctionsService:
    """
    Resolves named sanctions lists from the DB and screens candidate strings.
    Construct with a DB session; reuses queries via a tiny per-instance cache so a
    single rule evaluation that screens N fields against the same list hits the DB once.
    """

    def __init__(self, db: Session):
        self.db = db
        # token_code -> entries (list of dicts). None marker = "looked up, not found".
        self._cache: Dict[str, Optional[List[Dict[str, Any]]]] = {}

    def _load_list(self, list_token: str) -> Optional[List[Dict[str, Any]]]:
        """Load and cache a list's entries by token_code. Returns None if no such list."""
        if list_token in self._cache:
            return self._cache[list_token]
        row = (
            self.db.query(models.SanctionsList)
            .filter(models.SanctionsList.token_code == list_token)
            .first()
        )
        entries = (row.entries or []) if row is not None else None
        self._cache[list_token] = entries
        return entries

    @staticmethod
    def _entry_matches(entry: Dict[str, Any], candidate: str) -> Tuple[bool, str]:
        """
        Returns (matched, reason). Reason is a human-readable note explaining WHICH
        attribute matched so the workflow trace shows actionable detail rather than
        just 'matched OFAC_SDN'.
        """
        c = candidate.strip()
        if not c:
            return False, ""
        c_lower = c.lower()

        # BIC: exact, case-insensitive
        bic = (entry.get("bic") or "").strip()
        if bic and bic.lower() == c_lower:
            return True, f"BIC '{bic}' matched"

        # Primary name + aliases: case-insensitive substring (industry baseline)
        primary = (entry.get("primary_name") or "").strip()
        if primary and primary.lower() in c_lower:
            return True, f"name matched '{primary}'"
        for alias in entry.get("aliases", []) or []:
            a = (alias or "").strip()
            if a and a.lower() in c_lower:
                return True, f"alias matched '{a}'"

        return False, ""

    def screen_against_list(self, candidate: Any, list_token: str) -> Dict[str, Any]:
        """
        Engine-facing entry point. Screens `candidate` against the list `list_token`.

        Returns:
          {
            "list_exists": bool,           # False if list_token is unknown (separate from 'no hit')
            "matched":     bool,           # True if any entry matched (False if list_exists is False)
            "list_name":   str|None,
            "entry":       dict|None,      # the matching entry, for trace/audit
            "reason":      str|None,       # WHICH attribute matched
          }
        """
        result: Dict[str, Any] = {
            "list_exists": False,
            "matched": False,
            "list_name": None,
            "entry": None,
            "reason": None,
        }
        if candidate is None:
            return result
        # Cast everything to string — BICs are strings, names are strings, but the engine
        # may hand us anything from the context (ints, etc.).
        cand_str = str(candidate)

        entries = self._load_list(list_token)
        if entries is None:
            return result  # list doesn't exist; matched=False, list_exists=False
        result["list_exists"] = True
        # Look up the human-friendly name for trace purposes.
        row = (
            self.db.query(models.SanctionsList)
            .filter(models.SanctionsList.token_code == list_token)
            .first()
        )
        result["list_name"] = row.list_name if row else list_token

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            matched, reason = self._entry_matches(entry, cand_str)
            if matched:
                result["matched"] = True
                result["entry"] = entry
                result["reason"] = reason
                return result

        return result
