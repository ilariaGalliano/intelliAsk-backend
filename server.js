const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://intelliask-backend.onrender.com'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  })
);

app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Troppo traffico da questo IP, riprova più tardi."
});
app.use('/ask', limiter);

app.use(express.static('public'));
app.use(express.json());

const PORT = 5000;
const BASE_URL = 'http://localhost:' + PORT;
const PROD_URL = 'https://intelliask.netlify.app';
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');

function getAnswerFromCache(slug) {
  const file = path.join(__dirname, 'answers', slug + '.txt');
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, 'utf8');
  }
  return null;
}

function saveAnswerToCache(slug, answer) {
  const dir = path.join(__dirname, 'answers');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  const file = path.join(dir, slug + '.txt');
  fs.writeFileSync(file, answer);
}

function questionToSlug(question) {
  return question
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}

function slugToQuestion(slug) {
  return decodeURIComponent(slug.replace(/-/g, ' '));
}

function getAllQuestions() {
  if (!fs.existsSync(QUESTIONS_FILE)) return [];
  return JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
}

function saveQuestion(question) {
  const slug = questionToSlug(question);
  const questions = getAllQuestions();
  if (!questions.find(q => q.slug === slug)) {
    questions.push({ question, slug });
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questions, null, 2));
  }
  return slug;
}

app.post('/ask', async (req, res) => {
  const prompt = req.body.question;
  if (!prompt) return res.status(400).json({ error: 'Domanda mancante' });

  const slug = saveQuestion(prompt);

  try {
    let cached = getAnswerFromCache(slug);
    if (cached) {
      return res.json({ answer: cached, slug });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return res.status(500).json({ error: 'Chiave API Gemini mancante' });

    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`;

    const response = await axios.post(geminiEndpoint, {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    });

    const answer = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta disponibile.";
    saveAnswerToCache(slug, answer);

    res.json({ answer, slug });
  } catch (error) {
    console.error("Errore Gemini:", error.response?.data || error.message);
    res.status(500).json({ error: 'Errore da Gemini API', details: error.message });
  }
});

app.get('/question/:slug', async (req, res) => {
  const slug = req.params.slug;
  const question = slugToQuestion(slug);

  try {
    let cached = getAnswerFromCache(slug);
    if (cached) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="it">
        <head>
          <meta charset="UTF-8" />
          <title>${question}</title>
          <meta name="description" content="${cached.slice(0, 150)}" />
        </head>
        <body>
          <h1>${question}</h1>
          <p>${cached}</p>
        </body>
        </html>
      `);
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

    const response = await axios.post(geminiEndpoint, {
      contents: [
        {
          parts: [{ text: question }]
        }
      ]
    });

    const answer = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta.";
    saveAnswerToCache(slug, answer);

    const html = `
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8" />
        <title>${question}</title>
        <meta name="description" content="${answer.slice(0, 150)}" />
      </head>
      <body>
        <h1>${question}</h1>
        <p>${answer}</p>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error("Errore Gemini:", error.response?.data || error.message);
    res.status(500).send("Errore nella generazione della risposta.");
  }
});

app.get('/sitemap.xml', (req, res) => {
  const questions = getAllQuestions();
  const urls = questions.map(q => `
    <url>
      <loc>${PROD_URL}/question/${q.slug}</loc>
      <changefreq>weekly</changefreq>
    </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
  </urlset>`;

  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

app.listen(PORT, () => {
  console.log('Server running on ' + PROD_URL);
});
