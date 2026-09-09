/**
 * Einmalige Migration: Wer ist nach der Umstellung öffentlich sichtbar?
 *
 * Bis 09.09.2026 entschied der CRM-Status (nur "aktiv" war öffentlich). Künftig
 * entscheidet ein Kennzeichen im internen Dashboard. Damit die Webseite nach der
 * Umstellung exakt so aussieht wie vorher, bekommen die heute aktiven Makler
 * inSuche=true, alle übrigen false.
 *
 * WICHTIG: vor dem Deploy der neuen öffentlichen Seiten ausführen. Andersherum
 * wäre die Maklersuche zwischenzeitlich leer.
 *
 * Voraussetzung: set -a; . .env; set +a
 *
 *   npx tsx scripts/sichtbarkeit-seed.mjs dry     → zeigt nur, was passieren würde
 *   npx tsx scripts/sichtbarkeit-seed.mjs seed    → schreibt (bricht ab, wenn schon vorhanden)
 *   npx tsx scripts/sichtbarkeit-seed.mjs seed --force  → überschreibt bestehende Kennzeichen
 */
import { fetchUsersByStatus, DASHBOARD_STATUS, STATUS_AKTIV, SYSTEM_ACCOUNT_UIDS } from '../src/lib/vermittler.ts';
import { loadFlags, saveFlags, emptyFlags } from '../src/lib/makler-flags.ts';

const cmd = process.argv[2];
const force = process.argv.includes('--force');
const die = (m) => { console.error('✗ ' + m); process.exit(1); };

if (!['dry', 'seed'].includes(cmd)) die('Befehle: dry | seed [--force]');

const vorhanden = await loadFlags(true);
if (vorhanden.stale) die('Kennzeichen-Datei liefert einen veralteten Stand. Bitte in einer Minute erneut versuchen.');

const anzahlVorhanden = Object.keys(vorhanden.flags).length;
if (anzahlVorhanden > 0 && cmd === 'seed' && !force)
  die(`Es sind bereits ${anzahlVorhanden} Kennzeichen gesetzt. Mit --force überschreiben (setzt Handarbeit zurück!).`);

const users = await fetchUsersByStatus(DASHBOARD_STATUS);
if (users.length === 0) die('Keine Vermittler geladen — CRM nicht erreichbar? Abbruch, damit nichts Leeres geschrieben wird.');

const jetzt = new Date().toISOString();
const neu = emptyFlags();
let sichtbar = 0, unsichtbar = 0;
const zeilen = [];

for (const u of users) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  const status = u.status?.id ?? 0;
  const system = SYSTEM_ACCOUNT_UIDS.has(u.id);
  // Nur die heute Aktiven bleiben sichtbar — das ist exakt der Ist-Zustand der Webseite.
  const inSuche = status === STATUS_AKTIV && !system && !!name;
  neu.flags[String(u.id)] = { inSuche, geaendertAm: jetzt, geaendertVon: 'migration' };
  inSuche ? sichtbar++ : unsichtbar++;
  zeilen.push(`  ${inSuche ? '✅' : '· '} ${String(u.id).padEnd(6)} ${(name || '(ohne Namen)').padEnd(30).slice(0, 30)} Status ${status}${system ? '  [Systemkonto]' : ''}`);
}

console.log(zeilen.join('\n'));
console.log(`\n  ${users.length} Vermittler · ${sichtbar} sichtbar · ${unsichtbar} unsichtbar`);
console.log(`  Bereits vorhandene Kennzeichen: ${anzahlVorhanden}`);

if (cmd === 'dry') {
  console.log('\n(Probelauf — es wurde nichts geschrieben.)');
} else {
  await saveFlags(neu);
  console.log('\n✓ Kennzeichen geschrieben.');
  console.log('  Die Webseite zeigt danach dieselben Makler wie vorher — sofern der Deploy folgt.');
}
