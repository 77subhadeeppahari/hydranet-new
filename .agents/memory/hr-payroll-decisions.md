---
name: Payroll source of truth
description: Durable rules for monthly HR payroll calculations and employee salary setup.
---

Payroll calculations and generated payslips remain server-owned persisted results. The admin UI only edits configurable salary inputs, requests generation, and refreshes cached results.

Every active employee should have a salary structure before a payroll run is generated. New users receive an editable default structure, while missing structures during generation are rejected explicitly instead of silently producing incomplete payroll.

**Why:** Payroll must be auditable and repeatable, and silently skipping an employee would create an unsafe underpayment.

**How to apply:** Keep salary math, attendance proration, deductions, payroll replacement behavior, and payslip PDF data in the API/database layer; treat UI calculations as display-only.