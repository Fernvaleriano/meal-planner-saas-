// coach-i18n.js — Thai language option for the COACH-facing pages.
//
// WHY THIS DESIGN (read before changing):
//  - The coach dashboard is 20+ large standalone HTML pages with no build
//    step and no translation framework. Hand-tagging every string with
//    data-i18n across ~17k-line files would be enormous and risky. Instead
//    this is a self-contained DOM translation layer: it swaps English text
//    for Thai using a dictionary (English phrase -> Thai phrase), and a
//    MutationObserver keeps translating content the pages render later with JS.
//
//  - SAFETY / "first do no harm": this file touches ZERO page internals. When
//    the language is English (the default) it does nothing at all — pure
//    passthrough, no walking, no observer. A phrase with no dictionary entry
//    is left in English, so a partial dictionary can never blank the UI.
//    Removing this file (and its loader line in coach-layout.js) restores the
//    pages exactly as they were.
//
//  - The dictionary lives in js/coach-i18n-dict.js (window.COACH_I18N.th) so
//    the translation content can grow independently of this engine.
//
//  - Language choice is remembered per device in localStorage under
//    'zique-coach-language'. It is deliberately SEPARATE from the client app's
//    'zique-language' key so switching the coach dashboard never disturbs the
//    already-shipped client-app language, and vice-versa.
(function () {
  'use strict';

  var STORAGE_KEY = 'zique-coach-language';
  var SUPPORTED = { en: 'English', th: 'ไทย' };

  function getLang() {
    try {
      var l = localStorage.getItem(STORAGE_KEY);
      if (l && SUPPORTED[l]) return l;
    } catch (e) { /* ignore */ }
    return 'en';
  }
  function setLang(l) {
    try { localStorage.setItem(STORAGE_KEY, l); } catch (e) { /* ignore */ }
  }

  // Dictionary is filled in by coach-i18n-dict.js (loaded alongside this file).
  function dict() {
    return (window.COACH_I18N && window.COACH_I18N.th) || null;
  }

  // Curated patterns for phrases with numbers baked in (e.g. "5 clients",
  // "Day 3 of 30"). Keys use '#' where a number sits; the Thai value reuses '#'
  // in the order the numbers appear. Only these hand-listed phrases are ever
  // matched, so this can't accidentally mangle arbitrary text. Filled by
  // coach-i18n-dict.js (window.COACH_I18N.thPatterns).
  function patterns() {
    return (window.COACH_I18N && window.COACH_I18N.thPatterns) || null;
  }

  // Look up a raw string. Leading/trailing whitespace is preserved and internal
  // runs of whitespace are collapsed to a single space for the lookup key, so
  // markup wrapping doesn't defeat a match.
  function translateText(raw) {
    var d = dict();
    if (!d || !raw) return null;
    var m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    var lead = m[1], core = m[2], trail = m[3];
    if (!core) return null;
    var key = core.replace(/\s+/g, ' ');

    // 1) Exact match (covers ~all static UI). Keys containing numbers are
    //    matched here first, so they never fall through to the pattern layer.
    var val = d[key];
    if (val != null) return lead + val + trail;

    // 2) Number-tolerant match: replace each number run with '#' and look the
    //    normalized phrase up in the curated pattern table, then put the actual
    //    numbers back in order.
    var pats = patterns();
    if (pats) {
      var nums = [];
      var norm = key.replace(/\d[\d,]*(?:\.\d+)?/g, function (mm) { nums.push(mm); return '#'; });
      if (nums.length) {
        var pv = pats[norm];
        if (pv != null) {
          var i = 0;
          var out = pv.replace(/#/g, function () { return i < nums.length ? nums[i++] : '#'; });
          return lead + out + trail;
        }
      }
    }
    return null;
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, OPTION: 0 };

  function inSkipped(node) {
    var p = node.nodeType === 3 ? node.parentNode : node;
    if (!p) return false;
    if (p.nodeType === 1 && SKIP_TAGS[p.tagName]) return true;
    // Respect an explicit opt-out on any ancestor (e.g. user-generated data).
    if (p.closest && p.closest('[data-no-i18n]')) return true;
    return false;
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3 || inSkipped(node)) return;
    var out = translateText(node.nodeValue);
    if (out != null && out !== node.nodeValue) node.nodeValue = out;
  }

  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function translateAttrs(el) {
    if (!el || el.nodeType !== 1 || !el.getAttribute) return;
    if (el.closest && el.closest('[data-no-i18n]')) return;
    for (var i = 0; i < ATTRS.length; i++) {
      if (el.hasAttribute(ATTRS[i])) {
        var out = translateText(el.getAttribute(ATTRS[i]));
        if (out != null) el.setAttribute(ATTRS[i], out);
      }
    }
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) {
      var o = translateText(el.value);
      if (o != null) el.value = o;
    }
  }

  // Translate a whole subtree: its own attributes, every descendant text node,
  // and every descendant's translatable attributes.
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { translateTextNode(root); return; }
    if (root.nodeType !== 1 || (SKIP_TAGS[root.tagName] && root.tagName !== 'OPTION')) return;
    translateAttrs(root);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (p && p.nodeType === 1 && SKIP_TAGS[p.tagName]) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var batch = [], n;
    while ((n = tw.nextNode())) batch.push(n);
    for (var i = 0; i < batch.length; i++) translateTextNode(batch[i]);
    if (root.querySelectorAll) {
      var els = root.querySelectorAll('[placeholder],[title],[aria-label],[alt],input[type=button],input[type=submit]');
      for (var j = 0; j < els.length; j++) translateAttrs(els[j]);
    }
  }

  var observer = null;
  function startObserver() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver(function (muts) {
      // Idempotent by construction: once a node holds Thai it no longer matches
      // an English key, so re-processing our own edits is a cheap no-op — no
      // guard flag or infinite loop.
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var an = m.addedNodes[j];
            if (an.nodeType === 1) walk(an);
            else if (an.nodeType === 3) translateTextNode(an);
          }
        } else if (m.type === 'characterData') {
          translateTextNode(m.target);
        } else if (m.type === 'attributes') {
          translateAttrs(m.target);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }

  function translateAll() {
    if (document.body) walk(document.body);
    var t = translateText(document.title);
    if (t != null) document.title = t;
  }

  var applied = false;
  function apply() {
    if (applied) return;
    if (getLang() !== 'th') return;   // English default: do nothing.
    if (!dict()) return;              // Dictionary not loaded yet; caller retries.
    applied = true;
    translateAll();
    startObserver();
  }

  // ── Language switch UI ──────────────────────────────────────────────────
  // A native-looking nav item at the top of the sidebar's "Settings" section
  // (falls back to any nav list, then the sidebar header). Icon-only when the
  // sidebar is collapsed, exactly like the other nav items.
  function globeIcon() {
    return '<span class="sidebar-nav-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg></span>';
  }

  function switchTo(lang) {
    if (!SUPPORTED[lang] || lang === getLang()) return;
    setLang(lang);
    // Reload so the page comes up cleanly in the chosen language (and switching
    // back to English restores the original strings without us having to cache
    // every replaced node).
    location.reload();
  }

  function injectSwitch() {
    if (document.querySelector('[data-zique-lang]')) return;
    var settingsItems = document.querySelector(
      '.sidebar-nav-section[data-section="settings"] .sidebar-nav-items'
    );
    var host = settingsItems ||
      document.querySelector('.sidebar-nav-items') ||
      document.querySelector('.sidebar-nav');
    if (!host) return;

    var current = getLang();
    var target = current === 'th' ? 'en' : 'th';
    // Label is written in the LANGUAGE YOU'D SWITCH TO, so it reads naturally
    // to a speaker of that language: "ไทย" when in English, "English" in Thai.
    var label = SUPPORTED[target];

    var a = document.createElement('a');
    a.href = 'javascript:void(0)';
    a.className = 'sidebar-nav-item';
    a.setAttribute('data-zique-lang', '1');
    a.setAttribute('data-no-i18n', '1'); // never translate the switch itself
    a.setAttribute('data-tooltip', label);
    a.innerHTML = globeIcon() + label;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      switchTo(target);
    });
    host.insertBefore(a, host.firstChild);
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  function boot() {
    injectSwitch();
    apply();
    // The dictionary script may still be loading; retry briefly until it's in.
    if (getLang() === 'th' && !applied) {
      var tries = 0;
      var iv = setInterval(function () {
        apply();
        if (applied || ++tries > 40) clearInterval(iv);  // ~4s max
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Expose a tiny API for the (few) pages that want to translate a string in JS.
  window.CoachI18n = {
    lang: getLang,
    t: function (s) { var o = translateText(s); return o == null ? s : o; },
    apply: apply
  };
})();
