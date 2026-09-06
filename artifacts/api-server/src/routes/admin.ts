import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, gte, or, sql } from "drizzle-orm";
import {
  activityTable,
  attendanceTable,
  db,
  expensesTable,
  permissionsTable,
  payslipsTable,
  payrollRunsTable,
  plansTable,
  rolePermissionsTable,
  rolesTable,
  salaryStructuresTable,
  usersTable,
} from "@workspace/db";
import {
  ArchivePlanParams,
  CreateExpenseBody,
  CreateExpenseResponse,
  CreatePlanBody,
  CreateUserBody,
  DecideExpenseResponse,
  DecideExpenseBody,
  DecideExpenseParams,
  GetCurrentUserResponse,
  GetDashboardActivityResponse,
  GetDashboardSummaryResponse,
  GetMyAttendanceResponse,
  GetPlanParams,
  GetPlanResponse,
  ListAttendanceResponse,
  ListExpensesResponse,
  ListPlansResponse,
  ListRolePermissionsResponse,
  ListMonthlyAttendanceQueryParams,
  ListMonthlyAttendanceResponse,
  ListSalaryStructuresResponse,
  GetPayrollQueryParams,
  GetPayrollResponse,
  UpdateSalaryStructureBody,
  UpdateSalaryStructureParams,
  UpdateSalaryStructureResponse,
  GeneratePayrollBody,
  GeneratePayrollResponse,
  ExportPayslipPdfParams,
  ExportMonthlyAttendancePdfQueryParams,
  ListUsersResponse,
  LoginBody,
  LoginResponse,
  PunchAttendanceBody,
  PunchAttendanceResponse,
  UpdatePlanBody,
  UpdatePlanParams,
  UpdateRolePermissionsBody,
  UpdateRolePermissionsParams,
  UpdateRolePermissionsResponse,
  UpdateUserBody,
  UpdateUserParams,
  UpdateProfilePhotoBody,
} from "@workspace/api-zod";
import {
  clearSessionCookie,
  getUserFromRequest,
  hashPassword,
  requireAdmin,
  requirePermission,
  requireRole,
  setSessionCookie,
  verifyPassword,
} from "../lib/admin-auth";

const router: IRouter = Router();

function mapUser(row: {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  status: string;
  isPublic: boolean;
  profilePhotoPath: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role as "SUPERADMIN" | "ADMIN" | "STAFF",
    department: row.department,
    status: row.status as "ACTIVE" | "SUSPENDED",
    isPublic: row.isPublic,
    profilePhotoPath: row.profilePhotoPath,
    createdAt: row.createdAt,
  };
}

async function listUserViews() {
  return db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: rolesTable.code,
      department: usersTable.department,
      status: usersTable.status,
      isPublic: usersTable.isPublic,
      profilePhotoPath: usersTable.profilePhotoPath,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .orderBy(asc(usersTable.name));
}

async function listRolePermissionViews() {
  const [roles, permissions, assignments] = await Promise.all([
    db.select().from(rolesTable).orderBy(asc(rolesTable.id)),
    db.select().from(permissionsTable).orderBy(asc(permissionsTable.id)),
    db.select().from(rolePermissionsTable),
  ]);
  const enabled = new Set(assignments.map((assignment) => `${assignment.roleId}:${assignment.permissionId}`));
  return roles.map((role) => ({
    id: role.id,
    code: role.code as "SUPERADMIN" | "ADMIN" | "STAFF",
    description: role.description,
    permissions: permissions.map((permission) => ({
      id: permission.id,
      code: permission.code,
      description: permission.description,
      enabled: enabled.has(`${role.id}:${permission.id}`),
    })),
  }));
}

function parsePayrollMonth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    throw new Error("Month must use YYYY-MM format");
  }
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) throw new Error("Month must be between 01 and 12");
  return { month: value, year, monthIndex: month - 1 };
}

function payrollMonthInfo(monthValue: string) {
  const { year, monthIndex } = parsePayrollMonth(monthValue);
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const endDay = monthValue === currentMonth ? Math.min(daysInMonth, now.getUTCDate()) : daysInMonth;
  let workingDays = 0;
  for (let day = 1; day <= endDay; day += 1) {
    const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) workingDays += 1;
  }
  return { daysInMonth, endDay, workingDays };
}

async function listMonthlyAttendanceViews(monthValue: string, userId?: number) {
  const monthInfo = payrollMonthInfo(monthValue);
  const [users, attendance] = await Promise.all([
    listUserViews(),
    listAttendanceViews(),
  ]);
  const rows = attendance.map(mapAttendance).filter((row) => row.date.startsWith(monthValue) && (userId === undefined || row.userId === userId));
  const activeUsers = users.filter((user) => user.status === "ACTIVE" && (userId === undefined || user.id === userId));
  return activeUsers.map((user) => {
    const records = rows.filter((row) => row.userId === user.id);
    const presentDays = records.filter((row) => row.status === "PRESENT").length;
    const lateDays = records.filter((row) => row.status === "LATE").length;
    const halfDays = records.filter((row) => row.status === "HALF_DAY").length;
    const explicitAbsentDays = records.filter((row) => row.status === "ABSENT").length;
    const recordedWeekdays = new Set(records.filter((row) => {
      const weekday = new Date(`${row.date}T00:00:00Z`).getUTCDay();
      return weekday !== 0 && weekday !== 6;
    }).map((row) => row.date)).size;
    const absentDays = explicitAbsentDays + Math.max(0, monthInfo.workingDays - recordedWeekdays - explicitAbsentDays);
    const paidDays = presentDays + lateDays + halfDays * 0.5;
    return {
      month: monthValue,
      userId: user.id,
      userName: user.name,
      department: user.department,
      daysInMonth: monthInfo.daysInMonth,
      workingDays: monthInfo.workingDays,
      presentDays,
      lateDays,
      halfDays,
      absentDays,
      paidDays,
      totalMinutes: records.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0),
      attendanceRate: monthInfo.workingDays ? Math.round((paidDays / monthInfo.workingDays) * 1000) / 10 : 0,
      records,
    };
  });
}

