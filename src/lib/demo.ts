// Concept/pitch builds: hidden from search engines and labelled as a concept.
// On unless PUBLIC_DEMO_MODE=false, so a deploy that's missing the setting never goes out
// indexable; set it to false only when the site goes live for the client.
export const demoMode = import.meta.env.PUBLIC_DEMO_MODE !== 'false';
export const demoCredit = demoMode ? import.meta.env.PUBLIC_DEMO_CREDIT || 'Concept by The FIRE Web Project' : null;
