// FunnelCraft AI — backend proxy server (Anthropic Claude API)
// Browser  ->  this server (holds API key)  ->  Claude API  ->  back
//
// Why a server? An LLM API cannot be called directly from a browser
// (CORS + the API key must stay secret). This little server fixes both.

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// Bigger limit so large reference images don't get rejected before our
// handler runs.
app.use(express.json({ limit: '60mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

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

// ── The endpoint the front-end calls ──
app.post('/api/generate', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set. Add the key to your .env file and restart the server.'
    });
  }

  const { messages, maxOutputTokens, thinkingBudget, temperature } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is missing.' });
  }

  // Inline (base64) data size guard — ~20MB total
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
      error: 'Reference images are too large. Use smaller screenshots or reduce the number of references.'
    });
  }

  try {
    const body = {
      model: MODEL,
      max_tokens: Number.isInteger(maxOutputTokens) ? maxOutputTokens : 32000,
      messages,
    };

    // Temperature: Claude requires temp=1 when thinking is enabled
    const useThinking = Number.isInteger(thinkingBudget) && thinkingBudget > 0;
    if (useThinking) {
      body.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
      body.temperature = 1; // required when thinking is on
    } else {
      body.temperature = typeof temperature === 'number' ? temperature : 1;
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || ('Claude API error ' + upstream.status)
      });
    }

    // Pull only text blocks (skip thinking blocks)
    const text = (data?.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('');

    if (!text.trim()) {
      const reason = data?.stop_reason || 'empty';
      return res.status(500).json({ error: 'Claude returned an empty response (' + reason + '). Please try again.' });
    }

    // Return in the same Anthropic shape the front-end already expects
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
  console.log(`  Model: ${MODEL} (Anthropic Claude)\n`);
});
