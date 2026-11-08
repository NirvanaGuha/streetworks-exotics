<?php
/**
 * Plugin Name: FIRE Headless Content Model
 * Description: Post types and ACF fields that the Astro front end reads over WPGraphQL. Works with free ACF (no Repeater/Gallery fields).
 * Version:     1.0.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Post types. Showcases and Testimonials are ordered with "Order" (menu_order)
 * in the Page Attributes box, which is what the front end sorts by.
 */
add_action('init', function () {
    $shared = [
        'public'              => true,
        'publicly_queryable'  => false, // Astro renders the pages; WordPress is only the editor.
        'show_in_rest'        => true,
        'show_in_graphql'     => true,
        'has_archive'         => false,
        'exclude_from_search' => true,
    ];

    // Services may already be registered by Custom Post Type UI on older installs.
    if (!post_type_exists('service')) {
        register_post_type('service', $shared + [
            'label'               => 'Services',
            'labels'              => ['singular_name' => 'Service'],
            'publicly_queryable'  => true,
            'menu_icon'           => 'dashicons-hammer',
            'supports'            => ['title', 'editor', 'thumbnail', 'page-attributes', 'custom-fields'],
            'graphql_single_name' => 'Service',
            'graphql_plural_name' => 'Services',
        ]);
    }
    add_post_type_support('service', 'page-attributes');

    register_post_type('showcase', $shared + [
        'label'               => 'Showcases',
        'labels'              => ['singular_name' => 'Showcase', 'add_new_item' => 'Add New Showcase'],
        'description'         => 'Featured restorations shown full-screen on the homepage.',
        'menu_icon'           => 'dashicons-car',
        'supports'            => ['title', 'thumbnail', 'page-attributes'],
        'graphql_single_name' => 'Showcase',
        'graphql_plural_name' => 'Showcases',
    ]);

    register_post_type('testimonial', $shared + [
        'label'               => 'Testimonials',
        'labels'              => ['singular_name' => 'Testimonial', 'add_new_item' => 'Add New Testimonial'],
        'description'         => 'Customer reviews. The title is the customer name; the featured image is shown beside the quote.',
        'menu_icon'           => 'dashicons-format-quote',
        'supports'            => ['title', 'thumbnail', 'page-attributes'],
        'graphql_single_name' => 'Testimonial',
        'graphql_plural_name' => 'Testimonials',
    ]);
}, 20); // After Custom Post Type UI (priority 10), so the post_type_exists check sees it.

/**
 * Field groups. Keys match the groups that were first created in the ACF admin,
 * so values already saved against them keep working.
 */
add_action('acf/include_fields', function () {
    if (!function_exists('acf_add_local_field_group')) {
        return;
    }

    $graphql = fn(string $name) => [
        'show_in_graphql'                       => 1,
        'graphql_field_name'                    => $name,
        'map_graphql_types_from_location_rules' => 1,
        'graphql_types'                         => '',
    ];
    $image = fn(string $key, string $name, string $label, string $instructions = '') => [
        'key'           => $key,
        'name'          => $name,
        'label'         => $label,
        'type'          => 'image',
        'return_format' => 'array',
        'preview_size'  => 'medium',
        'instructions'  => $instructions,
    ];

    acf_add_local_field_group([
        'key'      => 'group_homepage_settings',
        'title'    => 'Homepage Settings',
        'location' => [[['param' => 'page_type', 'operator' => '==', 'value' => 'front_page']]],
        'fields'   => [
            ['key' => 'field_hero_headline', 'name' => 'hero_headline', 'label' => 'Hero Headline', 'type' => 'text'],
            ['key' => 'field_hero_tagline', 'name' => 'hero_tagline', 'label' => 'Hero Tagline', 'type' => 'text'],
            $image('field_hero_image', 'hero_image', 'Hero Background Image'),
            ['key' => 'field_intro_text_1', 'name' => 'intro_text_1', 'label' => 'Intro Text 1 (after the logo)', 'type' => 'textarea', 'rows' => 4],
            ['key' => 'field_intro_text_2', 'name' => 'intro_text_2', 'label' => 'Intro Text 2 (after the first showcase)', 'type' => 'textarea', 'rows' => 4],
            ['key' => 'field_intro_text_3', 'name' => 'intro_text_3', 'label' => 'Intro Text 3 (after the second showcase)', 'type' => 'textarea', 'rows' => 4],
        ],
    ] + $graphql('homepageSettings'));

    acf_add_local_field_group([
        'key'      => 'group_6a001011735de',
        'title'    => 'Service Details',
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'service']]],
        'fields'   => [
            ['key' => 'field_6a001011544a1', 'name' => 'hero_tagline', 'label' => 'Hero Tagline', 'type' => 'text'],
            ['key' => 'field_6a00103c544a2', 'name' => 'description', 'label' => 'Description', 'type' => 'textarea', 'rows' => 3, 'instructions' => 'Short line shown under the title on the homepage and the service hero.'],
            ['key' => 'field_6a001056544a3', 'name' => 'tint_color', 'label' => 'Tint Color', 'type' => 'color_picker'],
        ],
    ] + $graphql('serviceDetails'));

    acf_add_local_field_group([
        'key'      => 'group_showcase_details',
        'title'    => 'Showcase Details',
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'showcase']]],
        'fields'   => [
            ['key' => 'field_showcase_year', 'name' => 'year', 'label' => 'Year', 'type' => 'text', 'instructions' => 'Model year, e.g. 1967.'],
            ['key' => 'field_showcase_description', 'name' => 'description', 'label' => 'Intro', 'type' => 'textarea', 'rows' => 3],
            ['key' => 'field_showcase_cta_link', 'name' => 'cta_link', 'label' => 'Read More Link', 'type' => 'url'],
            ['key' => 'field_showcase_accent_color', 'name' => 'accent_color', 'label' => 'Accent Color', 'type' => 'color_picker'],
            $image('field_showcase_gallery_1', 'gallery_image_1', 'Gallery Image 1', 'Left column, tall.'),
            $image('field_showcase_gallery_2', 'gallery_image_2', 'Gallery Image 2', 'Right column, square.'),
            $image('field_showcase_gallery_3', 'gallery_image_3', 'Gallery Image 3', 'Right column, tall.'),
        ],
    ] + $graphql('showcaseDetails'));

    acf_add_local_field_group([
        'key'      => 'group_testimonial_details',
        'title'    => 'Testimonial Details',
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'testimonial']]],
        'fields'   => [
            ['key' => 'field_testimonial_quote', 'name' => 'quote', 'label' => 'Quote', 'type' => 'textarea', 'rows' => 5],
        ],
    ] + $graphql('testimonialDetails'));
});
