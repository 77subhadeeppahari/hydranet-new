import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { db, partnerAgreementsTable } from "@workspace/db";
import {
  ApprovePartnerAgreementParams,
  AttachPartnerSignedAgreementBody,
  CreatePartnerAgreementBody,
  GetPartnerAgreementParams,
  UpdatePartnerPortalDetailsBody,
} from "@workspace/api-zod";
import { requireAdmin, requireRole } from "../lib/admin-auth";
import { decryptPartnerPortalPassword, encryptPartnerPortalPassword, hasPartnerPortalPassword } from "../lib/partner-portal-crypto";
import { sendPartnerWelcomeEmail } from "../lib/partner-welcome-email";
import { readFile } from "node:fs/promises";
import path from "node:path";

const router: IRouter = Router();
const agreementRouter = Router();
agreementRouter.use(requireAdmin);
const managePartnerAgreements = requireRole("SUPERADMIN", "ADMIN");

type AgreementDetails = Record<string, unknown>;
type AgreementDocument = {
  type: string;
  name: string;
  objectPath: string;
  size: number;
  contentType: string;
};

function readDetails(value: string): AgreementDetails {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as AgreementDetails : {};
  } catch {
    return {};
  }
}

function readDocuments(value: string): AgreementDocument[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as AgreementDocument[] : [];
  } catch {
    return [];
  }
}

function mapAgreement(row: typeof partnerAgreementsTable.$inferSelect) {
  return {
    id: row.id,
    partnerCode: row.partnerCode,
    partnerName: row.partnerName,
    entityType: row.entityType,
    businessAddress: row.businessAddress,
    mobileNumber: row.mobileNumber,
    email: row.email,
    agreementDate: row.agreementDate,
    status: row.status,
    formData: readDetails(row.formData),
    documents: readDocuments(row.documents),
    approvedAt: row.approvedAt,
    portalDetails: {
      url: row.portalUrl,
      username: row.portalUsername,
      hasPassword: hasPartnerPortalPassword(row.portalPasswordEncrypted),
    },
    createdAt: row.createdAt,
  };
}

function text(value: unknown, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function numberText(value: unknown) {
  return value === undefined || value === null || value === "" ? "" : String(value);
}

function drawField(page: PDFPage, font: PDFFont, value: unknown, x: number, top: number, maxWidth = 150, size = 8) {
  const raw = text(value);
  if (!raw) return;
  let fontSize = size;
  while (font.widthOfTextAtSize(raw, fontSize) > maxWidth && fontSize > 5.5) fontSize -= 0.25;
  page.drawText(raw, {
    x,
    y: page.getHeight() - top - fontSize,
    size: fontSize,
    font,
    color: rgb(0.08, 0.08, 0.08),
  });
}

function coverField(page: PDFPage, x: number, top: number, width: number, height = 15) {
  page.drawRectangle({
    x,
    y: page.getHeight() - top - height,
    width,
    height,
    color: rgb(1, 1, 1),
  });
}

async function templateBytes() {
  const candidates = [
    path.resolve(process.cwd(), "src/assets/franchise-agreement-template.pdf"),
    path.resolve(process.cwd(), "dist/assets/franchise-agreement-template.pdf"),
    path.resolve(process.cwd(), "artifacts/api-server/src/assets/franchise-agreement-template.pdf"),
    path.resolve(process.cwd(), "artifacts/api-server/dist/assets/franchise-agreement-template.pdf"),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      // Try the next build/runtime location.
    }
  }
  throw new Error("The franchise agreement template is not available");
}

