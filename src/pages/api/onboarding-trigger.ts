import type { APIRoute } from 'astro';
import { verifyToken, buildUploadToken } from '../../lib/token';
import { sendApplicantPhoto } from '../../lib/mail';

export const prerender = false;

const html = (body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phönix Onboarding</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f4f1eb;color:#1a1a1a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{max-width:480px;background:#fff;border-radius:12px;padding:36px;box-shadow:0 2px 12px rgba(0,0,0,.06)}h1{font-family:Georgia,serif;font-size:26px;font-weight:400;margin:0 0 12px}.k{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b8865b;margin-bottom:8px}p{font-size:15px;line-height:1.6;color:#333}.err{color:#a33}</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

export const GET: APIRoute = async ({ url }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  const base = import.meta.env.PW_API_BASE;
  const slug = import.meta.env.PW_USER_SLUG ?? 'me';
  const pwToken = import.meta.env.PW_BEARER_TOKEN;
  const appBaseUrl = import.meta.env.APP_BASE_URL;

  if (!secret || !base || !pwToken || !appBaseUrl) {
    return html('<div class="k">Server-Konfiguration unvollständig</div><h1>Setup fehlt</h1><p>Bitte den Administrator informieren.</p>', 500);
  }

  const token = url.searchParams.get('token');
  if (!token) return html('<div class="k">Fehler</div><h1 class="err">Kein Token</h1>', 400);

  const payload = verifyToken(token, 'trigger', secret);
  if (!payload) return html('<div class="k">Link ungültig</div><h1 class="err">Link abgelaufen oder ungültig</h1><p>Bitte das Formular erneut absenden lassen oder beim Administrator melden.</p>', 410);

  const headers = {
    Authorization: `Bearer ${pwToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const uploadToken = buildUploadToken(payload.uid, payload.cid, payload.email, secret);
  const uploadLink = `${appBaseUrl.replace(/\/+$/, '')}/foto-upload?token=${encodeURIComponent(uploadToken)}`;

  // 1) Notiz beim Kunden anlegen — nicht-blockierend
  let noteOk = false;
  if (payload.cid) {
    try {
      const r = await fetch(`${base}/api/v1/${slug}/clients/notes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          client_id: payload.cid,
          title: 'Onboarding · Foto-Upload-Link',
          content: `Bewerber kann sein Foto über folgenden Link hochladen:\n${uploadLink}\n\n(Link ist 30 Tage gültig.)`,
        }),
      });
      noteOk = r.ok;
      if (!r.ok) console.error('PW notes error', r.status, (await r.text()).slice(0, 400));
    } catch (e) {
      console.error('PW notes fetch failed', e);
    }
  }

  // 2) Mail an Bewerber
  let mailOk = false;
  try {
    const firstName = payload.email.split('@')[0].split('.')[0] || 'da';
    const prettyFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    await sendApplicantPhoto(payload.email, prettyFirst, uploadLink);
    mailOk = true;
  } catch (e) {
    console.error('Applicant mail failed', (e as Error).message);
  }

  const status =
    noteOk && mailOk
      ? `<div class="k">Erfolgreich</div><h1>E-Mail an Bewerber gesendet</h1><p>Der Foto-Upload-Link wurde an <strong>${payload.email}</strong> versendet und als Notiz beim Kunden im CRM hinterlegt.</p>`
      : mailOk
        ? `<div class="k">Teilweise erfolgreich</div><h1>Mail gesendet</h1><p>Die Bewerber-Mail wurde verschickt, die Notiz beim Kunden konnte nicht angelegt werden — bitte ggf. manuell ergänzen.</p>`
        : `<div class="k">Fehler</div><h1 class="err">Mail-Versand fehlgeschlagen</h1><p>Bitte den Administrator informieren.</p>`;

  return html(status, mailOk ? 200 : 500);
};
