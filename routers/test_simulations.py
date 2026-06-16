import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app
from database import get_db
import models

class TestSimulationsRouter(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.mock_db = MagicMock()
        
        # Override the get_db dependency
        app.dependency_overrides[get_db] = lambda: self.mock_db
        
        # Mock auth dependency functions
        self.mock_user = MagicMock()
        self.mock_user.id = "US-TEST-001"
        self.mock_user.role = "DESIGNER"
        
        from auth import get_current_user, require_designer_privileges
        app.dependency_overrides[get_current_user] = lambda: self.mock_user
        app.dependency_overrides[require_designer_privileges] = lambda: self.mock_user

    def tearDown(self):
        # Clear dependency overrides
        app.dependency_overrides.clear()

    def test_create_scenario_success(self):
        # Setup mocks
        mock_wf = MagicMock(spec=models.WorkflowConfiguration)
        mock_wf.workflow_id = "WF-1"
        self.mock_db.query.return_value.filter.return_value.first.return_value = mock_wf

        payload = {
            "simulation_name": "Test Simulation Scenario",
            "description": "Stress-testing HELOC pipeline",
            "target_workflow_id": "WF-1",
            "sample_size": 100,
            "scenario_variables": {"interest_rate_modifier": 0.05},
            "historical_dataset_source": "SYNTHETIC_GENERATION"
        }
        
        response = self.client.post("/api/v1/simulations/", json=payload)
        
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["simulation_name"], payload["simulation_name"])
        self.assertEqual(data["target_workflow_id"], payload["target_workflow_id"])
        self.mock_db.add.assert_called_once()
        self.mock_db.commit.assert_called_once()

    def test_list_scenarios(self):
        mock_scenario = MagicMock(spec=models.SimulationScenario)
        mock_scenario.simulation_id = "SIM-1"
        mock_scenario.simulation_name = "Test Sim"
        mock_scenario.target_workflow_id = "WF-1"
        mock_scenario.sample_size = 100
        mock_scenario.scenario_variables = {}
        mock_scenario.historical_dataset_source = "SYNTHETIC"
        mock_scenario.created_at = "2026-06-15"
        mock_scenario.description = None
        
        self.mock_db.query.return_value.order_by.return_value.all.return_value = [mock_scenario]
        
        response = self.client.get("/api/v1/simulations/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["simulation_id"], "SIM-1")

    @patch('routers.simulations.BackgroundTasks.add_task')
    def test_execute_simulation(self, mock_add_task):
        mock_scenario = MagicMock(spec=models.SimulationScenario)
        mock_scenario.simulation_id = "SIM-1"
        mock_scenario.sample_size = 100
        
        self.mock_db.query.return_value.filter.return_value.first.side_effect = [mock_scenario, None] # for query of scenario and then job refresh/add
        
        response = self.client.post("/api/v1/simulations/SIM-1/execute")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "PENDING")
        self.assertEqual(data["total_records"], 100)
        mock_add_task.assert_called_once()

    def test_get_job_status(self):
        mock_job = MagicMock(spec=models.SimulationJob)
        mock_job.job_id = "SJOB-1"
        mock_job.status = "COMPLETED"
        mock_job.processed_records = 100
        mock_job.total_records = 100
        mock_job.results_summary = {"success_rate": "95%"}
        mock_job.created_at = "2026-06-15"
        mock_job.simulation_id = "SIM-1"
        
        self.mock_db.query.return_value.filter.return_value.first.return_value = mock_job
        
        response = self.client.get("/api/v1/simulations/jobs/SJOB-1")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["job_id"], "SJOB-1")
        self.assertEqual(data["status"], "COMPLETED")
