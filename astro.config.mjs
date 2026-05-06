import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

// Hybrid: Pages + Sitemap bleiben pre-rendered (static), nur opt-out-Endpoints
// (z.B. /api/partner-werden) laufen als Serverless-Function. Token bleibt server-side.
export default defineConfig({
  site: 'https://www.phoenix-maklerverbund.de',
  trailingSlash: 'never',
  output: 'hybrid',
  adapter: vercel(),
  build: {
    format: 'directory',
  },
});
