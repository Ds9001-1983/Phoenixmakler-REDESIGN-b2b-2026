import type { APIRoute } from 'astro';
import { verifyLoginToken, setSessionCookie, assertSameOrigin } from '../../../lib/team-auth';
import { sendInternalNotice } from '../../../lib/mail';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress, redirect }) => {
  if (!assertSameOrigin(request)) return new Response('Forbidden', { status: 403 });

  let token: string | null = null;
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      token = (await request.json())?.t ?? null;
    } catch {
      token = null;
    }
  } else {
    const form = await request.formData();
    token = String(form.get('t') ?? '') || null;
  }

  const email = verifyLoginToken(token);
  if (!email) return redirect('/intern/login?fehler=abgelaufen', 303);

  setSessionCookie(cookies, email);

  // Erkennungsmaßnahme: Bei einem kompromittierten Postfach ist das die einzige
  // Spur, die jemandem auffallen kann. Bewusst knapp — die IP ist personenbezogen.
  const to = import.meta.env.PHOENIX_NOTIFICATION_TO;
  if (to) {
    try {
      await sendInternalNotice(to, 'Anmeldung im internen Bereich', [
        `Konto : ${email}`,
        `Zeit  : ${new Date().toLocaleString('de-DE')}`,
        `IP    : ${clientAddress ?? 'unbekannt'}`,
        '',
        'War das niemand aus dem Team, bitte TEAM_SECRET rotieren — das meldet alle ab.',
      ]);
    } catch (e) {
      console.error('Team-Login: Benachrichtigung fehlgeschlagen', (e as Error).message);
    }
  }

  // 303, damit der Token nicht in der Adresszeile stehen bleibt.
  return redirect('/intern', 303);
};
