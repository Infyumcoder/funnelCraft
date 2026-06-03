# FunnelCraft AI — React (Vite) version

Aa tamaro original single-file HTML project che, je have **React.js (Vite)** ma
convert thai gayu che. Badhi functionality **same** che — UI, design, Gemini
proxy badhu jevu hatu tevu j. Fakt code have clean React components ma vahechayel che.

## Structure

```
funnelcraft-react/
├─ index.html          ← Vite entry (fonts + #root)
├─ server.cjs          ← Express proxy backend (Gemini API) — same as before
├─ vite.config.js      ← dev proxy /api → :3000
├─ .env.example        ← copy → .env, key paste karo
└─ src/
   ├─ main.jsx         ← React root
   ├─ App.jsx          ← state + generate orchestration
   ├─ index.css        ← original CSS (verbatim)
   ├─ components/      ← Nav, LeftPanel, ReferencePanel, RightPanel, Progress, Toast, Icons
   └─ lib/             ← data.js, image.js, generate.js (API + prompt logic)
```

## Su joiye
- **Node.js 18+** (check: `node -v`)
- Ek **free Gemini API key**: https://aistudio.google.com/apikey

## Setup

**1) Dependencies install karo:**
```
npm install
```

**2)** `.env.example` ne copy karine `.env` naam aapo, ema tamari key paste karo:
```
GEMINI_API_KEY=AIza...tamari-key...
GEMINI_MODEL=gemini-2.5-flash-lite
```
> `.env` file kyarey share na karo / GitHub par na muko.

## Chalavvana 2 rasta

### A) Production (recommended — ek j command)
React app build kare + server chalave:
```
npm start
```
Pachi browser ma kholo 👉 **http://localhost:3000**

### B) Development (live reload jaroori hoy to — 2 terminals)
Terminal 1 — backend:
```
npm run server
```
Terminal 2 — React dev server:
```
npm run dev
```
Pachi browser ma kholo 👉 **http://localhost:5173**
(Dev server na `/api` calls automatic backend :3000 par proxy thaay che.)

## Important
- `.env` change karya pachi server **restart** karo.
- Code badalya pachi production mate fari `npm start` (build + serve) karo,
  athva dev mode (B) vapro je auto-reload kare.

## Free tier limits (Gemini)
- Default model `gemini-2.5-flash-lite` (vadhu daily requests).
- Better quality joiye to `.env` ma `GEMINI_MODEL=gemini-2.5-flash` ke
  `gemini-2.5-pro` muki ne server restart karo.
