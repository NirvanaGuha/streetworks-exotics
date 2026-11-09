/**
 * The shop's contact details, video and social links: the Business Details fields
 * on the WordPress front page, falling back to src/data/brand.json for anything empty.
 */
import brand from '../data/brand.json';
import { fetchAPI } from './wp';

const SOCIAL_NETWORKS = ['instagram', 'facebook', 'youtube', 'tiktok'] as const;
type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

function youTubeId(url: string) {
    const match = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
    return match ? match[1] : /^[\w-]{11}$/.test(url) ? url : null;
}

let cached: ReturnType<typeof load> | undefined;

async function load() {
    const data = await fetchAPI(`
      query GetBusinessDetails {
        page(id: "/", idType: URI) {
          businessDetails {
            businessName
            address
            phone
            email
            mapsUrl
            videoUrl
            instagramUrl
            facebookUrl
            youtubeUrl
            tiktokUrl
          }
        }
      }
    `);
    const wp = data?.page?.businessDetails || {};
    const fallback = brand.business;

    const phone: string = wp.phone || fallback.phone;
    const address: string[] = wp.address
        ? wp.address.split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean)
        : fallback.address;

    const socials = SOCIAL_NETWORKS.map((network: SocialNetwork) => ({
        network,
        url: (wp[`${network}Url`] as string) || fallback.socials[network] || '',
    })).filter((s) => s.url);

    return {
        name: (wp.businessName as string) || fallback.name,
        address,
        phone,
        phoneHref: `tel:${phone.replace(/[^\d+]/g, '')}`,
        email: (wp.email as string) || fallback.email,
        mapsUrl: (wp.mapsUrl as string) || fallback.mapsUrl,
        videoId: youTubeId((wp.videoUrl as string) || fallback.videoUrl),
        socials,
    };
}

/** Fetched once per production build; fresh on every request in development. */
export function getBusiness() {
    if (!import.meta.env.PROD) return load();
    return (cached ??= load());
}
