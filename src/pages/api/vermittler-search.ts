import type { APIRoute } from 'astro';

export const prerender = false;

interface PwUser {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
}

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

  const base = import.meta.env.PW_API_BASE;
  const slug = import.meta.env.PW_USER_SLUG ?? 'me';
  const token = import.meta.env.PW_BEARER_TOKEN;
  if (!base || !token) return json({ error: 'server_misconfigured' }, 500);

  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/${slug}/users?status_id=1&per_page=100`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch (e) {
    console.error('Vermittler-Search: PW unreachable', e);
    return json({ vermittler: [] });
  }

  if (!res.ok) {
    console.error('Vermittler-Search: PW error', res.status, (await res.text()).slice(0, 400));
    return json({ vermittler: [] });
  }

  const data = (await res.json()) as { data?: PwUser[] };
  const list = (data.data ?? [])
    .map((u) => ({
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
    }))
    .filter((x) => x.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  cache = { ts: Date.now(), list };
  return json({ vermittler: list });
};
