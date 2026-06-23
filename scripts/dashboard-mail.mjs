/**
 * Bulk-Versand: persönlicher Profil-Link ("Webseiten-Dashboard") an alle aktiven Makler.
 *
 * Nutzt dieselben erprobten Bausteine wie der Einzel-Flow (/api/profil-link-request):
 *   buildProfilToken() + sendProfilEinladung()  →  ein einziger Mail-Text, kein Drift.
 *
 * Voraussetzung: .env mit Prod-Werten sourcen, z.B.:
 *   set -a; . .env; set +a
 * Benötigt: TRIGGER_SECRET, PW_API_BASE, PW_BEARER_TOKEN, SMTP_*, MAIL_FROM,
 *           APP_BASE_URL (muss auf die Produktiv-Domain zeigen!), BLOB_READ_WRITE_TOKEN
 *
 * Aufruf (via tsx):
 *   npx tsx scripts/dashboard-mail.mjs dry            → zeigt alle Empfänger + Link-Vorschau, sendet NICHTS
 *   npx tsx scripts/dashboard-mail.mjs test [email]   → eine Test-Mail (Default: sasse.dennis@googlemail.com)
 *   npx tsx scripts/dashboard-mail.mjs send --yes     → scharfer Versand an alle (ohne --yes nur Vorschau)
 *
 * Schutzmechanismen:
 *   - send bricht ab, wenn die Basis-URL leer/localhost ist (keine kaputten Links in echten Mails).
 *   - Idempotenz-Log scripts/.dashboard-mail-sent.json → bereits versendete uids werden übersprungen
 *     (sicheres Resume nach Abbruch, kein Doppelversand).
 *   - Delay zwischen Mails (MAIL_DELAY_MS, Default 1500 ms) gegen SMTP-Sendelimits.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildProfilToken } from '../src/lib/token.ts';
import { sendProfilEinladung } from '../src/lib/mail.ts';

// --- Konfiguration ---------------------------------------------------------
const SECRET = process.env.TRIGGER_SECRET;
const PW_API_BASE = process.env.PW_API_BASE;
const PW_USER_SLUG = process.env.PW_USER_SLUG || 'me';
const PW_BEARER = process.env.PW_BEARER_TOKEN;
const BASE = (process.env.APP_BASE_URL || process.env.TEST_BASE_URL || '').replace(/\/+$/, '');
const DELAY_MS = Number(process.env.MAIL_DELAY_MS || 1500);
const DEFAULT_TEST_TO = 'sasse.dennis@googlemail.com';
const LOG_PATH = new URL('./.dashboard-mail-sent.json', import.meta.url);

// --- Args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = argv.filter((a) => a.startsWith('--'));
const positional = argv.slice(1).filter((a) => !a.startsWith('--'));
const confirmed = flags.includes('--yes');

const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const firstNameOf = (full) => (full || '').trim().split(/\s+/)[0] || 'Hallo';

// --- Idempotenz-Log --------------------------------------------------------
function loadLog() {
  if (!existsSync(LOG_PATH)) return [];
  try { return JSON.parse(readFileSync(LOG_PATH, 'utf-8')); } catch { return []; }
}
function appendLog(entries, entry) {
  entries.push(entry);
  writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2));
}

// --- CRM: alle aktiven Makler (paginiert) ----------------------------------
async function fetchAllActive() {
  if (!PW_API_BASE || !PW_BEARER) return die('PW_API_BASE / PW_BEARER_TOKEN fehlen (.env sourcen).');
  const perPage = 100;
  const out = [];
  for (let page = 1; page <= 100; page++) {
    const url = `${PW_API_BASE}/api/v1/${PW_USER_SLUG}/users?status_id=1&per_page=${perPage}&page=${page}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${PW_BEARER}`, Accept: 'application/json' } });
    if (!r.ok) return die('PW-Liste fehlgeschlagen (Seite ' + page + '): ' + r.status);
    const j = await r.json();
    const data = j.data ?? [];
    for (const u of data) {
      out.push({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
        email: (u.communication?.email ?? '').trim(),
      });
    }
    if (data.length < perPage) break; // letzte Seite erreicht
  }
  return out;
}

function linkFor(m) {
  const token = buildProfilToken(m.id, null, m.email, m.name, SECRET);
  return `${BASE}/makler-profil?token=${encodeURIComponent(token)}`;
}

// Empfänger-Aufbereitung: gültige Adresse + nicht-leerer Name. Liefert {valid, skipped}.
function partition(makler) {
  const valid = [];
  const skipped = [];
  for (const m of makler) {
    if (!m.name) { skipped.push({ ...m, reason: 'kein Name' }); continue; }
    if (!isEmail(m.email)) { skipped.push({ ...m, reason: 'keine/ungültige E-Mail' }); continue; }
    valid.push(m);
  }
  return { valid, skipped };
}

function requireSecret() { if (!SECRET) die('TRIGGER_SECRET fehlt (.env sourcen).'); }
function requireBase() { if (!BASE) die('APP_BASE_URL/TEST_BASE_URL fehlt (.env sourcen).'); }

// --- Befehl: dry -----------------------------------------------------------
async function dry() {
  requireSecret();
  requireBase();
  const makler = await fetchAllActive();
  const { valid, skipped } = partition(makler);
  const sentLog = loadLog();
  const sentUids = new Set(sentLog.map((e) => e.uid));

  console.log(`\nBasis-URL: ${BASE}`);
  if (/localhost|127\.0\.0\.1/.test(BASE)) console.log('⚠  ACHTUNG: localhost-URL — für echten Versand APP_BASE_URL auf die Produktiv-Domain setzen!');
  console.log(`\n${'UID'.padEnd(8)}${'Status'.padEnd(12)}${'Name'.padEnd(28)}E-Mail`);
  console.log('-'.repeat(80));
  for (const m of valid) {
    const status = sentUids.has(m.id) ? 'schon ges.' : 'offen';
    console.log(`${String(m.id).padEnd(8)}${status.padEnd(12)}${m.name.slice(0, 26).padEnd(28)}${m.email}`);
  }
  console.log('\nBeispiel-Link (erster Empfänger):');
  if (valid[0]) console.log('  ' + linkFor(valid[0]));

  if (skipped.length) {
    console.log(`\nÜbersprungen (${skipped.length}):`);
    for (const s of skipped) console.log(`  uid ${s.id} — ${s.name || '(ohne Name)'} — ${s.reason}`);
  }
  const offen = valid.filter((m) => !sentUids.has(m.id)).length;
  console.log(`\n${makler.length} aktive Makler gesamt · ${valid.length} versandfähig · ${offen} offen · ${valid.length - offen} bereits versendet · ${skipped.length} übersprungen.`);
  console.log('(Dry-Run — es wurde nichts gesendet.)');
}

// --- Befehl: test ----------------------------------------------------------
async function test() {
  requireSecret();
  requireBase();
  const to = positional[0] || DEFAULT_TEST_TO;
  if (!isEmail(to)) return die('Ungültige Test-Adresse: ' + to);
  // Realer Token mit Test-uid 0 (kein echtes Profil) — nur zur Mail-/Link-Sichtprüfung.
  const link = linkFor({ id: 0, name: 'Test Makler', email: to });
  console.log(`\nSende Test-Mail an ${to} …`);
  console.log('Link: ' + link);
  await sendProfilEinladung(to, 'Dennis', link);
  console.log('✓ Test-Mail versendet. Bitte Posteingang + Link prüfen.');
}

// --- Befehl: send ----------------------------------------------------------
async function send() {
  requireSecret();
  requireBase();
  if (/localhost|127\.0\.0\.1/.test(BASE) || !/^https?:\/\//.test(BASE)) {
    return die(`Basis-URL ist '${BASE}'. Für den scharfen Versand muss APP_BASE_URL auf die Produktiv-Domain zeigen (https://www.phoenix-maklerverbund.de). Abbruch.`);
  }
  const makler = await fetchAllActive();
  const { valid, skipped } = partition(makler);
  const sentLog = loadLog();
  const sentUids = new Set(sentLog.map((e) => e.uid));
  const todo = valid.filter((m) => !sentUids.has(m.id));

  console.log(`\nBasis-URL: ${BASE}`);
  console.log(`${makler.length} aktive Makler · ${valid.length} versandfähig · ${todo.length} noch offen · ${valid.length - todo.length} bereits versendet · ${skipped.length} übersprungen.`);

  if (!confirmed) {
    console.log('\n⚠  Vorschau. Es wurde NICHTS gesendet.');
    console.log('   Zum scharfen Versand erneut mit --yes ausführen:');
    console.log('   npx tsx scripts/dashboard-mail.mjs send --yes');
    return;
  }
  if (!todo.length) { console.log('\nNichts zu tun — alle bereits versendet.'); return; }

  console.log(`\n▶ Scharfer Versand an ${todo.length} Makler (Delay ${DELAY_MS} ms) …\n`);
  let ok = 0;
  const errors = [];
  for (let i = 0; i < todo.length; i++) {
    const m = todo[i];
    const prefix = `[${i + 1}/${todo.length}] uid ${m.id} ${m.name} <${m.email}>`;
    try {
      await sendProfilEinladung(m.email, firstNameOf(m.name), linkFor(m));
      appendLog(sentLog, { uid: m.id, email: m.email, sentAt: new Date().toISOString() });
      ok++;
      console.log(`✓ ${prefix}`);
    } catch (e) {
      errors.push({ ...m, error: e.message });
      console.error(`✗ ${prefix} — ${e.message}`);
    }
    if (i < todo.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n── Fertig ──`);
  console.log(`Gesendet: ${ok} · Fehler: ${errors.length} · Übersprungen (kein/ungültiger Empfänger): ${skipped.length}`);
  if (errors.length) {
    console.log('\nFehler:');
    for (const e of errors) console.log(`  uid ${e.id} <${e.email}> — ${e.error}`);
    console.log('Diese Makler sind NICHT im Log → ein erneuter Lauf versucht sie wieder.');
  }
}

// --- Dispatch --------------------------------------------------------------
if (cmd === 'dry') await dry();
else if (cmd === 'test') await test();
else if (cmd === 'send') await send();
else console.log('Usage: dry | test [email] | send --yes');
