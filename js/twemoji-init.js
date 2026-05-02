/**
 * Twemoji bootstrap — replaces native emoji glyphs with inline SVGs from
 * jsdelivr's twemoji asset CDN, so emojis look identical on iPhone, Android,
 * and desktop instead of falling back to Apple Color Emoji on iOS.
 *
 * Loads the Twemoji parser (~10KB gzipped), parses the document on first
 * paint, and uses a MutationObserver to handle dynamically inserted nodes.
 */
(function () {
    if (window.__twemojiBootstrapped) return;
    window.__twemojiBootstrapped = true;

    var TWEMOJI_LIB = 'https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/twemoji.min.js';
    var ASSET_BASE  = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/';

    var PARSE_OPTIONS = {
        folder: 'svg',
        ext: '.svg',
        base: ASSET_BASE,
        className: 'twemoji'
    };

    // Inline rule so the inserted <img> elements behave like a glyph.
    var style = document.createElement('style');
    style.textContent =
        'img.twemoji,img.emoji{height:1em;width:1em;margin:0 .05em 0 .1em;' +
        'vertical-align:-0.1em;display:inline-block}';
    document.head.appendChild(style);

    function parse(node) {
        if (window.twemoji && node) {
            try { window.twemoji.parse(node, PARSE_OPTIONS); } catch (e) { /* ignore */ }
        }
    }

    function startObserver() {
        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var n = added[j];
                    if (n.nodeType === 1) parse(n);
                    else if (n.nodeType === 3 && n.parentNode) parse(n.parentNode);
                }
                if (mutations[i].type === 'characterData' && mutations[i].target.parentNode) {
                    parse(mutations[i].target.parentNode);
                }
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function init() {
        parse(document.body);
        startObserver();
    }

    var script = document.createElement('script');
    script.src = TWEMOJI_LIB;
    script.async = false;
    script.onload = function () {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    };
    script.onerror = function () {
        // Library failed to load — leave native emoji glyphs in place.
    };
    document.head.appendChild(script);
})();
