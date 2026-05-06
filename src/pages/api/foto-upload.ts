import type { APIRoute } from 'astro';
import { verifyToken } from '../../lib/token';

export const prerender = false;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  const base = import.meta.env.PW_API_BASE;
  const slug = import.meta.env.PW_USER_SLUG ?? 'me';
  const pwToken = import.meta.env.PW_BEARER_TOKEN;

  if (!secret || !base || !pwToken) return j({ error: 'server_misconfigured' }, 500);

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

  // multipart/form-data zu PW forwarden
  const out = new FormData();
  // PW erwartet einen Filename — falls leer, fallback bauen
  const ext = file.type.split('/')[1] || 'jpg';
  const safeName = (payload.name ?? 'profil').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const filename = file.name && file.name !== 'blob' ? file.name : `profilbild_${safeName}_${payload.uid}.${ext}`;
  out.append('file', file, filename);
  out.append('user_id', String(payload.uid));
  out.append('name', `Profilbild ${payload.name ?? ''}`.trim());
  out.append('document_type_id', '50'); // Sonstiges
  out.append('upload_date', new Date().toISOString().slice(0, 10));

  let pwRes: Response;
  try {
    pwRes = await fetch(`${base}/api/v1/${slug}/users/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pwToken}`,
        Accept: 'application/json',
      },
      body: out,
    });
  } catch (e) {
    console.error('PW user-files fetch failed', e);
    return j({ error: 'crm_unreachable' }, 502);
  }

  if (!pwRes.ok) {
    const detail = await pwRes.text();
    console.error('PW user-files error', pwRes.status, detail.slice(0, 800));
    return j({ error: 'crm_error', status: pwRes.status }, 502);
  }

  return j({ ok: true });
};
