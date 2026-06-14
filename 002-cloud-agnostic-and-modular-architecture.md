# 2. Cloud-Agnostic and Modular Service Architecture

*   **Status**: Accepted
*   **Date**: 2026-06-13

## Context

The Infinity ProductOS platform is intended for enterprise use by multiple clients, including large financial institutions. These clients may have existing infrastructure on different cloud providers (AWS, Azure, Google Cloud) or on-premise data centers. The system must be able to scale to millions of end-customers and support parallel development by a large, distributed engineering team.

Therefore, a core requirement is to avoid vendor lock-in and ensure the architecture is portable, scalable, and highly maintainable.

## Decision

We will design and build the entire platform on a **cloud-agnostic and modular, API-first service architecture.**

This is enforced through four key technical principles:

1.  **Configuration via Environment Variables**: All external service configurations (e.g., database URLs, secret keys) **must** be loaded from environment variables (`os.getenv`). No credentials or connection strings will be hardcoded.
2.  **Use of Open-Source, Industry-Standard Technologies**: The core stack will be Python, FastAPI, SQLAlchemy, and PostgreSQL. These are open standards with broad support across all cloud platforms.
3.  **Containerization-Ready Design**: The application will be built as a standard web server, designed to be packaged into Docker containers and orchestrated by Kubernetes (e.g., EKS, AKS, GKE).
4.  **Decoupled Internal Services**: Core capabilities (Workflow Engine, Rules Engine, Insights Factory, etc.) will be built as distinct modules with their own API routers. This allows them to be scaled or maintained independently.

## Consequences

*   **Pros**:
    *   **Universal Portability**: The same application container can be deployed to AWS, Azure, GCP, or on-premise with only changes to environment variables. This is a major selling point for enterprise clients.
    *   **High Scalability**: Stateless services and a containerized design allow for horizontal scaling to handle millions of users.
    *   **High Maintainability (99.99% Uptime)**: The modular design allows development teams to update or deploy one service (e.g., the Insights Factory) with zero downtime for other, unrelated services (e.g., the Workflow Engine).
    *   **Parallel Development**: Enables large teams to work on different modules simultaneously without conflict, using the API schemas as the contract between them.

*   **Cons**:
    *   Slightly more complex operational overhead compared to a monolith, as it requires managing container orchestration and environment configurations. This is a standard and accepted trade-off for achieving scalability and portability.

*   **Execution Proof in Codebase**:
    *   `database.py`: Uses `os.getenv("DATABASE_URL", ...)` to load the database connection string.
    *   `routers/` directory: Each file represents a distinct, decoupled service API.
    *   `main.py`: A standard FastAPI application, ready for containerization.