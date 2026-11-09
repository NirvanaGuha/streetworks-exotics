import { defineConfig, envField } from 'astro/config';
import tailwindv4 from '@tailwindcss/vite';

import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import { loadEnv } from 'vite';

// WordPress images are optimized at build time, so their host must be allowed.
const { PUBLIC_WP_GRAPHQL_URL, PUBLIC_SITE_URL } = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const wpHost = PUBLIC_WP_GRAPHQL_URL ? new URL(PUBLIC_WP_GRAPHQL_URL).hostname : null;

// Every image is generated at build time, so production builds swap Astro's on-demand
// image endpoint (/_image) for one that returns 404: no image processing runs on request.
// The dev server still needs the real endpoint to resize images as pages load.
const isBuild = process.argv.includes('build');

// The server only trusts the Host header for these domains (otherwise it assumes localhost),
// and form posts from any other origin are rejected as cross-site. So list where the site
// runs: its own domain, Vercel's deployment URLs on Vercel, and localhost for local testing.
// On Vercel the project's production address is the default, so a deploy with no settings
// still gets absolute link-preview images (chat apps can't show a relative or localhost one).
const siteUrl = PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
const site = siteUrl ? new URL(siteUrl) : null;
const allowedDomains = [
  ...(site ? [{ hostname: site.hostname, protocol: site.protocol.replace(':', '') }] : []),
  ...(process.env.VERCEL ? [{ hostname: '**.vercel.app', protocol: 'https' }] : []),
  ...(!site && !process.env.VERCEL ? [{ hostname: 'localhost' }, { hostname: '127.0.0.1' }] : []),
];

// https://astro.build/config
// Pages are prerendered from WordPress at build time; the adapter only serves the
// contact form action on demand.
export default defineConfig({
    // Deployed address, used for canonical URLs and link-preview images.
    site: siteUrl || undefined,
    output: 'static',
    // Astro 7 strips whitespace between inline elements by default (JSX rules); keep the
    // HTML-aware spacing the templates were written for, e.g. "{year} {label}".
    compressHTML: true,
    prefetch: true,
  image: {
      domains: wpHost ? [wpHost] : [],
      ...(isBuild && { endpoint: { entrypoint: './src/lib/image-endpoint-disabled.ts' } }),
  },
  security: {
      allowedDomains,
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

  // Vercel sets VERCEL=1 in its builds; everywhere else the site runs as a Node server.
  adapter: process.env.VERCEL ? vercel() : node({
    mode: 'standalone',
  }),
});
