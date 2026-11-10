<?php
/**
 * Copies a client's existing blog from their current WordPress site (any theme or page
 * builder) into this one, over the old site's public REST API:
 *
 *   wp eval-file wordpress/import-posts.php wordpress/imports/<client>.json [overwrite]
 *
 * The settings file names the old site, the posts to leave behind and the posts that
 * become Case Studies (with their details); every other post becomes a Post with its
 * categories, date and byline. Content is rebuilt as clean blocks (see articles.php in the
 * plugin), images are copied into the media library once each, and links between the old
 * posts and pages are pointed at their new addresses. Audio and video files stay where
 * they are. Existing posts are kept unless "overwrite" is passed.
 */

if (!defined('WP_CLI')) {
    exit;
}
if (!function_exists('fire_headless_html_blocks')) {
    WP_CLI::error('Activate the FIRE Headless Content Model plugin first.');
}

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';
require_once ABSPATH . 'wp-admin/includes/taxonomy.php';

$settings_file = $args[0] ?? '';
$settings = is_file($settings_file) ? json_decode(file_get_contents($settings_file), true) : null;
if (!is_array($settings) || empty($settings['source'])) {
    WP_CLI::error('Pass a settings file with at least a "source" URL, e.g. wordpress/imports/<client>.json');
}
$overwrite = ($args[1] ?? '') === 'overwrite';
$source = rtrim($settings['source'], '/');
$case_studies = $settings['caseStudies'] ?? [];
$skip = $settings['skip'] ?? [];
$skip_categories = $settings['skipCategories'] ?? [];

function fire_import_get(string $url)
{
    $response = wp_remote_get($url, ['timeout' => 60]);
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
        WP_CLI::error("Could not read $url: " . (is_wp_error($response) ? $response->get_error_message() : wp_remote_retrieve_response_code($response)));
    }
    return [json_decode(wp_remote_retrieve_body($response), true), $response];
}

/** Every item of a REST collection, page by page. */
function fire_import_all(string $url): array
{
    $items = [];
    for ($page = 1; ; $page++) {
        [$batch, $response] = fire_import_get(add_query_arg(['per_page' => 100, 'page' => $page], $url));
        array_push($items, ...$batch);
        if ($page >= (int) wp_remote_retrieve_header($response, 'x-wp-totalpages')) {
            return $items;
        }
    }
}

/** "https://www.site.com/a/b/" and "http://site.com/a/b" compare equal. */
function fire_import_url_key(string $url): string
{
    $parts = wp_parse_url(html_entity_decode($url));
    return preg_replace('/^www\./', '', $parts['host'] ?? '') . '/' . trim($parts['path'] ?? '', '/');
}

/** Copies an image into the media library once; later calls return the same attachment. */
function fire_import_image(string $url, string $alt = ''): ?int
{
    $url = html_entity_decode($url);
    $existing = get_posts(['post_type' => 'attachment', 'post_status' => 'inherit', 'meta_key' => '_fire_source_url', 'meta_value' => $url, 'numberposts' => 1, 'fields' => 'ids']);
    if ($existing) {
        return $existing[0];
    }
    // Prefer the original upload over a resized copy ("photo-1024x683.jpg").
    $original = preg_replace('/-\d+x\d+(?=\.\w+(\?.*)?$)/', '', $url);
    $tmp = download_url($original, 120);
    if (is_wp_error($tmp) && $original !== $url) {
        $tmp = download_url($url, 120);
    }
    if (is_wp_error($tmp)) {
        WP_CLI::warning("Skipped image $url: " . $tmp->get_error_message());
        return null;
    }
    $id = media_handle_sideload(['name' => basename(wp_parse_url($original, PHP_URL_PATH)), 'tmp_name' => $tmp], 0);
    if (is_wp_error($id)) {
        @unlink($tmp);
        WP_CLI::warning("Skipped image $url: " . $id->get_error_message());
        return null;
    }
    update_post_meta($id, '_fire_source_url', $url);
    if ($alt !== '') {
        update_post_meta($id, '_wp_attachment_image_alt', $alt);
    }
    WP_CLI::log('  image ' . basename($original));
    return $id;
}

