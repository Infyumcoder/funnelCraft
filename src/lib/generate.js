// ── Core generation logic, ported from the original index.html <script>. ──
// The behaviour is identical; only the surrounding UI moved to React.

// ── API CALL WITH RATE-LIMIT HANDLING ──
// `onToast` is an optional callback so the UI can show the live countdown.
function countdownWait(sec, onToast) {
  return new Promise((resolve) => {
    let left = sec;
    onToast && onToast('Rate limit — auto-retry in ' + left + 's…');
    const iv = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(iv);
        onToast && onToast('Retrying…');
        resolve();
      } else {
        onToast && onToast('Rate limit — auto-retry in ' + left + 's…');
      }
    }, 1000);
  });
}

export async function apiGenerate(payload, onToast) {
  const MAX_ATTEMPTS = 4; // 1 try + up to 3 auto-retries
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res, data;
    try {
      res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      throw new Error('Network error: ' + e.message);
    }
    try {
      data = await res.json();
    } catch (e) {
      data = { error: 'Server returned an invalid response.' };
    }
    if (res.ok) return data;

    const msg = (data && data.error) || 'Server error ' + res.status;
    const isQuota =
      res.status === 429 ||
      /quota|rate.?limit|exceeded|RESOURCE_EXHAUSTED/i.test(msg);
    const m = msg.match(/retry in ([\d.]+)\s*s/i);
    const waitS = m ? Math.ceil(parseFloat(m[1])) : isQuota ? 25 : 0;
    const lastAttempt = attempt === MAX_ATTEMPTS - 1;

    // Rate limit → wait it out and retry automatically (with a buffer).
    if (isQuota && !lastAttempt && waitS <= 65) {
      await countdownWait(waitS + 2, onToast);
      continue;
    }
    if (isQuota) {
      throw new Error(
        waitS > 65
          ? 'Daily API limit reached — it will reset soon. Try again later or upgrade your Anthropic plan.'
          : 'Rate limit could not clear. Wait 2 minutes and try again.'
      );
    }
    throw new Error(msg);
  }
}

// ── STEP 1: EXTRACT A DESIGN SPEC FROM THE REFERENCE ──
export async function analyzeReferences(refs, onToast) {
  const imgRefs = refs.filter((r) => r.type === 'image');
  const pdfRefs = refs.filter((r) => r.type === 'pdf');
  if (imgRefs.length === 0 && pdfRefs.length === 0) return null;

  const content = [];
  imgRefs.forEach((r, i) => {
    content.push({ type: 'text', text: `Reference design ${i + 1}:` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: r.mediaType, data: r.data },
    });
  });
  pdfRefs.forEach((r, i) => {
    content.push({
      type: 'text',
      text: `Reference PDF ${i + 1} ("${r.label}"):`,
    });
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: r.data },
    });
  });
  content.push({
    type: 'text',
    text: `You are a senior UI/layout engineer. Study the reference design(s) above PIXEL BY PIXEL and extract BOTH the visual design system AND the exact layout structure so the page can be rebuilt identically.
SAMPLE REAL COLOURS from the pixels (true hex, no guesses).
Return ONLY raw JSON (no markdown, no commentary) in EXACTLY this shape:
{
 "mood":"2-4 words",
 "palette":{"bg":"#hex","surface":"#hex","text":"#hex","muted":"#hex","accent":"#hex","accent2":"#hex"},
 "isDark": true|false,
 "font":{"headingFont":"a real Google Font matching the headings","bodyFont":"a real Google Font matching the body","feel":"e.g. bold condensed / elegant serif / clean geometric"},
 "radius":"sharp|slightly-rounded|rounded|pill",
 "buttons":"shape, fill colour, hover style",
 "cards":"borders, shadow, fill, layout inside card",
 "spacing":"tight|balanced|airy",
 "layout":{
   "nav":"describe nav structure — e.g. fixed bar: logo left, links center, CTA button right",
   "hero":"describe hero layout — e.g. full-width dark bg; text block left 55%; decorative CSS shape right 45%; single large CTA below headline",
   "contentSections":"describe how body sections are laid out — e.g. alternating 2-col rows (text left / visual right); 3-col icon grid for features; full-width testimonial strip",
   "cta":"describe CTA/footer section — e.g. centered banner, large heading, 2 buttons side by side",
   "grid":"CSS grid/flex patterns used — e.g. 12-col grid, card grids are repeat(3,1fr) gap-24px"
 },
 "sections":["section names top-to-bottom that the reference uses"],
 "distinctive":["5-8 specific layout + visual details that make this design unique — be precise, e.g. 'hero has a diagonal clip-path divider', 'nav has a coloured left border accent', 'price box has a 3px glowing border'"]
}`,
  });

  const data = await apiGenerate(
    { messages: [{ role: 'user', content }], maxOutputTokens: 8000, thinkingBudget: 4096 },
    onToast
  );
  let txt = (data.content || []).map((b) => b.text || '').join('').trim();
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = txt.indexOf('{');
  const b = txt.lastIndexOf('}');
  if (a >= 0 && b > a) txt = txt.slice(a, b + 1);
  try {
    return JSON.parse(txt);
  } catch (e) {
    return { raw: txt };
  }
}

