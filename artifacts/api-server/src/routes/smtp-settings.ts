import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, smtpSettingsTable } from "@workspace/db";
import { TestSmtpSettingsBody, UpdateSmtpSettingsBody } from "@workspace/api-zod";
import { requireAdmin, requireRole } from "../lib/admin-auth";
import { encryptSmtpPassword } from "../lib/smtp-crypto";
import { mapSmtpSettings, sendSmtpTestEmail } from "../lib/partner-welcome-email";

const router: IRouter = Router();
router.use(requireAdmin, requireRole("SUPERADMIN"));

router.get("/smtp-settings", async (_request, response) => {
  const [settings] = await db.select().from(smtpSettingsTable).where(eq(smtpSettingsTable.id, 1));
  response.json(mapSmtpSettings(settings));
});

router.put("/smtp-settings", async (request, response) => {
  const parsed = UpdateSmtpSettingsBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter valid SMTP host, port, sender details, and optional credentials." });
    return;
  }
  const input = parsed.data;
  const [existing] = await db.select().from(smtpSettingsTable).where(eq(smtpSettingsTable.id, 1));
  const passwordEncrypted = input.password
    ? encryptSmtpPassword(input.password)
    : existing?.passwordEncrypted ?? null;
  const values = {
    host: input.host.trim(),
    port: input.port,
    secure: input.secure,
    username: input.username?.trim() || null,
    passwordEncrypted,
    fromEmail: input.fromEmail.trim().toLowerCase(),
    fromName: input.fromName.trim(),
    replyTo: input.replyTo?.trim().toLowerCase() || null,
    updatedById: request.adminUser!.id,
    updatedAt: new Date(),
  };
  const [saved] = existing
    ? await db.update(smtpSettingsTable).set(values).where(eq(smtpSettingsTable.id, 1)).returning()
    : await db.insert(smtpSettingsTable).values({ id: 1, ...values }).returning();
  response.json(mapSmtpSettings(saved));
});

router.post("/smtp-settings/test", async (request, response) => {
  const parsed = TestSmtpSettingsBody.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid test recipient email address." });
    return;
  }
  try {
    await sendSmtpTestEmail(parsed.data.recipient?.trim() || request.adminUser!.email);
    response.json({ sent: true, message: `Test email sent to ${parsed.data.recipient?.trim() || request.adminUser!.email}.` });
  } catch (error) {
    request.log?.error(error, "Failed to send SMTP test email");
    response.status(400).json({ error: error instanceof Error ? error.message : "The SMTP test email could not be sent." });
  }
});

export default router;