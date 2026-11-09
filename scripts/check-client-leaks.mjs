#!/usr/bin/env node
/**
 * Fails if the build contains details of a client other than the current one, so a site
 * rebuilt for a new client can't ship with the previous client's name, phone or address.
 * Runs after every `npm run build` (the "postbuild" script).
 *
 *   node scripts/check-client-leaks.mjs [--as "Other Client"]   (--as: check as if that were the current client)
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUILD_DIRS = ['dist', '.vercel/output/static'].map((dir) => path.join(ROOT, dir)).filter(existsSync);
const TEXT_FILES = /\.(html|js|mjs|css|json|txt|xml|svg|webmanifest)$/i;

const brand = JSON.parse(await readFile(path.join(ROOT, 'src/data/brand.json'), 'utf8'));
const registry = JSON.parse(await readFile(path.join(ROOT, 'scripts/client-fingerprints.json'), 'utf8'));
const asIndex = process.argv.indexOf('--as');
const current = asIndex > -1 ? process.argv[asIndex + 1] : brand.client;

const others = registry.clients.filter((c) => c.client.toLowerCase() !== current.toLowerCase());
if (!registry.clients.some((c) => c.client.toLowerCase() === current.toLowerCase())) {
    console.warn(`[client-leaks] "${current}" isn't in scripts/client-fingerprints.json yet; add it so later clients are checked against it.`);
}
if (BUILD_DIRS.length === 0) process.exit(0);
if (others.length === 0) {
    console.log('[client-leaks] No other clients registered yet; nothing to check against.');
    process.exit(0);
}

async function* files(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* files(full);
        else if (TEXT_FILES.test(entry.name)) yield full;
    }
}

const leaks = [];
for (const dir of BUILD_DIRS) {
    for await (const file of files(dir)) {
        const text = await readFile(file, 'utf8');
        const lower = text.toLowerCase();
        for (const { client, fingerprints } of others) {
            for (const fingerprint of fingerprints) {
                const at = lower.indexOf(fingerprint.toLowerCase());
                if (at > -1) {
                    leaks.push({ client, fingerprint, file: path.relative(ROOT, file), context: text.slice(Math.max(0, at - 40), at + fingerprint.length + 40).replace(/\s+/g, ' ') });
                }
            }
        }
    }
}

if (leaks.length) {
    console.error(`\n[client-leaks] The build for "${current}" contains details of other clients:\n`);
    for (const leak of leaks.slice(0, 25)) {
        console.error(`  ${leak.client} · "${leak.fingerprint}" in ${leak.file}\n      …${leak.context}…`);
    }
    if (leaks.length > 25) console.error(`  …and ${leaks.length - 25} more.`);
    console.error('\nReplace that content (brand.json, content.json, src/content/services, images, WordPress), then rebuild.\n');
    process.exit(1);
}
console.log(`[client-leaks] No other clients' details in the build (checked against ${others.map((c) => c.client).join(', ')}).`);
