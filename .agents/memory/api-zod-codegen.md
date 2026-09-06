---
name: API Zod codegen compatibility
description: The current Orval Zod generator emits Zod 4 APIs for generated request and response validators.
---

The generated API validator package must use Zod 4 even though the workspace catalog still defaults other packages to Zod 3.

**Why:** Orval currently emits `zod.email()` and `zod.int()`, which are not available on the workspace's Zod 3 catalog version. Keeping the validator package on Zod 4 avoids hand-editing generated files after every codegen run.

**How to apply:** If OpenAPI codegen starts failing on `email()` or `int()`, check the `@workspace/api-zod` package dependency before changing generated output or the shared workspace catalog.