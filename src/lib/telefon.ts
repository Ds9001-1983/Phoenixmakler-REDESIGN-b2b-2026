// Telefonnummern-Aufbereitung.
//
// Im Projekt lag bisher dreimal derselbe Einzeiler für tel:-Links
// (makler-suche.astro, ProfilKontakt.astro, MaklerProfilHero.astro), der nur
// Leer- und Sonderzeichen entfernt. Für WhatsApp reicht das nicht: wa.me und das
// whatsapp://-Protokoll brauchen die internationale Form ohne Plus und ohne Null.

/** Entfernt Leerzeichen und Trennzeichen — für tel:-Links. */
export const telHref = (tel: string): string => tel.replace(/[\s\-/()]/g, '');

/**
 * Wandelt eine deutsche Telefonnummer in die Form, die WhatsApp erwartet:
 * nur Ziffern, mit Ländervorwahl, ohne führende Null und ohne Plus.
 *
 *   "02634 / 659858-1"  → "4926346598581"
 *   "+49 171 1234567"   → "491711234567"
 *   "0049 171 1234567"  → "491711234567"
 *
 * Gibt null zurück, wenn daraus keine plausible Nummer wird — der Aufrufer
 * blendet den Knopf dann aus, statt einen kaputten Link anzubieten.
 */
export function toWaNummer(tel: string | null | undefined, laendervorwahl = '49'): string | null {
  if (!tel) return null;
  let n = tel.trim();

  // Internationale Schreibweisen auf reine Ziffern bringen
  if (n.startsWith('+')) n = n.slice(1);
  n = n.replace(/\D/g, '');
  if (!n) return null;
  if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0')) n = laendervorwahl + n.slice(1);
  else if (!n.startsWith(laendervorwahl)) n = laendervorwahl + n;

  // Eine deutsche Nummer inkl. Vorwahl hat mindestens ~10, höchstens ~15 Stellen.
  if (n.length < 10 || n.length > 15) return null;
  return n;
}

/** Ist die Nummer plausibel eine Mobilnummer? (deutsche Mobilvorwahlen 15x/16x/17x) */
export function istMobil(tel: string | null | undefined): boolean {
  const n = toWaNummer(tel);
  return !!n && /^49(15|16|17)/.test(n);
}
