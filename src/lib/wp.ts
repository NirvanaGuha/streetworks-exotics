const WP_GRAPHQL_URL = import.meta.env.PUBLIC_WP_GRAPHQL_URL;

/**
 * A lightweight GraphQL client for fetching data from WordPress.
 *
 * Returns null when no WordPress URL is configured, so the site runs on local content.
 * If WordPress fails, development falls back to local content, but a production build
 * fails instead: shipping placeholder content over the real site is worse than keeping
 * the last good deploy.
 */
export async function fetchAPI(query: string, { variables }: { variables?: any } = {}) {
    if (!WP_GRAPHQL_URL) return null;

    try {
        const res = await fetch(WP_GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                variables,
            }),
        });

        if (!res.ok) {
            throw new Error(`WordPress responded ${res.status} ${res.statusText}`);
        }

        const json = await res.json();
        if (json.errors) {
            throw new Error(json.errors.map((e: any) => e.message).join('; '));
        }

        return json.data;
    } catch (error: any) {
        const message = `WordPress request to ${WP_GRAPHQL_URL} failed: ${error?.message || error}`;
        if (import.meta.env.PROD) throw new Error(message);
        console.warn(`[wp] ${message}. Using local content.`);
        return null;
    }
}
