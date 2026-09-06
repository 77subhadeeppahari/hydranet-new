---
name: Customer ledger and workbook import
description: Durable rules for customer account imports and due calculations.
---

Customer due is always derived on the server as total debit minus total credit; the admin UI must not submit or override totals.

Existing workbook rows are matched by RADIUS account number and updated. Duplicate account numbers within the same workbook are reported as row errors rather than silently overwriting one another.

**Why:** Account balances need one consistent source of truth across admin sessions, while bulk operations must be predictable and auditable.

**How to apply:** Preserve these rules whenever customer, ledger, import, or collections reporting features are extended.