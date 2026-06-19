import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime
import uuid

# Add parent dir to path to import models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from models import ISOFieldDefinition

XML_FILE = "/Users/nisargshah/Downloads/20260511_ISO20022_2013_eRepository.iso20022"

def ingest():
    print(f"Loading {XML_FILE}...")
    try:
        context = ET.iterparse(XML_FILE, events=("start", "end"))
        
        db = SessionLocal()
        
        count = 0
        batch_size = 500
        fields_to_insert = []
        
        payment_keywords = ["Payment", "Settlement", "Transaction", "Remittance", "Account", "Amount", "Currency", "Card", "Merchant", "Clearing"]
        
        current_component = None
        
        for event, elem in context:
            if event == "start":
                xsi_type = elem.attrib.get("{http://www.w3.org/2001/XMLSchema-instance}type")
                
                if xsi_type in ["iso20022:MessageComponent", "iso20022:BusinessComponent"]:
                    current_component = elem.attrib.get("name", "Unknown")
                    
                elif xsi_type == "iso20022:MessageAttribute":
                    name = elem.attrib.get("name", "")
                    definition = elem.attrib.get("definition", "")
                    xml_tag = elem.attrib.get("xmlTag", "")
                    
                    if not name:
                        continue
                    
                    if current_component and any(k.lower() in current_component.lower() for k in payment_keywords):
                        field_id = f"FIELD-ISO-{str(uuid.uuid4())[:8].upper()}"
                        
                        data_type = "Text"
                        if "Amt" in xml_tag or "Amount" in name:
                            data_type = "Amount"
                        elif "Dt" in xml_tag or "Date" in name:
                            data_type = "Date"
                        elif "Ccy" in xml_tag or "Currency" in name:
                            data_type = "Alphanumeric"
                        elif "Id" in xml_tag or "Identification" in name:
                            data_type = "Alphanumeric"
                            
                        field = ISOFieldDefinition(
                            field_id=field_id,
                            technical_sys_name=f"{current_component}_{name}",
                            client_business_name=name,
                            iso_business_name=f"{current_component}.{name}",
                            data_type=data_type,
                            domain_category="PAYMENTS",
                            subdomain_category="ISO_GOLDEN_SOURCE",
                            description=definition,
                            is_mandatory=elem.attrib.get("minOccurs", "0") != "0",
                            default_value=None,
                            is_pii=False,
                            created_at=str(datetime.utcnow()),
                            created_by="ISO_IMPORT"
                        )
                        fields_to_insert.append(field)
                        count += 1
                        
                        if len(fields_to_insert) >= batch_size:
                            db.bulk_save_objects(fields_to_insert)
                            db.commit()
                            print(f"Inserted {count} fields...")
                            fields_to_insert = []
                            
                        if count >= 3000:
                            print("Reached 3000 field limit for demo.")
                            break
                            
            elif event == "end":
                if elem.tag.endswith("topLevelDictionaryEntry"):
                    current_component = None
                elem.clear()
                
        if fields_to_insert:
            db.bulk_save_objects(fields_to_insert)
            db.commit()
            print(f"Inserted {count} fields total.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    ingest()
