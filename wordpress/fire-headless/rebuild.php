<?php
/**
 * Rebuilds the site when content changes. The Astro pages are built ahead of time, so an edit
 * only shows once the host builds again; this calls the host's deploy hook (a private address
 * that starts a build) whenever something the site shows is published, changed or removed.
 *
 * Set the address in wp-config.php (it is a secret: anyone who has it can start builds):
 *     define('FIRE_DEPLOY_HOOK_URL', 'https://api.vercel.com/v1/integrations/deploy/...');
 * Without it, nothing here runs.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Saves this close together share one build: the first starts it, and later ones wait for
// the window to end and start one more, so the last edit is always included.
const FIRE_HEADLESS_REBUILD_WINDOW = 20;

/** The deploy hook address, or '' when none is set or it isn't HTTPS. */
function fire_headless_rebuild_url(): string
{
    $url = defined('FIRE_DEPLOY_HOOK_URL') ? (string) FIRE_DEPLOY_HOOK_URL : (string) getenv('FIRE_DEPLOY_HOOK_URL');
    return wp_parse_url($url, PHP_URL_SCHEME) === 'https' ? $url : '';
}

/** Post types and taxonomies the site shows. Enquiries stay private, so they never rebuild. */
function fire_headless_rebuild_post_types(): array
{
    return apply_filters('fire_headless_rebuild_post_types', ['post', 'page', 'service', 'showcase', 'case_study', 'testimonial', 'part', 'site_settings']);
}
function fire_headless_rebuild_taxonomies(): array
{
    return apply_filters('fire_headless_rebuild_taxonomies', ['category', 'post_tag']);
}

/**
 * Marks that this request changed something the site shows. The build is requested once, as
 * the request ends, however many changes it made. Returns whether a build is queued.
 */
function fire_headless_rebuild_queue(bool $reset = false): bool
{
    static $queued = false;
    if ($reset) {
        return $queued = false;
    }
    if (!$queued && fire_headless_rebuild_url()) {
        $queued = true;
        add_action('shutdown', 'fire_headless_rebuild_on_shutdown', 100);
    }
    return $queued;
}

function fire_headless_rebuild_on_shutdown(): void
{
    // The page has been sent by now (WordPress flushes at priority 1); hand the editor their
    // response so a slow host doesn't hold up their save.
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    }
    $last = (int) (get_option('fire_headless_rebuild_status')['time'] ?? 0);
    $next = $last + FIRE_HEADLESS_REBUILD_WINDOW;
    if (time() >= $next) {
        fire_headless_rebuild_send();
    } elseif (!wp_next_scheduled('fire_headless_rebuild')) {
        // WP-Cron runs on the next request after this time; the build's own content requests
        // to WordPress are enough to set it off.
        wp_schedule_single_event($next, 'fire_headless_rebuild');
    }
}
add_action('fire_headless_rebuild', 'fire_headless_rebuild_send');

/**
 * Calls the deploy hook and records the outcome for the admin bar. A failed call is tried
 * again after 1, then 2, then 3 minutes, so a brief outage doesn't leave the site behind until
 * the next edit. Returns whether it worked.
 */
function fire_headless_rebuild_send(): bool
{
    $url = fire_headless_rebuild_url();
    if (!$url) {
        return false;
    }
    $previous = get_option('fire_headless_rebuild_status');
    $response = wp_remote_post($url, ['timeout' => 5]);
    $code = is_wp_error($response) ? 0 : (int) wp_remote_retrieve_response_code($response);
    $ok = $code >= 200 && $code < 300;
    $error = is_wp_error($response) ? $response->get_error_message() : "the host answered $code";
    $failures = $ok ? 0 : (int) ($previous['failures'] ?? 0) + 1;
    update_option('fire_headless_rebuild_status', ['time' => time(), 'ok' => $ok, 'error' => $ok ? '' : $error, 'failures' => $failures], false);
    if (!$ok && $failures <= 3 && !wp_next_scheduled('fire_headless_rebuild')) {
        wp_schedule_single_event(time() + 60 * $failures, 'fire_headless_rebuild');
    }
    return $ok;
}

// What counts as a change: a shown post type going live, being edited while live, or leaving
// (unpublished, trashed or deleted). Drafts and autosaves don't count.
add_action('transition_post_status', function ($new, $old, $post) {
    if (($new === 'publish' || $old === 'publish') && in_array($post->post_type, fire_headless_rebuild_post_types(), true) && !wp_is_post_revision($post)) {
        fire_headless_rebuild_queue();
    }
}, 10, 3);
add_action('before_delete_post', function ($post_id, $post) {
    if ($post && $post->post_status === 'publish' && in_array($post->post_type, fire_headless_rebuild_post_types(), true)) {
        fire_headless_rebuild_queue();
    }
}, 10, 2);

