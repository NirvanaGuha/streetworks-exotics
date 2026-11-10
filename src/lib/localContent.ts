/**
 * Local content used when WordPress isn't configured, can't be reached during development,
 * or has nothing for a section: services from src/content/services, everything else from
 * src/data/content.json. Shapes match what the pages build from WordPress.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import content from '../data/content.json';
import { asset, siteImage } from './assets';
import { content as site } from './site';
import { seoFromLocal } from './articles';

export { content };

/** Showcases in the shape of the homepage's `showcaseList`. */
export function getLocalShowcases() {
    return content.showcases.map((s) => ({
        ...s,
        image: asset(s.image),
        gallery: s.gallery.map(asset),
    }));
}

/** Testimonials in the shape the reviews sections use. */
export function getLocalTestimonials() {
    return content.testimonials.map((t) => ({ name: t.name, quote: t.quote, photo: asset(t.photo) }));
}

/** The services list's shared first row of photos (Site Settings → Homepage). */
export function getServiceStripImages() {
    return site.serviceStripImages.map(siteImage);
}

type LocalService = CollectionEntry<'services'>['data'];

/**
 * A service's page content as ordered text/gallery sections, matching the WordPress
 * `sections` field. Also reads the older layout (intro paragraphs, gallery images split
 * around a mid text, then a final text).
 */
function serviceSections(data: LocalService) {
    const text = (value?: string) => (value?.trim() ? [{ type: 'text' as const, text: value }] : []);
    const gallery = (images: ImageMetadata[]) => (images.length ? [{ type: 'gallery' as const, images }] : []);
    const intro = text(data.deepTextParagraphs.join('\n\n'));

    if (data.contentBlocks) {
        return [
            ...intro,
            ...data.contentBlocks.flatMap((block) =>
                block.type === 'text' ? text(block.text) : block.type === 'gallery' ? gallery(block.images) : []
            ),
            ...text(data.finalText),
        ];
    }
    const images = data.galleryImages || [];
    const half = Math.ceil(images.length / 2);
    return [...intro, ...gallery(images.slice(0, half)), ...text(data.midText), ...gallery(images.slice(half)), ...text(data.finalText)];
}

async function getOrderedServices() {
    return (await getCollection('services')).sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99));
}

export async function getLocalServiceSlugs() {
    return (await getOrderedServices()).map((entry) => entry.id);
}

/** Services in the shape of the nav's WordPress `services.nodes`. */
export async function getLocalServiceLinks() {
    return (await getOrderedServices()).map(({ id, data }) => ({ title: data.title, slug: id }));
}

/** A service in the shape of the service page's `service` object. */
export async function getLocalService(slug: string) {
    const entry = await getEntry('services', slug);
    if (!entry) return null;
    const { data } = entry;
    return {
        title: data.title,
        heroTagline: data.heroTagline,
        heroImage: data.heroImage,
        heroImageWidth: data.heroImage.width,
        heroImageHeight: data.heroImage.height,
        tintColor: data.tintColor || 'var(--brand-text)',
        seo: seoFromLocal(data),
        deepTextTitle: data.title,
        deepTextParagraphs: [] as string[],
        sections: serviceSections(data),
    };
}

/** Services in the shape of the homepage's `serviceList`. */
export async function getLocalHomepageServices() {
    return (await getOrderedServices()).map(({ id, data }) => ({
        title: data.title,
        tintColor: data.tintColor,
        description: data.description,
        link: `/services/${id}`,
        backgroundImage: data.heroImage,
        galleryImages: serviceSections(data).find((section) => section.type === 'gallery')?.images || [],
    }));
}
