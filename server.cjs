// FunnelCraft AI — backend proxy server (Google Gemini, FREE tier)
// Browser  ->  this server (holds API key)  ->  Gemini API  ->  back
//
// Why a server? An LLM API cannot be called directly from a browser
// (CORS + the API key must stay secret). This little server fixes both.
//
// The front-end (public/index.html) still speaks "Anthropic format".
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

// Which free model to use. Flash is fast and good for HTML generation.
// Options on the free tier: gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.5-pro
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Bigger limit so large reference images don't get rejected before our
// handler runs (a rejected body would otherwise become an HTML error page).
app.use(express.json({ limit: '60mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// Catch body-parser errors (e.g. payload too large) and return JSON,
// NOT Express's default HTML error page. This is what caused the
// "Unexpected token '<', <!DOCTYPE..." error in the browser.
app.use((err, req, res, next) => {
  if (err) {
    return res.status(err.status || 400).json({
      error: err.type === 'entity.too.large'
        ? 'Reference file bahu motu che. Nani/ochhi images vapro (har image ~5MB thi nani rakho).'
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
      error: 'GEMINI_API_KEY set nathi. .env file ma key add karo ane server restart karo.'
    });
  }

  const { messages, maxOutputTokens, thinkingBudget, temperature } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array missing che.' });
  }

  // Gemini's inline (base64) data limit per request is ~20MB total.
  // If references push past that, warn clearly instead of letting Gemini
  // throw a confusing error.
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
      error: 'Reference images bahu moti che (Gemini ~20MB sudhi j inline le che). Nani screenshots vapro, ke thodi references kadhi nakho.'
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
          // A full landing page needs lots of tokens. 8000 was too low.
          // Front-end may override (e.g. smaller for the quick analysis step).
          maxOutputTokens: Number.isInteger(maxOutputTokens) ? maxOutputTokens : 32000,
          temperature: typeof temperature === 'number' ? temperature : 1,
          // Gemini 2.5 "thinking" eats output tokens, which left the HTML
          // truncated/empty — so it's OFF (budget 0) by default for page builds.
          // The front-end turns it ON (small budget) ONLY for the design-analysis
          // step, so the model actually "reads" the reference image properly.
          // (Works on flash / flash-lite. Pro can't fully disable thinking.)
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

    // Pull text out of Gemini's reply.
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('');

    if (!text.trim()) {
      const reason = data?.candidates?.[0]?.finishReason || 'empty';
      return res.status(500).json({ error: 'Gemini khaali javab aapyo (' + reason + '). Fari try karo.' });
    }

    // Send back in Anthropic shape so the front-end works unchanged.
    res.json({ content: [{ type: 'text', text }] });
  } catch (err) {
    res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
});

// Any unknown /api/* route returns JSON (never the HTML index page).
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Aa API route che j nahi: ' + req.path });
});

app.listen(PORT, () => {
  console.log(`\n  FunnelCraft chaalu thai gayu 👉  http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL} (Google Gemini, free tier)\n`);
});