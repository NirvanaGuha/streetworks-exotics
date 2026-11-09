import type { APIRoute } from 'astro';

// Replaces Astro's /_image endpoint in production builds (see astro.config.mjs): images are
// all generated at build time, so nothing should be transformed on request.
export const GET: APIRoute = () => new Response('Not found', { status: 404 });
