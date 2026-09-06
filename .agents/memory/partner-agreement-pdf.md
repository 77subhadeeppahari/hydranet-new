---
name: Partner agreement PDF
description: Franchise agreement generation uses the uploaded 10-page template.
---

Partner agreements must preserve the uploaded blank-field legal template and overlay only submitted values; the template is a build asset copied into the API distribution because managed API workflows run from the artifact directory. Partner identifiers use the immutable `HB11` prefix plus a three-digit serial, and uploaded verification documents belong in protected App Storage with only metadata/path references in PostgreSQL.

**Why:** Rebuilding the legal text risks changing the approved agreement, and runtime working directories differ between development and bundled server execution.

**How to apply:** Keep the registration form fields mapped to the template's blank lines, preserve the original page count, generate the next code server-side, and verify generated PDFs and protected document retrieval contain the submitted values before changing the document flow. Calibrate overlay coordinates against the original A4 template, cover printed placeholder choices before drawing the selected value, and use `pdftotext -bbox` checks with short unique fixture values when validating overlay coordinates. Signed-agreement upload must precede approval; portal passwords are encrypted at rest and never returned to the client. Saving portal details should send the partner a branded welcome email with the signed agreement and inline logo, and must fail visibly when a production mail sender is not configured.