async function listSalaryStructureViews() {
  const [users, structures] = await Promise.all([
    db.select({
      id: usersTable.id,
      name: usersTable.name,
      department: usersTable.department,
      status: usersTable.status,
      profilePhotoPath: usersTable.profilePhotoPath,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(asc(usersTable.name)),
    db.select().from(salaryStructuresTable),
  ]);
  const structureByUser = new Map(structures.map((structure) => [structure.userId, structure]));
  return users.filter((user) => user.status === "ACTIVE").map((user) => {
    const structure = structureByUser.get(user.id);
    return {
      id: structure?.id ?? 0,
      userId: user.id,
      employeeName: user.name,
      department: user.department,
      basicSalary: structure?.basicSalary ?? 0,
      hra: structure?.hra ?? 0,
      conveyanceAllowance: structure?.conveyanceAllowance ?? 0,
      medicalAllowance: structure?.medicalAllowance ?? 0,
      otherAllowance: structure?.otherAllowance ?? 0,
      pfRate: structure?.pfRate ?? 12,
      esiRate: structure?.esiRate ?? 0,
      professionalTax: structure?.professionalTax ?? 0,
      otherDeduction: structure?.otherDeduction ?? 0,
      effectiveFrom: structure?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      updatedAt: structure?.updatedAt ?? user.createdAt,
    };
  });
}

async function listPayslipViews(payrollRunId: number) {
  const rows = await db
    .select({
      id: payslipsTable.id,
      userId: payslipsTable.userId,
      employeeName: usersTable.name,
      department: usersTable.department,
      month: payslipsTable.month,
      workingDays: payslipsTable.workingDays,
      presentDays: payslipsTable.presentDays,
      lateDays: payslipsTable.lateDays,
      halfDays: payslipsTable.halfDays,
      absentDays: payslipsTable.absentDays,
      paidDays: payslipsTable.paidDays,
      totalMinutes: payslipsTable.totalMinutes,
      baseGrossSalary: payslipsTable.baseGrossSalary,
      grossSalary: payslipsTable.grossSalary,
      attendanceDeduction: payslipsTable.attendanceDeduction,
      pfDeduction: payslipsTable.pfDeduction,
      esiDeduction: payslipsTable.esiDeduction,
      professionalTax: payslipsTable.professionalTax,
      otherDeduction: payslipsTable.otherDeduction,
      totalDeductions: payslipsTable.totalDeductions,
      netSalary: payslipsTable.netSalary,
      status: payslipsTable.status,
    })
    .from(payslipsTable)
    .innerJoin(usersTable, eq(payslipsTable.userId, usersTable.id))
    .where(eq(payslipsTable.payrollRunId, payrollRunId))
    .orderBy(asc(usersTable.name));
  return rows.map((row) => ({ ...row, status: row.status as "GENERATED" }));
}

async function getPayrollSummary(monthValue: string) {
  const [run] = await db.select().from(payrollRunsTable).where(eq(payrollRunsTable.month, monthValue));
  if (!run) return { month: monthValue, status: "NOT_GENERATED" as const, generatedAt: null, payslips: [] };
  return {
    month: monthValue,
    status: "GENERATED" as const,
    generatedAt: run.generatedAt,
    payslips: await listPayslipViews(run.id),
  };
}

async function generatePayroll(monthValue: string, actorId: number) {
  parsePayrollMonth(monthValue);
  const [reports, structures] = await Promise.all([
    listMonthlyAttendanceViews(monthValue),
    db.select().from(salaryStructuresTable),
  ]);
  const structureByUser = new Map(structures.map((structure) => [structure.userId, structure]));
  const missing = reports.filter((report) => !structureByUser.has(report.userId)).map((report) => report.userName);
  if (missing.length) throw new Error(`Salary structure missing for: ${missing.join(", ")}`);

  await db.transaction(async (transaction) => {
    const [existingRun] = await transaction.select().from(payrollRunsTable).where(eq(payrollRunsTable.month, monthValue));
    const run = existingRun
      ? (await transaction.update(payrollRunsTable).set({ generatedById: actorId, status: "GENERATED", generatedAt: new Date() }).where(eq(payrollRunsTable.id, existingRun.id)).returning())[0]
      : (await transaction.insert(payrollRunsTable).values({ month: monthValue, status: "GENERATED", generatedById: actorId }).returning())[0];
    await transaction.delete(payslipsTable).where(eq(payslipsTable.payrollRunId, run.id));
    await transaction.insert(payslipsTable).values(reports.map((report) => {
      const structure = structureByUser.get(report.userId)!;
      const baseGrossSalary = structure.basicSalary + structure.hra + structure.conveyanceAllowance + structure.medicalAllowance + structure.otherAllowance;
      const attendanceRatio = report.workingDays ? Math.min(report.paidDays / report.workingDays, 1) : 0;
      const grossSalary = Math.round(baseGrossSalary * attendanceRatio);
      const attendanceDeduction = baseGrossSalary - grossSalary;
      const pfDeduction = Math.round(structure.basicSalary * attendanceRatio * structure.pfRate / 100);
      const esiDeduction = Math.round(grossSalary * structure.esiRate / 100);
      const professionalTax = report.paidDays > 0 ? structure.professionalTax : 0;
      const totalDeductions = pfDeduction + esiDeduction + professionalTax + structure.otherDeduction;
      return {
        payrollRunId: run.id,
        userId: report.userId,
        month: monthValue,
        workingDays: report.workingDays,
        presentDays: report.presentDays,
        lateDays: report.lateDays,
        halfDays: report.halfDays,
        absentDays: report.absentDays,
        paidDays: report.paidDays,
        totalMinutes: report.totalMinutes,
        baseGrossSalary,
        grossSalary,
        attendanceDeduction,
        pfDeduction,
        esiDeduction,
        professionalTax,
        otherDeduction: structure.otherDeduction,
        totalDeductions,
        netSalary: Math.max(0, grossSalary - totalDeductions),
        status: "GENERATED",
      };
    }));
  });
  return getPayrollSummary(monthValue);
}

function mapAttendance(row: {
  id: number;
  userId: number;
  userName: string;
  date: string;
  inTime: Date | null;
  outTime: Date | null;
  inLatitude: number | null;
  inLongitude: number | null;
  inAccuracyMeters: number | null;
  outLatitude: number | null;
  outLongitude: number | null;
  outAccuracyMeters: number | null;
  status: string;
  durationMinutes: number | null;
}) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    date: row.date,
    inTime: row.inTime,
    outTime: row.outTime,
    inLatitude: row.inLatitude,
    inLongitude: row.inLongitude,
    inAccuracyMeters: row.inAccuracyMeters,
    outLatitude: row.outLatitude,
    outLongitude: row.outLongitude,
    outAccuracyMeters: row.outAccuracyMeters,
    status: row.status as "PRESENT" | "LATE" | "HALF_DAY" | "ABSENT",
    durationMinutes: row.durationMinutes,
  };
}

async function listAttendanceViews(userId?: number) {
  const query = db
    .select({
      id: attendanceTable.id,
      userId: attendanceTable.userId,
      userName: usersTable.name,
      date: attendanceTable.date,
      inTime: attendanceTable.inTime,
      outTime: attendanceTable.outTime,
      inLatitude: attendanceTable.inLatitude,
      inLongitude: attendanceTable.inLongitude,
      inAccuracyMeters: attendanceTable.inAccuracyMeters,
      outLatitude: attendanceTable.outLatitude,
      outLongitude: attendanceTable.outLongitude,
      outAccuracyMeters: attendanceTable.outAccuracyMeters,
      status: attendanceTable.status,
      durationMinutes: attendanceTable.durationMinutes,
    })
    .from(attendanceTable)
    .innerJoin(usersTable, eq(attendanceTable.userId, usersTable.id))
    .orderBy(desc(attendanceTable.date), asc(usersTable.name));
  return userId === undefined
    ? query
    : query.where(eq(attendanceTable.userId, userId));
}

