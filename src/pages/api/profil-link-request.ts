import type { APIRoute } from 'astro';
import { loadEditorBerechtigte } from '../../lib/vermittler';
import { issueProfilLink } from '../../lib/profil-link';

export const prerender = false;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Sehr einfaches In-Memory-Rate-Limit pro Lambda-Instanz (Best-Effort gegen Missbrauch).
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

const firstNameOf = (full: string): string => full.trim().split(/\s+/)[0] || 'Hallo';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  const base = (import.meta.env.APP_BASE_URL ?? '').replace(/\/+$/, '');
  // Antwort IMMER generisch — verhindert E-Mail-Enumeration.
  const generic = j({ ok: true });

  if (!secret || !base) return generic;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return generic;
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email) return generic;

  const key = clientAddress ?? 'unknown';
  if (rateLimited(key)) return generic;

  try {
    const vermittler = await loadEditorBerechtigte();
    const me = vermittler.find((v) => v.email.trim().toLowerCase() === email);
    if (me) {
      // CRM-Ablage läuft mit: Fordert ein Makler seinen Link an, dessen Eintrag
      // noch fehlt (z. B. Neuzugang), wird er dabei nachgetragen.
      await issueProfilLink(
        { uid: me.id, cid: null, email: me.email, name: me.name },
        { sendMail: true, writeCrm: true },
      );
    }
  } catch (e) {
    console.error('profil-link-request failed', (e as Error).message);
  }

  return generic;
};
