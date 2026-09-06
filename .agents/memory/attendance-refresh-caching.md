---
name: Attendance refresh caching
description: Attendance terminal queries must bypass conditional browser caching after punch mutations.
---

Attendance state used by the punch terminal must be fetched with a fresh-cache policy after punch mutations.

**Why:** The API can answer conditional attendance GETs with `304 Not Modified`; the generated fetch client has no previous response body to restore for a standalone 304, so the UI can lose the current attendance row and show the wrong punch action.

**How to apply:** Use a no-store request for the current-user and admin attendance queries, and derive the terminal state from the record matching the current date rather than assuming the first returned row is today.