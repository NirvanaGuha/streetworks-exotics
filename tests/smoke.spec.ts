import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(readFileSync(path.join(ROOT, 'src/data/brand.json'), 'utf8'));

// Every page in the build: "index.html" -> "/", "services/coachwork/index.html" -> "/services/coachwork/".
// Redirects (old post addresses) are listed apart.
const CLIENT_DIR = path.join(ROOT, 'dist/client');
if (!existsSync(CLIENT_DIR)) throw new Error('No build found. Run `npm run build` before the smoke tests.');
const BUILT = readdirSync(CLIENT_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('index.html'))
    .map((file) => ({
        route: '/' + file.split(path.sep).join('/').replace(/index\.html$/, ''),
        redirect: /http-equiv="refresh"/.test(readFileSync(path.join(CLIENT_DIR, file), 'utf8').slice(0, 500)),
    }));
const PAGES = BUILT.filter((page) => !page.redirect).map((page) => page.route).sort();
const REDIRECTS = BUILT.filter((page) => page.redirect).map((page) => page.route).sort();
const ARTICLES = PAGES.filter((route) => /^\/(blog|case-studies)\/[^/]+\/$/.test(route));

// Production's security headers (vercel.json), sent with every page the tests load, so a
// resource the Content Security Policy would block in production fails here first.
const VERCEL = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const SECURITY_HEADERS: Record<string, string> = Object.fromEntries(
    VERCEL.headers[0].headers.map((header: { key: string; value: string }) => [header.key.toLowerCase(), header.value]),
);
test.beforeEach(async ({ page, baseURL }) => {
    await page.route(`${baseURL}/**`, async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue();
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), ...SECURITY_HEADERS } });
    });
});

/** Fails the test on console errors, uncaught exceptions and same-origin requests that fail. */
function watchForErrors(page: Page) {
    const errors: string[] = [];
    page.on('console', (msg) => {
        // Playwright's WebKit can't draw its own media-control icons (audio/video players); not the site's error.
        if (msg.type() === 'error' && !/^Button failed to load, iconName = /.test(msg.text())) errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`exception: ${err.message}`));
    page.on('response', (res) => {
        if (res.status() >= 400 && new URL(res.url()).origin === new URL(page.url() || res.url()).origin) {
            errors.push(`HTTP ${res.status()}: ${res.url()}`);
        }
    });
    return errors;
}

/** Scrolls through the whole page so lazy images load and scroll animations run. */
async function scrollThrough(page: Page) {
    await page.evaluate(async () => {
        const step = window.innerHeight * 0.8;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, document.body.scrollHeight);
    });
}

test.describe('every page', () => {
    for (const route of PAGES) {
        test(`${route} loads cleanly`, async ({ page }) => {
            const errors = watchForErrors(page);
            const response = await page.goto(route);
            expect(response?.status(), 'HTTP status').toBe(200);
            await expect(page).toHaveTitle(new RegExp(brand.client.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

            await scrollThrough(page);
            // Lazy images inside hidden slides only load when shown, so wait for the network to
            // settle and then fail only on images that loaded broken.
            await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
            const broken = await page.evaluate(() =>
                [...document.images].filter((img) => img.getAttribute('src') && img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src),
            );
            expect(broken, 'broken images').toEqual([]);

            const layout = await page.evaluate(() => ({
                pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
                clippedHeadings: [...document.querySelectorAll<HTMLElement>('h1, h2, h3')]
                    .filter((h) => h.offsetParent !== null && h.scrollWidth - h.clientWidth > 2)
                    .map((h) => h.textContent?.trim().slice(0, 40)),
            }));
            expect(layout.pageOverflow, 'horizontal page overflow (px)').toBeLessThanOrEqual(1);
            expect(layout.clippedHeadings, 'headings wider than their box').toEqual([]);

            expect(errors).toEqual([]);
        });
    }
});

test('unknown URLs get the 404 page', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.locator('main a[href="/"]')).toBeVisible();
});

