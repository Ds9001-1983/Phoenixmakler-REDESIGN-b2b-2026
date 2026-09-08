import { createHmac, timingSafeEqual } from 'node:crypto';

export type TokenKind = 'trigger' | 'upload' | 'profil' | 'profil-admin' | 'profil-request';

export interface TokenPayload {
  uid: number;
  cid: number | null;
  email: string;
  name?: string;
  kind: TokenKind;
  exp: number;
}

// Gültigkeit des Editor-Links. Bewusst kurz: Ein abgelaufener Link ist kein
// Problem mehr, seit sich jeder Makler über den dauerhaften Selbstbedienungs-Link
// (kind 'profil-request') mit einem Klick einen frischen schicken lassen kann.
// Wird auch im Mail-Text gerendert — die Zahl steht nur hier.
export const PROFIL_TTL_DAYS = 14;

const b64u = (buf: Buffer | string) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64uDecode = (s: string): Buffer => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
};

const sign = (data: string, secret: string) =>
  createHmac('sha256', secret).update(data).digest();

export function signToken(payload: TokenPayload, secret: string): string {
  const head = b64u(JSON.stringify(payload));
  const sig = b64u(sign(head, secret));
  return `${head}.${sig}`;
}

export function verifyToken(token: string, kind: TokenKind, secret: string): TokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [head, sig] = token.split('.');
  if (!head || !sig) return null;

  const expected = sign(head, secret);
  let actual: Buffer;
  try {
    actual = b64uDecode(sig);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64uDecode(head).toString('utf-8')) as TokenPayload;
  } catch {
    return null;
  }
  if (payload.kind !== kind) return null;
  if (typeof payload.exp !== 'number') return null;
  // exp === 0 bedeutet "läuft nie ab" — ausschließlich für 'profil-request' gedacht,
  // der im CRM dauerhaft hinterlegt wird. Dieser Token gewährt selbst keinen Zugang,
  // sondern löst nur den Versand an die im CRM hinterlegte Adresse aus.
  if (payload.exp !== 0 && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

export function buildTriggerToken(uid: number, cid: number | null, email: string, name: string, secret: string, ttlDays = 14): string {
  return signToken(
    { uid, cid, email, name, kind: 'trigger', exp: Math.floor(Date.now() / 1000) + ttlDays * 86400 },
    secret,
  );
}

export function buildUploadToken(uid: number, cid: number | null, email: string, name: string, secret: string, ttlDays = 30): string {
  return signToken(
    { uid, cid, email, name, kind: 'upload', exp: Math.floor(Date.now() / 1000) + ttlDays * 86400 },
    secret,
  );
}

// Self-Service-Profil: Edit-Link für den Makler. Kurze Laufzeit (PROFIL_TTL_DAYS),
// Neuanforderung jederzeit über /makler-profil oder den dauerhaften Link.
export function buildProfilToken(uid: number, cid: number | null, email: string, name: string, secret: string, ttlDays = PROFIL_TTL_DAYS): string {
  return signToken(
    { uid, cid, email, name, kind: 'profil', exp: Math.floor(Date.now() / 1000) + ttlDays * 86400 },
    secret,
  );
}

// Moderations-Link für das Phoenix-Team (Freigabe / Offline-nehmen). Geht nur an die
// interne Benachrichtigungs-Adresse, signiert mit TRIGGER_SECRET.
export function buildProfilAdminToken(uid: number, cid: number | null, email: string, name: string, secret: string, ttlDays = 30): string {
  return signToken(
    { uid, cid, email, name, kind: 'profil-admin', exp: Math.floor(Date.now() / 1000) + ttlDays * 86400 },
    secret,
  );
}

// Dauerhafter Selbstbedienungs-Link, der im CRM in der Vermittlerakte hinterlegt wird.
//
// Der Payload enthält BEWUSST nur die uid — kein Name, keine E-Mail, kein Ablaufdatum.
// Dadurch ist der Token deterministisch: derselbe Makler ergibt immer denselben Token
// und damit dieselbe URL. Das ist zwingend, weil die PW-API Benutzer-Dateien nur
// anlegen kann (kein PUT/DELETE) — ein abweichender Token bei einem zweiten Lauf
// würde einen zweiten, nicht mehr entfernbaren Eintrag erzeugen.
export function buildProfilRequestToken(uid: number, secret: string): string {
  return signToken({ uid, cid: null, email: '', kind: 'profil-request', exp: 0 }, secret);
}

// Gültig-bis-Datum passend zum Editor-Token — für Mail-Text und CRM-Notiz.
export function profilTokenExpiry(ttlDays = PROFIL_TTL_DAYS): Date {
  return new Date(Date.now() + ttlDays * 86400 * 1000);
}
