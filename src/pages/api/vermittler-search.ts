import type { APIRoute } from 'astro';
import { loadOeffentlicheVermittler } from '../../lib/vermittler';

export const prerender = false;

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

// Speist die "Empfohlen von"-Liste im öffentlichen Partner-Formular.
//
// ACHTUNG: Dieser Endpunkt ist ohne Anmeldung erreichbar und gibt Maklernamen aus.
// Er MUSS deshalb dieselbe Sichtbarkeitsprüfung haben wie die Maklersuche — sonst
// erscheinen hier Makler namentlich, die bewusst anonym bleiben sollen.
export const GET: APIRoute = async () => {
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return json({ vermittler: cache.list });
  }

  const sichtbare = await loadOeffentlicheVermittler();
  if (sichtbare.length === 0) return json({ vermittler: cache?.list ?? [] });

  const list = sichtbare
    .map((v) => ({ id: v.id, name: v.name }))
    .filter((x) => x.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  cache = { ts: Date.now(), list };
  return json({ vermittler: list });
};
