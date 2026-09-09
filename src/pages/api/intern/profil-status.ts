import type { APIRoute } from 'astro';
import { assertSameOrigin, readSession, SESSION_COOKIE } from '../../../lib/team-auth';
import { setPublished } from '../../../lib/profil';

export const prerender = false;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Profil freigeben oder vom Netz nehmen — aus dem Dashboard heraus.
 *
 * Bewusst ein eigener Endpunkt: /api/profil-publish und /api/profil-unpublish
 * verlangen zwingend einen signierten profil-admin-Token. Den je Zeile ins HTML zu
 * legen hieße, ~94 Moderations-Zugänge in den Quelltext einer Seite zu schreiben.
 * Hier ist die Team-Sitzung die Autorisierung; /makler-freigabe bleibt unverändert.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!assertSameOrigin(request)) return j({ error: 'forbidden' }, 403);

  const session = readSession(cookies.get(SESSION_COOKIE)?.value);
  if (!session) return j({ error: 'unauthorized' }, 401);

  let body: { uid?: unknown; published?: unknown };
  try {
    body = await request.json();
  } catch {
    return j({ error: 'bad_request' }, 400);
  }

  const uid = Number(body.uid);
  if (!uid || Number.isNaN(uid)) return j({ error: 'bad_request' }, 400);
  if (typeof body.published !== 'boolean') return j({ error: 'bad_request' }, 400);

  const profil = await setPublished(uid, body.published);
  if (!profil) return j({ error: 'not_found' }, 404);

  console.log(
    `Team-Bereich: ${session.sub} setzt Profil ${uid} auf ${body.published ? 'online' : 'offline'}`,
  );
  return j({ ok: true, uid, published: profil.published, slug: profil.slug });
};
