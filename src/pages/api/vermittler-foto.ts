import type { APIRoute } from 'astro';

export const prerender = false;

interface PwFile {
  id: number;
  name?: string | null;
  user_ids?: number[] | null;
  uploaded_at?: string | null;
}

const NOT_FOUND = new Response('Not Found', { status: 404 });

export const GET: APIRoute = async ({ url }) => {
  const base = import.meta.env.PW_API_BASE;
  const slug = import.meta.env.PW_USER_SLUG ?? 'me';
  const token = import.meta.env.PW_BEARER_TOKEN;
  if (!base || !token) return new Response('Server misconfigured', { status: 500 });

  const uid = Number(url.searchParams.get('uid'));
  if (!uid || Number.isNaN(uid)) return NOT_FOUND;

  // 1) Profilbild-File-ID für den User finden
  let fileId: number | null = null;
  try {
    const r = await fetch(
      `${base}/api/v1/${slug}/users/files?user_ids%5B%5D=${uid}&name=Profilbild&per_page=10&sort_by=uploaded_at&sort_direction=desc`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    );
    if (!r.ok) return NOT_FOUND;
    const j = (await r.json()) as { data?: PwFile[] };
    fileId = j.data?.[0]?.id ?? null;
  } catch {
    return NOT_FOUND;
  }
  if (!fileId) return NOT_FOUND;

  // 2) Datei-Bytes von PW holen und mit Cache-Header durchreichen
  let pwRes: Response;
  try {
    pwRes = await fetch(`${base}/api/v1/${slug}/users/files/${fileId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return NOT_FOUND;
  }
  if (!pwRes.ok || !pwRes.body) return NOT_FOUND;

  const ct = pwRes.headers.get('content-type') ?? 'image/jpeg';
  return new Response(pwRes.body, {
    status: 200,
    headers: {
      'Content-Type': ct,
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
    },
  });
};
