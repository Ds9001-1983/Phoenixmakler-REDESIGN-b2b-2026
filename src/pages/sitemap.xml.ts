import type { APIRoute } from 'astro';

const pages = [
  { url: '/', changefreq: 'monthly', priority: 1.0 },
  { url: '/makler-werden', changefreq: 'monthly', priority: 0.9 },
  { url: '/kunde', changefreq: 'monthly', priority: 0.9 },
  { url: '/kunde/altersvorsorge', changefreq: 'monthly', priority: 0.8 },
  { url: '/kunde/einkommenssicherung', changefreq: 'monthly', priority: 0.8 },
  { url: '/kunde/zahnzusatzversicherung', changefreq: 'monthly', priority: 0.8 },
  { url: '/kunde/krankenhauszusatzversicherung', changefreq: 'monthly', priority: 0.8 },
  { url: '/kunde/haustier', changefreq: 'monthly', priority: 0.8 },
  { url: '/kunde/haus-wohnen', changefreq: 'monthly', priority: 0.8 },
  { url: '/kunde/vermoegensaufbau', changefreq: 'monthly', priority: 0.8 },
  { url: '/makler-suche', changefreq: 'weekly', priority: 0.7 },
  { url: '/ueber-uns', changefreq: 'yearly', priority: 0.6 },
  { url: '/kontakt', changefreq: 'yearly', priority: 0.6 },
  { url: '/impressum', changefreq: 'yearly', priority: 0.3 },
  { url: '/datenschutz', changefreq: 'yearly', priority: 0.3 },
  { url: '/erstinformation', changefreq: 'yearly', priority: 0.3 },
  { url: '/beschwerdemanagement', changefreq: 'yearly', priority: 0.3 },
  { url: '/barrierefreiheit', changefreq: 'yearly', priority: 0.3 },
];

export const GET: APIRoute = ({ site }) => {
  const base = site?.toString().replace(/\/$/, '') ?? 'https://www.phoenix-maklerverbund.de';
  const today = new Date().toISOString().split('T')[0];

  const urls = pages
    .map(
      (p) => `  <url>
    <loc>${base}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
