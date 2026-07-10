// Dictionary aggregator.
//
// The "core" strings (common, login, settings, nav...) live in en.js / es.js.
// Everything else is split PER SCREEN into src/i18n/en/<screen>.js and
// src/i18n/es/<screen>.js — one file per screen. This keeps the big
// translation effort manageable: each screen owns its own file, so work on
// different screens never collides.
//
// Vite's import.meta.glob picks up every per-screen file automatically, so
// adding a new screen is just dropping in en/<screen>.js + es/<screen>.js —
// no wiring needed here. The file's base name becomes its namespace, e.g.
// en/dashboard.js  ->  t('dashboard.someKey').
import enCore from './en.js';
import esCore from './es.js';
import thCore from './th.js';

const enModules = import.meta.glob('./en/*.js', { eager: true });
const esModules = import.meta.glob('./es/*.js', { eager: true });
const thModules = import.meta.glob('./th/*.js', { eager: true });

function assemble(core, modules) {
  const dict = { ...core };
  for (const path in modules) {
    // './en/dashboard.js' -> 'dashboard'
    const ns = path.split('/').pop().replace(/\.js$/, '');
    dict[ns] = { ...(dict[ns] || {}), ...(modules[path].default || {}) };
  }
  return dict;
}

export const en = assemble(enCore, enModules);
export const es = assemble(esCore, esModules);
export const th = assemble(thCore, thModules);