test('robots.txt matches demo mode', async ({ page, request }) => {
    await page.goto('/');
    const demo = (await page.locator('meta[name="robots"]').count()) > 0;
    const body = await (await request.get('/robots.txt')).text();
    if (demo) expect(body).toMatch(/User-agent: \*\nDisallow: \//);
    else expect(body).not.toMatch(/Disallow: \/\n/);
});

test('pages carry link-preview tags', async ({ page, request }) => {
    await page.goto('/');
    for (const property of ['og:title', 'og:description', 'og:image', 'og:url']) {
        await expect(page.locator(`meta[property="${property}"]`)).toHaveAttribute('content', /.+/);
    }
    // Chat apps only show a preview image from an absolute URL on the site itself.
    const url = new URL(await page.locator('meta[property="og:url"]').getAttribute('content') ?? '');
    const image = new URL(await page.locator('meta[property="og:image"]').getAttribute('content') ?? '');
    expect(image.origin).toBe(url.origin);
    if (process.env.PUBLIC_SITE_URL) {
        // Built for a known address (CI builds for the test server): the image must load there.
        expect(url.origin).toBe(new URL(process.env.PUBLIC_SITE_URL).origin);
        expect((await request.get(image.href)).status()).toBe(200);
    }
});

test('contact form responds', async ({ page }) => {
    await page.goto('/');
    const form = page.locator('#contact-form');
    await form.scrollIntoViewIfNeeded();
    await form.locator('[name=name]').fill('Smoke Test');
    await form.locator('[name=email]').fill('smoke@example.test');
    await form.locator('[name=message]').fill('Automated smoke test.');

    if (await form.getAttribute('data-preview')) {
        // Concept build: explains instead of sending.
        await form.locator('button[type=submit]').click();
        await expect(page.locator('#form-error')).toContainText('concept preview');
    } else {
        // Connected build: the spam trap makes the server accept without saving an enquiry.
        await form.locator('[name=website]').evaluate((input: HTMLInputElement) => (input.value = 'http://bot.example.test'));
        await form.locator('button[type=submit]').click();
        await expect(page.locator('#form-flipper')).toHaveClass(/is-flipped/, { timeout: 15_000 });
    }
});

test('preloader lifts on the first visit and is skipped after', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preloader')).toBeHidden({ timeout: 6_000 });
    await page.goto('/portfolio/');
    await page.goto('/');
    await expect(page.locator('#preloader')).toBeHidden({ timeout: 1_000 });
});

test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('skips the logo zoom and the preloader', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#preloader')).toBeHidden({ timeout: 1_000 });
        await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
        await page.waitForTimeout(1_500);
        expect(Number(await page.locator('#logo-svg').evaluate((el) => getComputedStyle(el).opacity))).toBe(0);
    });
});

test('without reduced motion the logo zoom plays', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#preloader')).toBeHidden({ timeout: 6_000 });
    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
    await expect
        .poll(async () => Number(await page.locator('#logo-svg').evaluate((el) => getComputedStyle(el).opacity)), { timeout: 5_000 })
        .toBeGreaterThan(0);
});

test('service pages reveal every section, the reviews and the closing line', async ({ page }) => {
    const servicePages = PAGES.filter((p) => p.startsWith('/services/'));
    expect(servicePages.length).toBeGreaterThan(0);
    for (const route of servicePages) {
        await page.goto(route);

        // Scroll through the page, recording the highest opacity each animated part reaches.
        const peaks = await page.evaluate(async () => {
            const parts = [
                ...[...document.querySelectorAll<HTMLElement>('.text-block-container [id$="-layer"]')].map((el) => ({ el, label: 'statement' })),
                ...[...document.querySelectorAll<HTMLElement>('.article-reveal')].map((el) => ({ el, label: `article: ${el.textContent!.trim().slice(0, 40)}` })),
                ...[...document.querySelectorAll<HTMLElement>('div[id^="showcase-"]')].map((el) => ({ el, label: el.id })),
                ...[...document.querySelectorAll<HTMLElement>('#reviews-fade-layer')].map((el) => ({ el, label: 'reviews' })),
            ];
            const peak = parts.map(() => 0);
            const end = document.getElementById('contact-footer-wrapper')!.getBoundingClientRect().top + window.scrollY;
            for (let y = 0; y <= end; y += window.innerHeight / 3) {
                window.scrollTo(0, y);
                await new Promise((r) => setTimeout(r, 120));
                parts.forEach(({ el }, i) => (peak[i] = Math.max(peak[i], Number(getComputedStyle(el).opacity))));
            }
            return parts.map(({ label }, i) => ({ label, peak: peak[i] }));
        });
        expect(peaks.filter((p) => p.label === 'reviews'), `${route} has reviews`).toHaveLength(1);
        for (const part of peaks) expect(part.peak, `${route} ${part.label} becomes visible`).toBeGreaterThan(0.5);
    }
});

