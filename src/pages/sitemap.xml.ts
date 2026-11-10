import type { APIRoute } from 'astro';
import { getEntries } from '../lib/directory';

// Every page for search engines, with the date it last changed where known. The old site's
// sitemap addresses redirect here (src/data/redirects.json), so Search Console keeps working.
const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ site, url }) => {
    const base = site ?? url;
    const urls = (await getEntries()).map((entry) =>
        `  <url><loc>${xml(new URL(entry.path, base).href)}</loc>${entry.modified ? `<lastmod>${entry.modified.slice(0, 10)}</lastmod>` : ''}</url>`
    );
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
