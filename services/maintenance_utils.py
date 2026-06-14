import uuid
import datetime
from sqlalchemy.orm import Session
import models

def log_maintenance_task(db: Session, task_name: str, status: str, triggered_by: str, summary: dict = None, details: str = None, duration_ms: int = None):
    """Helper method to log the execution of a maintenance task system-wide."""
    log_id = f"MAINT-LOG-{uuid.uuid4().hex[:12].upper()}"
    log_entry = models.MaintenanceTaskLog(
        log_id=log_id,
        task_name=task_name,
        status=status,
        summary=summary,
        details=details,
        triggered_by=triggered_by,
        triggered_at=datetime.datetime.utcnow().isoformat(),
        duration_ms=duration_ms
    )
    db.add(log_entry)
    db.commit()