test('service statements fit the screen', async ({ page }) => {
    for (const route of PAGES.filter((p) => p.startsWith('/services/'))) {
        await page.goto(route);
        const tall = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('.text-block-container .text-reveal-gradient')]
                .filter((el) => el.offsetHeight > window.innerHeight)
                .map((el) => el.textContent!.trim().slice(0, 40))
        );
        expect(tall, route).toEqual([]);
    }
});

test('the footer Services link lands on the first service', async ({ page }) => {
    await page.goto('/portfolio/');
    await page.locator('footer a[href="/#services"]').click();
    await expect(page).toHaveURL(/\/#services$/);
    await expect
        .poll(async () => Number(await page.locator('.service-slide').first().evaluate((el) => getComputedStyle(el).opacity)), { timeout: 8_000 })
        .toBeGreaterThan(0.9);
});

test('posts and case studies reveal every block', async ({ page }) => {
    expect(ARTICLES.length).toBeGreaterThan(0);
    for (const route of ARTICLES) {
        await page.goto(route);
        await expect(page.locator('h1')).toHaveCount(1);
        const peaks = await page.evaluate(async () => {
            const parts = [...document.querySelectorAll<HTMLElement>('.article-reveal, .listing-reveal')];
            const peak = parts.map(() => 0);
            for (let y = 0; y <= document.body.scrollHeight; y += window.innerHeight / 2) {
                window.scrollTo(0, y);
                await new Promise((r) => setTimeout(r, 80));
                parts.forEach((el, i) => (peak[i] = Math.max(peak[i], Number(getComputedStyle(el).opacity))));
            }
            return parts.map((el, i) => ({ label: `${el.tagName} ${el.textContent!.trim().slice(0, 40)}`, peak: peak[i] }));
        });
        expect(peaks.length, `${route} has content`).toBeGreaterThan(1);
        for (const part of peaks) expect(part.peak, `${route} ${part.label} becomes visible`).toBeGreaterThan(0.5);
    }
});

test('article photos fit the screen', async ({ page }) => {
    for (const route of ARTICLES) {
        await page.goto(route);
        const tall = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('.article-figure .gallery-zoomable')]
                .filter((el) => el.getBoundingClientRect().height > window.innerHeight + 1)
                .map((el) => el.dataset.src)
        );
        expect(tall, route).toEqual([]);
    }
});

test('article titles sit above their photo, not on it', async ({ page }) => {
    for (const route of ARTICLES) {
        await page.goto(route);
        const gap = await page.evaluate(() => {
            const frame = document.querySelector('.article-hero-frame');
            const copy = document.querySelector('.article-hero-copy');
            return frame && copy ? frame.getBoundingClientRect().top - copy.getBoundingClientRect().bottom : 0;
        });
        expect(gap, route).toBeGreaterThanOrEqual(0);
    }
});

test('the table of contents opens and jumps to its headings', async ({ page }) => {
    const route = ARTICLES.find((r) => r.includes('duesenberg'))!;
    await page.goto(route);
    const contents = page.locator('.article-contents');
    await contents.locator('summary').scrollIntoViewIfNeeded();
    await contents.locator('summary').click();
    await expect(contents).toHaveAttribute('open', '');
    // Wait for the list to finish sliding open, so the page below has settled.
    await expect
        .poll(() => contents.evaluate((el) => el.getBoundingClientRect().bottom - el.querySelector('ol')!.getBoundingClientRect().bottom))
        .toBeGreaterThanOrEqual(0);
    const link = contents.locator('a').nth(3);
    const hash = await link.getAttribute('href');
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${hash}$`));
    await expect
        .poll(async () => page.locator(hash!).evaluate((el) => Math.round(el.getBoundingClientRect().top)), { timeout: 8_000 })
        .toBeLessThan(200);
});

test('the contact form keeps working after moving between pages', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/blog"]').first().evaluate((a: HTMLAnchorElement) => a.click());
    await page.waitForURL(/\/blog\/?$/);
    const form = page.locator('#contact-form');
    await form.locator('input[name=name]').fill('Test Person');
    await form.locator('input[name=email]').fill('test@example.com');
    await form.locator('textarea[name=message]').fill('A private message');
    await page.locator('#submit-btn').evaluate((b: HTMLButtonElement) => b.click());
    await expect(page.locator('#form-error')).toBeVisible();
    // Handled by the script, never sent the browser's way, which would put it in the address.
    expect(page.url()).not.toContain('message=');
});

test('every Site Settings field points at a real value', () => {
    const schema = JSON.parse(readFileSync(path.join(ROOT, 'wordpress/fire-headless/site-settings.json'), 'utf8'));
    const defaults = { brand, content: JSON.parse(readFileSync(path.join(ROOT, 'src/data/content.json'), 'utf8')) };
    const fonts = readFileSync(path.join(ROOT, 'src/lib/fonts.ts'), 'utf8');
    const names = new Set<string>();
    for (const section of schema.sections) {
        for (const field of section.fields) {
            const value = field.path.split('.').reduce((node: any, key: string) => node?.[key], defaults);
            expect(value, `${field.path} has a built-in value`).not.toBeUndefined();
            const name = field.path.toLowerCase().replaceAll('.', '_');
            expect(names.has(name), `${field.path} is listed once`).toBe(false);
            names.add(name);
            if (field.type === 'font') {
                for (const choice of field.choices) expect(fonts, `font "${choice}" is in src/lib/fonts.ts`).toMatch(new RegExp(`['\\s]${choice}'?:`));
                expect(field.choices, `${field.path}'s built-in font is a choice`).toContain(value);
            }
            if (field.type === 'select') expect(field.choices, `${field.path}'s built-in value is a choice`).toContain(value);
        }
    }
});

