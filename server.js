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

function saveQuestion(question) {
  const slug = questionToSlug(question);

  const questions = getAllQuestions();

  if (!questions.find(q => q.slug === slug)) {
    questions.push({ question, slug });
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questions, null, 2));
  }
  return slug;
}

function slugToQuestion(slug) {
  return decodeURIComponent(slug.replace(/-/g, ' '));
}

function getAllQuestions() {
  if (!fs.existsSync(QUESTIONS_FILE)) return [];
  return JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
}

app.post('/ask', async (req, res) => {
  const prompt = req.body.question.trim().slice(0, 500);
  if (!prompt) return res.status(400).json({ error: 'Domanda mancante' });

  const slug = saveQuestion(prompt);

  try {
    let cached = getAnswerFromCache(slug);
    if (cached) {
      return res.json({ answer: cached, slug });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Chiave API Gemini mancante' });
    }

    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

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
    res.status(500).json({
      error: 'Errore da Gemini API',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

function formatAnswerText(rawAnswer) {
  if (!rawAnswer) return "";

  const lines = rawAnswer.split('\n');

  const processedLines = lines.map(line => {
    line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    if (/^\s*\*\s+/.test(line)) {
      const content = line.replace(/^\s*\*\s+/, '');
      return `<li>${content}</li>`;
    }

    return line;
  });

  const hasListItems = processedLines.some(line => line.startsWith('<li>'));

  const html = hasListItems
    ? processedLines.map(line => line.startsWith('<li>') ? line : `<p>${line}</p>`).join('')
    : processedLines.map(line => `<p>${line}</p>`).join('');

  return hasListItems
    ? `<ul>${html}</ul>`
    : html;
}

app.get('/question/:slug', async (req, res) => {
  const slug = req.params.slug;
  const question = slugToQuestion(slug);

  try {
    let cached = getAnswerFromCache(slug);
    if (!cached) {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

      const response = await axios.post(geminiEndpoint, {
        contents: [
          {
            parts: [{ text: question }]
          }
        ]
      });

      cached = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta.";
      saveAnswerToCache(slug, cached);
    }

    const htmlAnswer = formatAnswerText(cached);

    const html = `
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${question}</title>
        <meta name="description" content="${cached.slice(0, 150)}" />
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 0;
            background-color: #f9f9f9;
            color: #333;
          }
          .container {
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          h1 {
            color: #0077cc;
            font-size: 2rem;
            margin-bottom: 20px;
          }
          p, ul {
            font-size: 1.2rem;
            margin-bottom: 15px;
          }
          li {
            margin-bottom: 10px;
          }
          strong {
            color: #0077cc;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>${question}</h1>
          <p>${htmlAnswer}</p>
          <p style="font-size:11px; margin-top: 20px; margin-bottom: 10px;">
            *Le risposte potrebbero essere scorrette e/o non aggiornate.
          </p>
        </div>
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

  const escapeXml = str =>
    str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const urls = questions.map(q => `
    <url>
      <loc>${PROD_URL}/question/${escapeXml(q.slug)}</loc>
      <changefreq>weekly</changefreq>
      <priority>0.8</priority>
    </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
      <loc>${PROD_URL}/</loc>
      <changefreq>daily</changefreq>
      <priority>1.0</priority>
    </url>
    ${urls}
  </urlset>`;

  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

app.listen(PORT, () => {
  console.log('Server running on ' + PROD_URL);
});
