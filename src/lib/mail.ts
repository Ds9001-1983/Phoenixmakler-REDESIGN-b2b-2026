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
  steuernummer: string;
  quelle?: string;
  empfehlung?: string;
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
      ${a.ihk ? `<tr><td style="padding:6px 0;color:#777">IHK §34d</td><td style="padding:6px 0">${esc(a.ihk)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#777">Steuernummer</td><td style="padding:6px 0;font-family:monospace">${esc(a.steuernummer)}</td></tr>
      <tr><td style="padding:6px 0;color:#777">IBAN</td><td style="padding:6px 0;font-family:monospace">${esc(a.iban)}</td></tr>
      ${a.quelle ? `<tr><td style="padding:6px 0;color:#777">Quelle</td><td style="padding:6px 0">${esc(a.quelle)}</td></tr>` : ''}
      ${a.empfehlung ? `<tr><td style="padding:6px 0;color:#777">Empfohlen von</td><td style="padding:6px 0">${esc(a.empfehlung)}</td></tr>` : ''}
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
      Bei Fragen meldest du dich gerne unter <a href="mailto:info@phoenix-maklerverbund.de" style="color:#b8865b">info@phoenix-maklerverbund.de</a> oder telefonisch unter 02634/659858-0.
    </p>
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee;font-size:11px;color:#999">
      Phönix Maklerverbund GmbH · Zum weißen Stein 17 · 56587 Oberhonnefeld-Gierend
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

// --- Self-Service-Profil ---------------------------------------------------

const profilInviteHtml = (firstName: string, profilLink: string): string => `
<!doctype html>
<html lang="de"><body style="margin:0;background:#f4f1eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b8865b;margin-bottom:12px">Dein Makler-Profil bei Phönix</div>
    <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:400;margin:0 0 16px">Hallo ${esc(firstName)},</h1>
    <p style="font-size:15px;line-height:1.6;color:#333">
      du kannst jetzt deine persönliche Profil-Seite im Phönix-Maklerverbund gestalten — mit Foto,
      Kurzbiografie, Schwerpunkten, Qualifikationen und Bürozeiten. Alles in einem festen, einheitlichen
      Layout, um das du dich nicht weiter kümmern musst.
    </p>
    <p style="font-size:15px;line-height:1.6;color:#333;margin-bottom:24px">
      Klick einfach auf den Button, um dein Profil auszufüllen:
    </p>
    <a href="${profilLink}" style="display:inline-block;background:#b8865b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:500;font-size:15px">Profil gestalten →</a>
    <p style="font-size:13px;line-height:1.6;color:#777;margin-top:28px">
      Dein persönlicher Link ist 60 Tage gültig. Sollte er ablaufen, kannst du dir auf
      <a href="${esc(profilLink.split('?')[0])}" style="color:#b8865b">der Profil-Seite</a> jederzeit
      einen neuen schicken lassen. Deine Seite wird erst nach einer kurzen Prüfung durch Phönix öffentlich sichtbar.
    </p>
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee;font-size:11px;color:#999">
      Phönix Maklerverbund GmbH · Zum weißen Stein 17 · 56587 Oberhonnefeld-Gierend
    </div>
  </div>
</div>
</body></html>`;

const profilReviewHtml = (fullName: string, live: boolean, reviewLink: string): string => `
<!doctype html>
<html lang="de"><body style="margin:0;background:#f4f1eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:620px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b8865b;margin-bottom:8px">${live ? 'Profil aktualisiert' : 'Profil wartet auf Freigabe'}</div>
    <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:400;margin:0 0 16px;color:#1a1a1a">${esc(fullName)}</h1>
    ${
      live
        ? `<div style="background:#eef6ee;border-left:3px solid #4a9d5b;padding:16px;border-radius:4px;margin-bottom:20px;font-size:13px;line-height:1.55">
            Diese Maklerin/dieser Makler ist bereits freigegeben — die Änderung ist <strong>sofort online</strong>.
            Bitte kurz in der Vorschau prüfen; falls etwas nicht passt, kannst du die Seite dort offline nehmen.
          </div>`
        : `<div style="background:#faf6ee;border-left:3px solid #b8865b;padding:16px;border-radius:4px;margin-bottom:20px;font-size:13px;line-height:1.55">
            Ein neues Makler-Profil wurde eingereicht und ist <strong>noch nicht öffentlich</strong>.
            Sieh dir die Vorschau an und gib sie frei — oder wirf sie mit einem Hinweis an den Makler zurück.
            Nach der Freigabe gehen spätere Änderungen automatisch live.
          </div>`
    }
    <a href="${reviewLink}" style="display:inline-block;background:#b8865b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:500;font-size:15px">${live ? 'Vorschau ansehen & verwalten →' : 'Profil prüfen & freigeben →'}</a>
    <div style="margin-top:24px;font-size:11px;color:#999;line-height:1.5">
      Phönix Maklerverbund · Profil-Bot · neuerpartner@phoenix-maklerverbund.de
    </div>
  </div>
</div>
</body></html>`;

const profilRejectHtml = (firstName: string, editLink: string, reason: string): string => `
<!doctype html>
<html lang="de"><body style="margin:0;background:#f4f1eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b8865b;margin-bottom:12px">Kurze Überarbeitung nötig</div>
    <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:400;margin:0 0 16px">Hallo ${esc(firstName)},</h1>
    <p style="font-size:15px;line-height:1.6;color:#333">
      danke, dass du dein Profil im Phönix-Maklerverbund erstellt hast. Bevor wir es öffentlich schalten,
      möchten wir dich um eine kleine Überarbeitung bitten.
    </p>
    ${
      reason
        ? `<div style="background:#faf6ee;border-left:3px solid #b8865b;padding:16px;border-radius:4px;margin:20px 0;font-size:14px;line-height:1.6;color:#333">
            <strong>Anmerkung von Phönix:</strong><br>${esc(reason).replace(/\n/g, '<br>')}
          </div>`
        : ''
    }
    <p style="font-size:15px;line-height:1.6;color:#333;margin-bottom:24px">
      Klick einfach auf den Button, um dein Profil anzupassen:
    </p>
    <a href="${editLink}" style="display:inline-block;background:#b8865b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:500;font-size:15px">Profil überarbeiten →</a>
    <p style="font-size:13px;line-height:1.6;color:#777;margin-top:28px">
      Sobald du gespeichert hast, prüfen wir es erneut und schalten es frei. Bei Fragen melde dich gerne unter
      <a href="mailto:info@phoenix-maklerverbund.de" style="color:#b8865b">info@phoenix-maklerverbund.de</a>.
    </p>
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee;font-size:11px;color:#999">
      Phönix Maklerverbund GmbH · Zum weißen Stein 17 · 56587 Oberhonnefeld-Gierend
    </div>
  </div>
</div>
</body></html>`;

export const sendProfilEinladung = async (to: string, firstName: string, profilLink: string): Promise<void> => {
  const cfg = readSmtp();
  if (!cfg) throw new Error('smtp_not_configured');
  await transport(cfg).sendMail({
    from: cfg.from,
    to,
    subject: 'Gestalte dein Profil im Phönix-Maklerverbund',
    html: profilInviteHtml(firstName, profilLink),
  });
};

export const sendProfilReviewNotice = async (
  to: string,
  fullName: string,
  opts: { live: boolean; reviewLink: string },
): Promise<void> => {
  const cfg = readSmtp();
  if (!cfg) throw new Error('smtp_not_configured');
  await transport(cfg).sendMail({
    from: cfg.from,
    to,
    subject: opts.live ? `Makler-Profil aktualisiert: ${fullName}` : `Neues Makler-Profil zur Freigabe: ${fullName}`,
    html: profilReviewHtml(fullName, opts.live, opts.reviewLink),
  });
};

export const sendProfilRevision = async (
  to: string,
  firstName: string,
  opts: { editLink: string; reason: string },
): Promise<void> => {
  const cfg = readSmtp();
  if (!cfg) throw new Error('smtp_not_configured');
  await transport(cfg).sendMail({
    from: cfg.from,
    to,
    subject: 'Dein Profil im Phönix-Maklerverbund braucht noch eine kleine Überarbeitung',
    html: profilRejectHtml(firstName, opts.editLink, opts.reason),
  });
};
