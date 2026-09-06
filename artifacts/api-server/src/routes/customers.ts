import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import * as XLSX from "xlsx";
import {
  customerLedgerTable,
  customersTable,
  db,
  plansTable,
} from "@workspace/db";
import {
  CreateCustomerBody,
  CreateCustomerLedgerEntryBody,
  CreateCustomerLedgerEntryResponse,
  CreateCustomerResponse,
  ImportCustomersBody,
  ImportCustomersResponse,
  ListCustomerLedgerResponse,
  ListCustomersQueryParams,
  ListCustomersResponse,
  UpdateCustomerBody,
  UpdateCustomerParams,
  UpdateCustomerResponse,
} from "@workspace/api-zod";
import { requireAdmin, requirePermission } from "../lib/admin-auth";

const router: IRouter = Router();

router.use(requireAdmin);

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHeader(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mapCustomer(row: {
  id: number;
  name: string;
  mobileNumber: string;
  radiusAccountNumber: string;
  username: string;
  planId: number;
  planName: string;
  status: string;
  createdAt: Date;
  totalDebit?: unknown;
  totalCredit?: unknown;
}) {
  const totalDebit = Number(row.totalDebit ?? 0);
  const totalCredit = Number(row.totalCredit ?? 0);
  return {
    id: row.id,
    name: row.name,
    mobileNumber: row.mobileNumber,
    radiusAccountNumber: row.radiusAccountNumber,
    username: row.username,
    planId: row.planId,
    planName: row.planName,
    status: row.status as "ACTIVE" | "SUSPENDED" | "DISCONNECTED",
    totalDebit,
    totalCredit,
    totalDue: totalDebit - totalCredit,
    createdAt: row.createdAt,
  };
}

async function listCustomerViews(filters?: {
  search?: string;
  planId?: number;
  status?: string;
  id?: number;
}) {
  const conditions = [];
  if (filters?.id !== undefined) conditions.push(eq(customersTable.id, filters.id));
  if (filters?.planId !== undefined) conditions.push(eq(customersTable.planId, filters.planId));
  if (filters?.status) conditions.push(eq(customersTable.status, filters.status));
  if (filters?.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(customersTable.name, pattern),
        ilike(customersTable.mobileNumber, pattern),
        ilike(customersTable.radiusAccountNumber, pattern),
        ilike(customersTable.username, pattern),
      ),
    );
  }

  const customerRows = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      mobileNumber: customersTable.mobileNumber,
      radiusAccountNumber: customersTable.radiusAccountNumber,
      username: customersTable.username,
      planId: customersTable.planId,
      planName: plansTable.name,
      status: customersTable.status,
      createdAt: customersTable.createdAt,
    })
    .from(customersTable)
    .innerJoin(plansTable, eq(customersTable.planId, plansTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(customersTable.name));

  if (customerRows.length === 0) return [];

  const ledgerTotals = await db
    .select({
      customerId: customerLedgerTable.customerId,
      totalDebit: sql<number>`coalesce(sum(case when ${customerLedgerTable.entryType} = 'DEBIT' then ${customerLedgerTable.amount} else 0 end), 0)`,
      totalCredit: sql<number>`coalesce(sum(case when ${customerLedgerTable.entryType} = 'CREDIT' then ${customerLedgerTable.amount} else 0 end), 0)`,
    })
    .from(customerLedgerTable)
    .groupBy(customerLedgerTable.customerId);
  const totalsByCustomer = new Map(ledgerTotals.map((total) => [total.customerId, total]));

  return customerRows.map((row) => {
    const totals = totalsByCustomer.get(row.id);
    return mapCustomer({ ...row, totalDebit: totals?.totalDebit, totalCredit: totals?.totalCredit });
  });
}

async function getCustomerView(id: number) {
  const [customer] = await listCustomerViews({ id });
  return customer;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

router.get("/customers", async (req, res): Promise<void> => {
  const parsed = ListCustomersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const customers = await listCustomerViews({
    search: parsed.data.search,
    planId: parsed.data.planId,
    status: parsed.data.status,
  });
  res.json(ListCustomersResponse.parse(customers));
});

router.post("/customers", requirePermission("CUSTOMERS_CREATE"), async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const plan = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(eq(plansTable.id, parsed.data.planId));
  if (plan.length === 0) {
    res.status(400).json({ error: "Selected plan was not found" });
    return;
  }

  try {
    const [created] = await db
      .insert(customersTable)
      .values({
        name: normalizeText(parsed.data.name),
        mobileNumber: normalizeText(parsed.data.mobileNumber),
        radiusAccountNumber: normalizeText(parsed.data.radiusAccountNumber),
        username: normalizeText(parsed.data.username),
        planId: parsed.data.planId,
        status: parsed.data.status ?? "ACTIVE",
      })
      .returning({ id: customersTable.id });
    const customer = await getCustomerView(created.id);
    res.status(201).json(CreateCustomerResponse.parse(customer));
  } catch {
    res.status(409).json({ error: "A customer with this RADIUS account number or username already exists" });
  }
});

