/**
 * Blog posts and case studies, from WordPress (Posts and Case Studies, with the plugin's
 * `articleBlocks`) or, without it, from src/content/posts and src/content/case-studies.
 * Both arrive in one shape, so the pages don't care where they came from.
 */
import { getCollection } from 'astro:content';
import type { ImageMetadata } from 'astro';
import { fetchAPI } from './wp';

export type ArticleImage = { src: string | ImageMetadata; width?: number; height?: number; alt: string; caption: string };
export type ArticleBlock =
    | { type: 'paragraph'; html: string }
    | { type: 'heading'; level: number; html: string }
    | { type: 'list'; ordered: boolean; items: string[] }
    | { type: 'quote'; html: string; cite: string }
    | { type: 'image' | 'gallery'; images: ArticleImage[] }
    | { type: 'embed'; url: string; provider: string }
    | { type: 'audio' | 'video'; url: string; caption: string };

export type Article = {
    kind: 'post' | 'case-study';
    slug: string;
    href: string;
    title: string;
    date: string;
    excerpt: string;
    byline: string;
    categories: { name: string; slug: string }[];
    image?: ArticleImage;
    blocks: ArticleBlock[];
    minutes: number;
    // Case studies only.
    vehicle: string;
    year: string;
    scope: string;
    recognition: string;
    order?: number;
};

const BLOCK_FIELDS = `articleBlocks { type level html ordered items cite url provider caption images { url width height alt caption } }`;
const IMAGE_FIELDS = `featuredImage { node { sourceUrl altText mediaDetails { width height } } }`;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
const decode = (html: string) =>
    html.replace(/&(#x?[\da-f]+|\w+);/gi, (entity, code: string) =>
        code[0] === '#' ? String.fromCodePoint(parseInt(code.slice(code[1].toLowerCase() === 'x' ? 2 : 1), code[1].toLowerCase() === 'x' ? 16 : 10)) : ENTITIES[code.toLowerCase()] ?? entity);
/** Plain text of inline HTML. */
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' '));
const wordCount = (blocks: ArticleBlock[]) =>
    blocks
        .flatMap((block) => ('html' in block ? [block.html] : 'items' in block ? block.items : []))
        .join(' ')
        .split(/\s+/)
        .filter((word) => /\w/.test(text(word))).length;

