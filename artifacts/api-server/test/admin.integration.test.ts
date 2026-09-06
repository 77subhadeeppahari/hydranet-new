import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, inArray, or } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import * as XLSX from "xlsx";
import app from "../src/app";
import { hashPassword } from "../src/lib/admin-auth";
import { seedAdminData } from "../src/lib/admin-seed";
import {
  activityTable,
  attendanceTable,
  customersTable,
  db,
  expensesTable,
  plansTable,
  payrollRunsTable,
  payslipsTable,
  partnerAgreementsTable,
  pool,
  rolesTable,
  salaryStructuresTable,
  smtpSettingsTable,
  usersTable,
} from "@workspace/db";

type ApiResult = {
  response: Response;
  body: unknown;
  cookie?: string;
};

const fixtureKey = randomUUID();
const adminEmail = `integration-admin-${fixtureKey}@example.test`;
const staffEmail = `integration-staff-${fixtureKey}@example.test`;
const createdMemberEmail = `integration-created-member-${fixtureKey}@example.test`;
const suspendedEmail = `integration-suspended-${fixtureKey}@example.test`;
const adminPhone = `9${Array.from(fixtureKey.replaceAll("-", "").slice(0, 9))
  .map((character) => Number.parseInt(character, 16) % 10)
  .join("")}`;
const adminPassword = "IntegrationAdmin@2026";
const staffPassword = "IntegrationStaff@2026";
const suspendedPassword = "IntegrationSuspended@2026";
const createdPlanIds: number[] = [];
const createdExpenseIds: number[] = [];
const createdCustomerIds: number[] = [];
const createdPartnerAgreementIds: number[] = [];
let adminId: number;
let staffId: number;
let suspendedId: number;
let server: Server;
let baseUrl: string;

async function request(
  path: string,
  options: RequestInit = {},
  cookie?: string,
): Promise<ApiResult> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (cookie) headers.set("cookie", cookie);

  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  const setCookie = response.headers.get("set-cookie");
  return {
    response,
    body,
    cookie: setCookie?.split(";", 1)[0],
  };
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
  };
}

function patchJson(body: unknown): RequestInit {
  return {
    method: "PATCH",
    body: JSON.stringify(body),
  };
}

async function login(identifier: string, password: string): Promise<string> {
  const result = await request("/auth/login", json({ identifier, password }));
  assert.equal(result.response.status, 200);
  assert.ok(result.cookie, "login should set a session cookie");
  return result.cookie;
}

async function createExpenseAs(
  email: string,
  password: string,
  title: string,
  amount = 1250,
): Promise<number> {
  const cookie = await login(email, password);
  const result = await request(
    "/expenses",
    json({
      title,
      category: "OFFICE_UTILITIES",
      amount,
      date: "2026-09-05",
      paymentMode: "UPI",
      notes: "Created by integration test",
    }),
    cookie,
  );
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  const expenseId = (result.body as { id: number }).id;
  createdExpenseIds.push(expenseId);
  return expenseId;
}

async function createExpense(title: string): Promise<number> {
  return createExpenseAs(staffEmail, staffPassword, title);
}

