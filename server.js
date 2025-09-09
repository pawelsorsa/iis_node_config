const express = require('express');
const path = require('path');
const compression = require('compression');

const app = express();
const port = process.env.PORT || 3000;

// Treat the /app folder as the web root
const webRoot = path.join(__dirname, 'app');

app.use(compression());
// Serve static assets at /
app.use(express.static(webRoot, { index: false, maxAge: '1y' }));

// Fallback SPA: TYLKO dla tras bez rozszerzenia (pliki obsłuży IIS)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(webRoot, 'index.html'));
});


app.listen(port);
