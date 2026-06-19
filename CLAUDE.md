# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ Session Handoff Protocol (Read This First — Every Single Session)

This project is built by two AI developers: **Claude** and **Gemini**. They never work at the same time. Before every session, one has handed off to the other via a Git commit.

### Rule 1 — Start of every Claude session: Orient before touching anything
Run these two commands immediately and report findings to the user:
```bash
git pull origin main
git log --oneline -5
```
Then tell the user:
- What the last commit was and who made it (Claude or Gemini)
- What files were changed
- What to work on next (infer from commit message context)

### Rule 2 — End of every Claude session: Always commit + push before closing
When the user says they are done or switching to Gemini, run:
```bash
git add -A
git commit -m "<clear description of everything done this session>"
git push origin main
```
Confirm the push succeeded and show the commit hash. Never let the user close the session with uncommitted changes.

### Rule 3 — Restore last working version if anything breaks
If the user says "revert", "undo", "restore", or "something broke", immediately run:
```bash
git log --oneline -5
```
Show the last 5 commits and ask which one to restore to. Then run:
```bash
git revert HEAD   # undoes the last commit safely, keeps history
```
Or if multiple commits need undoing, tell the user exactly what will happen before doing it.

---

## Running the App Locally

**Backend** (FastAPI on port 8000):
```bash
uvicorn main:app --reload --port 8000
```

**Frontend** (Vite/React on port 5173):
```bash
npm run dev
```

**Seed the database** (run in order on first launch):
```bash
python seed.py                 # ISO 20022 field registry (3,013 fields) + base config
python seed_pkg.py             # Payment Hub package
python seed_golden_path.py     # Full SWIFT cross-border payment scenario (exercises every studio)
```

**Type-check frontend:**
```bash
tsc --noEmit
npm run lint
npm run build
```

**API docs:** http://localhost:8000/docs

---

## ⚠️ Critical: API Port

`src/api/client.ts` baseURL **must** be `http://localhost:8000/api/v1`.

The `.env` file has `CORE_ENGINE_URL=http://core-engine:8081` — that is the Docker internal address only. If every studio shows empty lists, this is the first thing to check.

---

## Authentication

The backend uses a coexistence auth strategy (`auth.py`):
- **Production:** Bearer JWT via OIDC (set `OIDC_DOMAIN` env var)
- **Local dev (no OIDC configured):** Pass `X-User-Id` and `X-User-Role` headers instead

The frontend `apiClient` interceptor automatically injects `X-User-Id: designer_admin` and `X-User-Role: admin`. For direct curl testing:
```bash
curl -H "X-User-Id: admin" -H "X-User-Role: admin" http://localhost:8000/api/v1/templates/
```

