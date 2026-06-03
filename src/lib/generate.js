// ── Core generation logic, ported from the original index.html <script>. ──
// The behaviour is identical; only the surrounding UI moved to React.

// ── PLACEHOLDER TAGS for client-provided images ──
// The AI writes these placeholder strings as img src values.
// App.jsx replaces them with actual base64 data URIs after generation.
export const CLIENT_PLACEHOLDER = {
  hero:    '__CIMG_HERO__',
  coach:   '__CIMG_COACH__',
  product: '__CIMG_PRODUCT__',
  logo:    '__CIMG_LOGO__',
  bonus:   '__CIMG_BONUS__',
  team:    '__CIMG_TEAM__',
};

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
    text: `You are a senior UI/layout engineer AND content analyst. Study the reference design(s) above PIXEL BY PIXEL. Extract BOTH the complete visual design system AND all readable business content from the pages.
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
   "grid":"CSS grid/flex patterns used — e.g. 12-col grid, card grids are repeat(3,1fr) gap-24px",
   "images":"describe every image slot in the design — e.g. 'hero: full-width background photo of a person coaching', 'features: 3 small square photos in a row', 'testimonials: circular avatar photos 60px'"
 },
 "sections":["section names top-to-bottom that the reference uses"],
 "distinctive":["5-8 specific layout + visual details that make this design unique — be precise, e.g. 'hero has a diagonal clip-path divider', 'nav has a coloured left border accent', 'price box has a 3px glowing border'"],
 "extractedContent":{
   "productName": "exact product/service/course name if clearly readable in the image, else null",
   "price": "exact price with currency symbol if visible (e.g. ₹4,999 or $297), else null",
   "heroHeadline": "exact main headline text if clearly readable, else null",
   "heroSubhead": "exact subheadline/tagline if readable, else null",
   "benefits": ["readable benefit points, feature bullets, or module names from the page — list all you can read"],
   "testimonials": [{"name": "person name if visible", "quote": "testimonial text if readable"}],
   "guarantee": "guarantee text if visible (e.g. '30-day money back'), else null",
   "ctaText": "primary CTA button text if readable, else null",
   "targetAudience": "who this product is for — infer from headlines/copy if possible, else null",
   "bonuses": ["bonus names/descriptions if listed on the page"],
   "language": "detected language of the page content: English/Hindi/Hinglish/Gujarati/other"
 }
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

// ── Build a plain-text description from content extracted out of reference images ──
export function buildDescriptionFromContent(c) {
  if (!c) return '';
  const lines = [];
  if (c.productName) lines.push('Product/Service: ' + c.productName);
  if (c.price) lines.push('Price: ' + c.price);
  if (c.targetAudience) lines.push('Target Audience: ' + c.targetAudience);
  if (c.heroHeadline) lines.push('Main Headline: ' + c.heroHeadline);
  if (c.heroSubhead) lines.push('Subheadline: ' + c.heroSubhead);
  if (Array.isArray(c.benefits) && c.benefits.length)
    lines.push('Key Benefits / Features:\n' + c.benefits.map((b) => '- ' + b).join('\n'));
  if (Array.isArray(c.bonuses) && c.bonuses.length)
    lines.push('Bonuses:\n' + c.bonuses.map((b) => '- ' + b).join('\n'));
  if (Array.isArray(c.testimonials) && c.testimonials.length)
    lines.push(
      'Testimonials:\n' +
        c.testimonials.map((t) => `- ${t.name || 'Customer'}: "${t.quote}"`).join('\n')
    );
  if (c.guarantee) lines.push('Guarantee: ' + c.guarantee);
  if (c.ctaText) lines.push('CTA Button: ' + c.ctaText);
  if (c.language && c.language !== 'English') lines.push('Tone/Language: ' + c.language);
  return lines.join('\n\n');
}

// ── STEP 2: BUILD THE HTML, DRIVEN BY THE SPEC + THE REFERENCE ──
export function buildMessages(desc, extra, spec, refs, clientImages = []) {
  const imgRefs = refs.filter((r) => r.type === 'image');
  const pdfRefs = refs.filter((r) => r.type === 'pdf');
  const urlRefs = refs.filter((r) => r.type === 'url');
  const hasRef = imgRefs.length > 0 || pdfRefs.length > 0;
  const cleanSpec = spec && !spec.raw && spec.palette;

  // ── Which client image roles were provided ──
  const hasHero    = clientImages.some((i) => i.role === 'hero');
  const hasCoach   = clientImages.some((i) => i.role === 'coach');
  const hasProduct = clientImages.some((i) => i.role === 'product');
  const hasLogo    = clientImages.some((i) => i.role === 'logo');

  // ── Client image placeholder block ──
  const roleDesc = {
    hero:    'HERO SECTION — place image on the RIGHT side of a 2-column hero (text LEFT 55%, image RIGHT 45%)',
    coach:   'ABOUT/COACH SECTION — place image on the LEFT (38%), bio/credentials on the RIGHT (62%)',
    product: 'PRODUCT SHOWCASE SECTION — display as the main product visual',
    logo:    'NAV/HEADER — use as the brand logo <img>',
    bonus:   'BONUS SECTION — display next to the bonus name/description',
    team:    'TEAM SECTION — use as the team photo',
  };

  let clientImgBlock = '';
  if (clientImages.length > 0) {
    clientImgBlock = `\n\nCLIENT PHOTOS PROVIDED — use EXACTLY these placeholder strings as the img src attribute. They are auto-replaced with real photos at render time:
