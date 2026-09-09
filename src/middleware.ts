// Zugangsschutz für den internen Team-Bereich.
//
// WICHTIG: Diese Middleware ist NICHT der alleinige Schutz. Bei output:'hybrid'
// laufen prerenderte Routen zur Bauzeit durch die Middleware, nicht pro Anfrage —
// eine Seite ohne `prerender = false` wäre also trotz Middleware öffentlich.
// Deshalb hat zusätzlich jede Seite unter /intern ihre eigene Prüfung im Frontmatter.

import { defineMiddleware } from 'astro:middleware';
import {
  SESSION_COOKIE,
  readSession,
  needsRenewal,
  setSessionCookie,
  teamAuthConfigured,
} from './lib/team-auth';

const GESCHUETZT = '/intern';

// Seiten und Endpunkte, die ohne Sitzung erreichbar sein müssen.
const OEFFENTLICH = new Set([
  '/intern/login',
  '/intern/anmelden',
  '/api/intern/login',
  '/api/intern/callback',
  '/api/intern/logout',
]);

const istIntern = (pfad: string): boolean =>
  pfad === GESCHUETZT || pfad.startsWith(`${GESCHUETZT}/`) || pfad.startsWith('/api/intern/');

export const onRequest = defineMiddleware(async (context, next) => {
  const pfad = context.url.pathname.replace(/\/+$/, '') || '/';

  // Alles außerhalb sofort durchlassen — die Middleware läuft sonst auch über
  // den Build der statischen Seiten.
  if (!istIntern(pfad)) return next();

  const antwortHeader = (res: Response): Response => {
    res.headers.set('Cache-Control', 'private, no-store');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  };

  if (OEFFENTLICH.has(pfad)) return antwortHeader(await next());

  if (!teamAuthConfigured()) {
    return antwortHeader(
      new Response('Interner Bereich ist nicht eingerichtet.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
    );
  }

  const session = readSession(context.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    // API-Aufrufe bekommen 401, Seiten eine Umleitung zur Anmeldung.
    if (pfad.startsWith('/api/')) {
      return antwortHeader(
        new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return antwortHeader(context.redirect('/intern/login', 302));
  }

  context.locals.team = session;
  const res = antwortHeader(await next());

  // Gleitende Verlängerung, damit sich niemand exakt alle 30 Tage neu anmelden muss.
  if (needsRenewal(session)) setSessionCookie(context.cookies, session.sub);

  return res;
});
