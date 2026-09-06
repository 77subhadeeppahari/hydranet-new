---
name: Activity metadata compatibility
description: Compatibility rule for extending the generic admin activity record with optional structured metadata.
---

When adding structured metadata to the generic activity record, keep the database columns nullable and make the API response fields nullable/optional.

**Why:** Existing activity rows predate the metadata and return null values; a generated validator that accepts only omitted fields turns the dashboard activity endpoint into a 500.

**How to apply:** For future activity extensions, preserve old rows in both the database schema and generated OpenAPI validators, while populating the new fields on newly typed activity entries.