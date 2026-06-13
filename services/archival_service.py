import datetime
import asyncio
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from models import IngestionJob, IngestionJobArchive, EvidencePacketRegistry, MaintenanceTaskLog
from event_bus import global_event_bus, SystemEvent
import uuid

class ArchivalService:
    """
    Handles archiving of old, completed system records.
    """

    def _log_task(self, db: Session, task_name: str, status: str, triggered_by: str, summary: dict = None, details: str = None):
        """Helper method to log the execution of a maintenance task."""
        log_id = f"MAINT-LOG-{uuid.uuid4().hex[:12].upper()}"
        log_entry = MaintenanceTaskLog(
            log_id=log_id,
            task_name=task_name,
            status=status,
            summary=summary,
            details=details,
            triggered_by=triggered_by,
            triggered_at=datetime.datetime.utcnow().isoformat()
        )
        db.add(log_entry)
        db.commit()

    def archive_old_ingestion_jobs(self, db: Session, retention_days: int, triggered_by: str) -> int:
        """
        Finds old, completed ingestion jobs, moves them to the archive table,
        and deletes them from the primary table.

        Returns the number of jobs archived.
        """
        task_name = "archive_ingestion_jobs"
        try:
            if retention_days < 7:
                raise ValueError("Retention period must be at least 7 days for safety.")

            cutoff_date = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)
            cutoff_date_str = cutoff_date.isoformat()

            jobs_to_archive = db.query(IngestionJob).filter(
                IngestionJob.status.in_(['COMPLETED', 'CANCELLED', 'FAILED']),
                IngestionJob.completed_at < cutoff_date_str
            ).all()

            if not jobs_to_archive:
                self._log_task(db, task_name, "SUCCESS", triggered_by, summary={"archived_count": 0, "retention_days": retention_days})
                return 0

            archived_count = 0
            current_archive_time = datetime.datetime.utcnow().isoformat()

            for job in jobs_to_archive:
                job_data = {c.name: getattr(job, c.name) for c in job.__table__.columns}
                archive_record = IngestionJobArchive(**job_data, archived_at=current_archive_time)
                db.add(archive_record)
                db.delete(job)
                archived_count += 1
            
            db.commit()

            summary = {"archived_count": archived_count, "retention_days": retention_days}
            self._log_task(db, task_name, "SUCCESS", triggered_by, summary=summary)

            if archived_count > 0:
                event_payload = {**summary, "message": f"Successfully archived {archived_count} jobs older than {retention_days} days."}
                asyncio.run(global_event_bus.broadcast(SystemEvent(
                    event_type="ARCHIVAL_TASK_COMPLETED", source_context="ArchivalService", payload=event_payload
                )))

            return archived_count
        except Exception as e:
            db.rollback()
            self._log_task(db, task_name, "FAILED", triggered_by, details=str(e))
            raise e

    def restore_job_from_archive(self, db: Session, job_id: str) -> IngestionJob:
        """
        Finds a job in the archive, moves it back to the active ingestion_jobs table,
        and deletes it from the archive.

        Returns the restored IngestionJob object.
        """
        archived_job = db.query(IngestionJobArchive).filter(IngestionJobArchive.job_id == job_id).first()
        if not archived_job:
            raise ValueError(f"Archived job with ID '{job_id}' not found.")

        active_job = db.query(IngestionJob).filter(IngestionJob.job_id == job_id).first()
        if active_job:
            raise ValueError(f"Conflict: An active job with ID '{job_id}' already exists.")

        # Create a new active job record from the archive data, excluding the 'archived_at' field
        job_data = {c.name: getattr(archived_job, c.name) for c in archived_job.__table__.columns if c.name != 'archived_at'}
        restored_job = IngestionJob(**job_data)
        
        db.add(restored_job)
        db.delete(archived_job)
        db.commit()
        
        # --- BROADCAST JOB RESTORED EVENT ---
        event_payload = {
            "job_id": restored_job.job_id,
            "filename": restored_job.filename,
            "message": f"Job {restored_job.job_id} has been restored from the archive."
        }
        asyncio.run(global_event_bus.broadcast(SystemEvent(
            event_type="JOB_RESTORED_FROM_ARCHIVE",
            source_context="ArchivalService",
            payload=event_payload
        )))
        
        return restored_job

    def cleanup_old_execution_logs(self, db: Session, retention_days: int, triggered_by: str) -> int:
        """
        Finds and deletes old, terminal-state execution logs (Evidence Packets).
        This is a cleanup task, not an archival. Records are permanently deleted.

        Returns the number of logs deleted.
        """
        task_name = "cleanup_execution_logs"
        try:
            if retention_days < 30:
                raise ValueError("Retention period must be at least 30 days for safety.")

            cutoff_date = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)
            cutoff_date_str = cutoff_date.isoformat()

            terminal_states = ['FINALIZED_AND_SETTLED', 'REJECTED_DEAD', 'AUTHORIZED_REPROCESSED']

            logs_to_delete = db.query(EvidencePacketRegistry).filter(
                EvidencePacketRegistry.execution_status.in_(terminal_states),
                or_(
                    EvidencePacketRegistry.updated_at < cutoff_date_str,
                    and_(EvidencePacketRegistry.updated_at == None, EvidencePacketRegistry.created_at < cutoff_date_str)
                )
            ).all()

            if not logs_to_delete:
                self._log_task(db, task_name, "SUCCESS", triggered_by, summary={"deleted_count": 0, "retention_days": retention_days})
                return 0

            deleted_count = len(logs_to_delete)
            
            for log in logs_to_delete:
                db.delete(log)
            
            db.commit()

            summary = {"deleted_count": deleted_count, "retention_days": retention_days}
            self._log_task(db, task_name, "SUCCESS", triggered_by, summary=summary)

            event_payload = summary
            asyncio.run(global_event_bus.broadcast(SystemEvent(
                event_type="LOG_CLEANUP_COMPLETED", source_context="ArchivalService", payload=event_payload
            )))

            return deleted_count
        except Exception as e:
            db.rollback()
            self._log_task(db, task_name, "FAILED", triggered_by, details=str(e))
            raise e

    def flag_stuck_ingestion_jobs(self, db: Session, timeout_minutes: int, triggered_by: str) -> int:
        """
        Finds jobs that have been in 'PROCESSING' state for too long and flags them as 'FAILED'.

        Returns the number of jobs flagged.
        """
        task_name = "flag_stuck_ingestion_jobs"
        try:
            if timeout_minutes < 5:
                raise ValueError("Timeout period must be at least 5 minutes for safety.")

            cutoff_date = datetime.datetime.utcnow() - datetime.timedelta(minutes=timeout_minutes)
            cutoff_date_str = cutoff_date.isoformat()

            stuck_jobs = db.query(IngestionJob).filter(
                IngestionJob.status == 'PROCESSING',
                IngestionJob.processing_started_at < cutoff_date_str
            ).all()

            if not stuck_jobs:
                self._log_task(db, task_name, "SUCCESS", triggered_by, summary={"flagged_count": 0, "timeout_minutes": timeout_minutes})
                return 0

            flagged_count = 0
            error_message = f"Job failed due to processing timeout after {timeout_minutes} minutes."

            for job in stuck_jobs:
                job.status = "FAILED"
                job.error_message = error_message
                job.completed_at = datetime.datetime.utcnow().isoformat()
                flagged_count += 1

                event_payload = {"job_id": job.job_id, "filename": job.filename, "message": error_message}
                asyncio.run(global_event_bus.broadcast(SystemEvent(
                    event_type="STUCK_JOB_DETECTED", source_context="ArchivalService.StuckJobDetector", payload=event_payload
                )))

            db.commit()
            summary = {"flagged_count": flagged_count, "timeout_minutes": timeout_minutes}
            self._log_task(db, task_name, "SUCCESS", triggered_by, summary=summary)
            return flagged_count
        except Exception as e:
            db.rollback()
            self._log_task(db, task_name, "FAILED", triggered_by, details=str(e))
            raise e

    def flag_stale_governance_tasks(self, db: Session, timeout_days: int, triggered_by: str) -> int:
        """
        Finds governance tasks that have been in 'HALTED_IN_GOVERNANCE' state for too long
        and broadcasts an event for each one to trigger notifications.

        Returns the number of tasks flagged.
        """
        task_name = "flag_stale_governance_tasks"
        try:
            if timeout_days < 1:
                raise ValueError("Timeout period must be at least 1 day.")

            cutoff_date = datetime.datetime.utcnow() - datetime.timedelta(days=timeout_days)
            cutoff_date_str = cutoff_date.isoformat()

            stale_tasks = db.query(EvidencePacketRegistry).filter(
                EvidencePacketRegistry.execution_status == 'HALTED_IN_GOVERNANCE',
                EvidencePacketRegistry.created_at < cutoff_date_str
            ).all()

            if not stale_tasks:
                self._log_task(db, task_name, "SUCCESS", triggered_by, summary={"flagged_count": 0, "timeout_days": timeout_days})
                return 0

            flagged_count = 0
            for task in stale_tasks:
                flagged_count += 1

                event_payload = {
                    "task_id": task.packet_id,
                    "raw_payload_reference": task.raw_payload_reference,
                    "pending_since": task.created_at,
                    "message": f"Task has been pending review for more than {timeout_days} days."
                }
                asyncio.run(global_event_bus.broadcast(SystemEvent(
                    event_type="STALE_GOVERNANCE_TASK_DETECTED",
                    source_context="ArchivalService.StaleTaskDetector",
                    payload=event_payload
                )))
            summary = {"flagged_count": flagged_count, "timeout_days": timeout_days}
            self._log_task(db, task_name, "SUCCESS", triggered_by, summary=summary)
            return flagged_count
        except Exception as e:
            db.rollback()
            self._log_task(db, task_name, "FAILED", triggered_by, details=str(e))
            raise e