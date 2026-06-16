import unittest
from unittest.mock import MagicMock, patch
import base64
import os

import models
from tasks import process_file_task

class TestTasksDBFIngestion(unittest.TestCase):
    """
    Test suite to prove the structural safety and accurate data parsing of 
    isolated background worker tasks (Layer 3 & 4).
    """

    @patch('tasks.RegionalSessionLocal')
    @patch('tasks.WorkflowExecutor')
    @patch('tasks.DBF')
    def test_process_dbf_file_payload_generation(self, mock_dbf, mock_executor_class, mock_session_local):
        # 1. Setup Database Mocks
        mock_db = MagicMock()
        mock_session_class = MagicMock(return_value=mock_db)
        mock_session_local.get.return_value = mock_session_class

        # Mock the IngestionJob database record
        mock_job = MagicMock(spec=models.IngestionJob)
        mock_job.status = "PENDING"
        
        # Mock the Mapper Blueprint to translate our legacy field to an ISO field
        mock_mapper = MagicMock(spec=models.PayloadMapperBlueprint)
        mock_mapping = MagicMock()
        mock_mapping.source_path = "LEGACY_BAL"
        mock_mapping.target_iso_field = "of_fintax_bal_01"
        mock_mapping.is_mandatory = False
        mock_mapping.default_value = None
        mock_mapper.mappings = [mock_mapping]

        # Configure DB query to return our mocks
        def db_query_side_effect(model):
            query_mock = MagicMock()
            if model == models.IngestionJob:
                query_mock.filter.return_value.first.return_value = mock_job
            elif model == models.PayloadMapperBlueprint:
                query_mock.filter.return_value.first.return_value = mock_mapper
            return query_mock
        
        mock_db.query.side_effect = db_query_side_effect

        # 2. Setup DBF Mock Data
        # The DBF library returns an iterable of dictionaries representing the mainframe rows
        mock_dbf.return_value = [
            {"LEGACY_BAL": 150000.50, "IGNORE_THIS": "DATA"}
        ]

        # 3. Setup Executor Mock
        mock_executor_instance = MagicMock()
        mock_executor_class.return_value = mock_executor_instance

        # 4. Create dummy base64 file payload (mimics the API dispatcher)
        dummy_b64 = base64.b64encode(b"mock_dbf_binary_header_content").decode('utf-8')

        # 5. Execute the Celery Task directly
        process_file_task.run(
            job_id="JOB-DBF-1",
            mapper_id="MAP-DBF-1",
            workflow_id="WF-DBF-1",
            file_contents_b64=dummy_b64,
            filename="mainframe_export.dbf",
            x_tenant_region="DEFAULT"
        )

        # 6. Assertions & Validation
        # Verify the background worker successfully parsed and transformed the data
        mock_executor_instance.execute.assert_called_once_with(
            initial_payload={"of_fintax_bal_01": 150000.50}
        )
        self.assertEqual(mock_job.total_records, 1)
        self.assertEqual(mock_job.status, "COMPLETED")
        
        # Verify temp file isolation and cleanup was successful
        temp_file_path = mock_dbf.call_args[0][0]
        self.assertFalse(os.path.exists(temp_file_path), "CRITICAL: Temporary DBF file was not cleaned up, risking file descriptor leaks!")

if __name__ == '__main__':
    unittest.main()