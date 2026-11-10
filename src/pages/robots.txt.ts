import type { APIRoute } from 'astro';
import { demoMode } from '../lib/demo';

// Concept builds block search crawlers but let link-preview bots through, so a link sent in a DM
// still shows its card (pages also carry noindex). Live builds allow everything (see src/lib/demo.ts).
const PREVIEW_BOTS = ['facebookexternalhit', 'Facebot', 'meta-externalagent', 'LinkedInBot', 'Twitterbot', 'Slackbot', 'WhatsApp', 'TelegramBot', 'Discordbot', 'Applebot'];

// Live builds welcome every crawler, search and AI alike (GPTBot, ClaudeBot, PerplexityBot,
// Google-Extended and the rest follow the * rule), and point them at the sitemap.
export const GET: APIRoute = ({ site, url }) => {
    const body = demoMode
        ? [...PREVIEW_BOTS.map((bot) => `User-agent: ${bot}\nAllow: /\n`), 'User-agent: *\nDisallow: /\n'].join('\n')
        : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', site ?? url).href}\n`;
    return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