All secrets must be loaded via `os.getenv()` — never hardcoded (ADR #2).

---

## Architecture

### The Core Idea: "Logic-as-Data" (ADR #3)

**No business logic is hardcoded in Python.** All workflow graphs, business rules, calculation formulas, UI screen definitions, and API configurations are stored as JSON/JSONB in the database and interpreted at runtime by stateless execution engines. The visual studios are authoring tools; the backend engines are interpreters.

This means:
- Changes to rules/workflows take effect instantly via API — no redeploy needed
- All logic is versioned and auditable in the DB
- AI assistants can read and generate logic programmatically

### The 8-Layer Architecture (from `architecture.md`)

| Layer | Name | What it does |
|---|---|---|
| 0 | Physical Edge | Devices (POS, mobile, IoT) — producers/consumers only, no logic |
| 1 | Visual Studios | React "Canva" studios — where users author logic |
| 2 | Agentic AI | NLP prompt-to-canvas, behavioral AI, decomposition of legacy logic |
| 3 | Semantic Bloodstream | ISO 20022 Field Registry — the universal vocabulary |
| 4 | Deterministic Execution | FastAPI + Python engines + Kafka event bus |
| 5 | Persistent Storage | PostgreSQL (production) / SQLite (local dev) + Immutable Evidence Ledger |
| 6 | Governance & Compliance | PII masking, 4-Eye checks, OIDC auth, immutable audit log |
| 7 | Global Isolation | Multi-tenant, multi-region, multi-currency, multi-language |
| 8 | Fault Tolerance | Celery async checkpointing, atomic DB transactions, circuit breakers |

### Backend Structure

- **`main.py`** — FastAPI entry point; mounts all routers under `/api/v1/`
- **`routers/`** — Thin per-domain files (validate → delegate to services). One file per domain: `rules.py`, `workflows.py`, `calculations.py`, `mappers.py`, `registry.py`, `screens.py`, `integrations.py`, `reconciliation_engine.py`, `reporting.py`, `templates.py`, etc.
- **`services/`** — All business logic lives here:
  - `workflow_executor.py` — DAG traversal engine; wraps financial nodes in `with db.begin():` atomic transactions
  - `business_rule_engine.py` — Evaluates IF-THEN JSONB rule definitions
  - `calculation_engine.py` — Evaluates symbolic math using `simpleeval` (never raw `eval()`); all values cast to `decimal.Decimal` before computation
  - `registry_processor.py` — ISO field registry operations
  - `reconciliation_worker.py` — Nostro/Vostro matching (runs via Celery)
  - `orchestrator_pipeline.py` — Master canvas orchestration
  - `ai_services.py` — LLM integrations, behavioral profile aggregation, insights orchestration
  - `data_masking.py` — PII masking; applied to all outbound API payloads
- **`models.py`** — All SQLAlchemy ORM models
- **`schemas.py`** — All Pydantic request/response schemas
- **`database.py`** — Defaults to `sqlite:///./infinity_db.sqlite` locally; reads `DATABASE_URL` env for PostgreSQL in production. Has `regional_engines` dict for multi-region sharding (all regions fall back to the same URL locally).
- **`auth.py`** — Coexistence JWT + dev-header auth dependency

### How the Engines Interlink (ADR #4)

```
AI Assistant → generates/modifies → Canva Studios (stores JSON in DB)
                                              ↓
Workflow Executor → reads workflow graph → invokes Business Rule Engine
                                        → invokes Calculation Engine
                                        → invokes API Configurations
                                        → broadcasts Events
Business Rule Engine → can invoke → Calculation Engine
Events → can trigger → Workflows / Rules / Insights
```

Each `WorkflowNode.orchestration_steps` is a JSON array of step objects. Each step has a `step_type` (`BUSINESS_RULE`, `CALCULATION`, `API_CALL`, `REPORT`, `EVENT`, `SUB_WORKFLOW`, `RECONCILIATION`) and the engine dispatches accordingly.

### Frontend Structure

- **`src/App.tsx`** — Navigation shell; all studios are lazy-loaded with `React.lazy()`. There is **no URL router** — navigation is pure Zustand state (`activeModule`).
- **`src/store/usePlatformStore.ts`** — Single global Zustand store. Key state: `activeModule`, `activeProductContext` (package name string), `activeCoreProductId`, `userRole`, `globalAdminDesignerMode`.
- **`src/api/client.ts`** — Axios instance with auth interceptor. Must point to port 8000.
- **`src/features/`** — One folder per studio. Each is self-contained with its own `useQuery`/`useMutation` hooks. No shared data-fetching layer.

### The ISO Field Registry (The "Semantic Bloodstream")

3,013 ISO 20022 fields in `iso_field_registry`. Every field across every studio is anchored here. Key concepts:
- `display_preference` (`ISO` | `CLIENT`) — controls whether studio dropdowns show the ISO standard name or the bank's custom name
- Set per-field via `PATCH /api/v1/fields/registry/{field_id}/preferences`
- `IsoFieldSelector` component provides debounced server-side search with type filters and PII toggle — used across all studios

### Multi-Tenancy Scoping

The hierarchy is: **Package → Product → Sub-Product**. Most studios filter by `package_id` + `product_id`. The Calculation Engine and Business Rules studio only load data once both a package and a product are selected in the UI. Empty lists with no error = context not yet selected.

### API Response Key Conventions

Each endpoint wraps its list under a named key:

| Endpoint | Response key |
|---|---|
| `/templates/` | `templates` |
| `/mappers/` | `mappers` (includes inline `mappings` array) |
| `/rules/` | plain list (no wrapper) |
| `/calculations/` | `formulas` |
| `/workflows/` | plain list (no wrapper) |
| `/screens/` | `screens` |
| `/integrations/` | `integrations` |
| `/reconciliation/templates` | `templates` |
| `/reporting/` | `reports` |
| `/fields/registry/` | `fields` |
| `/masters/packages` | `packages` |
| `/masters/products?package_id=X` | `products` |

---

## Financial Safety Rules (ADR #7 — Non-Negotiable)

1. **Atomic transactions** — Any workflow node touching financial state must use `with db.begin():`. An invariant check (e.g., Σ debits = Σ credits) must pass before commit; failure triggers a hard `ROLLBACK`.
2. **No native floats for money** — The Calculation Engine casts all values to `decimal.Decimal` before any math. Never use `float` for currency.
3. **No raw `eval()`** — Use `simpleeval` for formula evaluation to prevent code injection.

## API Integration Rules (ADR #8 — Non-Negotiable)

`ApiConfiguration` blueprints (stored in `api_configurations` table) define:
- `rate_limit_rps` — enforced via Redis token bucket across all Celery workers
- `circuit_breaker_threshold` + `circuit_breaker_timeout_sec` — circuit opens after N consecutive failures, then enters half-open probe after timeout

Never call external APIs without these guardrails in place. PII masking (`data_masking.py`) must be applied to all POST/PUT outbound bodies where `mask_pii_in_body = true`.

---

## Documentation Standard (from `CONTRIBUTING.md`)

Three-tier standard for all contributions:

1. **Tier 1 (Developers)** — Docstrings on classes/functions explaining architectural *intent and why*, not just what
2. **Tier 2 (Auditors)** — Inline guardrail comments before any governance/security enforcement line, referencing the layer: `# Layer 6 Guardrail: ...`
3. **Tier 3 (Business)** — FastAPI endpoint `summary` and `description` written in business language (auto-generates `/docs`)

---

## Golden Path Seed Data

`seed_golden_path.py` creates a complete SWIFT MT103 cross-border payment scenario that exercises every studio. Requires `Payment Hub` package to exist first (`seed_pkg.py`).

| Studio | Seeded Object |
|---|---|
| File Template Designer | SWIFT MT103 Inbound Wire (13 fixed-width field addresses) |
| Data Gateway Mapper | MT103 → ISO pacs.008 (11 field mappings) |
| Calculation Engine | `FX_CONVERTED_AMOUNT` formula (INSTRUCTED_AMT × FX_RATE) |
| Business Rules | AML high-value threshold, OFAC beneficiary screening, FX rate stale check |
| Workflow Designer | 5-node DAG: Ingest → Validate → Enrich → Approve → Settle |
| Screen Designer | SWIFT Wire Payment Entry (10 ISO-bound components) |
| API Designer | SWIFT GPI Tracker POST + Bank of England RTGS POST |
| Reconciliation Engine | Nostro vs Vostro daily matching template (4 match rules) |
| Report Designer | Settlement Dashboard (6 widgets: KPI cards, bar, line, data grid) |
