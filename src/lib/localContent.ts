/**
 * Local service content (src/content/services) used when WordPress isn't configured
 * or can't be reached during development. Shapes match what the pages build from WordPress.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

type LocalService = CollectionEntry<'services'>['data'];

function splitBlocks(data: LocalService) {
    const intro = data.deepTextParagraphs.join('\n\n');
    if (data.contentBlocks) {
        const texts = data.contentBlocks.flatMap((b) => (b.type === 'text' ? [b.text] : []));
        const galleries = data.contentBlocks.flatMap((b) => (b.type === 'gallery' ? [b.images] : []));
        return { texts: [intro, ...texts], galleries };
    }
    const images = data.galleryImages || [];
    const half = Math.ceil(images.length / 2);
    return {
        texts: [intro, data.midText || ''],
        galleries: [images.slice(0, half), images.slice(half)],
    };
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
    const { texts, galleries } = splitBlocks(data);
    return {
        title: data.title,
        heroTagline: data.heroTagline,
        heroImage: data.heroImage,
        heroImageWidth: data.heroImage.width,
        heroImageHeight: data.heroImage.height,
        tintColor: data.tintColor || '#ffffff',
        deepTextTitle: data.title,
        deepTextParagraphs: [] as string[],
        text1: texts[0] || '',
        gallery1: galleries[0] || [],
        text2: texts[1] || '',
        gallery2: galleries[1] || [],
        textCta: data.finalText || texts[2] || 'Ready to get in touch?',
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
        galleryImages: splitBlocks(data).galleries[0] || [],
    }));
}
