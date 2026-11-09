import { defineConfig, envField } from 'astro/config';
import tailwindv4 from '@tailwindcss/vite';

import node from '@astrojs/node';
import { loadEnv } from 'vite';

// WordPress images are optimized at build time, so their host must be allowed.
const { PUBLIC_WP_GRAPHQL_URL, PUBLIC_SITE_URL } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const wpHost = PUBLIC_WP_GRAPHQL_URL ? new URL(PUBLIC_WP_GRAPHQL_URL).hostname : null;

// https://astro.build/config
// Pages are prerendered from WordPress at build time; the adapter only serves the
// contact form action on demand.
export default defineConfig({
    // Deployed address, used for canonical URLs and link-preview images.
    site: PUBLIC_SITE_URL || undefined,
    output: 'static',
    prefetch: true,
  image: {
      domains: wpHost ? [wpHost] : [],
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
