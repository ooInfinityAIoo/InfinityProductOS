const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak
} = require('docx');
const fs = require('fs');

// ── Helpers ──────────────────────────────────────────────────────────────────

const BLUE   = "1E3A5F";
const LBLUE  = "2563EB";
const GREY   = "64748B";
const LGREY  = "F1F5F9";
const WHITE  = "FFFFFF";
const GREEN  = "166534";
const LGREEN = "DCFCE7";
const AMBER  = "92400E";
const LAMBER = "FEF3C7";
const RED    = "991B1B";
const LRED   = "FEE2E2";

const border = (color = "E2E8F0") => ({ style: BorderStyle.SINGLE, size: 1, color });
const allBorders = (color) => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    children: [new TextRun({ text, font: "Arial", size: 36, bold: true, color: BLUE })],
    spacing: { before: 0, after: 240 },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color: BLUE })],
    spacing: { before: 320, after: 120 },
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: LBLUE })],
    spacing: { before: 240, after: 80 },
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Arial", size: 22, color: opts.color || "334155", bold: opts.bold || false })],
    spacing: { before: 60, after: 60 },
    ...(opts.indent ? { indent: { left: 360 } } : {}),
  });
}

function bullet(text, bold_prefix = null) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: bold_prefix
      ? [new TextRun({ text: bold_prefix, font: "Arial", size: 22, bold: true, color: "334155" }),
         new TextRun({ text, font: "Arial", size: 22, color: "334155" })]
      : [new TextRun({ text, font: "Arial", size: 22, color: "334155" })],
    spacing: { before: 40, after: 40 },
  });
}

function spacer(lines = 1) {
  return new Paragraph({ children: [new TextRun({ text: "", size: 22 * lines })], spacing: { before: 0, after: 0 } });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 1 } },
    children: [new TextRun("")],
    spacing: { before: 160, after: 160 },
  });
}

function callout(text, bg = LGREY, textColor = "334155") {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({ children: [new TableCell({
      borders: allBorders("CBD5E1"),
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      width: { size: 9360, type: WidthType.DXA },
      children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 21, color: textColor, italics: true })] })],
    })]})],
  });
}

function twoColTable(rows, col1Width = 3000) {
  const col2Width = 9360 - col1Width;
  const b = allBorders("E2E8F0");
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [col1Width, col2Width],
    rows: rows.map((row, i) => new TableRow({
      children: [
        new TableCell({
          borders: b,
          shading: { fill: i === 0 ? BLUE : LGREY, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          width: { size: col1Width, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: row[0], font: "Arial", size: 20, bold: i === 0, color: i === 0 ? WHITE : "334155" })] })],
        }),
        new TableCell({
          borders: b,
          shading: { fill: i === 0 ? BLUE : WHITE, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          width: { size: col2Width, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: row[1], font: "Arial", size: 20, bold: i === 0, color: i === 0 ? WHITE : "334155" })] })],
        }),
      ],
    })),
  });
}

function badge(label, bg, textColor) {
  // Render as inline bold text with a bracket style
  return new TextRun({ text: `[${label}]`, font: "Arial", size: 18, bold: true, color: textColor });
}

