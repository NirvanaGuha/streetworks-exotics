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
3. Seed the demo content (safe to re-run):
   ```bash
   wp eval-file wordpress/seed-streetworks.php src/assets/images
   ```

### Where content is edited

| Site section | WordPress |
| --- | --- |
| Hero headline, tagline, image; the three intro texts | Pages → Home → *Homepage Settings* |
| Featured restorations (homepage showcases) | **Showcases** — featured image, year, intro, link, accent colour, 3 gallery images |
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
| `WP_FORM_SECRET` | Must match `FIRE_FORM_SECRET`. Read at runtime by the contact action. |
| `PUBLIC_DEMO_MODE` | `true` for concept builds: `noindex`, robots.txt blocks crawlers, "Concept by" badge. Set `false` at launch. |
| `PUBLIC_DEMO_CREDIT` | Optional badge text. |

## Project map

- `src/pages/index.astro` — homepage story; `src/pages/services/[slug].astro` — service pages; `src/pages/[page].astro` — plain WordPress pages; `src/pages/404.astro`
- `src/lib/wp.ts` — GraphQL client and Gutenberg block parsing; `src/lib/localContent.ts` — local fallbacks; `src/lib/demo.ts` — demo mode
- `src/actions/index.ts` — contact form action
- `src/utils/animations.ts` — shared GSAP timelines
- `wordpress/` — content model plugin and seed script
