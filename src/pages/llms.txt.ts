import type { APIRoute } from 'astro';
import { getCaseStudies, getPosts } from '../lib/articles';
import { articleEntry, getServiceEntries } from '../lib/directory';
import { getBusiness } from '../lib/business';
import { brand, content } from '../lib/site';

// llms.txt (llmstxt.org): a plain summary of the business and an index of its pages, for AI
// assistants and the crawlers behind AI search. Every link is a normal page of the site.
const line = (text: string) => text.replace(/\s+/g, ' ').trim();
const NETWORK_NAMES: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' };

export const GET: APIRoute = async ({ site, url }) => {
    const base = site ?? url;
    // Brackets in a title would end the Markdown link early.
    const link = (title: string, path: string, note: string) => `- [${line(title).replace(/([[\]])/g, '\\$1')}](${new URL(path, base).href})${note ? `: ${line(note)}` : ''}`;
    const business = await getBusiness();
    const [services, caseStudies, posts] = await Promise.all([getServiceEntries(), getCaseStudies(), getPosts()]);
    const study = (article: (typeof caseStudies)[number]) =>
        [[article.year, article.vehicle].filter(Boolean).join(' '), article.recognition, articleEntry(article).description].filter(Boolean).join('. ');

    const body = [
        `# ${business.name}`,
        '',
        `> ${line(brand.description)}`,
        '',
        `- Address: ${business.address.join(', ')}`,
        `- Phone: ${business.phone}`,
        `- Email: ${business.email}`,
        ...business.socials.map((social) => `- ${NETWORK_NAMES[social.network] ?? social.network}: ${social.url}`),
        '',
        '## Services',
        '',
        ...services.map((service) => link(service.title, service.path, service.description)),
        ...(caseStudies.length ? ['', `## ${content.caseStudies.heading}`, '', ...caseStudies.map((article) => link(article.title, article.href, study(article)))] : []),
        ...(posts.length ? ['', `## ${content.journal.heading}`, '', ...posts.map((article) => link(article.title, article.href, articleEntry(article).description))] : []),
        '',
        '## Optional',
        '',
        link(content.labels.portfolio, '/portfolio', content.portfolio.intro),
        link('Contact', '/#contact-section', `Enquiries by form, phone ${business.phone} or email ${business.email}`),
        link('Sitemap', '/sitemap.xml', 'every page'),
        '',
    ].join('\n');
    return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
