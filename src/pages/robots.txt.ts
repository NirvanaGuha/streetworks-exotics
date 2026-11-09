import type { APIRoute } from 'astro';
import { demoMode } from '../lib/demo';

// Concept builds block search crawlers but let link-preview bots through, so a link sent in a DM
// still shows its card (pages also carry noindex). Live builds allow everything (see src/lib/demo.ts).
const PREVIEW_BOTS = ['facebookexternalhit', 'Facebot', 'meta-externalagent', 'LinkedInBot', 'Twitterbot', 'Slackbot', 'WhatsApp', 'TelegramBot', 'Discordbot', 'Applebot'];

export const GET: APIRoute = () => {
    const body = demoMode
        ? [...PREVIEW_BOTS.map((bot) => `User-agent: ${bot}\nAllow: /\n`), 'User-agent: *\nDisallow: /\n'].join('\n')
        : 'User-agent: *\nDisallow:\n';
    return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
