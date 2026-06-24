# Extended Field Registry — Groomed Requirements

> WHY THIS DOC EXISTS:
> The field registry was seeded as an ISO-20022-only catalogue (3,013 fields).
> This spec extends it into a **unified, master-anchored, package-scoped field
> registry** that holds ISO, bank-custom (non-ISO), calculated, derived, and
> configuration fields — the way a real bank actually governs its data dictionary.
> Groomed with the PM on 2026-06-24. This is the agreed contract; implementation
> follows in checkpointed commits AFTER sign-off. No code yet.

---

## 1. Core principle — no orphan fields

A bank does not operate without master-data categorisation. Therefore:

> **Every field MUST be anchored to a Package, a Master, and a Product.
> A field with no Master is not selectable anywhere in the application.**

This is the non-negotiable rule the whole design serves.

---

## 2. The anchoring model

Every field carries mandatory anchors plus optional finer placement:

```
FIELD
 ├─ Package            MANDATORY · exactly one        (no global fields)
 ├─ Master             MANDATORY · exactly one        (no orphans)
 ├─ Product            MANDATORY · one | many | ALL    (many-to-many + ALL flag)
 ├─ Sub-Product        OPTIONAL  · placeholder for now
 ├─ Workflow Template  OPTIONAL  · placeholder (Transaction Workflow Template ID)
 └─ Workflow Step      OPTIONAL  · placeholder (Transaction Workflow Step ID)
```

- **Package** — one per field (Q6). Global-defined/package-inherited is deferred.
- **Master** — one per field (Q1/Q2). See §4.
- **Product** — a field maps to one product, several products, or **ALL products**
  in the package (Q7-product). Currency fields → ALL; niche fields → 1–3 products.
  Modelled as a many-to-many join **plus** an `applies_to_all_products` flag; ALL
  also auto-includes products added to the package later.
- **Sub-Product / Workflow Template ID / Workflow Step ID** — optional placeholders
  now, so the full chain **Package → Product → Sub-Product → Workflow Step** exists
  in the schema even before we enforce the lower levels.

---

## 3. Field sources (taxonomy) — D6

`field_source` classifies origin/governance:

| Source | Meaning | ISO mapping | Editable |
|---|---|---|---|
| `ISO_20022` | Standard ISO 20022 field | self | read-only |
| `BANK_CUSTOM` | Bank proprietary / non-ISO | optional (see §5) | yes |
| `CALCULATED` | Output token of a Formula | none | system |
| `DERIVED` | Derived from other fields/logic | none | yes |
| `CONFIGURATION` | Drives config/routing, not a payload value | none | yes |
| `REGULATORY` | Mandated by a regulator | optional | yes |

(Start with these; add more only on real need.)

---

## 4. Masters — reuse the Maintenance-screen mechanism (Q1)

Banks already maintain static data and configuration through **Maintenance
screens** (`screen_template_category = MAINTENANCE`) whose rows live in
`dynamic_master_records`. **We keep that mechanism unchanged** — they won't move
off that habit. The field registry simply gains a reference to it:

- A field's `master_ref` points at the Master (a Maintenance screen, e.g.
  "Currency Master", "Country Master", "Customer Master").
- **Two senses of "mapped to a master" (Q2), both honoured:**
  - **Classification** (always) — every field *belongs to* a master domain, so
    nothing is orphan (amounts, dates, free text included).
  - **Value-constraint** (when applicable) — reference fields draw their valid
    values from the master (Currency.Ccy → the currency list).
- **Config / Calculated / Derived fields get their own standard masters** (Q5),
  seeded once and auto-bound on field creation so they're never orphan.
- Masters are **package-scoped** (Q3), seeded from a global canonical so we don't
  re-key ISO 4217 etc. per package. Global sharing is a future feature.

---

## 5. ISO mapping — aliased vs native (D1, D2)

"Non-ISO" is two different things; the model supports both:

- **Aliased** — semantically an ISO field with the bank's own name. Has an ISO
  equivalent → optional `iso_field_ref` points at the ISO field.
- **Native** — no ISO equivalent at all → `iso_field_ref` and `iso_business_name`
  are **null**.

Therefore:
- `iso_business_name` becomes **nullable** (D1). Display falls back to
  `client_business_name`; `display_preference` defaults to `CLIENT` for non-ISO.
- New optional `iso_field_ref` (FK to the ISO field) captures the alias mapping
  (D2) — distinct from the display name.

---

## 6. Display & selection (D3, D7)

