import type { APIRoute } from 'astro';
import { getPlzCoords, isPlz } from '../../../lib/plz';

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const plz = String(params.plz ?? '').trim();
  if (!isPlz(plz)) {
    return new Response(JSON.stringify({ error: 'invalid plz' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const coords = getPlzCoords(plz);
  if (!coords) {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ plz, lat: coords[0], lng: coords[1] }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
};
