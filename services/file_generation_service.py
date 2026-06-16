import csv
import io
import openpyxl
import datetime
from typing import List, Dict, Any
from sqlalchemy.orm import Session
import models

class FileGenerationService:
    """
    Layer 4: Outbound File Compiler.
    Transforms structured JSON arrays into physical files (CSV, Fixed-Length TXT, XLSX)
    based on the physical layout definitions of a TemplateDesignerModel.
    """
    def __init__(self, db: Session):
        self.db = db

    def generate_file(self, template_id: str, data: List[Dict[str, Any]]) -> tuple:
        template = self.db.query(models.TemplateDesignerModel).filter(
            models.TemplateDesignerModel.template_id == template_id
        ).first()
        
        if not template:
            raise ValueError(f"Template '{template_id}' not found.")
        if template.template_type != "DOWNLOAD":
            raise ValueError(f"Template '{template_id}' is not configured as a DOWNLOAD template.")
        
        buffer = io.BytesIO()
        timestamp = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
        filename = f"{template.template_name.replace(' ', '_')}_{timestamp}"
        
        # Sort fields by their defined visual/byte sequence order
        fields = sorted(template.fields, key=lambda f: f.column_sequence_no)
        
        if template.file_type == "CSV":
            delimiter = template.delimiter_record_separator or ","
            string_buffer = io.StringIO()
            writer = csv.writer(string_buffer, delimiter=delimiter)
            
            if template.file_has_header_footer in ["HEADER", "BOTH"]:
                writer.writerow([f.extracted_field_name for f in fields])
                
            for row in data:
                writer.writerow([row.get(f.extracted_field_name, f.default_value_fallback or "") for f in fields])
                
            buffer.write(string_buffer.getvalue().encode('utf-8'))
            filename += ".csv"
            media_type = "text/csv"
            
        elif template.file_type == "TXT" and template.text_file_type == "FIXED_LENGTH":
            string_buffer = io.StringIO()
            for row in data:
                line = ""
                for f in fields:
                    val = str(row.get(f.extracted_field_name, f.default_value_fallback or ""))
                    max_len = f.max_length or len(val)
                    pad_char = f.padding_character or " "
                    
                    # Truncate if too long, pad if too short
                    val = val[:max_len]
                    val = val.rjust(max_len, pad_char) if f.padding_position == "PREFIX" else val.ljust(max_len, pad_char)
                    line += val
                string_buffer.write(line + "\n")
                
            buffer.write(string_buffer.getvalue().encode('utf-8'))
            filename += ".txt"
            media_type = "text/plain"
            
        else:
            raise ValueError(f"Outbound file generation for format '{template.file_type}' is currently unsupported.")
            
        buffer.seek(0)
        return buffer, filename, media_type