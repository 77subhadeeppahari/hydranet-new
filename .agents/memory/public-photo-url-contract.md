---
name: Public photo URL contract
description: Contract decision for public team profile photo URLs returned by the API.
---

Public team profile photo URLs are returned as relative API paths such as `/api/public/team/:id/photo`, not absolute URLs.

**Why:** Relative paths work correctly through the Replit proxy and across development and production hosts. An OpenAPI `uri` format constraint rejects these valid browser URLs and can make the entire public team response fail validation.

**How to apply:** Keep the response field nullable string-only in the API contract unless the server intentionally changes to emitting absolute URLs. Validate the public team response after any contract regeneration.