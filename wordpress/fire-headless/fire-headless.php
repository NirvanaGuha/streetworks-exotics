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

require_once __DIR__ . '/articles.php';
require_once __DIR__ . '/rebuild.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/site-settings.php';

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

    // Contact form submissions from the front end. Read-only in the admin, never public.
    register_post_type('enquiry', [
        'label'           => 'Enquiries',
        'labels'          => ['singular_name' => 'Enquiry'],
        'public'          => false,
        'show_ui'         => true,
        'show_in_rest'    => false,
        'show_in_graphql' => false,
        'menu_icon'       => 'dashicons-email-alt',
        'supports'        => ['title', 'editor'],
        'capability_type' => 'post',
        'capabilities'    => ['create_posts' => 'do_not_allow'],
        'map_meta_cap'    => true,
    ]);

    // Long-form restoration stories. Blog posts stay as ordinary Posts.
    register_post_type('case_study', $shared + [
        'label'               => 'Case Studies',
        'labels'              => ['singular_name' => 'Case Study', 'add_new_item' => 'Add New Case Study'],
        'description'         => 'Restoration stories, one car each. Written like a post; the details box adds the car and its recognition.',
        'menu_icon'           => 'dashicons-media-document',
        'supports'            => ['title', 'editor', 'thumbnail', 'excerpt', 'page-attributes'],
        'graphql_single_name' => 'CaseStudy',
        'graphql_plural_name' => 'CaseStudies',
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

    // Free ACF has no options pages, so site-wide details live on the front page too.
    // Empty fields fall back to src/data/brand.json in the front end.
    $url = fn(string $network, string $label) => ['key' => "field_business_{$network}_url", 'name' => "{$network}_url", 'label' => $label, 'type' => 'url'];
    acf_add_local_field_group([
        'key'        => 'group_business_details',
        'title'      => 'Business Details',
        'menu_order' => 1,
        'location'   => [[['param' => 'page_type', 'operator' => '==', 'value' => 'front_page']]],
        'fields'     => [
            ['key' => 'field_business_name', 'name' => 'business_name', 'label' => 'Business Name', 'type' => 'text'],
            ['key' => 'field_business_address', 'name' => 'address', 'label' => 'Address', 'type' => 'textarea', 'rows' => 3, 'new_lines' => '', 'instructions' => 'One line per row.'],
            ['key' => 'field_business_phone', 'name' => 'phone', 'label' => 'Phone', 'type' => 'text', 'instructions' => 'As it should appear, e.g. +1 262-547-0052.'],
            ['key' => 'field_business_email', 'name' => 'email', 'label' => 'Email', 'type' => 'email'],
            ['key' => 'field_business_maps_url', 'name' => 'maps_url', 'label' => 'Directions Link', 'type' => 'url', 'instructions' => 'Google Maps link for "Get Directions".'],
            ['key' => 'field_business_video_url', 'name' => 'video_url', 'label' => 'Hero Video', 'type' => 'url', 'instructions' => 'YouTube link for the play button on the homepage.'],
            $url('instagram', 'Instagram'),
            $url('facebook', 'Facebook'),
            $url('youtube', 'YouTube'),
            $url('tiktok', 'TikTok'),
        ],
    ] + $graphql('businessDetails'));

    acf_add_local_field_group([
        'key'      => 'group_6a001011735de',
        'title'    => 'Service Details',
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'service']]],
        'fields'   => [
            // (An older "Hero Tagline" field was never shown on the site; its saved values stay in the database, unused.)
            ['key' => 'field_6a00103c544a2', 'name' => 'description', 'label' => 'Tagline', 'type' => 'textarea', 'rows' => 3, 'instructions' => 'Short line under the title on the homepage and the service page. Also the search description, unless one is set under Search & sharing.'],
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
        'key'      => 'group_case_study_details',
        'title'    => 'Case Study Details',
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'case_study']]],
        'fields'   => [
            ['key' => 'field_case_study_vehicle', 'name' => 'vehicle', 'label' => 'Car', 'type' => 'text', 'instructions' => 'Shown large on the case study, e.g. Iso Grifo A3/C. The title is the story headline.'],
            ['key' => 'field_case_study_year', 'name' => 'year', 'label' => 'Year', 'type' => 'text', 'instructions' => 'Model year, e.g. 1964.'],
            ['key' => 'field_case_study_scope', 'name' => 'scope', 'label' => 'Work', 'type' => 'text', 'instructions' => 'What the shop did, e.g. Full restoration.'],
            ['key' => 'field_case_study_recognition', 'name' => 'recognition', 'label' => 'Recognition', 'type' => 'text', 'instructions' => 'Awards or shows, e.g. Best of Show, Concorso Italiano 2017. Leave empty if none.'],
        ],
    ] + $graphql('caseStudyDetails'));

    acf_add_local_field_group([
        'key'      => 'group_article_details',
        'title'    => 'Byline',
        'position' => 'side',
        'location' => [
            [['param' => 'post_type', 'operator' => '==', 'value' => 'post']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'case_study']],
        ],
        'fields'   => [
            ['key' => 'field_article_byline', 'name' => 'byline', 'label' => 'Written by', 'type' => 'text', 'instructions' => 'Leave empty to credit the shop.'],
        ],
    ] + $graphql('articleDetails'));

    // How a page looks in search results and link previews. Empty fields use the page's
    // own title, excerpt (or opening text) and featured image.
    acf_add_local_field_group([
        'key'      => 'group_page_seo',
        'title'    => 'Search & sharing',
        'position' => 'side',
        'location' => [
            [['param' => 'post_type', 'operator' => '==', 'value' => 'post']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'case_study']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'service']],
            [['param' => 'post_type', 'operator' => '==', 'value' => 'page']],
        ],
        'fields'   => [
            ['key' => 'field_seo_title', 'name' => 'seo_title', 'label' => 'Title', 'type' => 'text', 'instructions' => 'Search and browser-tab title. Empty: the page title.'],
            ['key' => 'field_seo_description', 'name' => 'seo_description', 'label' => 'Description', 'type' => 'textarea', 'rows' => 3, 'new_lines' => '', 'instructions' => 'One or two sentences for search results and link previews. Empty: the excerpt or opening text.'],
            $image('field_seo_image', 'seo_image', 'Link preview image', 'Empty: the featured image. 1200 × 630 works best.'),
        ],
    ] + $graphql('pageSeo'));

    acf_add_local_field_group([
        'key'      => 'group_testimonial_details',
        'title'    => 'Testimonial Details',
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'testimonial']]],
        'fields'   => [
            ['key' => 'field_testimonial_quote', 'name' => 'quote', 'label' => 'Quote', 'type' => 'textarea', 'rows' => 5],
        ],
    ] + $graphql('testimonialDetails'));
});

