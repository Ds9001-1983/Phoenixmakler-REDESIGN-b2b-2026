import type { APIRoute } from 'astro';
import {
  fetchUsersByStatus,
  STATUS_AKTIV,
  STATUS_NEUER_PARTNER,
  SYSTEM_ACCOUNT_UIDS,
  type PwUser,
} from '../../../lib/vermittler';
import { loadState, saveState, type MaklerState } from '../../../lib/makler-state';
import { issueProfilLink } from '../../../lib/profil-link';
import { loadProfilLinkUids } from '../../../lib/pw-userfile';
import { sendInternalNotice } from '../../../lib/mail';

export const prerender = false;

const ENV: Record<string, string | undefined> = import.meta.env as any;

// Mehr als so viele Einladungen in einem Lauf gelten als Unfall (z. B. eine
// Massenumstellung im CRM). Dann wird nichts verschickt, sondern gewarnt.
const MAX_PER_RUN = 10;

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const nameOf = (u: PwUser): string =>
  [u.first_name, u.last_name].filter(Boolean).join(' ').trim();

const emailOf = (u: PwUser): string => (u.communication?.email ?? '').trim();

const RELEVANT = new Set([STATUS_AKTIV, STATUS_NEUER_PARTNER]);

export const GET: APIRoute = async ({ request, url }) => {
  // Vercel-Cron sendet Authorization: Bearer $CRON_SECRET.
  const expected = ENV.CRON_SECRET;
  if (!expected) return j({ error: 'cron_secret_not_configured' }, 500);
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expected}`) return j({ error: 'unauthorized' }, 401);

  // seed = nur Ist-Zustand festschreiben (erster Lauf)
  // dry  = nur berichten, was passieren WÜRDE — kein Versand, kein Zustandsschreiben
  // live = Einladungen versenden
  const mode = (url.searchParams.get('mode') ?? ENV.MAKLER_WATCH_MODE ?? 'seed').toLowerCase();
  const dry = mode === 'dry';
  const seeding = !dry && mode !== 'live';

  const users = await fetchUsersByStatus([STATUS_AKTIV, STATUS_NEUER_PARTNER]);
  if (users.length === 0) {
    // Leere Liste heißt fast immer "CRM nicht erreichbar" — dann darf der
    // Zustand NICHT überschrieben werden, sonst gelten beim nächsten Lauf alle
    // Makler als neu.
    return j({ error: 'crm_unreachable_or_empty', mode }, 503);
  }

  const state: MaklerState = await loadState();
  if (state.stale) {
    // Wir wissen, dass der gelesene Stand veraltet ist. Dann lieber diesen Lauf
    // auslassen — der nächste Cron-Durchlauf holt es nach. Nichts senden,
    // nichts überschreiben.
    return j({ error: 'state_stale', hinweis: 'Lauf übersprungen, kein Versand' }, 503);
  }
  const kandidaten: PwUser[] = [];
  const uebersprungen: { uid: number; name: string; grund: string }[] = [];

  for (const u of users) {
    const key = String(u.id);
    const prev = state.seen[key];
    const status = u.status?.id ?? 0;

    if (!prev) {
      // Erstsichtung ist KEINE Aktivierung: nur festhalten, nichts versenden.
      state.seen[key] = { status };
      continue;
    }

    const wechseltRein = prev.status !== status && RELEVANT.has(status);
    prev.status = status;

    if (!wechseltRein) continue;
    if (prev.linkSentAt) continue; // schon versorgt — z. B. Wechsel 5 → 1
    if (SYSTEM_ACCOUNT_UIDS.has(u.id)) {
      uebersprungen.push({ uid: u.id, name: nameOf(u), grund: 'Systemkonto' });
      continue;
    }
    if (!emailOf(u)) {
      uebersprungen.push({ uid: u.id, name: nameOf(u), grund: 'keine E-Mail' });
      continue;
    }
    if (!nameOf(u)) {
      uebersprungen.push({ uid: u.id, name: `uid ${u.id}`, grund: 'kein Name' });
      continue;
    }
    kandidaten.push(u);
  }

  const bericht: string[] = [];
  let versendet = 0;

  if (dry) {
    bericht.push(
      kandidaten.length
        ? `Probelauf — es WÜRDEN ${kandidaten.length} Einladung(en) rausgehen an: ` +
          kandidaten.map((u) => `${u.id} ${nameOf(u)} <${emailOf(u)}>`).join(', ')
        : 'Probelauf — keine Aktivierung erkannt, es würde nichts versendet.',
    );
  } else if (seeding) {
    bericht.push(`Seed-Lauf: ${users.length} Vermittler festgeschrieben, nichts versendet.`);
    // Auch die Kandidaten nur festhalten, nicht versorgen.
  } else if (kandidaten.length > MAX_PER_RUN) {
    bericht.push(
      `ABBRUCH: ${kandidaten.length} Aktivierungen in einem Lauf (Grenze ${MAX_PER_RUN}). ` +
        `Es wurde nichts versendet. Betroffen: ${kandidaten.map((u) => `${u.id} ${nameOf(u)}`).join(', ')}`,
    );
  } else if (kandidaten.length > 0) {
    // Ein Index-Abruf für alle statt einer Prüfung je Makler.
    const known = await loadProfilLinkUids();
    for (const u of kandidaten) {
      const res = await issueProfilLink(
        { uid: u.id, cid: null, email: emailOf(u), name: nameOf(u) },
        { sendMail: true, writeCrm: true, knownUids: known },
      );
      const entry = state.seen[String(u.id)];
      if (res.mail === 'ok') {
        entry.linkSentAt = new Date().toISOString();
        versendet++;
      }
      if (res.crm === 'created') entry.crmAt = new Date().toISOString();
      bericht.push(`${u.id} ${nameOf(u)} <${emailOf(u)}> — Mail: ${res.mail}, CRM: ${res.crm}`);
    }
  }

  // Im Probelauf bleibt der Zustand unangetastet.
  if (!dry) await saveState(state);

  const zusammenfassung = {
    mode: dry ? 'dry' : seeding ? 'seed' : 'live',
    gesehen: users.length,
    kandidaten: kandidaten.length,
    versendet,
    uebersprungen,
    bericht,
  };

  // Nur melden, wenn tatsächlich etwas passiert ist oder etwas auffällig war.
  const meldenswert = !dry && (versendet > 0 || (!seeding && kandidaten.length > MAX_PER_RUN) || uebersprungen.length > 0);
  const to = ENV.PHOENIX_NOTIFICATION_TO;
  if (meldenswert && to) {
    try {
      await sendInternalNotice(to, `Makler-Status: ${versendet} Einladung(en) versendet`, [
        `Modus: ${zusammenfassung.mode}`,
        `Vermittler geprüft: ${users.length}`,
        `Aktivierungen erkannt: ${kandidaten.length}`,
        `Einladungen versendet: ${versendet}`,
        '',
        ...bericht,
        ...(uebersprungen.length
          ? ['', 'Übersprungen:', ...uebersprungen.map((s) => `  ${s.uid} ${s.name} — ${s.grund}`)]
          : []),
      ]);
    } catch (e) {
      console.error('Makler-Status: Bericht konnte nicht gesendet werden', (e as Error).message);
    }
  }

  return j(zusammenfassung);
};
