const fs = require('fs');
const path = require('path');

const questionsFile = path.join(__dirname, 'questions.json');
const outputPath = path.join(__dirname, '..', '..', 'intelliAsk-frontend', 'sitemap.xml');
const baseUrl = 'https://intelliask.netlify.app';

if (!fs.existsSync(questionsFile)) {
  console.error("Il file questions.json non esiste ancora.");
  process.exit(1);
}

const questions = JSON.parse(fs.readFileSync(questionsFile, 'utf-8'));

const urls = questions.map(q => `
  <url>
    <loc>${baseUrl}/question/${q.slug}</loc>
    <changefreq>weekly</changefreq>
  </url>`).join('');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
  </url>
  ${urls}
</urlset>`;

const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, xml);
console.log('Sitemap generata con successo in:', outputPath);
