#!/usr/bin/env node
/**
 * check-files.mjs — TREKKO CI
 * Vérifie la présence des fichiers critiques et la syntaxe JS (node --check).
 */

import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const CRITICAL_FILES = [
  'index.html',
  'styles.css',
  'service-worker.js',
  'manifest.json',
  'js/app.js',
  'js/map.js',
  'js/hiking-screen.js',
  'js/tracker.js',
  'js/day-plan.js',
  'js/geolocation.js',
  'js/utils.js',
  'js/nearby.js',
  'js/config.js',
  'tests/smoke-tests.html',
  '_docs/TEST_PLAN.md',
  'VERSION',
  'CHANGELOG.md'
];

// Tous les JS critiques — node --check vérifie la syntaxe ESM sans exécuter
const JS_SYNTAX_CHECK = [
  'js/config.js',
  'js/utils.js',
  'js/geolocation.js',
  'js/filters.js',
  'js/day-plan.js',
  'js/tracker.js',
  'js/map.js',
  'js/nearby.js',
  'js/app.js',
  'js/hiking-screen.js',
  'js/markers.js',
  'js/photo-map.js',
  'js/ui.js',
  'service-worker.js'
];

let errors = 0;
let warnings = 0;

function ok(msg)   { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); errors++; }
function warn(msg) { console.warn(`  ⚠️  ${msg}`); warnings++; }

// ── 1. Présence des fichiers ─────────────────────────────────
console.log('\n📁 Vérification des fichiers critiques...\n');
for (const f of CRITICAL_FILES) {
  if (existsSync(f)) ok(f);
  else fail(`Fichier manquant : ${f}`);
}

// ── 2. VERSION correcte ──────────────────────────────────────
console.log('\n🏷  Vérification de la version...\n');
try {
  const version = readFileSync('VERSION', 'utf8').trim();
  if (version.startsWith('v')) ok(`VERSION = ${version}`);
  else warn(`VERSION ne commence pas par 'v' : ${version}`);
} catch (e) {
  fail('Impossible de lire VERSION');
}

// ── 3. app.js?v= présent dans index.html ─────────────────────
console.log('\n🔍 Vérification des références dans index.html...\n');
try {
  const html = readFileSync('index.html', 'utf8');
  const appJs = readFileSync('js/app.js', 'utf8');
  if (/app\.js\?v=\d+/.test(html))         ok('index.html : app.js?v=N');
  else fail('index.html : app.js sans suffixe version — risque de cache');
  if (/map\.js\?v=\d+/.test(appJs))        ok('app.js : map.js?v=N');
  else warn('app.js : map.js sans suffixe version détecté');
  const swLine = readFileSync('service-worker.js','utf8').match(/SERVICE WORKER v(\d+)/)?.[1];
  if (swLine) ok(`service-worker.js version ${swLine}`);
} catch(e) {
  warn('Impossible de vérifier les références : ' + e.message);
}

// ── 4. Syntaxe JS avec node --check ─────────────────────────
console.log('\n🔤 Vérification syntaxique JS (node --check)...\n');
for (const f of JS_SYNTAX_CHECK) {
  if (!existsSync(f)) { warn(`Absent (ignoré) : ${f}`); continue; }
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
    ok(`Syntaxe OK : ${f}`);
  } catch (e) {
    fail(`Erreur syntaxe dans ${f} :\n     ${e.stderr?.toString().trim() || e.message}`);
  }
}

// ── Résultat ─────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
if (errors === 0 && warnings === 0) {
  console.log('✅ TREKKO CI — Tous les checks passent.\n');
  process.exit(0);
} else if (errors === 0) {
  console.log(`⚠️  TREKKO CI — ${warnings} avertissement(s), 0 erreur.\n`);
  process.exit(0);
} else {
  console.error(`❌ TREKKO CI — ${errors} erreur(s), ${warnings} avertissement(s).\n`);
  process.exit(1);
}
