import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Pages are prerendered by default; anything with `export const prerender = false`
// (the home page, /api/stats.json) is rendered per request by the Node server
// that pm2 runs on octanebula-vps. See deploy/.
export default defineConfig({
  site: 'https://octanebula.dev',
  adapter: node({ mode: 'standalone' }),
});
