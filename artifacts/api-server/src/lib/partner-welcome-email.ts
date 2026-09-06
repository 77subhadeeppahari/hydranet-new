import nodemailer from "nodemailer";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { type PartnerAgreement, db, smtpSettingsTable, type SmtpSettings } from "@workspace/db";
import { ObjectStorageService } from "./object-storage";
import { decryptSmtpPassword } from "./smtp-crypto";

type AgreementDocument = {
  type: string;
  name: string;
  objectPath: string;
  size: number;
  contentType: string;
};

type WelcomeEmailInput = {
  agreement: PartnerAgreement;
  portalPassword: string;
  signedAgreement: AgreementDocument;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function logoBytes() {
  const candidates = [
    path.resolve(process.cwd(), "src/assets/hydranet-logo.png"),
    path.resolve(process.cwd(), "dist/assets/hydranet-logo.png"),
    path.resolve(process.cwd(), "artifacts/api-server/src/assets/hydranet-logo.png"),
    path.resolve(process.cwd(), "artifacts/api-server/dist/assets/hydranet-logo.png"),
    path.resolve(process.cwd(), "artifacts/hydranet-admin/public/assets/hydranet-logo.png"),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      // Try the next runtime location.
    }
  }
  throw new Error("The Hydranet email logo is not available");
}

export type SmtpTransportSettings = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
};

export async function getSavedSmtpSettings(): Promise<SmtpTransportSettings | null> {
  const [settings] = await db.select().from(smtpSettingsTable).where(eq(smtpSettingsTable.id, 1));
  if (!settings) return null;
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    username: settings.username,
    password: settings.passwordEncrypted ? decryptSmtpPassword(settings.passwordEncrypted) : null,
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    replyTo: settings.replyTo,
  };
}

export function createTransport(settings: SmtpTransportSettings) {
  if (!settings.host || !settings.fromEmail) throw new Error("SMTP settings are incomplete.");
  if (!Number.isInteger(settings.port) || settings.port <= 0) {
    throw new Error("SMTP port must be a positive integer.");
  }
  if (Boolean(settings.username) !== Boolean(settings.password)) {
    throw new Error("SMTP username and password must be provided together.");
  }
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    ...(settings.username && settings.password ? { auth: { user: settings.username, pass: settings.password } } : {}),
  });
}

