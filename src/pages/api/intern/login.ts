import type { APIRoute } from 'astro';
import { buildLoginToken, isTeamMember, normalizeEmail, LOGIN_TTL_MINUTES } from '../../../lib/team-auth';
import { sendInternalNotice } from '../../../lib/mail';

export const prerender = false;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Bremse gegen die naive Schleife. Auf Vercel nur Best-Effort (pro Instanz,
// überlebt keinen Kaltstart) — für ein echtes Limit wäre eine Firewall-Regel
// das richtige Mittel. Der Schaden ist ohnehin gedeckelt: nur Adressen aus der
// Allowlist lösen überhaupt einen Versand aus.
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;
const rateLimited = (key: string): boolean => {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > MAX_HITS;
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const base = (import.meta.env.APP_BASE_URL ?? '').replace(/\/+$/, '');
  // Antwort IMMER generisch — verrät nicht, wer im Team ist.
  const generic = j({ ok: true });

  if (rateLimited(clientAddress ?? 'unknown')) return generic;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return generic;
  }

  const email = normalizeEmail(String(body.email ?? ''));
  if (!email || !isTeamMember(email) || !base) return generic;

  const token = buildLoginToken(email);
  if (!token) return generic;

  const link = `${base}/intern/anmelden?t=${encodeURIComponent(token)}`;
  try {
    // Bewusst reine Textmail: Klartext-URLs werden von Sicherheits-Gateways
    // seltener umgeschrieben als HTML-Links.
    await sendInternalNotice(email, 'Dein Anmelde-Link für den internen Bereich', [
      'Hallo,',
      '',
      'hier ist dein Anmelde-Link für den internen Bereich des Phönix-Maklerverbunds:',
      '',
      link,
      '',
      `Der Link ist ${LOGIN_TTL_MINUTES} Minuten gültig. Nach dem Öffnen musst du die`,
      'Anmeldung noch mit einem Klick bestätigen — danach bleibst du 30 Tage angemeldet.',
      '',
      'Wenn du das nicht warst, kannst du diese Nachricht ignorieren.',
    ]);
  } catch (e) {
    console.error('Team-Login: Mailversand fehlgeschlagen', (e as Error).message);
  }

  return generic;
};