/** Plain text of inline HTML. */
function fire_import_text(string $html): string
{
    return trim(html_entity_decode(wp_strip_all_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

/**
 * The search title and description an SEO plugin (Yoast, Rank Math, All in One SEO) gave the
 * post, read from its page, so its search listing carries over. The title is only kept when
 * it differs from the post's own (less the site name the plugin adds).
 */
function fire_import_seo(string $link, string $title, string $site_name): array
{
    $response = wp_remote_get($link, ['timeout' => 30]);
    $html = is_wp_error($response) ? '' : wp_remote_retrieve_body($response);
    $decode = fn(string $text) => trim(html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $page_title = preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m) ? $decode($m[1]) : '';
    $page_title = $site_name !== '' ? trim(preg_replace('/\s*[|\-–—]\s*' . preg_quote($site_name, '/') . '.*$/iu', '', $page_title)) : $page_title;
    // The description tag, attributes in either order, its content up to the quote that opened it.
    $tag = preg_match('#<meta\b[^>]*\bname=(["\'])description\1[^>]*>#i', $html, $m) ? $m[0] : '';
    $description = preg_match('#\bcontent=(["\'])(.*?)\1#s', $tag, $m) ? $decode($m[2]) : '';
    $same = fn(string $a, string $b) => strtolower(preg_replace('/[^a-z0-9]/i', '', $a)) === strtolower(preg_replace('/[^a-z0-9]/i', '', $b));
    return ['seo_title' => $page_title !== '' && !$same($page_title, $title) ? $page_title : '', 'seo_description' => $description];
}

/** The opening of the first real paragraph, cut at a sentence, for listings. */
function fire_import_excerpt(array $blocks): string
{
    foreach ($blocks as $block) {
        if ($block['type'] !== 'paragraph' || mb_strlen($text = fire_import_text($block['html'])) < 80) {
            continue;
        }
        if (mb_strlen($text) <= 220) {
            return $text;
        }
        preg_match_all('/[^.!?]+[.!?]+["”’)]*\s*/u', $text, $m);
        $excerpt = '';
        foreach ($m[0] as $sentence) {
            if ($excerpt !== '' && mb_strlen($excerpt . $sentence) > 220) break;
            $excerpt .= $sentence;
        }
        return trim($excerpt ?: mb_substr($text, 0, 217) . '…');
    }
    return '';
}

WP_CLI::log("Reading $source");
[$site] = fire_import_get("$source/wp-json/");
$posts = fire_import_all("$source/wp-json/wp/v2/posts?_embed=wp:featuredmedia,wp:term,author");
$pages = fire_import_all("$source/wp-json/wp/v2/pages?_fields=slug,title,link");
$normalize = fn(string $name) => strtolower(preg_replace('/[^a-z0-9]/i', '', html_entity_decode($name)));
$site_name = $normalize($site['name'] ?? '');

// Where each old address now lives: posts and case studies by slug, pages matched to this
// site's services by title, the contact page to the contact form and the home page to "/".
$links = [fire_import_url_key($source) => '/'];
foreach ($posts as $post) {
    $base = isset($case_studies[$post['slug']]) ? '/case-studies/' : '/blog/';
    $links[fire_import_url_key($post['link'])] = $base . $post['slug'];
}
$services = [];
foreach (get_posts(['post_type' => 'service', 'numberposts' => -1]) as $service) {
    $services[$normalize($service->post_title)] = '/services/' . $service->post_name;
}
foreach ($pages as $page) {
    $title = $normalize($page['title']['rendered']);
    $key = fire_import_url_key($page['link']);
    if (isset($services[$title])) $links[$key] = $services[$title];
    elseif (strpos($page['slug'], 'contact') !== false) $links[$key] = '/#contact-section';
}
$relink = function (string $html) use ($links) {
    return preg_replace_callback('/href="([^"]+)"/i', function ($m) use ($links) {
        $key = fire_import_url_key($m[1]);
        return isset($links[$key]) ? 'href="' . $links[$key] . '"' : $m[0];
    }, $html);
};

// Newest case study first, unless reordered later in the admin.
$order = 0;
$imported = ['post' => 0, 'case_study' => 0];

foreach ($posts as $post) {
    $slug = $post['slug'];
    $terms = $post['_embedded']['wp:term'][0] ?? [];
    $term_slugs = array_column($terms, 'slug');
    if (in_array($slug, $skip, true) || array_intersect($term_slugs, $skip_categories)) {
        WP_CLI::log("Left out $slug");
        continue;
    }
    $type = isset($case_studies[$slug]) ? 'case_study' : 'post';
    $title = html_entity_decode($post['title']['rendered'], ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $existing = get_page_by_path($slug, OBJECT, $type);
    if ($existing && !$overwrite) {
        WP_CLI::log("Kept existing $type: $slug");
        continue;
    }
    WP_CLI::log("Importing $type: $slug");

    $featured_url = $post['_embedded']['wp:featuredmedia'][0]['source_url'] ?? '';
    $featured = $featured_url ? fire_import_image($featured_url, (string) ($post['_embedded']['wp:featuredmedia'][0]['alt_text'] ?? '')) : null;

    $blocks = fire_headless_html_blocks($post['content']['rendered'], function (DOMElement $img) {
        $id = fire_import_image(fire_headless_img_src($img), $img->getAttribute('alt'));
        return $id ? fire_headless_attachment_image($id) : null;
    });

    $kept = [];
    $media = [];
    $hero_repeat_removed = false;
    foreach ($blocks as $i => $block) {
        $text = isset($block['html']) ? fire_import_text($block['html']) : '';
        $last = count($kept) - 1;
        // Page builders often repeat a player for each screen size.
        if (isset($block['url'])) {
            if (isset($media[$block['url']])) continue;
            $media[$block['url']] = true;
        }
        // "Listen to this article:" above a player becomes its label.
        if (in_array($block['type'], ['audio', 'video'], true) && $last >= 0 && in_array($kept[$last]['type'], ['heading', 'paragraph'], true)
            && preg_match('/^(.{1,60}):$/u', fire_import_text($kept[$last]['html']), $m)) {
            $block['caption'] = $m[1];
            array_pop($kept);
        }
        // A line followed by "—Name" is a quote.
        if ($block['type'] === 'paragraph' && $last >= 0 && in_array($kept[$last]['type'], ['heading', 'paragraph'], true)
            && preg_match('/^[—–-]\s*(.{1,80})$/u', $text, $m)) {
            $kept[$last] = ['type' => 'quote', 'html' => $kept[$last]['html'], 'cite' => esc_html($m[1])];
            continue;
        }
        // Bylines and datelines written into the content: the site shows its own.
        if (in_array($block['type'], ['heading', 'paragraph'], true) && (preg_match('#href="[^"]*/author/#', $block['html']) || preg_match('/^(author|by)\s*:/i', $text))) continue;
        // A repeat of the title at the top.
        if (!$kept && in_array($block['type'], ['heading', 'paragraph'], true) && $normalize($text) === $normalize($title)) continue;
        if (isset($block['images'])) {
            // The featured image is the hero, so it doesn't repeat at the top; carousels list slides twice.
            $seen = [];
            $block['images'] = array_values(array_filter($block['images'], function ($image) use (&$seen, &$hero_repeat_removed, $featured, $kept) {
                if (isset($seen[$image['id']])) return false;
                if (!$hero_repeat_removed && $image['id'] === $featured && count($kept) < 2) {
                    return !($hero_repeat_removed = true);
                }
                return $seen[$image['id']] = true;
            }));
            if (!$block['images']) continue;
            if (count($block['images']) === 1) $block['type'] = 'image';
            foreach ($block['images'] as &$image) $image['caption'] = $relink($image['caption'] ?? '');
            unset($image);
        }
        foreach (['html', 'cite'] as $field) {
            if (isset($block[$field])) $block[$field] = $relink($block[$field]);
        }
        if (isset($block['items'])) $block['items'] = array_map($relink, $block['items']);
        $kept[] = $block;
    }

    $data = [
        'post_type'     => $type,
        'post_name'     => $slug,
        'post_title'    => $title,
        'post_status'   => 'publish',
        'post_date'     => $post['date'],
        'post_date_gmt' => $post['date_gmt'],
        'post_content'  => wp_slash(fire_headless_article_markup($kept)),
        'post_excerpt'  => fire_import_excerpt($kept),
        'menu_order'    => $type === 'case_study' ? ++$order : 0,
    ];
    $id = $existing ? wp_update_post(['ID' => $existing->ID] + $data, true) : wp_insert_post($data, true);
    if (is_wp_error($id)) {
        WP_CLI::error($id->get_error_message());
    }
    if ($featured) {
        set_post_thumbnail($id, $featured);
    }

    if ($type === 'post') {
        $categories = [];
        foreach ($terms as $term) {
            $term_id = term_exists($term['slug'], 'category') ?: wp_insert_term(html_entity_decode($term['name']), 'category', ['slug' => $term['slug']]);
            if (!is_wp_error($term_id)) $categories[] = (int) (is_array($term_id) ? $term_id['term_id'] : $term_id);
        }
        wp_set_post_categories($id, $categories ?: [(int) get_option('default_category')]);
    } else {
        foreach (['vehicle', 'year', 'scope', 'recognition'] as $field) {
            update_field($field, (string) ($case_studies[$slug][$field] ?? ''), $id);
        }
    }

    foreach (fire_import_seo($post['link'], $title, html_entity_decode($site['name'] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8')) as $field => $value) {
        update_field($field, $value, $id);
    }

    // The shop is the default byline, so only people are named.
    $author = (string) ($post['_embedded']['author'][0]['name'] ?? '');
    update_field('byline', $author !== '' && strpos($site_name, $normalize($author)) === false ? $author : '', $id);
    $imported[$type]++;
}

WP_CLI::success(sprintf('Imported %d posts and %d case studies.', $imported['post'], $imported['case_study']));