// ── Document ─────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] },
    ],
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: LBLUE },
        paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 2 } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
      },
    },
    headers: {
      default: new Header({ children: [
        new Paragraph({
          children: [
            new TextRun({ text: "InfinityProductOS", font: "Arial", size: 18, bold: true, color: BLUE }),
            new TextRun({ text: "   |   Functional User Guide   |   Jun 2026", font: "Arial", size: 18, color: GREY }),
          ],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 1 } },
        }),
      ]}),
    },
    footers: {
      default: new Footer({ children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 18, color: GREY }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: GREY }),
            new TextRun({ text: " of ", font: "Arial", size: 18, color: GREY }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18, color: GREY }),
          ],
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 1 } },
        }),
      ]}),
    },
    children: [

      // ── COVER PAGE ───────────────────────────────────────────────────────
      new Paragraph({
        children: [new TextRun({ text: "", size: 22 })],
        spacing: { before: 1440, after: 0 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "InfinityProductOS", font: "Arial", size: 72, bold: true, color: BLUE })],
        spacing: { before: 0, after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Functional User Guide", font: "Arial", size: 40, color: GREY })],
        spacing: { before: 0, after: 240 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LBLUE, space: 1 } },
        children: [new TextRun({ text: "", size: 22 })],
        spacing: { before: 0, after: 480 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Enterprise Payment Workflow Platform", font: "Arial", size: 28, color: GREY })],
        spacing: { before: 480, after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Built Jun 12 – Jun 22, 2026", font: "Arial", size: 24, color: GREY })],
        spacing: { before: 0, after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "AI Developers: Gemini (Foundation)  +  Claude (Integration & Runtime)", font: "Arial", size: 22, color: GREY, italics: true })],
        spacing: { before: 0, after: 2400 },
      }),
      twoColTable([
        ["Stat", "Value"],
        ["Total commits", "107"],
        ["Studios built", "15+"],
        ["ISO 20022 fields", "3,013"],
        ["Workflow templates", "35+"],
        ["Transaction lifecycle states", "12"],
        ["Workflow steps wired", "137 (100%)"],
      ], 3600),

      // ── SECTION 1 ────────────────────────────────────────────────────────
      h1("1. Platform Overview"),
      body("InfinityProductOS is an enterprise payment workflow platform built on a single architectural principle: no business logic is hardcoded. Every rule, workflow graph, calculation formula, API configuration, and screen definition is stored as structured data in the database and interpreted at runtime by stateless execution engines."),
      spacer(),
      body("This means:"),
      bullet("Rules and workflows take effect the moment you save them — no code deployment needed"),
      bullet("Every change is versioned and auditable in the database"),
      bullet("AI assistants (Claude + Gemini) can read and generate logic programmatically"),
      bullet("The same engine runs in dev (SQLite) and production (PostgreSQL) without code changes"),
      spacer(),
      h2("1.1 The 8-Layer Architecture"),
      twoColTable([
        ["Layer", "Name & Purpose"],
        ["L0 — Physical Edge", "Devices (POS, mobile, IoT). Data producers and consumers only — no logic runs here."],
        ["L1 — Visual Studios", "React canvas studios where business users author logic: rules, workflows, calculations, screens."],
        ["L2 — Agentic AI", "Infinity AI assistant — NLP prompt-to-canvas, image-to-workflow, behavioral AI, legacy logic decomposition."],
        ["L3 — Semantic Bloodstream", "ISO 20022 Field Registry — 3,013 fields that form the universal vocabulary connecting all studios."],
        ["L4 — Deterministic Execution", "FastAPI + Python engines + event bus. Runs the logic authored in L1 against real transaction data."],
        ["L5 — Persistent Storage", "SQLite (local dev) / PostgreSQL (production). Immutable evidence ledger for all transactions."],
        ["L6 — Governance & Compliance", "PII masking, 4-Eye approval checks, OIDC auth, append-only audit log."],
        ["L7 — Global Isolation", "Multi-tenant, multi-region, multi-currency, multi-language isolation."],
        ["L8 — Fault Tolerance", "Celery async checkpointing, atomic DB transactions, circuit breakers on all external APIs."],
      ], 2800),
      spacer(),
      h2("1.2 How the Engines Connect"),
      body("The flow from authoring to execution:"),
      bullet("You author a workflow in the Workflow Designer (L1). It saves as a JSON graph in the database."),
      bullet("You author rules in the Business Rules Studio (L1). They save as JSON conditions with token codes."),
      bullet("You author formulas in the Calculation Engine (L1). They save as symbolic expressions."),
      bullet("At runtime, a payment transaction hits the Workflow Executor (L4). It walks the graph node by node."),
      bullet("At each node, the executor invokes: Business Rule Engine (evaluates conditions) + Calculation Engine (resolves formulas) + API Dispatcher (calls external systems) + Event Bus (broadcasts events)."),
      bullet("Results update the WorkflowExecutionInstance record. The Transaction Workflow Screen polls this and renders the metro tracker in real time."),
      spacer(),
      h2("1.3 Package System — How Multi-Tenancy Works"),
      body("The platform is organized into Product Packages. Everything you do is scoped to a package."),
      bullet("A Package is a business unit or product line (e.g. \"Payment Hub\", \"Trade Finance\")"),
      bullet("Each Package contains Products (e.g. \"SWIFT Cross-Border\", \"FedNow Instant Payment\")"),
      bullet("Each Product can have Sub-Products"),
      bullet("Studios only show data relevant to the active package + product context"),
      bullet("The Two-Key Cockpit Lockdown enforces this: both package AND product must be selected before designer studios activate"),
      callout("How to set context: Click your package name in the top-left corner. Select a Package from the dropdown, then select a Product. The lock banner turns green when both are set.", LGREEN, GREEN),

      // ── SECTION 2 ────────────────────────────────────────────────────────
      h1("2. Navigation Guide"),
      body("The platform has four main navigation areas accessible from the top menu bar."),
      spacer(),
      h2("2.1 Master Data"),
      body("Reference data that all studios depend on. Set this up first when onboarding a new product."),
      twoColTable([
        ["Menu Item", "What it contains"],
        ["ISO Field Registry", "All 3,013 ISO 20022 standard fields. The vocabulary for every studio."],
        ["Packages", "Create and manage Product Packages (top-level tenants)."],
        ["Products", "Products within a package. Each gets its own studio context."],
        ["Sub-Products", "Third level of the hierarchy for granular product variants."],
        ["Roles & Users", "User role definitions (Admin, Designer, Operator, Auditor, Risk)."],
        ["Authorization Matrix", "Which roles can access which studios and actions."],
        ["Access & Authorization", "Entitlement configuration: rule-based access policies per product."],
      ], 3000),
      spacer(),
      h2("2.2 Designer Studio"),
      body("Where business users author all logic. Organized into phases."),
      twoColTable([
        ["Studio", "What you build here"],
        ["ISO Field Registry", "Browse fields, set display preferences (ISO name vs bank's custom name), manage PII flags."],
        ["Screen Designer", "Build data-entry and review screens bound to ISO fields. Three types: Input, Review, Display."],
        ["Workflow Designer", "Draw payment workflow graphs. Add nodes, connect with condition arrows, set SLAs."],
        ["Business Rules Studio", "Author IF-THEN rules. Publish with token codes for workflows to reference."],
        ["Calculation Engine", "Define symbolic math formulas (FX conversion, net settlement, fees)."],
        ["API Designer", "Configure external API connections with rate limits, circuit breakers, PII masking."],
        ["Report Designer", "Build analytics dashboards with KPI cards, charts, and data grids."],
        ["Reconciliation Engine", "Define match rules for nostro/vostro account reconciliation."],
        ["File Template Designer", "Define fixed-width or delimited file formats for inbound payment files."],
        ["Data Gateway Mapper", "Map incoming file fields to ISO 20022 standard fields."],
        ["Notification Engine", "Author email, SMS, and letter templates."],
        ["Document Checklist Canvas", "Build compliance document checklists per product."],
        ["Unstructured Document Studio", "Onboard legacy scanned documents with OCR and AI extraction."],
        ["Integration Gateway", "API Gateway Designer and Batch Gateway Designer for external system connectivity."],
        ["Legacy Screen Onboarding", "Import and digitize legacy mainframe screens using OCR + Anthropic Vision."],
      ], 3200),
      spacer(),
      h2("2.3 Runtime Operations"),
      body("Where operators run and monitor live transactions."),
      twoColTable([
        ["Menu Item", "Purpose"],
        ["Transaction Workflow Screen", "Watch live payments move through workflow nodes in real time. Take actions (approve, reject, retry, reverse)."],
        ["File Import Gateway", "Upload and execute inbound payment files against live workflows."],
        ["Reconciliation Tracker", "Monitor nostro/vostro match runs and view reconciliation parity."],
        ["Event Catalog", "Inspect system event logs and audit streams."],
        ["Execution Traces", "Deep-dive trace view for individual transaction node executions."],
        ["Global Technical Dashboard", "System telemetry: backend health, API connectivity, field registry status, Celery worker status."],
      ], 3200),
      spacer(),
      h2("2.4 360 Dashboard"),
      body("Portfolio-level health view across all packages and products. Shows KPI cards, implementation progress, governance exceptions, and role-based insights widgets. The Governance Inbox shows pending 4-Eye approvals and rule variances."),

      // ── SECTION 3 ────────────────────────────────────────────────────────
      h1("3. ISO Field Registry"),
      callout("The ISO Field Registry is the semantic backbone of the entire platform. Every field in every studio — rule conditions, formula variables, screen components, file mapper columns, report dimensions — is anchored to a field in this registry.", LGREY),
      spacer(),
      h2("3.1 What it contains"),
      bullet("3,013 ISO 20022 standard fields across all message types (pacs, camt, pain, admi)"),
      bullet("Each field has: ISO name, client display name, data type, PII flag, domain taxonomy"),
      bullet("Fields are organized by domain: Payment, Settlement, Compliance, Customer, Reference Data, etc."),
      spacer(),
      h2("3.2 What you can do"),
      twoColTable([
        ["Action", "How"],
        ["Search fields", "Type in the search box — debounced server-side search across all 3,013 fields instantly"],
        ["Filter by type", "Use the type filter dropdown (String, Decimal, Date, Boolean, etc.)"],
        ["Filter PII fields", "Toggle the PII filter to see only fields containing personal data"],
        ["Set display preference", "Click a field row, toggle between ISO Standard Name and Bank Custom Name — controls what studio dropdowns show"],
        ["Filter by domain", "Use the domain taxonomy filter to see fields for a specific payment message type"],
      ], 2800),
      spacer(),
      h2("3.3 Display Preference — why it matters"),
      body("Every studio dropdown that lets you pick a field (rules, formulas, screens, reports) reads the display preference:"),
      bullet("ISO mode: shows \"CreditorAgent.FinancialInstitutionIdentification.BICFI\""),
      bullet("Client mode: shows \"Beneficiary Bank BIC\" — your bank's plain-language name"),
      body("Set this per field via the registry. It affects every studio immediately."),

      // ── SECTION 4 ────────────────────────────────────────────────────────
      h1("4. Workflow Designer"),
      body("The Workflow Designer is a visual canvas where you draw the step-by-step graph of how a payment moves through your organization — from ingest through validation, enrichment, approval, and settlement."),
      spacer(),
      h2("4.1 Canvas basics"),
      bullet("Click the + button on any node to add a connected next node"),
      bullet("Drag nodes to reposition them on the canvas"),
      bullet("Click an arrow/edge to add a condition label (e.g. \"Amount > $10,000\" or \"OFAC: CLEAR\")"),
      bullet("Click a node to open the Properties Drawer on the right"),
      bullet("Toggle between Flow View (all nodes flat) and Swimlane View (grouped by team/participant)"),
      bullet("Use Save Draft to persist without activating, or Publish to make the workflow live"),
      spacer(),
      h2("4.2 Node types (21 canonical types)"),
      twoColTable([
        ["Node Type", "What it does"],
        ["START (green)", "Entry point — every workflow begins here"],
        ["END (red)", "Terminal node — workflow completes here"],
        ["BUSINESS_RULE (blue)", "Evaluates an IF-THEN rule at this step. Pick the rule from the token code dropdown."],
        ["CALCULATION (purple)", "Runs a symbolic formula. Pick the formula token. Result stored in execution context."],
        ["API_CALL (amber)", "Calls an external API (SWIFT GPI, FedNow, OFAC screening, etc.)"],
        ["HUMAN_APPROVAL (teal)", "Pauses the workflow. A human operator must Approve or Reject to continue."],
        ["EMIT_EVENT (orange)", "Broadcasts an event code to the event bus (e.g. EVT_PAYMENT_SETTLED)"],
        ["SUB_WORKFLOW (indigo)", "Executes another workflow as a nested child. Supports infinite nesting."],
        ["DECISION_GATEWAY (diamond)", "Branches the flow based on a condition. Routes to different next nodes."],
        ["RECONCILIATION (grey)", "Triggers a nostro/vostro reconciliation run at this step."],
        ["REPORT (light blue)", "Generates and attaches a report to the transaction record."],
        ["NOTIFICATION", "Sends an email/SMS/letter using a Notification Engine template."],
      ], 3200),
      spacer(),
      h2("4.3 Node Properties Drawer"),
      body("Click any node to open its properties. You can set:"),
      bullet("Node title and description"),
      bullet("Step type (from the 21 types above)"),
      bullet("Orchestration steps — the sequence of sub-actions at this node (invoke rule, then calc, then API, then emit event)"),
      bullet("SLA duration — how long this step is allowed to take before flagging as at-risk"),
      bullet("Failure handling — what happens if this node fails: RETRY, HALT, SKIP, or COMPENSATE"),
      bullet("Reversal recipe — how to undo this node if a reversal is triggered (DB rollback / compensating API call / event broadcast)"),
      bullet("Swimlane participant — which team owns this step"),
      spacer(),
      h2("4.4 ISO 20022 Template Library"),
      body("Start a new workflow from a pre-built template instead of drawing from scratch. 35+ templates available:"),
      twoColTable([
        ["Category", "Templates included"],
        ["SWIFT", "MT103 Cross-Border, MT202 Bank Transfer, pacs.008 Credit Transfer, pacs.009 Financial Institution Transfer"],
        ["FedNow", "Instant Credit Transfer, Request for Payment, Return Payment"],
        ["RTP (The Clearing House)", "Real-Time Payment Initiation, Return, Recall"],
        ["CHIPS", "Funds Transfer, Bilateral Settlement"],
        ["SEPA", "Credit Transfer (SCT), Instant Credit Transfer (SCT Inst), Direct Debit"],
        ["ACH", "Batch Credit, Batch Debit, IAT (International), Return, NOC"],
        ["Cash Management", "camt.052 Intraday Report, camt.053 Statement, camt.054 Debit/Credit Notification"],
      ], 2800),
      spacer(),
      h2("4.5 Image-to-Workflow (AI feature)"),
      body("Click the camera icon in the toolbar. Paste or upload a screenshot of any process diagram (Visio, PowerPoint, whiteboard photo, Lucidchart export). The AI parses it and populates the canvas with nodes and edges automatically."),
      spacer(),
      h2("4.6 Wiring Audit"),
      body("Click the link icon (Wiring Audit) in the Workflow Designer toolbar to open the Wiring Audit panel. This scans every workflow node across all workflows and shows any step that has a type (rule/formula/API) but no target assigned — meaning it would fire as a silent no-op at runtime."),
      bullet("Each unwired step shows a dropdown to pick the correct rule token, formula token, or API name"),
      bullet("Select your targets and click Apply Wiring — all changes save in one operation"),
      bullet("A green checkmark means all steps across all workflows are fully wired"),

      // ── SECTION 5 ────────────────────────────────────────────────────────
      h1("5. Business Rules Studio"),
      body("Author IF-THEN rules that the Workflow Executor evaluates at BUSINESS_RULE nodes. Rules are stored as JSON and evaluated at runtime — changing a rule takes effect on the next transaction, no deployment needed."),
      spacer(),
      h2("5.1 Rule anatomy"),
      bullet("Business Name — plain-language name (e.g. \"AML High-Value Threshold Check\")"),
      bullet("Token Code — the identifier workflows use to reference this rule (e.g. BRE-XBDR-AML-HVT-V1)"),
      bullet("Conditions — IF clauses: field comparisons, threshold checks, list lookups"),
      bullet("Actions — THEN clauses: what happens when conditions match"),
      spacer(),
      h2("5.2 Rule actions available"),
      twoColTable([
        ["Action", "Effect"],
        ["APPROVE_STEP", "Marks the node as passed. Workflow continues to the next node."],
        ["BLOCK_PAYMENT / REJECT_STEP", "Halts the entire workflow. Instance status becomes REJECTED. No further nodes execute."],
        ["FLAG_FOR_REVIEW", "Adds a flag to the instance and pauses for operator review."],
        ["CANCEL_TRANSACTION", "Voluntarily terminates the workflow. Status becomes CANCELLED (distinct from REJECTED)."],
        ["REQUIRE_4EYE", "Triggers a mandatory 4-Eye human approval at this point."],
        ["EMIT_EVENT", "Broadcasts an event code to the event bus."],
      ], 3200),
      spacer(),
      h2("5.3 Live rules (golden path)"),
      twoColTable([
        ["Token", "What it checks"],
        ["BRE-XBDR-AML-HVT-V1", "AML high-value threshold. Flags transactions over $500,000 for mandatory 4-Eye review."],
        ["BRE-XBDR-OFAC-SCRN-V1", "OFAC sanctions screening. Checks beneficiary name and BIC against sanctions lists. Blocks if match found."],
        ["BRE-XBDR-FX-STALE-V1", "FX rate staleness. Rejects if the FX rate in the transaction payload is more than 4 hours old."],
      ], 3200),

      // ── SECTION 6 ────────────────────────────────────────────────────────
      h1("6. Calculation Engine"),
      body("Define symbolic mathematical formulas that the Workflow Executor resolves at CALCULATION nodes. All arithmetic uses exact Decimal precision — no floating-point rounding errors in financial calculations."),
      spacer(),
      h2("6.1 Formula anatomy"),
      bullet("Business Name — plain-language name"),
      bullet("Token Code — identifier workflows reference (e.g. FX_CONVERTED_AMOUNT)"),
      bullet("Expression — symbolic formula using ISO field names as variables (e.g. INSTRUCTED_AMT * FX_RATE)"),
      bullet("Output field — where the result is stored in the execution context"),
      spacer(),
      h2("6.2 Live formulas (golden path)"),
      twoColTable([
        ["Token", "Formula", "What it calculates"],
        ["FX_CONVERTED_AMOUNT", "INSTRUCTED_AMT * FX_RATE", "Converts the payment amount to the settlement currency"],
        ["NET_SETTLEMENT_AMOUNT", "GROSS_AMOUNT - CORRESPONDENT_FEE", "Net amount after deducting correspondent bank fees"],
        ["CORRESPONDENT_FEE", "GROSS_AMOUNT * FEE_RATE", "Correspondent bank fee as a percentage of gross amount"],
        ["DAYS_OUTSTANDING", "TODAY - VALUE_DATE", "Number of days a payment has been outstanding"],
      ], 2400),
      spacer(),
      h2("6.3 Safety rules"),
      bullet("All values are cast to Decimal before any arithmetic — never Python floats"),
      bullet("Formulas use simpleeval (sandboxed evaluator) — raw eval() is never used"),
      bullet("Division by zero and undefined variable references return a structured error, not a crash"),

      // ── SECTION 7 ────────────────────────────────────────────────────────
      h1("7. API Designer"),
      body("Configure external API connections that workflow nodes can invoke. Every configuration enforces rate limiting and circuit breaking — no raw HTTP calls are made without these guardrails."),
      spacer(),
      h2("7.1 Configuration fields"),
      twoColTable([
        ["Field", "Purpose"],
        ["API Name", "Plain-language name (e.g. \"SWIFT GPI Tracker — Submit Payment\")"],
        ["Base URL", "The API endpoint base URL"],
        ["Auth method", "Bearer token, API key, OAuth2, mTLS"],
        ["Rate limit (RPS)", "Maximum requests per second enforced via token bucket"],
        ["Circuit breaker threshold", "Number of consecutive failures before the circuit opens (stops calling the API)"],
        ["Circuit breaker timeout", "Seconds to wait in open state before probing again (half-open)"],
        ["PII masking", "When enabled, all POST/PUT request bodies are PII-masked before sending"],
        ["Request / Response schema", "JSON schemas for validation"],
      ], 2800),
      spacer(),
      h2("7.2 Live API configurations (golden path)"),
      twoColTable([
        ["API", "Purpose"],
        ["SWIFT GPI Tracker — Submit Payment", "Submits a payment to the SWIFT gpi network and receives a UETR tracking reference"],
        ["Bank of England RTGS — Settlement Confirmation", "Confirms final settlement via the Bank of England RTGS system"],
        ["OFAC SDN Screening API", "Screens beneficiary name and BIC against the OFAC Specially Designated Nationals list"],
        ["FedNow Real-Time Settlement", "Submits instant payments to the Federal Reserve FedNow service"],
        ["Open Exchange Rates Feed", "Fetches live FX rates for currency conversion"],
        ["Refinitiv World-Check Screening", "Enhanced sanctions and PEP screening via Refinitiv"],
      ], 3200),

      // ── SECTION 8 ────────────────────────────────────────────────────────
      h1("8. Transaction Workflow Screen"),
      callout("This is the operations center of the platform. Everything you designed in the studios comes alive here. Watch payments move through your workflow in real time, take action on paused transactions, search across millions of records, and manage failed reversals.", LGREY),
      spacer(),
      h2("8.1 How to get there"),
      body("Top nav: Runtime Operations > Transaction Workflow Screen"),
      spacer(),
      h2("8.2 The Metro Tracker"),
      body("The central visualization is a London Underground-style metro map. Each station on the map is a workflow node. A payment progresses left-to-right through the stations as it executes."),
      spacer(),
      body("Station colors:"),
      twoColTable([
        ["Color", "Meaning"],
        ["Green (solid)", "Step completed successfully"],
        ["Blue (pulsing)", "Currently executing right now"],
        ["Amber (pulsing)", "Paused — waiting for human approval or manual action"],
        ["Red", "Blocked or failed — needs operator intervention"],
        ["Grey", "Not yet reached"],
        ["Purple", "Reversed — compensation completed"],
      ], 2800),
      spacer(),
      body("Below each station: a sub-text line showing context — retry count, cancellation reason, assigned repair agent, or approval status."),
      body("Parallel branches (e.g. simultaneous OFAC check and FX enrichment) appear as two rows of stations running side by side."),
      body("SLA badge on each station: ON TIME (green) / AT RISK (amber) / BREACHED (red)."),
      spacer(),
      h2("8.3 The 12 Transaction Lifecycle States"),
      twoColTable([
        ["State", "Meaning", "What the operator sees"],
        ["RUNNING", "Actively executing", "Blue pulsing station. No action needed — watch it progress."],
        ["PAUSED", "Waiting for 4-Eye approval", "Amber pulsing station. Approve or Reject buttons active."],
        ["COMPLETED", "All steps done", "All stations green. Execution trace shows full detail."],
        ["REJECTED", "A rule blocked it", "Red terminal station. Reason shown in trace (which rule, which condition)."],
        ["BLOCKED", "Technical error", "Red station. Retry button active. Error detail in step-issue panel."],
        ["CANCELLED", "Voluntarily stopped", "Grey terminal. Shows who/what cancelled and the reason code."],
        ["RETRYING", "Failed step being retried", "Amber station. Shows retry count (e.g. \"Retry 2/3\") and next attempt time."],
        ["AWAITING_REPAIR", "Assigned to repair queue", "Amber station. Shows assigned repair agent name."],
        ["FAILED_TECHNICAL", "Unrecoverable failure", "Red terminal. Requires manual escalation."],
        ["REVERSED", "Saga compensation done", "Purple stations. All compensating actions completed."],
        ["REVERSING", "Compensation in progress", "Purple pulsing. Reversal is executing."],
        ["REVERSAL_FAILED", "Compensation failed", "Red terminal. Lands in Reversal Recovery Queue for manual intervention."],
      ], 2000),
      spacer(),
      h2("8.4 Action Buttons"),
      body("The current step card (highlighted at the bottom of the tracker) shows context-sensitive action buttons:"),
      twoColTable([
        ["Button", "When available", "What it does"],
        ["Approve", "Status is PAUSED (4-Eye node)", "Resumes the workflow from the paused node. Next nodes begin executing immediately."],
        ["Reject", "Status is PAUSED", "Terminates the workflow as REJECTED. No further nodes run."],
        ["Retry", "Status is BLOCKED", "Re-executes the failed step. Increments retry counter. Max 3 retries before FAILED_TECHNICAL."],
        ["Cancel", "Any active status", "Voluntarily stops the workflow. Status becomes CANCELLED. Requires a reason code."],
        ["Reverse", "Any completed step", "Opens the Reversal Drawer to initiate saga compensation for a specific node."],
      ], 2200),
      body("Keyboard shortcuts: A = Approve, R = Reject, Escape = close panels."),
      spacer(),
      h2("8.5 Running a New Transaction"),
      body("Click the green Play (Run) button in the Transaction Workflow Screen header."),
      spacer(),
      body("The Run Transaction modal opens. Fill in:"),
      bullet("Workflow — pick from the dropdown (e.g. SWIFT Cross-Border Payment WF-ECC2B272)"),
      bullet("Amount — payment amount (e.g. 592500)"),
      bullet("Currency — ISO currency code (e.g. USD)"),
      bullet("Beneficiary BIC — the receiving bank's BIC code (e.g. BARCGB22)"),
      bullet("Beneficiary Name — the receiving bank name"),
      bullet("FX Rate — the exchange rate to apply"),
      bullet("Value Date — settlement date"),
      spacer(),
      body("Click Execute Transaction. Watch the metro tracker animate in real time:"),
      bullet("NODE-01: MT103 file ingest and parsing"),
      bullet("NODE-02: AML rule check (if amount > $500k, pauses for 4-Eye approval)"),
      bullet("NODE-03: OFAC sanctions screening via API"),
      bullet("NODE-04: FX conversion calculation"),
      bullet("NODE-05: SWIFT GPI submission + Bank of England RTGS confirmation"),
      spacer(),
      body("When the tracker pauses at NODE-02 (for amounts over $500k), click Approve to continue. The remaining nodes execute and the workflow completes."),
      spacer(),
      h2("8.6 Transaction Search"),
      body("The search bar at the top of the Transaction Workflow Screen supports multi-field search across all instances:"),
      twoColTable([
        ["Search field", "Example values"],
        ["Amount", "592500 or >500000 or 100000-200000"],
        ["Currency", "USD, EUR, GBP"],
        ["Beneficiary name", "Barclays, Deutsche Bank"],
        ["Beneficiary BIC", "BARCGB22, DEUTDEDB"],
        ["Status", "PAUSED, COMPLETED, REJECTED, BLOCKED"],
        ["Workflow name", "SWIFT, FedNow, SEPA"],
        ["Date range", "Today, Last 7 days, Custom range"],
        ["Instance ID", "WFI-0354D159310E"],
      ], 2800),
      spacer(),
      h2("8.7 Instance Picker"),
      body("The instance picker (top of screen) shows recent transactions with their current status. Click any row to load that transaction into the metro tracker. Shows: instance ID, workflow name, status badge, amount, timestamp."),
      spacer(),
      h2("8.8 Bulk Operations"),
      body("Select multiple transactions using the checkboxes in the instance list, then use the Bulk Operations panel:"),
      bullet("Approve all selected (for PAUSED instances)"),
      bullet("Retry all selected (for BLOCKED instances)"),
      bullet("Cancel all selected (with bulk reason code)"),
      spacer(),
      h2("8.9 Step Issue Detail Panel"),
      body("For any BLOCKED or FAILED step, click the station to open the Step Issue Detail Panel:"),
      bullet("Full error message and stack context"),
      bullet("Which API call failed (if it was an API_CALL node)"),
      bullet("Which rule condition failed (if it was a BUSINESS_RULE node)"),
      bullet("Retry button with countdown timer"),
      bullet("Escalate button to assign to repair queue"),
      spacer(),
      h2("8.10 Reversal Drawer"),
      body("For any completed workflow node, operators can initiate saga compensation. Click the node station, then click Reverse:"),
      bullet("DB Reversal — restores the database to the state before this node executed"),
      bullet("Compensating API Call — calls the reversal API configured in the node's reversal recipe"),
      bullet("Event Broadcast — emits a reversal event code to notify downstream systems"),
      body("The drawer shows which reversal method the workflow designer configured for this node, and requires the operator to confirm before executing."),
      spacer(),
      h2("8.11 Reversal Recovery Queue"),
      body("When a reversal fails (API timeout, DB restore error, event broadcast failure), the transaction lands in REVERSAL_FAILED state and appears in the Reversal Recovery Queue."),
      bullet("View all failed reversals across all workflows"),
      bullet("See: which node failed, when it landed, the error message"),
      bullet("Filter by Assigned / Unassigned"),
      bullet("Click View to load the full instance in the metro tracker for manual intervention"),
      spacer(),
      h2("8.12 Auto-Refresh"),
      body("Active transactions (RUNNING, PAUSED, RETRYING) refresh every 10 seconds automatically. No manual reload needed. The refresh indicator is shown in the top-right of the tracker. You can pause auto-refresh by clicking it."),

      // ── SECTION 9 ────────────────────────────────────────────────────────
      h1("9. Report Designer"),
      body("Build analytics dashboards with live data pulled from the platform's execution records."),
      spacer(),
      h2("9.1 Widget types"),
      twoColTable([
        ["Widget", "Use case"],
        ["KPI Card", "Single metric with trend indicator (e.g. Total Settlements Today: 1,247)"],
        ["Bar Chart", "Compare values across categories (e.g. transaction volume by currency)"],
        ["Line Chart", "Track metrics over time (e.g. daily settlement value over 30 days)"],
        ["Data Grid", "Tabular view of records with column sorting and filtering"],
        ["Pie / Donut", "Proportional breakdown (e.g. transactions by status)"],
        ["Gauge", "Single metric against a target (e.g. SLA compliance rate)"],
      ], 2800),
      spacer(),
      h2("9.2 Golden path report: Settlement Dashboard"),
      body("Pre-built dashboard with 6 widgets:"),
      bullet("KPI: Total Settlements Today"),
      bullet("KPI: Average FX Rate"),
      bullet("KPI: Failed Transactions"),
      bullet("Bar: Settlement Volume by Currency"),
      bullet("Line: 30-Day Settlement Trend"),
      bullet("Grid: Transaction Detail with status, amount, beneficiary, SLA status"),

      // ── SECTION 10 ───────────────────────────────────────────────────────
      h1("10. Reconciliation Engine"),
      body("Define match rules that compare your internal records (nostro) against correspondent bank records (vostro) to confirm settlement parity."),
      spacer(),
      h2("10.1 How it works"),
      bullet("Define a reconciliation template: which fields to match, tolerance thresholds, match priority"),
      bullet("Run the reconciliation job — the engine compares records and generates a match report"),
      bullet("Unmatched items appear in the Reconciliation Tracker for manual review"),
      bullet("Once matched, items are marked settled and the audit ledger is updated"),
      spacer(),
      h2("10.2 Golden path template"),
      body("\"Nostro vs Vostro Daily Matching\" with 4 match rules:"),
      bullet("Exact match on UETR (unique end-to-end transaction reference)"),
      bullet("Amount match within 0.01 tolerance (handles rounding differences)"),
      bullet("Value date match within T+1 window"),
      bullet("Currency code exact match"),

      // ── SECTION 11 ───────────────────────────────────────────────────────
      h1("11. Screen Designer"),
      body("Build data-entry and review screens that are bound directly to ISO 20022 fields. Screens are stored as JSON and rendered by the runtime — no frontend code deployment needed when you change a screen."),
      spacer(),
      h2("11.1 Screen types"),
      twoColTable([
        ["Type", "Use case"],
        ["Input Screen", "Data entry form for initiating a new payment. Fields validate against ISO field types."],
        ["Review Screen", "Read-only view of a transaction for 4-Eye reviewers. Shows all fields with their values."],
        ["Display Screen", "Customer-facing or reporting view. Can mask PII fields based on viewer role."],
      ], 2800),
      spacer(),
      h2("11.2 Screen components"),
      body("Each screen is composed of components, each bound to an ISO field:"),
      bullet("Text input — for string fields (beneficiary name, reference)"),
      bullet("Amount input — for decimal fields (automatically validates precision)"),
      bullet("Date picker — for date/datetime fields"),
      bullet("Dropdown — for coded fields (currency, country, message type)"),
      bullet("Checkbox — for boolean fields"),
      bullet("Multi-value list — for repeating fields"),

      // ── SECTION 12 ───────────────────────────────────────────────────────
      h1("12. Infinity AI Assistant"),
      body("The Infinity AI button (top nav, purple) opens the in-platform AI assistant. Available in every studio."),
      spacer(),
      h2("12.1 What you can ask it"),
      bullet("\"Create a workflow for SEPA Instant Credit Transfer\" — generates nodes and edges on the canvas"),
      bullet("\"Add an OFAC screening step before the settlement node\" — modifies the active workflow"),
      bullet("\"What does this rule token do?\" — explains any rule in plain language"),
      bullet("\"Generate a report showing settlements by currency this month\" — builds a report widget"),
      bullet("\"Why did transaction WFI-0354D159310E get rejected?\" — reads the execution trace and explains"),
      spacer(),
      h2("12.2 Image-to-Workflow"),
      body("In the Workflow Designer, paste a screenshot of any process diagram. The AI parses the image and populates the canvas with the corresponding workflow nodes and edges. Works with Visio exports, PowerPoint flow diagrams, Lucidchart screenshots, and whiteboard photos."),

      // ── SECTION 13 ───────────────────────────────────────────────────────
      h1("13. System Administration"),
      h2("13.1 Global Technical Dashboard"),
      body("Runtime Operations > Global Technical Dashboard. Shows live system health:"),
      twoColTable([
        ["Component", "What healthy looks like"],
        ["FastAPI Backend (port 8000)", "Connected < 10ms"],
        ["SQLite Ledger (local dev)", "Synchronized — Connected"],
        ["ISO Field Registry", "3,013 fields indexed — Connected"],
        ["Business Rule Engine", "19 rules compiled — Connected"],
        ["Audit Ledger", "Append-only — Secured — Connected"],
        ["Celery Worker (async jobs)", "Running (local mode: no broker — Warning is expected in dev)"],
      ], 3000),
      spacer(),
      h2("13.2 Starting the platform locally"),
      body("Backend (FastAPI on port 8000):"),
      callout("uvicorn main:app --reload --port 8000", LGREY, "1E3A5F"),
      spacer(),
      body("Frontend (Vite/React on port 5173):"),
      callout("npm run dev", LGREY, "1E3A5F"),
      spacer(),
      body("First-time setup (run once, in order):"),
      callout("python seed.py\npython seed_pkg.py\npython seed_golden_path.py", LGREY, "1E3A5F"),
      spacer(),
      body("API documentation (auto-generated, business language descriptions): http://localhost:8000/docs"),
      spacer(),
      h2("13.3 Authentication"),
      body("Local development: no login needed. The frontend automatically injects designer_admin credentials."),
      body("Production: OIDC / Bearer JWT. Set the OIDC_DOMAIN environment variable. All secrets via environment variables — never hardcoded."),

      // ── SECTION 14 — WHAT'S NEXT ─────────────────────────────────────────
      h1("14. Upcoming Features (E7)"),
      twoColTable([
        ["Feature", "What it will do", "Status"],
        ["Entitlements Enforcement", "Operators see only their team's transactions. Sales team sees sales queue, risk team sees risk queue. Enforced at the API level.", "In progress (Gemini)"],
        ["Event Fan-Out", "When a workflow emits an event (EVT_PAYMENT_SETTLED), downstream systems (Insights, Reconciliation, Behavioral AI) automatically react and trigger their own workflows.", "Planned"],
        ["Mobile Metro Tracker", "The station map scales down for narrow screens and mobile devices. Responsive SVG viewBox with smaller station radii.", "Planned"],
      ], 2800),

      // ── APPENDIX ─────────────────────────────────────────────────────────
      h1("Appendix A: Quick Navigation Reference"),
      twoColTable([
        ["I want to...", "Go to..."],
        ["Watch a live transaction", "Runtime Operations > Transaction Workflow Screen"],
        ["Run a new test transaction", "Transaction Workflow Screen > green Play button"],
        ["Search past transactions", "Transaction Workflow Screen > Search bar"],
        ["Approve a paused transaction", "Transaction Workflow Screen > current step card > Approve"],
        ["See failed reversals", "Transaction Workflow Screen > Reversal Recovery Queue"],
        ["Draw a new workflow", "Designer Studio > Workflow Designer"],
        ["Fix unwired workflow steps", "Workflow Designer > link icon (Wiring Audit)"],
        ["Author a business rule", "Designer Studio > Business Rules"],
        ["Build a formula", "Designer Studio > Calculation Engine"],
        ["Configure an external API", "Designer Studio > API Designer"],
        ["Browse ISO 20022 fields", "Master Data > ISO Field Registry"],
        ["Build a dashboard", "Designer Studio > Report Designer"],
        ["Check system health", "Runtime Operations > Global Technical Dashboard"],
        ["See portfolio overview", "360 Dashboard"],
        ["Set package + product context", "Click package name in top-left corner"],
      ], 3400),

      h1("Appendix B: Build History Summary"),
      twoColTable([
        ["Date", "Developer", "What was built"],
        ["Jun 12", "Gemini", "Infrastructure: FastAPI, SQLite, all data models, seed pipeline"],
        ["Jun 13-15", "Gemini", "Full backend for all studios. Screen Designer backend complete."],
        ["Jun 16", "Gemini", "Glassmorphism UI. Package dashboard. Onboarding flow."],
        ["Jun 17-18", "Gemini", "Workflow Designer visual canvas with ReactFlow. Node properties drawer."],
        ["Jun 19", "Gemini + Claude", "ISO Field Registry upgrade. 360 Dashboard redesign. Two-Key Cockpit Lockdown. 5 studio rebuilds."],
        ["Jun 20", "Gemini", "Calculation Engine rebuild. WS-14 Message Queue. WS-15 Template Library. Integration Gateway."],
        ["Jun 21", "Gemini + Claude", "Advanced Workflow Designer (swimlanes, image-to-workflow, 21 node types). Integration audit. Engine wiring. UX fixes. Rich seed data."],
        ["Jun 22 (morning)", "Claude", "Transaction Workflow Screen: metro tracker, action buttons, search, bulk ops, reversal drawer. End-to-end execution proof."],
        ["Jun 22 (afternoon)", "Claude", "Wiring Audit panel. 137 steps wired. Reversal Recovery Queue endpoint."],
        ["Jun 22 (evening)", "Gemini", "Entitlements enforcement (in progress)."],
      ], 1600),

    ],
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.mkdirSync('/Volumes/AI Projects Mac/InfinityProductOS/docs', { recursive: true });
  fs.writeFileSync('/Volumes/AI Projects Mac/InfinityProductOS/docs/InfinityProductOS_User_Guide.docx', buffer);
  console.log('Done: docs/InfinityProductOS_User_Guide.docx');
});
