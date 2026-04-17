import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.phoenix-maklerverbund.de',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
});
