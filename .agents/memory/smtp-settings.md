---
name: Superadmin SMTP settings
description: ERP SMTP delivery is configured in one encrypted database record and is restricted to Superadmin accounts.
---

SMTP delivery settings belong to the ERP, not to individual users or source-controlled environment values. Store one configuration record with the SMTP password encrypted at rest, expose only password-presence metadata to the client, and protect read, update, and test routes with the Superadmin role.

**Why:** Partner welcome emails need an operator-managed sender, while SMTP credentials must not be visible to Admin or Staff users or leak through API responses.

**How to apply:** Keep the setup surface under Superadmin-only Portal settings, preserve the existing password when an update omits it, and make welcome-email delivery fail visibly when no saved SMTP configuration exists.