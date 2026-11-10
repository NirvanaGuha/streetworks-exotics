/**
 * Parts the shop sells on request (no prices, no checkout): from WordPress (Parts) or, without
 * it, from src/content/parts. Both arrive in one shape. With no parts at all, the site has no
 * parts pages or links.
 */
import { getCollection } from 'astro:content';
import { fetchAPI } from './wp';
import { SEO_FIELDS, seoFromLocal, seoFromWordPress, type Article, type ArticleImage } from './articles';

export type Part = {
    slug: string;
    href: string;
    title: string;
    // The car it's for, e.g. "De Tomaso Mangusta".
    fits: string;
    // The car and the part together, for page titles, photo descriptions and enquiries.
    name: string;
    // Plain text; paragraphs separated by a blank line.
    description: string;
    // The main photo first.
    images: ArticleImage[];
    seo: Article['seo'];
    modified?: string;
};

const IMAGE = 'node { sourceUrl altText mediaDetails { width height } }';

function finish(part: Omit<Part, 'href' | 'name'>): Part {
    const named = part.fits && !part.title.toLowerCase().includes(part.fits.toLowerCase());
    return { ...part, href: `/parts/${part.slug}`, name: named ? `${part.fits} ${part.title}` : part.title };
}

const fromWordPressImage = (node: any): ArticleImage => ({
    src: node.sourceUrl,
    width: node.mediaDetails?.width || undefined,
    height: node.mediaDetails?.height || undefined,
    alt: node.altText || '',
    caption: '',
});

async function load(): Promise<Part[]> {
    const data = await fetchAPI(`
      query GetParts {
        parts(first: 100, where: { orderby: [{ field: MENU_ORDER, order: ASC }, { field: TITLE, order: ASC }] }) {
          nodes {
            slug title modified
            featuredImage { ${IMAGE} }
            partDetails { fits description photo2 { ${IMAGE} } photo3 { ${IMAGE} } photo4 { ${IMAGE} } }
            ${SEO_FIELDS}
          }
        }
      }
    `);
    const wpParts = (data?.parts?.nodes || []).map((node: any) => {
        const details = node.partDetails || {};
        return finish({
            slug: node.slug,
            title: node.title,
            fits: details.fits || '',
            description: (details.description || '').trim(),
            images: [node.featuredImage, details.photo2, details.photo3, details.photo4].filter((image) => image?.node?.sourceUrl).map((image) => fromWordPressImage(image.node)),
            seo: seoFromWordPress(node),
            modified: node.modified,
        });
    });
    if (wpParts.length) return wpParts;

    return (await getCollection('parts'))
        .sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99) || a.data.title.localeCompare(b.data.title))
        .map(({ id, data }) =>
            finish({
                slug: id,
                title: data.title,
                fits: data.fits,
                description: data.description.trim(),
                images: data.images.map((image) => ({ src: image.src, alt: image.alt, caption: '' })),
                seo: seoFromLocal(data),
            })
        );
}

// Every page of a build shares one request.
let loaded: Promise<Part[]> | undefined;

/** Parts in their "Order", then by name. */
export const getParts = () => (loaded ??= load());
