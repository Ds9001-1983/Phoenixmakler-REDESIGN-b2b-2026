// Helper: Liste aller aktiven PW-Vermittler mit reduziertem öffentlichem Schema.
// In-Memory-Cache, TTL 1h. Pro Lambda-Instanz; bei Vercel oft mehrere Minuten warm.

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
const TTL_MS = 60 * 60 * 1000;

interface PwUser {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  address?: { postal_code?: string; city?: string } | null;
  communication?: { phone_business?: string | null; email?: string | null } | null;
}

interface PwFile {
  id: number;
  name?: string | null;
  user_ids?: number[] | null;
}

const fetchActiveUsers = async (base: string, slug: string, token: string): Promise<PwUser[]> => {
  const r = await fetch(`${base}/api/v1/${slug}/users?status_id=1&per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`PW users list failed: ${r.status}`);
  const j = (await r.json()) as { data?: PwUser[] };
  return j.data ?? [];
};

const fetchProfilePhotoMap = async (base: string, slug: string, token: string): Promise<Set<number>> => {
  // Nur User-IDs, für die ein "Profilbild"-File existiert. Ohne user-file:viewAny gibt es 403.
  try {
    const r = await fetch(`${base}/api/v1/${slug}/users/files?name=Profilbild&per_page=200`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!r.ok) return new Set();
    const j = (await r.json()) as { data?: PwFile[] };
    const set = new Set<number>();
    for (const f of j.data ?? []) {
      for (const uid of f.user_ids ?? []) set.add(uid);
    }
    return set;
  } catch {
    return new Set();
  }
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

  const photoUids = await fetchProfilePhotoMap(base, slug, token);

  const list: PublicVermittler[] = users
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

  cache = { ts: Date.now(), list };
  return list;
}
