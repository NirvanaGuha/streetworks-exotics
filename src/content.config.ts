import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const services = defineCollection({
    loader: glob({ pattern: "**/*.json", base: "./src/content/services" }),
    schema: ({ image }) => z.object({
        order: z.number().optional(),
        title: z.string(),
        heroTagline: z.string(),
        description: z.string(),
        heroImage: image(),
        tintColor: z.string().optional(),
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

export const collections = { services };
