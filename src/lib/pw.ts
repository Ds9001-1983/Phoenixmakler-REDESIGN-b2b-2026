// Zentraler Zugriff auf die Professional-Works-API (PW).
//
// Ersetzt die bisher an sechs Stellen duplizierten fetch-Aufrufe. Wichtigster
// Gewinn ist der Timeout: Ohne ihn kann eine hängende CRM-Antwort einen
// Serverless-Request bis zum Plattform-Limit blockieren und damit z. B. den
// Mailversand aufhalten.
//
// Grundregel: pwFetch wirft NIE. Jeder Fehler kommt als PwResult zurück, damit
// nicht-blockierende Aufrufstellen trivial korrekt sind.

// In Astro ist import.meta.env das Laufzeit-env-Objekt, in den .mjs-Skripten
// (via npx tsx) ist es undefined → Fallback auf process.env. Gleiches Muster
// wie in mail.ts, damit Skripte und Endpunkte dieselben Module nutzen können.
const ENV: Record<string, string | undefined> = (import.meta as any).env ?? process.env;

export interface PwConfig {
  base: string;
  slug: string;
  token: string;
}

export function pwConfig(): PwConfig | null {
  const base = ENV.PW_API_BASE;
  const token = ENV.PW_BEARER_TOKEN;
  const slug = ENV.PW_USER_SLUG ?? 'me';
  if (!base || !token) return null;
  return { base: base.replace(/\/+$/, ''), slug, token };
}

export type PwError = 'unconfigured' | 'network' | 'timeout' | 'forbidden' | 'http';

export type PwResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: PwError; abilities?: string[]; detail?: string };

export type PwQuery = Record<string, string | number | boolean | undefined | (string | number)[]>;

export interface PwInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: PwQuery;
  timeoutMs?: number;
}

const buildQuery = (q?: PwQuery): string => {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const item of v) p.append(`${k}[]`, String(item));
    else p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

/**
 * Ruft einen PW-Endpunkt auf. `path` ohne Präfix, z. B. 'users/files'.
 */
export async function pwFetch<T = unknown>(path: string, init: PwInit = {}): Promise<PwResult<T>> {
  const cfg = pwConfig();
  if (!cfg) return { ok: false, status: 0, error: 'unconfigured' };

  const url = `${cfg.base}/api/v1/${cfg.slug}/${path.replace(/^\/+/, '')}${buildQuery(init.query)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/json',
  };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 4000),
    });
  } catch (e) {
    const name = (e as Error).name;
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    console.error(`PW ${init.method ?? 'GET'} ${path} ${timedOut ? 'timeout' : 'unreachable'}`, (e as Error).message);
    return { ok: false, status: 0, error: timedOut ? 'timeout' : 'network' };
  }

  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    /* kein JSON — parsed bleibt null */
  }

  if (!res.ok) {
    // Laravel/Sanctum meldet fehlende Token-Rechte als 403 mit context.abilities.
    // Die Namen durchreichen, damit Logs und Skripte sofort zeigen, was fehlt.
    const abilities: string[] | undefined = parsed?.context?.abilities;
    // Secrets tauchen in PW-Fehlern nicht auf; trotzdem kürzen wir den Body.
    const detail = (parsed?.message ?? raw ?? '').toString().slice(0, 400);
    if (res.status === 403 && abilities?.length) {
      console.error(`PW ${path}: Token fehlt Recht(e): ${abilities.join(', ')}`);
      return { ok: false, status: res.status, error: 'forbidden', abilities, detail };
    }
    console.error(`PW ${init.method ?? 'GET'} ${path} → ${res.status}`, detail);
    return { ok: false, status: res.status, error: 'http', detail };
  }

  return { ok: true, status: res.status, data: parsed as T };
}

interface PwList<T> {
  data?: T[];
  meta?: { current_page?: number; last_page?: number; total?: number };
}

/**
 * Holt ALLE Seiten einer Listen-Ressource. Der reguläre per_page-Aufruf ohne
 * Paginierung war bisher eine stille Fehlerquelle: Ab 100 Datensätzen fielen
 * Einträge kommentarlos weg.
 *
 * Gibt bei Fehlern die bis dahin gesammelten Einträge zurück (nie null), damit
 * Aufrufer nicht gesondert behandeln müssen — wer Fehler unterscheiden muss,
 * nutzt pwFetch direkt.
 */
export async function pwFetchAll<T = unknown>(
  path: string,
  query: PwQuery = {},
  maxPages = 50,
): Promise<T[]> {
  const perPage = Number(query.per_page ?? 100);
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await pwFetch<PwList<T>>(path, {
      query: { ...query, per_page: perPage, page },
      timeoutMs: 8000,
    });
    if (!r.ok) {
      if (page === 1) return [];
      console.error(`PW ${path}: Abbruch der Paginierung auf Seite ${page}`);
      break;
    }
    const batch = r.data?.data ?? [];
    out.push(...batch);
    const last = r.data?.meta?.last_page;
    if (typeof last === 'number' ? page >= last : batch.length < perPage) break;
    if (page === maxPages) console.error(`PW ${path}: maxPages (${maxPages}) erreicht — Liste evtl. unvollständig`);
  }
  return out;
}