/** The first sentences of the first real paragraph, when no excerpt was written. */
function excerptFrom(blocks: ArticleBlock[]) {
    const first = blocks.find((block) => block.type === 'paragraph' && text(block.html).trim().length >= 80);
    if (!first || !('html' in first)) return '';
    const plain = text(first.html).replace(/\s+/g, ' ').trim();
    const sentences = plain.match(/[^.!?]+[.!?]+["”’)]*\s*/g) ?? [plain];
    let out = '';
    for (const sentence of sentences) {
        if (out && (out + sentence).length > 220) break;
        out += sentence;
    }
    return out.trim();
}

function finish(article: Omit<Article, 'minutes' | 'href'> & { excerpt: string }): Article {
    return {
        ...article,
        href: `/${article.kind === 'post' ? 'blog' : 'case-studies'}/${article.slug}`,
        excerpt: article.excerpt.trim() || excerptFrom(article.blocks),
        categories: article.categories.filter((category) => category.slug !== 'uncategorized'),
        minutes: Math.max(1, Math.round(wordCount(article.blocks) / 230)),
    };
}

const fromWordPressImage = (img: any): ArticleImage => ({
    src: img.url,
    width: img.width || undefined,
    height: img.height || undefined,
    alt: img.alt || '',
    caption: img.caption || '',
});

function fromWordPress(node: any, kind: Article['kind']): Article {
    const featured = node.featuredImage?.node;
    const details = node.caseStudyDetails || {};
    return finish({
        kind,
        slug: node.slug,
        title: node.title,
        date: node.date,
        excerpt: text(node.excerpt || '').replace(/\s+/g, ' ').replace(/\s*\[(…|&hellip;|\.\.\.)\]\s*$/, '…').trim(),
        byline: node.articleDetails?.byline || '',
        categories: node.categories?.nodes || [],
        image: featured
            ? { src: featured.sourceUrl, width: featured.mediaDetails?.width, height: featured.mediaDetails?.height, alt: featured.altText || '', caption: '' }
            : undefined,
        blocks: (node.articleBlocks || []).map((block: any): ArticleBlock => {
            switch (block.type) {
                case 'heading': return { type: 'heading', level: block.level || 2, html: block.html || '' };
                case 'list': return { type: 'list', ordered: !!block.ordered, items: block.items || [] };
                case 'quote': return { type: 'quote', html: block.html || '', cite: block.cite || '' };
                case 'image':
                case 'gallery': return { type: block.type, images: (block.images || []).map(fromWordPressImage) };
                case 'embed': return { type: 'embed', url: block.url, provider: block.provider || '' };
                case 'audio':
                case 'video': return { type: block.type, url: block.url, caption: block.caption || '' };
                default: return { type: 'paragraph', html: block.html || '' };
            }
        }),
        vehicle: details.vehicle || '',
        year: details.year || '',
        scope: details.scope || '',
        recognition: details.recognition || '',
    });
}

async function load() {
    const data = await fetchAPI(`
      query GetArticles {
        posts(first: 100, where: { orderby: { field: DATE, order: DESC } }) {
          nodes {
            slug title date excerpt
            categories { nodes { name slug } }
            articleDetails { byline }
            ${IMAGE_FIELDS}
            ${BLOCK_FIELDS}
          }
        }
        caseStudies(first: 100, where: { orderby: [{ field: MENU_ORDER, order: ASC }, { field: DATE, order: DESC }] }) {
          nodes {
            slug title date excerpt
            articleDetails { byline }
            caseStudyDetails { vehicle year scope recognition }
            ${IMAGE_FIELDS}
            ${BLOCK_FIELDS}
          }
        }
      }
    `);
    const wpPosts = (data?.posts?.nodes || []).map((node: any) => fromWordPress(node, 'post'));
    const wpCaseStudies = (data?.caseStudies?.nodes || []).map((node: any) => fromWordPress(node, 'case-study'));

    const local = async (collection: 'posts' | 'caseStudies', kind: Article['kind']) =>
        (await getCollection(collection)).map(({ id, data }: any) =>
            finish({
                kind,
                slug: id,
                title: data.title,
                date: data.date,
                excerpt: data.excerpt,
                byline: data.byline,
                categories: data.categories || [],
                image: data.image ? { src: data.image, alt: data.imageAlt, caption: '' } : undefined,
                blocks: data.blocks,
                vehicle: data.vehicle || '',
                year: data.year || '',
                scope: data.scope || '',
                recognition: data.recognition || '',
                order: data.order,
            })
        );
    const byDate = (a: Article, b: Article) => b.date.localeCompare(a.date);

    return {
        posts: wpPosts.length ? wpPosts : (await local('posts', 'post')).sort(byDate),
        caseStudies: wpCaseStudies.length
            ? wpCaseStudies
            : (await local('caseStudies', 'case-study')).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || byDate(a, b)),
    };
}

// Every page of a build shares one request.
let loaded: ReturnType<typeof load> | undefined;
const articles = () => (loaded ??= load());

/** Blog posts, newest first. */
export const getPosts = async (): Promise<Article[]> => (await articles()).posts;

/** Case studies in their "Order", then newest first. */
export const getCaseStudies = async (): Promise<Article[]> => (await articles()).caseStudies;

export const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

/** The image's source and size, as Astro's <Image> wants them. */
export const imageProps = (image: ArticleImage) =>
    typeof image.src === 'string'
        ? { src: image.src, width: image.width, height: image.height, inferSize: !image.width || !image.height }
        : { src: image.src };

/** Width / height of an image, for its box before it loads. */
export const aspect = (image: ArticleImage) => {
    const w = typeof image.src === 'string' ? image.width : image.src.width;
    const h = typeof image.src === 'string' ? image.height : image.src.height;
    return w && h ? w / h : 3 / 2;
};