// ACF fields are saved apart from the post (in the block editor, by a second request), so a
// field-only change to a live post counts too.
add_action('acf/save_post', function ($post_id) {
    if (is_numeric($post_id) && get_post_status((int) $post_id) === 'publish' && in_array(get_post_type((int) $post_id), fire_headless_rebuild_post_types(), true)) {
        fire_headless_rebuild_queue();
    }
}, 20);

// Media: a photo's caption or title (edit_attachment), its alt text (post meta), or removing it.
add_action('edit_attachment', 'fire_headless_rebuild_queue_action');
add_action('delete_attachment', 'fire_headless_rebuild_queue_action');
foreach (['added_post_meta', 'updated_post_meta', 'deleted_post_meta'] as $meta_action) {
    add_action($meta_action, function ($meta_id, $object_id, $meta_key) {
        if ($meta_key === '_wp_attachment_image_alt') {
            fire_headless_rebuild_queue();
        }
    }, 10, 3);
}

// Categories and tags: added, renamed or removed, or a live post's changed without a save
// (by a plugin or WP-CLI; the editor saves the post as well).
foreach (['created_term', 'edited_term', 'delete_term'] as $term_action) {
    add_action($term_action, function ($term_id, $tt_id, $taxonomy) {
        if (in_array($taxonomy, fire_headless_rebuild_taxonomies(), true)) {
            fire_headless_rebuild_queue();
        }
    }, 10, 3);
}
add_action('set_object_terms', function ($object_id, $terms, $tt_ids, $taxonomy) {
    if (in_array($taxonomy, fire_headless_rebuild_taxonomies(), true) && get_post_status($object_id) === 'publish' && in_array(get_post_type($object_id), fire_headless_rebuild_post_types(), true)) {
        fire_headless_rebuild_queue();
    }
}, 10, 4);

/** For hooks whose arguments don't matter. */
function fire_headless_rebuild_queue_action(): void
{
    fire_headless_rebuild_queue();
}

// "Rebuild site" in the admin bar, for anyone who can publish: starts a build straight away
// and shows how the last one went.
add_action('admin_bar_menu', function (WP_Admin_Bar $bar) {
    if (!fire_headless_rebuild_url() || !current_user_can('publish_posts')) {
        return;
    }
    $status = get_option('fire_headless_rebuild_status');
    if (!$status) {
        $last = 'No rebuild requested yet';
    } elseif ($status['ok']) {
        $last = sprintf('Last rebuild requested %s ago', human_time_diff($status['time']));
    } else {
        $last = sprintf('Last rebuild failed %s ago: %s', human_time_diff($status['time']), $status['error']);
    }
    $bar->add_node([
        'id'    => 'fire-rebuild',
        'title' => 'Rebuild site',
        'href'  => wp_nonce_url(admin_url('admin-post.php?action=fire_headless_rebuild'), 'fire_headless_rebuild'),
        'meta'  => ['title' => 'Publish the latest content to the site now. Saving content does this on its own.'],
    ]);
    $bar->add_node(['parent' => 'fire-rebuild', 'id' => 'fire-rebuild-status', 'title' => esc_html($last)]);
}, 90);

add_action('admin_post_fire_headless_rebuild', function () {
    if (!current_user_can('publish_posts')) {
        wp_die('You are not allowed to rebuild the site.', 403);
    }
    check_admin_referer('fire_headless_rebuild');
    $result = fire_headless_rebuild_send() ? 'sent' : 'failed';
    wp_safe_redirect(add_query_arg('fire-rebuild', $result, wp_get_referer() ?: admin_url()));
    exit;
});

// The notice after pressing it, shown only if a call was just made, so an old or shared link
// with ?fire-rebuild= in it says nothing.
add_action('admin_notices', function () {
    $status = get_option('fire_headless_rebuild_status');
    if (!$status || time() - $status['time'] > 60) {
        return;
    }
    $result = $_GET['fire-rebuild'] ?? '';
    if ($result === 'sent' && $status['ok']) {
        echo '<div class="notice notice-success is-dismissible"><p>Rebuild started. The site shows the latest content in a minute or two.</p></div>';
    } elseif ($result === 'failed' && !$status['ok']) {
        echo '<div class="notice notice-error is-dismissible"><p>The rebuild could not be started: ' . esc_html($status['error']) . ($status['failures'] <= 3 ? '. It will be tried again in a minute.' : '.') . '</p></div>';
    }
});
