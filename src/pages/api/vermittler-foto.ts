import type { APIRoute } from 'astro';
import { list, get } from '@vercel/blob';

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

  // Privater Store: get() mit voller Blob-URL liefert authentifizierten Stream
  let blob: Awaited<ReturnType<typeof get>>;
  try {
    blob = await get(blobUrl, { access: 'private' });
  } catch (e) {
    console.error('Vercel Blob get failed', (e as Error).message);
    return NOT_FOUND;
  }
  if (!blob || blob.statusCode !== 200) return NOT_FOUND;

  return new Response(blob.stream, {
    status: 200,
    headers: {
      'Content-Type': blob.blob.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200',
    },
  });
};