async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "hydranet-pdf-test-"));
  const filePath = join(directory, "agreement.pdf");
  try {
    await writeFile(filePath, pdfBytes);
    const result = spawnSync("pdftotext", [filePath, "-"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || "pdftotext failed");
    return result.stdout;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

type PdfWord = {
  page: number;
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
};

async function extractPdfWords(pdfBytes: Uint8Array): Promise<PdfWord[]> {
  const directory = await mkdtemp(join(tmpdir(), "hydranet-pdf-bbox-test-"));
  const filePath = join(directory, "agreement.pdf");
  try {
    await writeFile(filePath, pdfBytes);
    const result = spawnSync("pdftotext", ["-bbox", filePath, "-"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || "pdftotext bbox extraction failed");

    const words: PdfWord[] = [];
    const pages = result.stdout.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g);
    let page = 0;
    for (const pageMatch of pages) {
      for (const wordMatch of pageMatch[1].matchAll(
        /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g,
      )) {
        words.push({
          page,
          xMin: Number(wordMatch[1]),
          yMin: Number(wordMatch[2]),
          xMax: Number(wordMatch[3]),
          yMax: Number(wordMatch[4]),
          text: wordMatch[5],
        });
      }
      page += 1;
    }
    return words;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function assertPdfValueInRegion(
  words: PdfWord[],
  value: string,
  region: { page: number; xMin: number; yMin: number; xMax: number; yMax: number },
) {
  const matches = words.filter((word) => word.page === region.page && word.text === value);
  assert.ok(matches.length > 0, `PDF should contain "${value}" on page ${region.page + 1}`);
  assert.ok(
    matches.some(
      (word) =>
        word.xMin >= region.xMin &&
        word.yMin >= region.yMin &&
        word.xMax <= region.xMax &&
        word.yMax <= region.yMax,
    ),
    `PDF value "${value}" should stay inside page ${region.page + 1} region ` +
      `(${region.xMin}, ${region.yMin})-(${region.xMax}, ${region.yMax}); ` +
      `found ${matches.map((word) => `(${word.xMin}, ${word.yMin})-(${word.xMax}, ${word.yMax})`).join(", ")}`,
  );
}

before(async () => {
  await seedAdminData();

  const roles = await db
    .select({ id: rolesTable.id, code: rolesTable.code })
    .from(rolesTable)
    .where(inArray(rolesTable.code, ["ADMIN", "STAFF"]));
  const adminRoleId = roles.find((role) => role.code === "ADMIN")?.id;
  const staffRoleId = roles.find((role) => role.code === "STAFF")?.id;
  assert.ok(adminRoleId, "seed should provide an ADMIN role");
  assert.ok(staffRoleId, "seed should provide a STAFF role");

  const insertedUsers = await db
    .insert(usersTable)
    .values([
      {
        name: "Integration Admin",
        email: adminEmail,
        phone: adminPhone,
        passwordHash: hashPassword(adminPassword),
        roleId: adminRoleId,
        department: "Integration Tests",
        status: "ACTIVE",
      },
      {
        name: "Integration Staff",
        email: staffEmail,
        phone: "9000000002",
        passwordHash: hashPassword(staffPassword),
        roleId: staffRoleId,
        department: "Integration Tests",
        status: "ACTIVE",
      },
      {
        name: "Integration Suspended",
        email: suspendedEmail,
        phone: "9000000003",
        passwordHash: hashPassword(suspendedPassword),
        roleId: staffRoleId,
        department: "Integration Tests",
        status: "SUSPENDED",
      },
    ])
    .returning({ id: usersTable.id, email: usersTable.email });

  adminId = insertedUsers.find((user) => user.email === adminEmail)!.id;
  staffId = insertedUsers.find((user) => user.email === staffEmail)!.id;
  suspendedId = insertedUsers.find((user) => user.email === suspendedEmail)!.id;
  await db.insert(salaryStructuresTable).values([
    {
      userId: adminId,
      basicSalary: 45000,
      hra: 18000,
      conveyanceAllowance: 2500,
      medicalAllowance: 1500,
      otherAllowance: 1000,
      pfRate: 12,
      esiRate: 0,
      professionalTax: 200,
      otherDeduction: 0,
      effectiveFrom: "2026-01-01",
    },
    {
      userId: staffId,
      basicSalary: 25000,
      hra: 10000,
      conveyanceAllowance: 2500,
      medicalAllowance: 1500,
      otherAllowance: 1000,
      pfRate: 12,
      esiRate: 0,
      professionalTax: 200,
      otherDeduction: 0,
      effectiveFrom: "2026-01-01",
    },
  ]);

  server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  if (adminId && staffId) {
    await db.delete(activityTable).where(
      or(
        eq(activityTable.actorId, adminId),
        eq(activityTable.actorId, staffId),
      ),
    );
    await db.delete(expensesTable).where(
      createdExpenseIds.length > 0
        ? inArray(expensesTable.id, createdExpenseIds)
        : eq(expensesTable.id, -1),
    );
    await db.delete(customersTable).where(
      createdCustomerIds.length > 0
        ? inArray(customersTable.id, createdCustomerIds)
        : eq(customersTable.id, -1),
    );
    await db.delete(partnerAgreementsTable).where(
      createdPartnerAgreementIds.length > 0
        ? inArray(partnerAgreementsTable.id, createdPartnerAgreementIds)
        : eq(partnerAgreementsTable.id, -1),
    );
    await db.delete(attendanceTable).where(
      or(
        eq(attendanceTable.userId, staffId),
        eq(attendanceTable.userId, adminId),
      ),
    );
    await db.delete(salaryStructuresTable).where(
      or(
        eq(salaryStructuresTable.userId, adminId),
        eq(salaryStructuresTable.userId, staffId),
      ),
    );
    await db.delete(plansTable).where(
      createdPlanIds.length > 0
        ? inArray(plansTable.id, createdPlanIds)
        : eq(plansTable.id, -1),
    );
    const testPayrollRuns = await db.select({ id: payrollRunsTable.id }).from(payrollRunsTable).where(
      or(
        eq(payrollRunsTable.generatedById, adminId),
        eq(payrollRunsTable.generatedById, staffId),
      ),
    );
    await db.delete(payslipsTable).where(
      testPayrollRuns.length > 0
        ? inArray(payslipsTable.payrollRunId, testPayrollRuns.map((run) => run.id))
        : eq(payslipsTable.id, -1),
    );
    await db.delete(payrollRunsTable).where(
      or(
        eq(payrollRunsTable.generatedById, adminId),
        eq(payrollRunsTable.generatedById, staffId),
      ),
    );
    const createdMembers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, createdMemberEmail));
    await db.delete(salaryStructuresTable).where(
      createdMembers.length > 0
        ? inArray(salaryStructuresTable.userId, createdMembers.map((user) => user.id))
        : eq(salaryStructuresTable.userId, -1),
    );
    await db.delete(usersTable).where(eq(usersTable.email, createdMemberEmail));
    await db.delete(usersTable).where(
      and(eq(usersTable.id, adminId), eq(usersTable.email, adminEmail)),
    );
    await db.delete(usersTable).where(
      and(eq(usersTable.id, staffId), eq(usersTable.email, staffEmail)),
    );
    await db.delete(usersTable).where(
      and(eq(usersTable.id, suspendedId), eq(usersTable.email, suspendedEmail)),
    );
  }
  await pool.end();
});

describe("admin authentication", () => {
  test("accepts email and mobile identifiers while rejecting invalid and suspended users", async () => {
    const emailLogin = await request(
      "/auth/login",
      json({ identifier: adminEmail, password: adminPassword }),
    );

    assert.equal(emailLogin.response.status, 200);
    const user = (emailLogin.body as { user: { email: string; role: string } }).user;
    assert.equal(user.email, adminEmail);
    assert.equal(user.role, "ADMIN");
    assert.ok(emailLogin.cookie);

    const mobileLogin = await request(
      "/auth/login",
      json({ identifier: adminPhone, password: adminPassword }),
    );
    assert.equal(mobileLogin.response.status, 200);
    assert.equal(
      (mobileLogin.body as { user: { email: string } }).user.email,
      adminEmail,
    );
    assert.ok(mobileLogin.cookie);

    const invalidIdentifier = await request(
      "/auth/login",
      json({ identifier: `unknown-${fixtureKey}@example.test`, password: adminPassword }),
    );
    assert.equal(invalidIdentifier.response.status, 401);
    assert.deepEqual(invalidIdentifier.body, {
      error: "Invalid email or mobile number or password",
    });

    const suspendedLogin = await request(
      "/auth/login",
      json({ identifier: suspendedEmail, password: suspendedPassword }),
    );
    assert.equal(suspendedLogin.response.status, 401);
    assert.deepEqual(suspendedLogin.body, {
      error: "Invalid email or mobile number or password",
    });
  });

  test("rejects invalid credentials", async () => {
    const result = await request(
      "/auth/login",
      json({ identifier: adminEmail, password: "not-the-password" }),
    );

    assert.equal(result.response.status, 401);
    assert.deepEqual(result.body, {
      error: "Invalid email or mobile number or password",
    });
  });

  test("logs out and invalidates the session cookie", async () => {
    const cookie = await login(adminEmail, adminPassword);
    const logout = await request("/auth/logout", { method: "POST" }, cookie);

    assert.equal(logout.response.status, 204);
    const clearedSetCookie = logout.response.headers.get("set-cookie");
    assert.match(clearedSetCookie ?? "", /Max-Age=0/);
    const clearedCookie = clearedSetCookie?.split(";", 1)[0];
    assert.ok(clearedCookie);

    const currentUser = await request("/auth/me", {}, clearedCookie);
    assert.equal(currentUser.response.status, 401);
  });

  test("rejects protected routes without a session", async () => {
    const result = await request("/plans");

    assert.equal(result.response.status, 401);
    assert.deepEqual(result.body, { error: "Authentication required" });
  });
});

describe("role permissions", () => {
  test("prevents staff from mutating plans, users, or expense decisions", async () => {
    const staffCookie = await login(staffEmail, staffPassword);
    const plan = await request(
      "/plans",
      json({
        name: `Staff forbidden ${fixtureKey}`,
        downloadMbps: 100,
        uploadMbps: 50,
        price: 799,
        billingCycle: "ONE_MONTH",
        ottBenefits: [],
      }),
      staffCookie,
    );
    assert.equal(plan.response.status, 403);

    const user = await request(
      "/users",
      json({
        name: "Should Not Be Created",
        email: `forbidden-${fixtureKey}@example.test`,
        phone: "9000000003",
        password: "ForbiddenUser@2026",
        role: "STAFF",
        department: "Integration Tests",
      }),
      staffCookie,
    );
    assert.equal(user.response.status, 403);

    const expenseId = await createExpense(`Staff decision forbidden ${fixtureKey}`);
    const decision = await request(
      `/expenses/${expenseId}/decision`,
      json({ decision: "APPROVED" }),
      staffCookie,
    );
    assert.equal(decision.response.status, 403);

    const [unchangedExpense] = await db
      .select({ status: expensesTable.status })
      .from(expensesTable)
      .where(eq(expensesTable.id, expenseId));
    assert.equal(unchangedExpense?.status, "PENDING");
  });
});

test("keeps SMTP settings private to Superadmin accounts", async () => {
  const adminCookie = await login(adminEmail, adminPassword);
  const staffCookie = await login(staffEmail, staffPassword);
  const superadminEmail = `integration-superadmin-${fixtureKey}@example.test`;
  const superadminPassword = "IntegrationSuperadmin@2026";
  const [superadminRole] = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.code, "SUPERADMIN"));
  assert.ok(superadminRole);
  const [superadmin] = await db.insert(usersTable).values({
    name: "Integration Superadmin",
    email: superadminEmail,
    phone: "9000000004",
    passwordHash: hashPassword(superadminPassword),
    roleId: superadminRole.id,
    department: "Integration Tests",
    status: "ACTIVE",
  }).returning({ id: usersTable.id });
  const superadminCookie = await login(superadminEmail, superadminPassword);

  const adminResponse = await request("/smtp-settings", {}, adminCookie);
  assert.equal(adminResponse.response.status, 403);
  const staffResponse = await request("/smtp-settings", {}, staffCookie);
  assert.equal(staffResponse.response.status, 403);

  const superadminResponse = await request("/smtp-settings", {}, superadminCookie);
  assert.equal(superadminResponse.response.status, 200, JSON.stringify(superadminResponse.body));
  assert.deepEqual(superadminResponse.body, {
    configured: false,
    host: null,
    port: 587,
    secure: false,
    username: null,
    fromEmail: null,
    fromName: "Hydranet Broadband",
    replyTo: null,
    hasPassword: false,
    updatedAt: null,
  });

  const [stored] = await db.select().from(smtpSettingsTable);
  assert.equal(stored, undefined);
  await db.delete(usersTable).where(eq(usersTable.id, superadmin.id));
});