/**
 * Contact form endpoint: POST /wp-json/fire/v1/enquiries
 *
 * Only the Astro server calls this. It must send the shared secret defined as
 * FIRE_FORM_SECRET in wp-config.php (and WP_FORM_SECRET in the site's .env).
 * Each enquiry is saved under Enquiries and emailed to the site admin address,
 * or to the FIRE_ENQUIRY_RECIPIENT constant if it is defined.
 *
 * Rate limits: 5 enquiries per visitor per 10 minutes and 50 per hour in total; past
 * either the endpoint answers 429. Visitors are told apart by a salted hash of the IP
 * the Astro server forwards, kept only for the length of the window. Requests that arrive
 * without one share a single visitor's allowance, so a missing header can't lift the limit.
 * Two enquiries landing in the same instant can both pass a limit's last slot (transients
 * have no atomic increment); at these numbers that's one extra message at most.
 */
add_action('rest_api_init', function () {
    register_rest_route('fire/v1', '/enquiries', [
        'methods'             => 'POST',
        'permission_callback' => function (WP_REST_Request $request) {
            $secret = defined('FIRE_FORM_SECRET') ? (string) FIRE_FORM_SECRET : '';
            return $secret !== '' && hash_equals($secret, (string) $request->get_header('x-fire-form-secret'));
        },
        'args' => [
            'name'    => ['type' => 'string', 'required' => true, 'maxLength' => 100, 'validate_callback' => 'rest_validate_request_arg', 'sanitize_callback' => 'sanitize_text_field'],
            'email'   => ['type' => 'string', 'required' => true, 'maxLength' => 254, 'validate_callback' => 'rest_validate_request_arg', 'format' => 'email', 'sanitize_callback' => 'sanitize_email'],
            'message' => ['type' => 'string', 'required' => true, 'maxLength' => 5000, 'validate_callback' => 'rest_validate_request_arg', 'sanitize_callback' => 'sanitize_textarea_field'],
            'page'    => ['type' => 'string', 'required' => false, 'maxLength' => 500, 'validate_callback' => 'rest_validate_request_arg', 'sanitize_callback' => 'esc_url_raw'],
        ],
        'callback' => 'fire_headless_create_enquiry',
    ]);
});

