/**
 * Every public page of the site with its title, description and dates, from WordPress or the
 * local content: the list behind the sitemap, the RSS feed and llms.txt.
 */
import { fetchAPI } from './wp';
import { getCaseStudies, getPosts, type Article } from './articles';
import { getPages } from './pages';
import { getParts, type Part } from './parts';
import { getLocalService, getLocalServiceSlugs } from './localContent';
import { describe } from './storyText';
import { brand, content, fill } from './site';

export type Entry = { path: string; title: string; description: string; modified?: string };
export type ServiceEntry = Entry & { slug: string };

async function loadServices(): Promise<ServiceEntry[]> {
    const data = await fetchAPI(`
      query GetServiceSummaries {
        services(first: 100, where: { orderby: { field: MENU_ORDER, order: ASC } }) {
          nodes { slug title modified serviceDetails { description } pageSeo { seoDescription } sections { type text } }
        }
      }
    `);
    const texts = (sections: any[]) => sections.filter((section) => section.type === 'text').map((section) => section.text as string);
    if (data?.services?.nodes?.length) {
        return data.services.nodes.map((node: any) => ({
            slug: node.slug,
            path: `/services/${node.slug}`,
            title: node.title,
            modified: node.modified,
            description: node.pageSeo?.seoDescription || describe(texts(node.sections || [])) || node.serviceDetails?.description || '',
        }));
    }
    const services = await Promise.all((await getLocalServiceSlugs()).map(async (slug) => ({ slug, service: (await getLocalService(slug))! })));
    return services.map(({ slug, service }) => ({
        slug,
        path: `/services/${slug}`,
        title: service.title,
        description: service.seo.description || describe(texts(service.sections)) || service.heroTagline || '',
    }));
}

let services: Promise<ServiceEntry[]> | undefined;
export const getServiceEntries = () => (services ??= loadServices());

export const articleEntry = (article: Article): Entry => ({
    path: article.href,
    title: article.seo.title || article.title,
    description: article.seo.description || article.excerpt,
    modified: article.modified || article.date,
});

export const partEntry = (part: Part): Entry => ({
    path: part.href,
    title: part.seo.title || part.name,
    description: part.seo.description || fill(content.parts.partDescription, { part: part.name, shop: brand.shortName }),
    modified: part.modified,
});

/** Every page, the main sections first. */
export async function getEntries(): Promise<Entry[]> {
    const [posts, caseStudies, pages, parts] = await Promise.all([getPosts(), getCaseStudies(), getPages(), getParts()]);
    const newest = (list: Article[]) => list.map((article) => article.modified || article.date).sort().at(-1);
    return [
        { path: '/', title: `${brand.client} | ${brand.tagline}`, description: brand.description, modified: newest([...posts, ...caseStudies]) },
        ...(await getServiceEntries()),
        { path: '/portfolio', title: content.labels.portfolio, description: content.portfolio.intro },
        ...(caseStudies.length ? [{ path: '/case-studies', title: content.caseStudies.heading, description: content.caseStudies.intro, modified: newest(caseStudies) }] : []),
        ...caseStudies.map(articleEntry),
        ...(posts.length ? [{ path: '/blog', title: content.journal.heading, description: content.journal.intro, modified: newest(posts) }] : []),
        ...posts.map(articleEntry),
        ...(parts.length ? [{ path: '/parts', title: content.labels.parts, description: content.parts.intro, modified: parts.map((part) => part.modified).filter(Boolean).sort().at(-1) }] : []),
        ...parts.map(partEntry),
        ...pages.map((page) => ({ path: `/${page.slug}`, title: page.seo.title || page.title, description: page.seo.description, modified: page.modified })),
    ];
}
