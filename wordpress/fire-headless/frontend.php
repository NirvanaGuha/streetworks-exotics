<?php
/**
 * Sends visitors of WordPress's own pages to the real site. Once the domain points at the
 * Astro site, WordPress lives at its own address (e.g. cms.example.com), where the theme would
 * still show a second, out-of-date copy of every page, one search engines could index. Each
 * page goes to its address on the site with a permanent redirect; anything else keeps its path,
 * where the site's own redirects (src/data/redirects.json) take over. The admin, login, previews,
 * GraphQL, the REST API (and so the contact form) and uploaded files work as before.
 *
 * Set the site's address in wp-config.php:
 *     define('FIRE_PUBLIC_SITE_URL', 'https://example.com');
 * Without it, nothing here runs, which is what local and demo installs want.
 */

if (!defined('ABSPATH')) {
    exit;
}

/** The site's address without a trailing slash, or '' when none is set. */
function fire_headless_public_url(): string
{
    $url = defined('FIRE_PUBLIC_SITE_URL') ? (string) FIRE_PUBLIC_SITE_URL : (string) getenv('FIRE_PUBLIC_SITE_URL');
    return preg_match('#^https?://[^/]#', $url) ? untrailingslashit($url) : '';
}

/** Where the current request goes on the site: the same page's address there. */
function fire_headless_public_path(): string
{
    if (is_front_page()) {
        return '/';
    }
    if (is_home() || is_category() || is_tag() || is_author() || is_date()) {
        return '/blog';
    }
    if (is_feed()) {
        return '/rss.xml';
    }
    if (is_singular()) {
        $post = get_queried_object();
        $prefix = ['post' => '/blog/', 'case_study' => '/case-studies/', 'service' => '/services/', 'page' => '/'];
        if ($post instanceof WP_Post && isset($prefix[$post->post_type])) {
            return $prefix[$post->post_type] . $post->post_name;
        }
    }
    // The site's addresses have no trailing slash.
    $path = (string) wp_parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    return '/' . trim($path, '/');
}

// Ahead of everything else on template_redirect (author redirects, sitemaps, canonical URLs).
add_action('template_redirect', function () {
    $site = fire_headless_public_url();
    if (!$site || is_preview() || is_customize_preview() || (function_exists('is_graphql_http_request') && is_graphql_http_request())) {
        return;
    }
    if (is_attachment()) {
        wp_redirect(wp_get_attachment_url(get_queried_object_id()) ?: $site, 301, 'FIRE Headless');
        exit;
    }
    wp_redirect($site . fire_headless_public_path(), 301, 'FIRE Headless');
    exit;
}, 0);