function mapExpense(row: {
  id: number;
  voucherId: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  paymentMode: string;
  status: string;
  submittedBy: string;
  approvedBy: string | null;
  notes: string | null;
}) {
  return {
    id: row.id,
    voucherId: row.voucherId,
    title: row.title,
    category: row.category as "FIBER_MAINTENANCE" | "FUEL_TRANSPORT" | "HARDWARE_CABLES" | "OFFICE_UTILITIES" | "FOOD" | "MARKETING",
    amount: row.amount,
    date: row.date,
    paymentMode: row.paymentMode as "CASH" | "UPI" | "CARD",
    status: row.status as "PENDING" | "APPROVED" | "REJECTED",
    submittedBy: row.submittedBy,
    approvedBy: row.approvedBy,
    notes: row.notes,
  };
}

async function listExpenseViews() {
  const [rows, users] = await Promise.all([
    db.select().from(expensesTable).orderBy(desc(expensesTable.date), desc(expensesTable.id)),
    db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable),
  ]);
  const names = new Map(users.map((user) => [user.id, user.name]));
  return rows.map((row) => mapExpense({
    ...row,
    submittedBy: names.get(row.submittedById) ?? "Unknown",
    approvedBy: row.approvedById ? names.get(row.approvedById) ?? null : null,
  }));
}

type ReportFilters = {
  from?: string;
  to?: string;
  search?: string;
  status?: string;
};

const attendanceStatuses = new Set(["PRESENT", "LATE", "HALF_DAY", "ABSENT"]);
const expenseStatuses = new Set(["PENDING", "APPROVED", "REJECTED"]);

function parseReportFilters(query: Record<string, unknown>, statuses: Set<string>): ReportFilters {
  const read = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
  const from = read(query.from);
  const to = read(query.to);
  const search = read(query.search);
  const status = read(query.status);
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    throw new Error("Dates must use YYYY-MM-DD format");
  }
  if (from && to && from > to) {
    throw new Error("The start date must be before the end date");
  }
  if (status && !statuses.has(status)) {
    throw new Error("Unknown report status");
  }
  return { from, to, search, status };
}

function filterAttendanceRows(rows: ReturnType<typeof mapAttendance>[], filters: ReportFilters) {
  const search = filters.search?.toLowerCase();
  return rows.filter((row) =>
    (!filters.from || row.date >= filters.from)
    && (!filters.to || row.date <= filters.to)
    && (!filters.status || row.status === filters.status)
    && (!search || row.userName.toLowerCase().includes(search)),
  );
}

function filterExpenseRows(rows: ReturnType<typeof mapExpense>[], filters: ReportFilters) {
  const search = filters.search?.toLowerCase();
  return rows.filter((row) =>
    (!filters.from || row.date >= filters.from)
    && (!filters.to || row.date <= filters.to)
    && (!filters.status || row.status === filters.status)
    && (!search || `${row.title} ${row.voucherId} ${row.submittedBy}`.toLowerCase().includes(search)),
  );
}

function filterContext(filters: ReportFilters) {
  return [
    `Date range: ${filters.from ?? "All dates"} to ${filters.to ?? "All dates"}`,
    filters.status ? `Status: ${filters.status}` : "Status: All",
    filters.search ? `Search: ${filters.search}` : "Search: All records",
  ].join(" · ");
}

async function recordReportDownload(
  req: Request,
  reportType: "Attendance" | "Expense",
  reportFormat: "XLSX" | "PDF",
  filters: ReportFilters,
): Promise<void> {
  await db.insert(activityTable).values({
    actorId: req.adminUser!.id,
    actor: req.adminUser!.name,
    action: "downloaded",
    target: `${reportType} report (${reportFormat})`,
    reportType,
    reportFormat,
    filterContext: filterContext(filters),
  });
}

function xmlEscape(value: string | number) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function workbookCell(value: string | number, type: "String" | "Number" = "String", style?: string) {
  return `<Cell${style ? ` ss:StyleID="${style}"` : ""}><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
}

function buildAttendanceWorkbook(rows: ReturnType<typeof mapAttendance>[], filters: ReportFilters) {
  const totalHours = rows.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0) / 60;
  const statusCounts = [...attendanceStatuses].map((status) => `${status}: ${rows.filter((row) => row.status === status).length}`).join(" · ");
  const tableRows = [
    `<Row>${workbookCell("Hydranet Broadband", "String", "Title")}</Row>`,
    `<Row>${workbookCell("Attendance matrix export", "String", "Subtitle")}</Row>`,
    `<Row>${workbookCell(filterContext(filters), "String", "Context")}</Row>`,
    `<Row>${workbookCell(`Records: ${rows.length} · Total hours: ${totalHours.toFixed(1)} · ${statusCounts}`, "String", "Summary")}</Row>`,
    `<Row>${["Person", "Date", "In", "Out", "Duration (hours)", "Status"].map((heading) => workbookCell(heading, "String", "Header")).join("")}</Row>`,
    ...rows.map((row) => `<Row>${[
      workbookCell(row.userName),
      workbookCell(row.date),
      workbookCell(row.inTime ? row.inTime.toISOString() : "—"),
      workbookCell(row.outTime ? row.outTime.toISOString() : "—"),
      workbookCell(row.durationMinutes === null ? "—" : (row.durationMinutes / 60).toFixed(1)),
      workbookCell(row.status),
    ].join("")}</Row>`),
  ];
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16" ss:Color="#123B66"/></Style>
    <Style ss:ID="Subtitle"><Font ss:Bold="1" ss:Size="12"/></Style>
    <Style ss:ID="Context"><Font ss:Italic="1" ss:Color="#64748B"/></Style>
    <Style ss:ID="Summary"><Font ss:Bold="1" ss:Color="#C65B2E"/></Style>
    <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#123B66" ss:Pattern="Solid"/></Style>
  </Styles>
  <Worksheet ss:Name="Attendance"><Table>${tableRows.join("")}</Table></Worksheet>
</Workbook>`;
}

function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

type PdfRgb = [number, number, number];
type PdfColumn = { label: string; width: number };
type PdfReport = {
  eyebrow: string;
  title: string;
  filters: string;
  summaryLine: string;
  generated: string;
  metrics: Array<{ label: string; value: string }>;
  columns: PdfColumn[];
  rows: string[][];
};

const pdfColors = {
  navy: [0.055, 0.16, 0.27] as PdfRgb,
  blue: [0.08, 0.39, 0.58] as PdfRgb,
  orange: [0.96, 0.31, 0.05] as PdfRgb,
  ink: [0.10, 0.15, 0.21] as PdfRgb,
  muted: [0.36, 0.42, 0.50] as PdfRgb,
  pale: [0.94, 0.97, 0.98] as PdfRgb,
  line: [0.83, 0.87, 0.90] as PdfRgb,
  white: [1, 1, 1] as PdfRgb,
  green: [0.08, 0.42, 0.27] as PdfRgb,
  amber: [0.65, 0.35, 0.04] as PdfRgb,
  red: [0.63, 0.16, 0.13] as PdfRgb,
};

function pdfColor(color: PdfRgb) {
  return color.map((channel) => channel.toFixed(3)).join(" ");
}

