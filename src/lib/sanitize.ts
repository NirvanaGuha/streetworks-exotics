/**
 * Allowlist cleaning for HTML that reaches the page through set:html. WordPress already
 * cleans what it sends (wp_kses in the plugin); this is the second line, so a compromised
 * editor account or a changed plugin still can't put scripts, event handlers or
 * javascript: links on the site. Runs at build time only.
 */
import sanitizeHtml from 'sanitize-html';

const SCHEMES = ['http', 'https', 'mailto', 'tel'];

// Inline formatting inside article paragraphs, headings, list items, quotes and captions.
const INLINE: sanitizeHtml.IOptions = {
    allowedTags: ['a', 'strong', 'b', 'em', 'i', 'br', 'sup', 'sub', 'code'],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
    allowedSchemes: SCHEMES,
    allowProtocolRelative: false,
    transformTags: {
        // Links to other sites open in a new tab without handing that tab a reference back.
        a: (tagName, attribs) => {
            const external = /^https?:\/\//i.test(attribs.href || '');
            return { tagName, attribs: external ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' } : attribs };
        },
    },
};

// Embeds allowed on plain WordPress pages: video players and maps only.
const IFRAME_HOSTS = ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'www.google.com'];

// Plain WordPress pages (privacy policy, terms and the like): ordinary rich text.
const RICH: sanitizeHtml.IOptions = {
    allowedTags: [
        ...(INLINE.allowedTags as string[]),
        'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'hr', 'figure', 'figcaption',
        'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 'iframe',
    ],
    allowedAttributes: {
        a: ['href', 'title', 'target', 'rel'],
        img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading'],
        iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'loading'],
        th: ['colspan', 'rowspan', 'scope'],
        td: ['colspan', 'rowspan'],
    },
    allowedSchemes: SCHEMES,
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowedIframeHostnames: IFRAME_HOSTS,
    allowProtocolRelative: false,
    transformTags: INLINE.transformTags,
};

export const inlineHtml = (html: string) => sanitizeHtml(html || '', INLINE);
export const richHtml = (html: string) => sanitizeHtml(html || '', RICH);
// Text only, entities kept (for the table of contents and other plain labels).
export const textOnly = (html: string) => sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: {} }).trim();

/**
 * A link from WordPress, kept only if it's a web, mail or phone address or a path on this
 * site, so a javascript: or data: link typed into a field can never reach an href.
 */
export function safeUrl(url: string | null | undefined): string {
    const value = (url || '').trim();
    if (!value) return '';
    if (/^\/(?!\/)|^#/.test(value)) return value;
    try {
        return SCHEMES.includes(new URL(value).protocol.replace(':', '')) ? value : '';
    } catch {
        return '';
    }
}

/** A colour from WordPress, kept only if it's a hex colour, since colours are written into CSS. */
export const safeColor = (color: string | null | undefined) =>
    typeof color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim()) ? color.trim() : '';
