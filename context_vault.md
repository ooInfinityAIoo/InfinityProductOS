# Infinity ProductOS - System Context Vault

## 1. Project Overview
* **Name:** Infinity ProductOS
* **Purpose:** A zero-licensing, self-serve financial products framework built for business lines to deploy components dynamically.
* **Tech Stack:** Python 3.13+, FastAPI, Docker Compose, SQLite (via `infinity_db.sqlite` / `infinity_platform.db`), Frontend/Scripting assets (`server.js`, `seed.py`).

## 2. Core Directory Structure & Key Components
* `main.py`: Core entry point initializing FastAPI, CORS middlewares, and loading routers.
* `services/`: Core business logic layer.
  * `slack_service.py`: Dispatches system events and Slack Block Kit payloads using secure environment variables (`SLACK_WEBHOOK_URL`).
  * `workflow_executor.py`: Orchestrates multi-step system tasks.
  * Other services: `archival`, `data_masking`, `reporting`, `registry_processor`.
* `routers/`: API endpoints split cleanly by domain logic:
  * `calculations.py`, `governance.py`, `health.py`, `ingestion.py`, `maintenance.py`, `masters.py`, `registry.py`, `screens.py`, `users.py`, `dashboard.py`.
* `core/`: Base engine rules, engine schemas, validation, and registry mechanisms.
* `scripts/`: Operational automation (`business_rules.py`, `registry_processor.py`, etc.).

## 3. Current Implementation Progress & Rules
* **Database:** Backed by SQLite utilizing local data files.
* **Security Rule:** Hardcoding sensitive integration keys or Slack Webhooks is strictly prohibited. All secrets must interact dynamically via `os.getenv()` mapping to a local `.env` file.
* **Latest Milestone:** Completed full backend implementation for the Screen Designer module, integrated foundational routers, and initiated git remote origins to a secure repository.

## 4. Active Chat Interaction Log
* Use this section to dump temporary code snippets, current error logs, or highly specific design parameters you are iterating on during an active session.
## Current Status Snapshot (June 13, 2026)
* **Milestone:** Connected local repository to GitHub remote (`origin main`). 
* **Security:** Created `.env` file in the root directory and added it to `.gitignore`.
* **Code Refactor:** Moved the hardcoded `SLACK_WEBHOOK_URL` out of `services/slack_service.py` and updated line 17 to pull dynamically using `os.getenv("SLACK_WEBHOOK_URL")`. History was cleanly amended, and the code was successfully pushed past GitHub's push protection.