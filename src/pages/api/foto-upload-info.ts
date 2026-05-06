import type { APIRoute } from 'astro';
import { verifyToken } from '../../lib/token';

export const prerender = false;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ url }) => {
  const secret = import.meta.env.TRIGGER_SECRET;
  if (!secret) return j({ error: 'server_misconfigured' }, 500);

  const token = url.searchParams.get('token');
  if (!token) return j({ error: 'missing_token' }, 400);

  const payload = verifyToken(token, 'upload', secret);
  if (!payload) return j({ error: 'invalid_or_expired' }, 410);

  return j({ ok: true, email: payload.email });
};
