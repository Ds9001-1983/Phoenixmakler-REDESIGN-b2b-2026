import type { APIRoute } from 'astro';
import { clearSessionCookie, assertSameOrigin } from '../../../lib/team-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!assertSameOrigin(request)) return new Response('Forbidden', { status: 403 });
  clearSessionCookie(cookies);
  return redirect('/intern/login?abgemeldet=1', 303);
};
