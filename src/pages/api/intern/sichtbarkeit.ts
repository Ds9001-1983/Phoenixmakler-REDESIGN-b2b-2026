import type { APIRoute } from 'astro';
import { assertSameOrigin, readSession, SESSION_COOKIE } from '../../../lib/team-auth';
import { loadEditorBerechtigte, invalidatePhotoCache } from '../../../lib/vermittler';
import { setSichtbar } from '../../../lib/makler-flags';

export const prerender = false;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Schaltet, ob ein Makler öffentlich in der Maklersuche erscheint. */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!assertSameOrigin(request)) return j({ error: 'forbidden' }, 403);

  const session = readSession(cookies.get(SESSION_COOKIE)?.value);
  if (!session) return j({ error: 'unauthorized' }, 401);

  let body: { uid?: unknown; inSuche?: unknown };
  try {
    body = await request.json();
  } catch {
    return j({ error: 'bad_request' }, 400);
  }

  const uid = Number(body.uid);
  if (!uid || Number.isNaN(uid)) return j({ error: 'bad_request' }, 400);
  if (typeof body.inSuche !== 'boolean') return j({ error: 'bad_request' }, 400);

  // Nur Makler umschalten, die auch im Dashboard geführt werden — verhindert, dass
  // über eine geratene uid jemand sichtbar gemacht wird, der gar nicht dazugehört.
  const me = (await loadEditorBerechtigte()).find((v) => v.id === uid);
  if (!me) return j({ error: 'not_found' }, 404);

  const res = await setSichtbar(uid, body.inSuche, session.sub);
  if (res === 'stale') {
    return j({ error: 'stale', hinweis: 'Bitte in einer Minute erneut versuchen.' }, 503);
  }

  // Die Vermittler-Listen sind gecacht und würden den alten Stand weiterreichen.
  invalidatePhotoCache();

  console.log(`Team-Bereich: ${session.sub} setzt uid ${uid} auf ${body.inSuche ? 'sichtbar' : 'unsichtbar'}`);
  return j({ ok: true, uid, inSuche: body.inSuche });
};
