import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(readFileSync(path.join(ROOT, 'src/data/brand.json'), 'utf8'));

// Every page in the build: "index.html" -> "/", "services/coachwork/index.html" -> "/services/coachwork/".
const CLIENT_DIR = path.join(ROOT, 'dist/client');
if (!existsSync(CLIENT_DIR)) throw new Error('No build found. Run `npm run build` before the smoke tests.');
const PAGES = readdirSync(CLIENT_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('index.html'))
    .map((file) => '/' + file.split(path.sep).join('/').replace(/index\.html$/, ''))
    .sort();

/** Fails the test on console errors, uncaught exceptions and same-origin requests that fail. */
function watchForErrors(page: Page) {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(`console: ${msg.text()}`));
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

test('pages carry link-preview tags', async ({ page }) => {
    await page.goto('/');
    for (const property of ['og:title', 'og:description', 'og:image', 'og:url']) {
        await expect(page.locator(`meta[property="${property}"]`)).toHaveAttribute('content', /.+/);
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

test('service pages play every section, the reviews and the closing line', async ({ page }) => {
    const servicePages = PAGES.filter((p) => p.startsWith('/services/'));
    expect(servicePages.length).toBeGreaterThan(0);
    for (const route of servicePages) {
        await page.goto(route);
        const layers = await page.locator('#master-pin-container [data-story]').count();
        expect(layers, `${route} story layers`).toBeGreaterThanOrEqual(3);

        // Scroll through the pinned story, recording the highest opacity each layer reaches.
        const peaks = await page.evaluate(async () => {
            const layers = [...document.querySelectorAll<HTMLElement>('#master-pin-container [data-story]')];
            const peak = layers.map(() => 0);
            const end = document.getElementById('contact-footer-wrapper')!.getBoundingClientRect().top + window.scrollY;
            for (let y = 0; y <= end; y += window.innerHeight / 3) {
                window.scrollTo(0, y);
                await new Promise((r) => setTimeout(r, 120));
                layers.forEach((layer, i) => (peak[i] = Math.max(peak[i], Number(getComputedStyle(layer).opacity))));
            }
            return layers.map((layer, i) => ({ kind: layer.dataset.story, peak: peak[i] }));
        });
        for (const layer of peaks) expect(layer.peak, `${route} ${layer.kind} layer becomes visible`).toBeGreaterThan(0.5);
    }
});
