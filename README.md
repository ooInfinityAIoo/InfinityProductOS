# 🚀 Infinity ProductOS Enterprise Core

Infinity ProductOS is a Tier-1, mission-critical financial orchestration platform. It replaces traditional hardcoded banking logic with a **"Logic-as-Data"** architecture, empowering business users to design workflows, calculation formulas, and UI screens via visual "Canva" studios, executed dynamically by a deterministic backend engine.

---

## 🧠 Architectural Pillars

This platform is built on 8 non-negotiable architectural pillars (detailed in `architecture.md`):

1. **Visual Multi-Canvas Studio Layer:** Decoupled, React-based frontend studios (Workflow, Rules, Calculations, API, UI).
2. **Agentic Alignment Layer:** Native AI integrations for Prompt-to-Canvas configuration and Behavioral prediction.
3. **The Semantic Bloodstream:** A centralized ISO 20022 Field Registry that acts as the single vocabulary for all engines.
4. **Deterministic Execution:** A stateless Python engine evaluating logic graphs securely.
5. **Persistent Storage & Blueprint Registry:** PostgreSQL storing JSONB logic manifests.
6. **Governance & Compliance:** 4-Eye Maker-Checker gates and strict dynamic PII data masking.
7. **Global Isolation & Localization:** Multi-tenant hierarchy supporting product/package scoping.
8. **Fault Tolerance & Stateful Resumability:** Celery asynchronous checkpointing, strict DB transactions, and Kafka Outbox streaming.

---

## 🛠️ Tech Stack

### Backend (The Pre-Frontal Cortex)
- **Python 3.13+**
- **FastAPI** (High-performance API Gateway)
- **SQLAlchemy** (ORM with dynamic JSONB and GIN Indexing)
- **PostgreSQL** (ACID compliant state & logic storage)
- **Celery + Redis** (Distributed task queue for massive data ingestion & reconciliation)
- **Apache Kafka** (High-throughput Event Bus & Outbox Relay)
- **Pandas & NumPy** (Vectorized math and reconciliation processing)

### Frontend (The Visual Studios)
- **React 18** (UI Component Library)
- **TypeScript** (Strict type safety)
- **Tailwind CSS** (Utility-first styling)
- **Zustand** (Atomic global state management)
- **TanStack React Query** (Server state and caching)
- **React Flow** (Interactive DAG Workflow visualizer)

---

## 🐳 Quick Start (Docker Compose)

The easiest way to spin up the entire distributed architecture locally is using Docker Compose. This will orchestrate the database, message broker, cache, API backend, Celery workers, and the frontend server.

### Prerequisites
- Docker Desktop installed
- Minimum 8GB RAM allocated to Docker

### Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/infinity-productos.git
   cd infinity-productos
   ```

2. **Configure Environment Variables:**
   Copy the example environment file and configure any necessary keys (like your OpenAI API key for AI features).
   ```bash
   cp .env.example .env
   ```

3. **Spin up the ecosystem:**
   ```bash
   docker-compose up -d --build
   ```

4. **Seed the Database:**
   Once the containers are healthy, seed the ISO Field Registry, initial roles, and sample workflows.
   ```bash
   docker-compose exec backend python seed.py
   ```

### Accessing the Services
- **Frontend UI:** http://localhost:3000
- **API Swagger Docs:** http://localhost:8000/docs
- **PostgreSQL Database:** `localhost:5432` (User: `infinity`, Pass: `infinity_dev`)
- **Redis Cache/Broker:** `localhost:6379`

---

## 💻 Local Development Setup (Without Docker)

If you prefer to run the services directly on your machine for debugging:

### 1. Backend Setup

```bash
# Create a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Ensure PostgreSQL and Redis are running locally, then initialize the DB
python seed.py

# Start the FastAPI server
uvicorn main:app --reload --port 8000
```

### 2. Celery Background Workers

Open a new terminal window to start the background processing node (required for Data Ingestion, Reconciliation, and AI profile generation).

```bash
source venv/bin/activate
celery -A celery_app worker --loglevel=info
```

### 3. Frontend Setup

Open a third terminal window.

```bash
# Install dependencies
npm install

# Start the Vite/React development server
npm run dev
```

---

## 🧪 Testing Strategy

To maintain our Tier-1 enterprise reliability, all contributions must pass the test suite.

### Backend (PyTest)
Tests cover atomic rollback invariants, double-entry ledger safety, and API endpoints.
```bash
pytest services/test_workflow_executor_invariants.py
pytest routers/test_tasks.py
```

### Frontend (Jest & React Testing Library)
Tests cover component rendering, routing decomposition, and Zustand state mutations.
```bash
npm run test
```

### End-to-End User Journeys (Playwright)
Simulates a Business Analyst navigating the platform, drawing logic nodes, and configuring packages.
```bash
npx playwright test e2e/user-journeys.spec.ts
```

---

## 🔒 Security & Contribution Guidelines

Before submitting a Pull Request, please ensure you have read `CONTRIBUTING.md`. 

* **Do not hardcode business logic** in Python. If a rule changes frequently, it belongs in the Business Rule Engine database.
* **Respect the PII Masking Service**. Ensure `masking_service.mask_pii_data()` is applied to all outbound payloads.
* **Maintain the 3-Tier Documentation Standard** (Developer intent, Auditor guardrails, Business summaries).

---
*Built with ⚡️ for absolute financial agility.*