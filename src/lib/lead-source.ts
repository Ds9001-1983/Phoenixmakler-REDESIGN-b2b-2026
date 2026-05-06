export const LEAD_SOURCES = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'google', label: 'Google-Suche' },
  { key: 'empfehlung', label: 'Persönliche Empfehlung' },
  { key: 'sonstiges', label: 'Sonstiges' },
] as const;

export type LeadSourceKey = (typeof LEAD_SOURCES)[number]['key'];

export const labelOf = (key: string): string =>
  LEAD_SOURCES.find((s) => s.key === key)?.label ?? '';