router.get("/customers/import/template.xlsx", async (_req, res): Promise<void> => {
  const worksheet = XLSX.utils.json_to_sheet([
    {
      "Customer Name": "Asha Menon",
      "Mobile Number": "9876543210",
      "RADIUS Account Number": "HN-24018",
      "RADIUS Username": "asha.menon",
      Plan: "Home 100",
    },
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
  const workbookBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="hydranet-customer-import-sample.xlsx"');
  res.send(workbookBuffer);
});

router.get("/customers/due/export.xlsx", async (req, res): Promise<void> => {
  const parsed = ListCustomersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const customers = await listCustomerViews({
    search: parsed.data.search,
    planId: parsed.data.planId,
    status: parsed.data.status,
  });
  const rows = customers.map((customer) => ({
    "Customer Name": customer.name,
    "Mobile Number": customer.mobileNumber,
    "RADIUS Account Number": customer.radiusAccountNumber,
    "RADIUS Username": customer.username,
    Plan: customer.planName,
    Status: customer.status,
    "Total Debit": customer.totalDebit,
    "Total Credit": customer.totalCredit,
    "Total Due": customer.totalDue,
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Due Report");
  const workbookBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="hydranet-customer-due-report.xlsx"');
  res.send(workbookBuffer);
});

router.post("/customers/import", requirePermission("CUSTOMERS_CREATE"), async (req, res): Promise<void> => {
  const parsed = ImportCustomersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!/\.(xlsx|xls|csv)$/i.test(parsed.data.fileName)) {
    res.status(400).json({ error: "Upload an .xlsx, .xls, or .csv workbook" });
    return;
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(parsed.data.contentBase64, "base64");
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: "The workbook must be between 1 byte and 10 MB" });
      return;
    }
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch {
    res.status(400).json({ error: "The uploaded file is not a readable workbook" });
    return;
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    res.status(400).json({ error: "The workbook does not contain a worksheet" });
    return;
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: "" });
  if (rows.length === 0) {
    res.status(400).json({ error: "The first worksheet does not contain any customer rows" });
    return;
  }

  const [plans, existingCustomers] = await Promise.all([
    db.select({ id: plansTable.id, name: plansTable.name }).from(plansTable),
    db.select({
      id: customersTable.id,
      radiusAccountNumber: customersTable.radiusAccountNumber,
      username: customersTable.username,
    }).from(customersTable),
  ]);
  const plansById = new Map(plans.map((plan) => [String(plan.id), plan.id]));
  const plansByName = new Map(plans.map((plan) => [normalizeHeader(plan.name), plan.id]));
  const existingByAccount = new Map(existingCustomers.map((customer) => [customer.radiusAccountNumber.toLowerCase(), customer]));
  const existingByUsername = new Map(existingCustomers.map((customer) => [customer.username.toLowerCase(), customer]));
  const seenAccounts = new Set<string>();
  const errors: string[] = [];
  let importedCount = 0;
  let updatedCount = 0;

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const values = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), normalizeText(value)]));
    const name = values.get("customername") || values.get("name") || "";
    const mobileNumber = values.get("mobilenumber") || values.get("mobile") || values.get("phone") || "";
    const radiusAccountNumber = values.get("radiusaccountnumber") || values.get("radiusaccount") || values.get("accountnumber") || "";
    const username = values.get("radiususername") || values.get("username") || "";
    const planValue = values.get("plan") || values.get("planname") || values.get("planid") || "";
    const accountKey = radiusAccountNumber.toLowerCase();

    if (!name || !mobileNumber || !radiusAccountNumber || !username || !planValue) {
      errors.push(`Row ${rowNumber}: Customer Name, Mobile Number, RADIUS Account Number, RADIUS Username, and Plan are required`);
      continue;
    }
    if (seenAccounts.has(accountKey)) {
      errors.push(`Row ${rowNumber}: duplicate RADIUS Account Number ${radiusAccountNumber} in this workbook`);
      continue;
    }
    seenAccounts.add(accountKey);

    const planId = plansById.get(planValue) ?? plansByName.get(normalizeHeader(planValue));
    if (!planId) {
      errors.push(`Row ${rowNumber}: plan "${planValue}" was not found`);
      continue;
    }
    const existing = existingByAccount.get(accountKey);
    const usernameOwner = existingByUsername.get(username.toLowerCase());
    if (usernameOwner && usernameOwner.id !== existing?.id) {
      errors.push(`Row ${rowNumber}: RADIUS Username ${username} already belongs to another customer`);
      continue;
    }

    try {
      if (existing) {
        await db.update(customersTable).set({
          name,
          mobileNumber,
          radiusAccountNumber,
          username,
          planId,
        }).where(eq(customersTable.id, existing.id));
        updatedCount += 1;
      } else {
        const [created] = await db.insert(customersTable).values({
          name,
          mobileNumber,
          radiusAccountNumber,
          username,
          planId,
          status: "ACTIVE",
        }).returning({ id: customersTable.id });
        existingByAccount.set(accountKey, { id: created.id, radiusAccountNumber, username });
        existingByUsername.set(username.toLowerCase(), { id: created.id, radiusAccountNumber, username });
        importedCount += 1;
      }
    } catch {
      errors.push(`Row ${rowNumber}: could not save ${radiusAccountNumber}; check duplicate account or username values`);
    }
  }

  res.json(ImportCustomersResponse.parse({ importedCount, updatedCount, failedCount: errors.length, errors }));
});

