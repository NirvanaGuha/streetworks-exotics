/**
 * Showcases (featured builds) from WordPress, ordered by "Order", falling back to
 * src/data/content.json. The homepage shows the first `content.homepageShowcases`;
 * the portfolio page shows them all.
 */
import { fetchAPI } from './wp';
import { getLocalShowcases } from './localContent';
import { safeColor, safeUrl } from './sanitize';

export async function getShowcases() {
    const data = await fetchAPI(`
      query GetShowcases {
        showcases(first: 100, where: { orderby: { field: MENU_ORDER, order: ASC } }) {
          nodes {
            title
            slug
            featuredImage { node { sourceUrl } }
            showcaseDetails {
              year
              description
              accentColor
              ctaLink
              galleryImage1 { node { sourceUrl } }
              galleryImage2 { node { sourceUrl } }
              galleryImage3 { node { sourceUrl } }
            }
          }
        }
      }
    `);

    const wpShowcases = (data?.showcases?.nodes || [])
        .filter((s: any) => s.featuredImage)
        .map((s: any) => ({
            title: s.title as string,
            year: (s.showcaseDetails?.year || '') as string,
            description: (s.showcaseDetails?.description || '') as string,
            accentColor: safeColor(s.showcaseDetails?.accentColor) || undefined,
            ctaLink: safeUrl(s.showcaseDetails?.ctaLink) || undefined,
            image: s.featuredImage.node.sourceUrl as string,
            gallery: [s.showcaseDetails?.galleryImage1, s.showcaseDetails?.galleryImage2, s.showcaseDetails?.galleryImage3]
                .filter(Boolean)
                .map((img: any) => img.node.sourceUrl as string),
        }));

    return wpShowcases.length > 0 ? wpShowcases : getLocalShowcases();
}
