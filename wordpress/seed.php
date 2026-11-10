<?php
/**
 * Loads a client's starter content into WordPress from the site's own files:
 *   src/data/content.json   hero, intro texts, showcases, testimonials
 *   src/data/brand.json     business details (address, phone, socials, video)
 *   both of those           Site Settings: colours, fonts, labels, headings, logos (site-settings.json)
 *   src/content/services    services: title, order, featured image, details, page text and galleries
 *   src/content/parts       parts: title, order, the car they fit, description and photos
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

/** The post of this type with this slug. (get_page_by_path alone also returns an image that shares the slug.) */
function fire_seed_find(string $slug, string $type): ?WP_Post
{
    $post = get_page_by_path($slug, OBJECT, $type);
    return $post && $post->post_type === $type ? $post : null;
}

/** Creates a post by slug if it's missing (or updates it when overwriting), with featured image and fields. */
function fire_seed_post(string $type, string $title, int $order, ?int $thumb, array $fields, bool $overwrite, array $post = []): void
{
    $slug = $post['post_name'] ?? sanitize_title($title);
    $existing = fire_seed_find($slug, $type);
    if ($existing && !$overwrite) {
        WP_CLI::log("Kept existing $type: $slug");
        return;
    }
    $data = $post + ['post_type' => $type, 'post_name' => $slug, 'post_title' => $title, 'post_status' => 'publish', 'menu_order' => $order];
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

// Site Settings: every field in the plugin's site-settings.json, filled with the value the
// site shows today, so editors see the current text, colours and images rather than blanks.
// SVG images stay built-in: WordPress doesn't accept SVG uploads.
$settings_id = fire_headless_settings_post_id();
if ($settings_id) {
    $site = ['brand' => $brand, 'content' => $content];
    $values = [];
    foreach (fire_headless_settings_schema()['sections'] as $section) {
        foreach ($section['fields'] as $field) {
            $value = $site;
            foreach (explode('.', $field['path']) as $part) {
                $value = is_array($value) && array_key_exists($part, $value) ? $value[$part] : null;
            }
            if ($value === null || $value === '') {
                continue;
            }
            if ($field['type'] === 'image') {
                if (preg_match('/\.svg$/i', (string) $value)) {
                    continue;
                }
                $value = str_starts_with((string) $value, '/')
                    ? fire_seed_image("$root/public", ltrim((string) $value, '/'))
                    : $img((string) $value);
            }
            $values[fire_headless_settings_field_name($field['path'])] = $value;
        }
    }
    fire_seed_fields($settings_id, $values, $overwrite);
    WP_CLI::log('Site Settings: ' . count($values) . ' fields');
}

// Services: one per file in src/content/services, slug = file name.
// The page content is built from the file's sections, in order.

/** A content file's Search & sharing title and description, for the plugin's SEO fields. */
function fire_seed_seo_fields(array $data): array
{
    return ['seo_title' => $data['seo']['title'] ?? '', 'seo_description' => $data['seo']['description'] ?? ''];
}

/** Image paths in the service files are relative to the file ("../../assets/images/x.jpg"). */
function fire_seed_service_image_path(string $path): string
{
    $pos = strpos($path, 'assets/images/');
    return $pos === false ? $path : substr($path, $pos + strlen('assets/images/'));
}

function fire_seed_paragraphs(string $text): string
{
    $blocks = [];
    foreach (preg_split('/\n{2,}/', trim($text)) as $paragraph) {
        // "## " marks a heading and "### " a subheading (see fire_headless_block_text in the plugin).
        if (preg_match('/^(#{2,3}) (.*)$/s', $paragraph, $m)) {
            $level = $m[1] === '###' ? 4 : 3;
            $blocks[] = "<!-- wp:heading {\"level\":$level} -->\n<h$level class=\"wp-block-heading\">" . esc_html($m[2]) . "</h$level>\n<!-- /wp:heading -->";
        } else {
            $blocks[] = "<!-- wp:paragraph -->\n<p>" . esc_html($paragraph) . "</p>\n<!-- /wp:paragraph -->";
        }
    }
    return implode("\n\n", $blocks);
}

function fire_seed_gallery(array $ids): string
{
    $images = '';
    foreach ($ids as $id) {
        [$src, $width, $height] = wp_get_attachment_image_src($id, 'large');
        $images .= sprintf(
            "<!-- wp:image {\"id\":%d,\"sizeSlug\":\"large\",\"linkDestination\":\"none\"} -->\n<figure class=\"wp-block-image size-large\"><img src=\"%s\" alt=\"\" width=\"%d\" height=\"%d\" class=\"wp-image-%d\"/></figure>\n<!-- /wp:image -->\n",
            $id, esc_url($src), $width, $height, $id
        );
    }
    return "<!-- wp:gallery {\"linkTo\":\"none\"} -->\n<figure class=\"wp-block-gallery has-nested-images columns-default is-cropped\">\n$images</figure>\n<!-- /wp:gallery -->";
}

/**
 * The service's sections in page order, as block markup (mirrors serviceSections() in
 * src/lib/localContent.ts, so WordPress and the fallback render the same).
 */
function fire_seed_service_content(array $data, callable $img): string
{
    $sections = [];
    $text = fn($value) => trim((string) $value) !== '' ? [['text', $value]] : [];
    $gallery = fn(array $images) => $images ? [['gallery', $images]] : [];

    $sections = array_merge($sections, $text(implode("\n\n", $data['deepTextParagraphs'] ?? [])));
    if (!empty($data['contentBlocks'])) {
        foreach ($data['contentBlocks'] as $block) {
            if ($block['type'] === 'text') $sections = array_merge($sections, $text($block['text']));
            if ($block['type'] === 'gallery') $sections = array_merge($sections, $gallery($block['images']));
        }
    } else {
        $images = $data['galleryImages'] ?? [];
        $half = (int) ceil(count($images) / 2);
        $sections = array_merge($sections, $gallery(array_slice($images, 0, $half)), $text($data['midText'] ?? ''), $gallery(array_slice($images, $half)));
    }
    $sections = array_merge($sections, $text($data['finalText'] ?? ''));

    $parts = [];
    foreach ($sections as [$type, $value]) {
        $parts[] = $type === 'text'
            ? fire_seed_paragraphs($value)
            : fire_seed_gallery(array_map(fn($path) => $img(fire_seed_service_image_path($path)), $value));
    }
    return implode("\n\n", $parts);
}

foreach (glob("$root/src/content/services/*.json") as $file) {
    $data = fire_seed_json($file);
    $slug = basename($file, '.json');
    $order = (int) ($data['order'] ?? 0);
    $existing = fire_seed_find($slug, 'service');
    if ($existing && !$overwrite) {
        // Keep the shop's content; only fill in an order if it has none.
        if ($order && (int) $existing->menu_order === 0) {
            wp_update_post(['ID' => $existing->ID, 'menu_order' => $order]);
        }
        WP_CLI::log("Kept existing service: $slug");
        continue;
    }
    fire_seed_post('service', $data['title'], $order, $img(fire_seed_service_image_path($data['heroImage'])), [
        'description'  => $data['heroTagline'] ?? '',
        'tint_color'   => $data['tintColor'] ?? '',
    ] + fire_seed_seo_fields($data), true, ['post_name' => $slug, 'post_content' => fire_seed_service_content($data, $img)]);
}

// Posts and case studies: one per file in src/content/posts and src/content/case-studies,
// written back as blocks with the plugin's own markup builder (see articles.php).

/** A file's blocks with every image uploaded, ready for fire_headless_article_markup(). */
function fire_seed_article_blocks(array $blocks, callable $img): array
{
    foreach ($blocks as &$block) {
        foreach ($block['images'] ?? [] as $i => $image) {
            $id = $img(fire_seed_service_image_path($image['src']));
            $block['images'][$i] = ['id' => $id, 'url' => wp_get_attachment_url($id), 'alt' => $image['alt'] ?? '', 'caption' => $image['caption'] ?? ''];
        }
    }
    return $blocks;
}

$article_types = ['post' => "$root/src/content/posts", 'case_study' => "$root/src/content/case-studies"];
foreach ($article_types as $type => $dir) {
    foreach (glob("$dir/*.json") as $file) {
        $data = fire_seed_json($file);
        $slug = basename($file, '.json');
        if (fire_seed_find($slug, $type) && !$overwrite) {
            WP_CLI::log("Kept existing $type: $slug");
            continue;
        }
        $fields = ['byline' => $data['byline'] ?? ''] + fire_seed_seo_fields($data);
        if ($type === 'case_study') {
            foreach (['vehicle', 'year', 'scope', 'recognition'] as $field) $fields[$field] = $data[$field] ?? '';
        }
        fire_seed_post($type, $data['title'], (int) ($data['order'] ?? 0), !empty($data['image']) ? $img(fire_seed_service_image_path($data['image'])) : null, $fields, true, [
            'post_name'    => $slug,
            'post_date'    => $data['date'],
            'post_excerpt' => $data['excerpt'] ?? '',
            'post_content' => wp_slash(fire_headless_article_markup(fire_seed_article_blocks($data['blocks'], $img))),
        ]);
        if ($type === 'post' && !empty($data['categories'])) {
            $post = fire_seed_find($slug, 'post');
            $ids = [];
            foreach ($data['categories'] as $category) {
                $term = term_exists($category['slug'], 'category') ?: wp_insert_term($category['name'], 'category', ['slug' => $category['slug']]);
                if (!is_wp_error($term)) $ids[] = (int) $term['term_id'];
            }
            wp_set_post_categories($post->ID, $ids);
        }
    }
}

// Parts: one per file in src/content/parts, slug = file name. The first image is the
// featured image; up to three more fill Photo 2 to 4.
foreach (glob("$root/src/content/parts/*.json") as $file) {
    $data = fire_seed_json($file);
    $slug = basename($file, '.json');
    $photos = [];
    foreach ($data['images'] ?? [] as $image) {
        $id = $img(fire_seed_service_image_path($image['src']));
        if (!empty($image['alt']) && get_post_meta($id, '_wp_attachment_image_alt', true) === '') {
            update_post_meta($id, '_wp_attachment_image_alt', $image['alt']);
        }
        $photos[] = $id;
    }
    fire_seed_post('part', $data['title'], (int) ($data['order'] ?? 0), $photos[0] ?? null, [
        'fits'        => $data['fits'] ?? '',
        'description' => $data['description'] ?? '',
        'photo_2'     => $photos[1] ?? null,
        'photo_3'     => $photos[2] ?? null,
        'photo_4'     => $photos[3] ?? null,
    ] + fire_seed_seo_fields($data), $overwrite, ['post_name' => $slug]);
}

WP_CLI::success('Starter content seeded' . ($overwrite ? ' (overwrite)' : '') . '.');
