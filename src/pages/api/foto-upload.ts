import type { APIRoute } from 'astro';
import { put, list, del } from '@vercel/blob';
import { verifyToken } from '../../lib/token';
import { invalidatePhotoCache } from '../../lib/vermittler';

export const prerender = false;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const extOf = (mime: string): string => {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/heic') return 'heic';
  if (m === 'image/heif') return 'heif';
  return 'bin';
};

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  if (!secret) return j({ error: 'server_misconfigured' }, 500);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return j({ error: 'invalid_form' }, 400);
  }

  const token = String(form.get('token') ?? '');
  const file = form.get('file');

  const payload = verifyToken(token, 'upload', secret);
  if (!payload) return j({ error: 'invalid_or_expired' }, 410);

  if (!(file instanceof File)) return j({ error: 'no_file' }, 422);
  if (file.size === 0) return j({ error: 'empty_file' }, 422);
  if (file.size > MAX_BYTES) return j({ error: 'file_too_large', max_mb: 8 }, 413);
  if (!ALLOWED_TYPES.has(file.type)) return j({ error: 'unsupported_type', allowed: [...ALLOWED_TYPES] }, 415);

  const prefix = `vermittler/${payload.uid}.`;

  // Re-Upload: vorhandene Bilder unter diesem Prefix löschen
  try {
    const existing = await list({ prefix });
    for (const blob of existing.blobs) {
      await del(blob.url);
    }
  } catch (e) {
    console.error('Vercel Blob list/del failed', (e as Error).message);
    // weiter — das nicht-Löschen ist akzeptabel, neuer put kommt mit anderer Extension ggf. dazu
  }

  // Neues Bild speichern, deterministischer Pfad
  const ext = extOf(file.type);
  const path = `${prefix}${ext}`;
  let url: string;
  try {
    const result = await put(path, file, {
      access: 'public',
      addRandomSuffix: false,
      contentType: file.type,
      allowOverwrite: true,
    });
    url = result.url;
  } catch (e) {
    console.error('Vercel Blob put failed', (e as Error).message);
    return j({ error: 'storage_error' }, 502);
  }

  invalidatePhotoCache();

  return j({ ok: true, url });
};
