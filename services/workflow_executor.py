from sqlalchemy.orm import Session
from typing import Dict, Any, List
import models
import json
import asyncio
from services.business_rules import BusinessRulesEngine
from services.data_masking import DataMaskingService
from event_bus import global_event_bus, SystemEvent

class WorkflowExecutor:
    """
    Core engine to execute a defined workflow blueprint.
    It processes an input payload by traversing the workflow's nodes and edges,
    executing associated rules and calculations at each step.
    """

    def __init__(self, db: Session, workflow_id: str):
        self.db = db
        self.workflow = db.query(models.WorkflowConfiguration).filter(
            models.WorkflowConfiguration.workflow_id == workflow_id
        ).first()
        if not self.workflow:
            raise ValueError(f"Workflow with ID '{workflow_id}' not found.")
        
        # Initialize the data masking service in alignment with architecture Layer 6
        self.masking_service = DataMaskingService()
        
        # Dynamically load PII fields from the Field Registry
        pii_fields_from_db = self.db.query(models.ISOFieldDefinition.technical_sys_name).filter(models.ISOFieldDefinition.is_pii == True).all()
        self.pii_fields = [item[0] for item in pii_fields_from_db]
        
        # Pre-process nodes and edges for efficient lookups
        self.nodes_by_id = {node.node_id: node for node in self.workflow.nodes}
        self.edges_from_node = {}
        for edge in self.workflow.edges:
            if edge.source_node_id not in self.edges_from_node:
                self.edges_from_node[edge.source_node_id] = []
            self.edges_from_node[edge.source_node_id].append(edge)
            
        self.execution_trace = []

    def _evaluate_edge_condition(self, condition_str: str, context: Dict[str, Any]) -> bool:
        """
        Safely evaluates a JSON condition string against the current context.
        Returns True if the condition passes or if the condition is empty/invalid.
        """
        if not condition_str:
            return True # An edge with no condition is considered a default path

        try:
            condition = json.loads(condition_str)
            field = condition.get("field")
            operator = condition.get("operator")
            value = condition.get("value")
            
            context_value = context.get(field)

            if operator == "==":
                return context_value == value
            elif operator == "!=":
                return context_value != value
            elif operator == ">":
                return context_value > value
            elif operator == "<":
                return context_value < value
            elif operator == ">=":
                return context_value >= value
            elif operator == "<=":
                return context_value <= value
            return False
        except (json.JSONDecodeError, AttributeError, TypeError):
            self.execution_trace.append(f"[WARN] Could not evaluate invalid condition: {condition_str}")
            return False # Fail-safe for malformed conditions

    def _execute_node_actions(self, node: models.WorkflowNode, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes the actions defined for a single node (rules, calculations).
        This is a simplified implementation.
        """
        self.execution_trace.append(f"Entering Node: '{node.node_title}' (Seq: {node.sequence_number})")

        # Execute Business Rules defined in the workflow's main rules_matrix
        if self.workflow.rules_matrix:
            # In a real scenario, you might filter rules based on node.rules_applied
            bre = BusinessRulesEngine({"calculation_steps": self.workflow.rules_matrix})
            bre_result = bre.execute_logic(context)
            context = bre_result["final_calculated_state"]
            self.execution_trace.extend(bre_result["audit_trail_logs"])
            self.execution_trace.append(f"Node '{node.node_title}' rules applied. Context updated.")

        return context

    def execute(self, initial_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Runs the entire workflow by traversing the graph from the starting node.
        This engine supports parallel path execution (forking) by evaluating all
        outgoing edges from a node and following all valid paths simultaneously
        in a breadth-first manner.
        """
        if not self.nodes_by_id:
            return {"status": "FAILED", "message": "Workflow has no nodes to execute.", "trace": []}

        current_context = initial_payload.copy()
        masked_context_for_log = self.masking_service.mask_pii_data(current_context, self.pii_fields)

        self.execution_trace.append(f"Starting execution for workflow: {self.workflow.workflow_name}")
        self.execution_trace.append(f"Initial Payload (Masked): {masked_context_for_log}")

        try:
            start_node = sorted(self.workflow.nodes, key=lambda n: n.sequence_number)[0]
        except IndexError:
            return {"status": "FAILED", "message": "Cannot find a starting node.", "trace": self.execution_trace}

        active_nodes = [start_node]
        max_steps = len(self.nodes_by_id) * 2 + 5  # Increased safety buffer for forks/joins
        step_count = 0

        while active_nodes and step_count < max_steps:
            step_count += 1
            self.execution_trace.append(f"--- Step {step_count} ---")
            
            next_step_nodes = []
            # Use a set to handle multiple paths converging on the same node in the next step (fan-in)
            next_step_node_ids = set()

            for node in active_nodes:
                # Execute the node's primary actions
                current_context = self._execute_node_actions(node, current_context)

                outgoing_edges = self.edges_from_node.get(node.node_id, [])
                if not outgoing_edges:
                    self.execution_trace.append(f"Execution path finished at terminal node: '{node.node_title}'")
                    continue

                found_a_path = False
                # Evaluate all outgoing edges to handle forks (fan-out)
                for edge in outgoing_edges:
                    if self._evaluate_edge_condition(edge.edge_condition, current_context):
                        found_a_path = True
                        next_node_id = edge.target_node_id
                        
                        if next_node_id in self.nodes_by_id and next_node_id not in next_step_node_ids:
                            next_step_node_ids.add(next_node_id)
                            next_step_nodes.append(self.nodes_by_id[next_node_id])
                            self.execution_trace.append(f"Condition passed for edge from '{node.node_title}' to '{self.nodes_by_id[next_node_id].node_title}'. Queuing for next step.")
                
                if not found_a_path:
                    self.execution_trace.append(f"No valid conditional path found from node '{node.node_title}'. This path terminates here.")

            active_nodes = next_step_nodes
        
        if step_count >= max_steps:
            self.execution_trace.append("[ERROR] Execution halted. Maximum step count exceeded, possible infinite loop detected.")
            
            # --- BROADCAST FAILURE EVENT ---
            asyncio.run(global_event_bus.broadcast(SystemEvent(
                event_type="WORKFLOW_FAILED",
                source_context=f"WorkflowExecutor:{self.workflow.workflow_id}",
                payload={"reason": "Max steps exceeded", "final_context": self.masking_service.mask_pii_data(current_context, self.pii_fields)}
            )))
            
            return {"status": "FAILED", "workflow_id": self.workflow.workflow_id, "final_context": self.masking_service.mask_pii_data(current_context, self.pii_fields), "trace": self.execution_trace}

        # Mask the final output context before returning to prevent PII leakage, per Layer 6.
        masked_final_context = self.masking_service.mask_pii_data(current_context, self.pii_fields)

        self.execution_trace.append("--- Workflow execution finished ---")
        
        # --- BROADCAST COMPLETION EVENT ---
        asyncio.run(global_event_bus.broadcast(SystemEvent(
            event_type="WORKFLOW_COMPLETED",
            source_context=f"WorkflowExecutor:{self.workflow.workflow_id}",
            payload={"final_context": masked_final_context}
        )))
        
        return {"status": "COMPLETED", "workflow_id": self.workflow.workflow_id, "final_context": masked_final_context, "trace": self.execution_trace}