function pdfText(commands: string[], value: string, x: number, y: number, size: number, color: PdfRgb = pdfColors.ink, bold = false) {
  commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${pdfColor(color)} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfEscape(value)}) Tj ET`);
}

function pdfRect(commands: string[], x: number, y: number, width: number, height: number, fill: PdfRgb, stroke?: PdfRgb) {
  commands.push(`${pdfColor(fill)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f`);
  if (stroke) {
    commands.push(`${pdfColor(stroke)} RG 0.6 w ${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re S`);
  }
}

function pdfLine(commands: string[], x1: number, y1: number, x2: number, y2: number, color: PdfRgb = pdfColors.line, width = 0.6) {
  commands.push(`${pdfColor(color)} RG ${width.toFixed(1)} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
}

function pdfWrap(value: string, maxCharacters: number) {
  if (value.length <= maxCharacters) return [value];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [value.slice(0, maxCharacters)];
}

function pdfCellValue(value: string, maxCharacters: number) {
  const lines = pdfWrap(value, maxCharacters);
  return lines.length > 2 ? [...lines.slice(0, 1), `${lines[1].slice(0, Math.max(0, maxCharacters - 3))}...`] : lines;
}

function pdfStatusColor(value: string) {
  if (value === "APPROVED" || value === "PRESENT") return pdfColors.green;
  if (value === "PENDING" || value === "LATE" || value === "HALF DAY") return pdfColors.amber;
  if (value === "REJECTED" || value === "ABSENT") return pdfColors.red;
  return pdfColors.muted;
}

function buildPdf(pages: string[][], searchableText: string[] = []) {
  const objects: string[] = [];
  const fontObject = 3 + pages.length * 2;
  const boldFontObject = fontObject + 1;
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  const pageRefs: string[] = [];
  pages.forEach((commands, pageIndex) => {
    const pageObject = 3 + pageIndex * 2;
    const contentObject = pageObject + 1;
    pageRefs.push(`${pageObject} 0 R`);
    const stream = commands.join("\n");
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R /F2 ${boldFontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`;
  objects[fontObject] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[boldFontObject] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;

  let pdf = "%PDF-1.4\n";
  searchableText.forEach((line) => {
    pdf += `% Hydranet report row: ${line.replace(/[\r\n%]/g, " ")}\n`;
  });
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "binary");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

function buildStructuredReportPdf(report: PdfReport) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const pages: string[][] = [];
  const firstPageRows = 13;
  const continuationRows = 20;
  const chunks: string[][][] = [];
  if (report.rows.length === 0) {
    chunks.push([]);
  } else {
    chunks.push(report.rows.slice(0, firstPageRows));
    for (let start = firstPageRows; start < report.rows.length; start += continuationRows) {
      chunks.push(report.rows.slice(start, start + continuationRows));
    }
  }

  chunks.forEach((chunk, pageIndex) => {
    const commands: string[] = [];
    const isFirstPage = pageIndex === 0;
    pdfRect(commands, 0, 742, pageWidth, 50, pdfColors.navy);
    pdfText(commands, "HYDRANET", margin, 766, 12, pdfColors.white, true);
    pdfText(commands, "BROADBAND", margin, 752, 7.5, pdfColors.white, true);
    pdfText(commands, report.eyebrow.toUpperCase(), 188, 766, 7.5, pdfColors.orange, true);
    pdfText(commands, report.title, 188, 751, 16, pdfColors.white, true);
    pdfText(commands, `Page ${pageIndex + 1} of ${chunks.length}`, 514, 757, 8, pdfColors.white);

    let cursorY = 718;
    if (isFirstPage) {
      pdfText(commands, "INTERNAL OPERATIONS REPORT", margin, cursorY, 7.5, pdfColors.orange, true);
      pdfText(commands, `Generated ${report.generated}`, margin, cursorY - 16, 9, pdfColors.muted);
      pdfText(commands, "Hydranet Broadband · Confidential", 388, cursorY - 16, 8, pdfColors.muted);
      cursorY -= 45;

      pdfRect(commands, margin, cursorY - 45, contentWidth, 57, pdfColors.pale, pdfColors.line);
      pdfText(commands, "REPORT SCOPE", margin + 14, cursorY - 5, 7, pdfColors.blue, true);
      pdfText(commands, report.filters, margin + 14, cursorY - 20, 8.5, pdfColors.ink);
      pdfText(commands, report.summaryLine, margin + 14, cursorY - 35, 8, pdfColors.muted);
      cursorY -= 76;

      const gap = 8;
      const cardWidth = (contentWidth - gap * (report.metrics.length - 1)) / report.metrics.length;
      report.metrics.forEach((metric, index) => {
        const x = margin + index * (cardWidth + gap);
        pdfRect(commands, x, cursorY - 48, cardWidth, 48, pdfColors.white, pdfColors.line);
        pdfRect(commands, x, cursorY - 4, cardWidth, 4, index === 0 ? pdfColors.orange : pdfColors.blue);
        pdfText(commands, metric.label.toUpperCase(), x + 10, cursorY - 18, 6.5, pdfColors.muted, true);
        pdfText(commands, metric.value, x + 10, cursorY - 38, 12, pdfColors.navy, true);
      });
      cursorY -= 72;
    } else {
      pdfText(commands, report.filters, margin, cursorY, 8.5, pdfColors.muted);
      cursorY -= 24;
    }

    pdfText(commands, "DETAIL REGISTER", margin, cursorY, 7.5, pdfColors.orange, true);
    cursorY -= 14;
    const headerHeight = 25;
    pdfRect(commands, margin, cursorY - headerHeight + 4, contentWidth, headerHeight, pdfColors.navy);
    let columnX = margin;
    report.columns.forEach((column) => {
      pdfText(commands, column.label.toUpperCase(), columnX + 7, cursorY - 12, 6.7, pdfColors.white, true);
      columnX += column.width;
    });
    cursorY -= headerHeight;

    if (chunk.length === 0) {
      pdfRect(commands, margin, cursorY - 36, contentWidth, 36, pdfColors.pale);
      pdfText(commands, "No records matched the selected filters.", margin + 12, cursorY - 21, 9, pdfColors.muted);
    } else {
      chunk.forEach((row, rowIndex) => {
        const rowHeight = 30;
        const rowY = cursorY - rowHeight;
        if (rowIndex % 2 === 0) pdfRect(commands, margin, rowY, contentWidth, rowHeight, [0.985, 0.99, 0.995]);
        pdfLine(commands, margin, rowY, margin + contentWidth, rowY);
        let cellX = margin;
        row.forEach((value, columnIndex) => {
          const column = report.columns[columnIndex];
          const maxChars = Math.max(7, Math.floor(column.width / 5.3));
          const lines = pdfCellValue(value, maxChars);
          const color = column.label === "Status" ? pdfStatusColor(value) : pdfColors.ink;
          lines.forEach((line, lineIndex) => pdfText(commands, line, cellX + 7, cursorY - 14 - lineIndex * 10, 7.5, color, column.label === "Status"));
          cellX += column.width;
        });
        cursorY = rowY;
      });
    }

    pdfLine(commands, margin, 39, pageWidth - margin, 39, pdfColors.line);
    pdfText(commands, "Hydranet Broadband · Internal use only", margin, 25, 7.5, pdfColors.muted);
    pdfText(commands, `Generated ${report.generated}`, pageWidth - margin - 112, 25, 7.5, pdfColors.muted);
    pages.push(commands);
  });
  return buildPdf(pages, report.rows.map((row) => row.join(" ")));
}

function buildAttendancePdf(rows: ReturnType<typeof mapAttendance>[], filters: ReportFilters) {
  const totalHours = rows.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0) / 60;
  const statusSummary = [...attendanceStatuses].map((status) => `${status.replace("_", " ")}: ${rows.filter((row) => row.status === status).length}`).join("   ");
  return buildStructuredReportPdf({
    eyebrow: "People operations",
    title: "Attendance summary",
    filters: filterContext(filters),
    summaryLine: `Records: ${rows.length}   Total hours: ${totalHours.toFixed(1)}`,
    generated: new Date().toISOString().slice(0, 10),
    metrics: [
      { label: "Records", value: String(rows.length) },
      { label: "Total hours", value: totalHours.toFixed(1) },
      { label: "Status mix", value: statusSummary || "No records" },
    ],
    columns: [
      { label: "Person", width: 155 },
      { label: "Date", width: 62 },
      { label: "In", width: 50 },
      { label: "Out", width: 50 },
      { label: "Hours", width: 62 },
      { label: "Status", width: 149 },
    ],
    rows: rows.map((row) => [
      row.userName,
      row.date,
      row.inTime ? row.inTime.toISOString().slice(11, 16) : "—",
      row.outTime ? row.outTime.toISOString().slice(11, 16) : "—",
      row.durationMinutes === null ? "—" : (row.durationMinutes / 60).toFixed(1),
      row.status.replace("_", " "),
    ]),
  });
}

function buildExpensePdf(rows: ReturnType<typeof mapExpense>[], filters: ReportFilters) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const approved = rows.filter((row) => row.status === "APPROVED").reduce((sum, row) => sum + row.amount, 0);
  const pending = rows.filter((row) => row.status === "PENDING").reduce((sum, row) => sum + row.amount, 0);
  const rejected = rows.filter((row) => row.status === "REJECTED").reduce((sum, row) => sum + row.amount, 0);
  return buildStructuredReportPdf({
    eyebrow: "Finance operations",
    title: "Expense summary",
    filters: filterContext(filters),
    summaryLine: `Claims: ${rows.length}   Ledger total: INR ${total.toFixed(2)}`,
    generated: new Date().toISOString().slice(0, 10),
    metrics: [
      { label: "Claims", value: String(rows.length) },
      { label: "Approved", value: `INR ${approved.toFixed(2)}` },
      { label: "Pending / rejected", value: `INR ${pending.toFixed(2)} / ${rejected.toFixed(2)}` },
    ],
    columns: [
      { label: "Voucher", width: 72 },
      { label: "Claim", width: 150 },
      { label: "Submitted by", width: 92 },
      { label: "Date", width: 60 },
      { label: "Amount", width: 78 },
      { label: "Status", width: 76 },
    ],
    rows: rows.map((row) => [
      row.voucherId,
      row.title,
      row.submittedBy,
      row.date,
      `INR ${row.amount.toFixed(2)}`,
      row.status,
    ]),
  });
}

function buildMonthlyAttendancePdf(reports: Awaited<ReturnType<typeof listMonthlyAttendanceViews>>, monthValue: string) {
  const rows = reports.map((report) => [
    report.userName,
    report.department,
    String(report.workingDays),
    String(report.presentDays),
    String(report.lateDays),
    String(report.halfDays),
    String(report.absentDays),
    `${report.attendanceRate}%`,
  ]);
  return buildStructuredReportPdf({
    eyebrow: "People operations",
    title: `Monthly attendance · ${monthValue}`,
    filters: `Month: ${monthValue} · Employees: ${reports.length}`,
    summaryLine: `Employees: ${reports.length}   Working days in period: ${reports[0]?.workingDays ?? 0}`,
    generated: new Date().toISOString().slice(0, 10),
    metrics: [
      { label: "Employees", value: String(reports.length) },
      { label: "Working days", value: String(reports[0]?.workingDays ?? 0) },
      { label: "Average rate", value: reports.length ? `${(reports.reduce((sum, report) => sum + report.attendanceRate, 0) / reports.length).toFixed(1)}%` : "0%" },
    ],
    columns: [
      { label: "Employee", width: 120 },
      { label: "Department", width: 112 },
      { label: "Work days", width: 52 },
      { label: "Present", width: 52 },
      { label: "Late", width: 45 },
      { label: "Half day", width: 52 },
      { label: "Absent", width: 52 },
      { label: "Rate", width: 43 },
    ],
    rows,
  });
}

type PayslipView = Awaited<ReturnType<typeof listPayslipViews>>[number];

function buildPayslipPdf(payslip: PayslipView) {
  const commands: string[] = [];
  const pageWidth = 612;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const generated = new Date().toISOString().slice(0, 10);
  pdfRect(commands, 0, 742, pageWidth, 50, pdfColors.navy);
  pdfText(commands, "HYDRANET", margin, 766, 12, pdfColors.white, true);
  pdfText(commands, "BROADBAND", margin, 752, 7.5, pdfColors.white, true);
  pdfText(commands, "HUMAN RESOURCES", 188, 766, 7.5, pdfColors.orange, true);
  pdfText(commands, "Employee payslip", 188, 751, 16, pdfColors.white, true);
  pdfText(commands, "CONFIDENTIAL", 490, 757, 7.5, pdfColors.white, true);
  pdfText(commands, "PAYSLIP SUMMARY", margin, 716, 7.5, pdfColors.orange, true);
  pdfText(commands, payslip.employeeName, margin, 696, 18, pdfColors.navy, true);
  pdfText(commands, `${payslip.department} · Salary period ${payslip.month}`, margin, 680, 9, pdfColors.muted);
  pdfText(commands, `Payslip #${String(payslip.id).padStart(6, "0")}`, 452, 696, 8, pdfColors.muted);
  pdfText(commands, `Generated ${generated}`, 452, 680, 8, pdfColors.muted);

  const cards = [
    ["BASE GROSS", `INR ${payslip.baseGrossSalary.toFixed(2)}`],
    ["TOTAL DEDUCTIONS", `INR ${payslip.totalDeductions.toFixed(2)}`],
    ["NET PAY", `INR ${payslip.netSalary.toFixed(2)}`],
  ];
  const gap = 8;
  const cardWidth = (contentWidth - gap * 2) / 3;
  cards.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + gap);
    pdfRect(commands, x, 614, cardWidth, 48, pdfColors.white, pdfColors.line);
    pdfRect(commands, x, 658, cardWidth, 4, index === 2 ? pdfColors.orange : pdfColors.blue);
    pdfText(commands, label, x + 10, 644, 6.5, pdfColors.muted, true);
    pdfText(commands, value, x + 10, 625, 11, index === 2 ? pdfColors.orange : pdfColors.navy, true);
  });

  pdfText(commands, "ATTENDANCE BASIS", margin, 586, 7.5, pdfColors.orange, true);
  pdfRect(commands, margin, 522, contentWidth, 48, pdfColors.pale, pdfColors.line);
  const attendanceItems = [
    `Working days: ${payslip.workingDays}`,
    `Paid days: ${payslip.paidDays}`,
    `Present: ${payslip.presentDays}`,
    `Late: ${payslip.lateDays}`,
    `Half day: ${payslip.halfDays}`,
    `Absent: ${payslip.absentDays}`,
    `Hours: ${(payslip.totalMinutes / 60).toFixed(1)}`,
  ];
  attendanceItems.forEach((item, index) => pdfText(commands, item, margin + 12 + (index % 4) * 125, 548 - Math.floor(index / 4) * 16, 8, pdfColors.ink, index === 1));

  pdfText(commands, "EARNINGS & DEDUCTIONS", margin, 494, 7.5, pdfColors.orange, true);
  pdfRect(commands, margin, 455, contentWidth, 24, pdfColors.navy);
  pdfText(commands, "COMPONENT", margin + 10, 464, 7, pdfColors.white, true);
  pdfText(commands, "AMOUNT", 468, 464, 7, pdfColors.white, true);
  const lines = [
    ["Base gross salary", payslip.baseGrossSalary],
    ["Attendance deduction", -payslip.attendanceDeduction],
    ["Gross salary after attendance", payslip.grossSalary],
    ["PF deduction", -payslip.pfDeduction],
    ["ESI deduction", -payslip.esiDeduction],
    ["Professional tax", -payslip.professionalTax],
    ["Other deduction", -payslip.otherDeduction],
    ["Net salary payable", payslip.netSalary],
  ];
  lines.forEach(([label, amount], index) => {
    const y = 455 - (index + 1) * 25;
    if (index % 2 === 0) pdfRect(commands, margin, y, contentWidth, 25, [0.985, 0.99, 0.995]);
    pdfLine(commands, margin, y, margin + contentWidth, y);
    pdfText(commands, String(label), margin + 10, y + 9, 8.5, index === lines.length - 1 ? pdfColors.orange : pdfColors.ink, index === lines.length - 1);
    pdfText(commands, `INR ${Number(amount).toFixed(2)}`, 468, y + 9, 8.5, index === lines.length - 1 ? pdfColors.orange : pdfColors.ink, index === lines.length - 1);
  });
  pdfLine(commands, margin, 39, pageWidth - margin, 39, pdfColors.line);
  pdfText(commands, "Hydranet Broadband · Confidential payroll document", margin, 25, 7.5, pdfColors.muted);
  pdfText(commands, `Page 1 of 1 · Generated ${generated}`, 420, 25, 7.5, pdfColors.muted);
  return buildPdf([commands], [
    `${payslip.employeeName} ${payslip.month}`,
    `Base gross salary INR ${payslip.baseGrossSalary.toFixed(2)}`,
    `Net salary payable INR ${payslip.netSalary.toFixed(2)}`,
  ]);
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const identifier = parsed.data.identifier.trim();
  const phoneDigits = identifier.replace(/\D/g, "");
  const phoneCandidates = Array.from(new Set([
    identifier,
    phoneDigits,
    phoneDigits.length > 10 ? phoneDigits.slice(-10) : "",
  ].filter(Boolean)));
  const [row] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      passwordHash: usersTable.passwordHash,
      role: rolesTable.code,
      department: usersTable.department,
      status: usersTable.status,
      isPublic: usersTable.isPublic,
      profilePhotoPath: usersTable.profilePhotoPath,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(or(
      eq(usersTable.email, identifier.toLowerCase()),
      ...phoneCandidates.map((candidate) => eq(usersTable.phone, candidate)),
    ));

  if (!row || row.status !== "ACTIVE" || !verifyPassword(parsed.data.password, row.passwordHash)) {
    res.status(401).json({ error: "Invalid email or mobile number or password" });
    return;
  }

  setSessionCookie(res, row.id);
  res.json(LoginResponse.parse({ user: mapUser(row) }));
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json(GetCurrentUserResponse.parse(user));
});

