import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, permissionsTable, rolePermissionsTable, rolesTable, usersTable } from "@workspace/db";

const SESSION_COOKIE = "hydranet_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const sessionSecret = process.env.SESSION_SECRET ?? "development-session-secret";

export type AdminRole = "SUPERADMIN" | "ADMIN" | "STAFF";
export type AdminUser = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: AdminRole;
  department: string;
  status: "ACTIVE" | "SUSPENDED";
  isPublic: boolean;
  profilePhotoPath: string | null;
  createdAt: Date;
};

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminUser;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [salt, expected] = encoded.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

function signSession(userId: number, expiresAt: number): string {
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function parseSession(value?: string): { userId: number; expiresAt: number } | null {
  if (!value) return null;
  const [rawUserId, rawExpiresAt, signature] = value.split(".");
  const userId = Number(rawUserId);
  const expiresAt = Number(rawExpiresAt);
  if (!Number.isInteger(userId) || !Number.isFinite(expiresAt) || !signature || expiresAt < Date.now()) return null;
  const payload = `${userId}.${expiresAt}`;
  const expected = createHmac("sha256", sessionSecret).update(payload).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return { userId, expiresAt };
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const entry = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

export function setSessionCookie(response: Response, userId: number): void {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const token = signSession(userId, expiresAt);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
}

export function clearSessionCookie(response: Response): void {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
  );
}

export async function getUserFromRequest(request: Request): Promise<AdminUser | null> {
  const session = parseSession(readCookie(request, SESSION_COOKIE));
  if (!session) return null;

  const [row] = await db
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
    .where(and(eq(usersTable.id, session.userId), eq(usersTable.status, "ACTIVE")));

  if (!row) return null;
  return {
    ...row,
    role: row.role as AdminRole,
    status: row.status as "ACTIVE" | "SUSPENDED",
    isPublic: row.isPublic,
  };
}

export async function requireAdmin(request: Request, response: Response, next: NextFunction): Promise<void> {
  const user = await getUserFromRequest(request);
  if (!user) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  request.adminUser = user;
  next();
}

export function requireRole(...roles: AdminRole[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.adminUser || !roles.includes(request.adminUser.role)) {
      response.status(403).json({ error: "You do not have permission for this action" });
      return;
    }
    next();
  };
}

export function requirePermission(permissionCode: string) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    if (!request.adminUser) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (request.adminUser.role === "SUPERADMIN") {
      next();
      return;
    }
    const [permission] = await db
      .select({ id: permissionsTable.id })
      .from(rolePermissionsTable)
      .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
      .innerJoin(rolesTable, eq(rolePermissionsTable.roleId, rolesTable.id))
      .innerJoin(usersTable, eq(usersTable.roleId, rolesTable.id))
      .where(and(eq(usersTable.id, request.adminUser.id), eq(permissionsTable.code, permissionCode)));
    if (!permission) {
      response.status(403).json({ error: "Your role does not have this permission" });
      return;
    }
    next();
  };
}