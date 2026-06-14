import datetime
import asyncio
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from models import IngestionJob, IngestionJobArchive, EvidencePacketRegistry, MaintenanceTaskLog
from event_bus import global_event_bus, SystemEvent
import uuid
from services.maintenance_utils import log_maintenance_task

class ArchivalService:
    """
    Handles archiving of old, completed system records.
    """

    def _log_task(self, db: Session, task_name: str, status: str, triggered_by: str, summary: dict = None, details: str = None, duration_ms: int = None):
        """Helper method to log the execution of a maintenance task."""
        log_maintenance_task(db, task_name, status, triggered_by, summary, details, duration_ms)

    def archive_old_ingestion_jobs(self, db: Session, retention_days: int, triggered_by: str) -> int:
        """
        Finds old, completed ingestion jobs, moves them to the archive table,
        and deletes them from the primary table.

        Returns the number of jobs archived.
        """
        task_name = "archive_ingestion_jobs"
        start_time = datetime.datetime.utcnow()
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
                duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
                self._log_task(db, task_name, "SUCCESS", triggered_by, summary={"archived_count": 0, "retention_days": retention_days}, duration_ms=duration_ms)
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
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "SUCCESS", triggered_by, summary=summary, duration_ms=duration_ms)

            if archived_count > 0:
                event_payload = {**summary, "message": f"Successfully archived {archived_count} jobs older than {retention_days} days."}
                asyncio.run(global_event_bus.broadcast(SystemEvent(
                    event_type="ARCHIVAL_TASK_COMPLETED", source_context="ArchivalService", payload=event_payload
                )))

            return archived_count
        except Exception as e:
            db.rollback()
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "FAILED", triggered_by, details=str(e), duration_ms=duration_ms)
            raise e

    def get_maintenance_task_statistics(self, db: Session) -> dict:
        """
        Retrieves and calculates statistics on maintenance task runs, grouped by task name.
        """
        from collections import defaultdict

        # Query to get counts of each status for each task name
        counts_query = db.query(
            MaintenanceTaskLog.task_name,
            MaintenanceTaskLog.status,
            func.count(MaintenanceTaskLog.log_id).label('count')
        ).group_by(
            MaintenanceTaskLog.task_name,
            MaintenanceTaskLog.status
        ).all()

        # Process the raw counts into a more structured dictionary
        processed_stats = defaultdict(lambda: {"success_count": 0, "failed_count": 0})
        for task_name, status, count in counts_query:
            if status == "SUCCESS":
                processed_stats[task_name]["success_count"] += count
            elif status == "FAILED":
                processed_stats[task_name]["failed_count"] += count

        # Calculate totals and success rates
        stats_by_task = []
        overall_total_runs = 0
        overall_success_count = 0
        overall_failed_count = 0

        for task_name, counts in processed_stats.items():
            total_runs = counts["success_count"] + counts["failed_count"]
            success_rate = counts["success_count"] / total_runs if total_runs > 0 else 0.0
            
            stats_by_task.append({
                "task_name": task_name,
                "success_count": counts["success_count"],
                "failed_count": counts["failed_count"],
                "total_runs": total_runs,
                "success_rate": success_rate
            })
            
            overall_total_runs += total_runs
            overall_success_count += counts["success_count"]
            overall_failed_count += counts["failed_count"]

        overall_success_rate = overall_success_count / overall_total_runs if overall_total_runs > 0 else 0.0
        
        stats_by_task.sort(key=lambda x: x['total_runs'], reverse=True)

        return {
            "overall_total_runs": overall_total_runs,
            "overall_success_count": overall_success_count,
            "overall_failed_count": overall_failed_count,
            "overall_success_rate": overall_success_rate,
            "stats_by_task": stats_by_task
        }

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
        start_time = datetime.datetime.utcnow()
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
                duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
                self._log_task(db, task_name, "SUCCESS", triggered_by, summary={"deleted_count": 0, "retention_days": retention_days}, duration_ms=duration_ms)
                return 0

            deleted_count = len(logs_to_delete)
            
            for log in logs_to_delete:
                db.delete(log)
            
            db.commit()

            summary = {"deleted_count": deleted_count, "retention_days": retention_days}
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "SUCCESS", triggered_by, summary=summary, duration_ms=duration_ms)

            event_payload = summary
            asyncio.run(global_event_bus.broadcast(SystemEvent(
                event_type="LOG_CLEANUP_COMPLETED", source_context="ArchivalService", payload=event_payload
            )))

            return deleted_count
        except Exception as e:
            db.rollback()
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "FAILED", triggered_by, details=str(e), duration_ms=duration_ms)
            raise e

    def flag_stuck_ingestion_jobs(self, db: Session, timeout_minutes: int, triggered_by: str) -> int:
        """
        Finds jobs that have been in 'PROCESSING' state for too long and flags them as 'FAILED'.

        Returns the number of jobs flagged.
        """
        task_name = "flag_stuck_ingestion_jobs"
        start_time = datetime.datetime.utcnow()
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
                duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
                self._log_task(db, task_name, "SUCCESS", triggered_by, summary={"flagged_count": 0, "timeout_minutes": timeout_minutes}, duration_ms=duration_ms)
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
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "SUCCESS", triggered_by, summary=summary, duration_ms=duration_ms)
            return flagged_count
        except Exception as e:
            db.rollback()
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "FAILED", triggered_by, details=str(e), duration_ms=duration_ms)
            raise e

    def flag_stale_governance_tasks(self, db: Session, timeout_days: int, triggered_by: str) -> int:
        """
        Finds governance tasks that have been in 'HALTED_IN_GOVERNANCE' state for too long
        and broadcasts an event for each one to trigger notifications.

        Returns the number of tasks flagged.
        """
        task_name = "flag_stale_governance_tasks"
        start_time = datetime.datetime.utcnow()
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
                duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
                self._log_task(db, task_name, "SUCCESS", triggered_by, summary={"flagged_count": 0, "timeout_days": timeout_days}, duration_ms=duration_ms)
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
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "SUCCESS", triggered_by, summary=summary, duration_ms=duration_ms)
            return flagged_count
        except Exception as e:
            db.rollback()
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "FAILED", triggered_by, details=str(e), duration_ms=duration_ms)
            raise e

    def check_for_unconfigured_pii_fields(self, db: Session, triggered_by: str) -> int:
        """
        Finds PII fields that do not have an explicit masking strategy assigned
        and broadcasts an event if any are found.

        Returns the number of unconfigured fields found.
        """
        task_name = "check_unconfigured_pii_fields"
        start_time = datetime.datetime.utcnow()
        try:
            unconfigured_fields = db.query(models.ISOFieldDefinition).filter(
                models.ISOFieldDefinition.is_pii == True,
                models.ISOFieldDefinition.masking_strategy.is_(None)
            ).all()

            count = len(unconfigured_fields)
            summary = {"unconfigured_pii_field_count": count}
            
            details = f"Found {count} PII fields with no masking strategy." if count > 0 else "All PII fields have an explicit masking strategy assigned."
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "SUCCESS", triggered_by, summary=summary, details=details, duration_ms=duration_ms)
            
            if count > 0:
                event_payload = {"count": count, "field_names": [f.technical_sys_name for f in unconfigured_fields], "message": details}
                asyncio.run(global_event_bus.broadcast(SystemEvent(event_type="UNCONFIGURED_PII_DETECTED", source_context="ArchivalService.PIIConfigAuditor", payload=event_payload)))

            return count
        except Exception as e:
            db.rollback()
            duration_ms = int((datetime.datetime.utcnow() - start_time).total_seconds() * 1000)
            self._log_task(db, task_name, "FAILED", triggered_by, details=str(e), duration_ms=duration_ms)
            raise e

    def get_frequently_failing_tasks(self, db: Session, hours_window: int, failure_threshold: int) -> List:
        """
        Finds maintenance tasks that have failed more than a given threshold
        within a specific time window.
        """
        cutoff_time = datetime.datetime.utcnow() - datetime.timedelta(hours=hours_window)
        cutoff_time_str = cutoff_time.isoformat()

        failing_tasks = db.query(
            models.MaintenanceTaskLog.task_name,
            func.count(models.MaintenanceTaskLog.log_id).label('failure_count')
        ).filter(
            models.MaintenanceTaskLog.status == 'FAILED',
            models.MaintenanceTaskLog.triggered_at >= cutoff_time_str
        ).group_by(
            models.MaintenanceTaskLog.task_name
        ).having(
            func.count(models.MaintenanceTaskLog.log_id) > failure_threshold
        ).order_by(
            func.count(models.MaintenanceTaskLog.log_id).desc()
        ).all()

        return failing_tasks

    def get_maintenance_task_performance_stats(self, db: Session) -> List:
        """
        Retrieves performance statistics for each maintenance task.
        """
        stats = db.query(
            models.MaintenanceTaskLog.task_name,
            func.count(models.MaintenanceTaskLog.log_id).label('run_count'),
            func.avg(models.MaintenanceTaskLog.duration_ms).label('avg_duration_ms'),
            func.min(models.MaintenanceTaskLog.duration_ms).label('min_duration_ms'),
            func.max(models.MaintenanceTaskLog.duration_ms).label('max_duration_ms')
        ).group_by(
            models.MaintenanceTaskLog.task_name
        ).order_by(
            models.MaintenanceTaskLog.task_name
        ).all()
        return stats