// FunnelCraft AI — backend proxy server (Google Gemini, FREE tier)
// Browser  ->  this server (holds API key)  ->  Gemini API  ->  back
//
// Why a server? An LLM API cannot be called directly from a browser
// (CORS + the API key must stay secret). This little server fixes both.
//
// The front-end speaks "Anthropic format".
// This server converts that to Gemini format on the way out, and converts
// Gemini's reply back to Anthropic shape on the way in — so the front-end
// needs ZERO changes.

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Free Gemini key — no credit card needed.
// Get one here: https://aistudio.google.com/apikey
const API_KEY = process.env.GEMINI_API_KEY;

// Which free model to use. flash-lite gives the most requests/day on free tier.
// Options: gemini-2.5-flash-lite, gemini-2.5-flash, gemini-2.5-pro
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

// Bigger limit so large reference images don't get rejected before our
// handler runs (a rejected body would otherwise become an HTML error page).
app.use(express.json({ limit: '60mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// Catch body-parser errors and return JSON, not Express's default HTML page.
app.use((err, req, res, next) => {
  if (err) {
    return res.status(err.status || 400).json({
      error: err.type === 'entity.too.large'
        ? 'Reference file is too large. Use smaller images (keep each image under ~5MB).'
        : 'Request error: ' + err.message
    });
  }
  next();
});

// ── Convert Anthropic-style messages -> Gemini "contents" ──
function toGemini(messages) {
  return messages.map(m => {
    const role = m.role === 'assistant' ? 'model' : 'user';
    let parts;

    if (typeof m.content === 'string') {
      parts = [{ text: m.content }];
    } else if (Array.isArray(m.content)) {
      parts = m.content.map(block => {
        if (block.type === 'text') {
          return { text: block.text };
        }
        if (block.type === 'image' && block.source?.type === 'base64') {
          return { inline_data: { mime_type: block.source.media_type, data: block.source.data } };
        }
        if (block.type === 'document' && block.source?.type === 'base64') {
          return { inline_data: { mime_type: 'application/pdf', data: block.source.data } };
        }
        return { text: '' };
      });
    } else {
      parts = [{ text: '' }];
    }

    return { role, parts };
  });
}

// ── The endpoint the front-end calls ──
app.post('/api/generate', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not set. Add the key to your .env file and restart the server.'
    });
  }

  const { messages, maxOutputTokens, thinkingBudget, temperature } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is missing.' });
  }

  // Gemini's inline (base64) data limit per request is ~20MB total.
  let inlineBytes = 0;
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.source?.data) inlineBytes += b.source.data.length * 0.75; // base64 -> bytes
      }
    }
  }
  if (inlineBytes > 18 * 1024 * 1024) {
    return res.status(413).json({
      error: 'Reference images are too large (~20MB Gemini limit). Use smaller screenshots or fewer references.'
    });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: toGemini(messages),
        generationConfig: {
          maxOutputTokens: Number.isInteger(maxOutputTokens) ? maxOutputTokens : 32000,
          temperature: typeof temperature === 'number' ? temperature : 1,
          // Thinking OFF by default for page builds (avoids truncated HTML).
          // Turned ON only for the reference analysis step.
          ...(MODEL.includes('pro') ? {} : { thinkingConfig: { thinkingBudget: Number.isInteger(thinkingBudget) ? thinkingBudget : 0 } })
        }
      })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || ('Gemini error ' + upstream.status)
      });
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('');

    if (!text.trim()) {
      const reason = data?.candidates?.[0]?.finishReason || 'empty';
      return res.status(500).json({ error: 'Gemini returned an empty response (' + reason + '). Please try again.' });
    }

    // Send back in Anthropic shape so the front-end works unchanged.
    res.json({ content: [{ type: 'text', text }] });
  } catch (err) {
    res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
});

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found: ' + req.path });
});

app.listen(PORT, () => {
  console.log(`\n  FunnelCraft running 👉  http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL} (Google Gemini, free tier)\n`);
});
