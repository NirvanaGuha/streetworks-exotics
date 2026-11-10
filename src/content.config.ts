import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Search & sharing overrides (WordPress: the page's "Search & sharing" box).
const seo = (image: () => any) =>
    z.object({ title: z.string().default(''), description: z.string().default(''), image: image().optional() }).optional();

const services = defineCollection({
    loader: glob({ pattern: "**/*.json", base: "./src/content/services" }),
    schema: ({ image }) => z.object({
        order: z.number().optional(),
        title: z.string(),
        heroTagline: z.string(),
        description: z.string(),
        heroImage: image(),
        tintColor: z.string().optional(),
        seo: seo(image),
        deepTextTitle: z.string(),
        deepTextParagraphs: z.array(z.string()),
        midText: z.string().optional(),
        finalText: z.string().optional(),
        galleryImages: z.array(image()).optional(),
        contentBlocks: z.array(z.discriminatedUnion('type', [
            z.object({
                type: z.literal('gallery'),
                images: z.array(image())
            }),
            z.object({
                type: z.literal('text'),
                text: z.string(),
                id: z.string().optional() // Allow optional ID for targeting
            }),
            z.object({
                type: z.literal('reviews')
            })
        ])).optional()
    })
});

// Posts and case studies: the same blocks as the plugin's `articleBlocks` field, with
// images as paths (see scripts/snapshot-wordpress.mjs).
const article = ({ image }: { image: () => any }) => {
    const picture = z.object({ src: image(), alt: z.string().default(''), caption: z.string().default('') });
    return {
        title: z.string(),
        date: z.string(),
        excerpt: z.string().default(''),
        byline: z.string().default(''),
        image: image().optional(),
        imageAlt: z.string().default(''),
        seo: seo(image),
        blocks: z.array(z.discriminatedUnion('type', [
            z.object({ type: z.literal('paragraph'), html: z.string() }),
            z.object({ type: z.literal('heading'), level: z.number(), html: z.string() }),
            z.object({ type: z.literal('list'), ordered: z.boolean().default(false), items: z.array(z.string()) }),
            z.object({ type: z.literal('quote'), html: z.string(), cite: z.string().default('') }),
            z.object({ type: z.literal('image'), images: z.array(picture) }),
            z.object({ type: z.literal('gallery'), images: z.array(picture) }),
            z.object({ type: z.literal('embed'), url: z.string(), provider: z.string().default('') }),
            z.object({ type: z.literal('audio'), url: z.string(), caption: z.string().default('') }),
            z.object({ type: z.literal('video'), url: z.string(), caption: z.string().default('') }),
        ])),
    };
};

const posts = defineCollection({
    loader: glob({ pattern: "**/*.json", base: "./src/content/posts" }),
    schema: (helpers) => z.object({
        ...article(helpers),
        categories: z.array(z.object({ name: z.string(), slug: z.string() })).default([]),
    })
});

const caseStudies = defineCollection({
    loader: glob({ pattern: "**/*.json", base: "./src/content/case-studies" }),
    schema: (helpers) => z.object({
        ...article(helpers),
        order: z.number().optional(),
        vehicle: z.string().default(''),
        year: z.string().default(''),
        scope: z.string().default(''),
        recognition: z.string().default(''),
    })
});

// Parts the shop sells on request: the first image is the main photo.
const parts = defineCollection({
    loader: glob({ pattern: "**/*.json", base: "./src/content/parts" }),
    schema: ({ image }) => z.object({
        order: z.number().optional(),
        title: z.string(),
        fits: z.string().default(''),
        description: z.string().default(''),
        images: z.array(z.object({ src: image(), alt: z.string().default('') })).default([]),
        seo: seo(image),
    })
});

export const collections = { services, posts, caseStudies, parts };
