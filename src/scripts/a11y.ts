// Accessibility-Settings-Store (BFSG / WCAG 2.2 AA).
// Persistiert User-Praeferenzen in localStorage und spiegelt sie als data-a11y-*
// Attribute auf <html>, sodass CSS und andere Skripte rein deklarativ reagieren.
//
// Achtung: ein "First Paint"-Inline-Skript liegt zusaetzlich in BaseLayout.astro,
// das die Werte schon vor dem CSS anwendet (kein Flash bei Hochkontrast/Text-Groesse).
// Diese Datei haengt nur Listener fuer Aenderungen an und stellt das Public-API bereit.

export type A11ySettings = {
  textSize: '100' | '115' | '130' | '150';
  spacing: 'normal' | 'relaxed';
  contrast: 'normal' | 'high';
  motion: 'full' | 'reduced';
  cursor: 'custom' | 'system';
  links: 'normal' | 'underlined';
  reading: 'off' | 'on';
};

export const A11Y_STORAGE_KEY = 'phoenix_a11y_v1';
export const A11Y_EVENT = 'phoenix:a11y-change';

export const A11Y_DEFAULTS: A11ySettings = {
  textSize: '100',
  spacing: 'normal',
  contrast: 'normal',
  motion: 'full',
  cursor: 'custom',
  links: 'normal',
  reading: 'off',
};

const KEYS = Object.keys(A11Y_DEFAULTS) as (keyof A11ySettings)[];

export function readSettings(): A11ySettings {
  if (typeof localStorage === 'undefined') return { ...A11Y_DEFAULTS };
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return { ...A11Y_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<A11ySettings>;
    const out = { ...A11Y_DEFAULTS };
    for (const k of KEYS) if (parsed[k]) (out[k] as string) = parsed[k] as string;
    return out;
  } catch {
    return { ...A11Y_DEFAULTS };
  }
}

export function writeSettings(s: A11ySettings) {
  try {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

export function applyToDOM(s: A11ySettings) {
  const html = document.documentElement;
  html.setAttribute('data-a11y-text', s.textSize);
  html.setAttribute('data-a11y-spacing', s.spacing);
  html.setAttribute('data-a11y-contrast', s.contrast);
  html.setAttribute('data-a11y-motion', resolveMotion(s.motion));
  html.setAttribute('data-a11y-cursor', s.cursor);
  html.setAttribute('data-a11y-links', s.links);
  html.setAttribute('data-a11y-reading', s.reading);
}

// System-prefers-reduced-motion gewinnt immer (WCAG 2.3.3).
// Der User kann im Widget die Bewegung explizit wieder an- bzw ausschalten,
// aber Auto-Detect schaltet bei system-reduced auf reduced.
function resolveMotion(setting: A11ySettings['motion']): 'full' | 'reduced' {
  if (setting === 'reduced') return 'reduced';
  if (typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return 'reduced';
  }
  return 'full';
}

export function updateSettings(patch: Partial<A11ySettings>) {
  const next = { ...readSettings(), ...patch };
  writeSettings(next);
  applyToDOM(next);
  window.dispatchEvent(new CustomEvent<A11ySettings>(A11Y_EVENT, { detail: next }));
}

export function resetSettings() {
  writeSettings({ ...A11Y_DEFAULTS });
  applyToDOM({ ...A11Y_DEFAULTS });
  window.dispatchEvent(new CustomEvent<A11ySettings>(A11Y_EVENT, { detail: { ...A11Y_DEFAULTS } }));
}

// System-Setting-Watch: wenn OS-prefers-reduced-motion sich aendert,
// neu anwenden (greift aber nur, wenn der User nicht explizit "full" gewaehlt hat).
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener?.('change', () => {
    const current = readSettings();
    applyToDOM(current);
    window.dispatchEvent(new CustomEvent<A11ySettings>(A11Y_EVENT, { detail: current }));
  });
}

// Initial-Sync. Das Inline-Skript hat schon einmal angewandt — wir bestaetigen
// hier den State und feuern das Event, damit Komponenten initial reagieren koennen.
if (typeof window !== 'undefined') {
  const initial = readSettings();
  applyToDOM(initial);
  window.dispatchEvent(new CustomEvent<A11ySettings>(A11Y_EVENT, { detail: initial }));
}

// Helper fuer Komponenten, die das aktuelle "effective motion" brauchen.
export function isMotionReduced(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-a11y-motion') === 'reduced';
}
