#!/usr/bin/env node
/**
 * Copies the WordPress content into the site's local fallback files, so a build without
 * WordPress (e.g. a public demo on Vercel) shows exactly what WordPress has:
 *
 *   src/content/services/<slug>.json       title, order, tagline, tint, hero image, text and gallery blocks
 *   src/content/posts/<slug>.json          blog posts: title, date, categories, byline, photo, blocks
 *   src/content/case-studies/<slug>.json   case studies: the same plus order and the car's details
 *   src/data/content.json                  hero headline/tagline and the three intro texts
 *   src/data/site-settings.json            everything under Site Settings (colours, fonts, labels, headings, images)
 *
 * Images are matched to files already in src/assets/images by name; anything without an
 * exact match is downloaded from WordPress into src/assets/images/wordpress/ (post and case
 * study photos into src/assets/images/articles/, at most 2000px across to keep the repo small).
 * Post and case study files that WordPress no longer has are removed.
 *
 *   node --env-file=.env scripts/snapshot-wordpress.mjs
 */
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'src/assets/images');
const SERVICES = path.join(ROOT, 'src/content/services');
const POSTS = path.join(ROOT, 'src/content/posts');
const CASE_STUDIES = path.join(ROOT, 'src/content/case-studies');
const CONTENT = path.join(ROOT, 'src/data/content.json');
const SETTINGS = path.join(ROOT, 'src/data/site-settings.json');
const SCHEMA = JSON.parse(await readFile(path.join(ROOT, 'wordpress/fire-headless/site-settings.json'), 'utf8'));
const SEO = 'pageSeo { seoTitle seoDescription seoImage { node { sourceUrl } } }';
const GRAPHQL = process.env.PUBLIC_WP_GRAPHQL_URL;

if (!GRAPHQL) {
    console.error('Set PUBLIC_WP_GRAPHQL_URL (e.g. run with --env-file=.env).');
    process.exit(1);
}

async function query(q) {
    const res = await fetch(GRAPHQL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || res.statusText));
    return json.data;
}

// Local image index: exact file name (case-insensitive) -> path relative to src/assets/images
const localImages = new Map();
async function indexImages(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await indexImages(full);
        else localImages.set(entry.name.toLowerCase(), path.relative(ASSETS, full));
    }
}

/**
 * WordPress image URL -> path under src/assets/images (downloading the original if needed).
 * `maxSize` caps the longer side of a downloaded photo.
 */
async function localImage(url, { folder = 'wordpress', maxSize } = {}) {
    const original = url.replace(/-\d+x\d+(?=\.\w+$)/, ''); // drop WordPress's size suffix
    const name = decodeURIComponent(original.split('/').pop());
    const existing = localImages.get(name.toLowerCase());
    if (existing) return existing;

    await mkdir(path.join(ASSETS, folder), { recursive: true });
    const res = await fetch(original);
    if (!res.ok) throw new Error(`Could not download ${original}: ${res.status}`);
    let file = Buffer.from(await res.arrayBuffer());
    if (maxSize && /\.(jpe?g|png|webp)$/i.test(name)) {
        const image = sharp(file).rotate().resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });
        file = await (/\.png$/i.test(name) ? image.png() : /\.webp$/i.test(name) ? image.webp({ quality: 82 }) : image.jpeg({ quality: 82, mozjpeg: true })).toBuffer();
    }
    await writeFile(path.join(ASSETS, folder, name), file);
    const rel = path.join(folder, name);
    localImages.set(name.toLowerCase(), rel);
    console.log(`  downloaded ${rel}`);
    return rel;
}
const servicePath = (rel) => `../../assets/images/${rel}`;

/** A page's "Search & sharing" box, or nothing when it's empty. */
async function seoEntry(node, image) {
    const seo = node.pageSeo;
    const url = seo?.seoImage?.node?.sourceUrl;
    if (!seo?.seoTitle && !seo?.seoDescription && !url) return {};
    return { seo: { title: seo.seoTitle || '', description: seo.seoDescription || '', ...(url && { image: await image(url) }) } };
}

await indexImages(ASSETS);

const data = await query(`{
  page(id: "/", idType: URI) { homepageSettings { heroHeadline heroTagline introText1 introText2 introText3 } }
  services(first: 100, where: { orderby: { field: MENU_ORDER, order: ASC } }) {
    nodes { slug title menuOrder sections { type text images { url } } featuredImage { node { sourceUrl } } serviceDetails { description tintColor } ${SEO} }
  }
}`);

for (const service of data.services.nodes) {
    const file = path.join(SERVICES, `${service.slug}.json`);
    const previous = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : {};
    const contentBlocks = [];
    // The plugin's `sections` field: ordered text and gallery sections (see wordpress/fire-headless).
    for (const section of service.sections || []) {
        contentBlocks.push(section.type === 'gallery'
            ? { type: 'gallery', images: await Promise.all(section.images.map(async (img) => servicePath(await localImage(img.url)))) }
            : { type: 'text', text: section.text });
    }
    const tagline = (service.serviceDetails?.description || '').trim();
    const heroUrl = service.featuredImage?.node?.sourceUrl;
    const entry = {
        order: service.menuOrder || previous.order,
        title: service.title,
        heroTagline: tagline,
        description: tagline,
        heroImage: heroUrl ? servicePath(await localImage(heroUrl)) : previous.heroImage,
        tintColor: service.serviceDetails?.tintColor || previous.tintColor,
        ...(await seoEntry(service, async (url) => servicePath(await localImage(url)))),
        deepTextTitle: service.title,
        deepTextParagraphs: [],
        contentBlocks,
    };
    await writeFile(file, JSON.stringify(entry, null, 2) + '\n');
    console.log(`service ${service.slug}: ${contentBlocks.filter((b) => b.type === 'text').length} texts, ${contentBlocks.filter((b) => b.type === 'gallery').length} galleries`);
}

