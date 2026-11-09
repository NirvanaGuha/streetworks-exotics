import { defineConfig, envField } from 'astro/config';
import tailwindv4 from '@tailwindcss/vite';

import node from '@astrojs/node';

// https://astro.build/config
// Pages are prerendered from WordPress at build time; the adapter only serves the
// contact form action on demand.
export default defineConfig({
    output: 'static',
    prefetch: true,
  image: {
      domains: ['restomods.local'],
  },
  env: {
      schema: {
          // Read at runtime by the contact form action; never sent to the browser.
          WP_FORM_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      },
  },
  vite: {
      plugins: [tailwindv4()],
  },

  adapter: node({
    mode: 'standalone',
  }),
});
