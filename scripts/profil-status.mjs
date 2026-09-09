/**
 * Read-only-Status der Makler-Self-Service-Profile.
 * Listet ALLE makler-profile/*.json mit Füllstand + Moderationslage.
 * Nutzt den produktiven Lese-Pfad (loadAllProfiles) für private Blobs.
 *
 *   set -a; . /tmp/phoenix.env.pull; set +a   # BLOB_READ_WRITE_TOKEN
 *   npx tsx scripts/profil-status.mjs
 */
import { loadAllProfiles } from '../src/lib/profil.ts';

const rows = await loadAllProfiles();
if (!rows.length) {
  console.log('Keine gespeicherten Profile gefunden (oder alle nicht lesbar).');
  process.exit(0);
}
rows.sort((a, b) => (a.uid ?? 0) - (b.uid ?? 0));

const fields = (p) => ({
  headlineOk: !!(p.headline && p.headline.trim()),
  bioLen: (p.bio || '').trim().length,
  skills: (p.skills || []).length,
  quali: (p.qualifikationen || []).length,
  zeiten: (p.buerozeiten || []).length,
  fokus: p.fokus?.aktiv ? (p.fokus.wert || '(leer)') : '–',
  kontakt: Object.keys(p.kontakt || {}).filter((k) => p.kontakt[k]).join(', '),
});

for (const p of rows) {
  const f = fields(p);
  const ausgefuellt = f.headlineOk && f.bioLen > 0;
  console.log('═'.repeat(64));
  console.log(`UID ${p.uid}   slug: ${p.slug}   ${ausgefuellt ? '✅ AUSGEFÜLLT' : '⚠️ unvollständig'}`);
  console.log(`  published:    ${p.published}   everApproved: ${p.everApproved}`);
  console.log(`  eingereicht:  ${p.eingereichtAm || '–'}`);
  console.log(`  freigegeben:  ${p.freigegebenAm || '–'}`);
  console.log(`  aktualisiert: ${p.aktualisiertAm || '–'}`);
  console.log(`  Headline:     ${f.headlineOk ? '✓ "' + p.headline + '"' : '✗ leer'}`);
  console.log(`  Bio:          ${f.bioLen ? '✓ ' + f.bioLen + ' Zeichen' : '✗ leer'}`);
  console.log(`  Skills:       ${f.skills}   Qualifikationen: ${f.quali}   Bürozeiten: ${f.zeiten}`);
  console.log(`  Fokus:        ${f.fokus}`);
  console.log(`  Kontakt:      ${f.kontakt || '–'}`);
}
console.log('═'.repeat(64));
console.log(`\nGesamt: ${rows.length} gespeicherte Profil(e).`);
