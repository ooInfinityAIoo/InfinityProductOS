# Transaction Screen — Layout Language Spec (iteration 1)

> WHY THIS DOC EXISTS:
> The current Transaction Workflow Screen reads like a demo, not a banking
> operations surface. This spec defines the **layout language** we are adopting —
> a synthesis of best-in-class patterns from market-leading products — and maps
> every visual element to a **real column** in `models.py`, so the screen is
> **rendered from workflow + screen definitions (logic-as-data, ADR #3)**, never
> hardcoded per product.
>
> This is iteration 1 of several. It is a contract, not code. No behaviour
> changes when this lands. Each later iteration implements one band of the frame
> below as its own green commit.

---

## 1. Where the patterns come from (and what we deliberately reject)

| Source product | What we adopt | What we reject |
|---|---|---|
| **StructuredFlow / ABS Hub** | Dark persistent record header with a fixed "facts row"; the process steps as the page's *spine*; dismissible instruction banner; anchored Back / primary-action bar; explicit empty states | Hardcoded linear 6-step stepper; approval as a lone button; heavy steps left as empty shells |
| **nCino** | Tabbed record detail (Details / Beneficiary / Charges / Compliance / History) for steps with depth | Salesforce chrome density |
| **ANZ Transactive** | Manual capture form structure (debit account, registered/adhoc beneficiary, BIC/IBAN, charges, Save-draft vs Save-&-Submit) | Dated visual styling |
| **Us (InfinityProductOS)** | The **metro tracker** kept as the spine — but dynamic, branch-aware, clickable; everything rendered from definitions | — |

**Design principle:** adopt the *layout language*, never imitate a specific product.
The frame is generic; the content is always definition-driven.

---

## 2. The frame — five horizontal bands

```
┌──────────────────────────────────────────────────────────────┐
│ A. RECORD HEADER (dark)   title · id · status · 5-fact row     │
├──────────────────────────────────────────────────────────────┤
│ B. STEP SPINE             metro tracker (dynamic, clickable)    │
├──────────────────────────────────────────────────────────────┤
│ C. INSTRUCTION BANNER     contextual, dismissible (optional)    │
├──────────────────────────────────────────────────────────────┤
│ D. STEP WORKSPACE         rendered from the node's screen def   │
├──────────────────────────────────────────────────────────────┤
│ E. ACTION BAR             Back to queue · decision controls     │
└──────────────────────────────────────────────────────────────┘
```

The metro tracker is **not replaced** — it *becomes* band B, the spine of the
page, dressed in this layout language.

---

## 3. Field mapping — every pixel is backed by a real column

### Band A — Record header
Source: `WorkflowExecutionInstance` + its `WorkflowConfiguration` + `current_context`.

| UI element | Backing field |
|---|---|
| Action title | current `WorkflowNode.node_title` (the step the operator is on) |
| Workflow / message line | `workflow_id`, `WorkflowNode.iso_message_type`, `instance_id` |
| Maker line | `current_context` maker fields / `created_at` |
| Status badge | `WorkflowExecutionInstance.status` (full palette §2.1 of TRANSACTION_SCREEN_DESIGN.md) |
| **Facts row (5 cells)** | **Configurable, not hardcoded** — see §4 below |

### Band B — Step spine (metro tracker)
Source: ordered `WorkflowNode` rows for the instance's `workflow_id` (+ branch topology).

| UI element | Backing field |
|---|---|
| Station label | `WorkflowNode.node_title` |
| Station order | `WorkflowNode.sequence_number` |
| Station shape / colour group | `WorkflowNode.node_type` (21-type taxonomy → 8 groups) |
| **Parallel branch** rendering | `node_type = PARALLEL_SPLIT` / `PARALLEL_JOIN` |
| Current station highlight | `WorkflowExecutionInstance.current_node_id` |
| Per-station live state | `status` + `retry_attempts_log` (e.g. "retry 2/3 · next in 28s") |
| SLA corner dot (amber/red) | `WorkflowNode.sla_config` / `sla_days` vs elapsed |
| STP vs human marker | `node_type = HUMAN_APPROVAL`/`DIGITAL_SIGNATURE` ⇒ human; else STP |
| **Station is clickable** | every station opens its `screen_template` (see Band D) |

> Clicking ANY station renders that node's screen — read-only if the step is
> already complete (**this is "playback"**), editable only when it is the
> current actionable node. STP steps still have a screen: it shows the
> automation's inputs, the rule/calc results, and the API response.

### Band C — Instruction banner
Source: `WorkflowNode` + `status`. Examples driven by `node_type`:
`COMPLIANCE_SCREEN` → "Review screening results before approving";
`WATERFALL`/`CALCULATE` → "Run calculation to load distribution details".
Dismissible; reappears on step change.

### Band D — Step workspace
Source: `WorkflowNode.screen_template` → `ScreenTemplate` (JSONB definition) →
rendered by `RuntimeScreenRenderer`.

- `screen_template_category = TRANSACTION` ⇒ human-in-loop approval screen.
- No `screen_template` on the node ⇒ fall back to a **generated context view**
  (key/value of `current_context` + engine outputs) so the band is never blank.
- Read-only is driven by: station is not `current_node_id`, OR
  `status` is terminal, OR component `category = READ_ONLY`.

### Band E — Action bar
Source: `status` + `WorkflowNode` failure-handling columns.

| Control | Shown when |
|---|---|
| Back to queue | always (returns to the worklist — "My Deals"/queue) |
| Approve / Reject | `status = PAUSED` AND node `node_type = HUMAN_APPROVAL` |
| **Reject reason (mandatory)** | reject path — required, not optional |
| Return for repair | node `on_failure = REPAIR_QUEUE` (uses `repair_queue_name`) |
| Retry | `status ∈ {RETRYING, FAILED_TECHNICAL}` (honours `retry_config`) |
| Skip | node `skippable = true` |
| Cancel | node `cancellable = true` |
| Reverse | terminal + node `reversibility` recipe present |

---

## 4. The "facts row" must be configurable (the anti-hardcoding rule)

StructuredFlow's 5 facts (Payment Date · Days Remaining · Distribution Date ·
ISIN · Product) are an **ABS-servicing** choice. A SWIFT payment needs
Amount · Value Date · Beneficiary · BIC · Product. **We must not hardcode
either set.**

