import time
import csv
import io
import openpyxl
import datetime
import base64
import xml.etree.ElementTree as ET
from pypdf import PdfReader
from dbfread import DBF
import tempfile
import os

from database import RegionalSessionLocal
import models
from services.workflow_executor import WorkflowExecutor
from celery_app import celery_app

# This file represents tasks that would be executed by a distributed task queue worker (e.g., Celery).

@celery_app.task(name="process_file_task", bind=True, max_retries=3)
def process_file_task(self, job_id: str, mapper_id: str, workflow_id: str, file_contents_b64: str, filename: str, x_tenant_region: str = "DEFAULT"):
    """
    This function is executed by a dedicated background worker, completely isolated
    from the main web application process. It creates its own database session.
    """
    region_key = x_tenant_region.upper() if x_tenant_region else "DEFAULT"
    SessionClass = RegionalSessionLocal.get(region_key, RegionalSessionLocal["DEFAULT"])
    db = SessionClass()
    try:
        file_contents = base64.b64decode(file_contents_b64)

        job = db.query(models.IngestionJob).filter(models.IngestionJob.job_id == job_id).first()
        if not job or job.status != "PENDING":
            print(f"[WORKER_ERROR] Job {job_id} not found or not in PENDING state.")
            return

        job.status = "PROCESSING"
        job.processing_started_at = datetime.datetime.utcnow().isoformat()
        db.commit()

        mapper = db.query(models.PayloadMapperBlueprint).filter(models.PayloadMapperBlueprint.mapper_id == mapper_id).first()
        if not mapper:
            raise ValueError(f"Mapper with ID '{mapper_id}' not found.")

        records = []
        if filename.endswith('.csv'):
            decoded_file = file_contents.decode('utf-8')
            csv_reader = csv.DictReader(io.StringIO(decoded_file))
            records = [row for row in csv_reader]
        elif filename.endswith('.xlsx'):
            workbook = openpyxl.load_workbook(io.BytesIO(file_contents))
            sheet = workbook.active
            headers = [cell.value for cell in sheet[1]]
            for row in sheet.iter_rows(min_row=2, values_only=True):
                records.append(dict(zip(headers, row)))
        elif filename.endswith('.xml'):
            decoded_file = file_contents.decode('utf-8')
            root = ET.fromstring(decoded_file)
            # Assumes a flat XML structure where children of root are individual records
            for item in root:
                record = {child.tag: child.text for child in item}
                if record:
                    records.append(record)
        elif filename.endswith('.pdf'):
            reader = PdfReader(io.BytesIO(file_contents))
            full_text = "\n".join([page.extract_text() for page in reader.pages if page.extract_text()])
            # Treat the entire PDF as a single record payload for downstream Regex Mappers
            records.append({"raw_pdf_text": full_text.strip()})
        elif filename.lower().endswith('.dbf'):
            # DBF reader requires a physical file path, so we use a secure temp file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.dbf') as tmp:
                tmp.write(file_contents)
                tmp_path = tmp.name
            try:
                for record in DBF(tmp_path, load=True):
                    records.append(dict(record))
            finally:
                os.remove(tmp_path)
        else:
            raise ValueError(f"Unsupported file type: {filename}")

        job.total_records = len(records)
        db.commit()

        executor = WorkflowExecutor(db=db, workflow_id=workflow_id)
        processed_count = 0

        for i, record in enumerate(records):
            transformed_payload = {}
            for mapping in mapper.mappings:
                source_value = record.get(mapping.source_path)
                if source_value is not None:
                    transformed_payload[mapping.target_iso_field] = source_value
                elif mapping.is_mandatory:
                    continue
                elif mapping.default_value is not None:
                    transformed_payload[mapping.target_iso_field] = mapping.default_value
            
            if transformed_payload:
                executor.execute(initial_payload=transformed_payload)
                processed_count += 1

        job.processed_records = processed_count
        job.status = "COMPLETED"
        job.completed_at = datetime.datetime.utcnow().isoformat()
        db.commit()

    except Exception as e:
        job.status = "FAILED"; job.error_message = str(e); job.completed_at = datetime.datetime.utcnow().isoformat(); db.commit()
    finally:
        db.close()