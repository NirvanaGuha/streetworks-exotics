/**
 * Once the domain points at this site, WordPress lives at its own address (e.g.
 * cms.example.com). Its admin, its login page and the old site's uploaded files (linked from
 * other sites and image search; the folder is copied across at launch, see README) are
 * forwarded there permanently. Without a WordPress URL these addresses are a 404.
 *
 * Runs on request: the paths under them can't be listed at build time.
 */
import type { APIRoute } from 'astro';

const wpGraphqlUrl = import.meta.env.PUBLIC_WP_GRAPHQL_URL;
// The WordPress root: the GraphQL address minus its last part (/graphql, or ?graphql).
const wpRoot = wpGraphqlUrl ? new URL('./', wpGraphqlUrl).href.replace(/\/$/, '') : null;

export const forwardToWordPress: APIRoute = ({ url }) =>
    wpRoot ? Response.redirect(`${wpRoot}${url.pathname}${url.search}`, 301) : new Response(null, { status: 404 });