router.post("/auth/logout", (_req, res): void => {
  clearSessionCookie(res);
  res.sendStatus(204);
});

router.get("/public/plans", async (_req, res): Promise<void> => {
  const plans = await db
    .select()
    .from(plansTable)
    .where(eq(plansTable.status, "ACTIVE"))
    .orderBy(asc(plansTable.price));
  res.json(ListPlansResponse.parse(plans));
});

router.use(requireAdmin);

router.patch("/auth/profile-photo", async (req, res): Promise<void> => {
  const parsed = UpdateProfilePhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const objectPath = parsed.data.objectPath;
  if (objectPath !== null && !objectPath.startsWith("/objects/uploads/")) {
    res.status(400).json({ error: "Invalid profile photo path" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ profilePhotoPath: objectPath })
    .where(eq(usersTable.id, req.adminUser!.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const users = await listUserViews();
  const user = users.find((item) => item.id === updated.id);
  res.json(GetCurrentUserResponse.parse(mapUser(user!)));
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [activePlans, teamMembers, pendingExpenses, monthlySpend] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(plansTable).where(eq(plansTable.status, "ACTIVE")),
    db.select({ count: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.status, "ACTIVE")),
    db.select({ count: sql<number>`count(*)` }).from(expensesTable).where(eq(expensesTable.status, "PENDING")),
    db.select({ total: sql<number>`coalesce(sum(${expensesTable.amount}), 0)` }).from(expensesTable).where(gte(expensesTable.date, new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))),
  ]);
  const plans = await db.select({ name: plansTable.name, value: plansTable.price }).from(plansTable).where(eq(plansTable.status, "ACTIVE"));
  const summary = {
    activePlans: Number(activePlans[0]?.count ?? 0),
    teamMembers: Number(teamMembers[0]?.count ?? 0),
    attendanceRate: 94.2,
    pendingExpenses: Number(pendingExpenses[0]?.count ?? 0),
    monthlySpend: Number(monthlySpend[0]?.total ?? 0),
    networkHealth: 99.4,
    planMix: plans.slice(0, 5).map((plan) => ({ label: plan.name, value: Number(plan.value) })),
    spendTrend: [
      { label: "W1", value: 18200 },
      { label: "W2", value: 24600 },
      { label: "W3", value: 19800 },
      { label: "W4", value: 31400 },
    ],
  };
  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const activity = await db.select().from(activityTable).orderBy(desc(activityTable.timestamp)).limit(8);
  res.json(GetDashboardActivityResponse.parse(activity));
});

