import type { APIRoute } from 'astro';
import { demoMode } from '../lib/demo';

// Concept builds block all crawlers; live builds allow them (see src/lib/demo.ts).
export const GET: APIRoute = () => {
    return new Response(`User-agent: *\nDisallow:${demoMode ? ' /' : ''}\n`, {
        headers: { 'Content-Type': 'text/plain' },
    });
};
