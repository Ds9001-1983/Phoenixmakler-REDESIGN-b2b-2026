import { defineConfig } from 'astro/config';

// Sitemap wird ueber src/pages/sitemap.xml.ts handgepflegt — bietet praezisere
// Prioritaeten/changefreq pro Route als die @astrojs/sitemap Auto-Generierung.
// React/@astrojs/react entfernt: keine .tsx-Komponente mehr im Projekt.
export default defineConfig({
  site: 'https://www.phoenix-maklerverbund.de',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
});
