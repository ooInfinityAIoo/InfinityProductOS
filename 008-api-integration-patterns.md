# 8. Enterprise Integration Patterns: Rate-Limiting and Circuit Breakers

*   **Status**: Accepted
*   **Date**: 2026-06-14

## Context

As a core orchestration platform, InfinityProductOS frequently communicates with external downstream systems (e.g., Core Banking Ledgers, CRMs, Sanction Screening Vendors). During high-volume batch processing (via our distributed Celery workers), our system is capable of overwhelming downstream APIs. This can lead to severe rate-limiting SLA penalties or exacerbate an ongoing outage on a third-party service (the "Thundering Herd" problem). 

While the `WorkflowExecutor` currently utilizes exponential back-off for individual retries, this localized mechanism is insufficient for global, enterprise-grade fault tolerance.

## Decision

We mandate the integration of **Distributed Rate-Limiting** and **Circuit Breaker** state patterns at the Layer 4 Integration Gateway. The parameters for these patterns must be stored as "Logic-as-Data" directly inside the API Designer canvas representations.

1.  **Rate-Limiting (Distributed Token Bucket)**: All `ApiConfiguration` entities will explicitly define a Maximum Requests Per Second (RPS). The execution layer will utilize the Redis Message Broker (already provisioned) as a distributed token bucket to throttle aggregate outbound requests across all horizontally scaled execution workers.
2.  **Circuit Breaker State Machine**: `ApiConfiguration` entities will define consecutive failure thresholds and timeout windows. If an external API fails repeatedly, the global circuit "opens," instantly failing subsequent calls without waiting for network timeouts. This protects our execution workers from thread starvation and gives the downstream service time to recover. After the designated timeout period, it enters a "half-open" state to probe recovery.

## Consequences

*   **Pros**: 
    *   Prevents cascading systemic failures and thread starvation.
    *   Protects external vendor relationships by ensuring strict compliance with API quota limits.
    *   Ensures asynchronous task workers process failures rapidly instead of hanging on infinite timeouts.
*   **Cons**: 
    *   Adds implementation complexity to the outbound request dispatcher.
    *   Requires the Execution Layer to interact with Redis for sub-millisecond state evaluation before firing the HTTP request.

## Execution Proof in Codebase

*   `models.py`: The `ApiConfiguration` blueprint explicitly registers `rate_limit_rps`, `circuit_breaker_threshold`, and `circuit_breaker_timeout_sec` fields.
*   `schemas.py`: The API Designer schema contracts expose these limits for visual configuration by operations users.