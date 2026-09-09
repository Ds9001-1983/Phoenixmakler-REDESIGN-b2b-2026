import type { APIRoute } from 'astro';
import { assertSameOrigin, readSession, SESSION_COOKIE } from '../../../lib/team-auth';
import { loadEditorBerechtigte } from '../../../lib/vermittler';
import { issueProfilLink } from '../../../lib/profil-link';

export const prerender = false;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const dot = domain.lastIndexOf('.');
  const dName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local[0]}***@${dName[0]}***${tld}`;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!assertSameOrigin(request)) return j({ error: 'forbidden' }, 403);

  // Zweite Prüfung neben der Middleware — bewusste Redundanz.
  const session = readSession(cookies.get(SESSION_COOKIE)?.value);
  if (!session) return j({ error: 'unauthorized' }, 401);

  let body: { uid?: unknown };
  try {
    body = await request.json();
  } catch {
    return j({ error: 'bad_request' }, 400);
  }

  const uid = Number(body.uid);
  if (!uid || Number.isNaN(uid)) return j({ error: 'bad_request' }, 400);

  // WICHTIG: Nur die uid kommt aus dem Request. Empfänger und Name werden frisch
  // aus dem CRM aufgelöst. Käme die Adresse aus dem Body, wäre diese Seite ein
  // Versandwerkzeug für beliebige Empfänger über unsere SMTP-Reputation.
  const me = (await loadEditorBerechtigte()).find((v) => v.id === uid);
  if (!me || !me.email) return j({ error: 'not_found' }, 404);

  const res = await issueProfilLink(
    { uid: me.id, cid: null, email: me.email, name: me.name },
    { sendMail: true, writeCrm: false },
  );

  if (res.mail !== 'ok') {
    console.error(`Team-Bereich: Versand an uid ${uid} fehlgeschlagen (${res.mail})`);
    return j({ error: 'mail_failed', status: res.mail }, 502);
  }

  console.log(`Team-Bereich: ${session.sub} hat Link an uid ${uid} gesendet`);
  return j({
    ok: true,
    emailMasked: maskEmail(me.email),
    gueltigBis: res.gueltigBis.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  });
};
