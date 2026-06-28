import sqlite3

def cleanup():
    conn = sqlite3.connect('infinity_db.sqlite')
    cur = conn.cursor()
    
    # 1. Find all temp packages starting with "UAT Payments " or "E2E Payments "
    cur.execute("SELECT package_id, package_name FROM master_product_application_packages WHERE package_name LIKE 'UAT Payments %' OR package_name LIKE 'E2E Payments %'")
    temp_packages = cur.fetchall()
    
    if not temp_packages:
        print("No temporary packages found to clean up.")
        conn.close()
        return
        
    print(f"Found {len(temp_packages)} temporary packages to delete:")
    for pid, name in temp_packages:
        print(f"  - {pid}: {name}")
        
    pkg_ids = [p[0] for p in temp_packages]
    pkg_ids_placeholder = ",".join(f"'{p}'" for p in pkg_ids)
    
    # Tables that use 'package_id':
    tables_with_pkg_id = [
        "product_master",
        "package_iso_domains",
        "business_domains",
        "role_profiles",
        "external_queue_connections",
        "message_queues",
    ]
    
    # Tables that use 'application_package_id':
    tables_with_app_pkg_id = [
        "insight_definitions",
        "report_blueprints",
        "screen_templates",
        "batch_gateway_configurations",
        "document_checklists",
        "communication_templates",
        "entitlement_policies",
        "notification_policies",
        "unstructured_extraction_blueprints",
        "workflow_configurations",
        "symbolic_formula_registry",
        "business_rule_sets",
        "reconciliation_templates",
        "payload_mapper_blueprints",
        "api_configurations",
        "calculation_programs",
        "iso_field_registry",
    ]
    
    # Delete dependent child entries that refer to parents (like subproducts -> products, nodes/edges -> workflows)
    # Get all workflow IDs for these packages to delete their nodes, edges, swimlanes, instances
    cur.execute(f"SELECT workflow_id FROM workflow_configurations WHERE application_package_id IN ({pkg_ids_placeholder})")
    wf_ids = [r[0] for r in cur.fetchall()]
    if wf_ids:
        wf_ids_placeholder = ",".join(f"'{w}'" for w in wf_ids)
        print(f"Deleting child rows for {len(wf_ids)} workflows...")
        cur.execute(f"DELETE FROM workflow_nodes WHERE workflow_id IN ({wf_ids_placeholder})")
        cur.execute(f"DELETE FROM workflow_edges WHERE workflow_id IN ({wf_ids_placeholder})")
        cur.execute(f"DELETE FROM workflow_participants WHERE workflow_id IN ({wf_ids_placeholder})")
        cur.execute(f"DELETE FROM workflow_versions WHERE workflow_id IN ({wf_ids_placeholder})")
        
    # Get all product IDs for these packages to delete their subproducts and field mappings
    cur.execute(f"SELECT product_id FROM product_master WHERE package_id IN ({pkg_ids_placeholder})")
    prod_ids = [r[0] for r in cur.fetchall()]
    if prod_ids:
        prod_ids_placeholder = ",".join(f"'{p}'" for p in prod_ids)
        print(f"Deleting child rows for {len(prod_ids)} products...")
        cur.execute(f"DELETE FROM subproduct_master WHERE product_id IN ({prod_ids_placeholder})")
        cur.execute(f"DELETE FROM field_product_map WHERE product_id IN ({prod_ids_placeholder})")

    # Delete from main tables having package_id
    for table in tables_with_pkg_id:
        try:
            cur.execute(f"DELETE FROM {table} WHERE package_id IN ({pkg_ids_placeholder})")
            print(f"Deleted related rows from {table}")
        except Exception as e:
            print(f"Could not delete from {table}: {e}")
            
    # Delete from main tables having application_package_id
    for table in tables_with_app_pkg_id:
        try:
            cur.execute(f"DELETE FROM {table} WHERE application_package_id IN ({pkg_ids_placeholder})")
            print(f"Deleted related rows from {table}")
        except Exception as e:
            print(f"Could not delete from {table}: {e}")
            
    # Finally delete the packages
    cur.execute(f"DELETE FROM master_product_application_packages WHERE package_id IN ({pkg_ids_placeholder})")
    print(f"Deleted packages from master_product_application_packages")
    
    conn.commit()
    conn.close()
    print("Cleanup completed successfully.")

if __name__ == "__main__":
    cleanup()
