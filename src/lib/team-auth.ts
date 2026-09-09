// Zugang zum internen Team-Bereich (/intern).
//
// Anmeldung per Magic Link an eine Allowlist, danach eine signierte, zustandslose
// Sitzung im Cookie. Kein Session-Store: Auf Vercel laufen mehrere Instanzen, und
// Vercel Blob kennt kein atomares Schreiben — die Staleness-Probleme, die
// makler-state.ts schon im Cron lösen musste, wären im Anmeldeweg deutlich schlimmer.
//
// Widerruf ohne Store:
//   einzelne Person → Adresse aus TEAM_ALLOWLIST entfernen (wirkt beim nächsten Request)
//   alle            → TEAM_SECRET rotieren
// Deshalb wird bei JEDER Anfrage zusätzlich zur Signatur die Allowlist geprüft.

import type { AstroCookies } from 'astro';
import { signAny, verifyAny, type AnyPayload } from './token';

const ENV: Record<string, string | undefined> = (import.meta as any).env ?? process.env;

export const SESSION_COOKIE = 'pmv_team';
export const SESSION_TTL_DAYS = 30;
export const RENEW_AFTER_DAYS = 7;
export const ABSOLUTE_MAX_DAYS = 180;
export const LOGIN_TTL_MINUTES = 10;

const KIND_LOGIN = 'team-login';
const KIND_SESSION = 'team-session';

export interface TeamSession extends AnyPayload {
  kind: typeof KIND_SESSION;
  /** Normalisierte E-Mail-Adresse des Teammitglieds. */
  sub: string;
  /** Ausstellungszeitpunkt (Unix-Sekunden) — Grundlage für die gleitende Verlängerung. */
  iat: number;
}

interface LoginPayload extends AnyPayload {
  kind: typeof KIND_LOGIN;
  sub: string;
}

const secret = (): string => ENV.TEAM_SECRET ?? '';
const now = (): number => Math.floor(Date.now() / 1000);

export const normalizeEmail = (e: string): string => e.trim().toLowerCase();

/** Team-Adressen aus TEAM_ALLOWLIST (kommagetrennt). Nie mit PUBLIC_ präfixen. */
export function teamAllowlist(): string[] {
  return (ENV.TEAM_ALLOWLIST ?? '')
    .split(',')
    .map(normalizeEmail)
    .filter((e) => e.includes('@'));
}

export function isTeamMember(email: string | undefined | null): boolean {
  if (!email) return false;
  return teamAllowlist().includes(normalizeEmail(email));
}

/** Ist der Zugang überhaupt eingerichtet? */
export function teamAuthConfigured(): boolean {
  return secret().length > 0 && teamAllowlist().length > 0;
}

// --- Magic Link -------------------------------------------------------------

export function buildLoginToken(email: string): string | null {
  const s = secret();
  if (!s) return null;
  const payload: LoginPayload = {
    kind: KIND_LOGIN,
    sub: normalizeEmail(email),
    exp: now() + LOGIN_TTL_MINUTES * 60,
  };
  return signAny(payload, s);
}

/** Gibt die normalisierte Adresse zurück — oder null, wenn ungültig/abgelaufen/nicht mehr im Team. */
export function verifyLoginToken(token: string | undefined | null): string | null {
  const p = verifyAny<LoginPayload>(token, KIND_LOGIN, secret());
  if (!p?.sub) return null;
  return isTeamMember(p.sub) ? normalizeEmail(p.sub) : null;
}

// --- Sitzung ----------------------------------------------------------------

function buildSessionToken(email: string, iat: number): string {
  const payload: TeamSession = {
    kind: KIND_SESSION,
    sub: normalizeEmail(email),
    iat,
    exp: iat + SESSION_TTL_DAYS * 86400,
  };
  return signAny(payload, secret());
}

/**
 * Prüft den Cookie-Wert. Gibt nur dann eine Sitzung zurück, wenn Signatur, Ablauf,
 * absolute Höchstdauer UND Allowlist stimmen — die Allowlist-Prüfung ist der
 * Widerrufsmechanismus.
 */
export function readSession(raw: string | undefined | null): TeamSession | null {
  const p = verifyAny<TeamSession>(raw, KIND_SESSION, secret());
  if (!p?.sub || typeof p.iat !== 'number') return null;
  if (now() > p.iat + ABSOLUTE_MAX_DAYS * 86400) return null;
  if (!isTeamMember(p.sub)) return null;
  return p;
}

export function needsRenewal(s: TeamSession): boolean {
  return now() > s.iat + RENEW_AFTER_DAYS * 86400;
}

export function setSessionCookie(cookies: AstroCookies, email: string, iat = now()): void {
  cookies.set(SESSION_COOKIE, buildSessionToken(email, iat), {
    httpOnly: true,
    // secure aus der Basis-URL ableiten statt aus NODE_ENV: lokal läuft http://localhost,
    // produktiv https — damit stimmt das Flag in beiden Umgebungen ohne Sonderfall.
    secure: (ENV.APP_BASE_URL ?? '').startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  // Derselbe Pfad wie beim Setzen — sonst wird nichts gelöscht.
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

// --- CSRF-Gürtel ------------------------------------------------------------

/**
 * Prüft den Origin-Header gegen APP_BASE_URL. sameSite=lax verhindert bereits, dass
 * bei fremdseitigem POST das Cookie mitgeschickt wird; das hier ist der Gürtel zum
 * Hosenträger und kostet drei Zeilen.
 */
export function assertSameOrigin(request: Request): boolean {
  const base = (ENV.APP_BASE_URL ?? '').replace(/\/+$/, '');
  const origin = request.headers.get('origin');
  if (!origin) return true; // Nicht-Browser-Aufrufe (curl) haben keinen Origin
  if (!base) return false;
  try {
    return new URL(origin).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