router.get("/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(plansTable).orderBy(asc(plansTable.price));
  res.json(ListPlansResponse.parse(plans));
});

router.post("/plans", requirePermission("PLANS_WRITE"), async (req, res): Promise<void> => {
  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [plan] = await db.insert(plansTable).values({ ...parsed.data, status: "ACTIVE" }).returning();
  res.status(201).json(GetPlanResponse.parse(plan));
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  const params = GetPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, params.data.id));
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json(GetPlanResponse.parse(plan));
});

router.patch("/plans/:id", requirePermission("PLANS_WRITE"), async (req, res): Promise<void> => {
  const params = UpdatePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [plan] = await db.update(plansTable).set(parsed.data).where(eq(plansTable.id, params.data.id)).returning();
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json(GetPlanResponse.parse(plan));
});

router.delete("/plans/:id", requirePermission("PLANS_WRITE"), async (req, res): Promise<void> => {
  const params = ArchivePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [plan] = await db.update(plansTable).set({ status: "ARCHIVED" }).where(eq(plansTable.id, params.data.id)).returning();
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/users", async (_req, res): Promise<void> => {
  const users = await listUserViews();
  res.json(ListUsersResponse.parse(users.map(mapUser)));
});

router.post("/users", requirePermission("USERS_CREATE"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.code, parsed.data.role));
  if (!role) {
    res.status(400).json({ error: "Unknown role" });
    return;
  }
  const [user] = await db.insert(usersTable).values({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    phone: parsed.data.phone,
    passwordHash: hashPassword(parsed.data.password),
    roleId: role.id,
    department: parsed.data.department,
    status: "ACTIVE",
  }).returning();
  await db.insert(salaryStructuresTable).values({
    userId: user.id,
    basicSalary: role.code === "ADMIN" ? 45000 : role.code === "SUPERADMIN" ? 75000 : 25000,
    hra: role.code === "ADMIN" ? 18000 : role.code === "SUPERADMIN" ? 30000 : 10000,
    conveyanceAllowance: 2500,
    medicalAllowance: 1500,
    otherAllowance: 1000,
    pfRate: 12,
    esiRate: 0,
    professionalTax: 200,
    otherDeduction: 0,
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  res.status(201).json(GetCurrentUserResponse.parse({ ...user, role: role.code }));
});

