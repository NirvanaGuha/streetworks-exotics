// Concept/pitch builds: hidden from search engines and labelled as a concept.
// Set PUBLIC_DEMO_MODE=false (or remove it) when the site goes live for the client.
export const demoMode = import.meta.env.PUBLIC_DEMO_MODE === 'true';
export const demoCredit = demoMode ? import.meta.env.PUBLIC_DEMO_CREDIT || 'Concept by The FIRE Web Project' : null;
