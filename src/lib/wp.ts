/**
 * A lightweight GraphQL client for fetching data from WordPress.
 */
export async function fetchAPI(query: string, { variables }: { variables?: any } = {}) {
    const res = await fetch(import.meta.env.PUBLIC_WP_GRAPHQL_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
            variables,
        }),
    });

    if (!res.ok) {
        throw new Error('Failed to fetch API');
    }

    const json = await res.json();
    if (json.errors) {
        console.error(json.errors);
        throw new Error('Failed to fetch API');
    }

    return json.data;
}

function decodeEntities(text: string) {
    if (!text) return "";
    return text
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/&[a-z]+;/gi, (match) => {
            const entities: Record<string, string> = {
                '&amp;': '&',
                '&quot;': '"',
                '&lt;': '<',
                '&gt;': '>',
                '&nbsp;': ' ',
                '&apos;': "'"
            };
            return entities[match.toLowerCase()] || match;
        });
}

function cleanAndCombineText(html: string) {
    if (!html) return "";
    
    // 1. Convert block starts to newlines and handle list items
    let structured = html
        .replace(/<(p|h[1-6]|blockquote|div)[^>]*>/gi, '\n\n')
        .replace(/<li[^>]*>/gi, '\n• ');
    
    // 2. Remove all remaining HTML tags
    structured = structured.replace(/<[^>]*>?/gm, '');
    
    // 3. Decode HTML entities
    structured = decodeEntities(structured);
    
    // 4. Normalize whitespace (but keep the newlines we added)
    // First, remove horizontal tabs/multiple spaces
    structured = structured.replace(/[ \t]+/g, ' ');
    // Second, collapse 3+ newlines into 2 to prevent excessive gaps
    structured = structured.replace(/\n{3,}/g, '\n\n');
    
    return structured.trim();
}

function extractGalleryImages(html: string) {
    const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/gi;
    const images: any[] = [];
    let imgMatch;
    
    while ((imgMatch = imgRegex.exec(html)) !== null) {
        const url = imgMatch[1];
        const imgTagHTML = imgMatch[0];
        
        const widthMatch = imgTagHTML.match(/width="(\d+)"/i);
        const heightMatch = imgTagHTML.match(/height="(\d+)"/i);
        const width = widthMatch ? parseInt(widthMatch[1]) : 1200;
        const height = heightMatch ? parseInt(heightMatch[1]) : 800;
        
        images.push({ url, width, height });
    }
    return images;
}

export function parseWPBlocks(html: string) {
    if (!html) return [];

    const blocks: any[] = [];
    
    // This regex looks for the start of a gallery and finds its likely end
    // (the double figure closing tags typical of Gutenberg).
    const galleryRegex = /<figure[^>]*wp-block-gallery[\s\S]+?<\/figure>\s*<\/figure>/gi;
    
    let lastIndex = 0;
    let match;

    while ((match = galleryRegex.exec(html)) !== null) {
        // 1. Process any text that appeared BEFORE this gallery
        const textBefore = html.substring(lastIndex, match.index).trim();
        if (textBefore) {
            const cleanText = cleanAndCombineText(textBefore);
            if (cleanText.length > 5) {
                blocks.push({ type: 'text', text: cleanText });
            }
        }

        // 2. Process the gallery itself
        const images = extractGalleryImages(match[0]);
        if (images.length > 0) {
            blocks.push({ type: 'gallery', images });
        }

        lastIndex = galleryRegex.lastIndex;
    }

    // 3. Process any remaining text AFTER the last gallery
    const remainingText = html.substring(lastIndex).trim();
    if (remainingText) {
        const cleanText = cleanAndCombineText(remainingText);
        if (cleanText.length > 5) {
            blocks.push({ type: 'text', text: cleanText });
        }
    }

    return blocks;
}
