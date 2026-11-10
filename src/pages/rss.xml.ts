import type { APIRoute } from 'astro';
import { getCaseStudies, getPosts } from '../lib/articles';
import { articleEntry } from '../lib/directory';
import { brand } from '../lib/site';

// Posts and case studies, newest first, for feed readers and the services that follow feeds
// for new pages. The old WordPress feed (/feed) redirects here.
const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ site, url }) => {
    const base = site ?? url;
    const articles = [...(await getPosts()), ...(await getCaseStudies())].sort((a, b) => b.date.localeCompare(a.date));
    const items = articles.map((article) => {
        const entry = articleEntry(article);
        const link = new URL(article.href, base).href;
        return [
            '    <item>',
            `      <title>${xml(article.title)}</title>`,
            `      <link>${xml(link)}</link>`,
            `      <guid isPermaLink="true">${xml(link)}</guid>`,
            `      <pubDate>${new Date(`${article.date.slice(0, 19)}Z`).toUTCString()}</pubDate>`,
            ...article.categories.map((category) => `      <category>${xml(category.name)}</category>`),
            `      <description>${xml(entry.description)}</description>`,
            '    </item>',
        ].join('\n');
    });
    const body = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        `    <title>${xml(brand.client)}</title>`,
        `    <link>${xml(new URL('/', base).href)}</link>`,
        `    <description>${xml(brand.description)}</description>`,
        '    <language>en-us</language>',
        `    <atom:link href="${xml(new URL('/rss.xml', base).href)}" rel="self" type="application/rss+xml" />`,
        ...items,
        '  </channel>',
        '</rss>',
        '',
    ].join('\n');
    return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
