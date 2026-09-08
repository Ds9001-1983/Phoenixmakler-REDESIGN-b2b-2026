/**
 * Trägt den dauerhaften Profil-Link aller Bestandsmakler in die PW-Vermittlerakte ein.
 *
 * Verschickt KEINE Mails. Legt ausschließlich den Eintrag
 * "Profil-Link (Selbstbedienung)" unter Stammdaten → Dokumente an.
 *
 * Voraussetzung: .env mit Prod-Werten sourcen:
 *   set -a; . .env; set +a
 * Benötigt: TRIGGER_SECRET, PW_API_BASE, PW_BEARER_TOKEN, APP_BASE_URL (Produktiv-Domain!),
 *           PW_LINK_FILE_ENABLED=1, ggf. PW_LINK_DOCUMENT_TYPE_ID
 *
 * Aufruf (via tsx):
 *   npx tsx scripts/profil-crm-sync.mjs dry               → zeigt alle Makler + geplante URL, schreibt NICHTS
 *   npx tsx scripts/profil-crm-sync.mjs probe --uid 27417 → legt GENAU EINEN Eintrag an (Schema-Test)
 *   npx tsx scripts/profil-crm-sync.mjs sync --yes        → legt fehlende Einträge an
 *        zusätzlich: --only 27417,27419   --limit 5
 *
 * WICHTIG: Die PW-API kann Benutzer-Dateien nur ANLEGEN. Es gibt kein Ändern und
 * kein Löschen. Ein falscher Eintrag bleibt dauerhaft in der Akte stehen —
 * deshalb erst `probe` gegen einen Test-Makler, prüfen lassen, dann `sync`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadEditorBerechtigte, SYSTEM_ACCOUNT_UIDS } from '../src/lib/vermittler.ts';
import { loadProfilLinkUids, createProfilLinkFile, linkFileEnabled, PROFIL_LINK_NAME } from '../src/lib/pw-userfile.ts';
import { profilRequestLink } from '../src/lib/profil-link.ts';

const BASE = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
const LOG_PATH = new URL('./.profil-crm-sync.json', import.meta.url);

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = argv.filter((a) => a.startsWith('--'));
const confirmed = flags.includes('--yes');
const valOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const onlyList = (valOf('--only') || '').split(',').map((s) => Number(s.trim())).filter(Boolean);
const limit = Number(valOf('--limit') || 0);

const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readLog = () => {
  if (!existsSync(LOG_PATH)) return { entries: {} };
  try { return JSON.parse(readFileSync(LOG_PATH, 'utf-8')); } catch { return { entries: {} }; }
};
const writeLog = (log) => writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));

// --- Vorprüfungen ----------------------------------------------------------
const guardBase = () => {
  if (!BASE) die('APP_BASE_URL ist leer. Der Eintrag landet dauerhaft im CRM — ohne gültige Domain wäre er wertlos.');
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(BASE))
    die(`APP_BASE_URL zeigt auf "${BASE}". Ein localhost-Link ist im CRM dauerhaft und nicht löschbar.`);
};

const kandidaten = async () => {
  const alle = await loadEditorBerechtigte();
  const raus = [];
  const rein = [];
  for (const m of alle) {
    if (SYSTEM_ACCOUNT_UIDS.has(m.id)) { raus.push([m, 'Systemkonto']); continue; }
    if (!m.name) { raus.push([m, 'kein Name']); continue; }
    if (onlyList.length && !onlyList.includes(m.id)) continue;
    rein.push(m);
  }
  return { rein: limit > 0 ? rein.slice(0, limit) : rein, raus };
};

// --- Befehle ---------------------------------------------------------------
const dry = async () => {
  guardBase();
  const { rein, raus } = await kandidaten();
  const known = await loadProfilLinkUids();
  console.log(`Basis-URL   : ${BASE}`);
  console.log(`Schreibpfad : ${linkFileEnabled() ? 'aktiv (PW_LINK_FILE_ENABLED=1)' : 'AUS (PW_LINK_FILE_ENABLED != 1)'}`);
  console.log(`Bestand     : ${known === null ? 'NICHT LESBAR — sync würde nichts schreiben' : known.size + ' Einträge vorhanden'}`);
  console.log(`Eintragsname: ${PROFIL_LINK_NAME}\n`);
  let neu = 0, da = 0;
  for (const m of rein) {
    const vorhanden = known?.has(m.id) ?? false;
    if (vorhanden) da++; else neu++;
    console.log(`  ${vorhanden ? '·' : '+'} ${String(m.id).padEnd(6)} ${m.name.padEnd(30).slice(0,30)} ${vorhanden ? 'vorhanden' : 'neu'}`);
  }
  console.log(`\n  ${rein.length} Makler — ${neu} neu, ${da} vorhanden`);
  if (raus.length) {
    console.log('\n  Übersprungen:');
    for (const [m, grund] of raus) console.log(`    ${String(m.id).padEnd(6)} ${m.name || '(ohne Namen)'} — ${grund}`);
  }
  console.log(`\n  Beispiel-URL: ${profilRequestLink(rein[0]?.id ?? 0)}`);
};

const run = async (nurEine) => {
  guardBase();
  if (!linkFileEnabled()) die('PW_LINK_FILE_ENABLED ist nicht 1 — der Schreibpfad ist abgeschaltet.');

  const known = await loadProfilLinkUids();
  if (known === null)
    die('Bestand nicht lesbar (fehlt dem Token user-file:viewAny?). Ohne Bestandsprüfung wird nicht geschrieben — Dubletten wären nicht mehr entfernbar.');

  let { rein } = await kandidaten();
  if (nurEine) {
    const uid = Number(valOf('--uid'));
    if (!uid) die('probe braucht --uid <Vermittler-ID>');
    rein = rein.filter((m) => m.id === uid);
    if (!rein.length) die(`uid ${uid} ist kein editierbarer Makler.`);
  } else if (!confirmed) {
    die('Ohne --yes wird nichts geschrieben. Erst `dry` prüfen.');
  }

  const log = readLog();
  let erstellt = 0, vorhanden = 0, fehler = 0;
  for (const m of rein) {
    const url = profilRequestLink(m.id);
    const res = await createProfilLinkFile(m.id, url, known);
    if (res === 'created') {
      erstellt++;
      log.entries[m.id] = { name: m.name, url, at: new Date().toISOString() };
      writeLog(log);
    } else if (res === 'exists') vorhanden++;
    else fehler++;
    console.log(`  ${String(m.id).padEnd(6)} ${m.name.padEnd(28).slice(0,28)} → ${res}`);
    if (res === 'forbidden') die('Token fehlen die Rechte (user-file:create) — Abbruch.');
    await sleep(250);
  }
  console.log(`\n  erstellt: ${erstellt} · bereits vorhanden: ${vorhanden} · fehlgeschlagen: ${fehler}`);
};

if (cmd === 'dry') await dry();
else if (cmd === 'probe') await run(true);
else if (cmd === 'sync') await run(false);
else {
  console.log('Befehle: dry | probe --uid <n> | sync --yes [--only a,b] [--limit n]');
  process.exit(1);
}