// Posts and case studies: the plugin's `articleBlocks`, with photos copied in.
const ARTICLE_FIELDS = `slug title date excerpt menuOrder
    featuredImage { node { sourceUrl altText } }
    articleDetails { byline }
    ${SEO}
    articleBlocks { type level html ordered items cite url provider caption images { url alt caption } }`;
const articles = await query(`{
  posts(first: 100) { nodes { ${ARTICLE_FIELDS.replace('menuOrder', '')} categories { nodes { name slug } } } }
  caseStudies(first: 100) { nodes { ${ARTICLE_FIELDS} caseStudyDetails { vehicle year scope recognition } } }
}`);
const plain = (html) => (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(amp|quot|lt|gt|nbsp|hellip);/g, (_, name) => ({ amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ', hellip: '…' })[name])
    .replace(/\s*\[…\]\s*$/, '…')
    .replace(/\s+/g, ' ')
    .trim();
const articleImage = async (url) => servicePath(await localImage(url, { folder: 'articles', maxSize: 2000 }));

async function writeArticles(nodes, dir, extra) {
    await mkdir(dir, { recursive: true });
    const keep = new Set();
    for (const node of nodes) {
        const blocks = [];
        for (const block of node.articleBlocks || []) {
            const { type } = block;
            if (type === 'image' || type === 'gallery') {
                const images = [];
                for (const img of block.images || []) images.push({ src: await articleImage(img.url), alt: img.alt || '', caption: img.caption || '' });
                if (images.length) blocks.push({ type, images });
            } else if (type === 'heading') blocks.push({ type, level: block.level, html: block.html });
            else if (type === 'list') blocks.push({ type, ordered: !!block.ordered, items: block.items });
            else if (type === 'quote') blocks.push({ type, html: block.html, cite: block.cite || '' });
            else if (type === 'embed') blocks.push({ type, url: block.url, provider: block.provider || '' });
            else if (type === 'audio' || type === 'video') blocks.push({ type, url: block.url, caption: block.caption || '' });
            else blocks.push({ type: 'paragraph', html: block.html });
        }
        const featured = node.featuredImage?.node;
        const entry = {
            title: node.title,
            date: node.date,
            excerpt: plain(node.excerpt),
            byline: node.articleDetails?.byline || '',
            ...(featured && { image: await articleImage(featured.sourceUrl), imageAlt: featured.altText || '' }),
            ...extra(node),
            ...(await seoEntry(node, articleImage)),
            blocks,
        };
        await writeFile(path.join(dir, `${node.slug}.json`), JSON.stringify(entry, null, 2) + '\n');
        keep.add(`${node.slug}.json`);
        console.log(`${path.basename(dir)} ${node.slug}: ${blocks.length} blocks`);
    }
    for (const file of await readdir(dir)) {
        if (file.endsWith('.json') && !keep.has(file)) {
            await rm(path.join(dir, file));
            console.log(`  removed ${path.basename(dir)}/${file} (no longer in WordPress)`);
        }
    }
}

await writeArticles(articles.posts.nodes, POSTS, (node) => ({ categories: node.categories?.nodes || [] }));
await writeArticles(articles.caseStudies.nodes, CASE_STUDIES, (node) => ({
    order: node.menuOrder,
    ...Object.fromEntries(['vehicle', 'year', 'scope', 'recognition'].map((field) => [field, node.caseStudyDetails?.[field] || ''])),
}));

const home = data.page?.homepageSettings;
if (home) {
    const content = JSON.parse(await readFile(CONTENT, 'utf8'));
    content.hero.headline = home.heroHeadline || content.hero.headline;
    content.hero.tagline = home.heroTagline || content.hero.tagline;
    content.introTexts = [home.introText1, home.introText2, home.introText3].map((t, i) => t || content.introTexts[i]);
    await writeFile(CONTENT, JSON.stringify(content, null, 4) + '\n');
    console.log('homepage hero and intro texts updated');
}

// Site Settings, by GraphQL name, as src/lib/site.ts reads them; images copied in.
const graphqlName = (p) => p.split('.').map((part, i) => (i ? part[0].toUpperCase() + part.slice(1) : part)).join('');
const fields = SCHEMA.sections.flatMap((section) => section.fields);
const settingsQuery = fields.map((f) => (f.type === 'image' ? `${graphqlName(f.path)} { node { sourceUrl } }` : graphqlName(f.path))).join(' ');
const saved = (await query(`{ siteSettings(first: 1) { nodes { siteFields { ${settingsQuery} } } } }`)).siteSettings?.nodes?.[0]?.siteFields || {};
const settings = {};
for (const field of fields) {
    const name = graphqlName(field.path);
    let value = saved[name];
    if (Array.isArray(value)) value = value[0];
    if (value === null || value === undefined || value === '') continue;
    settings[name] = field.type === 'image' ? (value.node?.sourceUrl ? await localImage(value.node.sourceUrl, { folder: 'settings' }) : undefined) : value;
}
await writeFile(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
console.log(`site settings: ${Object.keys(settings).length} fields`);
