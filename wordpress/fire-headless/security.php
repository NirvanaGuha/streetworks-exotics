<?php
/**
 * Hardening for a WordPress that only serves content to the Astro front end.
 * Nothing here changes what editors can do in the admin; it closes the public doors a
 * headless install doesn't need: account names, XML-RPC and heavyweight GraphQL queries.
 */

if (!defined('ABSPATH')) {
    exit;
}

// XML-RPC (old remote publishing) is a common route for password guessing. Nothing here uses
// it, so requests to xmlrpc.php are refused outright, and the methods removed as a backstop.
if (defined('XMLRPC_REQUEST') && XMLRPC_REQUEST) {
    status_header(403);
    exit;
}
add_filter('xmlrpc_enabled', '__return_false');
add_filter('xmlrpc_methods', '__return_empty_array');
add_filter('wp_headers', function ($headers) {
    unset($headers['X-Pingback']);
    return $headers;
});

// Account names stay private to logged-in users: no public user list in REST or GraphQL,
// and no ?author=N lookups that reveal login names through the author archive address.
add_filter('rest_endpoints', function ($endpoints) {
    if (!is_user_logged_in()) {
        foreach (array_keys($endpoints) as $route) {
            if (strpos($route, '/wp/v2/users') === 0) {
                unset($endpoints[$route]);
            }
        }
    }
    return $endpoints;
});
add_filter('graphql_data_is_private', function ($is_private, $model_name) {
    return $model_name === 'UserObject' && !is_user_logged_in() ? true : $is_private;
}, 10, 2);
// Priority 1, ahead of WordPress's own redirect from ?author=N to the author's address.
add_action('template_redirect', function () {
    if (!is_user_logged_in() && (is_author() || isset($_GET['author']))) {
        wp_safe_redirect(home_url('/'), 301);
        exit;
    }
}, 1);
remove_action('wp_head', 'wp_generator');

// GraphQL: public queries are limited in depth so one request can't make the server
// resolve an endless chain of nested lookups. The site's own queries nest at most 7 deep.
// Introspection (browsing the whole schema) stays off for the public, WPGraphQL's default.
add_filter('graphql_get_setting_section_field_value', function ($value, $default, $option_name, $section_fields, $section_name) {
    if ($section_name !== 'graphql_general_settings') {
        return $value;
    }
    switch ($option_name) {
        case 'query_depth_enabled':
            return 'on';
        case 'query_depth_max':
            return 12;
        case 'public_introspection_enabled':
            return 'off';
    }
    return $value;
}, 10, 5);
