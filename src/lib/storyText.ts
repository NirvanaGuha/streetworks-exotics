/**
 * Text sections are plain strings: one block per "\n\n", headings start with "## " and list
 * items with "• " (the WordPress plugin writes them this way, see fire_headless_block_text).
 */
export type TextBlock = { kind: "heading" | "paragraph" | "bullet"; text: string };

export function parseTextBlocks(text: string): TextBlock[] {
    return text
        .split("\n\n")
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) =>
            block.startsWith("## ")
                ? { kind: "heading" as const, text: block.slice(3).trim() }
                : { kind: block.startsWith("•") ? ("bullet" as const) : ("paragraph" as const), text: block }
        );
}

export const hasHeading = (text: string) => parseTextBlocks(text).some((block) => block.kind === "heading");

/**
 * Splits a text section into screens that fit one pinned frame each: every heading starts a
 * new screen, and a screen closes once adding the next block would pass `maxChars`.
 */
export function splitTextScreens(text: string, maxChars = 750): string[] {
    const screens: TextBlock[][] = [];
    let current: TextBlock[] = [];
    let length = 0;
    for (const block of parseTextBlocks(text)) {
        const hasBody = current.some((b) => b.kind !== "heading");
        if (hasBody && (block.kind === "heading" || length + block.text.length > maxChars)) {
            screens.push(current);
            current = [];
            length = 0;
        }
        current.push(block);
        length += block.text.length;
    }
    if (current.length) screens.push(current);
    return screens.map((blocks) => blocks.map((b) => (b.kind === "heading" ? `## ${b.text}` : b.text)).join("\n\n"));
}
