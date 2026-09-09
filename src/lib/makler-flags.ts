// Wer erscheint öffentlich auf der Webseite?
//
// Bis 09.09.2026 hing das allein am CRM-Status (nur "aktiv" war öffentlich).
// Auf Wunsch von Phoenix trifft diese Entscheidung jetzt das interne Dashboard:
// Im CRM soll künftig nur noch zwischen aktiv und storniert unterschieden werden,
// die Sichtbarkeit steuert dieses Kennzeichen.
//
// BEWUSST eine eigene Blob-Datei, getrennt von makler-status/state.json: Jene
// schreibt der Status-Wächter im Cron. Ein Schalter, den jemand im Dashboard
// umlegt, darf nicht von einem Wächterlauf überschrieben werden können.
//
// Ein Makler OHNE Eintrag gilt als NICHT sichtbar. Das ist die sichere Richtung:
// Stellt Phoenix seine passiven Makler im CRM auf "aktiv" um, werden sie dadurch
// nicht versehentlich öffentlich.

import { put, list, get } from '@vercel/blob';

const PATH = 'makler-flags/state.json';

export interface MaklerFlag {
  /** Erscheint der Makler in der öffentlichen Maklersuche? */
  inSuche: boolean;
  geaendertAm: string;
  /** E-Mail des Teammitglieds, das zuletzt umgeschaltet hat. */
  geaendertVon: string;
}

export interface MaklerFlags {
  v: 1;
  updatedAt?: string;
  flags: Record<string, MaklerFlag>;
  /** true = gelesener Inhalt ist nachweislich veraltet, nicht schreiben. */
  stale?: boolean;
}

export const emptyFlags = (): MaklerFlags => ({ v: 1, flags: {} });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// In-Memory-Cache pro Lambda-Instanz. Die öffentlichen Seiten fragen die Flags bei
// jedem Aufruf ab — ohne Cache wäre das ein Blob-Read pro Seitenaufruf.
let cache: { ts: number; data: MaklerFlags } | null = null;
const TTL_MS = 60 * 1000;

export const invalidateFlagCache = (): void => {
  cache = null;
};

/**
 * Liest die Kennzeichen. Prüft dabei, ob der ausgelieferte Inhalt zum
 * uploadedAt-Zeitstempel passt — Vercel Blob liefert nach einem Überschreiben
 * kurzzeitig noch die alte Fassung aus (dasselbe Problem wie in makler-state.ts).
 */
export async function loadFlags(force = false): Promise<MaklerFlags> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.data;

  for (let versuch = 1; versuch <= 3; versuch++) {
    try {
      const found = await list({ prefix: PATH, limit: 1 });
      const blob = found.blobs.find((b) => b.pathname === PATH);
      if (!blob) {
        const leer = emptyFlags();
        cache = { ts: Date.now(), data: leer };
        return leer;
      }

      // Private Blobs sind über ihre URL nicht per fetch lesbar — nur über get().
      const stored = await get(blob.url, { access: 'private' });
      if (!stored || stored.statusCode !== 200) return emptyFlags();
      const parsed = JSON.parse(await new Response(stored.stream).text()) as MaklerFlags;
      if (!parsed || parsed.v !== 1 || typeof parsed.flags !== 'object') return emptyFlags();

      const gespeichertAm = new Date(blob.uploadedAt).getTime();
      const inhaltVon = parsed.updatedAt ? new Date(parsed.updatedAt).getTime() : 0;
      if (inhaltVon + 2000 >= gespeichertAm) {
        cache = { ts: Date.now(), data: parsed };
        return parsed;
      }

      console.error(
        `Makler-Flags: veralteter Stand (Inhalt ${parsed.updatedAt}, Ablage ${blob.uploadedAt}) — Versuch ${versuch}/3`,
      );
      if (versuch < 3) await sleep(1500);
      else return { ...parsed, stale: true };
    } catch (e) {
      console.error('Makler-Flags nicht lesbar', (e as Error).message);
      // Leere Kennzeichen heißt "niemand sichtbar" — im Zweifel lieber zu wenig
      // zeigen als Daten von Maklern, die anonym bleiben müssen.
      return emptyFlags();
    }
  }
  return emptyFlags();
}

export async function saveFlags(state: MaklerFlags): Promise<void> {
  if (state.stale) throw new Error('refusing to save stale flags');
  state.updatedAt = new Date().toISOString();
  delete state.stale;
  await put(PATH, JSON.stringify(state), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
    allowOverwrite: true,
    // Ohne das cached Vercel Blob einen Monat.
    cacheControlMaxAge: 60,
  });
  // Den soeben geschriebenen Stand direkt in den Speicher legen, NICHT nur den Cache
  // leeren: Vercel Blob liefert nach einem Überschreiben für kurze Zeit noch die alte
  // Fassung aus. Ein anschließendes Lesen holte sonst genau diesen alten Stand und die
  // Oberfläche hinkte einen Schritt hinterher.
  cache = { ts: Date.now(), data: state };
}

/** Menge der uids, die öffentlich erscheinen dürfen. */
export async function sichtbareUids(): Promise<Set<number>> {
  const s = await loadFlags();
  if (s.stale) console.error('Makler-Flags: Sichtbarkeit aus veraltetem Stand gelesen');
  const out = new Set<number>();
  for (const [uid, f] of Object.entries(s.flags)) if (f.inSuche) out.add(Number(uid));
  return out;
}

export async function istSichtbar(uid: number): Promise<boolean> {
  return (await sichtbareUids()).has(uid);
}

/**
 * Schaltet einen einzelnen Makler um. Liest bewusst frisch (force), damit nicht
 * ein gecachter Stand die Änderungen anderer überschreibt.
 */
export async function setSichtbar(
  uid: number,
  inSuche: boolean,
  geaendertVon: string,
): Promise<'ok' | 'stale'> {
  const s = await loadFlags(true);
  if (s.stale) return 'stale';
  s.flags[String(uid)] = { inSuche, geaendertAm: new Date().toISOString(), geaendertVon };
  await saveFlags(s);
  return 'ok';
}