- Field picker shows ISO and non-ISO together; a small **"Custom" / "Calculated" /
  "Derived"** tag distinguishes non-ISO sources at a glance.
- **Selectability gate:** a field with no `master_ref` is hidden from all pickers.
- **Naming convention (D7):** custom fields use a reserved prefix/namespace
  (e.g. `CUST_…`) so they can never shadow an ISO `technical_sys_name`.

---

## 7. Governance (D5)

- `ISO_20022` fields are **read-only** (the standard isn't editable).
- Custom fields follow the existing `DRAFT → PENDING_APPROVAL → ACTIVE` lifecycle.
- **For framework-build speed: an `AUTO_APPROVE_FIELDS` configuration flag** makes
  field creation skip 4-Eye for now. The real 4-Eye gate is re-enabled when we
  make a package live.

---

## 8. Field lineage — "where-used" (Q7)

> Given any field, the user can view **every place it is used across the platform**.

Surfaces to scan for a field's `technical_sys_name` / token:
- **Business Rules** — condition `source_fields`, action fields
- **Calculations** — formula `mathematical_expression` operands + `target_output_field`
- **Orchestration / Workflows** — node `orchestration_steps`, bound screen fields
- **Screens** — component `field_binding`
- **Data Gateway Mappers** — source/target mappings
- **Notifications / Comm templates** — `{{placeholders}}`
- **Reports** — widget field references

Delivered as a **where-used API** (returns grouped usages) + a **lineage panel**
in the Field Registry studio. This is bank-grade impact analysis — change a field
and see what breaks before you touch it.

---

## 9. Data-model changes (summary)

On `iso_field_registry` (`ISOFieldDefinition`):
- `iso_business_name` → **nullable**
- `iso_field_ref` → new, nullable FK to an ISO field (alias mapping)
- `master_ref` → new, **required** (selectability gate)
- `application_package_id` → **required** (was effectively optional)
- `applies_to_all_products` → new boolean
- `subproduct_id`, `workflow_template_id`, `workflow_step_id` → new nullable placeholders
- extend `field_source` enum (§3)

New association:
- `field_product_map` (field_id ↔ product_id) for the many-to-many product mapping

New config:
- `AUTO_APPROVE_FIELDS` flag (env/settings)

---

## 10. Migrations

1. **Backfill (D8):** existing 3,013 `field_source = NULL` → `ISO_20022`.
2. **Make `iso_business_name` nullable** (Postgres trivial; SQLite table-rebuild —
   checkpoint before running).
3. **Rules-based auto-categorisation (riskiest):** assign Package + Master + Product
   to the 3,013 ISO fields by `domain_category` / `data_type` / name patterns
   (`*Ccy*`→Currency Master, `*Ctry|Country*`→Country Master, `*Amt*`→Amount Master,
   …). Output an **exception report** of unmatched fields for manual review.
   → grooming of the rule set happens before this migration runs.

---

## 11. Deferred (explicitly out of scope now)

- Global field sharing / package inheritance (Q3, Q6 future)
- Sub-Product / Workflow-Step **enforcement** (placeholders only now)
- Real 4-Eye on field creation (behind `AUTO_APPROVE_FIELDS` until package go-live)

---

## 12. Acceptance criteria

- [ ] A `BANK_CUSTOM` field can be created with **no** ISO name and still be valid.
- [ ] A field with no Master is **not** offered in any field picker.
- [ ] A field maps to one package, one master, and 1 | many | ALL products.
- [ ] An aliased custom field resolves to its ISO field via `iso_field_ref`.
- [ ] The 3,013 ISO fields are tagged `ISO_20022` and auto-categorised (with an
      exception report for the remainder).
- [ ] `AUTO_APPROVE_FIELDS=true` lets a field go ACTIVE without a second approver.
- [ ] "Where-used" returns every usage of a field across rules, calcs, workflows,
      screens, mappers, notifications, reports.

---

## 13. Phased build (each = one green, pushed commit) — AFTER sign-off

1. Schema: nullable `iso_business_name` + new columns + `field_product_map` (no behaviour change).
2. Backfill `field_source` (D8).
3. Registry create/update: accept the new anchors; enforce Package+Master+Product; `AUTO_APPROVE_FIELDS`.
4. Selectability gate + "Custom/Calculated" tags in the picker.
5. Seed standard masters (Config/Calculated/Derived) + global canonical (Currency/Country/Customer).
6. Rules-based auto-categorisation migration + exception report.
7. Where-used API + lineage panel.
8. `iso_field_ref` alias mapping wired into the Data Gateway mapper.
