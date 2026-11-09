<?php
/**
 * Posts and case studies as typed blocks for the front end (the `articleBlocks` GraphQL field):
 *
 *   paragraph { html }          heading { level, html }        list { ordered, items }
 *   quote { html, cite }        image / gallery { images }     embed { url, provider }
 *   audio / video { url, caption }
 *
 * Text keeps only inline markup (links, bold, italics, line breaks); the front end styles
 * everything else. Images are { url, width, height, alt, caption } (plus the attachment
 * `id` when writing). fire_headless_article_markup() turns the same arrays back into block
 * markup, which the post importer and the seed script use, so all three agree on one shape.
 */

if (!defined('ABSPATH')) {
    exit;
}

const FIRE_HEADLESS_INLINE_TAGS = [
    'a'      => ['href' => true, 'title' => true],
    'strong' => [],
    'b'      => [],
    'em'     => [],
    'i'      => [],
    'br'     => [],
    'sup'    => [],
    'sub'    => [],
    'code'   => [],
];

/** Inline HTML with only the allowed tags, whitespace collapsed. */
function fire_headless_inline(string $html): string
{
    $html = wp_kses(wptexturize($html), FIRE_HEADLESS_INLINE_TAGS);
    $html = preg_replace('/\s+/u', ' ', $html);
    $html = preg_replace('/(\s*<br\s*\/?>\s*)+$|^(\s*<br\s*\/?>\s*)+/i', '', trim($html));
    return trim($html);
}