router.patch("/customers/:id", requirePermission("CUSTOMERS_UPDATE"), async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.planId !== undefined) {
    const [plan] = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.id, parsed.data.planId));
    if (!plan) {
      res.status(400).json({ error: "Selected plan was not found" });
      return;
    }
  }

  const updates = {
    ...(parsed.data.name !== undefined ? { name: normalizeText(parsed.data.name) } : {}),
    ...(parsed.data.mobileNumber !== undefined ? { mobileNumber: normalizeText(parsed.data.mobileNumber) } : {}),
    ...(parsed.data.radiusAccountNumber !== undefined ? { radiusAccountNumber: normalizeText(parsed.data.radiusAccountNumber) } : {}),
    ...(parsed.data.username !== undefined ? { username: normalizeText(parsed.data.username) } : {}),
    ...(parsed.data.planId !== undefined ? { planId: parsed.data.planId } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
  };
  try {
    const [updated] = await db.update(customersTable).set(updates).where(eq(customersTable.id, params.data.id)).returning({ id: customersTable.id });
    if (!updated) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    res.json(UpdateCustomerResponse.parse(await getCustomerView(updated.id)));
  } catch {
    res.status(409).json({ error: "A customer with this RADIUS account number or username already exists" });
  }
});

router.delete("/customers/:id", requirePermission("CUSTOMERS_DELETE"), async (req, res): Promise<void> => {
  const params = UpdateCustomerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db.delete(customersTable).where(eq(customersTable.id, params.data.id)).returning({ id: customersTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/customers/:id/ledger", async (req, res): Promise<void> => {
  const customerId = Number(req.params.id);
  if (!Number.isInteger(customerId) || customerId < 1) {
    res.status(400).json({ error: "Customer id must be a positive integer" });
    return;
  }
  const customer = await getCustomerView(customerId);
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const entries = await db
    .select({
      id: customerLedgerTable.id,
      customerId: customerLedgerTable.customerId,
      entryType: customerLedgerTable.entryType,
      amount: customerLedgerTable.amount,
      entryDate: customerLedgerTable.entryDate,
      note: customerLedgerTable.note,
      createdAt: customerLedgerTable.createdAt,
    })
    .from(customerLedgerTable)
    .where(eq(customerLedgerTable.customerId, customerId))
    .orderBy(desc(customerLedgerTable.entryDate), desc(customerLedgerTable.createdAt));
  res.json(ListCustomerLedgerResponse.parse(entries.map((entry) => ({
    ...entry,
    entryType: entry.entryType as "DEBIT" | "CREDIT",
  }))));
});

router.post("/customers/:id/ledger", requirePermission("CUSTOMERS_UPDATE"), async (req, res): Promise<void> => {
  const customerId = Number(req.params.id);
  if (!Number.isInteger(customerId) || customerId < 1) {
    res.status(400).json({ error: "Customer id must be a positive integer" });
    return;
  }
  const [customer] = await db.select({ id: customersTable.id }).from(customersTable).where(eq(customersTable.id, customerId));
  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const parsed = CreateCustomerLedgerEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const entryDate = parsed.data.entryDate.toISOString().slice(0, 10);
  if (!validDate(entryDate)) {
    res.status(400).json({ error: "Entry date must be a valid YYYY-MM-DD date" });
    return;
  }
  const [entry] = await db.insert(customerLedgerTable).values({
    customerId,
    entryType: parsed.data.entryType,
    amount: parsed.data.amount,
    entryDate,
    note: parsed.data.note ? normalizeText(parsed.data.note) : null,
    createdById: req.adminUser!.id,
  }).returning({
    id: customerLedgerTable.id,
    customerId: customerLedgerTable.customerId,
    entryType: customerLedgerTable.entryType,
    amount: customerLedgerTable.amount,
    entryDate: customerLedgerTable.entryDate,
    note: customerLedgerTable.note,
    createdAt: customerLedgerTable.createdAt,
  });
  res.status(201).json(CreateCustomerLedgerEntryResponse.parse({
    ...entry,
    entryType: entry.entryType as "DEBIT" | "CREDIT",
  }));
});

export default router;