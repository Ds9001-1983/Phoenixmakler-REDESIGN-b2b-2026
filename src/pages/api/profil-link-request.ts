import type { APIRoute } from 'astro';
import { buildProfilToken } from '../../lib/token';
import { loadVermittler } from '../../lib/vermittler';
import { sendProfilEinladung } from '../../lib/mail';

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
    const vermittler = await loadVermittler();
    const me = vermittler.find((v) => v.email.trim().toLowerCase() === email);
    if (me) {
      const token = buildProfilToken(me.id, null, me.email, me.name, secret);
      const link = `${base}/makler-profil?token=${encodeURIComponent(token)}`;
      await sendProfilEinladung(me.email, firstNameOf(me.name), link);
    }
  } catch (e) {
    console.error('profil-link-request failed', (e as Error).message);
  }

  return generic;
};