router.patch("/users/:id", requirePermission("USERS_UPDATE"), async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const values: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.role) {
    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.code, parsed.data.role));
    if (!role) {
      res.status(400).json({ error: "Unknown role" });
      return;
    }
    values.roleId = role.id;
    delete values.role;
  }
  const [updated] = await db.update(usersTable).set(values).where(eq(usersTable.id, params.data.id)).returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const users = await listUserViews();
  const user = users.find((item) => item.id === updated.id);
  res.json(GetCurrentUserResponse.parse(mapUser(user!)));
});

router.patch("/users/:id/profile-photo", requirePermission("USERS_UPDATE"), async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProfilePhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const objectPath = parsed.data.objectPath;
  if (objectPath !== null && !objectPath.startsWith("/objects/uploads/")) {
    res.status(400).json({ error: "Invalid profile photo path" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ profilePhotoPath: objectPath })
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const users = await listUserViews();
  const user = users.find((item) => item.id === updated.id);
  res.json(GetCurrentUserResponse.parse(mapUser(user!)));
});

router.delete("/users/:id", requirePermission("USERS_DELETE"), async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (params.data.id === req.adminUser!.id) {
    res.status(400).json({ error: "You cannot delete your own account" });
    return;
  }
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [attendance, expense, payslip, payrollRun, activity] = await Promise.all([
    db.select({ id: attendanceTable.id }).from(attendanceTable).where(eq(attendanceTable.userId, params.data.id)).limit(1),
    db.select({ id: expensesTable.id }).from(expensesTable).where(eq(expensesTable.submittedById, params.data.id)).limit(1),
    db.select({ id: payslipsTable.id }).from(payslipsTable).where(eq(payslipsTable.userId, params.data.id)).limit(1),
    db.select({ id: payrollRunsTable.id }).from(payrollRunsTable).where(eq(payrollRunsTable.generatedById, params.data.id)).limit(1),
    db.select({ id: activityTable.id }).from(activityTable).where(eq(activityTable.actorId, params.data.id)).limit(1),
  ]);
  if (attendance.length || expense.length || payslip.length || payrollRun.length || activity.length) {
    res.status(409).json({ error: "This team member has historical records and cannot be permanently deleted. Suspend the account instead." });
    return;
  }
  const [deleted] = await db.transaction(async (transaction) => {
    await transaction.delete(salaryStructuresTable).where(eq(salaryStructuresTable.userId, params.data.id));
    return transaction.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning({ id: usersTable.id });
  });
  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/roles/permissions", requireRole("SUPERADMIN"), async (_req, res): Promise<void> => {
  res.json(ListRolePermissionsResponse.parse(await listRolePermissionViews()));
});

router.patch("/roles/:id/permissions", requireRole("SUPERADMIN"), async (req, res): Promise<void> => {
  const params = UpdateRolePermissionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRolePermissionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, params.data.id));
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  const permissions = await db.select({ id: permissionsTable.id }).from(permissionsTable);
  const permissionIds = new Set(permissions.map((permission) => permission.id));
  if (parsed.data.permissionIds.some((permissionId) => !permissionIds.has(permissionId))) {
    res.status(400).json({ error: "One or more permissions do not exist" });
    return;
  }

  await db.transaction(async (transaction) => {
    await transaction.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, role.id));
    if (parsed.data.permissionIds.length > 0) {
      await transaction.insert(rolePermissionsTable).values(
        parsed.data.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      );
    }
  });

  const updatedRole = (await listRolePermissionViews()).find((item) => item.id === role.id);
  res.json(UpdateRolePermissionsResponse.parse(updatedRole));
});

router.get("/attendance/me", async (req, res): Promise<void> => {
  const rows = await listAttendanceViews(req.adminUser!.id);
  res.json(GetMyAttendanceResponse.parse(rows.map(mapAttendance)));
});

router.post("/attendance/punch", async (req, res): Promise<void> => {
  const parsed = PunchAttendanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const [existing] = await db.select().from(attendanceTable).where(and(eq(attendanceTable.userId, req.adminUser!.id), eq(attendanceTable.date, today)));
  const now = new Date();
  if (parsed.data.action === "IN") {
    if (existing?.inTime) {
      const rows = await listAttendanceViews(req.adminUser!.id);
      res.json(PunchAttendanceResponse.parse(mapAttendance(rows[0])));
      return;
    }
    const status = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 30) ? "LATE" : "PRESENT";
    const [record] = existing
      ? await db.update(attendanceTable).set({
        inTime: now,
        inLatitude: parsed.data.latitude,
        inLongitude: parsed.data.longitude,
        inAccuracyMeters: parsed.data.accuracyMeters,
        status,
      }).where(eq(attendanceTable.id, existing.id)).returning()
      : await db.insert(attendanceTable).values({
        userId: req.adminUser!.id,
        date: today,
        inTime: now,
        inLatitude: parsed.data.latitude,
        inLongitude: parsed.data.longitude,
        inAccuracyMeters: parsed.data.accuracyMeters,
        status,
      }).returning();
    const rows = await listAttendanceViews(req.adminUser!.id);
    res.json(PunchAttendanceResponse.parse(mapAttendance(rows.find((row) => row.id === record.id)!)));
    return;
  }
  if (!existing?.inTime) {
    res.status(400).json({ error: "Punch in before punching out" });
    return;
  }
  const durationMinutes = Math.max(0, Math.round((now.getTime() - existing.inTime.getTime()) / 60000));
  const [record] = await db.update(attendanceTable).set({
    outTime: now,
    outLatitude: parsed.data.latitude,
    outLongitude: parsed.data.longitude,
    outAccuracyMeters: parsed.data.accuracyMeters,
    durationMinutes,
  }).where(eq(attendanceTable.id, existing.id)).returning();
  const rows = await listAttendanceViews(req.adminUser!.id);
  res.json(PunchAttendanceResponse.parse(mapAttendance(rows.find((row) => row.id === record.id)!)));
});

