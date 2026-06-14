from database import SessionLocal
import models
from event_bus import SystemEvent
from services.business_rule_engine import BusinessRuleEngine
from services.calculation_engine import CalculationEngine

def handle_rule_engine_triggers(event: SystemEvent):
    """
    Listens for any event and executes any Business Rule Sets that are subscribed to it.
    This function runs in the background and creates its own DB session.
    """
    db = SessionLocal()
    try:
        # Find rules that trigger on this event type
        rules_to_run = db.query(models.BusinessRuleSet).filter(
            models.BusinessRuleSet.triggering_event_type == event.event_type
        ).all()

        if not rules_to_run:
            return

        print(f"[EVENT_BUS_BRE_HANDLER] Found {len(rules_to_run)} rule(s) subscribed to event '{event.event_type}'.")
        
        # The BRE needs a calculation engine to execute calculation actions.
        # This is potentially inefficient if many rules run. Caching could be added later.
        formula_library = {formula.token_code: formula for formula in db.query(models.SymbolicFormulaAsset).all()}
        calc_engine = CalculationEngine(formula_library=formula_library)

        for rule_model in rules_to_run:
            bre = BusinessRuleEngine(
                rule_set_definition=rule_model.definition,
                calculation_engine=calc_engine
            )
            # The event payload becomes the initial context for the rule
            # Note: The result of this execution is not directly returned to the event emitter.
            # The rule itself should trigger other actions (like API calls or new events) if needed.
            _, _, logs = bre.execute(runtime_context=event.payload)
            print(f"  └── Executed rule '{rule_model.business_name}'. Logs: {logs}")

    finally:
        db.close()