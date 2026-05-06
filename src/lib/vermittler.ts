// Helper: Liste aller aktiven PW-Vermittler mit reduziertem öffentlichem Schema.
// In-Memory-Cache, TTL 1h. Pro Lambda-Instanz; bei Vercel oft mehrere Minuten warm.
// Profilbilder liegen in Vercel Blob (vermittler/{pw_user_id}.{ext}), NICHT im PW-CRM.

import { list } from '@vercel/blob';

export interface PublicVermittler {
  id: number;
  name: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  hasPhoto: boolean;
}

interface CacheEntry {
  ts: number;
  list: PublicVermittler[];
}
let cache: CacheEntry | null = null;
let photoCache: { ts: number; uids: Set<number> } | null = null;
const TTL_MS = 60 * 60 * 1000;
const PHOTO_TTL_MS = 5 * 60 * 1000; // Foto-Lookup darf schneller refreshen, damit neue Uploads sofort sichtbar werden

interface PwUser {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  address?: { postal_code?: string; city?: string } | null;
  communication?: { phone_business?: string | null; email?: string | null } | null;
}

const fetchActiveUsers = async (base: string, slug: string, token: string): Promise<PwUser[]> => {
  const r = await fetch(`${base}/api/v1/${slug}/users?status_id=1&per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`PW users list failed: ${r.status}`);
  const j = (await r.json()) as { data?: PwUser[] };
  return j.data ?? [];
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
};

export async function loadVermittler(): Promise<PublicVermittler[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.list;

  const base = import.meta.env.PW_API_BASE;
  const slug = import.meta.env.PW_USER_SLUG ?? 'me';
  const token = import.meta.env.PW_BEARER_TOKEN;
  if (!base || !token) return [];

  let users: PwUser[];
  try {
    users = await fetchActiveUsers(base, slug, token);
  } catch (e) {
    console.error('Vermittler-List: PW unreachable', (e as Error).message);
    return cache?.list ?? [];
  }

  const photoUids = await fetchPhotoUids();

  const result: PublicVermittler[] = users
    .map((u) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
      return {
        id: u.id,
        name,
        plz: u.address?.postal_code?.trim() ?? '',
        ort: u.address?.city?.trim() ?? '',
        telefon: u.communication?.phone_business?.trim() ?? '',
        email: u.communication?.email?.trim() ?? '',
        hasPhoto: photoUids.has(u.id),
      };
    })
    .filter((v) => v.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  cache = { ts: Date.now(), list: result };
  return result;
}