test('the security policy allows every inline script in the build', () => {
    const csp = SECURITY_HEADERS['content-security-policy'];
    const files = readdirSync(CLIENT_DIR, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.html'));
    for (const file of files) {
        const html = readFileSync(path.join(CLIENT_DIR, file), 'utf8');
        for (const [, attrs, body] of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
            if (/type="application\/(ld\+)?json"/.test(attrs)) continue;
            const hash = `sha256-${createHash('sha256').update(body).digest('base64')}`;
            expect(csp, `${file}: inline script ${body.trim().slice(0, 40)}… needs ${hash} in vercel.json`).toContain(`'${hash}'`);
        }
    }
});

test('video players load under the security policy', async ({ page }) => {
    await page.addInitScript(() => {
        sessionStorage.setItem('fire-preloaded', '1');
        (window as any).cspViolations = [];
        document.addEventListener('securitypolicyviolation', (e) => (window as any).cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await page.goto('/');
    await page.locator('#play-btn').evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator('#yt-player')).toHaveAttribute('src', /youtube\.com\/embed\//);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as any).cspViolations)).toEqual([]);

    const withVideo = ARTICLES.find((route) => readFileSync(path.join(CLIENT_DIR, route, 'index.html'), 'utf8').includes('article-video'))!;
    await page.goto(withVideo);
    await page.locator('.article-video').first().evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator('.article-player iframe').first()).toBeAttached();
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as any).cspViolations)).toEqual([]);

    // The policy is really in force: a script injected into the page is refused.
    await page.evaluate(() => {
        const script = document.createElement('script');
        script.textContent = 'window.injected = true';
        document.body.append(script);
    });
    expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
});

test('old post addresses redirect to their new pages', async ({ page }) => {
    expect(REDIRECTS.length).toBeGreaterThan(0);
    await page.goto(REDIRECTS[0]);
    await expect(page).toHaveURL(new RegExp(`/(blog|case-studies)/${REDIRECTS[0].replaceAll('/', '')}/?$`));
    await expect(page.locator('h1')).toBeVisible();
});

test('blog category buttons filter the posts', async ({ page }) => {
    await page.goto('/blog/');
    const buttons = page.locator('.journal-filter[data-filter]:not([data-filter=""])');
    test.skip((await buttons.count()) === 0, 'no categories with more than one post');
    const button = buttons.first();
    const slug = await button.getAttribute('data-filter');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const shown = await page.locator('.journal-item:not([hidden])').evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.categories!.split(' ')));
    for (const categories of shown) expect(categories).toContain(slug);
    await page.locator('.journal-filter[data-filter=""]').click();
    await expect(page.locator('.journal-item[hidden]')).toHaveCount(0);
});

test('showcases link to pages that exist', async ({ page, request }) => {
    await page.goto('/portfolio/');
    const links = await page.locator('a.portfolio-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('href')!));
    for (const href of links.filter((href) => href.startsWith('/'))) {
        expect((await request.get(href)).status(), href).toBe(200);
    }
});
