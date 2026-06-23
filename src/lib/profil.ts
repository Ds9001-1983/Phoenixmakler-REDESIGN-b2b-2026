// Self-Service-Makler-Profile.
// Speicherung als JSON in Vercel Blob unter makler-profile/{uid}.json — analog zum
// Foto-Pattern (vermittler/{uid}.{ext}). Das PW-CRM bleibt unangetastet die Quelle für
// Identität/Kontakt (loadVermittler); diese JSON ist eine rein additive Redaktionsschicht.

import { list, get, put } from '@vercel/blob';

export const PROFIL_SCHEMA_VERSION = 1;

const PREFIX = 'makler-profile/';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type Wochentag = 'Mo' | 'Di' | 'Mi' | 'Do' | 'Fr' | 'Sa' | 'So';
export const WOCHENTAGE: Wochentag[] = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export interface Buerozeit {
  tag: Wochentag;
  von: string; // "HH:MM"
  bis: string; // "HH:MM"
}

export interface ProfilKontakt {
  telefon?: string;
  email?: string;
  website?: string;
}

// Vom Makler editierbare Inhalte (ohne Moderations-/Verwaltungsfelder).
export interface ProfilContent {
  headline: string;
  bio: string;
  skills: string[];
  qualifikationen: string[];
  buerozeiten: Buerozeit[];
  fokus: { aktiv: boolean; wert: string };
  // Hinweis: Das frühere Freitext-Feld „rechtliches" wurde entfernt. Das optionale
  // Property bleibt nur für die abwärtskompatible Deserialisierung von Altdaten
  // erhalten — es wird nicht mehr geschrieben oder angezeigt.
  rechtliches?: string;
  kontakt?: ProfilKontakt;
}

export interface MaklerProfil extends ProfilContent {
  v: number;
  uid: number;
  slug: string;

  // Moderation („Erstfreigabe, dann frei")
  published: boolean;
  everApproved: boolean;
  eingereichtAm?: string;
  freigegebenAm?: string;
  aktualisiertAm: string;
}

// ---------------------------------------------------------------------------
// Limits (Single Source of Truth für Validierung + Editor-Hinweise)
// ---------------------------------------------------------------------------

export const LIMITS = {
  headline: 80,
  bio: 1500,
  // len großzügig: Schwerpunkte/Qualifikationen dürfen kurze Sätze tragen, ohne dass
  // validateProfil sie still per slice() kürzt (Pills brechen mehrzeilig um, s. ProfilSkills).
  skills: { count: 12, len: 200 },
  qualifikationen: { count: 12, len: 220 },
  buerozeiten: 7,
  fokusWert: 60,
  telefon: 40,
  email: 120,
  website: 200,
} as const;

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

