import type { APIRoute } from 'astro';
import { pwFetchAll } from '../../lib/pw';
import type { PwUser } from '../../lib/vermittler';
import { STATUS_AKTIV } from '../../lib/vermittler';

export const prerender = false;

interface CacheEntry {
  ts: number;
  list: { id: number; name: string }[];
}
let cache: CacheEntry | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 Minuten — ein neuer Vermittler ist keine real-time-Sache

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=60',
    },
  });

export const GET: APIRoute = async () => {
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return json({ vermittler: cache.list });
  }

  // pwFetchAll paginiert — vorher wurde hart bei 100 abgeschnitten.
  const users = await pwFetchAll<PwUser>('users', { status_id: STATUS_AKTIV });
  if (users.length === 0) return json({ vermittler: cache?.list ?? [] });

  const list = users
    .map((u) => ({
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
    }))
    .filter((x) => x.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  cache = { ts: Date.now(), list };
  return json({ vermittler: list });
};
