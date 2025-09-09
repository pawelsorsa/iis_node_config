const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const app = express();
const port = process.env.PORT || 3000;

// Fizyczny web root
const webRoot = path.join(__dirname, 'app');
const indexPath = path.join(webRoot, 'index.html');

// Ładujemy index.html tylko raz przy starcie serwera
const indexTemplate = fs.readFileSync(indexPath, 'utf8');

// util: wstrzyknięcie nonce do wszystkich <script> bez istniejącego nonce
function injectScriptNonce(html, nonce) {
  return html.replace(
    /<script\b(?![^>]*\bnonce=)[^>]*>/gi,
    m => m.replace('<script', `<script nonce="${nonce}"`)
  );
}

app.use(compression());

// SPA fallback: tylko HTML; pliki .js/.css/.png itd. obsłuży IIS
app.get(/.*/, (req, res) => {
  try {
    const nonce = req.get('X-Nonce'); // nagłówek z IIS/proxy

    if (nonce) {
      const html = injectScriptNonce(indexTemplate, nonce);
      res.type('html').status(200).send(html);
    } else {
      res.type('html').status(200).send(indexTemplate);
    }
  } catch (e) {
    console.error('[SPA] error while serving index.html', e);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(port, () => {
  console.log(`SPA host (script nonce from X-Nonce) listening on port ${port}`);
});
