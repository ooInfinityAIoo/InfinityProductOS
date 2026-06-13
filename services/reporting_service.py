import io
import datetime
from typing import Dict, Any
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib import colors

class ReportingService:
    """
    Generates PDF reports for various system events, starting with workflow executions.
    """

    def generate_execution_report(self, execution_result: Dict[str, Any]) -> io.BytesIO:
        """
        Creates a PDF report from a workflow execution result.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18)
        
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(name='Code', fontName='Courier', fontSize=8, leading=10))

        story = []

        # --- Title ---
        story.append(Paragraph("Workflow Execution Report", styles['h1']))
        story.append(Spacer(1, 12))

        # --- Summary Table ---
        status_color = 'green' if execution_result.get('status') == 'COMPLETED' else 'red'
        summary_data = [
            ['Workflow ID:', Paragraph(execution_result.get('workflow_id', 'N/A'), styles['Normal'])],
            ['Execution Status:', Paragraph(f"<font color='{status_color}'>{execution_result.get('status', 'UNKNOWN')}</font>", styles['Normal'])],
            ['Report Generated:', Paragraph(datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"), styles['Normal'])],
        ]
        summary_table = Table(summary_data, colWidths=[120, 330])
        summary_table.setStyle(TableStyle([('GRID', (0,0), (-1,-1), 1, colors.black), ('VALIGN', (0,0), (-1,-1), 'MIDDLE')]))
        story.append(summary_table)
        story.append(Spacer(1, 24))

        # --- Final Context ---
        story.append(Paragraph("Final Context (Masked)", styles['h2']))
        final_context = execution_result.get('final_context', {})
        context_data = [['Field', 'Value']]
        context_data.extend([[Paragraph(key, styles['Normal']), Paragraph(str(value), styles['Code'])] for key, value in final_context.items()])
        
        context_table = Table(context_data, colWidths=[150, 300])
        context_table.setStyle(TableStyle([('GRID', (0,0), (-1,-1), 0.5, colors.grey), ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey)]))
        story.append(context_table)
        story.append(Spacer(1, 24))

        # --- Execution Trace ---
        story.append(Paragraph("Execution Trace", styles['h2']))
        trace_log = execution_result.get('trace', [])
        for line in trace_log:
            color = 'red' if "[ERROR]" in line else 'darkorange' if "[WARN]" in line else 'black'
            p = Paragraph(f"<font color='{color}'>{line}</font>", styles['Code'])
            story.append(p)
            
        doc.build(story)
        buffer.seek(0)
        return buffer