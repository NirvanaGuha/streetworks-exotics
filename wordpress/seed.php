<?php
/**
 * Loads a client's starter content into WordPress from the site's own files:
 *   src/data/content.json   hero, intro texts, showcases, testimonials
 *   src/data/brand.json     business details (address, phone, socials, video)
 *   src/content/services    service order
 *   src/assets/images       every image those files refer to
 *
 *   wp eval-file wordpress/seed.php <project-root> [overwrite]
 *
 * By default it only fills what's missing, so it's safe to re-run on a live site.
 * Pass "overwrite" to replace existing seeded values with the files' versions.
 */

if (!defined('WP_CLI')) {
    exit;
}

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$root = rtrim($args[0] ?? getcwd(), '/');
$overwrite = ($args[1] ?? '') === 'overwrite';

function fire_seed_json(string $path): array
{
    if (!is_file($path)) {
        WP_CLI::error("Missing $path. Pass the project root as the first argument.");
    }
    $data = json_decode(file_get_contents($path), true);
    if (!is_array($data)) {
        WP_CLI::error("Invalid JSON in $path");
    }
    return $data;
}

$content = fire_seed_json("$root/src/data/content.json");
$brand = fire_seed_json("$root/src/data/brand.json");
$images = "$root/src/assets/images";

/** Returns the attachment for an image path, uploading it only if the library doesn't have it yet. */
function fire_seed_image(string $images, string $rel): int
{
    $path = "$images/$rel";
    $slug = sanitize_title(pathinfo($path, PATHINFO_FILENAME));
    $existing = get_posts(['post_type' => 'attachment', 'name' => $slug, 'post_status' => 'inherit', 'numberposts' => 1, 'fields' => 'ids']);
    if ($existing) {
        return $existing[0];
    }
    if (!is_file($path)) {
        WP_CLI::error("Missing image: $path");
    }
    $tmp = wp_tempnam($path);
    copy($path, $tmp);
    $id = media_handle_sideload(['name' => basename($path), 'tmp_name' => $tmp], 0);
    if (is_wp_error($id)) {
        WP_CLI::error($id->get_error_message());
    }
    WP_CLI::log('Uploaded ' . basename($path));
    return $id;
}

/** Sets ACF fields, leaving non-empty values alone unless overwriting. */
function fire_seed_fields(int $post_id, array $fields, bool $overwrite): void
{
    foreach ($fields as $name => $value) {
        if ($overwrite || in_array(get_field($name, $post_id, false), [null, '', false], true)) {
            update_field($name, $value, $post_id);
        }
    }
}

/** Creates a post by slug if it's missing (or updates it when overwriting), with featured image and fields. */
function fire_seed_post(string $type, string $title, int $order, ?int $thumb, array $fields, bool $overwrite): void
{
    $slug = sanitize_title($title);
    $existing = get_page_by_path($slug, OBJECT, $type);
    if ($existing && !$overwrite) {
        WP_CLI::log("Kept existing $type: $slug");
        return;
    }
    $data = ['post_type' => $type, 'post_name' => $slug, 'post_title' => $title, 'post_status' => 'publish', 'menu_order' => $order];
    $id = $existing ? wp_update_post(['ID' => $existing->ID] + $data, true) : wp_insert_post($data, true);
    if (is_wp_error($id)) {
        WP_CLI::error($id->get_error_message());
    }
    if ($thumb) {
        set_post_thumbnail($id, $thumb);
    }
    fire_seed_fields($id, $fields, true);
    WP_CLI::log(($existing ? 'Updated' : 'Created') . " $type: $slug");
}

$img = fn(string $rel) => fire_seed_image($images, $rel);

// Front page: the homepage settings and business details are stored on it.
$front_id = (int) get_option('page_on_front');
if (get_option('show_on_front') !== 'page' || !$front_id || !get_post($front_id)) {
    $front_id = wp_insert_post(['post_type' => 'page', 'post_title' => 'Home', 'post_name' => 'home', 'post_status' => 'publish'], true);
    if (is_wp_error($front_id)) {
        WP_CLI::error($front_id->get_error_message());
    }
    update_option('show_on_front', 'page');
    update_option('page_on_front', $front_id);
    WP_CLI::log("Created front page #$front_id");
}

fire_seed_fields($front_id, [
    'hero_headline' => $content['hero']['headline'],
    'hero_tagline'  => $content['hero']['tagline'],
    'hero_image'    => $img($content['hero']['image']),
    'intro_text_1'  => $content['introTexts'][0] ?? '',
    'intro_text_2'  => $content['introTexts'][1] ?? '',
    'intro_text_3'  => $content['introTexts'][2] ?? '',
], $overwrite);

$business = $brand['business'];
fire_seed_fields($front_id, [
    'business_name' => $business['name'],
    'address'       => implode("\n", $business['address']),
    'phone'         => $business['phone'],
    'email'         => $business['email'],
    'maps_url'      => $business['mapsUrl'],
    'video_url'     => $business['videoUrl'],
] + array_combine(
    array_map(fn($network) => "{$network}_url", array_keys($business['socials'])),
    array_values($business['socials'])
), $overwrite);
WP_CLI::log('Homepage settings and business details filled');

foreach ($content['showcases'] as $i => $showcase) {
    $gallery = array_map($img, $showcase['gallery']);
    fire_seed_post('showcase', $showcase['title'], $i + 1, $img($showcase['image']), [
        'year'            => $showcase['year'],
        'description'     => $showcase['description'],
        'cta_link'        => $showcase['ctaLink'],
        'accent_color'    => $showcase['accentColor'],
        'gallery_image_1' => $gallery[0] ?? null,
        'gallery_image_2' => $gallery[1] ?? null,
        'gallery_image_3' => $gallery[2] ?? null,
    ], $overwrite);
}

foreach ($content['testimonials'] as $i => $testimonial) {
    fire_seed_post('testimonial', $testimonial['name'], $i + 1, $img($testimonial['photo']), [
        'quote' => $testimonial['quote'],
    ], $overwrite);
}

// Service order comes from the local service files; the services themselves are entered in WordPress.
foreach (glob("$root/src/content/services/*.json") as $file) {
    $data = json_decode(file_get_contents($file), true);
    $service = get_page_by_path(basename($file, '.json'), OBJECT, 'service');
    if ($service && isset($data['order']) && ($overwrite || (int) $service->menu_order === 0)) {
        wp_update_post(['ID' => $service->ID, 'menu_order' => (int) $data['order']]);
    }
}

WP_CLI::success('Starter content seeded' . ($overwrite ? ' (overwrite)' : '') . '.');
