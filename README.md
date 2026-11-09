# StreetWorks Exotics — cinematic site on headless WordPress

A scroll-driven Astro site (GSAP + Lenis) whose content lives in WordPress. The shop keeps editing in the WordPress admin; Astro builds the public pages from it.

```
WordPress (admin + content) ──WPGraphQL──▶ Astro build ──▶ static pages
                         ◀──REST (contact form)── Astro server action
```

- **Pages** are prerendered at build time from WordPress. Publishing in WordPress needs a rebuild to show up (a deploy hook does this in hosting).
- **Contact form** is the only thing that runs on demand: an Astro Action posts to WordPress, which saves an *Enquiry* and emails the shop.
- **Fallbacks:** with no WordPress URL set, or WordPress unreachable in development, the site renders from `src/content/services` and the built-in defaults. A **production build fails** if WordPress can't be reached, so a bad build never replaces the live site with placeholder content.

## WordPress setup

Plugins (all free): **WPGraphQL**, **Advanced Custom Fields**, **WPGraphQL for ACF**, and this repo's **FIRE Headless Content Model** (`wordpress/fire-headless`). Custom Post Type UI is optional (older installs registered Services with it).

1. Install the plugin, e.g. for a [Local](https://localwp.com) site:
   ```bash
   ln -s "$PWD/wordpress/fire-headless" ~/"Local Sites/<site>/app/public/wp-content/plugins/fire-headless"
   wp plugin activate fire-headless
   ```
2. Add the contact form secret to `wp-config.php` (any long random string; the same value goes in `.env`):
   ```bash
   wp config set FIRE_FORM_SECRET "$(openssl rand -hex 24)" --type=constant
   ```
   Enquiry emails go to the site admin email, or to `FIRE_ENQUIRY_RECIPIENT` if defined.
3. Load the starter content from `src/data/content.json`, `src/data/brand.json` and `src/content/services`. It only fills what's empty, so it's safe to re-run on a live site; add `overwrite` to replace existing values:
   ```bash
   wp eval-file wordpress/seed.php "$PWD"
   ```

### Where content is edited

| Site section | WordPress |
| --- | --- |
| Hero headline, tagline, image; the three intro texts | Pages → Home → *Homepage Settings* |
| Address, phone, email, directions link, hero video, social links | Pages → Home → *Business Details* |
| Featured restorations (homepage and `/portfolio`) | **Showcases** — featured image, year, intro, link, accent colour, 3 gallery images |
| Reviews (homepage and service pages, first three) | **Testimonials** — title is the name, featured image is the photo |
| Services (pages, nav, homepage strip) | **Services** — featured image, *Service Details*, and page content (text + gallery blocks) |
| Privacy policy / terms | Pages with slugs `privacy-policy` / `terms-of-service`; footer links appear once published |
| Contact form submissions | **Enquiries** (read-only) |

Order showcases, testimonials and services with the **Order** field in the sidebar.

## Site setup

```bash
cp .env.example .env   # then fill in WP_FORM_SECRET
npm install
npm run dev            # http://localhost:4321, renders live from WordPress
npm run build          # prerender everything into dist/
node --env-file=.env dist/server/entry.mjs   # serve the production build
```

| Variable | Purpose |
| --- | --- |
| `PUBLIC_WP_GRAPHQL_URL` | WPGraphQL endpoint. Empty = local content only. |
| `PUBLIC_SITE_URL` | Deployed address. Needed for absolute link-preview images and canonical URLs. |
| `WP_FORM_SECRET` | Must match `FIRE_FORM_SECRET`. Read at runtime by the contact action. |
| `PUBLIC_DEMO_MODE` | On unless set to `false`. Concept builds get: `noindex`, robots.txt blocks search crawlers (link-preview bots stay allowed so DMs show a card), "Concept by" badge. Set `false` at launch. |
| `PUBLIC_DEMO_CREDIT` | Optional badge text. |

## Deploying

**Concept demo (no WordPress):** import the repo into Vercel and deploy. No environment variables are needed: without `PUBLIC_WP_GRAPHQL_URL` the site builds from the local content files, demo mode is on by default, and the contact form explains that it's a preview. Add `PUBLIC_SITE_URL` (the Vercel URL) so link previews have absolute images.

Before deploying, copy the latest WordPress content into those local files, so the demo shows exactly what WordPress has, and commit the result:

```bash
npm run snapshot
```

**Client site (with WordPress):** set `PUBLIC_WP_GRAPHQL_URL`, `WP_FORM_SECRET`, `PUBLIC_SITE_URL` and `PUBLIC_DEMO_MODE=false` in Vercel, then add a Vercel deploy hook and call it when WordPress publishes so the static pages rebuild.

The Vercel adapter is picked automatically on Vercel; elsewhere the build runs as a Node server (`node --env-file=.env dist/server/entry.mjs`). Production builds disable Astro's on-demand image endpoint, since every image is generated at build time.

## New client checklist

Everything client-specific lives in data files and images; the components don't need editing.

1. **`src/data/brand.json`**: name, short name (nav and footer), wordmark lines (the hero cut-out logo; sized to fit automatically), tagline, meta description, accent colour plus the text colour that sits on it, fonts (heading, its width, body, serif; the files themselves are imported in `src/styles/fonts.css`), gradient pairs for the intro texts and showcases, and business details (address, phone, email, directions, YouTube video, socials; leave a social out to hide its icon).
2. **`src/data/content.json`**: hero, the three intro texts, awards copy and logos (files in `src/assets/images/awards`), labels, portfolio heading and intro, `homepageShowcases` (how many showcases the homepage features), showcases (all of them appear on `/portfolio`; on the homepage each is followed by the next intro text), three testimonials, the four images in the services strip, and the contact copy.
3. **`src/content/services/*.json`**: one file per service; the file name becomes its URL slug. Title, `order`, hero image, tagline, tint colour, intro paragraphs, mid text, closing text and gallery images (split across the page's two galleries).
4. **`src/assets/images/`**: the client's photos, referred to by path from the JSON files.
5. **`public/favicon.svg`** and **`favicon.ico`**.
6. **WordPress**: install the plugins, set `FIRE_FORM_SECRET`, then run `wp eval-file wordpress/seed.php "$PWD"`. It creates the front page, homepage settings, business details, showcases, testimonials and services (with their text and gallery blocks) and uploads every image they use. Tested on a brand-new WordPress.
7. **`.env`**: the client's GraphQL URL and form secret, and `PUBLIC_DEMO_MODE=true` until launch.
8. Build, then search the output for the previous client's name and phone number. Nothing should turn up.

Known limit: the reviews slider is sized for three testimonials.

## Behaviour notes

- **Reduced motion:** with the OS setting on, smooth scrolling, parallax, the logo zoom and the colour sweep are off; scroll-driven fades and reveals stay.
- **Preloader:** shown once per browser session on the homepage, until the hero image and fonts are ready (0.7–2.5s). It fades on its own after 3.5s if JavaScript fails.
- **Link previews:** every page has Open Graph/Twitter tags with a 1200×630 image cut from its hero.

## Project map

- `src/pages/index.astro` — homepage story; `src/pages/portfolio.astro` — all showcases; `src/pages/services/[slug].astro` — service pages; `src/pages/[page].astro` — plain WordPress pages; `src/pages/404.astro`
- `src/data/brand.json` — identity, colours, business details; `src/data/content.json` — starter/fallback content
- `src/lib/wp.ts` — GraphQL client and Gutenberg block parsing; `src/lib/localContent.ts` — local fallbacks; `src/lib/business.ts` — business details (WordPress over brand.json); `src/lib/assets.ts` — image paths to Astro images; `src/lib/demo.ts` — demo mode
- `src/actions/index.ts` — contact form action
- `src/utils/animations.ts` — shared GSAP timelines
- `wordpress/` — content model plugin and seed script
