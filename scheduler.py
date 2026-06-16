import datetime
from apscheduler.schedulers.background import BackgroundScheduler

from database import SessionLocal
from services.archival_service import ArchivalService
from services.ai_services import AIService

# --- Job Definitions ---

def run_archive_ingestion_jobs():
    """Scheduled job to archive old ingestion jobs."""
    print(f"[{datetime.datetime.utcnow()}] Running scheduled task: Archive Old Ingestion Jobs...")
    db = SessionLocal()
    try:
        service = ArchivalService()
        # Archive jobs older than 30 days
        archived_count = service.archive_old_ingestion_jobs(db=db, retention_days=30, triggered_by="SYSTEM_SCHEDULER")
        print(f"[{datetime.datetime.utcnow()}] Scheduled task 'archive_ingestion_jobs' finished. Archived {archived_count} jobs.")
    except Exception as e:
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'archive_ingestion_jobs': {e}")
    finally:
        db.close()

def run_cleanup_execution_logs():
    """Scheduled job to clean up old execution logs."""
    print(f"[{datetime.datetime.utcnow()}] Running scheduled task: Cleanup Old Execution Logs...")
    db = SessionLocal()
    try:
        service = ArchivalService()
        # Clean up logs older than 90 days
        deleted_count = service.cleanup_old_execution_logs(db=db, retention_days=90, triggered_by="SYSTEM_SCHEDULER")
        print(f"[{datetime.datetime.utcnow()}] Scheduled task 'cleanup_execution_logs' finished. Deleted {deleted_count} logs.")
    except Exception as e:
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'cleanup_execution_logs': {e}")
    finally:
        db.close()

def run_flag_stuck_jobs():
    """Scheduled job to flag stuck ingestion jobs."""
    print(f"[{datetime.datetime.utcnow()}] Running scheduled task: Flag Stuck Ingestion Jobs...")
    db = SessionLocal()
    try:
        service = ArchivalService()
        # Flag jobs stuck in processing for more than 60 minutes
        flagged_count = service.flag_stuck_ingestion_jobs(db=db, timeout_minutes=60, triggered_by="SYSTEM_SCHEDULER")
        print(f"[{datetime.datetime.utcnow()}] Scheduled task 'flag_stuck_jobs' finished. Flagged {flagged_count} jobs.")
    except Exception as e:
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'flag_stuck_jobs': {e}")
    finally:
        db.close()

def run_flag_stale_tasks():
    """Scheduled job to flag stale governance tasks."""
    print(f"[{datetime.datetime.utcnow()}] Running scheduled task: Flag Stale Governance Tasks...")
    db = SessionLocal()
    try:
        service = ArchivalService()
        # Flag tasks pending for more than 7 days
        flagged_count = service.flag_stale_governance_tasks(db=db, timeout_days=7, triggered_by="SYSTEM_SCHEDULER")
        print(f"[{datetime.datetime.utcnow()}] Scheduled task 'flag_stale_tasks' finished. Flagged {flagged_count} tasks.")
    except Exception as e:
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'flag_stale_tasks': {e}")
    finally:
        db.close()

def run_summarize_ai_stats():
    """Scheduled job to summarize user interaction statistics."""
    print(f"[{datetime.datetime.utcnow()}] Running scheduled task: Summarize User Interaction Stats...")
    db = SessionLocal()
    try:
        service = AIService()
        logged_stats = service.summarize_interaction_stats_for_logging(db=db, triggered_by="SYSTEM_SCHEDULER")
        print(f"[{datetime.datetime.utcnow()}] Scheduled task 'summarize_ai_stats' finished. Logged stats for {logged_stats['total_interactions']} interactions.")
    except Exception as e:
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'summarize_ai_stats': {e}")
    finally:
        db.close()

def run_cleanup_interaction_events():
    """Scheduled job to clean up old user interaction events."""
    print(f"[{datetime.datetime.utcnow()}] Running scheduled task: Cleanup Old User Interaction Events...")
    db = SessionLocal()
    try:
        service = AIService()
        # Clean up events older than 180 days
        deleted_count = service.cleanup_old_interaction_events(db=db, retention_days=180, triggered_by="SYSTEM_SCHEDULER")
        print(f"[{datetime.datetime.utcnow()}] Scheduled task 'cleanup_interaction_events' finished. Deleted {deleted_count} events.")
    except Exception as e:
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'cleanup_interaction_events': {e}")
    finally:
        db.close()

