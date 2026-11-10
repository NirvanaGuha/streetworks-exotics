/**
 * Plain WordPress pages (privacy policy, terms and the like), served at /<slug> by
 * pages/[page].astro. The old site's addresses redirect instead (src/data/redirects.json),
 * so a page at one of them is left out, since the redirect would hide it, until its entry
 * is removed from that file.
 */
import { fetchAPI } from './wp';
import { SEO_FIELDS, seoFromWordPress } from './articles';
import oldAddresses from '../data/redirects.json';

export type SitePage = { slug: string; title: string; content: string; modified?: string; seo: ReturnType<typeof seoFromWordPress> };

async function load(): Promise<SitePage[]> {
    const data = await fetchAPI(`
      query GetPages {
        pages(first: 100, where: { status: PUBLISH }) {
          nodes { slug title content modified isFrontPage ${SEO_FIELDS} }
        }
      }
    `);
    return (data?.pages?.nodes || [])
        .filter((page: any) => {
            if (page.isFrontPage) return false;
            if (!(`/${page.slug}` in oldAddresses.redirects)) return true;
            console.warn(`The WordPress page /${page.slug} is not built: src/data/redirects.json redirects that address. Remove its entry to show the page.`);
            return false;
        })
        .map((page: any) => ({ slug: page.slug, title: page.title, content: page.content, modified: page.modified, seo: seoFromWordPress(page) }));
}

// Every page of a build shares one request.
let loaded: Promise<SitePage[]> | undefined;
export const getPages = () => (loaded ??= load());
