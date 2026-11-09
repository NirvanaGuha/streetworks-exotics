#!/usr/bin/env node
/**
 * Copies the WordPress content into the site's local fallback files, so a build without
 * WordPress (e.g. a public demo on Vercel) shows exactly what WordPress has:
 *
 *   src/content/services/<slug>.json   title, order, tagline, tint, hero image, text and gallery blocks
 *   src/data/content.json              hero headline/tagline and the three intro texts
 *
 * Images are matched to files already in src/assets/images by name; anything without an
 * exact match is downloaded from WordPress into src/assets/images/wordpress/.
 *
 *   node --env-file=.env scripts/snapshot-wordpress.mjs
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'src/assets/images');
const SERVICES = path.join(ROOT, 'src/content/services');
const CONTENT = path.join(ROOT, 'src/data/content.json');
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

// Same rules as parseWPBlocks() in src/lib/wp.ts: text between galleries becomes one text block.
function decode(text) {
    return text
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/&(amp|quot|lt|gt|nbsp|apos);/gi, (m) => ({ '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&apos;': "'" })[m.toLowerCase()]);
}
function cleanText(html) {
    let text = html.replace(/<(p|h[1-6]|blockquote|div)[^>]*>/gi, '\n\n').replace(/<li[^>]*>/gi, '\n• ');
    text = decode(text.replace(/<[^>]*>?/gm, ''));
    return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function parseBlocks(html) {
    const blocks = [];
    const galleryRegex = /<figure[^>]*wp-block-gallery[\s\S]+?<\/figure>\s*<\/figure>/gi;
    let last = 0;
    let match;
    const pushText = (chunk) => {
        const text = cleanText(chunk);
        if (text.length > 5) blocks.push({ type: 'text', text });
    };
    while ((match = galleryRegex.exec(html)) !== null) {
        pushText(html.slice(last, match.index));
        const images = [...match[0].matchAll(/<img[^>]*src="([^"]+)"/gi)].map((m) => m[1]);
        if (images.length) blocks.push({ type: 'gallery', images });
        last = galleryRegex.lastIndex;
    }
    pushText(html.slice(last));
    return blocks;
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

/** WordPress image URL -> path under src/assets/images (downloading the original if needed). */
async function localImage(url) {
    const original = url.replace(/-\d+x\d+(?=\.\w+$)/, ''); // drop WordPress's size suffix
    const name = decodeURIComponent(original.split('/').pop());
    const existing = localImages.get(name.toLowerCase());
    if (existing) return existing;

    await mkdir(path.join(ASSETS, 'wordpress'), { recursive: true });
    const res = await fetch(original);
    if (!res.ok) throw new Error(`Could not download ${original}: ${res.status}`);
    await writeFile(path.join(ASSETS, 'wordpress', name), Buffer.from(await res.arrayBuffer()));
    const rel = path.join('wordpress', name);
    localImages.set(name.toLowerCase(), rel);
    console.log(`  downloaded ${rel}`);
    return rel;
}
const servicePath = (rel) => `../../assets/images/${rel}`;

await indexImages(ASSETS);

const data = await query(`{
  page(id: "/", idType: URI) { homepageSettings { heroHeadline heroTagline introText1 introText2 introText3 } }
  services(first: 100, where: { orderby: { field: MENU_ORDER, order: ASC } }) {
    nodes { slug title menuOrder content featuredImage { node { sourceUrl } } serviceDetails { description tintColor } }
  }
}`);

for (const service of data.services.nodes) {
    const file = path.join(SERVICES, `${service.slug}.json`);
    const previous = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : {};
    const contentBlocks = [];
    for (const block of parseBlocks(service.content || '')) {
        contentBlocks.push(block.type === 'gallery'
            ? { type: 'gallery', images: await Promise.all(block.images.map(async (u) => servicePath(await localImage(u)))) }
            : block);
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
        deepTextTitle: service.title,
        deepTextParagraphs: [],
        contentBlocks,
    };
    await writeFile(file, JSON.stringify(entry, null, 2) + '\n');
    console.log(`service ${service.slug}: ${contentBlocks.filter((b) => b.type === 'text').length} texts, ${contentBlocks.filter((b) => b.type === 'gallery').length} galleries`);
}

const home = data.page?.homepageSettings;
if (home) {
    const content = JSON.parse(await readFile(CONTENT, 'utf8'));
    content.hero.headline = home.heroHeadline || content.hero.headline;
    content.hero.tagline = home.heroTagline || content.hero.tagline;
    content.introTexts = [home.introText1, home.introText2, home.introText3].map((t, i) => t || content.introTexts[i]);
    await writeFile(CONTENT, JSON.stringify(content, null, 4) + '\n');
    console.log('homepage hero and intro texts updated');
}
