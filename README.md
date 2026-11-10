# StreetWorks Exotics — cinematic site on headless WordPress

A scroll-driven Astro site (GSAP + Lenis) whose content lives in WordPress. The shop keeps editing in the WordPress admin; Astro builds the public pages from it.

```
WordPress (admin + content) ──WPGraphQL──▶ Astro build ──▶ static pages
                         ◀──REST (contact form)── Astro server action
```

- **Pages** are prerendered at build time from WordPress. Saving a change in WordPress starts a rebuild on its own (see *Automatic rebuilds*); it shows on the site a minute or two later.
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
4. If the client already blogs on WordPress, copy their posts across instead of starting from the local files. List the old site, the posts that become case studies (with the car's details) and anything to leave behind in a settings file like `wordpress/imports/streetworks-exotics.json`, then:
   ```bash
   wp eval-file wordpress/import-posts.php wordpress/imports/<client>.json
   ```
   It works with any theme or page builder: content is rebuilt as clean blocks, photos are copied into the media library once each, bylines and categories carry over, and links between the old posts and pages point at their new addresses. Audio and video files stay on the old site. Existing posts are kept; add `overwrite` to re-import.

### Where content is edited

| Site section | WordPress |
| --- | --- |
| Colours, fonts, logo text, page-title name, default description and link-preview image, tab icon, every label, button and heading across the site (navigation, footer, awards, listings, articles, contact form and its messages, 404 page), award logos, the services strip photos, how many showcases the homepage shows | **Site Settings** (its own menu item), one tab per area. Every field starts with the site's current value; empty a field to go back to the built-in one. |
| Hero headline, tagline, image; the three intro texts | Pages → Home → *Homepage Settings* |
| Address, phone, email, directions link, hero video, social links | Pages → Home → *Business Details* |
| Featured restorations (homepage and `/portfolio`) | **Showcases** — featured image, year, intro, link, accent colour, 3 gallery images |
| Reviews (homepage and service pages, up to six) | **Testimonials** — title is the name, featured image is the photo (its alt text is used) |
| Services (pages, nav, homepage strip) | **Services** — featured image, *Service Details*, and page content. Write it as normal blocks, any number, in order. Short text (a sentence or two) plays as a full-screen statement; longer text, or text with headings or lists, becomes an article: H2/H3 start a chapter, H4 is its subheading, list items become numbered rows ("Title: description" shows the title in bold). Each gallery (or run of image blocks) becomes a case study: its first image fills the screen, the rest form its gallery, and the text after it gives the title (its heading, or else the service's tagline, then its name) and the intro (its first paragraph); the rest of that text follows. The first gallery's images also fill the service's homepage strip. A final text section that no gallery used becomes the closing line after the reviews. |
| Blog (`/blog`, "News" in the nav) | **Posts**: featured image, categories, excerpt, *Byline* (empty credits the shop) and normal blocks. Paragraphs, headings, lists, quotes, images, galleries, YouTube/Vimeo embeds, audio and video are all styled; H2s become numbered chapters. Categories with two or more posts get a filter button. |
| Case studies (`/case-studies`) | **Case Studies**: written like a post, plus *Case Study Details* (car, year, the work, recognition). The car's name is the display title and the post title its headline. Ordered with **Order**. Point a showcase's *Read More Link* at `/case-studies/<slug>` to link the two. |
| Privacy policy / terms | Pages with slugs `privacy-policy` / `terms-of-service`; footer links appear once published |
| How a page looks in search results and link previews | The **Search & sharing** box beside every post, case study, service and page: title, description, preview image. Empty fields use the page's own title, excerpt or tagline, and featured image. |
| Contact form submissions | **Enquiries** (read-only) |

Order showcases, testimonials, services and case studies with the **Order** field in the sidebar. Posts and case studies that lived at `/<slug>` on the old site redirect to their new addresses.

**How Site Settings works.** `wordpress/fire-headless/site-settings.json` lists every setting: its label, field type and the value it replaces in `src/data/brand.json` or `src/data/content.json` (its `path`). The plugin builds the Site Settings screen from that list and `src/lib/site.ts` fetches the same fields and lays them over the built-in values, so adding a setting is one entry in the list plus using the value in a component. Every value is checked before use: colours must be hex, fonts must be on the list, numbers in range. A bad value keeps the built-in one rather than reaching the page.

**Fonts** are picked from a list of self-hosted fonts (`src/lib/fonts.ts`; visitors only download the ones in use). To offer another, install its `@fontsource` package, import it in `src/styles/fonts.css`, and add it to `fonts.ts` and the matching `choices` in `site-settings.json`. WordPress doesn't accept SVG uploads, so use PNG for logos and the tab icon there; the built-in SVGs stay until replaced.

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
| `PUBLIC_SITE_URL` | Deployed address, used for link-preview images and canonical URLs. On Vercel it defaults to the project's production URL; set it once the site has its own domain. |
| `WP_FORM_SECRET` | Must match `FIRE_FORM_SECRET`. Read at runtime by the contact action. |
| `PUBLIC_DEMO_MODE` | On unless set to `false`. Concept builds get: `noindex`, robots.txt blocks search crawlers (link-preview bots stay allowed so DMs show a card), "Concept by" badge. Set `false` at launch. |
| `PUBLIC_DEMO_CREDIT` | Optional badge text. |

## Deploying

**Concept demo (no WordPress):** import the repo into Vercel and deploy. No environment variables are needed: without `PUBLIC_WP_GRAPHQL_URL` the site builds from the local content files, demo mode is on by default, and the contact form explains that it's a preview. Link previews use the project's production URL (`<project>.vercel.app`); share that address, since the per-deploy URLs sit behind a Vercel login.

Before deploying, copy the latest WordPress content (services, posts, case studies, Site Settings and their photos) into those local files, so the demo shows exactly what WordPress has, and commit the result:

```bash
npm run snapshot
```

**Client site (with WordPress):** set `PUBLIC_WP_GRAPHQL_URL`, `WP_FORM_SECRET`, `PUBLIC_SITE_URL` and `PUBLIC_DEMO_MODE=false` in Vercel, then set up automatic rebuilds.

**Automatic rebuilds.** In Vercel, open the project's Settings → Git → Deploy Hooks, create a hook for the `main` branch, and put its address in the client's `wp-config.php`:

```bash
wp config set FIRE_DEPLOY_HOOK_URL "https://api.vercel.com/v1/integrations/deploy/..." --type=constant
```

From then on the plugin (`wordpress/fire-headless/rebuild.php`) starts a build whenever something the site shows changes: a post, case study, service, page, showcase, testimonial or Site Settings is published, edited while live, unpublished, trashed or deleted; a live post's fields are saved; a photo's alt text or caption changes; a category or tag is added, renamed or removed. Drafts, autosaves and form enquiries don't. Changes made together share one build: the first starts it, and any in the next 20 seconds wait and start one more, so the last edit is always included (that follow-up runs on WP-Cron, which the build's own requests to WordPress set off). If the host can't be reached, the call is tried again after 1, 2 and 3 minutes. Editors also get **Rebuild site** in the admin bar, which starts a build at once and shows when the last one was requested and whether it worked. Without the constant nothing is sent, which is what local and demo WordPress installs want. The address is a secret: anyone who has it can start builds, so keep it out of the repo.

The Vercel adapter is picked automatically on Vercel; elsewhere the build runs as a Node server (`node --env-file=.env dist/server/entry.mjs`). Production builds disable Astro's on-demand image endpoint, since every image is generated at build time.

## New client checklist

Everything client-specific lives in data files and images; the components don't need editing.

1. **`src/data/brand.json`**: name, short name (nav and footer), wordmark lines (the hero cut-out logo; sized to fit automatically), tagline, meta description, default link-preview image and tab icon, colours (accent and the text on it, page background, panels, cards, text, the colour statements fill in from, errors), fonts by name from `src/lib/fonts.ts` (heading, its width, body, serif), gradient pairs for the intro texts and showcases, and business details (address, phone, email, directions, YouTube video, socials; leave a social out to hide its icon). These are the built-in values; WordPress's Site Settings override them.
2. **`src/data/content.json`**: hero, the three intro texts, awards copy and logos (files in `src/assets/images/awards`), labels (every button, link and small heading), the contact form's text and messages (`form`), the 404 page (`notFound`), portfolio heading and intro, `homepageShowcases` (how many showcases the homepage features), showcases (all of them appear on `/portfolio`; on the homepage each is followed by the next intro text), testimonials (up to six), the four images in the services strip, and the contact copy.
3. **`src/content/services/*.json`**: one file per service; the file name becomes its URL slug. Title, `order`, hero image, tagline, tint colour and `contentBlocks`: text blocks (paragraphs separated by a blank line; `## ` heading, `### ` subheading, `• ` list item) and gallery blocks, in page order. `npm run snapshot` writes these from WordPress.
   **`src/content/posts/*.json`** and **`src/content/case-studies/*.json`**: the blog and case studies, also written by `npm run snapshot` (after importing the client's old posts, see WordPress setup). Delete the previous client's files; with none, the blog and case study pages are simply empty. The listing headings and labels are in `content.json` (`journal`, `caseStudies`, `labels`).
4. **`src/assets/images/`**: the client's photos, referred to by path from the JSON files (post and case study photos in `articles/`).
5. **`public/favicon.svg`** and **`favicon.ico`**.
6. **WordPress**: install the plugins, set `FIRE_FORM_SECRET` (and `FIRE_DEPLOY_HOOK_URL` once the site is on Vercel), then run `wp eval-file wordpress/seed.php "$PWD"`. It creates the front page, homepage settings, business details, Site Settings, showcases, testimonials, services (with their text and gallery blocks), posts and case studies, and uploads every image they use. Tested on a brand-new WordPress.
7. **`.env`**: the client's GraphQL URL and form secret, and `PUBLIC_DEMO_MODE=true` until launch.
8. Build, then search the output for the previous client's name and phone number. Nothing should turn up.

## Behaviour notes

- **Reduced motion:** with the OS setting on, smooth scrolling, parallax, the logo zoom and the colour sweep are off; scroll-driven fades and reveals stay.
- **Preloader:** shown once per browser session on the homepage, until the hero image and fonts are ready (0.7–2.5s). It fades on its own after 3.5s if JavaScript fails.
- **Link previews:** every page has Open Graph/Twitter tags with a 1200×630 image cut from its hero.

## Security

**Contact form**
- Browser → Astro action → WordPress. Only the Astro server can post enquiries: the WordPress endpoint checks the shared secret (constant-time), and the action refuses to send that secret over plain HTTP to anything but a local WordPress.
- Astro rejects form posts from other sites (Origin check) and bodies over 1 MB.
- Fields are length-limited in the form, the action and the endpoint (name 100, email 254, message 5,000), and cleaned by WordPress before saving. Saving goes through `wp_insert_post`, never hand-written SQL.
- Spam: a hidden honeypot field, and a minimum fill time measured by the page script; bots get a normal-looking success.
- Rate limits in WordPress: 5 enquiries per visitor per 10 minutes, 50 an hour in total. Visitors are told apart by a salted hash of their IP, kept only for the length of the window.
- The reply-to header carries only letters, numbers, spaces and `.'-` from the name, so it can't add recipients or headers.

**Content from WordPress**
- Everything printed as HTML (article text, captions, plain pages) passes an allowlist cleaner at build time (`src/lib/sanitize.ts`) as well as WordPress's own `wp_kses`. Links from WordPress fields must be http(s), mailto, tel or site paths. Colours must be hex, since they're written into CSS.

**Response headers** (`vercel.json`)
- A Content Security Policy: scripts only from the site itself, plus one fingerprinted inline script (the preloader check). Frames only from YouTube, Vimeo and Google Maps; no plugins; no framing by other sites.
- Also `nosniff`, `X-Frame-Options`, a strict referrer policy, a Permissions-Policy and `Cross-Origin-Opener-Policy`.
- The smoke tests serve every page with these headers, so anything the policy would block in production fails in testing. A test also checks that the preloader's fingerprint matches its code. Astro inlines no other scripts (`assetsInlineLimit: 0`).

**WordPress** (`wordpress/fire-headless/security.php`)
- XML-RPC is off.
- Account names are hidden from logged-out visitors: no public user list in REST or GraphQL, and `?author=N` redirects home.
- GraphQL queries are limited to 12 levels, and public schema browsing stays off.
- Enquiries are never exposed in REST or GraphQL.

**At launch**
- Use strong admin passwords and two-factor sign-in.
- Add a login-attempt limiter, such as Limit Login Attempts Reloaded.
- Set `define('DISALLOW_FILE_EDIT', true);` in `wp-config.php`.
- Keep WordPress and the plugins updated.
- Use a long random `FIRE_FORM_SECRET` (`openssl rand -hex 24`).
- Serve WordPress over HTTPS.
- Keep `FIRE_DEPLOY_HOOK_URL` in `wp-config.php` only. If it leaks, delete the hook in Vercel and create a new one.

**Dependencies**
- `npm audit` lists advisories in the Vercel adapter's build tooling (`@vercel/nft`, `@vercel/routing-utils`) and esbuild's dev server (Windows only). None of that code runs when the site handles a visitor. The only fix npm offers is downgrading the adapter three major versions, so they're left until the adapter updates.

## Checks

- **Client leak check** runs after every build (`postbuild`): it fails if the output contains details of any other client listed in `scripts/client-fingerprints.json`. Add each new client there.
- **Smoke tests** (`npm run test:smoke`, after a build) open every built page in desktop Chrome and an iPhone-sized WebKit (Safari's engine): status, console errors, broken images, sideways overflow, clipped headings, every service section revealing, statements fitting the screen, every post and case study block revealing, article photos fitting the screen, old post addresses redirecting, the blog's category filter, showcase links, the footer Services link, the contact form (including after moving between pages), 404, robots.txt, link-preview tags, the preloader and reduced motion, every Site Settings field pointing at a real value, and the security headers (see Security). First run: `npx playwright install chromium webkit`.
- **CI** (`.github/workflows/ci.yml`) runs the build, leak check and smoke tests on every push to `main` and on pull requests.

Requires Node 22.22 or newer (Astro 7).

## Project map

- `src/pages/index.astro` — homepage story; `src/pages/portfolio.astro` — all showcases; `src/pages/services/[slug].astro` — service pages; `src/pages/blog/` and `src/pages/case-studies/` — listings and articles (`components/Article*.astro`); `src/pages/[page].astro` — plain WordPress pages and redirects from old post addresses; `src/pages/404.astro`
- `src/data/brand.json` — identity, colours, fonts, business details; `src/data/content.json` — starter/fallback content and every label; `src/data/site-settings.json` — the snapshot of WordPress's Site Settings for builds without WordPress
- `src/lib/site.ts` — Site Settings over the built-in values (`brand`, `content`); `src/lib/fonts.ts` — the font list; `src/lib/sanitize.ts` — HTML, link and colour cleaning
- `src/lib/articles.ts` — posts and case studies (WordPress or local), in one shape
- `src/lib/wp.ts` — GraphQL client (service content arrives as structured `sections` from the plugin, built with WordPress's own block parser); `src/lib/localContent.ts` — local fallbacks; `src/lib/business.ts` — business details (WordPress over brand.json); `src/lib/assets.ts` — image paths to Astro images; `src/lib/demo.ts` — demo mode
- `src/actions/index.ts` — contact form action
- `vercel.json` — security headers
- `src/utils/animations.ts` — shared GSAP timelines
- `wordpress/` — content model plugin (`fire-headless/articles.php` turns post content into typed blocks and back; `site-settings.php` and `site-settings.json` the Site Settings screen; `security.php` the WordPress hardening; `rebuild.php` the automatic rebuilds), seed script and the post importer
