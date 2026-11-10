/**
 * Site-wide settings: the built-in values in src/data/brand.json and src/data/content.json,
 * with whatever is filled in under Site Settings in WordPress laid over them, field by field.
 * The fields are listed in wordpress/fire-headless/site-settings.json; each one's `path`
 * is the value it replaces. Without WordPress, the copy saved by
 * scripts/snapshot-wordpress.mjs (src/data/site-settings.json) is laid over instead.
 *
 * Every value is checked before use: colours must be hex, fonts and choices must be on
 * the list, numbers in range. A bad entry keeps the built-in value rather than reaching
 * the page (colours and fonts end up in CSS).
 *
 * Fetched once per build. Pages and components import { brand, content } from here.
 */
import brandDefaults from '../data/brand.json';
import contentDefaults from '../data/content.json';
import schema from '../../wordpress/fire-headless/site-settings.json';
import { fetchAPI } from './wp';
import { FONT_STACKS } from './fonts';

/** A built-in image (path under src/assets/images, or a /public path) or one from WordPress. */
export type SiteImage = string | { src: string; width: number; height: number; alt: string };

type Field = { path: string; type: string; choices?: string[]; min?: number; max?: number };
const FIELDS: Field[] = schema.sections.flatMap((section) => section.fields as Field[]);

/** "content.labels.readStory" → "contentLabelsReadStory", as the plugin names it in GraphQL. */
export const graphqlName = (path: string) =>
    path.split('.').map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))).join('');

const IMAGE_FIELDS = 'node { sourceUrl altText mediaDetails { width height } }';

/** The value WordPress (or the snapshot) holds for a field, checked, or undefined to keep the built-in one. */
function accept(field: Field, raw: unknown): unknown {
    const value = Array.isArray(raw) && field.type !== 'image' ? raw[0] : raw;
    if (value === null || value === undefined || value === '') return undefined;
    switch (field.type) {
        case 'color':
            return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : undefined;
        case 'font':
            return typeof value === 'string' && FONT_STACKS[value] && field.choices?.includes(value) ? value : undefined;
        case 'select':
            return typeof value === 'string' && field.choices?.includes(value) ? value : undefined;
        case 'number': {
            const n = Number(value);
            if (!Number.isFinite(n)) return undefined;
            return Math.round(Math.min(field.max ?? n, Math.max(field.min ?? n, n)));
        }
        case 'image': {
            // From WordPress: { node: { sourceUrl, ... } }. From the snapshot: a local path.
            if (typeof value === 'string') return value;
            const node = (value as any)?.node;
            if (!node?.sourceUrl) return undefined;
            return { src: node.sourceUrl, width: node.mediaDetails?.width, height: node.mediaDetails?.height, alt: node.altText || '' };
        }
        default:
            return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    }
}

function setAt(target: any, path: string, value: unknown) {
    const parts = path.split('.');
    let node = target;
    for (const part of parts.slice(0, -1)) node = node[part];
    node[parts[parts.length - 1]] = value;
}

async function load() {
    const site = structuredClone({ brand: brandDefaults, content: contentDefaults }) as any;

    const query = FIELDS.map((field) => (field.type === 'image' ? `${graphqlName(field.path)} { ${IMAGE_FIELDS} }` : graphqlName(field.path))).join(' ');
    const data = await fetchAPI(`query GetSiteSettings { siteSettings(first: 1) { nodes { siteFields { ${query} } } } }`);
    const saved = data
        ? data.siteSettings?.nodes?.[0]?.siteFields
        : Object.values(import.meta.glob<{ default: Record<string, unknown> }>('../data/site-settings.json', { eager: true }))[0]?.default;

    for (const field of FIELDS) {
        const value = accept(field, saved?.[graphqlName(field.path)]);
        if (value !== undefined) setAt(site, field.path, value);
    }
    return site as {
        brand: Omit<typeof brandDefaults, 'shareImage' | 'favicon'> & { shareImage: SiteImage; favicon: SiteImage };
        content: Omit<typeof contentDefaults, 'awards' | 'serviceStripImages'> & {
            awards: Omit<typeof contentDefaults.awards, 'logos'> & { logos: { name: string; logo: SiteImage }[] };
            serviceStripImages: SiteImage[];
        };
    };
}

export const { brand, content } = await load();

/** Fills "{name}" placeholders in a label, e.g. fill(content.labels.minRead, { n: 5 }). */
export const fill = (template: string, values: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));

/** The CSS font stack for a font name from the settings. */
export const fontStack = (name: string) => FONT_STACKS[name] ?? FONT_STACKS.Inter;
