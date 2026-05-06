import type { APIRoute } from 'astro';
import { list } from '@vercel/blob';

export const prerender = false;

export const GET: APIRoute = async () => {
  const has = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  let listOk = false;
  let listError: string | null = null;
  let count = 0;
  try {
    const r = await list({ prefix: 'vermittler/' });
    listOk = true;
    count = r.blobs.length;
  } catch (e) {
    listError = (e as Error).message.slice(0, 300);
  }
  return new Response(
    JSON.stringify({ token_present: has, list_ok: listOk, list_error: listError, blob_count: count }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
