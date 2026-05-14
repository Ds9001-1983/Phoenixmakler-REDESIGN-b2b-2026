// Einmalige Image-Optimierung. Erzeugt WebP-Varianten neben Originalen
// und shrinkt das DELA-Logo, das versehentlich als 1.8 MB JPG vorlag.
// Run: node scripts/optimize-images.mjs
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PUBLIC = 'public';

const tasks = [
  // DELA-Logo: in-place komprimieren (Marquee zeigt ~120-180px Höhe; 240px reicht für Retina 2x)
  { in: 'images/logos/dela.jpg', out: 'images/logos/dela.jpg', resize: { height: 240, fit: 'inside' }, fmt: 'jpeg', quality: 82 },

  // /kunde Hero-Foto: WebP + komprimierter JPG-Fallback (für <picture>-Tag)
  { in: 'images/audience/kunde.png', out: 'images/audience/kunde.webp', resize: { width: 1024, fit: 'inside' }, fmt: 'webp', quality: 78 },
  { in: 'images/audience/kunde.png', out: 'images/audience/kunde.jpg', resize: { width: 1024, fit: 'inside' }, fmt: 'jpeg', quality: 82 },

  // MaklerHero-Poster: WebP + JPG-Fallback
  { in: 'images/hero/hero-makler-cinematic.png', out: 'images/hero/hero-makler-cinematic.webp', fmt: 'webp', quality: 80 },
  { in: 'images/hero/hero-makler-cinematic.png', out: 'images/hero/hero-makler-cinematic.jpg', fmt: 'jpeg', quality: 80 },

  // og:image: dedizierte 1200x630 Variante (kleiner, social-cropped)
  { in: 'images/hero/hero-home.png', out: 'images/hero/hero-home-og.jpg', resize: { width: 1200, height: 630, fit: 'cover' }, fmt: 'jpeg', quality: 80 },

  // HeroCinematic-Poster: WebP-Variante daneben
  { in: 'images/hero/hero-home-cinematic.jpg', out: 'images/hero/hero-home-cinematic.webp', fmt: 'webp', quality: 80 },
];

for (const t of tasks) {
  const input = path.join(PUBLIC, t.in);
  const output = path.join(PUBLIC, t.out);
  const tmp = output + '.tmp';

  let img = sharp(input);
  if (t.resize) img = img.resize(t.resize);
  if (t.fmt === 'webp') img = img.webp({ quality: t.quality });
  else if (t.fmt === 'jpeg') img = img.jpeg({ quality: t.quality, mozjpeg: true });

  await img.toFile(tmp);
  await fs.rename(tmp, output);

  const before = await fs.stat(input).catch(() => ({ size: 0 }));
  const after = await fs.stat(output);
  const beforeKb = (before.size / 1024).toFixed(0);
  const afterKb = (after.size / 1024).toFixed(0);
  const arrow = input === output ? '∗' : '→';
  console.log(`${arrow} ${t.in} (${beforeKb} KB) ${arrow} ${t.out} (${afterKb} KB)`);
}
