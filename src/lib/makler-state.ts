// Zustandsspeicher des Status-Wächters.
//
// Hält fest, in welchem PW-Status wir jeden Vermittler zuletzt gesehen haben und
// ob er seinen Profil-Link bereits bekommen hat. Ohne diesen Zustand könnte der
// Wächter einen Statuswechsel nicht von einem Erstkontakt unterscheiden.
//
// Liegt in Vercel Blob, gleiche Ablage wie die Profile (src/lib/profil.ts).

import { put, list, get } from '@vercel/blob';

const PATH = 'makler-status/state.json';

export interface MaklerStateEntry {
  status: number;
  /** ISO-Zeitstempel des Einladungsversands — gesetzt = versorgt, nie erneut senden. */
  linkSentAt?: string;
  /** ISO-Zeitstempel der CRM-Ablage. */
  crmAt?: string;
}

export interface MaklerState {
  v: 1;
  updatedAt?: string;
  seen: Record<string, MaklerStateEntry>;
  /**
   * true = der gelesene Inhalt ist nachweislich älter als die zuletzt
   * gespeicherte Fassung (CDN-Cache). Der Aufrufer darf dann NICHT versenden
   * und den Zustand NICHT überschreiben.
   */
  stale?: boolean;
}

export const emptyState = (): MaklerState => ({ v: 1, seen: {} });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Liest den Zustand.
 *
 * Vercel Blob liefert denselben Pfad über ein CDN aus. Nach einem Überschreiben
 * kann für kurze Zeit noch die alte Fassung zurückkommen — für einen
 * Mailversender wäre das fatal, weil bereits versorgte Makler dann erneut als
 * "neu aktiviert" gelten. Deshalb wird der Inhalt gegen den uploadedAt-Zeitstempel
 * der Ablage geprüft und im Zweifel mit stale=true gemeldet.
 */
export async function loadState(): Promise<MaklerState> {
  for (let versuch = 1; versuch <= 3; versuch++) {
    try {
      const found = await list({ prefix: PATH, limit: 1 });
      const blob = found.blobs.find((b) => b.pathname === PATH);
      if (!blob) return emptyState();

      // Private Blobs sind über ihre URL NICHT per fetch abrufbar — nur über get().
      const stored = await get(blob.url, { access: 'private' });
      if (!stored || stored.statusCode !== 200) return emptyState();
      const parsed = JSON.parse(await new Response(stored.stream).text()) as MaklerState;
      if (!parsed || parsed.v !== 1 || typeof parsed.seen !== 'object') return emptyState();

      const gespeichertAm = new Date(blob.uploadedAt).getTime();
      const inhaltVon = parsed.updatedAt ? new Date(parsed.updatedAt).getTime() : 0;
      // 2 s Toleranz für Uhr-/Rundungsunterschiede zwischen Metadaten und Inhalt.
      if (inhaltVon + 2000 >= gespeichertAm) return parsed;

      console.error(
        `Makler-Status: veralteter Stand gelesen (Inhalt ${parsed.updatedAt}, Ablage ${blob.uploadedAt}) — Versuch ${versuch}/3`,
      );
      if (versuch < 3) await sleep(1500);
      else return { ...parsed, stale: true };
    } catch (e) {
      console.error('Makler-Status: Zustand nicht lesbar', (e as Error).message);
      // Bewusst leerer Zustand — der Wächter behandelt unbekannte Makler als
      // "neu gesehen" und verschickt deshalb nichts. Ein Lesefehler kann also
      // keinen Massenversand auslösen.
      return emptyState();
    }
  }
  return emptyState();
}

export async function saveState(state: MaklerState): Promise<void> {
  if (state.stale) throw new Error('refusing to save a stale state');
  state.updatedAt = new Date().toISOString();
  delete state.stale;
  await put(PATH, JSON.stringify(state), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
    allowOverwrite: true,
    // Ohne das cached Vercel Blob einen MONAT. Für einen Zustandsspeicher ist das
    // fatal: Ein veralteter Stand lässt bereits versorgte Makler erneut als
    // "neu aktiviert" erscheinen und löst einen zweiten Versand aus. 60 s ist das
    // erlaubte Minimum und liegt weit unter dem täglichen Cron-Rhythmus.
    cacheControlMaxAge: 60,
  });
}
