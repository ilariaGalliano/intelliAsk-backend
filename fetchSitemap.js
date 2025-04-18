// backend/fetchSitemap.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// URL dove il backend serve la sitemap dinamica
const SITEMAP_URL = 'https://intelliask-backend.onrender.com/sitemap.xml';

// Percorso di destinazione nel frontend (dove Netlify potrà leggerlo)
const DEST = path.join(__dirname, '..', 'intelliAsk-frontend', 'public', 'sitemap.xml');

axios.get(SITEMAP_URL)
  .then((response) => {
    fs.writeFileSync(DEST, response.data, 'utf8');
    console.log('Sitemap copiata in frontend/public/sitemap.xml');
  })
  .catch((err) => {
    console.error('Errore nel recuperare la sitemap:', err.message);
  });
