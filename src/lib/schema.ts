/**
 * Structured data (schema.org JSON-LD) for search engines and AI assistants: who the shop is
 * and where (on every page), and what each page is (an article, a service), so answers can
 * name the business, its address and phone, and cite the right page.
 */
import type { Article } from './articles';
import type { getBusiness } from './business';

type Business = Awaited<ReturnType<typeof getBusiness>>;
type Node = Record<string, unknown>;

/** What the page's structured data can refer to: its address, preview image and the site's root. */
export type PageInfo = { url: string; image: string; site: string };

const ref = (site: string, name: string) => ({ '@id': `${site}#${name}` });

/** "600 Hickory St / Pewaukee, WI 53072 / United States" as a postal address, when it reads like one. */
function postalAddress(lines: string[]): Node {
    const [street, cityLine = '', country = ''] = lines;
    const match = cityLine.match(/^(.+?),\s*([A-Za-z .]+?)\s+([A-Z0-9][A-Z0-9 -]{2,9})$/);
    return match
        ? { '@type': 'PostalAddress', streetAddress: street, addressLocality: match[1], addressRegion: match[2], postalCode: match[3], ...(country && { addressCountry: country }) }
        : { '@type': 'PostalAddress', streetAddress: lines.join(', ') };
}

/** The business and the website, on every page. */
export function siteNodes(business: Business, info: PageInfo, description: string): Node[] {
    return [
        {
            '@type': business.type,
            ...ref(info.site, 'business'),
            name: business.name,
            url: info.site,
            description,
            image: info.image,
            telephone: business.phone,
            email: business.email,
            address: postalAddress(business.address),
            ...(business.mapsUrl && { hasMap: business.mapsUrl }),
            ...(business.socials.length && { sameAs: business.socials.map((social) => social.url) }),
        },
        { '@type': 'WebSite', ...ref(info.site, 'website'), url: info.site, name: business.name, publisher: ref(info.site, 'business') },
    ];
}

/** Home › section › page. */
export function breadcrumbs(info: PageInfo, trail: { name: string; path?: string }[]): Node {
    return {
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((step, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: step.name,
            item: step.path === undefined ? info.url : new URL(step.path, info.site).href,
        })),
    };
}

/** A post or case study; a case study is also about its car. */
export function articleNode(article: Article, info: PageInfo, description: string): Node {
    return {
        '@type': 'BlogPosting',
        '@id': `${info.url}#article`,
        mainEntityOfPage: info.url,
        headline: article.title.length > 110 ? `${article.title.slice(0, 109)}…` : article.title,
        description,
        image: info.image,
        datePublished: article.date,
        dateModified: article.modified || article.date,
        author: article.byline ? { '@type': 'Person', name: article.byline } : ref(info.site, 'business'),
        publisher: ref(info.site, 'business'),
        ...(article.categories.length && { articleSection: article.categories.map((category) => category.name) }),
        ...(article.vehicle && { about: { '@type': 'Car', name: article.vehicle, ...(article.year && { vehicleModelDate: article.year }) } }),
    };
}

/** A service the shop offers. */
export function serviceNode(name: string, description: string, info: PageInfo): Node {
    return { '@type': 'Service', '@id': `${info.url}#service`, name, serviceType: name, description, url: info.url, image: info.image, provider: ref(info.site, 'business') };
}

/** The script body: one graph, with "<" escaped so no value can close the script tag. */
export const jsonLd = (nodes: Node[]) => JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
