import type { APIRoute } from 'astro';
import { verifyToken, buildProfilAdminToken } from '../../lib/token';
import { loadVermittler } from '../../lib/vermittler';
import { validateProfil, saveProfilFromContent } from '../../lib/profil';
import { sendProfilReviewNotice } from '../../lib/mail';

export const prerender = false;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const baseUrl = () => (import.meta.env.APP_BASE_URL ?? '').replace(/\/+$/, '');

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  if (!secret) return j({ error: 'server_misconfigured' }, 500);

  let body: { token?: string; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return j({ error: 'invalid_json' }, 400);
  }

  const payload = verifyToken(String(body.token ?? ''), 'profil', secret);
  if (!payload) return j({ error: 'invalid_or_expired' }, 410);

  // Zugang nur für aktive Makler; uid stammt ausschließlich aus dem signierten Token.
  const vermittler = await loadVermittler();
  const me = vermittler.find((v) => v.id === payload.uid);
  if (!me) return j({ error: 'not_active' }, 403);

  const result = validateProfil(body.data);
  if (!result.ok || !result.content) return j({ error: 'validation', errors: result.errors }, 422);

  let saved;
  try {
    saved = await saveProfilFromContent(payload.uid, me.name, result.content);
  } catch (e) {
    console.error('saveProfil failed', (e as Error).message);
    return j({ error: 'storage_error' }, 502);
  }

  // Phoenix informieren (nicht-blockierend). Moderations-Links signiert mit TRIGGER_SECRET.
  const phoenixTo = import.meta.env.PHOENIX_NOTIFICATION_TO;
  const base = baseUrl();
  if (phoenixTo && base) {
    try {
      const adminToken = buildProfilAdminToken(payload.uid, payload.cid, payload.email, me.name, secret);
      await sendProfilReviewNotice(phoenixTo, me.name, {
        live: saved.liveSofort,
        publicLink: `${base}/makler/${saved.profil.slug}`,
        publishLink: `${base}/api/profil-publish?token=${encodeURIComponent(adminToken)}`,
        unpublishLink: `${base}/api/profil-unpublish?token=${encodeURIComponent(adminToken)}`,
      });
    } catch (e) {
      console.error('Profil review notice failed', (e as Error).message);
    }
  }

  return j({
    ok: true,
    slug: saved.profil.slug,
    published: saved.profil.published,
    // true = ging sofort live (bereits freigegeben); false = wartet auf Erstfreigabe
    live: saved.liveSofort,
  });
};
