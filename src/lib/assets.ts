import type { ImageMetadata } from 'astro';

// Every image under src/assets/images, keyed by its path relative to that folder,
// so JSON content files can refer to images by path (e.g. "homepage/hero.jpg").
const images = import.meta.glob<{ default: ImageMetadata }>('/src/assets/images/**/*.{jpg,jpeg,png,webp,avif}', { eager: true });

export function asset(path: string): ImageMetadata {
    const image = images[`/src/assets/images/${path}`];
    if (!image) throw new Error(`Image not found in src/assets/images: ${path}`);
    return image.default;
}
