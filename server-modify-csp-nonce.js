const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

const webRoot = path.join(__dirname, 'app');
const indexPath = path.join(webRoot, 'index.html');

// --- wczytaj index.html do pamięci ---
let indexTemplate = fs.readFileSync(indexPath, 'utf8');

// --- util: wstrzykiwanie nonce do <script> bez istniejącego nonce ---
function injectNonceIntoScripts(html, nonce) {
  return html.replace(
    /<script\b(?![^>]*\bnonce=)[^>]*>/gi,
    (m) => m.replace('<script', `<script nonce="${nonce}"`)
  );
}

// --- util: prosty parser/merger CSP ---
function parseCsp(csp) {
  const map = new Map();
  if (!csp) return map;
  const parts = csp.split(';').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const [name, ...vals] = p.split(/\s+/);
    const key = name.toLowerCase();
    const set = map.get(key) || new Set();
    vals.forEach(v => set.add(v));
    map.set(key, set);
  }
  return map;
}

function serializeCsp(map) {
  return Array.from(map.entries())
    .map(([dir, vals]) => `${dir} ${Array.from(vals).join(' ')}`.trim())
    .join('; ');
}

// --- middleware: generuj nonce, scal istniejący CSP i dołóż nonce + strict-dynamic ---
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;

  // 1) Odczytaj CSP ustawiony wcześniej w Node (np. przez helmet/middleware)
  let existing = res.getHeader('Content-Security-Policy');
  if (Array.isArray(existing)) existing = existing[0];

  // 2) Jeśli brak – możesz zdefiniować bazowy CSP w ENV albo użyj domyślnego minimalnego
  if (!existing) {
    existing = process.env.CSP_BASE
      || `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`;
  }

  const map = parseCsp(existing);

  // 3) zmodyfikuj script-src: dodaj nonce + 'strict-dynamic', usuń 'unsafe-inline'
  const script = map.get('script-src') || new Set(["'self'"]);
  script.add(`'nonce-${nonce}'`);
  script.add(`'strict-dynamic'`);
  script.delete(`'unsafe-inline'`);
  map.set('script-src', script);

  // (opcjonalnie) usuń 'unsafe-inline' również ze style-src jeśli nie potrzebujesz inline <style>
  // const style = map.get('style-src'); if (style) { style.delete(`'unsafe-inline'`); map.set('style-src', style); }

  const merged = serializeCsp(map);
  res.setHeader('Content-Security-Policy', merged);

  // dodatkowe nagłówki bezpieczeństwa
  // res.setHeader('X-Content-Type-Options', 'nosniff');
  // res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  // res.setHeader('X-Frame-Options', 'DENY');
  // res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  next();
});

// --- SPA fallback: tylko HTML (statyki serwuje IIS) ---
app.get(/.*/, (req, res) => {
  try {
    const nonce = res.locals.nonce;
    const html = injectNonceIntoScripts(indexTemplate, nonce);
    res.status(200).send(html);
  } catch (e) {
    console.error('[CSP] error while serving index.html', e);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`SPA host with CSP merge + nonce on ${port}`);
});
