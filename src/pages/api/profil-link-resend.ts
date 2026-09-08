import type { APIRoute } from 'astro';
import { verifyToken } from '../../lib/token';
import { loadEditorBerechtigte } from '../../lib/vermittler';
import { issueProfilLink } from '../../lib/profil-link';

export const prerender = false;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Rate-Limit pro Lambda-Instanz (Best-Effort), analog profil-link-request.
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

/**
 * Maskiert eine Adresse für die Anzeige: thorsten.d@pmv.gmbh → t***@p***.gmbh
 * Der Empfänger soll erkennen, ob es seine Adresse ist, ohne dass die Adresse
 * für Dritte ablesbar wird — der Link liegt im CRM und ist nicht geheim.
 */
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const dot = domain.lastIndexOf('.');
  const dName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local[0]}***@${dName[0]}***${tld}`;
};

const firstNameOf = (full: string): string => full.trim().split(/\s+/)[0] || '';

const resolve = async (token: string | null, secret: string) => {
  if (!token) return null;
  const payload = verifyToken(token, 'profil-request', secret);
  if (!payload) return null;
  // Identität und Adresse kommen IMMER frisch aus dem CRM über die uid —
  // nie aus dem Token. Dadurch kann der Link ausschließlich eine Mail an den
  // hinterlegten Makler auslösen, auch wenn er in fremde Hände gerät.
  const me = (await loadEditorBerechtigte()).find((v) => v.id === payload.uid);
  if (!me || !me.email) return null;
  return me;
};

export const GET: APIRoute = async ({ url }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  if (!secret) return j({ ok: false, reason: 'unconfigured' }, 500);

  const me = await resolve(url.searchParams.get('m'), secret);
  if (!me) return j({ ok: false, reason: 'unknown' }, 404);

  return j({ ok: true, name: firstNameOf(me.name), emailMasked: maskEmail(me.email) });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  if (!secret) return j({ ok: false }, 500);

  if (rateLimited(clientAddress ?? 'unknown')) return j({ ok: true });

  let body: { m?: string };
  try {
    body = await request.json();
  } catch {
    return j({ ok: false }, 400);
  }

  const me = await resolve(body.m ?? null, secret);
  if (!me) return j({ ok: false, reason: 'unknown' }, 404);

  // Kein CRM-Schreibvorgang: Der Eintrag existiert bereits (von dort kam der Link).
  const res = await issueProfilLink(
    { uid: me.id, cid: null, email: me.email, name: me.name },
    { sendMail: true, writeCrm: false },
  );

  if (res.mail !== 'ok') return j({ ok: false, reason: 'mail_failed' }, 502);
  return j({ ok: true, emailMasked: maskEmail(me.email) });
};