export async function sendPartnerWelcomeEmail({ agreement, portalPassword, signedAgreement }: WelcomeEmailInput) {
  if (!agreement.email) {
    throw new Error("Add the partner email address before sending portal access.");
  }
  const smtpSettings = await getSavedSmtpSettings();
  if (!smtpSettings) {
    if (process.env.NODE_ENV === "test") return;
    throw new Error("Welcome email is not configured. Ask a Superadmin to save SMTP settings first.");
  }

  const storage = new ObjectStorageService();
  const signedAgreementFile = await storage.getFile(signedAgreement.objectPath);
  const [signedAgreementBuffer, logoBuffer] = await Promise.all([
    signedAgreementFile.download().then(([buffer]) => buffer),
    logoBytes(),
  ]);
  const partnerName = escapeHtml(agreement.partnerName);
  const partnerCode = escapeHtml(agreement.partnerCode);
  const portalUrl = escapeHtml(agreement.portalUrl ?? "");
  const username = escapeHtml(agreement.portalUsername ?? "");
  const password = escapeHtml(portalPassword);
  const subject = `Welcome to Hydranet Broadband — Partner Portal ${agreement.partnerCode}`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#07111f;color:#14213d;font-family:Arial,Helvetica,sans-serif;">
    <div style="padding:34px 16px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.22);">
        <div style="padding:30px 34px;background:linear-gradient(135deg,#07111f 0%,#123f62 100%);">
          <img src="cid:hydranet-logo" alt="Hydranet Broadband" style="display:block;width:210px;max-width:80%;height:auto;">
          <div style="margin-top:26px;color:#8fd8ff;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Partner network access</div>
          <h1 style="margin:10px 0 0;color:#ffffff;font-size:30px;line-height:1.15;">Welcome to Hydranet.</h1>
        </div>
        <div style="padding:34px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Hello ${partnerName},</p>
          <p style="margin:0 0 24px;color:#53627a;font-size:15px;line-height:1.7;">Your Hydranet Broadband partner registration has been approved. We are delighted to welcome you to our growing network.</p>
          <div style="padding:22px;border:1px solid #dce8f2;border-radius:18px;background:#f5faff;">
            <div style="color:#58718a;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Your partner portal</div>
            <a href="${portalUrl}" style="display:block;margin-top:8px;color:#087bc1;font-size:18px;font-weight:700;text-decoration:none;">${portalUrl}</a>
            <table role="presentation" style="width:100%;margin-top:18px;border-collapse:collapse;">
              <tr><td style="padding:9px 0;color:#65768b;font-size:13px;">Username</td><td style="padding:9px 0;text-align:right;color:#14213d;font-size:14px;font-weight:700;">${username}</td></tr>
              <tr><td style="padding:9px 0;color:#65768b;font-size:13px;border-top:1px solid #dce8f2;">Password</td><td style="padding:9px 0;text-align:right;color:#14213d;font-size:14px;font-weight:700;border-top:1px solid #dce8f2;">${password}</td></tr>
              <tr><td style="padding:9px 0;color:#65768b;font-size:13px;border-top:1px solid #dce8f2;">Partner code</td><td style="padding:9px 0;text-align:right;color:#14213d;font-size:14px;font-weight:700;border-top:1px solid #dce8f2;">${partnerCode}</td></tr>
            </table>
          </div>
          <p style="margin:24px 0 0;color:#53627a;font-size:14px;line-height:1.7;">Your signed franchise agreement is attached to this email for your records. Please keep these login details private and contact our team if you need assistance.</p>
          <div style="margin-top:28px;text-align:center;">
            <a href="${portalUrl}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:#0b83c9;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Open Partner Portal</a>
          </div>
        </div>
        <div style="padding:20px 34px;background:#f5f7fa;border-top:1px solid #e6edf3;color:#718096;font-size:12px;line-height:1.6;">
          <strong style="color:#14213d;">Hydranet Broadband</strong><br>
          Reliable connectivity. Stronger partnerships.<br>
          This is an automated welcome email. Please do not reply with your password.
        </div>
      </div>
    </div>
  </body>
</html>`;

  const transport = createTransport(smtpSettings);
  await transport.sendMail({
    from: `${smtpSettings.fromName} <${smtpSettings.fromEmail}>`,
    to: agreement.email,
    ...(smtpSettings.replyTo ? { replyTo: smtpSettings.replyTo } : {}),
    subject,
    html,
    attachments: [
      { filename: signedAgreement.name, content: signedAgreementBuffer, contentType: signedAgreement.contentType },
      { filename: "hydranet-logo.png", content: logoBuffer, cid: "hydranet-logo", contentType: "image/png" },
    ],
  });
}

export async function sendSmtpTestEmail(recipient: string) {
  const smtpSettings = await getSavedSmtpSettings();
  if (!smtpSettings) throw new Error("Save the SMTP settings before sending a test email.");
  const logoBuffer = await logoBytes();
  const transport = createTransport(smtpSettings);
  await transport.sendMail({
    from: `${smtpSettings.fromName} <${smtpSettings.fromEmail}>`,
    to: recipient,
    ...(smtpSettings.replyTo ? { replyTo: smtpSettings.replyTo } : {}),
    subject: "Hydranet Broadband SMTP test",
    html: `<!doctype html><html><body style="margin:0;background:#07111f;padding:32px;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:20px;padding:32px;color:#14213d;"><img src="cid:hydranet-logo" alt="Hydranet Broadband" style="width:210px;max-width:80%;height:auto;"><h1 style="margin:28px 0 10px;">SMTP is ready.</h1><p style="color:#53627a;line-height:1.7;">This test confirms that the Hydranet ERP can send branded partner emails using the saved SMTP configuration.</p><p style="color:#53627a;line-height:1.7;">You can now save partner portal details and send welcome emails with signed agreements attached.</p></div></body></html>`,
    attachments: [{ filename: "hydranet-logo.png", content: logoBuffer, cid: "hydranet-logo", contentType: "image/png" }],
  });
}

export function mapSmtpSettings(settings: SmtpSettings | undefined) {
  return {
    configured: Boolean(settings),
    host: settings?.host ?? null,
    port: settings?.port ?? 587,
    secure: settings?.secure ?? false,
    username: settings?.username ?? null,
    fromEmail: settings?.fromEmail ?? null,
    fromName: settings?.fromName ?? "Hydranet Broadband",
    replyTo: settings?.replyTo ?? null,
    hasPassword: Boolean(settings?.passwordEncrypted),
    updatedAt: settings?.updatedAt?.toISOString() ?? null,
  };
}