import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';
import vault from './src/integrations/vault';

export default defineConfig({
  site: 'https://loganeastman.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [preact(), sitemap({ filter: (p) => !p.includes('/private/') }), vault()],
  build: { format: 'directory', inlineStylesheets: 'auto' },
  vite: {
    resolve: { alias: { '@theme': fileURLToPath(new URL('./theme', import.meta.url)) } },
    server: { fs: { allow: ['..'] } },
  },
});
