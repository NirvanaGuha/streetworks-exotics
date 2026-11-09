/**
 * Text sections are plain strings: one block per "\n\n". Headings start with "## ",
 * subheadings with "### " and list items with "• " (the WordPress plugin writes them this
 * way, see fire_headless_block_text).
 */
export type TextBlock =
    | { kind: "heading" | "subheading" | "paragraph"; text: string }
    | { kind: "item"; title: string; text: string };

export function parseTextBlocks(text: string): TextBlock[] {
    return text
        .split("\n\n")
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block): TextBlock => {
            if (block.startsWith("### ")) return { kind: "subheading", text: block.slice(4).trim() };
            if (block.startsWith("## ")) return { kind: "heading", text: block.slice(3).trim() };
            if (block.startsWith("•")) {
                // "Engine Rebuilds: Restore your engine…" → a titled item.
                const item = block.replace(/^•\s*/, "");
                const colon = item.indexOf(": ");
                return colon > 0 && colon < 60
                    ? { kind: "item", title: item.slice(0, colon), text: item.slice(colon + 2) }
                    : { kind: "item", title: "", text: item };
            }
            return { kind: "paragraph", text: block };
        });
}

/** Short copy with no headings or list plays as a full-screen statement; the rest as an article. */
export const isStatement = (text: string) =>
    text.length <= 240 && parseTextBlocks(text).every((block) => block.kind === "paragraph");

export type Chapter = { heading?: string; subheading?: string; blocks: TextBlock[] };

/** Groups an article into chapters, each starting at a heading. */
export function toChapters(text: string): Chapter[] {
    const chapters: Chapter[] = [];
    let current: Chapter | null = null;
    for (const block of parseTextBlocks(text)) {
        const hasBody = !!current?.blocks.length;
        if (block.kind === "heading" || (block.kind === "subheading" && (hasBody || current?.subheading))) {
            current = { blocks: [] };
            chapters.push(current);
        }
        if (!current) {
            current = { blocks: [] };
            chapters.push(current);
        }
        if (block.kind === "heading") current.heading = block.text;
        else if (block.kind === "subheading") current.subheading = block.text;
        else current.blocks.push(block);
    }
    return chapters;
}
