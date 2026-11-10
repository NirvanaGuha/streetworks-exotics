#!/usr/bin/env node
/**
 * Writes src/data/redirects.json: where every address on the client's old WordPress site
 * goes on the new one, so links and search rankings carry over (astro.config.mjs turns each
 * entry into a permanent 301 redirect on Vercel).
 *
 * The old addresses come from the old site's sitemaps and its public WordPress lists
 * (categories, tags, authors, and WooCommerce products and their categories), plus the feed,
 * sitemap and paged-archive addresses WordPress always has. Each is matched to the new site by its last part:
 *
 *   /<slug>               a post or case study with that slug -> /blog/<slug>, /case-studies/<slug>
 *   /<slug>               a service with that slug, or whose slug starts with it -> /services/<slug>
 *   /category/..., /tag/..., /author/..., /blog/page/N, /page/N  -> /blog
 *   /product/<slug>       a part with that slug, or whose slug starts with it -> /parts/<slug>
 *   /product-category/..., /product-tag/..., /shop, other products  -> /parts (when the new site has parts)
 *   /feed, /sitemap_index.xml, /*-sitemap.xml  -> /rss.xml, /sitemap.xml
 *
 * Anything else (an About page, a shop, job adverts) goes to the homepage and is listed at
 * the end, to point somewhere better by hand. Entries already in the file are kept as they
 * are, so hand-made choices survive a re-run; add --refresh to rebuild every entry.
 * Run `npm run snapshot` first when the content lives in WordPress.
 *
 *   node scripts/redirect-map.mjs [old site URL]   (default: "source" in wordpress/imports/*.json)
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'src/data/redirects.json');
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');

async function defaultSource() {
    const dir = path.join(ROOT, 'wordpress/imports');
    for (const file of existsSync(dir) ? await readdir(dir) : []) {
        if (file.endsWith('.json')) return JSON.parse(await readFile(path.join(dir, file), 'utf8')).source;
    }
}
const source = (args.find((arg) => !arg.startsWith('--')) || (await defaultSource()) || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(source)) {
    console.error('Pass the old site address, e.g. node scripts/redirect-map.mjs https://example.com');
    process.exit(1);
}

const get = async (url) => {
    const response = await fetch(url, { headers: { 'User-Agent': 'redirect-map (site migration)' } });
    return response.ok ? response.text() : '';
};
const getJson = async (url) => {
    try {
        return JSON.parse((await get(url)) || '[]');
    } catch {
        return [];
    }
};

// Every address in the sitemaps; a sitemap index lists more sitemaps.
async function sitemapPaths() {
    const paths = new Set();
    const seen = new Set();
    const visit = async (url) => {
        if (seen.has(url)) return;
        seen.add(url);
        const xml = await get(url);
        for (const [, loc] of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
            if (/\.xml$/.test(loc)) await visit(loc);
            else paths.add(loc);
        }
    };
    for (const name of ['sitemap_index.xml', 'sitemap.xml', 'wp-sitemap.xml']) await visit(`${source}/${name}`);
    return [...paths, ...seen].filter((url) => url.startsWith(source)).map((url) => url.slice(source.length) || '/');
}

// Archive addresses WordPress serves but sitemaps often leave out. Archives show ten posts a
// page unless the site changed it, so page 2 onwards is added for any that have more.
async function archivePaths() {
    const out = ['/feed', '/comments/feed'];
    const pages = (count) => Array.from({ length: Math.max(0, Math.ceil(count / 10) - 1) }, (_, i) => `/page/${i + 2}`);
    const categories = await getJson(`${source}/wp-json/wp/v2/categories?per_page=100&_fields=id,slug,parent,count`);
    const byId = new Map(categories.map((category) => [category.id, category]));
    const chain = (category) => (category.parent && byId.has(category.parent) ? `${chain(byId.get(category.parent))}/` : '') + category.slug;
    for (const category of categories) {
        const base = `/category/${chain(category)}`;
        out.push(base, ...pages(category.count).map((page) => base + page));
    }
    for (const tag of await getJson(`${source}/wp-json/wp/v2/tags?per_page=100&_fields=slug`)) out.push(`/tag/${tag.slug}`);
    for (const user of await getJson(`${source}/wp-json/wp/v2/users?per_page=100&_fields=slug`)) out.push(`/author/${user.slug}`);
    const posts = categories.reduce((total, category) => Math.max(total, category.count), 0);
    out.push(...pages(posts * 2).map((page) => `/blog${page}`), ...pages(posts * 2));
    return out;
}

// WooCommerce: product, product category and product tag pages (SEO plugins often leave them out of the
// sitemaps), and the shop's own pages when the old site has them.
async function shopPaths() {
    const out = [];
    for (let page = 1; ; page++) {
        const products = await getJson(`${source}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
        out.push(...products.map((product) => product.permalink));
        if (products.length < 100) break;
    }
    const categories = await getJson(`${source}/wp-json/wc/store/v1/products/categories?per_page=100`);
    out.push(...categories.filter((category) => category.count > 0).map((category) => category.permalink));
    if (!out.length) return [];
    // Tags come without their address; WooCommerce's default is /product-tag/<slug>.
    const tags = (await getJson(`${source}/wp-json/wc/store/v1/products/tags?per_page=100`)).filter((tag) => tag.count > 0).map((tag) => `/product-tag/${tag.slug}`);
    for (const name of [...tags, '/shop', '/cart', '/checkout', '/my-account']) if (await get(`${source}${name}/`)) out.push(`${source}${name}`);
    return out.filter((url) => url?.startsWith(source)).map((url) => url.slice(source.length));
}

const slugs = async (dir) => (existsSync(dir) ? (await readdir(dir)).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5)) : []);
const targets = new Map();
for (const slug of await slugs(path.join(ROOT, 'src/content/posts'))) targets.set(slug, `/blog/${slug}`);
for (const slug of await slugs(path.join(ROOT, 'src/content/case-studies'))) targets.set(slug, `/case-studies/${slug}`);
const services = await slugs(path.join(ROOT, 'src/content/services'));
const parts = await slugs(path.join(ROOT, 'src/content/parts'));
// Addresses the new site serves itself, so they never redirect.
const own = new Set(['/', '/blog', '/case-studies', '/portfolio', ...(parts.length ? ['/parts'] : []), '/rss.xml', '/sitemap.xml', '/robots.txt', '/llms.txt']);

function destination(oldPath) {
    if (/^\/(feed|comments\/feed)$/.test(oldPath)) return '/rss.xml';
    if (/\.xml$/.test(oldPath)) return '/sitemap.xml';
    if (/^\/(category|tag|author)\//.test(oldPath) || /^(\/blog)?\/page\/\d+$/.test(oldPath)) return '/blog';
    const slug = oldPath.split('/').pop();
    if (parts.length && /^\/(product|product-category|product-tag|shop)(\/|$)/.test(oldPath)) {
        const part = oldPath.startsWith('/product/') && (parts.find((name) => name === slug) || parts.find((name) => name.startsWith(`${slug}-`)));
        return part ? `/parts/${part}` : '/parts';
    }
    if (targets.has(slug)) return targets.get(slug);
    const service = services.find((name) => name === slug) || services.find((name) => name.startsWith(`${slug}-`));
    return service ? `/services/${service}` : null;
}

const existing = existsSync(OUT) && !refresh ? JSON.parse(await readFile(OUT, 'utf8')).redirects : {};
const redirects = { ...existing };
const unmatched = [];
const found = [...new Set([...(await sitemapPaths()), ...(await archivePaths()), ...(await shopPaths())])];
for (const raw of found) {
    const oldPath = decodeURI(raw).replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
    if (own.has(oldPath) || oldPath in redirects) continue;
    const to = destination(oldPath);
    if (!to) unmatched.push(oldPath);
    redirects[oldPath] = to || '/';
}

const sorted = Object.fromEntries(Object.entries(redirects).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUT, JSON.stringify({
    _comment: 'Old site address -> new address. Each becomes a permanent (301) redirect; see scripts/redirect-map.mjs. Delete an entry to serve a page at that address instead.',
    redirects: sorted,
}, null, 4) + '\n');

console.log(`${Object.keys(sorted).length} redirects in src/data/redirects.json (${Object.keys(sorted).length - Object.keys(existing).length} new).`);
if (unmatched.length) {
    console.log('\nNo match on the new site, so these go to the homepage; point them somewhere better by hand:');
    unmatched.sort().forEach((oldPath) => console.log(`  ${oldPath}`));
}
