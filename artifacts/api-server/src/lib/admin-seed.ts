import { and, eq, sql } from "drizzle-orm";
import { db, activityTable, attendanceTable, expensesTable, permissionsTable, plansTable, rolePermissionsTable, rolesTable, salaryStructuresTable, usersTable } from "@workspace/db";
import { hashPassword } from "./admin-auth";

const roles = [
  ["SUPERADMIN", "Unrestricted system access"],
  ["ADMIN", "Operations and people management"],
  ["STAFF", "Personal attendance and expenses"],
] as const;

const permissions = [
  ["PLANS_WRITE", "Create, edit and archive broadband plans"],
  ["USERS_CREATE", "Create team members"],
  ["USERS_UPDATE", "Edit team members"],
  ["USERS_DELETE", "Delete team members"],
  ["EXPENSE_APPROVE", "Approve or reject expense claims"],
  ["ATTENDANCE_EXPORT", "Export attendance reports"],
  ["PAYROLL_WRITE", "Manage salary structures and generate payroll"],
  ["CUSTOMERS_CREATE", "Create customer records and import accounts"],
  ["CUSTOMERS_UPDATE", "Edit customer records and ledger entries"],
  ["CUSTOMERS_DELETE", "Delete customer records"],
] as const;

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function seedAdminData(): Promise<void> {
  await db.update(permissionsTable).set({ code: "USERS_CREATE", description: "Create team members" }).where(eq(permissionsTable.code, "USERS_WRITE"));
  await db.update(permissionsTable).set({ code: "CUSTOMERS_CREATE", description: "Create customer records and import accounts" }).where(eq(permissionsTable.code, "CUSTOMERS_WRITE"));
  await db.update(plansTable).set({ billingCycle: "ONE_MONTH" }).where(eq(plansTable.billingCycle, "MONTHLY"));
  await db.update(plansTable).set({ billingCycle: "SIX_MONTHS" }).where(eq(plansTable.billingCycle, "QUARTERLY"));
  await db.update(plansTable).set({ billingCycle: "TWELVE_MONTHS" }).where(eq(plansTable.billingCycle, "YEARLY"));

  for (const [code, description] of roles) {
    await db.insert(rolesTable).values({ code, description }).onConflictDoNothing({ target: rolesTable.code });
  }
  for (const [code, description] of permissions) {
    await db.insert(permissionsTable).values({ code, description }).onConflictDoNothing({ target: permissionsTable.code });
  }

  const roleRows = await db.select().from(rolesTable);
  const roleId = new Map(roleRows.map((role) => [role.code, role.id]));
  const permissionRows = await db.select().from(permissionsTable);
  for (const role of roleRows) {
    for (const permission of permissionRows) {
      const allowed = role.code === "SUPERADMIN" ||
      (role.code === "ADMIN" && ["PLANS_WRITE", "USERS_CREATE", "USERS_UPDATE", "USERS_DELETE", "EXPENSE_APPROVE", "ATTENDANCE_EXPORT", "PAYROLL_WRITE", "CUSTOMERS_CREATE", "CUSTOMERS_UPDATE", "CUSTOMERS_DELETE"].includes(permission.code));
      if (allowed) {
        await db.insert(rolePermissionsTable).values({ roleId: role.id, permissionId: permission.id }).onConflictDoNothing();
      }
    }
  }

  const [legacyDemoUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, "superadmin@hydranet.in"));
  if (legacyDemoUser) {
    await db
      .update(usersTable)
      .set({
        email: "admin@hydranetbroadband.in",
        passwordHash: hashPassword("Spahari@20"),
        status: "ACTIVE",
      })
      .where(eq(usersTable.id, legacyDemoUser.id));
  }

  const existingUsers = await db.select({ id: usersTable.id, roleId: usersTable.roleId }).from(usersTable);
  const seedSalaryStructure = (roleIdValue: number) => ({
    basicSalary: roleIdValue === roleId.get("ADMIN") ? 45000 : roleIdValue === roleId.get("SUPERADMIN") ? 75000 : 25000,
    hra: roleIdValue === roleId.get("ADMIN") ? 18000 : roleIdValue === roleId.get("SUPERADMIN") ? 30000 : 10000,
    conveyanceAllowance: 2500,
    medicalAllowance: 1500,
    otherAllowance: 1000,
    pfRate: 12,
    esiRate: 0,
    professionalTax: 200,
    otherDeduction: 0,
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  for (const user of existingUsers) {
    await db.insert(salaryStructuresTable).values({ userId: user.id, ...seedSalaryStructure(user.roleId) }).onConflictDoNothing({ target: salaryStructuresTable.userId });
  }
  if (existingUsers.length > 0) return;

  const users = [
    { name: "Subhadeep Roy", email: "superadmin@hydranet.in", phone: "7864068605", role: "SUPERADMIN", department: "Leadership" },
    { name: "Ananya Sen", email: "ananya@hydranet.in", phone: "9007001001", role: "ADMIN", department: "Operations" },
    { name: "Debjit Ghosh", email: "debjit@hydranet.in", phone: "9007001002", role: "ADMIN", department: "Billing & Sales" },
    { name: "Riya Das", email: "riya@hydranet.in", phone: "9007001003", role: "STAFF", department: "Network Engineering" },
    { name: "Kunal Paul", email: "kunal@hydranet.in", phone: "9007001004", role: "STAFF", department: "Field Tech" },
    { name: "Soham Dutta", email: "soham@hydranet.in", phone: "9007001005", role: "STAFF", department: "Field Tech" },
    { name: "Moumita Das", email: "moumita@hydranet.in", phone: "9007001006", role: "STAFF", department: "Customer Experience" },
  ];

  const insertedUsers = [];
  for (const user of users) {
    const [inserted] = await db.insert(usersTable).values({
      ...user,
      roleId: roleId.get(user.role)!,
      passwordHash: hashPassword("Hydranet@2026"),
    }).returning();
    insertedUsers.push({ ...inserted, role: user.role });
  }
  for (const user of insertedUsers) {
    await db.insert(salaryStructuresTable).values({ userId: user.id, ...seedSalaryStructure(user.roleId) }).onConflictDoNothing({ target: salaryStructuresTable.userId });
  }

  const planSeed = [
    ["Starter 50", 50, 25, 499, ["YouTube"]],
    ["Home 100", 100, 50, 699, ["YouTube", "JioHotstar"]],
    ["Stream 150", 150, 75, 899, ["JioHotstar", "ZEE5"]],
    ["Work 200", 200, 100, 1099, ["Amazon Prime", "Sony LIV"]],
    ["Pro 300", 300, 150, 1499, ["Netflix", "JioHotstar", "ZEE5"]],
    ["Ultra 500", 500, 250, 1999, ["Netflix", "Amazon Prime", "Disney+"]],
  ] as const;
  for (const [name, downloadMbps, uploadMbps, price, ottBenefits] of planSeed) {
    await db.insert(plansTable).values({ name, downloadMbps, uploadMbps, price, billingCycle: "ONE_MONTH", ottBenefits: [...ottBenefits], status: "ACTIVE" });
  }

  const staff = insertedUsers.filter((user) => user.role === "STAFF");
  for (let day = 0; day < 30; day += 1) {
    for (const [index, user] of staff.entries()) {
      const inTime = new Date();
      inTime.setDate(inTime.getDate() - day);
      inTime.setHours(9 + (index === 1 ? 1 : 0), 10 + index * 4, 0, 0);
      const outTime = new Date(inTime.getTime() + (8 * 60 + 20) * 60 * 1000);
      await db.insert(attendanceTable).values({
        userId: user.id,
        date: daysAgo(day),
        inTime,
        outTime,
        durationMinutes: 500,
        status: index === 1 ? "LATE" : "PRESENT",
      });
    }
  }

  const expenseSeed = [
    ["Fiber splice kit", "FIBER_MAINTENANCE", 4850, "UPI", "Riya Das"],
    ["Kharagpur route fuel", "FUEL_TRANSPORT", 2200, "CARD", "Kunal Paul"],
    ["ONT replacements", "HARDWARE_CABLES", 12750, "UPI", "Soham Dutta"],
    ["Customer welcome kits", "MARKETING", 3400, "CASH", "Moumita Das"],
    ["Office power backup", "OFFICE_UTILITIES", 8900, "CARD", "Ananya Sen"],
    ["Team lunch", "FOOD", 2850, "CASH", "Debjit Ghosh"],
  ] as const;
  for (const [index, [title, category, amount, paymentMode, submitter]] of expenseSeed.entries()) {
    const user = insertedUsers.find((item) => item.name === submitter)!;
    await db.insert(expensesTable).values({
      voucherId: `EXP-${String(2601 + index)}`,
      title,
      category,
      amount,
      date: daysAgo(index + 1),
      paymentMode,
      status: index < 2 ? "PENDING" : index === 2 ? "APPROVED" : "REJECTED",
      submittedById: user.id,
      approvedById: index < 2 ? null : insertedUsers[1].id,
      notes: "Seeded for the first admin review.",
    });
  }

  await db.insert(activityTable).values([
    { actorId: insertedUsers[0].id, actor: insertedUsers[0].name, action: "seeded the admin workspace", target: "Hydranet ERP", timestamp: new Date() },
    { actorId: insertedUsers[1].id, actor: insertedUsers[1].name, action: "approved an expense claim", target: "EXP-2603", timestamp: new Date(Date.now() - 1000 * 60 * 45) },
    { actorId: insertedUsers[2].id, actor: insertedUsers[2].name, action: "updated a broadband plan", target: "Pro 300", timestamp: new Date(Date.now() - 1000 * 60 * 140) },
  ]);
}