export function slugify(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Kollisionsfreier Slug: andere Profile (fremde uid) dürfen den Slug nicht belegen.
function uniqueSlug(base: string, uid: number, all: MaklerProfil[]): string {
  const fallback = base || `makler-${uid}`;
  const taken = new Set(all.filter((p) => p.uid !== uid).map((p) => p.slug));
  if (!taken.has(fallback)) return fallback;
  let i = 2;
  while (taken.has(`${fallback}-${i}`)) i++;
  return `${fallback}-${i}`;
}

// ---------------------------------------------------------------------------
// Cache (analog vermittler.ts — pro Lambda-Instanz)
// ---------------------------------------------------------------------------

let allCache: { ts: number; list: MaklerProfil[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

export const invalidateProfilCache = (): void => {
  allCache = null;
};

// ---------------------------------------------------------------------------
// Blob-Lesen
// ---------------------------------------------------------------------------

const readJsonBlob = async (blobUrl: string): Promise<MaklerProfil | null> => {
  try {
    const blob = await get(blobUrl, { access: 'private' });
    if (!blob || blob.statusCode !== 200) return null;
    const text = await new Response(blob.stream).text();
    const parsed = JSON.parse(text) as MaklerProfil;
    if (!parsed || typeof parsed.uid !== 'number') return null;
    return parsed;
  } catch (e) {
    console.error('profil blob read failed', (e as Error).message);
    return null;
  }
};

export async function loadProfilByUid(uid: number): Promise<MaklerProfil | null> {
  if (!uid || Number.isNaN(uid)) return null;
  try {
    const result = await list({ prefix: `${PREFIX}${uid}.json` });
    const url = result.blobs[0]?.url ?? null;
    if (!url) return null;
    return await readJsonBlob(url);
  } catch (e) {
    console.error('loadProfilByUid failed', (e as Error).message);
    return null;
  }
}

export async function loadAllProfiles(): Promise<MaklerProfil[]> {
  if (allCache && Date.now() - allCache.ts < TTL_MS) return allCache.list;
  const out: MaklerProfil[] = [];
  try {
    const result = await list({ prefix: PREFIX });
    const profiles = await Promise.all(result.blobs.map((b) => readJsonBlob(b.url)));
    for (const p of profiles) if (p) out.push(p);
  } catch (e) {
    console.error('loadAllProfiles failed', (e as Error).message);
    return allCache?.list ?? [];
  }
  allCache = { ts: Date.now(), list: out };
  return out;
}

export async function loadProfilBySlug(slug: string): Promise<MaklerProfil | null> {
  if (!slug) return null;
  const all = await loadAllProfiles();
  return all.find((p) => p.slug === slug) ?? null;
}

// uid → slug, nur veröffentlichte Profile (für Suche-Verlinkung + Sitemap).
export async function loadPublishedSlugMap(): Promise<Map<number, string>> {
  const all = await loadAllProfiles();
  const m = new Map<number, string>();
  for (const p of all) if (p.published && p.slug) m.set(p.uid, p.slug);
  return m;
}

// ---------------------------------------------------------------------------
// Validierung (server-seitig, niemals Client-Eingaben vertrauen)
// ---------------------------------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const cleanList = (v: unknown, maxCount: number, maxLen: number): string[] =>
  arr(v)
    .map((x) => str(x).slice(0, maxLen))
    .filter((x) => x.length > 0)
    .slice(0, maxCount);

export interface ValidateResult {
  ok: boolean;
  content?: ProfilContent;
  errors?: string[];
}

export function validateProfil(raw: unknown): ValidateResult {
  const errors: string[] = [];
  const input = (raw ?? {}) as Record<string, unknown>;

  const headline = str(input.headline).slice(0, LIMITS.headline);
  if (!headline) errors.push('Bitte eine Überschrift / einen Claim angeben.');

  const bio = str(input.bio).slice(0, LIMITS.bio);
  if (!bio) errors.push('Bitte eine Kurzbiografie angeben.');

  const skills = cleanList(input.skills, LIMITS.skills.count, LIMITS.skills.len);
  const qualifikationen = cleanList(input.qualifikationen, LIMITS.qualifikationen.count, LIMITS.qualifikationen.len);

  const buerozeiten: Buerozeit[] = arr(input.buerozeiten)
    .map((z) => {
      const o = (z ?? {}) as Record<string, unknown>;
      const tag = str(o.tag) as Wochentag;
      const von = str(o.von);
      const bis = str(o.bis);
      return { tag, von, bis };
    })
    .filter(
      (z) =>
        WOCHENTAGE.includes(z.tag) &&
        TIME_RE.test(z.von) &&
        TIME_RE.test(z.bis) &&
        z.von < z.bis,
    )
    .slice(0, LIMITS.buerozeiten);

  const fokusRaw = (input.fokus ?? {}) as Record<string, unknown>;
  const fokusAktiv = fokusRaw.aktiv === true || fokusRaw.aktiv === 'true';
  const fokusWert = str(fokusRaw.wert).slice(0, LIMITS.fokusWert);
  if (fokusAktiv && !fokusWert) errors.push('Wenn die Spezialisierung aktiv ist, bitte einen Schwerpunkt angeben.');

  const kontaktRaw = (input.kontakt ?? {}) as Record<string, unknown>;
  const kTelefon = str(kontaktRaw.telefon).slice(0, LIMITS.telefon);
  const kEmailRaw = str(kontaktRaw.email).slice(0, LIMITS.email).toLowerCase();
  let kWebsite = str(kontaktRaw.website).slice(0, LIMITS.website);
  if (kEmailRaw && !EMAIL_RE.test(kEmailRaw)) errors.push('Die angegebene Kontakt-E-Mail ist ungültig.');
  if (kWebsite) {
    if (!/^https?:\/\//i.test(kWebsite)) kWebsite = `https://${kWebsite}`;
    try {
      // eslint-disable-next-line no-new
      new URL(kWebsite);
    } catch {
      errors.push('Die angegebene Website-Adresse ist ungültig.');
      kWebsite = '';
    }
  }

  const kontakt: ProfilKontakt = {};
  if (kTelefon) kontakt.telefon = kTelefon;
  if (kEmailRaw && EMAIL_RE.test(kEmailRaw)) kontakt.email = kEmailRaw;
  if (kWebsite) kontakt.website = kWebsite;

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    content: {
      headline,
      bio,
      skills,
      qualifikationen,
      buerozeiten,
      fokus: { aktiv: fokusAktiv, wert: fokusAktiv ? fokusWert : '' },
      kontakt: Object.keys(kontakt).length ? kontakt : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Speichern (Moderationslogik: „Erstfreigabe, dann frei")
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();

export interface SaveResult {
  profil: MaklerProfil;
  istNeu: boolean;
  liveSofort: boolean; // Änderung ging sofort live (everApproved bereits true)
}

// Baut den persistierten Datensatz aus validierten Inhalten + bestehender Moderationslage.
// name = kanonischer Name aus PW (loadVermittler) für stabile Slug-Bildung.
export async function saveProfilFromContent(
  uid: number,
  name: string,
  content: ProfilContent,
): Promise<SaveResult> {
  const existing = await loadProfilByUid(uid);
  const all = await loadAllProfiles();

  const slug = existing?.slug || uniqueSlug(slugify(name), uid, all);
  const everApproved = existing?.everApproved ?? false;

  const profil: MaklerProfil = {
    ...content,
    v: PROFIL_SCHEMA_VERSION,
    uid,
    slug,
    published: everApproved, // erst nach Erstfreigabe automatisch wieder live
    everApproved,
    eingereichtAm: existing?.eingereichtAm ?? nowIso(),
    freigegebenAm: existing?.freigegebenAm,
    aktualisiertAm: nowIso(),
  };

  await writeProfil(profil);

  return { profil, istNeu: !existing, liveSofort: everApproved };
}

async function writeProfil(profil: MaklerProfil): Promise<void> {
  await put(`${PREFIX}${profil.uid}.json`, JSON.stringify(profil), {
    access: 'private',
    addRandomSuffix: false,
    contentType: 'application/json',
    allowOverwrite: true,
  });
  invalidateProfilCache();
}

// Phoenix-Moderation: Freigabe / Offline nehmen.
// published=true  → freigegeben, geht live, everApproved=true (spätere Edits sofort live).
// published=false → Offline genommen + Freigabe zurückgezogen: die nächste Makler-Änderung
//                   landet wieder im „wartet auf Freigabe"-Zustand (Offline-nehmen ist „sticky").
export async function setPublished(uid: number, published: boolean): Promise<MaklerProfil | null> {
  const existing = await loadProfilByUid(uid);
  if (!existing) return null;
  const updated: MaklerProfil = {
    ...existing,
    published,
    everApproved: published,
    freigegebenAm: published ? nowIso() : existing.freigegebenAm,
    aktualisiertAm: nowIso(),
  };
  await writeProfil(updated);
  return updated;
}
