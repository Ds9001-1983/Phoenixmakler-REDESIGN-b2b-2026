import nodemailer, { type Transporter } from 'nodemailer';

interface SmtpEnv {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

let cached: Transporter | null = null;

const readSmtp = (): SmtpEnv | null => {
  const host = import.meta.env.SMTP_HOST;
  const port = Number(import.meta.env.SMTP_PORT ?? 587);
  const user = import.meta.env.SMTP_USER;
  const pass = import.meta.env.SMTP_PASS;
  const from = import.meta.env.MAIL_FROM ?? user;
  if (!host || !user || !pass) return null;
  return { host, port, user, pass, from };
};

const transport = (cfg: SmtpEnv): Transporter => {
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return cached;
};

export interface ApplicantData {
  vorname: string;
  nachname: string;
  anrede: string;
  email: string;
  telefon: string;
  strasse: string;
  plz: string;
  ort: string;
  geburtsdatum: string;
  ihk: string;
  iban: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const phoenixNotificationHtml = (a: ApplicantData, userId: number, triggerLink: string): string => `
<!doctype html>
<html lang="de"><body style="margin:0;background:#f4f1eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:620px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b8865b;margin-bottom:8px">Neue Bewerbung</div>
    <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;margin:0 0 4px;color:#1a1a1a">${esc(a.vorname)} ${esc(a.nachname)}</h1>
    <div style="font-size:13px;color:#777;margin-bottom:24px">PW-User-ID: ${userId}</div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
      <tr><td style="padding:6px 0;color:#777;width:140px">Anrede</td><td style="padding:6px 0">${esc(a.anrede)}</td></tr>
      <tr><td style="padding:6px 0;color:#777">Geburtsdatum</td><td style="padding:6px 0">${esc(a.geburtsdatum)}</td></tr>
      <tr><td style="padding:6px 0;color:#777">E-Mail</td><td style="padding:6px 0"><a href="mailto:${esc(a.email)}" style="color:#b8865b">${esc(a.email)}</a></td></tr>
      <tr><td style="padding:6px 0;color:#777">Telefon</td><td style="padding:6px 0"><a href="tel:${esc(a.telefon)}" style="color:#b8865b">${esc(a.telefon)}</a></td></tr>
      <tr><td style="padding:6px 0;color:#777">Adresse</td><td style="padding:6px 0">${esc(a.strasse)}<br>${esc(a.plz)} ${esc(a.ort)}</td></tr>
      <tr><td style="padding:6px 0;color:#777">IHK §34d</td><td style="padding:6px 0">${esc(a.ihk)}</td></tr>
      <tr><td style="padding:6px 0;color:#777">IBAN</td><td style="padding:6px 0;font-family:monospace">${esc(a.iban)}</td></tr>
    </table>

    <div style="background:#faf6ee;border-left:3px solid #b8865b;padding:16px;border-radius:4px;margin-bottom:20px;font-size:13px;line-height:1.55">
      <strong>Onboarding starten:</strong> Bitte zuerst im PW-CRM den Status von <em>storniert</em> auf <em>aktiv</em> setzen.
      Anschließend hier klicken — der Bewerber bekommt dann automatisch eine Mail mit dem Foto-Upload-Link, und der Link wird als Notiz beim Kunden hinterlegt.
    </div>

    <a href="${triggerLink}" style="display:inline-block;background:#b8865b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:500;font-size:15px">Foto-Upload-Mail an Bewerber senden →</a>

    <div style="margin-top:24px;font-size:11px;color:#999;line-height:1.5">
      Phönix Maklerverbund · Onboarding-Bot · neuerpartner@phoenix-maklerverbund.de
    </div>
  </div>
</div>
</body></html>`;

const applicantPhotoHtml = (firstName: string, uploadLink: string): string => `
<!doctype html>
<html lang="de"><body style="margin:0;background:#f4f1eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b8865b;margin-bottom:12px">Willkommen bei Phönix</div>
    <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:400;margin:0 0 16px">Hallo ${esc(firstName)},</h1>
    <p style="font-size:15px;line-height:1.6;color:#333">
      schön, dass du Teil des Phönix-Maklerverbunds wirst. Damit wir dein Profil im System komplettieren können, fehlt noch ein Foto von dir.
    </p>
    <p style="font-size:15px;line-height:1.6;color:#333;margin-bottom:24px">
      Klick einfach auf den Button unten, um dein Foto hochzuladen:
    </p>
    <a href="${uploadLink}" style="display:inline-block;background:#b8865b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:500;font-size:15px">Foto hochladen →</a>
    <p style="font-size:13px;line-height:1.6;color:#777;margin-top:28px">
      Bei Fragen meldest du dich gerne unter <a href="mailto:info@phoenix-maklerverbund.de" style="color:#b8865b">info@phoenix-maklerverbund.de</a> oder telefonisch unter 02634 659858-0.
    </p>
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee;font-size:11px;color:#999">
      Phönix Maklerverbund GmbH · Zum Weißen Stein 17 · 56587 Oberhonnefeld-Gierend
    </div>
  </div>
</div>
</body></html>`;

export const sendPhoenixNotification = async (
  to: string,
  applicant: ApplicantData,
  userId: number,
  triggerLink: string,
): Promise<void> => {
  const cfg = readSmtp();
  if (!cfg) throw new Error('smtp_not_configured');
  await transport(cfg).sendMail({
    from: cfg.from,
    to,
    subject: `Neue Bewerbung: ${applicant.vorname} ${applicant.nachname}`,
    html: phoenixNotificationHtml(applicant, userId, triggerLink),
  });
};

export const sendApplicantPhoto = async (to: string, firstName: string, uploadLink: string): Promise<void> => {
  const cfg = readSmtp();
  if (!cfg) throw new Error('smtp_not_configured');
  await transport(cfg).sendMail({
    from: cfg.from,
    to,
    subject: 'Willkommen bei Phönix — Foto-Upload zum Abschluss deines Profils',
    html: applicantPhotoHtml(firstName, uploadLink),
  });
};