test("allows Staff to view partners but blocks all partner mutations", async () => {
  const staffCookie = await login(staffEmail, staffPassword);

  const list = await request("/partner-agreements", {}, staffCookie);
  assert.equal(list.response.status, 200, JSON.stringify(list.body));
  assert.ok(Array.isArray(list.body));

  const create = await request("/partner-agreements", json({}), staffCookie);
  assert.equal(create.response.status, 403);

  const signedAgreement = await request(
    "/partner-agreements/1/signed-agreement",
    json({}),
    staffCookie,
  );
  assert.equal(signedAgreement.response.status, 403);

  const approval = await request("/partner-agreements/1/approve", json({}), staffCookie);
  assert.equal(approval.response.status, 403);

  const portalDetails = await request(
    "/partner-agreements/1/portal-details",
    patchJson({}),
    staffCookie,
  );
  assert.equal(portalDetails.response.status, 403);

  const uploadUrl = await request(
    "/storage/uploads/request-url",
    json({ name: "staff-upload.pdf", size: 1, contentType: "application/pdf" }),
    staffCookie,
  );
  assert.equal(uploadUrl.response.status, 403);
});

describe("admin operations", () => {
  test("creates a team member with the expected role and salary structure", async () => {
    const adminCookie = await login(adminEmail, adminPassword);
    const created = await request(
      "/users",
      json({
        name: "Created Integration Member",
        email: createdMemberEmail,
        phone: "9000000003",
        password: "CreatedMember@2026",
        role: "STAFF",
        department: "Customer Operations",
      }),
      adminCookie,
    );

    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const createdUser = created.body as {
      id: number;
      name: string;
      email: string;
      phone: string;
      role: string;
      department: string;
      status: string;
       isPublic: boolean;
    };
    assert.equal(createdUser.name, "Created Integration Member");
    assert.equal(createdUser.email, createdMemberEmail);
    assert.equal(createdUser.phone, "9000000003");
    assert.equal(createdUser.role, "STAFF");
    assert.equal(createdUser.department, "Customer Operations");
    assert.equal(createdUser.status, "ACTIVE");
     assert.equal(createdUser.isPublic, false);

    const [persistedUser] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        department: usersTable.department,
        status: usersTable.status,
         isPublic: usersTable.isPublic,
        role: rolesTable.code,
      })
      .from(usersTable)
      .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
      .where(eq(usersTable.id, createdUser.id));
    assert.deepEqual(persistedUser, {
      id: createdUser.id,
      name: "Created Integration Member",
      email: createdMemberEmail,
      phone: "9000000003",
      department: "Customer Operations",
      status: "ACTIVE",
       isPublic: false,
      role: "STAFF",
    });

     const published = await request(
       `/users/${createdUser.id}`,
       patchJson({ isPublic: true }),
       adminCookie,
     );
     assert.equal(published.response.status, 200, JSON.stringify(published.body));
     assert.equal((published.body as { isPublic: boolean }).isPublic, true);

     const publicTeam = await request("/public/team");
     assert.equal(publicTeam.response.status, 200, JSON.stringify(publicTeam.body));
     const publicMember = (publicTeam.body as Array<Record<string, unknown>>).find((member) => member.id === createdUser.id);
     assert.deepEqual(publicMember, {
       id: createdUser.id,
       name: "Created Integration Member",
       department: "Customer Operations",
       photoUrl: null,
     });

     const hidden = await request(
       `/users/${createdUser.id}`,
       patchJson({ isPublic: false }),
       adminCookie,
     );
     assert.equal(hidden.response.status, 200, JSON.stringify(hidden.body));
     assert.equal((hidden.body as { isPublic: boolean }).isPublic, false);
     const publicTeamAfterHide = await request("/public/team");
     assert.equal(
       (publicTeamAfterHide.body as Array<{ id: number }>).some((member) => member.id === createdUser.id),
       false,
     );

    const [salaryStructure] = await db
      .select({
        userId: salaryStructuresTable.userId,
        basicSalary: salaryStructuresTable.basicSalary,
        hra: salaryStructuresTable.hra,
        conveyanceAllowance: salaryStructuresTable.conveyanceAllowance,
        medicalAllowance: salaryStructuresTable.medicalAllowance,
        otherAllowance: salaryStructuresTable.otherAllowance,
        pfRate: salaryStructuresTable.pfRate,
        esiRate: salaryStructuresTable.esiRate,
        professionalTax: salaryStructuresTable.professionalTax,
        otherDeduction: salaryStructuresTable.otherDeduction,
      })
      .from(salaryStructuresTable)
      .where(eq(salaryStructuresTable.userId, createdUser.id));
    assert.deepEqual(salaryStructure, {
      userId: createdUser.id,
      basicSalary: 25000,
      hra: 10000,
      conveyanceAllowance: 2500,
      medicalAllowance: 1500,
      otherAllowance: 1000,
      pfRate: 12,
      esiRate: 0,
      professionalTax: 200,
      otherDeduction: 0,
    });
  });

  test("rejects team members with invalid names or short passwords", async () => {
    const adminCookie = await login(adminEmail, adminPassword);
    const result = await request(
      "/users",
      json({
        name: "A",
        email: `invalid-created-member-${fixtureKey}@example.test`,
        phone: "9000000004",
        password: "short",
        role: "STAFF",
        department: "Customer Operations",
      }),
      adminCookie,
    );

    assert.equal(result.response.status, 400);
    const error = (result.body as { error: string }).error;
    assert.equal(typeof error, "string");
    assert.match(error, /name/);
    assert.match(error, /password/);
  });

  test("creates and edits a plan through the admin API", async () => {
    const adminCookie = await login(adminEmail, adminPassword);
    const created = await request(
      "/plans",
      json({
        name: `Created plan ${fixtureKey}`,
        downloadMbps: 250,
        uploadMbps: 125,
        price: 4499,
        billingCycle: "TWELVE_MONTHS",
        ottBenefits: ["Netflix"],
      }),
      adminCookie,
    );
    assert.equal(created.response.status, 201);
    const createdPlan = created.body as { id: number; name: string; billingCycle: string; price: number };
    createdPlanIds.push(createdPlan.id);
    assert.equal(createdPlan.billingCycle, "TWELVE_MONTHS");
    assert.equal(createdPlan.price, 4499);

    const updated = await request(
      `/plans/${createdPlan.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: `Edited plan ${fixtureKey}`,
          downloadMbps: 300,
          uploadMbps: 150,
          price: 4999,
          billingCycle: "SIX_MONTHS",
          ottBenefits: ["Netflix", "Prime Video"],
        }),
      },
      adminCookie,
    );
    assert.equal(updated.response.status, 200);
    const updatedPlan = updated.body as { id: number; name: string; billingCycle: string; price: number };
    assert.equal(updatedPlan.id, createdPlan.id);
    assert.equal(updatedPlan.name, `Edited plan ${fixtureKey}`);
    assert.equal(updatedPlan.billingCycle, "SIX_MONTHS");
    assert.equal(updatedPlan.price, 4999);

    const publicPlans = await request("/public/plans");
    const publicPlan = (publicPlans.body as Array<{ id: number; name: string; billingCycle: string; price: number }>).find((plan) => plan.id === createdPlan.id);
    assert.equal(publicPlan?.id, createdPlan.id);
    assert.equal(publicPlan?.name, `Edited plan ${fixtureKey}`);
    assert.equal(publicPlan?.billingCycle, "SIX_MONTHS");
    assert.equal(publicPlan?.price, 4999);
  });

  test("publishes admin plan changes to the public plan feed", async () => {
    const [plan] = await db
      .insert(plansTable)
      .values({
        name: `Public plan ${fixtureKey}`,
        downloadMbps: 125,
        uploadMbps: 60,
        price: 849,
        billingCycle: "SIX_MONTHS",
        ottBenefits: ["Test OTT"],
        status: "ACTIVE",
      })
      .returning({ id: plansTable.id });
    createdPlanIds.push(plan.id);
    const adminCookie = await login(adminEmail, adminPassword);

    const publicBefore = await request("/public/plans");
    assert.equal(publicBefore.response.status, 200);
    assert.ok((publicBefore.body as Array<{ id: number }>).some((item) => item.id === plan.id));

    const updated = await request(
      `/plans/${plan.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: `Updated public plan ${fixtureKey}`,
          downloadMbps: 150,
          uploadMbps: 75,
          price: 999,
          billingCycle: "SIX_MONTHS",
          ottBenefits: ["Updated OTT"],
        }),
      },
      adminCookie,
    );
    assert.equal(updated.response.status, 200);

    const publicAfterUpdate = await request("/public/plans");
    const published = (publicAfterUpdate.body as Array<{ id: number; name: string; price: number }>).find((item) => item.id === plan.id);
    assert.equal(published?.id, plan.id);
    assert.equal(published?.name, `Updated public plan ${fixtureKey}`);
    assert.equal(published?.price, 999);

    const archived = await request(`/plans/${plan.id}`, { method: "DELETE" }, adminCookie);
    assert.equal(archived.response.status, 204);
    const publicAfterArchive = await request("/public/plans");
    assert.equal((publicAfterArchive.body as Array<{ id: number }>).some((item) => item.id === plan.id), false);
  });

  test("archives a plan", async () => {
    const [plan] = await db
      .insert(plansTable)
      .values({
        name: `Archive me ${fixtureKey}`,
        downloadMbps: 75,
        uploadMbps: 35,
        price: 599,
        billingCycle: "ONE_MONTH",
        ottBenefits: [],
        status: "ACTIVE",
      })
      .returning({ id: plansTable.id });
    createdPlanIds.push(plan.id);

    const result = await request(
      `/plans/${plan.id}`,
      { method: "DELETE" },
      await login(adminEmail, adminPassword),
    );
    assert.equal(result.response.status, 204);

    const [archivedPlan] = await db
      .select({ status: plansTable.status })
      .from(plansTable)
      .where(eq(plansTable.id, plan.id));
    assert.equal(archivedPlan?.status, "ARCHIVED");
  });

  test("punches attendance in and out", async () => {
    const staffCookie = await login(staffEmail, staffPassword);
    const punchIn = await request(
      "/attendance/punch",
      json({ action: "IN", latitude: 22.5726, longitude: 88.3639, accuracyMeters: 18.4 }),
      staffCookie,
    );
    assert.equal(punchIn.response.status, 200);
    assert.equal((punchIn.body as { outTime: string | null }).outTime, null);
    assert.equal((punchIn.body as { inLatitude: number | null }).inLatitude, 22.5726);

    const punchOut = await request(
      "/attendance/punch",
      json({ action: "OUT", latitude: 22.5727, longitude: 88.364, accuracyMeters: 21.1 }),
      staffCookie,
    );
    assert.equal(punchOut.response.status, 200);
    assert.ok((punchOut.body as { outTime: string | null }).outTime);
    assert.equal((punchOut.body as { outLatitude: number | null }).outLatitude, 22.5727);

    const [attendance] = await db
      .select({
        inTime: attendanceTable.inTime,
        outTime: attendanceTable.outTime,
        inLatitude: attendanceTable.inLatitude,
        inLongitude: attendanceTable.inLongitude,
        inAccuracyMeters: attendanceTable.inAccuracyMeters,
        outLatitude: attendanceTable.outLatitude,
        outLongitude: attendanceTable.outLongitude,
        outAccuracyMeters: attendanceTable.outAccuracyMeters,
      })
      .from(attendanceTable)
      .where(eq(attendanceTable.userId, staffId));
    assert.ok(attendance?.inTime);
    assert.ok(attendance?.outTime);
    assert.equal(attendance?.inLatitude, 22.5726);
    assert.equal(attendance?.inLongitude, 88.3639);
    assert.equal(attendance?.inAccuracyMeters, 18.4);
    assert.equal(attendance?.outLatitude, 22.5727);
    assert.equal(attendance?.outLongitude, 88.364);
    assert.equal(attendance?.outAccuracyMeters, 21.1);
  });

  test("approves and rejects expense decisions", async () => {
    const approvedExpenseId = await createExpense(`Approve me ${fixtureKey}`);
    const rejectedExpenseId = await createExpense(`Reject me ${fixtureKey}`);
    const adminCookie = await login(adminEmail, adminPassword);

    const approved = await request(
      `/expenses/${approvedExpenseId}/decision`,
      json({ decision: "APPROVED", comment: "Approved by integration test" }),
      adminCookie,
    );
    assert.equal(approved.response.status, 200);
    assert.equal((approved.body as { status: string }).status, "APPROVED");

    const rejected = await request(
      `/expenses/${rejectedExpenseId}/decision`,
      json({ decision: "REJECTED", comment: "Rejected by integration test" }),
      adminCookie,
    );
    assert.equal(rejected.response.status, 200);
    assert.equal((rejected.body as { status: string }).status, "REJECTED");

    const decisions = await db
      .select({ id: expensesTable.id, status: expensesTable.status, approvedById: expensesTable.approvedById })
      .from(expensesTable)
      .where(inArray(expensesTable.id, [approvedExpenseId, rejectedExpenseId]));
    assert.deepEqual(
      decisions.map((expense) => [expense.id, expense.status, expense.approvedById]).sort((a, b) => a[0] - b[0]),
      [
        [approvedExpenseId, "APPROVED", adminId],
        [rejectedExpenseId, "REJECTED", adminId],
      ].sort((a, b) => a[0] - b[0]),
    );
  });

  test("creates customers, calculates due from ledger entries, and imports workbook rows", async () => {
    const adminCookie = await login(adminEmail, adminPassword);
    const [plan] = await db
      .select({ id: plansTable.id, name: plansTable.name })
      .from(plansTable)
      .where(eq(plansTable.status, "ACTIVE"))
      .limit(1);
    assert.ok(plan, "an active plan should exist for customer tests");

    const account = `HN-${fixtureKey.slice(0, 8)}`;
    const created = await request(
      "/customers",
      json({
        name: "Integration Customer",
        mobileNumber: "9000000099",
        radiusAccountNumber: account,
        username: `integration-${fixtureKey.slice(0, 8)}`,
        planId: plan.id,
      }),
      adminCookie,
    );
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const customer = created.body as { id: number; totalDue: number; planName: string };
    createdCustomerIds.push(customer.id);
    assert.equal(customer.totalDue, 0);
    assert.equal(customer.planName, plan.name);

    const debit = await request(
      `/customers/${customer.id}/ledger`,
      json({ entryType: "DEBIT", amount: 1499, entryDate: "2026-09-06", note: "September service" }),
      adminCookie,
    );
    assert.equal(debit.response.status, 201, JSON.stringify(debit.body));
    const credit = await request(
      `/customers/${customer.id}/ledger`,
      json({ entryType: "CREDIT", amount: 499, entryDate: "2026-09-06", note: "Payment received" }),
      adminCookie,
    );
    assert.equal(credit.response.status, 201, JSON.stringify(credit.body));

    const listed = await request(`/customers?search=${encodeURIComponent(account)}`, {}, adminCookie);
    assert.equal(listed.response.status, 200);
    const listedCustomer = (listed.body as Array<{ totalDebit: number; totalCredit: number; totalDue: number }>)[0];
    assert.equal(listedCustomer.totalDebit, 1499);
    assert.equal(listedCustomer.totalCredit, 499);
    assert.equal(listedCustomer.totalDue, 1000);

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      {
        "Customer Name": "Imported Customer",
        "Mobile Number": "9000000088",
        "RADIUS Account Number": `IMP-${fixtureKey.slice(0, 8)}`,
        "RADIUS Username": `imported-${fixtureKey.slice(0, 8)}`,
        Plan: plan.name,
      },
      {
        "Customer Name": "Missing Plan Customer",
        "Mobile Number": "9000000077",
        "RADIUS Account Number": `BAD-${fixtureKey.slice(0, 8)}`,
        "RADIUS Username": `bad-${fixtureKey.slice(0, 8)}`,
        Plan: "Does not exist",
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Customers");
    const workbookBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const imported = await request(
      "/customers/import",
      json({ fileName: "customers.xlsx", contentBase64: workbookBuffer.toString("base64") }),
      adminCookie,
    );
    assert.equal(imported.response.status, 200, JSON.stringify(imported.body));
    assert.equal((imported.body as { importedCount: number }).importedCount, 1);
    assert.equal((imported.body as { failedCount: number }).failedCount, 1);

    const importedRows = await request(
      `/customers?search=${encodeURIComponent(`IMP-${fixtureKey.slice(0, 8)}`)}`,
      {},
      adminCookie,
    );
    assert.equal(importedRows.response.status, 200);
    const importedCustomer = (importedRows.body as Array<{ id: number }>)[0];
    assert.ok(importedCustomer?.id);
    createdCustomerIds.push(importedCustomer.id);

    const invalidImport = await request(
      "/customers/import",
      json({ fileName: "customers.xlsx", contentBase64: Buffer.from("not a workbook").toString("base64") }),
      adminCookie,
    );
    assert.equal(invalidImport.response.status, 400);

    const templateResponse = await fetch(`${baseUrl}/api/customers/import/template.xlsx`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(templateResponse.status, 200);
    assert.match(templateResponse.headers.get("content-type") ?? "", /spreadsheetml/);
    const templateWorkbook = XLSX.read(Buffer.from(await templateResponse.arrayBuffer()), { type: "buffer" });
    const templateRows = XLSX.utils.sheet_to_json<unknown[]>(templateWorkbook.Sheets[templateWorkbook.SheetNames[0]], { header: 1 });
    assert.deepEqual(templateRows[0], [
      "Customer Name",
      "Mobile Number",
      "RADIUS Account Number",
      "RADIUS Username",
      "Plan",
    ]);

    const dueReportResponse = await fetch(`${baseUrl}/api/customers/due/export.xlsx?search=${encodeURIComponent(account)}`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(dueReportResponse.status, 200);
    assert.match(dueReportResponse.headers.get("content-type") ?? "", /spreadsheetml/);
    const dueReportWorkbook = XLSX.read(Buffer.from(await dueReportResponse.arrayBuffer()), { type: "buffer" });
    const dueReportRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      dueReportWorkbook.Sheets[dueReportWorkbook.SheetNames[0]],
    );
    assert.equal(dueReportRows.length, 1);
    assert.equal(dueReportRows[0]?.["Customer Name"], "Integration Customer");
    assert.equal(Number(dueReportRows[0]?.["Total Due"]), 1000);
  });

  test("protects partner codes, document metadata, storage routes, and agreement PDFs", async () => {
    const adminCookie = await login(adminEmail, adminPassword);
    const existingAgreements = await db
      .select({ partnerCode: partnerAgreementsTable.partnerCode })
      .from(partnerAgreementsTable);
    const highestExistingSerial = existingAgreements.reduce((highest, agreement) => {
      const match = /^HB11(\d{3})$/.exec(agreement.partnerCode);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, -1);
    const regressionSuffix = fixtureKey.replaceAll("-", "").slice(0, 8);
    const partnerName = `Regression Partner ${fixtureKey}`;
    const businessAddress = "42 Regression Avenue";
    const documents = [{
      type: "trade_license",
      name: "trade-license.pdf",
      objectPath: `/objects/uploads/${fixtureKey}/trade-license.pdf`,
      size: 2048,
      contentType: "application/pdf",
    }];
    const registration = {
      partnerName,
      entityType: "Company",
      businessAddress,
      mobileNumber: "9000000199",
      email: `partner-${fixtureKey}@example.test`,
      agreementDate: "2026-09-06",
      formData: {
        franchiseePan: `REGRESSIONPAN${regressionSuffix}`,
        approvedLocation: `REGRESSIONCITY${regressionSuffix}`,
        bankAccountName: `REGRESSIONBANK${regressionSuffix}`,
        initialFranchiseFee: 125000,
        subFranchiseName: `REGRESSIONSUB${regressionSuffix}`,
        equipment: [{
          name: `REGRESSIONEQUIPMENT${regressionSuffix}`,
          makeModel: "RegressionModel",
          serialNumber: "RegressionSerial",
        }],
      },
      documents,
    };

    const created = await request("/partner-agreements", json(registration), adminCookie);
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const first = created.body as {
      id: number;
      partnerCode: string;
      partnerName: string;
      documents: typeof documents;
    };
    createdPartnerAgreementIds.push(first.id);
    assert.equal(first.partnerCode, `HB11${String(highestExistingSerial + 1).padStart(3, "0")}`);
    assert.match(first.partnerCode, /^HB11\d{3}$/);
    assert.equal(first.partnerName, partnerName);
    assert.deepEqual(first.documents, documents);

    const approvalBeforeUpload = await request(
      `/partner-agreements/${first.id}/approve`,
      json({}),
      adminCookie,
    );
    assert.equal(approvalBeforeUpload.response.status, 400);

    const signedAgreement = {
      name: "signed-franchise-agreement.pdf",
      objectPath: `/objects/uploads/${fixtureKey}/signed-franchise-agreement.pdf`,
      size: 4096,
      contentType: "application/pdf",
    };
    const signedUpload = await request(
      `/partner-agreements/${first.id}/signed-agreement`,
      json(signedAgreement),
      adminCookie,
    );
    assert.equal(signedUpload.response.status, 200, JSON.stringify(signedUpload.body));
    assert.equal((signedUpload.body as { status: string }).status, "SIGNED_UPLOADED");
    assert.equal(
      (signedUpload.body as { documents: Array<{ type: string }> }).documents.some((document) => document.type === "signed_agreement"),
      true,
    );

    const approved = await request(
      `/partner-agreements/${first.id}/approve`,
      json({}),
      adminCookie,
    );
    assert.equal(approved.response.status, 200, JSON.stringify(approved.body));
    assert.equal((approved.body as { status: string }).status, "APPROVED");
    assert.equal((approved.body as { portalDetails: { hasPassword: boolean } }).portalDetails.hasPassword, false);

    const portalPassword = `PortalSecret-${fixtureKey}`;
    const portalDetails = await request(
      `/partner-agreements/${first.id}/portal-details`,
      patchJson({
        url: "https://portal.hydranet.example/login",
        username: `portal-${fixtureKey}@example.test`,
        password: portalPassword,
      }),
      adminCookie,
    );
    assert.equal(portalDetails.response.status, 200, JSON.stringify(portalDetails.body));
    assert.deepEqual((portalDetails.body as { portalDetails: unknown }).portalDetails, {
      url: "https://portal.hydranet.example/login",
      username: `portal-${fixtureKey}@example.test`,
      hasPassword: true,
    });
    const [storedPartner] = await db
      .select({
        portalPasswordEncrypted: partnerAgreementsTable.portalPasswordEncrypted,
        status: partnerAgreementsTable.status,
      })
      .from(partnerAgreementsTable)
      .where(eq(partnerAgreementsTable.id, first.id));
    assert.equal(storedPartner?.status, "APPROVED");
    assert.ok(storedPartner?.portalPasswordEncrypted);
    assert.notEqual(storedPartner?.portalPasswordEncrypted, portalPassword);

    const second = await request(
      "/partner-agreements",
      json({ ...registration, partnerName: `${partnerName} Second` }),
      adminCookie,
    );
    assert.equal(second.response.status, 201, JSON.stringify(second.body));
    const secondAgreement = second.body as { id: number; partnerCode: string };
    createdPartnerAgreementIds.push(secondAgreement.id);
    assert.equal(
      secondAgreement.partnerCode,
      `HB11${String(highestExistingSerial + 2).padStart(3, "0")}`,
    );

    const unauthenticatedUploadRequest = await request(
      "/storage/uploads/request-url",
      json({}),
    );
    assert.equal(unauthenticatedUploadRequest.response.status, 401);
    assert.deepEqual(unauthenticatedUploadRequest.body, { error: "Authentication required" });

    const unauthenticatedDocument = await request(
      `/storage/objects${documents[0].objectPath.slice("/objects".length)}`,
    );
    assert.equal(unauthenticatedDocument.response.status, 401);
    assert.deepEqual(unauthenticatedDocument.body, { error: "Authentication required" });

    const pdfResponse = await fetch(
      `${baseUrl}/api/partner-agreements/${first.id}/pdf`,
      { headers: { cookie: adminCookie } },
    );
    assert.equal(pdfResponse.status, 200);
    assert.match(pdfResponse.headers.get("content-type") ?? "", /^application\/pdf/);
    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const pdf = await PDFDocument.load(pdfBytes);
    assert.equal(pdf.getPageCount(), 10);
    const pdfText = await extractPdfText(pdfBytes);
    assert.match(pdfText, new RegExp(partnerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(pdfText, new RegExp(businessAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const pdfWords = await extractPdfWords(pdfBytes);
    assertPdfValueInRegion(pdfWords, `REGRESSIONPAN${regressionSuffix}`, {
      page: 0,
      xMin: 140,
      yMin: 730,
      xMax: 300,
      yMax: 755,
    });
    assertPdfValueInRegion(pdfWords, `REGRESSIONCITY${regressionSuffix}`, {
      page: 1,
      xMin: 290,
      yMin: 208,
      xMax: 520,
      yMax: 232,
    });
    assertPdfValueInRegion(pdfWords, "125000", {
      page: 3,
      xMin: 60,
      yMin: 267,
      xMax: 180,
      yMax: 290,
    });
    assertPdfValueInRegion(pdfWords, `REGRESSIONSUB${regressionSuffix}`, {
      page: 5,
      xMin: 230,
      yMin: 380,
      xMax: 525,
      yMax: 405,
    });
    assertPdfValueInRegion(pdfWords, `REGRESSIONBANK${regressionSuffix}`, {
      page: 7,
      xMin: 225,
      yMin: 300,
      xMax: 525,
      yMax: 325,
    });
    assertPdfValueInRegion(pdfWords, `REGRESSIONEQUIPMENT${regressionSuffix}`, {
      page: 8,
      xMin: 105,
      yMin: 562,
      xMax: 235,
      yMax: 592,
    });
  });

  test("assigns unique sequential partner codes to simultaneous registrations", async () => {
    const adminCookie = await login(adminEmail, adminPassword);
    const existingAgreements = await db
      .select({ partnerCode: partnerAgreementsTable.partnerCode })
      .from(partnerAgreementsTable);
    const highestExistingSerial = existingAgreements.reduce((highest, agreement) => {
      const match = /^HB11(\d{3})$/.exec(agreement.partnerCode);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, -1);

    const registrations = [0, 1].map((index) => ({
      partnerName: `Concurrent Regression Partner ${fixtureKey}-${index}`,
      entityType: "Company",
      businessAddress: `${index + 1} Concurrent Avenue`,
      mobileNumber: `90000001${String(index).padStart(2, "0")}`,
      email: `concurrent-partner-${fixtureKey}-${index}@example.test`,
      agreementDate: "2026-09-06",
      formData: {
        approvedLocation: "Concurrent Test City",
      },
    }));

    const results = await Promise.all(
      registrations.map((registration) =>
        request("/partner-agreements", json(registration), adminCookie),
      ),
    );
    for (const result of results) {
      const body = result.body as { id?: unknown } | undefined;
      if (typeof body?.id === "number") createdPartnerAgreementIds.push(body.id);
    }

    for (const result of results) {
      assert.equal(result.response.status, 201, JSON.stringify(result.body));
    }
    const partnerCodes = results
      .map((result) => (result.body as { partnerCode: string }).partnerCode)
      .sort();
    assert.deepEqual(partnerCodes, [
      `HB11${String(highestExistingSerial + 1).padStart(3, "0")}`,
      `HB11${String(highestExistingSerial + 2).padStart(3, "0")}`,
    ]);
  });

  test("enforces granular delete permissions and removes customer and disposable team records", async () => {
    const adminCookie = await login(adminEmail, adminPassword);
    const staffCookie = await login(staffEmail, staffPassword);
    const createdUser = await request(
      "/users",
      json({
        name: "Disposable Integration Member",
        email: `disposable-${fixtureKey}@example.test`,
        phone: "9000000066",
        password: "DisposableUser@2026",
        role: "STAFF",
        department: "Integration Tests",
      }),
      adminCookie,
    );
    assert.equal(createdUser.response.status, 201, JSON.stringify(createdUser.body));
    const createdUserId = (createdUser.body as { id: number }).id;

    const forbiddenUserDelete = await request(`/users/${createdUserId}`, { method: "DELETE" }, staffCookie);
    assert.equal(forbiddenUserDelete.response.status, 403);

    const deletedUser = await request(`/users/${createdUserId}`, { method: "DELETE" }, adminCookie);
    assert.equal(deletedUser.response.status, 204, JSON.stringify(deletedUser.body));
    const usersAfterDelete = await request("/users", {}, adminCookie);
    assert.equal((usersAfterDelete.body as Array<{ id: number }>).some((user) => user.id === createdUserId), false);

    const [plan] = await db
      .select({ id: plansTable.id })
      .from(plansTable)
      .where(eq(plansTable.status, "ACTIVE"))
      .limit(1);
    assert.ok(plan);
    const createdCustomer = await request(
      "/customers",
      json({
        name: "Disposable Customer",
        mobileNumber: "9000000067",
        radiusAccountNumber: `DEL-${fixtureKey.slice(0, 8)}`,
        username: `delete-${fixtureKey.slice(0, 8)}`,
        planId: plan.id,
      }),
      adminCookie,
    );
    assert.equal(createdCustomer.response.status, 201, JSON.stringify(createdCustomer.body));
    const createdCustomerId = (createdCustomer.body as { id: number }).id;
    createdCustomerIds.push(createdCustomerId);

    const forbiddenCustomerDelete = await request(`/customers/${createdCustomerId}`, { method: "DELETE" }, staffCookie);
    assert.equal(forbiddenCustomerDelete.response.status, 403);

    const deletedCustomer = await request(`/customers/${createdCustomerId}`, { method: "DELETE" }, adminCookie);
    assert.equal(deletedCustomer.response.status, 204, JSON.stringify(deletedCustomer.body));
    const deletedLedger = await request(`/customers/${createdCustomerId}/ledger`, {}, adminCookie);
    assert.equal(deletedLedger.response.status, 404);
  });
});

describe("report exports", () => {
  test("exports filtered attendance workbooks and PDFs with summary context", async () => {
    await db.insert(attendanceTable).values([
      {
        userId: staffId,
        date: "2026-09-04",
        inTime: new Date("2026-09-04T09:00:00.000Z"),
        outTime: new Date("2026-09-04T17:00:00.000Z"),
        status: "PRESENT",
        durationMinutes: 480,
      },
      {
        userId: adminId,
        date: "2026-09-04",
        inTime: new Date("2026-09-04T10:00:00.000Z"),
        outTime: new Date("2026-09-04T12:00:00.000Z"),
        status: "LATE",
        durationMinutes: 120,
      },
    ]);
    const adminCookie = await login(adminEmail, adminPassword);
    const query = new URLSearchParams({
      from: "2026-09-04",
      to: "2026-09-04",
      search: "Integration Staff",
      status: "PRESENT",
    });

    const workbook = await request(`/attendance/export.xlsx?${query}`, {}, adminCookie);
    assert.equal(workbook.response.status, 200);
    assert.match(
      workbook.response.headers.get("content-type") ?? "",
      /^application\/vnd\.ms-excel(?:;|$)/,
    );
    assert.match(String(workbook.body), /Date range: 2026-09-04 to 2026-09-04/);
    assert.match(String(workbook.body), /Status: PRESENT/);
    assert.match(String(workbook.body), /Search: Integration Staff/);
    assert.match(String(workbook.body), /Records: 1 · Total hours: 8\.0/);
    assert.match(String(workbook.body), /Integration Staff/);
    assert.doesNotMatch(String(workbook.body), /Integration Admin/);

    const attendancePdf = await request(`/attendance/export.pdf?${query}`, {}, adminCookie);
    assert.equal(attendancePdf.response.status, 200);
    assert.equal(attendancePdf.response.headers.get("content-type"), "application/pdf");
    assert.match(String(attendancePdf.body), /^%PDF-1\.4\n/);
    assert.match(String(attendancePdf.body), /Attendance summary/);
    assert.match(String(attendancePdf.body), /Date range: 2026-09-04 to 2026-09-04/);
    assert.match(String(attendancePdf.body), /Records: 1   Total hours: 8\.0/);

    const attendanceDownloads = await db
      .select({
        actorId: activityTable.actorId,
        actor: activityTable.actor,
        action: activityTable.action,
        target: activityTable.target,
        reportType: activityTable.reportType,
        reportFormat: activityTable.reportFormat,
        filterContext: activityTable.filterContext,
      })
      .from(activityTable)
      .where(eq(activityTable.actorId, adminId));
    assert.deepEqual(
      attendanceDownloads.filter((item) => item.reportType === "Attendance").slice(-2),
      [
        {
          actorId: adminId,
          actor: "Integration Admin",
          action: "downloaded",
          target: "Attendance report (XLSX)",
          reportType: "Attendance",
          reportFormat: "XLSX",
          filterContext: "Date range: 2026-09-04 to 2026-09-04 · Status: PRESENT · Search: Integration Staff",
        },
        {
          actorId: adminId,
          actor: "Integration Admin",
          action: "downloaded",
          target: "Attendance report (PDF)",
          reportType: "Attendance",
          reportFormat: "PDF",
          filterContext: "Date range: 2026-09-04 to 2026-09-04 · Status: PRESENT · Search: Integration Staff",
        },
      ],
    );

    const staffExport = await request(
      `/attendance/export.xlsx?${query}`,
      {},
      await login(staffEmail, staffPassword),
    );
    assert.equal(staffExport.response.status, 403);
    const staffAttendanceDownloads = await db
      .select({ id: activityTable.id })
      .from(activityTable)
      .where(and(eq(activityTable.actorId, staffId), eq(activityTable.reportType, "Attendance")));
    assert.equal(staffAttendanceDownloads.length, 0);

    const invalidExport = await request(
      "/attendance/export.xlsx?from=2026-09-05&to=2026-09-04",
      {},
      adminCookie,
    );
    assert.equal(invalidExport.response.status, 400);
    const downloadsAfterInvalidRequest = await db
      .select({ id: activityTable.id })
      .from(activityTable)
      .where(and(eq(activityTable.actorId, adminId), eq(activityTable.reportType, "Attendance")));
    assert.equal(downloadsAfterInvalidRequest.length, 2);

    const dashboard = await request("/dashboard/activity", {}, adminCookie);
    assert.equal(dashboard.response.status, 200);
    assert.ok(
      (dashboard.body as Array<{ actorId?: number; reportType?: string; reportFormat?: string; filterContext?: string }>)
        .some((item) =>
          item.reportType === "Attendance"
          && item.reportFormat === "PDF"
          && item.filterContext === "Date range: 2026-09-04 to 2026-09-04 · Status: PRESENT · Search: Integration Staff"),
      "dashboard activity should include report download metadata",
    );
  });

  test("exports expense PDFs with valid summaries scoped to staff claims", async () => {
    const staffTitle = `Staff export claim ${fixtureKey}`;
    const adminTitle = `Admin export claim ${fixtureKey}`;
    await createExpense(staffTitle);
    await createExpenseAs(adminEmail, adminPassword, adminTitle, 900);

    const staffPdf = await request(
      "/expenses/export.pdf",
      {},
      await login(staffEmail, staffPassword),
    );
    assert.equal(staffPdf.response.status, 200);
    assert.equal(staffPdf.response.headers.get("content-type"), "application/pdf");
    assert.match(String(staffPdf.body), /^%PDF-1\.4\n/);
    assert.match(String(staffPdf.body), /Expense summary/);
    assert.match(String(staffPdf.body), /Date range: All dates to All dates/);
    assert.match(String(staffPdf.body), /Status: All/);
    assert.match(String(staffPdf.body), /Search: All records/);
    assert.match(String(staffPdf.body), /Claims: \d+   Ledger total: INR [\d.]+/);
    assert.match(String(staffPdf.body), new RegExp(staffTitle));
    assert.doesNotMatch(String(staffPdf.body), new RegExp(adminTitle));

    const expenseDownloads = await db
      .select({
        actorId: activityTable.actorId,
        actor: activityTable.actor,
        action: activityTable.action,
        target: activityTable.target,
        reportType: activityTable.reportType,
        reportFormat: activityTable.reportFormat,
        filterContext: activityTable.filterContext,
      })
      .from(activityTable)
      .where(and(eq(activityTable.actorId, staffId), eq(activityTable.reportType, "Expense")));
    assert.deepEqual(expenseDownloads.slice(-1), [{
      actorId: staffId,
      actor: "Integration Staff",
      action: "downloaded",
      target: "Expense report (PDF)",
      reportType: "Expense",
      reportFormat: "PDF",
      filterContext: "Date range: All dates to All dates · Status: All · Search: All records",
    }]);

    const invalidExpenseExport = await request(
      "/expenses/export.pdf?status=UNKNOWN",
      {},
      await login(staffEmail, staffPassword),
    );
    assert.equal(invalidExpenseExport.response.status, 400);
    const expenseDownloadsAfterInvalidRequest = await db
      .select({ id: activityTable.id })
      .from(activityTable)
      .where(and(eq(activityTable.actorId, staffId), eq(activityTable.reportType, "Expense")));
    assert.equal(expenseDownloadsAfterInvalidRequest.length, 1);
  });

  test("builds monthly attendance, payroll, and payslip reports", async () => {
    const adminCookie = await login(adminEmail, adminPassword);
    const structures = await request("/hr/salary-structures", {}, adminCookie);
    assert.equal(structures.response.status, 200);
    const staffStructure = (structures.body as Array<{ id: number; userId: number; basicSalary: number; hra: number; conveyanceAllowance: number; medicalAllowance: number; otherAllowance: number; pfRate: number; esiRate: number; professionalTax: number; otherDeduction: number; effectiveFrom: string }>).find((structure) => structure.userId === staffId);
    assert.ok(staffStructure, "seeded staff should have a salary structure");

    const savedStructure = await request(
      `/hr/salary-structures/${staffId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          basicSalary: staffStructure.basicSalary,
          hra: staffStructure.hra,
          conveyanceAllowance: staffStructure.conveyanceAllowance,
          medicalAllowance: staffStructure.medicalAllowance,
          otherAllowance: staffStructure.otherAllowance,
          pfRate: staffStructure.pfRate,
          esiRate: staffStructure.esiRate,
          professionalTax: staffStructure.professionalTax,
          otherDeduction: staffStructure.otherDeduction,
          effectiveFrom: staffStructure.effectiveFrom.slice(0, 10),
        }),
      },
      adminCookie,
    );
    assert.equal(savedStructure.response.status, 200);

    const monthly = await request("/attendance/monthly?month=2026-09", {}, adminCookie);
    assert.equal(monthly.response.status, 200);
    assert.ok((monthly.body as Array<{ userId: number; records: unknown[]; paidDays: number }>).some((report) => report.userId === staffId && report.records.length > 0 && report.paidDays > 0));

    const payroll = await request("/hr/payroll/run", json({ month: "2026-09" }), adminCookie);
    assert.equal(payroll.response.status, 200, JSON.stringify(payroll.body));
    const payslips = (payroll.body as { status: string; payslips: Array<{ id: number; userId: number; netSalary: number }> }).payslips;
    assert.equal((payroll.body as { status: string }).status, "GENERATED");
    const staffPayslip = payslips.find((payslip) => payslip.userId === staffId);
    assert.ok(staffPayslip && staffPayslip.netSalary >= 0, "payroll should include a non-negative staff net salary");

    const payslipPdf = await request(`/hr/payslips/${staffPayslip!.id}.pdf`, {}, adminCookie);
    assert.equal(payslipPdf.response.status, 200);
    assert.equal(payslipPdf.response.headers.get("content-type"), "application/pdf");
    assert.match(String(payslipPdf.body), /Employee payslip/);
    assert.match(String(payslipPdf.body), /Net salary payable/);
  });
});