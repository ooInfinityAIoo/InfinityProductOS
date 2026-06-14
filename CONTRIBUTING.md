# Contributing to Infinity ProductOS

Thank you for your interest in contributing to Infinity ProductOS. To ensure the long-term quality, maintainability, and auditability of the platform, all contributions must adhere to the following documentation standards.

This project follows a "self-documenting code" philosophy. The code itself should be the single source of truth, made clear and accessible to all stakeholders through a multi-layered documentation strategy.

---

## 1. The Three-Tiered Documentation Standard

Every code change, whether a new feature or a modification, must include documentation that serves three distinct audiences:

### Tier 1: For Developers & Architects (The "Why")

**Requirement:** All new or significantly modified classes and functions must have detailed docstrings.

**Purpose:** To explain the architectural intent behind the code. Docstrings should explain not just *what* the code does, but *why* it exists and how it fits into the master architecture.

**Example (`services/workflow_executor.py`):**
```python
class WorkflowExecutor:
    """
    Core engine to execute a defined workflow blueprint (Layer 4: Deterministic Execution).
    
    This service is the heart of the execution layer. It processes an input payload 
    by traversing the workflow's graph of nodes and edges, executing associated 
    rules, calculations, and API calls at each step.
    """
```

### Tier 2: For Auditors & Compliance Teams (The "Guardrails")

**Requirement:** Any line of code that programmatically enforces a governance or security rule must be preceded by a targeted "Guardrail Comment."

**Purpose:** To provide a clear, verifiable audit trail from the architectural policy document (`architecture.md`) to the exact line of code where that policy is enforced.

**Example (`services/workflow_executor.py`):**
```python
# Layer 6 Guardrail: Enforce PII masking for outgoing request bodies.
if api_config.http_method.upper() in ['POST', 'PUT'] and api_config.mask_pii_in_body:
    self.execution_trace.append(f"Applying PII masking to request body for API trigger '{api_config.api_name}'.")
    body_context = self.masking_service.mask_pii_data(context, self.pii_field_properties)
```

### Tier 3: For Business Users & API Consumers (The "What")

**Requirement:** All new or modified API endpoints in a FastAPI router must have a clear, business-friendly `summary` and `description`.

**Purpose:** To auto-generate rich, interactive API documentation (via `/docs`) that is understandable to non-technical stakeholders. The description should explain the endpoint's purpose and any relevant business rules.

**Example (`routers/governance.py`):**
```python
@router.post("/tasks/{task_id}/authorize", response_model=schemas.GovernanceTaskResponse, summary="Approve or Reject a Task (4-Eye Check)")
def authorize_governance_task(task_id: str, payload: schemas.GovernanceTaskAction, ...):
    """
    Allows an authorized SME to approve or reject a transaction held in the governance queue.
    This endpoint implements the critical '4-Eye Check' principle for manual interventions.

    **RBAC Enforcement:**
    - Users with the `AUDITOR` role are explicitly blocked from performing this action.
    """
```

---

By adhering to these three tiers of documentation, we ensure that the codebase remains transparent, auditable, and maintainable for its entire lifecycle.