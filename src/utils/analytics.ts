// Google Analytics 4 (the client's existing property, so its history carries on). Layout.astro
// loads this only on the live site, when PUBLIC_GA_MEASUREMENT_ID is set; the CSP in
// vercel.json allows Google's script and endpoints. Moves between pages through the site's
// own navigation are counted by GA4's enhanced measurement (browser history events, on by default).
declare global {
    interface Window { dataLayer: unknown[] }
}

const id = import.meta.env.PUBLIC_GA_MEASUREMENT_ID;
window.dataLayer = window.dataLayer || [];
// gtag.js reads the arguments object itself, so this can't be an arrow function or use ...args.
function gtag(..._: unknown[]) {
    window.dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', id);

const script = document.createElement('script');
script.async = true;
script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
document.head.append(script);

export {};
