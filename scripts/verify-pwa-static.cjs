// One-shot static validator for Phase 6 Task 2.4 PWA UAT.
// Run: node scripts/verify-pwa-static.cjs
const fs = require('fs');

const code = fs.readFileSync('public/sw.js', 'utf8');

try {
  new Function(code.replace(/self/g, 'globalThis'));
  console.log('sw.js: syntax OK');
} catch (e) {
  console.log('sw.js: SYNTAX ERROR —', e.message);
  process.exit(1);
}

const checks = {
  'push handler': /addEventListener\(['"`]push['"`]/.test(code),
  'notificationclick handler': /addEventListener\(['"`]notificationclick['"`]/.test(code),
  'same-origin guard (T-06-07)': /\.origin\s*!==\s*self\.location\.origin/.test(code) || /\.origin\s*===\s*self\.location\.origin/.test(code),
  'data.deepLink read': /data\.deepLink/.test(code),
  'openWindow fallback': /openWindow/.test(code),
};
console.log('\n--- sw.js content checks ---');
for (const [k, v] of Object.entries(checks)) console.log(' ', v ? 'OK ' : 'FAIL', k);

const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
console.log('\n--- manifest.json ---');
console.log(' ', 'name:', manifest.name);
console.log(' ', 'short_name:', manifest.short_name);
console.log(' ', 'display:', manifest.display);
console.log(' ', 'theme_color:', manifest.theme_color);
console.log(' ', 'start_url:', manifest.start_url);
console.log(' ', 'icons:', manifest.icons.length, 'entries');
console.log(' ', 'icons[0].purpose:', manifest.icons[0].purpose);

// Installability heuristic (Chrome PWA criteria)
const installable = (
  manifest.name && manifest.short_name &&
  manifest.start_url && manifest.display &&
  manifest.icons && manifest.icons.length >= 1 &&
  manifest.icons.some(i => i.sizes === '192x192') &&
  manifest.icons.some(i => i.sizes === '512x512')
);
console.log('\nInstallability heuristic:', installable ? 'PASS (Chrome should mark site installable)' : 'FAIL');

// Index.html PWA tags
const html = fs.readFileSync('index.html', 'utf8');
const htmlChecks = {
  'manifest link': /rel=['"]manifest['"]/.test(html),
  'theme-color meta': /name=['"]theme-color['"]/.test(html),
  'apple-touch-icon': /apple-touch-icon/.test(html),
  'apple-mobile-web-app-capable': /apple-mobile-web-app-capable/.test(html),
  'apple-mobile-web-app-title': /apple-mobile-web-app-title/.test(html),
  'CONSEJ CRM title': /<title>CONSEJ CRM<\/title>/.test(html),
};
console.log('\n--- index.html PWA tags ---');
for (const [k, v] of Object.entries(htmlChecks)) console.log(' ', v ? 'OK ' : 'FAIL', k);

// main.tsx SW registration
const main = fs.readFileSync('src/main.tsx', 'utf8');
const mainChecks = {
  'feature detection (serviceWorker in navigator)': /['"]serviceWorker['"]\s+in\s+navigator/.test(main),
  "register('/sw.js')": /serviceWorker\.register\s*\(\s*['"]\/sw\.js['"]/.test(main),
};
console.log('\n--- main.tsx SW registration ---');
for (const [k, v] of Object.entries(mainChecks)) console.log(' ', v ? 'OK ' : 'FAIL', k);

// vercel.json headers
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const swRoute = (vercel.headers || []).find(h => h.source === '/sw.js');
const manifestRoute = (vercel.headers || []).find(h => h.source === '/manifest.json');
console.log('\n--- vercel.json cache headers ---');
console.log(' ', swRoute ? 'OK ' : 'FAIL', '/sw.js route present');
console.log(' ', manifestRoute ? 'OK ' : 'FAIL', '/manifest.json route present');
if (swRoute) {
  const cacheHeader = (swRoute.headers || []).find(h => h.key === 'Cache-Control');
  console.log(' ', cacheHeader && /must-revalidate/.test(cacheHeader.value) ? 'OK ' : 'FAIL',
    'sw.js Cache-Control: must-revalidate');
  const swAllowed = (swRoute.headers || []).find(h => h.key === 'Service-Worker-Allowed');
  console.log(' ', swAllowed && swAllowed.value === '/' ? 'OK ' : 'FAIL',
    'Service-Worker-Allowed: /');
}

// Icon files
console.log('\n--- icon files ---');
for (const size of ['192', '512']) {
  const buf = fs.readFileSync(`public/icon-${size}.png`);
  const isPNG = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  console.log(' ', isPNG && w === Number(size) && h === Number(size) ? 'OK ' : 'FAIL',
    `icon-${size}.png: PNG=${isPNG}, dims=${w}x${h}, bytes=${buf.length}`);
}

// Dist build outputs
console.log('\n--- dist/ build outputs ---');
for (const f of ['manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png']) {
  const exists = fs.existsSync(`dist/${f}`);
  console.log(' ', exists ? 'OK ' : 'FAIL', `dist/${f}`);
}

console.log('\n>>> All static checks complete. Real-browser DevTools UAT (Application tab) still pending. <<<');
