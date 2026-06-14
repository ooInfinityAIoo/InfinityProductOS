import os
from celery import Celery

# The broker manages the queue (where messages are sent). 
# The backend stores the final state/result of the task.
# Defaults to a local Redis instance for development if not provided.
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

celery_app = Celery(
    "infinity_product_os",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["tasks"]  # Explicitly tell Celery where to discover our worker functions
)

# --- Enterprise Reliability Configurations ---
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,          # Hard kill timeout: Prevent stuck bulk files (1 hour)
    worker_prefetch_multiplier=1,  # Fair dispatching: Prevent one worker from hoarding heavy files
    task_acks_late=True            # Fault Tolerance: Only acknowledge completion AFTER the task finishes, ensuring re-queues if the worker container crashes midway.
)