/** True when inline HTML has visible text. */
function fire_headless_has_text(string $html): bool
{
    return trim(html_entity_decode(wp_strip_all_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'), " \t\n\r\0\x0B\xC2\xA0") !== '';
}

/** The inside of an element's outer tag: "<p class=x>Hi</p>" -> "Hi". */
function fire_headless_unwrap(string $html, string $tag): string
{
    return preg_replace(["#^\\s*<{$tag}\\b[^>]*>#i", "#</{$tag}>\\s*$#i"], '', trim($html));
}

/** An attachment as an article image, or null. */
function fire_headless_attachment_image(int $id, string $caption = ''): ?array
{
    $src = $id ? wp_get_attachment_image_src($id, 'full') : false;
    if (!$src) {
        return null;
    }
    return [
        'id'      => $id,
        'url'     => $src[0],
        'width'   => (int) $src[1],
        'height'  => (int) $src[2],
        'alt'     => (string) get_post_meta($id, '_wp_attachment_image_alt', true),
        'caption' => $caption,
    ];
}

/** Images found in markup by URL: the library's copy if it has one, otherwise the URL as given. */
function fire_headless_image_from_url(string $url, int $width = 0, int $height = 0, string $alt = '', string $caption = ''): array
{
    $id = attachment_url_to_postid(preg_replace('/-\d+x\d+(?=\.\w+$)/', '', $url)) ?: attachment_url_to_postid($url);
    return fire_headless_attachment_image($id, $caption)
        ?? ['url' => $url, 'width' => $width, 'height' => $height, 'alt' => $alt, 'caption' => $caption];
}

function fire_headless_figcaption(string $html): string
{
    return preg_match('#<figcaption[^>]*>(.*?)</figcaption>#is', $html, $m) ? fire_headless_inline($m[1]) : '';
}

/** An embed URL (iframe src) as the page URL WordPress's embed block expects. */
function fire_headless_embed_url(string $src): ?array
{
    if (preg_match('#(?:youtube(?:-nocookie)?\.com/(?:embed/|watch\?v=)|youtu\.be/)([\w-]{11})#', $src, $m)) {
        return ['url' => "https://www.youtube.com/watch?v={$m[1]}", 'provider' => 'youtube'];
    }
    if (preg_match('#vimeo\.com/(?:video/)?(\d+)#', $src, $m)) {
        return ['url' => "https://vimeo.com/{$m[1]}", 'provider' => 'vimeo'];
    }
    return null;
}

/** Media file URL without WordPress's cache-busting "?_=1". */
function fire_headless_media_url(string $url): string
{
    return preg_replace('/\?_=\d+$/', '', html_entity_decode($url));
}

/**
 * Block content -> article blocks. Groups, columns and covers are flattened; classic
 * content and Custom HTML blocks go through the HTML converter below.
 */
function fire_headless_article_blocks(string $content): array
{
    $out = [];
    foreach (fire_headless_flatten_blocks(parse_blocks($content)) as $block) {
        $name = $block['blockName'];
        $attrs = $block['attrs'] ?? [];
        $html = $block['innerHTML'] ?? '';

        switch ($name) {
            case 'core/paragraph':
                $text = fire_headless_inline(fire_headless_unwrap($html, 'p'));
                if (fire_headless_has_text($text)) $out[] = ['type' => 'paragraph', 'html' => $text];
                break;

            case 'core/heading':
                $level = max(2, min(6, (int) ($attrs['level'] ?? 2)));
                $text = fire_headless_inline(fire_headless_unwrap($html, "h$level"));
                if (fire_headless_has_text($text)) $out[] = ['type' => 'heading', 'level' => $level, 'html' => $text];
                break;

            case 'core/list':
                $rendered = render_block($block);
                preg_match_all('#<li[^>]*>(.*?)</li>#is', $rendered, $m);
                $items = array_values(array_filter(array_map('fire_headless_inline', $m[1]), 'fire_headless_has_text'));
                if ($items) $out[] = ['type' => 'list', 'ordered' => !empty($attrs['ordered']), 'items' => $items];
                break;

            case 'core/quote':
            case 'core/pullquote':
                $rendered = render_block($block);
                $cite = preg_match('#<cite[^>]*>(.*?)</cite>#is', $rendered, $m) ? fire_headless_inline($m[1]) : '';
                $body = preg_replace('#<cite[^>]*>.*?</cite>#is', '', $rendered);
                $body = preg_replace('#</p>\s*<p[^>]*>#i', '<br><br>', $body);
                $text = fire_headless_inline($body);
                if (fire_headless_has_text($text)) $out[] = ['type' => 'quote', 'html' => $text, 'cite' => $cite];
                break;

            case 'core/image':
                $caption = fire_headless_figcaption($html);
                $image = !empty($attrs['id']) ? fire_headless_attachment_image((int) $attrs['id'], $caption) : null;
                if (!$image && preg_match('/<img[^>]+src="([^"]+)"/i', $html, $m)) {
                    $image = fire_headless_image_from_url($m[1], 0, 0, '', $caption);
                }
                if ($image) $out[] = ['type' => 'image', 'images' => [$image]];
                break;

            case 'core/gallery':
                $images = [];
                foreach ($block['innerBlocks'] ?? [] as $inner) {
                    $image = fire_headless_attachment_image((int) ($inner['attrs']['id'] ?? 0), fire_headless_figcaption($inner['innerHTML'] ?? ''));
                    if ($image) $images[] = $image;
                }
                foreach ($attrs['ids'] ?? [] as $id) { // galleries saved before WordPress 5.9
                    $image = fire_headless_attachment_image((int) $id);
                    if ($image) $images[] = $image;
                }
                if ($images) $out[] = ['type' => 'gallery', 'images' => $images];
                break;

            case 'core/embed':
            case 'core-embed/youtube':
            case 'core-embed/vimeo':
                $embed = fire_headless_embed_url((string) ($attrs['url'] ?? ''));
                if ($embed) $out[] = ['type' => 'embed'] + $embed;
                break;

            case 'core/audio':
            case 'core/video':
                $tag = $name === 'core/audio' ? 'audio' : 'video';
                $url = !empty($attrs['id']) ? wp_get_attachment_url((int) $attrs['id']) : '';
                if (!$url && preg_match("#<$tag\\b[^>]*\\bsrc=\"([^\"]+)\"#i", $html, $m)) $url = $m[1];
                if ($url) $out[] = ['type' => $tag, 'url' => fire_headless_media_url($url), 'caption' => fire_headless_figcaption($html)];
                break;

            case null:
            case 'core/freeform':
            case 'core/html':
                array_push($out, ...fire_headless_html_blocks(render_block($block), function (DOMElement $img) {
                    return fire_headless_image_from_url(
                        fire_headless_img_src($img),
                        (int) $img->getAttribute('width'),
                        (int) $img->getAttribute('height'),
                        $img->getAttribute('alt')
                    );
                }));
                break;
        }
    }
    return $out;
}

/**
 * Consecutive images become one gallery; a lone image stays an image. Only used for
 * converted HTML, where a run of images is a gallery that lost its markup.
 */
function fire_headless_merge_images(array $blocks): array
{
    $out = [];
    foreach ($blocks as $block) {
        $last = count($out) - 1;
        $isImage = in_array($block['type'], ['image', 'gallery'], true);
        if ($isImage && $last >= 0 && in_array($out[$last]['type'], ['image', 'gallery'], true)) {
            $out[$last]['type'] = 'gallery';
            array_push($out[$last]['images'], ...$block['images']);
        } else {
            $out[] = $block;
        }
    }
    return $out;
}

/** The best source for an <img>: its full-size link, the largest srcset entry, then src. */
function fire_headless_img_src(DOMElement $img): string
{
    $parent = $img->parentNode;
    if ($parent instanceof DOMElement && strtolower($parent->nodeName) === 'a'
        && preg_match('/\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i', $parent->getAttribute('href'))) {
        return $parent->getAttribute('href');
    }
    $srcset = $img->getAttribute('srcset') ?: $img->getAttribute('data-srcset');
    if ($srcset) {
        $best = ['', 0];
        foreach (explode(',', $srcset) as $candidate) {
            $parts = preg_split('/\s+/', trim($candidate));
            $w = (int) ($parts[1] ?? 0);
            if ($parts[0] && $w >= $best[1]) $best = [$parts[0], $w];
        }
        if ($best[0]) return $best[0];
    }
    return $img->getAttribute('data-src') ?: $img->getAttribute('data-lazy-src') ?: $img->getAttribute('src');
}

/**
 * Any HTML (classic content, page-builder output) -> article blocks. $image receives each
 * <img> element and returns an article image or null.
 */
function fire_headless_html_blocks(string $html, callable $image): array
{
    if (trim($html) === '') {
        return [];
    }
    $doc = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8"?><div id="fire-root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    $root = (new DOMXPath($doc))->query('//div[@id="fire-root"]')->item(0);
    if (!$root) {
        return [];
    }
    $blocks = [];
    fire_headless_html_walk($root, $image, $blocks);
    return fire_headless_merge_images($blocks);
}

const FIRE_HEADLESS_SKIP_TAGS = ['script', 'style', 'nav', 'meta', 'link', 'button', 'svg', 'form', 'noscript', 'input', 'select', 'textarea', 'template', 'source', 'hr'];
const FIRE_HEADLESS_BLOCK_TAGS = ['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'figure', 'blockquote', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'iframe', 'video', 'audio', 'table', 'center'];

function fire_headless_has_block_child(DOMNode $node): bool
{
    foreach ((new DOMXPath($node->ownerDocument))->query('.//*', $node) as $el) {
        if (in_array(strtolower($el->nodeName), FIRE_HEADLESS_BLOCK_TAGS, true)) return true;
    }
    return false;
}

function fire_headless_inner_html(DOMNode $node): string
{
    $html = '';
    foreach ($node->childNodes as $child) {
        $html .= $node->ownerDocument->saveHTML($child);
    }
    return $html;
}

/** Images (and their caption) inside an element, as image blocks. */
function fire_headless_html_images(DOMElement $el, callable $image, string $caption = ''): array
{
    $blocks = [];
    foreach ($el->getElementsByTagName('img') as $img) {
        $item = $image($img);
        if ($item) {
            $item['caption'] = $caption ?: ($item['caption'] ?? '');
            $blocks[] = ['type' => 'image', 'images' => [$item]];
            $caption = ''; // one caption per figure
        }
    }
    return $blocks;
}

function fire_headless_html_walk(DOMNode $node, callable $image, array &$blocks): void
{
    $inline = '';
    $flush = function () use (&$inline, &$blocks) {
        $html = fire_headless_inline($inline);
        if (fire_headless_has_text($html)) $blocks[] = ['type' => 'paragraph', 'html' => $html];
        $inline = '';
    };

    foreach (iterator_to_array($node->childNodes) as $child) {
        if ($child instanceof DOMText) {
            $inline .= $node->ownerDocument->saveHTML($child);
            continue;
        }
        if (!$child instanceof DOMElement) {
            continue;
        }
        $tag = strtolower($child->nodeName);
        $class = ' ' . $child->getAttribute('class') . ' ';

        if (in_array($tag, FIRE_HEADLESS_SKIP_TAGS, true)) {
            $flush();
            continue;
        }
        if ($tag === 'br') {
            $inline .= '<br>';
            continue;
        }
        // Inline content (links, bold, spans) joins the running paragraph.
        if (!in_array($tag, FIRE_HEADLESS_BLOCK_TAGS, true) && !fire_headless_has_block_child($child)) {
            $inline .= $node->ownerDocument->saveHTML($child);
            continue;
        }
        if ($tag === 'a' && $child->getElementsByTagName('img')->length) {
            $flush();
            array_push($blocks, ...fire_headless_html_images($child, $image));
            continue;
        }
        $flush();

        if (preg_match('/^h([1-6])$/', $tag, $m)) {
            $text = fire_headless_inline(fire_headless_inner_html($child));
            if (fire_headless_has_text($text)) $blocks[] = ['type' => 'heading', 'level' => max(2, (int) $m[1]), 'html' => $text];
        } elseif ($tag === 'p' && !fire_headless_has_block_child($child)) {
            $text = fire_headless_inline(fire_headless_inner_html($child));
            if (fire_headless_has_text($text)) $blocks[] = ['type' => 'paragraph', 'html' => $text];
        } elseif ($tag === 'ul' || $tag === 'ol') {
            $items = [];
            foreach ($child->childNodes as $li) {
                if ($li instanceof DOMElement && strtolower($li->nodeName) === 'li') {
                    $text = fire_headless_inline(fire_headless_inner_html($li));
                    if (fire_headless_has_text($text)) $items[] = $text;
                }
            }
            if ($items) $blocks[] = ['type' => 'list', 'ordered' => $tag === 'ol', 'items' => $items];
        } elseif ($tag === 'blockquote') {
            $cite = '';
            foreach (['cite', 'footer'] as $citeTag) {
                foreach (iterator_to_array($child->getElementsByTagName($citeTag)) as $el) {
                    $cite = $cite ?: fire_headless_inline(fire_headless_inner_html($el));
                    $el->parentNode->removeChild($el);
                }
            }
            $body = preg_replace('#</p>\s*<p[^>]*>#i', '<br><br>', fire_headless_inner_html($child));
            $text = fire_headless_inline($body);
            if (fire_headless_has_text($text)) $blocks[] = ['type' => 'quote', 'html' => $text, 'cite' => $cite];
        } elseif ($tag === 'img') {
            $item = $image($child);
            if ($item) $blocks[] = ['type' => 'image', 'images' => [$item + ['caption' => '']]];
        } elseif ($tag === 'iframe') {
            $embed = fire_headless_embed_url($child->getAttribute('src') ?: $child->getAttribute('data-src'));
            if ($embed) $blocks[] = ['type' => 'embed'] + $embed;
        } elseif ($tag === 'video' || $tag === 'audio') {
            $src = $child->getAttribute('src');
            foreach ($child->getElementsByTagName('source') as $source) $src = $src ?: $source->getAttribute('src');
            if ($src) $blocks[] = ['type' => $tag, 'url' => fire_headless_media_url($src), 'caption' => ''];
        } elseif (($tag === 'figure' || strpos($class, ' wp-caption ') !== false) && $child->getElementsByTagName('img')->length) {
            $caption = '';
            foreach ((new DOMXPath($child->ownerDocument))->query('.//figcaption | .//*[contains(@class, "caption-text")]', $child) as $el) {
                $caption = fire_headless_inline(fire_headless_inner_html($el));
            }
            array_push($blocks, ...fire_headless_html_images($child, $image, $caption));
        } else {
            fire_headless_html_walk($child, $image, $blocks);
        }
    }
    $flush();
}

function fire_headless_image_markup(array $image): string
{
    $id = (int) ($image['id'] ?? 0);
    $caption = ($image['caption'] ?? '') !== '' ? '<figcaption class="wp-element-caption">' . fire_headless_inline($image['caption']) . '</figcaption>' : '';
    $html = sprintf(
        '<figure class="wp-block-image size-full"><img src="%s" alt="%s"%s/>%s</figure>',
        esc_url($image['url']),
        esc_attr($image['alt'] ?? ''),
        $id ? " class=\"wp-image-$id\"" : '',
        $caption
    );
    $attrs = ($id ? ['id' => $id] : []) + ['sizeSlug' => 'full', 'linkDestination' => 'none'];
    return '<!-- wp:image ' . serialize_block_attributes($attrs) . " -->\n$html\n<!-- /wp:image -->";
}

/** Article blocks -> block markup for post_content. Text is cleaned again here, whoever wrote it. */
function fire_headless_article_markup(array $blocks): string
{
    $parts = [];
    foreach ($blocks as &$block) {
        foreach (['html', 'cite', 'caption'] as $field) {
            if (isset($block[$field])) $block[$field] = fire_headless_inline((string) $block[$field]);
        }
        if (isset($block['items'])) $block['items'] = array_map(fn($item) => fire_headless_inline((string) $item), $block['items']);
    }
    unset($block);
    $comment = fn(string $name, array $attrs = []) => "<!-- wp:$name" . ($attrs ? ' ' . serialize_block_attributes($attrs) : '');
    foreach ($blocks as $block) {
        switch ($block['type']) {
            case 'paragraph':
                $parts[] = $comment('paragraph') . " -->\n<p>{$block['html']}</p>\n<!-- /wp:paragraph -->";
                break;
            case 'heading':
                $level = (int) $block['level'];
                $parts[] = $comment('heading', $level === 2 ? [] : ['level' => $level]) . " -->\n<h$level class=\"wp-block-heading\">{$block['html']}</h$level>\n<!-- /wp:heading -->";
                break;
            case 'list':
                $tag = !empty($block['ordered']) ? 'ol' : 'ul';
                $items = implode("\n\n", array_map(fn($item) => "<!-- wp:list-item -->\n<li>$item</li>\n<!-- /wp:list-item -->", $block['items']));
                $parts[] = $comment('list', $tag === 'ol' ? ['ordered' => true] : []) . " -->\n<$tag class=\"wp-block-list\">$items</$tag>\n<!-- /wp:list -->";
                break;
            case 'quote':
                $paragraphs = implode("\n\n", array_map(
                    fn($p) => "<!-- wp:paragraph -->\n<p>$p</p>\n<!-- /wp:paragraph -->",
                    preg_split('#<br\s*/?>\s*<br\s*/?>#i', $block['html'])
                ));
                $cite = ($block['cite'] ?? '') !== '' ? "<cite>{$block['cite']}</cite>" : '';
                $parts[] = $comment('quote') . " -->\n<blockquote class=\"wp-block-quote\">$paragraphs$cite</blockquote>\n<!-- /wp:quote -->";
                break;
            case 'image':
                $parts[] = fire_headless_image_markup($block['images'][0]);
                break;
            case 'gallery':
                $images = implode("\n\n", array_map('fire_headless_image_markup', $block['images']));
                $parts[] = $comment('gallery', ['linkTo' => 'none']) . " -->\n<figure class=\"wp-block-gallery has-nested-images columns-default is-cropped\">$images</figure>\n<!-- /wp:gallery -->";
                break;
            case 'embed':
                $provider = $block['provider'] ?? 'youtube';
                $attrs = ['url' => $block['url'], 'type' => 'video', 'providerNameSlug' => $provider, 'responsive' => true, 'className' => 'wp-embed-aspect-16-9 wp-has-aspect-ratio'];
                $parts[] = $comment('embed', $attrs) . " -->\n<figure class=\"wp-block-embed is-type-video is-provider-$provider wp-block-embed-$provider wp-embed-aspect-16-9 wp-has-aspect-ratio\"><div class=\"wp-block-embed__wrapper\">\n" . esc_url($block['url']) . "\n</div></figure>\n<!-- /wp:embed -->";
                break;
            case 'audio':
            case 'video':
                $tag = $block['type'];
                $caption = ($block['caption'] ?? '') !== '' ? "<figcaption class=\"wp-element-caption\">{$block['caption']}</figcaption>" : '';
                $parts[] = $comment($tag) . " -->\n<figure class=\"wp-block-$tag\"><$tag controls src=\"" . esc_url($block['url']) . "\"></$tag>$caption</figure>\n<!-- /wp:$tag -->";
                break;
        }
    }
    return implode("\n\n", $parts);
}

add_action('graphql_register_types', function () {
    register_graphql_object_type('ArticleImage', [
        'description' => 'An image in a post or case study.',
        'fields'      => [
            'url'     => ['type' => 'String'],
            'width'   => ['type' => 'Int'],
            'height'  => ['type' => 'Int'],
            'alt'     => ['type' => 'String'],
            'caption' => ['type' => 'String', 'description' => 'Inline HTML.'],
        ],
    ]);
    register_graphql_object_type('ArticleBlock', [
        'description' => 'One block of a post or case study, in order.',
        'fields'      => [
            'type'     => ['type' => 'String', 'description' => 'paragraph, heading, list, quote, image, gallery, embed, audio or video'],
            'level'    => ['type' => 'Int', 'description' => 'Heading level, 2-6.'],
            'html'     => ['type' => 'String', 'description' => 'Inline HTML: links, bold, italics and line breaks only.'],
            'ordered'  => ['type' => 'Boolean'],
            'items'    => ['type' => ['list_of' => 'String'], 'description' => 'List items, inline HTML.'],
            'cite'     => ['type' => 'String'],
            'url'      => ['type' => 'String', 'description' => 'Embed page URL, or the audio/video file.'],
            'provider' => ['type' => 'String', 'description' => 'Embed provider, e.g. youtube.'],
            'caption'  => ['type' => 'String'],
            'images'   => ['type' => ['list_of' => 'ArticleImage']],
        ],
    ]);
    foreach (['Post', 'CaseStudy'] as $type) {
        register_graphql_field($type, 'articleBlocks', [
            'type'        => ['list_of' => 'ArticleBlock'],
            'description' => 'The content as typed blocks, in order.',
            'resolve'     => function ($post) {
                $wp_post = get_post($post->databaseId);
                return $wp_post ? fire_headless_article_blocks($wp_post->post_content) : [];
            },
        ]);
    }
});
