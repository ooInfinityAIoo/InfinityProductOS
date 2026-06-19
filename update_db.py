import sqlite3
import json

conn = sqlite3.connect('infinity_db.sqlite')
c = conn.cursor()

new_plan = [
    {"module_name": "ISO Field Registry Sync", "owner": "Data Governance Team", "sla_days": 2, "is_configured": False},
    {"module_name": "Document Master", "owner": "Document Processing Team", "sla_days": 3, "is_configured": False},
    {"module_name": "Unstructured Document", "owner": "AI Extraction Team", "sla_days": 5, "is_configured": False},
    {"module_name": "Behavioral Profile", "owner": "Risk Analysts", "sla_days": 4, "is_configured": False},
    {"module_name": "Event Repository", "owner": "Audit Team", "sla_days": 2, "is_configured": False},
    {"module_name": "DataGateway Mappers", "owner": "Integration Team", "sla_days": 5, "is_configured": False},
    {"module_name": "Business Rule Sets", "owner": "Risk Analysts", "sla_days": 4, "is_configured": False},
    {"module_name": "Calculation Engine", "owner": "Quantitative Team", "sla_days": 6, "is_configured": False},
    {"module_name": "API Designer", "owner": "Integration Team", "sla_days": 3, "is_configured": False},
    {"module_name": "Screen Designer", "owner": "UX Team", "sla_days": 5, "is_configured": False},
    {"module_name": "File Template Designer", "owner": "UX Team", "sla_days": 4, "is_configured": False},
    {"module_name": "Report Designer", "owner": "Reporting Team", "sla_days": 4, "is_configured": False},
    {"module_name": "Reconciliation Engine", "owner": "Finance Ops", "sla_days": 7, "is_configured": False},
    {"module_name": "Execution Audit", "owner": "Compliance Team", "sla_days": 2, "is_configured": False},
    {"module_name": "Insights Factory", "owner": "Data Science Team", "sla_days": 6, "is_configured": False},
    {"module_name": "Workflow Orchestration", "owner": "Product Ops", "sla_days": 7, "is_configured": False},
    {"module_name": "Ingestion Pipeline", "owner": "Data Eng Team", "sla_days": 5, "is_configured": False},
    {"module_name": "Ai Assistant Studio", "owner": "AI Team", "sla_days": 4, "is_configured": False}
]

c.execute('UPDATE master_product_application_packages SET configuration_plan = ? WHERE package_name = ?', (json.dumps(new_plan), 'Payment Hub'))
conn.commit()
conn.close()
print("Updated Payment Hub configuration_plan.")
