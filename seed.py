import os
import json
import datetime
from database import SessionLocal, engine
import models
from models import ISOFieldDefinition, WorkflowConfiguration

# Initialize clean database schema
models.Base.metadata.create_all(bind=engine)

db = SessionLocal()

try:
    # Check if fields already exist (idempotent seeding)
    existing_fields = db.query(ISOFieldDefinition).count()
    
    if existing_fields == 0:
        print("✓ Seeding ISO Field Registry with initial definitions...")
        
        # Bootstrap with core HELOC/FIGRE fields from index.html
        initial_fields = [
            {
                "technical_sys_name": "of_fintax_bal_01",
                "preferred_business_name": "Principal Amount",
                "iso_business_name": "Balances.Principal",
                "data_type": "Decimal",
                "domain_category": "HELOC",
                "subdomain_category": "FIGRE",
                "description": "Primary loan balance amount",
                "is_mandatory": True,
                "default_value": "0.00",
                "is_pii": False
            },
            {
                "technical_sys_name": "of_fintax_rate_05",
                "preferred_business_name": "Interest Rate Margin",
                "iso_business_name": "Rates.Margin",
                "data_type": "Alphanumeric",
                "domain_category": "HELOC",
                "subdomain_category": "FIGRE",
                "description": "Interest rate margin percentage",
                "is_mandatory": True,
                "default_value": "0.00",
                "is_pii": False
            },
            {
                "technical_sys_name": "of_fintax_date_09",
                "preferred_business_name": "Value Date",
                "iso_business_name": "Timeline.ValueDate",
                "data_type": "Date",
                "domain_category": "HELOC",
                "subdomain_category": "FIGRE",
                "description": "Effective date of transaction",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": False
            },
            {
                "technical_sys_name": "of_fintax_date_12",
                "preferred_business_name": "Ingestion Date",
                "iso_business_name": "Timeline.IngestDate",
                "data_type": "Date",
                "domain_category": "HELOC",
                "subdomain_category": "FIGRE",
                "description": "System ingestion timestamp",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": False
            },
            # Additional ISO 20022 fields for payments domain
            {
                "technical_sys_name": "iso_msg_id",
                "preferred_business_name": "Message ID",
                "iso_business_name": "Message.ID",
                "data_type": "Alphanumeric",
                "domain_category": "PAYMENTS",
                "subdomain_category": "RTGS",
                "description": "Unique message identifier",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": False
            },
            {
                "technical_sys_name": "iso_cb_field_name",
                "preferred_business_name": "Transaction Amount",
                "iso_business_name": "Amounts.TransactionAmount",
                "data_type": "Amount",
                "domain_category": "PAYMENTS",
                "subdomain_category": "RTGS",
                "description": "Core settlement amount",
                "is_mandatory": True,
                "default_value": "0.00",
                "is_pii": False
            },
            # Treasury domain fields
            {
                "technical_sys_name": "tsy_ccy_code",
                "preferred_business_name": "Currency Code",
                "iso_business_name": "Settlement.CurrencyCode",
                "data_type": "Alphanumeric",
                "domain_category": "TREASURY",
                "subdomain_category": "FX_TRADING",
                "description": "ISO 4217 currency code",
                "is_mandatory": True,
                "default_value": "USD",
                "is_pii": False
            },
            {
                "technical_sys_name": "tsy_settlement_date",
                "preferred_business_name": "Settlement Date",
                "iso_business_name": "Settlement.Date",
                "data_type": "Date",
                "domain_category": "TREASURY",
                "subdomain_category": "FX_TRADING",
                "description": "Date funds are settled",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": False
            },
            # New PII fields for demonstration
            {
                "technical_sys_name": "customer_name",
                "preferred_business_name": "Customer Name",
                "iso_business_name": "Customer.Name",
                "data_type": "Text",
                "domain_category": "PAYMENTS",
                "subdomain_category": "CUSTOMER_DATA",
                "description": "Full legal name of the customer.",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": True
            },
            {
                "technical_sys_name": "account_number",
                "preferred_business_name": "Account Number",
                "iso_business_name": "Account.Number",
                "data_type": "Alphanumeric",
                "domain_category": "PAYMENTS",
                "subdomain_category": "CUSTOMER_DATA",
                "description": "The customer's account number.",
                "is_mandatory": True,
                "default_value": None,
                "is_pii": True
            }
        ]
        
        current_time = str(datetime.datetime.utcnow())
        
        for idx, field_spec in enumerate(initial_fields):
            field_id = f"FIELD-{field_spec['domain_category'][:4]}-{str(idx).zfill(4)}"
            
            field = ISOFieldDefinition(
                field_id=field_id,
                technical_sys_name=field_spec["technical_sys_name"],
                preferred_business_name=field_spec["preferred_business_name"],
                iso_business_name=field_spec["iso_business_name"],
                data_type=field_spec["data_type"],
                domain_category=field_spec["domain_category"],
                subdomain_category=field_spec["subdomain_category"],
                description=field_spec["description"],
                is_mandatory=field_spec["is_mandatory"],
                is_pii=field_spec.get("is_pii", False),
                default_value=field_spec["default_value"],
                created_at=current_time,
                created_by="SEED_BOOTSTRAP"
            )
            db.add(field)
        
        db.commit()
        print(f"✓ Seeded {len(initial_fields)} ISO field definitions")
    else:
        print(f"✓ Field registry already populated with {existing_fields} fields")
    
    # Initialize database with clean schema
    print("✓ Database initialized with schema")
    db.commit()
    
except Exception as e:
    db.rollback()
    print(f"✗ Seeding error: {str(e)}")
finally:
    db.close()