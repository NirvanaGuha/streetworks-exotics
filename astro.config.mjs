import { defineConfig } from 'astro/config';
import tailwindv4 from '@tailwindcss/vite';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    prefetch: true,
  image: {
      domains: ['images.unsplash.com', 'restomods.local'],
  },
  vite: {
      plugins: [tailwindv4()],
  },

  adapter: node({
    mode: 'standalone',
  }),
});