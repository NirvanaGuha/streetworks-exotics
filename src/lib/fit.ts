/**
 * Phone font size for an uppercase display heading, from its longest word, so no word is
 * wider than a 375px screen (the heading font runs about 0.7em a letter). Use it in place
 * of the heading's base size; larger screens keep their own sizes.
 */
export function phoneSize(text: string) {
    const longest = Math.max(...text.split(/\s+/).map((word) => word.length));
    return longest > 11 ? "text-[2.25rem]" : longest > 9 ? "text-[2.6rem]" : longest > 7 ? "text-5xl" : "text-6xl";
}

/**
 * Size for a car's name set in a narrow column beside a photo (case study listing and the
 * next-case-study link): names with a long word step down, so no word breaks.
 */
export function columnSize(text: string) {
    const longest = Math.max(...text.split(/\s+/).map((word) => word.length));
    return longest > 8 ? "text-4xl md:text-[2.6rem] lg:text-5xl" : "text-4xl md:text-5xl lg:text-6xl";
}
