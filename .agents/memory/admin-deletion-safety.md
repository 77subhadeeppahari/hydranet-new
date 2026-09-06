---
name: Admin deletion safety
description: Rules for destructive team-member and customer actions.
---

Customer deletion removes the account and cascades its ledger. Team members with attendance, payroll, expense, or audit history cannot be hard-deleted; they must be suspended so historical records remain intact.

**Why:** Customer ledgers belong to the deleted account, while HR and audit history must not be destroyed by an access-management action.

**How to apply:** Keep confirmation prompts and separate create/update/delete permissions on future admin mutations; preserve the historical-record guard for team users.