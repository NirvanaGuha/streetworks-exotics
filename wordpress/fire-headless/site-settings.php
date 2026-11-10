<?php
/**
 * Site Settings: every site-wide colour, font, label, heading and image the front end
 * uses, on one screen (WordPress admin → Site Settings), one tab per area.
 *
 * Free ACF has no options pages, so the settings live on a single hidden post of the
 * `site_settings` type, created on first use. The fields come from site-settings.json,
 * which the Astro site also reads (src/lib/site.ts) to fetch and apply them, so the
 * two can't drift apart. Empty fields keep the site's built-in value.
 */

if (!defined('ABSPATH')) {
    exit;
}

/** The field list shared with the front end. */
function fire_headless_settings_schema(): array
{
    static $schema = null;
    if ($schema === null) {
        $json = file_get_contents(__DIR__ . '/site-settings.json');
        $schema = $json ? json_decode($json, true) : null;
        $schema = is_array($schema) ? $schema : ['sections' => []];
    }
    return $schema;
}

/** "content.labels.readStory" → "contentLabelsReadStory" (the GraphQL name; src/lib/site.ts matches). */
function fire_headless_settings_graphql_name(string $path): string
{
    $parts = explode('.', $path);
    $name = array_shift($parts);
    foreach ($parts as $part) {
        $name .= ucfirst($part);
    }
    return $name;
}

/** "content.labels.readStory" → "content_labels_readstory" (the meta key). */
function fire_headless_settings_field_name(string $path): string
{
    return strtolower(str_replace('.', '_', $path));
}

/** The one Site Settings post, created when first needed. */
function fire_headless_settings_post_id(): int
{
    $ids = get_posts(['post_type' => 'site_settings', 'post_status' => 'publish', 'numberposts' => 1, 'fields' => 'ids', 'orderby' => 'ID', 'order' => 'ASC']);
    if ($ids) {
        return (int) $ids[0];
    }
    $id = wp_insert_post(['post_type' => 'site_settings', 'post_status' => 'publish', 'post_title' => 'Site Settings'], true);
    return is_wp_error($id) ? 0 : (int) $id;
}

add_action('init', function () {
    register_post_type('site_settings', [
        'label'               => 'Site Settings',
        'labels'              => ['singular_name' => 'Site Settings', 'edit_item' => 'Site Settings'],
        // Public so WPGraphQL serves it to the build without a login (everything in it is shown
        // on the site anyway); it has no front-end address and stays out of menus and search.
        'public'              => true,
        'publicly_queryable'  => false,
        'exclude_from_search' => true,
        'show_in_nav_menus'   => false,
        'show_in_menu'        => false,
        'show_in_rest'        => false,
        'show_in_graphql'     => true,
        'graphql_single_name' => 'SiteSetting',
        'graphql_plural_name' => 'SiteSettings',
        'supports'            => ['title'],
        'capability_type'     => 'page',
        // There is only ever one; it's created automatically.
        'capabilities'        => ['create_posts' => 'do_not_allow'],
        'map_meta_cap'        => true,
    ]);
});

// "Site Settings" in the admin menu opens the settings post directly.
add_action('admin_menu', function () {
    add_menu_page('Site Settings', 'Site Settings', 'edit_pages', 'fire-site-settings', function () {}, 'dashicons-admin-appearance', 3);
});
add_action('admin_init', function () {
    if (($_GET['page'] ?? '') === 'fire-site-settings' && current_user_can('edit_pages')) {
        $id = fire_headless_settings_post_id();
        wp_safe_redirect($id ? admin_url("post.php?post={$id}&action=edit") : admin_url());
        exit;
    }
});
// The settings post can't be trashed or deleted, so the site never loses its settings.
add_filter('map_meta_cap', function ($caps, $cap, $user_id, $args) {
    if (in_array($cap, ['delete_post', 'delete_page'], true) && !empty($args[0]) && get_post_type($args[0]) === 'site_settings') {
        return ['do_not_allow'];
    }
    return $caps;
}, 10, 4);

add_action('acf/init', function () {
    if (!function_exists('acf_add_local_field_group')) {
        return;
    }

    $fields = [];
    foreach (fire_headless_settings_schema()['sections'] as $section) {
        $fields[] = [
            'key'       => 'field_fs_tab_' . $section['key'],
            'label'     => $section['title'],
            'name'      => '',
            'type'      => 'tab',
            'placement' => 'left',
        ];
        foreach ($section['fields'] as $field) {
            $name = fire_headless_settings_field_name($field['path']);
            $config = [
                'key'                => 'field_fs_' . $name,
                'name'               => $name,
                'label'              => $field['label'],
                'instructions'       => ($field['help'] ?? '') . (isset($field['help']) ? ' ' : '') . 'Leave empty to keep the site’s built-in text.',
                'show_in_graphql'    => 1,
                'graphql_field_name' => fire_headless_settings_graphql_name($field['path']),
            ];
            switch ($field['type']) {
                case 'color':
                    $config += ['type' => 'color_picker', 'enable_opacity' => 0, 'return_format' => 'string'];
                    $config['instructions'] = $field['help'] ?? '';
                    break;
                case 'image':
                    $config += ['type' => 'image', 'return_format' => 'array', 'preview_size' => 'medium'];
                    $config['instructions'] = ($field['help'] ?? '') . (isset($field['help']) ? ' ' : '') . 'Leave empty to keep the built-in image.';
                    break;
                case 'font':
                case 'select':
                    $config += ['type' => 'select', 'choices' => array_combine($field['choices'], $field['choices']), 'allow_null' => 1, 'ui' => 0, 'return_format' => 'value'];
                    $config['instructions'] = $field['help'] ?? '';
                    break;
                case 'number':
                    $config += ['type' => 'number', 'min' => $field['min'] ?? '', 'max' => $field['max'] ?? ''];
                    $config['instructions'] = $field['help'] ?? '';
                    break;
                case 'textarea':
                    $config += ['type' => 'textarea', 'rows' => 3, 'new_lines' => ''];
                    break;
                default:
                    $config += ['type' => 'text'];
            }
            $fields[] = $config;
        }
    }

    acf_add_local_field_group([
        'key'                                   => 'group_site_settings',
        'title'                                 => 'Site Settings',
        'location'                              => [[['param' => 'post_type', 'operator' => '==', 'value' => 'site_settings']]],
        'position'                              => 'acf_after_title',
        'style'                                 => 'seamless',
        'fields'                                => $fields,
        'show_in_graphql'                       => 1,
        'graphql_field_name'                    => 'siteFields', // "settings" would clash with WPGraphQL's own Settings type
        'map_graphql_types_from_location_rules' => 1,
        'graphql_types'                         => '',
    ]);
});
