import type { APIRoute } from 'astro';
import { verifyToken } from '../../lib/token';
import { setPublished } from '../../lib/profil';

export const prerender = false;

const page = (body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phönix · Profil-Moderation</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f4f1eb;color:#1a1a1a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{max-width:480px;background:#fff;border-radius:12px;padding:36px;box-shadow:0 2px 12px rgba(0,0,0,.06)}h1{font-family:Georgia,serif;font-size:26px;font-weight:400;margin:0 0 12px}.k{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b8865b;margin-bottom:8px}p{font-size:15px;line-height:1.6;color:#333}a{color:#b8865b}.err{color:#a33}</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ url }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  if (!secret) return page('<div class="k">Setup fehlt</div><h1 class="err">Server-Konfiguration unvollständig</h1>', 500);

  const token = url.searchParams.get('token');
  if (!token) return page('<div class="k">Fehler</div><h1 class="err">Kein Token</h1>', 400);

  const payload = verifyToken(token, 'profil-admin', secret);
  if (!payload) return page('<div class="k">Link ungültig</div><h1 class="err">Link abgelaufen oder ungültig</h1>', 410);

  const updated = await setPublished(payload.uid, false);
  if (!updated) return page('<div class="k">Nicht gefunden</div><h1 class="err">Kein Profil vorhanden</h1>', 404);

  return page(
    `<div class="k">Offline genommen</div><h1>Profil ist nicht mehr öffentlich</h1><p>Die Seite von <strong>${escapeHtml(payload.name ?? '')}</strong> wurde offline genommen. Die Inhalte bleiben gespeichert; eine erneute Freigabe ist jederzeit möglich.</p>`,
  );
};