${clientImages.map((img) => {
  const ph = CLIENT_PLACEHOLDER[img.role] || ('__CIMG_' + img.role.toUpperCase() + '__');
  const pos = roleDesc[img.role] || img.role.toUpperCase() + ' section';
  return `• ${img.role.toUpperCase()} IMAGE ("${img.label}"): src="${ph}"\n  → Position: ${pos}\n  → Style: width:100%, height:100%, object-fit:cover, same border-radius as design`;
}).join('\n')}
CRITICAL RULES FOR CLIENT IMAGES:
• Use ONLY the placeholder string above as the src — do NOT use Unsplash, picsum, or pravatar for any section that has a client image placeholder.
• The placeholder string must appear EXACTLY as written (e.g. src="${CLIENT_PLACEHOLDER.hero}") — any modification breaks the image substitution.
• Add appropriate alt text based on the label.`;
  }

  const imagePolicy = `IMAGES: Use real stock photos for sections where no client image is provided.
${hasHero ? `• Hero image: USE CLIENT PLACEHOLDER src="${CLIENT_PLACEHOLDER.hero}" — do NOT use Unsplash for hero.` : '• Hero: use a relevant Unsplash photo (person/coach/product).'}
${hasCoach ? `• Coach/About photo: USE CLIENT PLACEHOLDER src="${CLIENT_PLACEHOLDER.coach}".` : '• Coach/About: use an Unsplash photo of a professional person.'}
${hasProduct ? `• Product image: USE CLIENT PLACEHOLDER src="${CLIENT_PLACEHOLDER.product}".` : '• Product: use relevant Unsplash product photo.'}
${hasLogo ? `• Logo: USE CLIENT PLACEHOLDER src="${CLIENT_PLACEHOLDER.logo}" in the nav.` : ''}
For ALL OTHER image slots (testimonial avatars, feature icons, background accents):
• Unsplash: https://images.unsplash.com/photo-PHOTO_ID?w=WIDTH&h=HEIGHT&fit=crop&auto=format (use real, contextually relevant photo IDs)
• Avatars: https://i.pravatar.cc/SIZE?img=NUMBER (1–70)
• Always add width, height, alt, object-fit:cover. Add onerror="this.style.opacity=0".
• Do NOT use picsum.photos.${clientImgBlock}`;

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
• Grid/flex patterns: ${layout.grid || 'match reference'}
• Image placements: ${layout.images || 'use Unsplash stock photos wherever reference shows images'}`
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

  const animationBlock = `

SCROLL ANIMATIONS — implement in every funnel (mandatory):
Add these CSS rules inside your <style> tag:
  .animate{opacity:0;transform:translateY(36px);transition:opacity .65s ease,transform .65s ease}
  .animate.visible{opacity:1;transform:translateY(0)!important}
  .anim-left{transform:translateX(-44px)!important}
  .anim-right{transform:translateX(44px)!important}
  .anim-scale{transform:scale(.91)!important}
  .animate:nth-child(2){transition-delay:.09s}.animate:nth-child(3){transition-delay:.18s}.animate:nth-child(4){transition-delay:.27s}.animate:nth-child(5){transition-delay:.36s}.animate:nth-child(6){transition-delay:.45s}
  @keyframes heroIn{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}

Add this JS block just before </body>:
  <script>
  (function(){
    var io=new IntersectionObserver(function(ee){ee.forEach(function(e){if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target);}});},{threshold:0.11});
    document.querySelectorAll('.animate').forEach(function(el){io.observe(el);});
    document.querySelectorAll('[data-count]').forEach(function(el){
      var io2=new IntersectionObserver(function(ee){if(!ee[0].isIntersecting)return;io2.unobserve(el);
        var end=+el.getAttribute('data-count'),sfx=el.getAttribute('data-suffix')||'',cur=0,
            t=setInterval(function(){cur+=end/55;if(cur>=end){cur=end;clearInterval(t);}el.textContent=Math.round(cur).toLocaleString()+sfx;},28);
      },{threshold:.5});
      io2.observe(el);
    });
  })();
  </script>

Apply animation classes exactly like this:
• Hero headline + subhead: add style="animation:heroIn .8s ease both" (plays on page load, no observer)
• Every section heading (h2, h3): add class="animate"
• Every feature/benefit card: add class="animate"
• Every testimonial/review card: add class="animate"
• Pricing/offer box: add class="animate anim-scale"
• Left column in 2-col sections: add class="animate anim-left"
• Right column in 2-col sections: add class="animate anim-right"
• FAQ items: add class="animate"
• Stat numbers: <span data-count="500" data-suffix="+">500+</span> (JS counts up on scroll)
• Primary CTA buttons: add a pulsing glow @keyframes animation using the accent colour (repeat:infinite, 2.5s cycle)
• All cards/feature boxes: add CSS transition + translateY(-5px) + deeper shadow on :hover
• All buttons: translateY(-2px) + shadow on :hover, scale(.97) on :active`;

  const funnelLayoutRules = `

SALES FUNNEL LAYOUT RULES (mandatory — this is a SALES FUNNEL, not a generic website):
• HERO: Always 2-column on desktop — headline/subhead/CTA LEFT (55%), ${hasHero ? 'client photo (placeholder above)' : 'relevant person/product photo'} RIGHT (45%). NEVER a full-width centered text-only hero. Mobile: stacked (content above, image below).
• COACH / ABOUT: 2-column — photo LEFT (38%), bio/credentials/social proof RIGHT (62%). Mobile: photo stacked above text.
• FEATURES / BENEFITS: Use alternating left-right rows for 2-4 items (visual one side, text other side). Use a 3-col icon+text grid for 5+ items. NEVER a text-only list.
• TESTIMONIALS: Card grid — each card: avatar image LEFT, quote text + name RIGHT. Stars rating visible.
• OFFER / PRICING: 2-column — value stack + bonus list LEFT, price box + CTA button RIGHT. Price box has accent border / glow.
• PROBLEM SECTION: 2-col or alternating, with a visual or icon on one side.
• DO NOT render any major section as a centered full-width wall of text — every section must have a visual element (image, icon, illustration, or decorative shape) alongside the copy.
• Sticky nav must stay fixed at top with a prominent CTA button.`;

  const sys = `You are a world-class conversion copywriter AND senior landing-page designer. Build a complete ready-to-publish HTML sales funnel.

OUTPUT: ONLY raw HTML starting with <!DOCTYPE html>. No markdown, no fences, no commentary.
SINGLE FILE: All CSS inside one <style> tag. Load the required Google Font(s). No frameworks. Minimal vanilla JS only for FAQ accordion / smooth scroll / animations.
${imagePolicy}

${sectionRule}

COPY: Real product name, exact price, audience, bonuses, guarantee, real numbers. No lorem ipsum. Match client's language/tone (Hinglish if description is Hinglish).
DESIGN: Premium, modern, strong hierarchy, generous spacing, hover states, fully responsive (mobile + desktop @media).${funnelLayoutRules}${matchBlock}${designBrief}${animationBlock}${extraNote}`;

  const userText = `CLIENT DESCRIPTION:\n"""\n${desc}\n"""\n\nDesign and build the complete sales funnel. Output ONLY the HTML document starting with <!DOCTYPE html>.`;

  // Attach the reference at build time too — image in front of it while it
  // writes CSS, on top of the hard-coded spec values.
  const content = [];
  imgRefs.forEach((r, i) => {
    content.push({
      type: 'text',
      text: `↓ REFERENCE DESIGN ${i + 1} — study this carefully. Your output must replicate: section order, column layout, hero structure, nav style, spacing rhythm, colours, fonts. Where the reference uses photos or images, use relevant Unsplash stock photos (same position, same size, same style). Do NOT embed this reference image itself.`,
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
    // Give the model a small thinking budget when refs are present so it can
    // reconcile the extracted spec with the reference image before writing HTML.
    // No refs → no thinking needed (saves latency).
    thinkingBudget: hasRef ? 2048 : 0,
    temperature: hasRef ? 0.35 : 1, // very low → follows the spec tightly
    maxOutputTokens: 32000,
  };
}

// ── STEP 3 (optional): EDIT AN EXISTING FUNNEL ──
export async function editFunnel(currentHtml, instruction, onToast) {
  // Strip data: URIs from the HTML before sending to the model.
  // Large base64 blobs waste tokens and can cause truncation.
  // We restore them after the model replies.
  const imageMap = {};
  let imgIdx = 0;
  const strippedHtml = currentHtml.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]*/g, (match) => {
    const key = `__DURI_${imgIdx++}__`;
    imageMap[key] = match;
    return key;
  });

  const content = `You are a senior HTML/CSS/JS developer editing an existing sales funnel landing page.

USER'S EDIT INSTRUCTION (understand this in ANY language — English, Hindi, Gujarati, Hinglish, or any mix):
"""
${instruction}
"""

STRICT RULES:
1. Understand the instruction in ANY language.
2. Make ONLY the specific changes described — preserve everything else EXACTLY as-is.
3. Keep ALL __DURI_N__ placeholder strings EXACTLY as written — they are image data that will be restored automatically. Do NOT remove or alter them.
4. Preserve ALL existing CSS, JS, sections, fonts, colors, and layout not mentioned.
5. Output the COMPLETE updated HTML document starting with <!DOCTYPE html> — never truncate.
6. No markdown, no code fences, no explanation — raw HTML only.

CURRENT HTML TO EDIT:
${strippedHtml}`;

  const data = await apiGenerate(
    { messages: [{ role: 'user', content }], maxOutputTokens: 32000, thinkingBudget: 0, temperature: 0.2 },
    onToast
  );
  let result = (data.content || []).map((b) => b.text || '').join('');

  // Restore all stripped data: URIs
  Object.entries(imageMap).forEach(([key, val]) => {
    result = result.replaceAll(key, val);
  });

  return result;
}
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
