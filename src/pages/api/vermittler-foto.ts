import type { APIRoute } from 'astro';
import { list } from '@vercel/blob';

export const prerender = false;

const NOT_FOUND = new Response('Not Found', { status: 404 });

export const GET: APIRoute = async ({ url }) => {
  const uid = Number(url.searchParams.get('uid'));
  if (!uid || Number.isNaN(uid)) return NOT_FOUND;

  let blobUrl: string | null = null;
  try {
    const result = await list({ prefix: `vermittler/${uid}.` });
    blobUrl = result.blobs[0]?.url ?? null;
  } catch (e) {
    console.error('Vercel Blob list failed', (e as Error).message);
    return NOT_FOUND;
  }
  if (!blobUrl) return NOT_FOUND;

  // Bild direkt durch unseren Endpoint streamen, damit Browser nicht zur Blob-Domain
  // wechseln muss (saubere CSP, eine Origin im Maklerfinder).
  let pwRes: Response;
  try {
    pwRes = await fetch(blobUrl);
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
