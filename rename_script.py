import os
import glob

def replace_in_file(filepath, old_str, new_str):
    if not os.path.exists(filepath):
        return
    with open(filepath, 'r') as f:
        content = f.read()
    if old_str in content:
        content = content.replace(old_str, new_str)
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Replaced in {filepath}")

files_to_check = [
    "src/components/IsoFieldSelector.tsx",
    "src/features/templates/FileTemplateDesignerStudio.tsx",
    "src/features/calculation-engine/CalculationEngineStudio.tsx",
    "src/features/field-registry/FieldRegistryStudio.tsx",
    "services/registry_processor.py",
    "e2e/user-journeys.spec.ts",
    "services/ai_services.py",
    "scripts/ingest_iso_repository.py",
    "seed.py",
    "schemas.py",
    "models.py",
    "routers/registry.py"
]

for f in files_to_check:
    replace_in_file(f, "preferred_business_name", "client_business_name")

print("Done renaming preferred_business_name to client_business_name")
