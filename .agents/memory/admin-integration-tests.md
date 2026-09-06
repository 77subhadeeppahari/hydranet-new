---
name: Admin integration test boundaries
description: Durable guidance for protecting the Hydranet admin API with database-backed integration tests.
---

Mutation routes that return one record must validate against their singular response schema, not the collection schema used by list routes.

**Why:** A successful database mutation can still become a user-visible 500 when response validation receives an object but the list validator expects an array.

**How to apply:** When adding or changing admin mutations, exercise the full HTTP response in an integration test and use the operation-specific response contract.

Database-backed integration fixtures should use unique identifiers for every run, including mobile numbers, because failed or interrupted runs can leave rows behind even when cleanup is normally present.

**Why:** Reusing a fixed phone number caused mobile login to select a stale user from an earlier interrupted test run, making an otherwise correct authentication regression appear flaky.

**How to apply:** Derive fixture emails and phone numbers from the per-run fixture key whenever a test looks up users by either identifier.