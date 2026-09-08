// Eine Stelle für "Profil-Link erzeugen, verschicken und im CRM ablegen".
//
// Vorher stand die Zeile `${base}/makler-profil?token=…` viermal im Code
// (profil-link-request, profil-reject, onboarding-trigger, dashboard-mail.mjs).
// Jede Änderung musste an vier Orten nachgezogen werden.

import { buildProfilToken, buildProfilRequestToken, profilTokenExpiry, PROFIL_TTL_DAYS } from './token';
import { sendProfilEinladung } from './mail';
import { createProfilLinkFile, type CreateResult } from './pw-userfile';

const ENV: Record<string, string | undefined> = (import.meta as any).env ?? process.env;

export const appBaseUrl = (): string => (ENV.APP_BASE_URL ?? '').replace(/\/+$/, '');
const secret = (): string => ENV.TRIGGER_SECRET ?? '';

/** Editor-Link mit befristetem Token (PROFIL_TTL_DAYS). Geht per E-Mail raus. */
export function profilEditLink(uid: number, cid: number | null, email: string, name: string): string {
  const t = buildProfilToken(uid, cid, email, name, secret());
  return `${appBaseUrl()}/makler-profil?token=${encodeURIComponent(t)}`;
}

/**
 * Dauerhafter Selbstbedienungs-Link — das, was im CRM hinterlegt wird.
 * Läuft nie ab und ist pro Makler immer identisch (siehe buildProfilRequestToken).
 * Gewährt selbst KEINEN Zugang, sondern löst nur den Versand an die im CRM
 * hinterlegte Adresse aus.
 */
export function profilRequestLink(uid: number): string {
  const t = buildProfilRequestToken(uid, secret());
  return `${appBaseUrl()}/makler-profil?m=${encodeURIComponent(t)}`;
}

export interface IssueTarget {
  uid: number;
  cid?: number | null;
  email: string;
  name: string;
}

export interface IssueResult {
  link: string;
  requestLink: string;
  gueltigBis: Date;
  mail: 'ok' | 'failed' | 'skipped';
  crm: CreateResult | 'skipped';
}

const firstNameOf = (full: string): string => full.trim().split(/\s+/)[0] || 'Hallo';

/**
 * Erzeugt den Link, verschickt die Einladung und legt den dauerhaften Link im CRM ab.
 *
 * Wirft nie. Mail und CRM laufen über Promise.allSettled nebeneinander, damit ein
 * hängendes CRM den Mailversand strukturell nicht aufhalten kann.
 */
export async function issueProfilLink(
  m: IssueTarget,
  opts: { sendMail?: boolean; writeCrm?: boolean; knownUids?: Set<number> | null } = {},
): Promise<IssueResult> {
  const sendMailWanted = opts.sendMail ?? true;
  const writeCrmWanted = opts.writeCrm ?? true;

  const base = appBaseUrl();
  const link = profilEditLink(m.uid, m.cid ?? null, m.email, m.name);
  const requestLink = profilRequestLink(m.uid);
  const gueltigBis = profilTokenExpiry();

  const mailTask = async (): Promise<IssueResult['mail']> => {
    if (!sendMailWanted) return 'skipped';
    if (!m.email) return 'failed';
    // Schutz gegen versehentlichen Versand aus Entwicklungs-/Testumgebungen:
    // Eine leere oder lokale Basis-URL erzeugt Links, die beim Empfänger nutzlos
    // sind. Lieber gar nicht senden. Gleiches Prinzip wie in dashboard-mail.mjs.
    if (!base || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(base)) {
      console.error(`Profil-Einladung an uid ${m.uid} unterdrückt — APP_BASE_URL ist "${base || '(leer)'}"`);
      return 'skipped';
    }
    try {
      await sendProfilEinladung(m.email, firstNameOf(m.name), link, { gueltigBis });
      return 'ok';
    } catch (e) {
      console.error(`Profil-Einladung an uid ${m.uid} fehlgeschlagen`, (e as Error).message);
      return 'failed';
    }
  };

  const crmTask = async (): Promise<IssueResult['crm']> => {
    if (!writeCrmWanted) return 'skipped';
    try {
      return await createProfilLinkFile(m.uid, requestLink, opts.knownUids);
    } catch (e) {
      console.error(`CRM-Ablage für uid ${m.uid} fehlgeschlagen`, (e as Error).message);
      return 'failed';
    }
  };

  const [mailRes, crmRes] = await Promise.allSettled([mailTask(), crmTask()]);

  return {
    link,
    requestLink,
    gueltigBis,
    mail: mailRes.status === 'fulfilled' ? mailRes.value : 'failed',
    crm: crmRes.status === 'fulfilled' ? crmRes.value : 'failed',
  };
}

export { PROFIL_TTL_DAYS };
