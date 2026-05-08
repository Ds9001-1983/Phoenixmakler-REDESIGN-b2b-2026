import plzData from '../data/plz-koordinaten.json';

type Coord = [number, number]; // [lat, lng]

const TABLE = plzData as unknown as Record<string, Coord>;

export const getPlzCoords = (plz: string): Coord | null => {
  const key = plz.padStart(5, '0').slice(0, 5);
  const entry = TABLE[key];
  return entry && entry.length === 2 ? [entry[0], entry[1]] : null;
};

export const haversineKm = (a: Coord, b: Coord): number => {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const sa = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)));
};

export const isPlz = (s: string): boolean => /^\d{5}$/.test(s.trim());