def run_check_unconfigured_pii():
    """Scheduled job to check for PII fields without a masking strategy."""
    print(f"[{datetime.datetime.utcnow()}] Running scheduled task: Check for Unconfigured PII Fields...")
    db = SessionLocal()
    try:
        service = ArchivalService()
        unconfigured_count = service.check_for_unconfigured_pii_fields(db=db, triggered_by="SYSTEM_SCHEDULER")
        if unconfigured_count > 0:
            print(f"[{datetime.datetime.utcnow()}] Scheduled task 'check_unconfigured_pii' finished. Found {unconfigured_count} unconfigured PII fields.")
        else:
            print(f"[{datetime.datetime.utcnow()}] Scheduled task 'check_unconfigured_pii' finished. All PII fields are configured.")
    except Exception as e:
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'check_unconfigured_pii': {e}")
    finally:
        db.close()

def run_update_behavioral_profiles():
    """Scheduled job to analyze interactions and update behavioral profiles."""
    print(f"[{datetime.datetime.utcnow()}] Running scheduled task: Update Customer Behavioral Profiles...")
    db = SessionLocal()
    try:
        service = AIService()
        summary = service.run_and_log_behavioral_profile_update(db=db, triggered_by="SYSTEM_SCHEDULER")
        print(f"[{datetime.datetime.utcnow()}] Scheduled task 'update_behavioral_profiles' finished. Updated {summary.get('profiles_updated', 0)} profiles.")
    except Exception as e:
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'update_behavioral_profiles': {e}")
    finally:
        db.close()

def run_scheduled_insights():
    """Scheduled job to find and execute due insights from the Insights Factory."""
    print(f"[{datetime.datetime.utcnow()}] Running scheduled task: Execute Scheduled Insights...")
    db = SessionLocal()
    try:
        service = AIService()
        summary = service.run_scheduled_insights(db=db)
        if summary.get("executed_count", 0) > 0:
            print(f"[{datetime.datetime.utcnow()}] Scheduled task 'run_scheduled_insights' finished. Executed {summary['executed_count']} insight(s).")
    except Exception as e:
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'run_scheduled_insights': {e}")
    finally:
        db.close()

def run_outbox_relay():
    """
    Scheduled job to relay transactional outbox events to the message broker.
    Guarantees 'At-Least-Once' delivery decoupled from the primary web transactions.
    """
    db = SessionLocal()
    try:
        import models
        import asyncio
        from event_bus import global_event_bus, SystemEvent
        
        events = db.query(models.TransactionalOutboxEvent).filter(models.TransactionalOutboxEvent.status == "PENDING").limit(100).all()
        if not events:
            return
            
        for outbox_event in events:
            system_event = SystemEvent(**outbox_event.payload)
            asyncio.run(global_event_bus.broadcast(system_event, db=None))
            outbox_event.status = "PUBLISHED"
        db.commit()
        print(f"[{datetime.datetime.utcnow()}] Scheduled task 'run_outbox_relay' finished. Relayed {len(events)} events.")
    except Exception as e:
        db.rollback()
        print(f"[{datetime.datetime.utcnow()}] ERROR during scheduled task 'run_outbox_relay': {e}")
    finally:
        db.close()


# --- Scheduler Initialization ---

scheduler = BackgroundScheduler(timezone="UTC")

def start_scheduler():
    """Adds all maintenance jobs to the scheduler and starts it."""
    print("Initializing background scheduler...")
    scheduler.add_job(run_archive_ingestion_jobs, 'interval', days=1, id='archive_jobs_task', replace_existing=True)
    scheduler.add_job(run_cleanup_execution_logs, 'interval', days=1, id='cleanup_logs_task', replace_existing=True)
    scheduler.add_job(run_flag_stuck_jobs, 'interval', hours=1, id='stuck_jobs_task', replace_existing=True)
    scheduler.add_job(run_flag_stale_tasks, 'interval', hours=6, id='stale_tasks_task', replace_existing=True)
    scheduler.add_job(run_summarize_ai_stats, 'interval', hours=6, id='summarize_ai_stats_task', replace_existing=True)
    scheduler.add_job(run_cleanup_interaction_events, 'interval', days=1, id='cleanup_interaction_events_task', replace_existing=True)
    scheduler.add_job(run_check_unconfigured_pii, 'interval', days=1, id='check_unconfigured_pii_task', replace_existing=True)
    scheduler.add_job(run_update_behavioral_profiles, 'interval', hours=1, id='update_behavioral_profiles_task', replace_existing=True)
    scheduler.add_job(run_scheduled_insights, 'interval', minutes=1, id='run_scheduled_insights_task', replace_existing=True)
    scheduler.add_job(run_outbox_relay, 'interval', seconds=5, id='outbox_relay_task', replace_existing=True)
    scheduler.start()
    print("✓ Background scheduler started with maintenance jobs.")