Proposal: the facts row is a small ordered list of
`{label_token, context_path}` resolved against `current_context`, defined per
workflow. Default packs ship per domain (Payment, Servicing). This keeps band A
generic — the same component renders both products.

> **Open question for iteration 2:** where does this facts-row config live —
> a new JSONB column on `WorkflowConfiguration`, or derived from the
> `screen_template` of the START node? Recommendation: derive from the START
> node's screen so it stays inside the existing Screen Designer authoring loop.

---

## 5. What we explicitly carry forward as hard requirements

1. The metro tracker stays — promoted to the spine, dynamic and **clickable**.
2. Every step opens a screen, STP or not, completed or not (= playback).
3. Approvals are a real maker-checker decision (reason on reject, return-for-repair,
   checks panel), never a lone button.
4. Zero product-specific hardcoding in the frame; content comes from definitions.
5. Remove the developer changelog banner currently rendered into the production UI.

---

## 6. Iteration roadmap (each = one green, pushed commit)

1. **This spec** (no code). ← you are here
2. Facts-row config decision + render band A from the START-node screen.
3. Promote `MetroTracker` to the spine; make stations clickable.
4. Band D: route any station click through `RuntimeScreenRenderer` (read-only/playback).
5. Band E: real maker-checker decision bar (reject reason, repair, retry/skip/cancel).
6. Manual capture screen rendered from the START-node definition (retire `RunTransactionModal`).
7. Worklist / queue landing ("My Deals" equivalent) as the entry point.
8. Institutional theme pass; delete the changelog banner.

Steps 2–8 are independent enough to reorder if priorities shift.
