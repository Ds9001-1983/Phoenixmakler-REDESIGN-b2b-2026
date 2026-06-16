import type { APIRoute } from 'astro';
import { verifyToken, buildProfilToken } from '../../lib/token';
import { setPublished } from '../../lib/profil';
import { sendProfilRevision } from '../../lib/mail';

export const prerender = false;

// „Zurückwerfen": Phönix lehnt das eingereichte Profil ab. Es bleibt offline und der
// Makler bekommt eine Überarbeitungs-Mail mit frischem Editor-Link + optionalem Hinweis.
const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const baseUrl = () => (import.meta.env.APP_BASE_URL ?? '').replace(/\/+$/, '');
const firstNameOf = (n?: string) => (n ?? '').trim().split(/\s+/)[0] ?? '';

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  if (!secret) return j({ error: 'server_misconfigured' }, 500);

  let body: { token?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return j({ error: 'invalid_json' }, 400);
  }

  const payload = verifyToken(String(body.token ?? ''), 'profil-admin', secret);
  if (!payload) return j({ error: 'invalid_or_expired' }, 410);

  const reason = String(body.reason ?? '').trim().slice(0, 1000);

  const updated = await setPublished(payload.uid, false);
  if (!updated) return j({ error: 'not_found' }, 404);

  // Makler zur Überarbeitung einladen (nicht-blockierend — wie bei profil-save).
  const base = baseUrl();
  if (base && payload.email) {
    try {
      const editToken = buildProfilToken(payload.uid, payload.cid, payload.email, payload.name ?? '', secret);
      const editLink = `${base}/makler-profil?token=${encodeURIComponent(editToken)}`;
      await sendProfilRevision(payload.email, firstNameOf(payload.name), { editLink, reason });
    } catch (e) {
      console.error('Profil revision mail failed', (e as Error).message);
    }
  }

  return j({ ok: true });
};
