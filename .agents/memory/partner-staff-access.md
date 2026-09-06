---
name: Partner directory Staff access
description: Staff can read partner records and documents, while all partner mutations remain restricted to Admin and Superadmin.
---

The partner directory follows a read/write split: Staff may list and open partner agreements, PDFs, uploaded documents, and non-secret portal status, but cannot create agreements, request document upload URLs, attach signed agreements, approve records, or save portal details.

**Why:** Staff need operational visibility without being able to alter legal partner records or trigger portal welcome emails.

**How to apply:** Keep the read-only Partner List visible to Staff, hide creation and mutation controls in the UI, and enforce the same restriction with route middleware so direct API calls cannot bypass the UI.