// ── STEP 2: BUILD THE HTML, DRIVEN BY THE SPEC + THE REFERENCE ──
export function buildMessages(desc, extra, spec, refs) {
  const imgRefs = refs.filter((r) => r.type === 'image');
  const pdfRefs = refs.filter((r) => r.type === 'pdf');
  const urlRefs = refs.filter((r) => r.type === 'url');
  const hasRef = imgRefs.length > 0 || pdfRefs.length > 0;
  const cleanSpec = spec && !spec.raw && spec.palette;

  const imagePolicy = `NO EXTERNAL IMAGES: Never embed or link to any image file (no <img>, no external URLs). Re-create EVERY visual with CSS gradients, shapes, and inline SVG only.`;

  const defaultSections = `SECTIONS (in order):
1. Sticky nav + CTA
2. Hero — headline, subhead, CTA, trust line, visual area
3. Problem / pain
4. Solution
5. Benefits icon grid
6. Social proof — testimonials + stats strip
7. Offer breakdown — value stack, price, bonuses
8. Objection handling + guarantee
9. FAQ accordion
10. Final CTA + urgency
11. Footer`;

  let matchBlock = '';
  let designBrief = '';
  let sectionRule = defaultSections;

  if (hasRef) {
    matchBlock = `\n\nCRITICAL — LAYOUT + DESIGN MUST MATCH THE REFERENCE EXACTLY:
Your output must look like it came from the SAME designer as the reference image. A viewer should see both pages side by side and say "same site." This means:
• Copy the LAYOUT structure precisely — hero split/centered/full-bg, column counts, nav position, section widths.
• Copy the VISUAL style — exact colours, font weights, border-radius, shadow style.
• Do NOT fall back to your default look (no generic Inter font, no purple/indigo gradients unless the reference uses them).
• Do NOT invent sections the reference doesn't have.`;
    sectionRule = `SECTIONS: Rebuild the EXACT same section order and structure as the reference — adapted for this client's content.`;
  }

  if (cleanSpec) {
    const p = spec.palette || {};
    const order = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2'];
    const paletteCss = order
      .filter((k) => p[k])
      .map((k) => `  --${k}: ${p[k]};`)
      .join('\n');
    const hFont = (spec.font && spec.font.headingFont) || '';
    const bFont = (spec.font && spec.font.bodyFont) || hFont;
    const layout = spec.layout || {};
    const layoutBlock = Object.keys(layout).length
      ? `\nLAYOUT (implement each of these exactly):
• Nav: ${layout.nav || 'match reference'}
• Hero: ${layout.hero || 'match reference'}
• Body sections: ${layout.contentSections || 'match reference'}
• CTA/footer: ${layout.cta || 'match reference'}
• Grid/flex patterns: ${layout.grid || 'match reference'}`
      : '';

    designBrief = `\n\nMANDATORY DESIGN + LAYOUT SPEC (extracted pixel-by-pixel from the reference):
Full spec: ${JSON.stringify(spec)}

COLOURS — start your <style> with EXACTLY these CSS variables, use them everywhere:
:root{
${paletteCss}
}
THEME: This is a ${spec.isDark ? 'DARK' : 'LIGHT'} page — body background = var(--bg), body text = var(--text).
FONTS: Load and use Google Fonts — headings: "${hFont || 'match reference'}", body: "${bFont || 'match reference'}". Add the <link> in <head>.
STYLE: Border-radius = ${spec.radius || 'match reference'}. Buttons = ${spec.buttons || 'match reference'}. Cards = ${spec.cards || 'match reference'}. Spacing = ${spec.spacing || 'balanced'}.${layoutBlock}
DISTINCTIVE DETAILS — implement EVERY one of these:
${Array.isArray(spec.distinctive) ? spec.distinctive.map((d, i) => `${i + 1}. ${d}`).join('\n') : '(see reference)'}

Do NOT substitute your own colours, fonts, or layout. The final page must visually match the reference.`;

    if (Array.isArray(spec.sections) && spec.sections.length) {
      sectionRule =
        `SECTIONS (same order and structure as the reference — fill with this client's content):\n` +
        spec.sections.map((s, i) => `${i + 1}. ${s}`).join('\n');
    }
  } else if (spec && spec.raw) {
    designBrief = `\n\nDESIGNER NOTES FROM THE REFERENCE:\n${spec.raw}`;
  }

  const extraNote = extra ? `\n\nADDITIONAL DIRECTION: ${extra}` : '';

  const sys = `You are a world-class conversion copywriter AND senior landing-page designer. Build a complete ready-to-publish HTML sales funnel.

OUTPUT: ONLY raw HTML starting with <!DOCTYPE html>. No markdown, no fences, no commentary.
SINGLE FILE: All CSS inside one <style> tag. Load the required Google Font(s). No frameworks. Minimal vanilla JS only for FAQ accordion / smooth scroll.
${imagePolicy}

${sectionRule}

COPY: Real product name, exact price, audience, bonuses, guarantee, real numbers. No lorem ipsum. Match client's language/tone (Hinglish if description is Hinglish).
DESIGN: Premium, modern, strong hierarchy, generous spacing, hover states, fully responsive (mobile + desktop @media).${matchBlock}${designBrief}${extraNote}`;

  const userText = `CLIENT DESCRIPTION:\n"""\n${desc}\n"""\n\nDesign and build the complete sales funnel. Output ONLY the HTML document starting with <!DOCTYPE html>.`;

  // Attach the reference at build time too — image in front of it while it
  // writes CSS, on top of the hard-coded spec values.
  const content = [];
  imgRefs.forEach((r, i) => {
    content.push({
      type: 'text',
      text: `↓ REFERENCE DESIGN ${i + 1} — study the LAYOUT STRUCTURE and VISUAL STYLE carefully. Your output must replicate: section order, column layout, hero structure, nav style, spacing rhythm, colours, fonts. Rebuild 100% in CSS/SVG — do NOT embed this image.`,
    });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: r.mediaType, data: r.data },
    });
  });
  pdfRefs.forEach((r, i) => {
    content.push({
      type: 'text',
      text: `↓ REFERENCE PDF ${i + 1} ("${r.label}") — match this look & pull its content`,
    });
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: r.data },
    });
  });

  const urlList = urlRefs.map((r) => '- ' + r.data).join('\n');
  const urlBlock = urlList
    ? `\n\nREFERENCE URLs (match this kind of design & tone; you cannot open them):\n${urlList}`
    : '';

  content.push({ type: 'text', text: sys + urlBlock + '\n\n' + userText });

  return {
    messages: [{ role: 'user', content: content.length === 1 ? content[0].text : content }],
    thinkingBudget: 0, // spec already did the "thinking"
    temperature: hasRef ? 0.35 : 1, // very low → follows the spec tightly
    maxOutputTokens: 32000,
  };
}

// ── EXTRACT HTML ──
export function extractHtml(text) {
  let t = (text || '').trim();
  t = t.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim();
  const lo = t.toLowerCase();
  let st = lo.indexOf('<!doctype');
  if (st === -1) st = lo.indexOf('<html');
  if (st > 0) t = t.slice(st);
  if (!/<\/html>/i.test(t)) {
    if (!/<\/body>/i.test(t)) t += '\n</body>';
    t += '\n</html>';
  }
  return t.trim();
}
