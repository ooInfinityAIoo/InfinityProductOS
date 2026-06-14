# 3. Logic-as-Data Design Principle

*   **Status**: Accepted
*   **Date**: 2026-06-13

## Context

In traditional enterprise systems, business logic (e.g., eligibility rules, fee calculations, process flows) is often hardcoded directly into the application by developers. This creates a significant bottleneck. Every minor change to a rule requires a full software development lifecycle (coding, testing, deployment), leading to slow response times to market changes and a heavy reliance on engineering resources.

Our platform requires extreme agility, empowering business users and analysts to configure and modify complex logic without writing code.

## Decision

We will strictly adhere to a **"Logic-as-Data"** design principle.

All business logic, including workflow graphs, business rules, calculation formulas, and insight definitions, **must not** be hardcoded in Python services. Instead, this logic **must** be stored as structured, version-controlled data (primarily JSONB) in the database.

This data is created and managed exclusively through the system's secure, versioned APIs, which are exposed via the various "Canva" studios (Workflow Designer, Rules Engine Canva, etc.). The execution engines (`WorkflowExecutor`, `BusinessRuleEngine`, etc.) are designed to be stateless interpreters that read and execute this data at runtime.

## Consequences

*   **Pros**:
    *   **Zero-Downtime Logic Changes**: Business logic can be updated via an API call, with changes taking effect instantly. This completely decouples business agility from engineering deployment schedules.
    *   **Empowerment of Business Users**: Non-technical users can safely build and modify complex processes through the visual "Canva" studios, reducing the burden on developers.
    *   **Clear Audit Trail**: Every version of a rule or workflow is a distinct record in the database, providing a complete and auditable history of all logic changes.
    *   **AI-Native Architecture**: Representing logic as structured data makes it dramatically easier for AI Assistants to understand, analyze, and generate new business capabilities programmatically.

*   **Cons**:
    *   **Performance Overhead**: Interpreting logic from a database at runtime can be marginally slower than executing native, hardcoded Python. This is a deliberate and acceptable trade-off for the immense gains in flexibility and agility.
    *   **Requires Robust Validation**: The API layer must have strong validation (via Pydantic schemas) to prevent malformed or invalid logic from being saved to the database.

*   **Execution Proof in Codebase**:
    *   `models.py`: The `definition` (in `BusinessRuleSet`), `orchestration_steps` (in `WorkflowNode`), and `analysis_steps` (in `InsightDefinition`) JSONB fields are direct implementations of this principle.
    *   `routers/`: The `rules.py`, `workflows.py`, and `insights.py` routers provide the API-based management for this "Logic-as-Data".
    *   `services/`: The `WorkflowExecutor`, `BusinessRuleEngine`, and `InsightsOrchestrator` are all designed as stateless interpreters of this data.