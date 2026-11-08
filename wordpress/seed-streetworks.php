<?php
/**
 * Seeds the StreetWorks Exotics demo content. Safe to run more than once.
 *
 *   wp eval-file wordpress/seed-streetworks.php <path-to-src/assets/images>
 */

if (!defined('WP_CLI')) {
    exit;
}

require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/image.php';

$assets = rtrim($args[0] ?? '', '/');
if (!is_dir($assets)) {
    WP_CLI::error('Pass the path to src/assets/images as the first argument.');
}

/** Returns the attachment for a file, uploading it only if the library doesn't have it yet. */
function fire_seed_attachment(string $path): int
{
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
    WP_CLI::log("Uploaded " . basename($path));
    return $id;
}

/** Creates or updates a post by slug, then sets its featured image and ACF fields. */
function fire_seed_post(string $type, string $slug, array $post, ?int $thumb, array $fields): int
{
    $existing = get_page_by_path($slug, OBJECT, $type);
    $data = $post + ['post_type' => $type, 'post_name' => $slug, 'post_status' => 'publish'];
    $id = $existing ? wp_update_post(['ID' => $existing->ID] + $data, true) : wp_insert_post($data, true);
    if (is_wp_error($id)) {
        WP_CLI::error($id->get_error_message());
    }
    if ($thumb) {
        set_post_thumbnail($id, $thumb);
    }
    foreach ($fields as $name => $value) {
        update_field($name, $value, $id);
    }
    WP_CLI::log(($existing ? 'Updated' : 'Created') . " $type: $slug");
    return $id;
}

$img = fn(string $rel) => fire_seed_attachment("$assets/$rel");

// Showcases
fire_seed_post('showcase', 'iso-grifo-350gt', ['post_title' => 'Iso Grifo 350GT', 'menu_order' => 1], $img('homepage/Restored-1967-Iso-Grifo-4.jpg'), [
    'year'            => '1967',
    'description'     => 'In 2004, we showcased our first restoration of an Iso Grifo 350GT at Pebble Beach.',
    'cta_link'        => 'https://streetworksexotics.com/1967-iso-grifo-restoration/',
    'accent_color'    => '#fef08a',
    'gallery_image_1' => $img('homepage/Restored-1967-Iso-Grifo-Engine.jpg'),
    'gallery_image_2' => $img('homepage/Restored-1967-Iso-Grifo-Body.jpg'),
    'gallery_image_3' => $img('homepage/Restored-1967-Iso-Grifo-4.jpg'),
]);
fire_seed_post('showcase', 'jensen-cv8-mkiii', ['post_title' => 'Jensen CV8 MkIII', 'menu_order' => 2], $img('homepage/Jensen-CV8-MKIII-10.jpg'), [
    'year'            => '1966',
    'description'     => 'At StreetWorks, we deliver exceptional automobile restorations. We are dedicated to preserving the cars you love, specializing in Post-War vehicles.',
    'cta_link'        => 'https://streetworksexotics.com/the-incredible-restoration-journey-of-the-jensen-cv8-mkiii/',
    'accent_color'    => '#cbd5e1',
    'gallery_image_1' => $img('homepage/Jensen-CV8-MKIII-Restored.jpg'),
    'gallery_image_2' => $img('homepage/Jensen-CV8-MKIII-Interior.jpg'),
    'gallery_image_3' => $img('homepage/Jensen-CV8-MKIII-Engine.jpg'),
]);

// Testimonials
fire_seed_post('testimonial', 'brian-roell', ['post_title' => 'Brian Roell', 'menu_order' => 1], $img('reviews/Corvette-Testimonial.jpg'), [
    'quote' => 'On my Corvette, their team repaired the leather on my dash, A-pillar, and center console. They also restored the headliner and door panel map pockets on my Mustang Cobra. I am not an easy one to please, but both jobs were done with outstanding craftsmanship and attention to detail. The results honestly exceeded my expectations. The entire process was professional, timely, and hassle-free, and it’s clear they take real pride in their work.',
]);
fire_seed_post('testimonial', 'matt-protz', ['post_title' => 'Matt Protz', 'menu_order' => 2], $img('reviews/Testimonial-Matt.jpg'), [
    'quote' => 'This shop is amazing! The owner and all the staff are exceptional! Very friendly, and their skills are unmatched! If you have any need of professional car building or customizations, this is THE PLACE! Dream cars are made and perfected here.',
]);
fire_seed_post('testimonial', 'john-zick', ['post_title' => 'John Zick', 'menu_order' => 3], $img('reviews/Ford-Coupe-60.jpg'), [
    'quote' => 'They built my 30 Ford Coupe, and did an excellent job.',
]);

// Homepage service order follows the restoration journey.
$order = ['coachwork', 'custom-welding-fabrication', 'mechanical-electrical', 'body-paint', 'interior-upholstery', 'detailing-service', 'service-maintenance'];
foreach ($order as $i => $slug) {
    $service = get_page_by_path($slug, OBJECT, 'service');
    if ($service) {
        wp_update_post(['ID' => $service->ID, 'menu_order' => $i + 1]);
    } else {
        WP_CLI::warning("Service not found: $slug");
    }
}

WP_CLI::success('StreetWorks demo content seeded.');
