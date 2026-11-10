/**
 * The fonts offered under Site Settings → Fonts, by the name WordPress stores, with the
 * CSS font stack each one sets. All are self-hosted (styles/fonts.css declares them);
 * a visitor's browser downloads only the ones a page actually uses.
 * To offer another font: install its @fontsource package, import it in fonts.css, add it
 * here and to the matching "choices" list in wordpress/fire-headless/site-settings.json.
 */
export const FONT_STACKS: Record<string, string> = {
    Archivo: "'Archivo Variable', system-ui, sans-serif",
    Oswald: "'Oswald Variable', system-ui, sans-serif",
    'Bebas Neue': "'Bebas Neue', system-ui, sans-serif",
    Anton: "'Anton', system-ui, sans-serif",
    Montserrat: "'Montserrat Variable', system-ui, sans-serif",
    'Space Grotesk': "'Space Grotesk Variable', system-ui, sans-serif",
    'Playfair Display': "'Playfair Display Variable', Georgia, serif",
    Inter: "'Inter Variable', system-ui, sans-serif",
    Manrope: "'Manrope Variable', system-ui, sans-serif",
    'DM Sans': "'DM Sans Variable', system-ui, sans-serif",
    Lato: "'Lato', system-ui, sans-serif",
    'Instrument Serif': "'Instrument Serif', Georgia, serif",
    'Cormorant Garamond': "'Cormorant Garamond Variable', Georgia, serif",
    Lora: "'Lora Variable', Georgia, serif",
    'DM Serif Display': "'DM Serif Display', Georgia, serif",
};
