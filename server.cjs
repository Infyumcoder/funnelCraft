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

// Supports multiple comma-separated API keys for automatic rotation.
// When one key hits the rate limit, the server instantly tries the next key
// instead of waiting 60s. Add more free keys at aistudio.google.com/apikey
// Example: GEMINI_API_KEY=key1,key2,key3
const API_KEYS = (process.env.GEMINI_API_KEY || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

// Per-key cooldown tracking: keyIndex -> timestamp when it's free again
const keyCooldown = {};

function getAvailableKey() {
  const now = Date.now();
  for (let i = 0; i < API_KEYS.length; i++) {
    if (!keyCooldown[i] || keyCooldown[i] <= now) return { key: API_KEYS[i], idx: i };
  }
  // All keys are cooling down — return the one that frees soonest
  let best = 0;
  for (let i = 1; i < API_KEYS.length; i++) {
    if ((keyCooldown[i] || 0) < (keyCooldown[best] || 0)) best = i;
  }
  return { key: API_KEYS[best], idx: best, coolUntil: keyCooldown[best] };
}

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
        ? 'Reference file is too large. Use smaller/fewer images (keep each image under ~5MB).'
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
      error: 'GEMINI_API_KEY is not set. Add your key(s) to the .env file and restart the server.'
    });
  }

  const { messages, maxOutputTokens, thinkingBudget, temperature } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is missing.' });
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
      error: 'Reference images are too large (Gemini accepts ~20MB total inline). Use smaller screenshots or remove some references.'
    });
  }

  // Try each available key; on 429 mark that key as cooling and try the next.
  const MAX_KEY_ATTEMPTS = API_KEYS.length;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
    const { key, idx, coolUntil } = getAvailableKey();

    // All keys are still cooling — tell the client to wait
    if (coolUntil && coolUntil > Date.now()) {
      const waitSec = Math.ceil((coolUntil - Date.now()) / 1000);
      return res.status(429).json({
        error: `Rate limit reached on all ${API_KEYS.length} key(s). Retry in ${waitSec}s`
      });
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

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
        const msg = data?.error?.message || ('Gemini error ' + upstream.status);
        const isQuota = upstream.status === 429 || /quota|rate.?limit|exceeded|RESOURCE_EXHAUSTED/i.test(msg);

        if (isQuota && API_KEYS.length > 1) {
          // Mark this key as cooling for 65 seconds and retry with the next key
          const retryMatch = msg.match(/retry in ([\d.]+)\s*s/i);
          const coolSec = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) + 2 : 65;
          keyCooldown[idx] = Date.now() + coolSec * 1000;
          lastError = msg;
          continue; // try next key
        }

        return res.status(upstream.status).json({ error: msg });
      }

      // Pull text out of Gemini's reply.
      // Filter out thinking parts (thought: true) — they appear in the parts array
      // when thinkingBudget > 0, and mixing them with the actual output corrupts
      // JSON parsing in analyzeReferences (thinking text often contains '{' chars).
      const text = (data?.candidates?.[0]?.content?.parts || [])
        .filter(p => !p.thought)
        .map(p => p.text || '')
        .join('');

      if (!text.trim()) {
        const reason = data?.candidates?.[0]?.finishReason || 'empty';
        return res.status(500).json({ error: `Gemini returned an empty response (${reason}). Please retry.` });
      }

      // Send back in Anthropic shape so the front-end works unchanged.
      return res.json({ content: [{ type: 'text', text }] });

    } catch (err) {
      lastError = err.message;
      break;
    }
  }

  res.status(500).json({ error: lastError || 'Proxy error' });
});

// Any unknown /api/* route returns JSON (never the HTML index page).
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Aa API route che j nahi: ' + req.path });
});

app.listen(PORT, () => {
  console.log(`\n  FunnelCraft running 👉  http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL} | API keys loaded: ${API_KEYS.length}\n`);
});