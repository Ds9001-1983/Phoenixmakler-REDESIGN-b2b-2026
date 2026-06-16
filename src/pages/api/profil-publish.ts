import type { APIRoute } from 'astro';
import { verifyToken } from '../../lib/token';
import { setPublished } from '../../lib/profil';

export const prerender = false;

// State-changing → ausschließlich POST (kein GET-Prefetch/Link-Scanner-Risiko).
// Aufruf erfolgt aus der Vorschau-/Freigabe-Seite (makler-freigabe.astro) per fetch.
const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const baseUrl = () => (import.meta.env.APP_BASE_URL ?? '').replace(/\/+$/, '');

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  if (!secret) return j({ error: 'server_misconfigured' }, 500);

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return j({ error: 'invalid_json' }, 400);
  }

  const payload = verifyToken(String(body.token ?? ''), 'profil-admin', secret);
  if (!payload) return j({ error: 'invalid_or_expired' }, 410);

  const updated = await setPublished(payload.uid, true);
  if (!updated) return j({ error: 'not_found' }, 404);

  return j({ ok: true, slug: updated.slug, url: `${baseUrl()}/makler/${updated.slug}` });
};
