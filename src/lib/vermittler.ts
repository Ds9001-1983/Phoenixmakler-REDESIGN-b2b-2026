// Helper: Listen der PW-Vermittler mit reduziertem öffentlichem Schema.
// In-Memory-Cache, TTL 1h. Pro Lambda-Instanz; bei Vercel oft mehrere Minuten warm.
// Profilbilder liegen in Vercel Blob (vermittler/{pw_user_id}.{ext}), NICHT im PW-CRM.
//
// Zwei Listen mit unterschiedlichem Zweck:
//   loadVermittler()        Status 1 (aktiv)        → öffentlich: Maklersuche, /makler/{slug}, Sitemap
//   loadEditorBerechtigte() Status 1 und 5          → Editor-Zugang und Link-Anforderung
// Ein Makler im Status "neuer Partner" darf sein Profil also vorbereiten, erscheint
// aber erst öffentlich, wenn er aktiv UND freigegeben ist.

import { list } from '@vercel/blob';
import { pwFetchAll } from './pw';

export const STATUS_AKTIV = 1;
export const STATUS_NEUER_PARTNER = 5;

// Konten, die zwar als Vermittler geführt werden, aber keine Person mit
// Makler-Profil sind: Firmen-Sammelkonto, Abrechnung, Dienstleister-Zugang.
// Bewusst eine benannte Liste statt eines Rollen-Filters — role.id===1 würde
// auch echte Personen ausschließen (Innendienst/Hauptvermittler sind teils
// reguläre Makler). Gilt NUR für den Link-Versand, nicht für die Maklersuche.
export const SYSTEM_ACCOUNT_UIDS = new Set<number>([
  10278, // Phönix-Maklerverbund (Firmen-Sammelkonto, info@)
  33774, // Vertriebspartnerabrechnung
  62159, // Superbrand (Dienstleister-Zugang)
]);

export interface PublicVermittler {
  id: number;
  name: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  hasPhoto: boolean;
  status: number;
}

interface CacheEntry {
  ts: number;
  list: PublicVermittler[];
}
let cache: CacheEntry | null = null;
let editorCache: CacheEntry | null = null;
let photoCache: { ts: number; uids: Set<number> } | null = null;
const TTL_MS = 60 * 60 * 1000;
const PHOTO_TTL_MS = 5 * 60 * 1000; // Foto-Lookup darf schneller refreshen, damit neue Uploads sofort sichtbar werden

export interface PwUser {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  status?: { id?: number; name?: string } | null;
  role?: { id?: number; name?: string } | null;
  address?: { postal_code?: string; city?: string } | null;
  communication?: { phone_business?: string | null; email?: string | null } | null;
}

export const fetchUsersByStatus = async (statusIds: number[]): Promise<PwUser[]> => {
  const out: PwUser[] = [];
  for (const status of statusIds) {
    out.push(...(await pwFetchAll<PwUser>('users', { status_id: status })));
  }
  return out;
};

const fetchPhotoUids = async (): Promise<Set<number>> => {
  if (photoCache && Date.now() - photoCache.ts < PHOTO_TTL_MS) return photoCache.uids;
  const set = new Set<number>();
  try {
    const result = await list({ prefix: 'vermittler/' });
    for (const b of result.blobs) {
      // Pfad-Format: vermittler/<uid>.<ext> — uid extrahieren
      const m = b.pathname.match(/^vermittler\/(\d+)\./);
      if (m) set.add(Number(m[1]));
    }
  } catch (e) {
    console.error('Vercel Blob list (photos) failed', (e as Error).message);
  }
  photoCache = { ts: Date.now(), uids: set };
  return set;
};

export const invalidatePhotoCache = (): void => {
  photoCache = null;
  cache = null;
  editorCache = null;
};

const toPublic = (u: PwUser, photoUids: Set<number>): PublicVermittler => ({
  id: u.id,
  name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
  plz: u.address?.postal_code?.trim() ?? '',
  ort: u.address?.city?.trim() ?? '',
  telefon: u.communication?.phone_business?.trim() ?? '',
  email: u.communication?.email?.trim() ?? '',
  hasPhoto: photoUids.has(u.id),
  status: u.status?.id ?? 0,
});

const build = async (statusIds: number[]): Promise<PublicVermittler[]> => {
  const users = await fetchUsersByStatus(statusIds);
  if (users.length === 0) return [];
  const photoUids = await fetchPhotoUids();
  return users
    .map((u) => toPublic(u, photoUids))
    .filter((v) => v.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
};

/** Öffentliche Liste: nur aktive Vermittler. Maklersuche, Profilseiten, Sitemap. */
export async function loadVermittler(): Promise<PublicVermittler[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.list;
  const result = await build([STATUS_AKTIV]);
  if (result.length === 0) return cache?.list ?? [];
  cache = { ts: Date.now(), list: result };
  return result;
}

/**
 * Wer den Profil-Editor benutzen darf: aktive Makler UND neue Partner.
 * Bewusst weiter gefasst als loadVermittler() — ein neuer Partner soll sein
 * Profil vorbereiten können, während Phoenix ihn prüft.
 */
export async function loadEditorBerechtigte(): Promise<PublicVermittler[]> {
  if (editorCache && Date.now() - editorCache.ts < TTL_MS) return editorCache.list;
  const result = await build([STATUS_AKTIV, STATUS_NEUER_PARTNER]);
  if (result.length === 0) return editorCache?.list ?? [];
  editorCache = { ts: Date.now(), list: result };
  return result;
}
