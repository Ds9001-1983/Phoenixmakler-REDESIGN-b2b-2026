/**
 * Test-Helfer für die Makler-Self-Service-Strecke (NUR lokal/Test).
 *
 * Voraussetzung: .env mit TRIGGER_SECRET, PW_*, BLOB_READ_WRITE_TOKEN sourcen, z.B.:
 *   set -a; . .env; set +a
 *
 * Aufruf (via tsx):
 *   npx tsx scripts/profil-test.mjs list                 → aktive Makler (uid, Name, Foto?)
 *   npx tsx scripts/profil-test.mjs link <uid> [email] [name]
 *        → erzeugt Editor-Link (Makler) + Vorschau-/Freigabe-Link (Phoenix)
 *   npx tsx scripts/profil-test.mjs cleanup <uid>        → löscht Test-Profil aus dem Blob
 *
 * Basis-URL der Links steuerbar über TEST_BASE_URL (Default: http://localhost:4321).
 */
import { buildProfilToken, buildProfilAdminToken } from '../src/lib/token.ts';
import { list, del } from '@vercel/blob';

const SECRET = process.env.TRIGGER_SECRET;
const BASE = (process.env.TEST_BASE_URL || 'http://localhost:4321').replace(/\/+$/, '');
const PW_API_BASE = process.env.PW_API_BASE;
const PW_USER_SLUG = process.env.PW_USER_SLUG || 'me';
const PW_BEARER = process.env.PW_BEARER_TOKEN;

const [cmd, uid, email, name] = process.argv.slice(2);

const die = (m) => { console.error('✗ ' + m); process.exit(1); };

async function photoUids() {
  const set = new Set();
  try {
    const res = await list({ prefix: 'vermittler/' });
    for (const b of res.blobs) { const m = b.pathname.match(/^vermittler\/(\d+)\./); if (m) set.add(Number(m[1])); }
  } catch (e) { console.error('(Foto-Lookup übersprungen: ' + e.message + ')'); }
  return set;
}

async function listMakler() {
  if (!PW_API_BASE || !PW_BEARER) return die('PW_API_BASE / PW_BEARER_TOKEN fehlen (.env sourcen).');
  const r = await fetch(`${PW_API_BASE}/api/v1/${PW_USER_SLUG}/users?status_id=1&per_page=100`, {
    headers: { Authorization: `Bearer ${PW_BEARER}`, Accept: 'application/json' },
  });
  if (!r.ok) return die('PW-Liste fehlgeschlagen: ' + r.status);
  const j = await r.json();
  const users = j.data ?? [];
  const photos = await photoUids();
  console.log('\nUID\tFoto\tName\tE-Mail');
  console.log('---\t----\t----\t------');
  for (const u of users) {
    const nm = [u.first_name, u.last_name].filter(Boolean).join(' ');
    const em = u.communication?.email ?? '';
    console.log(`${u.id}\t${photos.has(u.id) ? 'JA' : 'nein'}\t${nm}\t${em}`);
  }
  console.log(`\n${users.length} aktive Makler. Für den Test am besten eine Zeile mit Foto=nein wählen.`);
}

function makeLinks() {
  if (!SECRET) return die('TRIGGER_SECRET fehlt (.env sourcen).');
  if (!uid) return die('uid fehlt: link <uid> [email] [name]');
  const e = email || 'test@example.de';
  const n = name || 'Test Makler';
  const pt = buildProfilToken(Number(uid), null, e, n, SECRET);
  const at = buildProfilAdminToken(Number(uid), null, e, n, SECRET);
  console.log('\n① EDITOR (das, was der Makler nach Klick auf den Mail-Link sieht):');
  console.log(`   ${BASE}/makler-profil?token=${encodeURIComponent(pt)}`);
  console.log('\n② VORSCHAU & FREIGABE (das, was Phoenix in der Review-Mail klickt):');
  console.log(`   ${BASE}/makler-freigabe?token=${encodeURIComponent(at)}`);
  console.log('   → zeigt die Profil-Vorschau; rechts „Freigeben" / „Zurückwerfen" (bzw. „Offline nehmen", wenn bereits live).');
  console.log('\nAblauf: ① ausfüllen & speichern → ② Vorschau öffnen & freigeben → dann /makler/<slug> aufrufen.');
}

async function cleanup() {
  if (!uid) return die('uid fehlt: cleanup <uid>');
  const res = await list({ prefix: `makler-profile/${uid}.json` });
  if (!res.blobs.length) { console.log('Nichts zu löschen für uid ' + uid + '.'); return; }
  for (const b of res.blobs) { await del(b.url); console.log('gelöscht: ' + b.pathname); }
}

if (cmd === 'list') await listMakler();
else if (cmd === 'link') makeLinks();
else if (cmd === 'cleanup') await cleanup();
else console.log('Usage: list | link <uid> [email] [name] | cleanup <uid>');