function fire_headless_create_enquiry(WP_REST_Request $request)
{
    $name    = $request['name'];
    $email   = $request['email'];
    $message = $request['message'];
    if ($name === '' || !is_email($email) || $message === '') {
        return new WP_Error('fire_invalid_enquiry', 'Name, a valid email and a message are required.', ['status' => 400]);
    }
    if (!fire_headless_enquiry_allowed((string) $request->get_header('x-fire-client-ip'))) {
        return new WP_Error('fire_rate_limited', 'Too many enquiries. Please try again later.', ['status' => 429]);
    }

    $id = wp_insert_post([
        'post_type'    => 'enquiry',
        'post_status'  => 'private',
        'post_title'   => sprintf('%s (%s)', $name, $email),
        'post_content' => $message,
        'meta_input'   => [
            'enquiry_name'  => $name,
            'enquiry_email' => $email,
            'enquiry_page'  => (string) $request['page'],
        ],
    ], true);
    if (is_wp_error($id)) {
        return $id;
    }

    $to = defined('FIRE_ENQUIRY_RECIPIENT') ? FIRE_ENQUIRY_RECIPIENT : get_option('admin_email');
    $site = wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES);
    $body = "Name: $name\nEmail: $email\n" . ($request['page'] ? "Sent from: {$request['page']}\n" : '') . "\n$message\n";
    // The name goes into a header, so only characters that can't start another address or header.
    $reply_name = trim(preg_replace('/[^\p{L}\p{N} .\'-]/u', '', $name));
    $reply_to = $reply_name !== '' ? sprintf('"%s" <%s>', $reply_name, $email) : $email;
    $mailed = wp_mail($to, sprintf('[%s] New enquiry from %s', $site, $reply_name ?: $email), $body, ['Reply-To: ' . $reply_to]);
    update_post_meta($id, 'enquiry_emailed', $mailed ? 'yes' : 'no');

    // The enquiry is saved either way, so a mail failure doesn't lose the lead.
    return new WP_REST_Response(['success' => true, 'emailed' => $mailed], 201);
}

/**
 * Counts an enquiry against the rate limits and says whether it may go through.
 * Uses transients, so the limits hold across requests without a table of their own.
 */
function fire_headless_enquiry_allowed(string $ip): bool
{
    $total_key = 'fire_enquiries_total';
    $total = (int) get_transient($total_key);
    if ($total >= 50) {
        return false;
    }

    $visitor_key = 'fire_enquiries_' . substr(hash_hmac('sha256', $ip !== '' ? $ip : 'unknown', wp_salt('nonce')), 0, 32);
    $count = (int) get_transient($visitor_key);
    if ($count >= 5) {
        return false;
    }
    set_transient($visitor_key, $count + 1, 10 * MINUTE_IN_SECONDS);

    set_transient($total_key, $total + 1, HOUR_IN_SECONDS);
    return true;
}

add_filter('manage_enquiry_posts_columns', function ($columns) {
    return ['cb' => $columns['cb'], 'title' => 'From', 'enquiry_emailed' => 'Emailed', 'date' => $columns['date']];
});
add_action('manage_enquiry_posts_custom_column', function ($column, $post_id) {
    if ($column === 'enquiry_emailed') {
        echo get_post_meta($post_id, 'enquiry_emailed', true) === 'yes' ? 'Yes' : 'No';
    }
}, 10, 2);

/**
 * Service page content as ordered sections for the front end: { type: "text" | "gallery", text, images }.
 * Built with WordPress's own block parser, so the site never has to pattern-match HTML.
 * Consecutive text blocks (paragraphs, headings, lists, quotes) form one text section,
 * one paragraph per "\n\n"; headings start with "## ", subheadings with "### " and list
 * items with "• ".
 * each gallery block, or run of single image blocks, forms one gallery section.
 * Groups and columns are flattened into their contents.
 */
const FIRE_HEADLESS_TEXT_BLOCKS = ['core/paragraph', 'core/heading', 'core/list', 'core/quote', 'core/pullquote', 'core/preformatted', 'core/verse'];