router.get("/attendance", requireRole("ADMIN", "SUPERADMIN"), async (_req, res): Promise<void> => {
  const rows = await listAttendanceViews();
  res.json(ListAttendanceResponse.parse(rows.map(mapAttendance)));
});

router.get("/attendance/export.xlsx", requirePermission("ATTENDANCE_EXPORT"), async (req, res): Promise<void> => {
  try {
    const filters = parseReportFilters(req.query as Record<string, unknown>, attendanceStatuses);
    const rows = filterAttendanceRows((await listAttendanceViews()).map(mapAttendance), filters);
    await recordReportDownload(req, "Attendance", "XLSX", filters);
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="hydranet-attendance-${new Date().toISOString().slice(0, 10)}.xls"`);
    res.send(buildAttendanceWorkbook(rows, filters));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid report filters" });
  }
});

router.get("/attendance/export.pdf", requirePermission("ATTENDANCE_EXPORT"), async (req, res): Promise<void> => {
  try {
    const filters = parseReportFilters(req.query as Record<string, unknown>, attendanceStatuses);
    const rows = filterAttendanceRows((await listAttendanceViews()).map(mapAttendance), filters);
    await recordReportDownload(req, "Attendance", "PDF", filters);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="hydranet-attendance-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(buildAttendancePdf(rows, filters));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid report filters" });
  }
});

router.get("/attendance/monthly", requirePermission("ATTENDANCE_EXPORT"), async (req, res): Promise<void> => {
  const parsed = ListMonthlyAttendanceQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const reports = await listMonthlyAttendanceViews(parsed.data.month, parsed.data.userId);
    res.json(ListMonthlyAttendanceResponse.parse(reports));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid attendance month" });
  }
});

router.get("/attendance/monthly.pdf", requirePermission("ATTENDANCE_EXPORT"), async (req, res): Promise<void> => {
  const parsed = ExportMonthlyAttendancePdfQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const reports = await listMonthlyAttendanceViews(parsed.data.month, parsed.data.userId);
    await recordReportDownload(req, "Attendance", "PDF", {
      from: `${parsed.data.month}-01`,
      to: `${parsed.data.month}-${String(payrollMonthInfo(parsed.data.month).daysInMonth).padStart(2, "0")}`,
      search: parsed.data.userId ? `employee:${parsed.data.userId}` : undefined,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="hydranet-attendance-${parsed.data.month}.pdf"`);
    res.send(buildMonthlyAttendancePdf(reports, parsed.data.month));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid attendance month" });
  }
});

router.get("/hr/salary-structures", requirePermission("PAYROLL_WRITE"), async (_req, res): Promise<void> => {
  res.json(ListSalaryStructuresResponse.parse(await listSalaryStructureViews()));
});

router.put("/hr/salary-structures/:userId", requirePermission("PAYROLL_WRITE"), async (req, res): Promise<void> => {
  const params = UpdateSalaryStructureParams.safeParse(req.params);
  const parsed = UpdateSalaryStructureBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [employee] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, params.data.userId));
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const [structure] = await db.insert(salaryStructuresTable).values({
    userId: params.data.userId,
    ...parsed.data,
    effectiveFrom: parsed.data.effectiveFrom.toISOString().slice(0, 10),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: salaryStructuresTable.userId,
    set: {
      ...parsed.data,
      effectiveFrom: parsed.data.effectiveFrom.toISOString().slice(0, 10),
      updatedAt: new Date(),
    },
  }).returning();
  const view = (await listSalaryStructureViews()).find((item) => item.userId === params.data.userId);
  res.json(UpdateSalaryStructureResponse.parse(view ?? structure));
});

router.get("/hr/payroll", requirePermission("PAYROLL_WRITE"), async (req, res): Promise<void> => {
  const parsed = GetPayrollQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(GetPayrollResponse.parse(await getPayrollSummary(parsed.data.month)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid payroll month" });
  }
});

router.post("/hr/payroll/run", requirePermission("PAYROLL_WRITE"), async (req, res): Promise<void> => {
  const parsed = GeneratePayrollBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const summary = await generatePayroll(parsed.data.month, req.adminUser!.id);
    await db.insert(activityTable).values({
      actorId: req.adminUser!.id,
      actor: req.adminUser!.name,
      action: "generated",
      target: `Payroll run (${parsed.data.month})`,
    });
    res.json(GeneratePayrollResponse.parse(summary));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Payroll could not be generated" });
  }
});

router.get("/hr/payslips/:id.pdf", requirePermission("PAYROLL_WRITE"), async (req, res): Promise<void> => {
  const parsed = ExportPayslipPdfParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.select().from(payslipsTable).where(eq(payslipsTable.id, parsed.data.id));
  if (!row) {
    res.status(404).json({ error: "Payslip not found" });
    return;
  }
  const payslip = (await listPayslipViews(row.payrollRunId)).find((item) => item.id === row.id);
  if (!payslip) {
    res.status(404).json({ error: "Payslip not found" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="hydranet-payslip-${payslip.month}-${payslip.userId}.pdf"`);
  res.send(buildPayslipPdf(payslip));
});

router.get("/expenses", async (req, res): Promise<void> => {
  const rows = await listExpenseViews();
  const visible = req.adminUser!.role === "STAFF" ? rows.filter((row) => row.submittedBy === req.adminUser!.name) : rows;
  res.json(ListExpensesResponse.parse(visible));
});

router.get("/expenses/export.pdf", async (req, res): Promise<void> => {
  try {
    const filters = parseReportFilters(req.query as Record<string, unknown>, expenseStatuses);
    const rows = await listExpenseViews();
    const visible = req.adminUser!.role === "STAFF" ? rows.filter((row) => row.submittedBy === req.adminUser!.name) : rows;
    const filtered = filterExpenseRows(visible, filters);
    await recordReportDownload(req, "Expense", "PDF", filters);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="hydranet-expenses-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(buildExpensePdf(filtered, filters));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid report filters" });
  }
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [expense] = await db.insert(expensesTable).values({
    ...parsed.data,
    date: parsed.data.date.toISOString().slice(0, 10),
    voucherId: `EXP-${Date.now().toString().slice(-7)}`,
    submittedById: req.adminUser!.id,
    status: "PENDING",
    notes: parsed.data.notes ?? null,
  }).returning();
  const rows = await listExpenseViews();
  res.status(201).json(CreateExpenseResponse.parse(rows.find((row) => row.id === expense.id)));
});

router.post("/expenses/:id/decision", requirePermission("EXPENSE_APPROVE"), async (req, res): Promise<void> => {
  const params = DecideExpenseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = DecideExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [expense] = await db.update(expensesTable).set({
    status: parsed.data.decision,
    approvedById: req.adminUser!.id,
    notes: parsed.data.comment ?? null,
  }).where(eq(expensesTable.id, params.data.id)).returning();
  if (!expense) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  const rows = await listExpenseViews();
  res.json(DecideExpenseResponse.parse(rows.find((row) => row.id === expense.id)));
});

export default router;