// Ablage des dauerhaften Profil-Links in der PW-Vermittlerakte (Reiter "Dokumente").
//
// Endpunkt laut PW-OpenAPI (https://api.professional.works/api/v1/openapi):
//   POST /api/v1/{pw_user}/users/files/url
//     Pflicht:  file_url, user_id
//     Optional: name, document_type_id (Default 50 "Sonstiges"), upload_date
//
// WICHTIG — die Ressource kennt nur GET und POST. Es gibt kein PUT und kein
// DELETE (anders als clients/files). Ein einmal geschriebener Eintrag ist
// dauerhaft und per API nicht mehr korrigierbar. Daraus folgen zwei Regeln:
//   1. Es wird ein DAUERHAFTER Link abgelegt (kind 'profil-request'), nie der
//      flüchtige 14-Tage-Editor-Token.
//   2. Vor jedem Schreiben wird der Bestand geprüft. Ist der Bestand nicht
//      lesbar, wird NICHT geschrieben — lieber nichts als eine Dublette.

import { pwFetch, pwFetchAll } from './pw';

const ENV: Record<string, string | undefined> = (import.meta as any).env ?? process.env;

/** Name des Eintrags in der Vermittlerakte. Dient zugleich als Wiedererkennungsmerkmal. */
export const PROFIL_LINK_NAME = 'Profil-Link (Selbstbedienung)';
/** Teilstring für die Bestandssuche (GET users/files?name=… ist eine Teilsuche). */
const PROFIL_LINK_SEARCH = 'Profil-Link';

export const linkFileEnabled = (): boolean => ENV.PW_LINK_FILE_ENABLED === '1';
const documentTypeId = (): number => Number(ENV.PW_LINK_DOCUMENT_TYPE_ID ?? 50);

interface PwUserFile {
  id: number;
  name?: string | null;
  user_id?: number | null;
  user?: { id?: number } | null;
}

const uidOf = (f: PwUserFile): number | null => f.user_id ?? f.user?.id ?? null;

export type CreateResult = 'created' | 'exists' | 'failed' | 'forbidden' | 'disabled';

/**
 * Menge der uids, die bereits einen Profil-Link-Eintrag haben.
 *
 * Rückgabe `null` bedeutet ausdrücklich "Bestand unbekannt" (z. B. fehlendes
 * Recht user-file:viewAny). Aufrufer MÜSSEN dann das Schreiben unterlassen,
 * sonst entstehen nicht mehr entfernbare Dubletten.
 */
export async function loadProfilLinkUids(): Promise<Set<number> | null> {
  if (!linkFileEnabled()) return null;
  const probe = await pwFetch<{ data?: PwUserFile[] }>('users/files', {
    query: { name: PROFIL_LINK_SEARCH, per_page: 1 },
    timeoutMs: 8000,
  });
  if (!probe.ok) return null;

  const files = await pwFetchAll<PwUserFile>('users/files', { name: PROFIL_LINK_SEARCH });
  const set = new Set<number>();
  for (const f of files) {
    const uid = uidOf(f);
    if (uid) set.add(uid);
  }
  return set;
}

/**
 * Prüft für EINEN Makler, ob bereits ein Eintrag existiert.
 * Für Einzelaufrufe deutlich günstiger als der komplette Index.
 * `null` = nicht feststellbar → Aufrufer darf nicht schreiben.
 */
export async function profilLinkExistsFor(uid: number): Promise<boolean | null> {
  const r = await pwFetch<{ data?: PwUserFile[] }>('users/files', {
    query: { user_ids: [uid], name: PROFIL_LINK_SEARCH, per_page: 5 },
    timeoutMs: 8000,
  });
  if (!r.ok) return null;
  return (r.data?.data ?? []).some((f) => uidOf(f) === uid);
}

/**
 * Legt den Profil-Link in der Vermittlerakte ab.
 *
 * `known`  = Menge aus loadProfilLinkUids() (Massenlauf, ein Index-Abruf für alle)
 * `null`   = Bestand ausdrücklich unbekannt → es wird NICHT geschrieben
 * fehlend  = Einzelaufruf, es wird gezielt für diese uid nachgesehen
 */
export async function createProfilLinkFile(
  uid: number,
  fileUrl: string,
  known?: Set<number> | null,
): Promise<CreateResult> {
  if (!linkFileEnabled()) return 'disabled';
  if (known === null) return 'disabled';
  if (known === undefined) {
    const exists = await profilLinkExistsFor(uid);
    // Bestand nicht lesbar → lieber nichts schreiben als eine Dublette anlegen,
    // die per API nicht mehr entfernt werden kann.
    if (exists === null) return 'disabled';
    if (exists) return 'exists';
  } else if (known.has(uid)) {
    return 'exists';
  }

  const heute = new Date().toISOString().slice(0, 10);
  const r = await pwFetch('users/files/url', {
    method: 'POST',
    timeoutMs: 8000,
    body: {
      user_id: uid,
      file_url: fileUrl,
      name: PROFIL_LINK_NAME,
      document_type_id: documentTypeId(),
      upload_date: heute,
    },
  });

  if (r.ok) {
    known?.add(uid);
    return 'created';
  }
  if (r.error === 'forbidden') return 'forbidden';
  return 'failed';
}
