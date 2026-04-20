import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://www.phoenix-maklerverbund.de',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
  integrations: [react()],
});
