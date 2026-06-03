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

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Free Gemini keys — no credit card needed.
// Get keys here: https://aistudio.google.com/apikey
// Add up to 5 keys (GEMINI_API_KEY_1 … GEMINI_API_KEY_5) for automatic
// rotation — when one key hits the rate limit the next one takes over.
// GEMINI_API_KEY (no number) is also accepted as a single-key fallback.
const API_KEYS = (() => {
  const keys = [];
  for (let i = 1; i <= 5; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  const single = process.env.GEMINI_API_KEY;
  if (single && !keys.includes(single)) keys.push(single);
  return keys;
})();

let keyIndex = 0; // round-robin pointer

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
  if (API_KEYS.length === 0) {
    return res.status(500).json({
      error: 'No Gemini API key set. Add GEMINI_API_KEY (or GEMINI_API_KEY_1 … _5) to your .env file and restart the server.'
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
        if (b.source?.data) inlineBytes += b.source.data.length * 0.75;
      }
    }
  }
  if (inlineBytes > 18 * 1024 * 1024) {
    return res.status(413).json({
      error: 'Reference images are too large (~20MB Gemini limit). Use smaller screenshots or fewer references.'
    });
  }

  // Try each key in rotation; on 429 move to the next key immediately.
  const startIndex = keyIndex;
  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;

    let upstream, data;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
      upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: toGemini(messages),
          generationConfig: {
            maxOutputTokens: Number.isInteger(maxOutputTokens) ? maxOutputTokens : 32000,
            temperature: typeof temperature === 'number' ? temperature : 1,
            ...(MODEL.includes('pro') ? {} : { thinkingConfig: { thinkingBudget: Number.isInteger(thinkingBudget) ? thinkingBudget : 0 } })
          }
        })
      });
      data = await upstream.json();
    } catch (err) {
      return res.status(500).json({ error: 'Proxy error: ' + err.message });
    }

    // Rate-limited on this key → try the next one immediately
    if (upstream.status === 429 && attempt < API_KEYS.length - 1) {
      continue;
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || ('Gemini error ' + upstream.status)
      });
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .filter(p => !p.thought) // exclude Gemini thinking tokens — only keep actual output
      .map(p => p.text || '')
      .join('');

    if (!text.trim()) {
      const reason = data?.candidates?.[0]?.finishReason || 'empty';
      return res.status(500).json({ error: 'Gemini returned an empty response (' + reason + '). Please try again.' });
    }

    res.json({ content: [{ type: 'text', text }] });
    return;
  }

  // All keys rate-limited — fall back to the original wait-and-retry flow
  res.status(429).json({ error: 'All API keys are rate-limited. Please wait a moment and try again.' });
});

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found: ' + req.path });
});

app.listen(PORT, () => {
  console.log(`\n  FunnelCraft running 👉  http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL} | API keys loaded: ${API_KEYS.length}\n`);
  if (API_KEYS.length === 0) {
    console.log('  ⚠  No API keys found! Add GEMINI_API_KEY_1 (or GEMINI_API_KEY) to your .env file.\n');
  }
});
