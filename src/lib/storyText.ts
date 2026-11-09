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

const serialize = (blocks: TextBlock[]) =>
    blocks
        .map((block) => {
            if (block.kind === "heading") return `## ${block.text}`;
            if (block.kind === "subheading") return `### ${block.text}`;
            if (block.kind === "item") return `• ${block.title ? `${block.title}: ` : ""}${block.text}`;
            return block.text;
        })
        .join("\n\n");

/**
 * Splits a case study's words off the front of a text section: its opening heading becomes
 * the title and the first paragraph the intro (a long paragraph gives its first sentences,
 * up to about `introChars`). Whatever is left carries on as normal copy.
 */
export function takeCaption(text: string, introChars = 220): { title?: string; intro?: string; rest: string } {
    const blocks = parseTextBlocks(text);
    const title = blocks[0]?.kind === "heading" ? blocks.shift()!.text : undefined;
    let intro: string | undefined;
    const first = blocks[0];
    if (first?.kind === "paragraph") {
        blocks.shift();
        const sentences = first.text.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) ?? [first.text];
        let taken = 0;
        let length = 0;
        while (taken < sentences.length && (taken === 0 || length + sentences[taken].length <= introChars)) {
            length += sentences[taken].length;
            taken++;
        }
        intro = sentences.slice(0, taken).join("").trim();
        const remainder = sentences.slice(taken).join("").trim();
        if (remainder) blocks.unshift({ kind: "paragraph", text: remainder });
    }
    return { title, intro, rest: serialize(blocks) };
}