async function buildAgreementPdf(row: typeof partnerAgreementsTable.$inferSelect) {
  const details = readDetails(row.formData);
  const pdf = await PDFDocument.load(await templateBytes());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const date = new Date(`${row.agreementDate}T00:00:00Z`);
  const day = date.getUTCDate();
  const month = date.toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
  const year = date.getUTCFullYear();

  const page1 = pages[0];
  drawField(page1, font, day, 345, 471, 28);
  drawField(page1, font, month, 417, 471, 95);
  drawField(page1, font, String(year).slice(-2), 78, 489, 28);
  drawField(page1, font, details.franchisorPan, 143, 599, 105);
  drawField(page1, font, row.partnerName, 64, 655, 210);
  coverField(page1, 304, 653, 230);
  drawField(page1, font, row.entityType, 307, 655, 220);
  drawField(page1, font, row.businessAddress, 251, 673, 225, 7);
  drawField(page1, font, details.franchiseePan, 145, 737, 115);

  const page2 = pages[1];
  drawField(page2, font, details.authorizedSignatoryAadhaar, 289, 73, 195, 7);
  drawField(page2, font, details.approvedLocation, 294, 217, 220, 7);
  drawField(page2, font, numberText(details.termYears), 310, 280, 38);

  const page3 = pages[2];
  drawField(page3, font, numberText(details.terminationNoticeDays), 444, 154, 40);

  const page4 = pages[3];
  drawField(page4, font, row.agreementDate, 382, 178, 108);
  drawField(page4, font, row.partnerName, 362, 195, 110, 7);
  drawField(page4, font, numberText(details.initialFranchiseFee), 64, 276, 108);
  drawField(page4, font, numberText(details.franchiseeSharePercent), 180, 385, 38);
  drawField(page4, font, numberText(details.marketingContributionPercent), 270, 563, 38);
  drawField(page4, font, numberText(details.softwareTechnologyFee), 234, 581, 110);

  const page6 = pages[5];
  drawField(page6, font, row.partnerName, 234, 289, 285, 7);
  drawField(page6, font, row.businessAddress, 234, 320, 285, 7);
  drawField(page6, font, details.subFranchiseName, 234, 391, 285, 7);
  drawField(page6, font, details.subFranchiseAddress, 234, 421, 285, 7);
  drawField(page6, font, details.subFranchisePan, 234, 452, 130);
  drawField(page6, font, details.subFranchiseAadhaar, 234, 482, 180);
  coverField(page6, 175, 550, 142);
  drawField(page6, font, details.subFranchiseAuthorized === true ? "Authorized" : "Not Authorized", 180, 552, 130, 7);
  drawField(page6, font, numberText(details.subFranchiseOnboardingFee), 315, 650, 110);
  drawField(page6, font, numberText(details.masterFranchiseeSharePercent), 238, 721, 35);
  drawField(page6, font, numberText(details.subFranchiseeSharePercent), 226, 738, 35);

  const page8 = pages[7];
  drawField(page8, font, details.bankAccountName, 228, 311, 295, 7);
  drawField(page8, font, details.bankName, 228, 341, 295, 7);
  drawField(page8, font, details.bankAccountNumber, 228, 371, 295, 7);
  drawField(page8, font, details.bankIfsc, 228, 402, 150);
  drawField(page8, font, details.bankBranchAddress, 228, 432, 295, 7);

  const page9 = pages[8];
  drawField(page9, font, numberText(details.equipmentReturnDays), 340, 409, 40);
  const equipment = Array.isArray(details.equipment) ? details.equipment as Array<Record<string, unknown>> : [];
  equipment.slice(0, 5).forEach((item, index) => {
    const top = 573 + index * 30.4;
    drawField(page9, font, item.name, 110, top, 120, 7);
    drawField(page9, font, item.makeModel, 235, top, 145, 7);
    drawField(page9, font, item.serialNumber, 405, top, 100, 7);
  });

  return Buffer.from(await pdf.save());
}

agreementRouter.get("/partner-agreements", async (_request, response) => {
  const rows = await db.select().from(partnerAgreementsTable).orderBy(desc(partnerAgreementsTable.createdAt));
  response.json(rows.map(mapAgreement));
});

agreementRouter.post("/partner-agreements", managePartnerAgreements, async (request, response) => {
  const parsed = CreatePartnerAgreementBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Please complete the required partner details" });
    return;
  }
  const input = parsed.data;
  const row = await db.transaction(async (tx) => {
    // Serialize partner-code allocation across concurrent API requests. The
    // lock is released automatically when this transaction commits or rolls
    // back, so the existing max-plus-one numbering remains gap-free.
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtext('admin_partner_agreements.partner_code'))
    `);
    const [sequence] = await tx
      .select({
        next: sql<number>`coalesce(max(cast(substring(${partnerAgreementsTable.partnerCode} from 5) as integer)), -1) + 1`,
      })
      .from(partnerAgreementsTable);
    const serial = Number(sequence?.next ?? 0);
    if (serial > 999) throw new Error("Partner code sequence is full");
    const partnerCode = `HB11${String(serial).padStart(3, "0")}`;
    const [created] = await tx.insert(partnerAgreementsTable).values({
      partnerCode,
      partnerName: input.partnerName.trim(),
      entityType: input.entityType,
      businessAddress: input.businessAddress.trim(),
      mobileNumber: input.mobileNumber.trim(),
      email: input.email?.trim() || null,
      agreementDate: input.agreementDate.toISOString().slice(0, 10),
      status: "DRAFT",
      formData: JSON.stringify(input.formData ?? {}),
      documents: JSON.stringify(input.documents ?? []),
      createdById: request.adminUser!.id,
    }).returning();
    return created;
  });
  response.status(201).json(mapAgreement(row));
});

agreementRouter.get("/partner-agreements/:id", async (request, response) => {
  const parsed = GetPartnerAgreementParams.safeParse(request.params);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid partner registration id" });
    return;
  }
  const [row] = await db.select().from(partnerAgreementsTable).where(eq(partnerAgreementsTable.id, parsed.data.id));
  if (!row) {
    response.status(404).json({ error: "Partner registration not found" });
    return;
  }
  response.json(mapAgreement(row));
});

agreementRouter.get("/partner-agreements/:id/pdf", async (request, response) => {
  const parsed = GetPartnerAgreementParams.safeParse(request.params);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid partner registration id" });
    return;
  }
  const [row] = await db.select().from(partnerAgreementsTable).where(eq(partnerAgreementsTable.id, parsed.data.id));
  if (!row) {
    response.status(404).json({ error: "Partner registration not found" });
    return;
  }
  try {
    const pdf = await buildAgreementPdf(row);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="hydranet-franchise-agreement-${row.id}.pdf"`);
    response.send(pdf);
  } catch (error) {
    request.log?.error(error, "Failed to build partner agreement PDF");
    response.status(500).json({ error: "Could not generate the agreement PDF" });
  }
});