function fire_headless_block_text(array $block): string
{
    $html = wptexturize(render_block($block)); // curly quotes and dashes, as WordPress shows them
    $html = preg_replace('/<li[^>]*>/i', "\n\n• ", $html);
    $html = preg_replace('/<\/(p|h[1-6]|blockquote|pre|li)>|<br\s*\/?>/i', "\n\n", $html);
    $text = html_entity_decode(wp_strip_all_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace("/[ \t]+/", ' ', $text);
    $text = preg_replace("/ *\n */", "\n", $text);
    $text = trim(preg_replace("/\n{3,}/", "\n\n", $text));
    // Headings keep their role so the site can style them: "## " starts a heading line (H1–H3)
    // and "### " a subheading (H4–H6).
    if ($block['blockName'] === 'core/heading' && $text !== '') {
        $marker = ((int) ($block['attrs']['level'] ?? 2)) >= 4 ? '### ' : '## ';
        $text = $marker . str_replace("\n\n", ' ', $text);
    }
    return $text;
}

function fire_headless_block_image(array $block): ?array
{
    $id = (int) ($block['attrs']['id'] ?? 0);
    if ($id) {
        $src = wp_get_attachment_image_src($id, 'full');
        if ($src) {
            return [
                'url'    => $src[0],
                'width'  => (int) $src[1],
                'height' => (int) $src[2],
                'alt'    => (string) get_post_meta($id, '_wp_attachment_image_alt', true),
            ];
        }
    }
    // Images without a library ID (e.g. pasted URLs): read them from the markup.
    if (preg_match('/<img[^>]+src="([^"]+)"/i', $block['innerHTML'] ?? '', $m)) {
        return ['url' => $m[1], 'width' => 0, 'height' => 0, 'alt' => ''];
    }
    return null;
}

function fire_headless_flatten_blocks(array $blocks): array
{
    $flat = [];
    foreach ($blocks as $block) {
        $name = $block['blockName'];
        if (in_array($name, ['core/group', 'core/columns', 'core/column', 'core/cover'], true)) {
            array_push($flat, ...fire_headless_flatten_blocks($block['innerBlocks'] ?? []));
        } elseif ($name !== null || trim(wp_strip_all_tags($block['innerHTML'] ?? '')) !== '') {
            $flat[] = $block;
        }
    }
    return $flat;
}

function fire_headless_service_sections(string $content): array
{
    $sections = [];
    $append = function (string $type, $value) use (&$sections) {
        $last = count($sections) - 1;
        if ($last >= 0 && $sections[$last]['type'] === $type) {
            if ($type === 'text') {
                $sections[$last]['text'] .= "\n\n" . $value;
            } else {
                array_push($sections[$last]['images'], ...$value);
            }
            return;
        }
        $sections[] = $type === 'text'
            ? ['type' => 'text', 'text' => $value, 'images' => []]
            : ['type' => 'gallery', 'text' => null, 'images' => $value];
    };

    foreach (fire_headless_flatten_blocks(parse_blocks($content)) as $block) {
        $name = $block['blockName'];
        if ($name === 'core/gallery') {
            $images = array_values(array_filter(array_map('fire_headless_block_image', $block['innerBlocks'] ?? [])));
            if ($images) {
                // A gallery block always starts its own section, even right after another.
                $sections[] = ['type' => 'gallery', 'text' => null, 'images' => $images];
            }
        } elseif ($name === 'core/image') {
            $image = fire_headless_block_image($block);
            if ($image) $append('gallery', [$image]);
        } elseif ($name === null || in_array($name, FIRE_HEADLESS_TEXT_BLOCKS, true)) {
            $text = fire_headless_block_text($block);
            if ($text !== '') $append('text', $text);
        }
    }
    return $sections;
}

add_action('graphql_register_types', function () {
    register_graphql_object_type('ServiceSectionImage', [
        'description' => 'An image in a service page gallery section.',
        'fields'      => [
            'url'    => ['type' => 'String'],
            'width'  => ['type' => 'Int'],
            'height' => ['type' => 'Int'],
            'alt'    => ['type' => 'String'],
        ],
    ]);
    register_graphql_object_type('ServiceSection', [
        'description' => 'A text or gallery section of a service page, in page order.',
        'fields'      => [
            'type'   => ['type' => 'String', 'description' => '"text" or "gallery"'],
            'text'   => ['type' => 'String', 'description' => 'Plain text; paragraphs separated by blank lines, list items start with "• ".'],
            'images' => ['type' => ['list_of' => 'ServiceSectionImage']],
        ],
    ]);
    register_graphql_field('Service', 'sections', [
        'type'        => ['list_of' => 'ServiceSection'],
        'description' => 'The page content as ordered text and gallery sections.',
        'resolve'     => function ($service) {
            $post = get_post($service->databaseId);
            return $post ? fire_headless_service_sections($post->post_content) : [];
        },
    ]);
});