agreementRouter.post("/partner-agreements/:id/signed-agreement", managePartnerAgreements, async (request, response) => {
  const params = GetPartnerAgreementParams.safeParse(request.params);
  const body = AttachPartnerSignedAgreementBody.safeParse(request.body);
  if (!params.success || !body.success) {
    response.status(400).json({ error: "Invalid signed agreement document" });
    return;
  }
  const [existing] = await db.select().from(partnerAgreementsTable).where(eq(partnerAgreementsTable.id, params.data.id));
  if (!existing) {
    response.status(404).json({ error: "Partner registration not found" });
    return;
  }
  if (existing.status === "APPROVED") {
    response.status(409).json({ error: "The signed agreement cannot be replaced after approval" });
    return;
  }
  const documents = readDocuments(existing.documents).filter((document) => document.type !== "signed_agreement");
  documents.push({ type: "signed_agreement", ...body.data });
  const [updated] = await db
    .update(partnerAgreementsTable)
    .set({ documents: JSON.stringify(documents), status: "SIGNED_UPLOADED", updatedAt: new Date() })
    .where(eq(partnerAgreementsTable.id, existing.id))
    .returning();
  response.json(mapAgreement(updated));
});

agreementRouter.post("/partner-agreements/:id/approve", managePartnerAgreements, async (request, response) => {
  const params = ApprovePartnerAgreementParams.safeParse(request.params);
  if (!params.success) {
    response.status(400).json({ error: "Invalid partner registration id" });
    return;
  }
  const [existing] = await db.select().from(partnerAgreementsTable).where(eq(partnerAgreementsTable.id, params.data.id));
  if (!existing) {
    response.status(404).json({ error: "Partner registration not found" });
    return;
  }
  if (!readDocuments(existing.documents).some((document) => document.type === "signed_agreement")) {
    response.status(400).json({ error: "Upload the signed agreement before approval" });
    return;
  }
  if (existing.status === "APPROVED") {
    response.json(mapAgreement(existing));
    return;
  }
  if (existing.status !== "SIGNED_UPLOADED") {
    response.status(409).json({ error: "The partner agreement is not ready for approval" });
    return;
  }
  const [updated] = await db
    .update(partnerAgreementsTable)
    .set({ status: "APPROVED", approvedById: request.adminUser!.id, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(partnerAgreementsTable.id, existing.id))
    .returning();
  response.json(mapAgreement(updated));
});

agreementRouter.patch("/partner-agreements/:id/portal-details", managePartnerAgreements, async (request, response) => {
  const params = GetPartnerAgreementParams.safeParse(request.params);
  const body = UpdatePartnerPortalDetailsBody.safeParse(request.body);
  if (!params.success || !body.success) {
    response.status(400).json({ error: "Enter a valid portal URL, username, and password" });
    return;
  }
  const [existing] = await db.select().from(partnerAgreementsTable).where(eq(partnerAgreementsTable.id, params.data.id));
  if (!existing) {
    response.status(404).json({ error: "Partner registration not found" });
    return;
  }
  if (existing.status !== "APPROVED") {
    response.status(409).json({ error: "Portal details are available only after approval" });
    return;
  }
  if (!existing.email) {
    response.status(400).json({ error: "Add the partner email address before sending portal access." });
    return;
  }
  if (!body.data.password && !existing.portalPasswordEncrypted) {
    response.status(400).json({ error: "Enter the portal password" });
    return;
  }
  const portalPassword = body.data.password ?? decryptPartnerPortalPassword(existing.portalPasswordEncrypted!);
  const [updated] = await db
    .update(partnerAgreementsTable)
    .set({
      portalUrl: body.data.url.trim(),
      portalUsername: body.data.username.trim(),
      ...(body.data.password ? { portalPasswordEncrypted: encryptPartnerPortalPassword(body.data.password) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(partnerAgreementsTable.id, existing.id))
    .returning();
  const signedAgreement = readDocuments(updated.documents).find((document) => document.type === "signed_agreement");
  if (!signedAgreement) {
    response.status(500).json({ error: "The signed agreement attachment is missing." });
    return;
  }
  try {
    await sendPartnerWelcomeEmail({ agreement: updated, portalPassword, signedAgreement });
  } catch (error) {
    request.log?.error(error, "Failed to send partner welcome email");
    response.status(502).json({ error: error instanceof Error ? error.message : "Portal details were saved, but the welcome email could not be sent." });
    return;
  }
  response.json(mapAgreement(updated));
});

export default agreementRouter;