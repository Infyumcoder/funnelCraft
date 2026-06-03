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
      // Non-JSON usually means the backend server is not running (Vite proxy returns 502 HTML)
      // or the server crashed. Give the user an actionable message.
      const hint =
        res.status === 502 || res.status === 503 || res.status === 0
          ? 'Backend server is not running. Open a second terminal and run: node server.cjs'
          : `Server returned a non-JSON response (HTTP ${res.status}). Try restarting node server.cjs.`;
      data = { error: hint };
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
    text: `You are a senior UI/CSS engineer AND content analyst. Study the reference design(s) above PIXEL BY PIXEL.
SAMPLE REAL COLOURS from the pixels — true hex values, no guesses.
Return ONLY raw JSON (no markdown, no commentary) in EXACTLY this shape:
{
 "mood":"2-4 words",
 "palette":{"bg":"#hex","surface":"#hex","text":"#hex","muted":"#hex","accent":"#hex","accent2":"#hex"},
 "isDark": true|false,
 "font":{"headingFont":"exact Google Font name","bodyFont":"exact Google Font name","feel":"e.g. bold condensed"},
 "radius":"sharp|slightly-rounded|rounded|pill",
 "buttons":"describe shape, fill colour, text colour, border, shadow",
 "cards":"describe borders, shadow, background fill, inner layout",
 "spacing":"tight|balanced|airy",
 "layout":{
   "nav":"exact nav CSS description — e.g. position:fixed; display:flex; justify-content:space-between; background:rgba(0,0,0,0.9); padding:0 60px; height:70px",
   "hero":"exact hero CSS layout — e.g. display:grid; grid-template-columns:55% 45%; min-height:90vh; padding:80px 60px — plus describe: background type, text alignment, CTA position",
   "contentSections":"describe each body section CSS pattern — e.g. section 2: display:flex; flex-direction:row-reverse; gap:60px; section 3: display:grid; grid-template-columns:repeat(3,1fr); gap:32px",
   "cta":"CTA/footer section layout — e.g. text-align:center; padding:120px 60px; background:linear-gradient(...)",
   "grid":"main grid/flex patterns — e.g. max-width:1200px; margin:0 auto; sections use 80px top/bottom padding",
   "images":"every image slot with its CSS — e.g. hero right col: width:100%; height:500px; object-fit:cover; border-radius:20px"
 },
 "cssSnippets":{
   "heroSection":"copy-paste ready CSS for the hero section — background, display, grid-template-columns, padding, min-height, gap — be exact",
   "navBar":"copy-paste ready CSS for the navbar — position, display, justify-content, background, padding, height, z-index",
   "featureCards":"copy-paste ready CSS for feature/benefit cards — display, grid-template-columns or flex, background, border-radius, padding, box-shadow",
   "ctaSection":"copy-paste ready CSS for the final CTA section — background, padding, text-align",
   "colorVars":":root { --bg: #hex; --surface: #hex; --text: #hex; --accent: #hex; --accent2: #hex; }"
 },
 "sections":["exact section names top-to-bottom as they appear in the reference"],
 "distinctive":["8-10 unique CSS/visual details — be very specific e.g. 'hero uses clip-path:polygon(0 0,100% 0,100% 88%,0 100%)', 'cards have border-left:4px solid accent', 'price box glows with box-shadow:0 0 40px accent'"],
 "extractedContent":{
   "productName": "exact product/service name or null",
   "price": "exact price with currency or null",
   "heroHeadline": "exact headline text or null",
   "heroSubhead": "exact subheadline or null",
   "benefits": ["all readable benefit/feature bullets"],
   "testimonials": [{"name": "name", "quote": "quote text"}],
   "guarantee": "guarantee text or null",
   "ctaText": "CTA button text or null",
   "targetAudience": "target audience description or null",
   "bonuses": ["bonus names/descriptions"],
   "language": "English|Hindi|Hinglish|Gujarati|other"
 }
}`,
  });

  const data = await apiGenerate(
    { messages: [{ role: 'user', content }], maxOutputTokens: 8000, thinkingBudget: 0 },
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

  const extraNote = extra ? `\n\nADDITIONAL DIRECTION: ${extra}` : '';

  // ── Shared animation JS (injected into both paths) ──
  const animJS = `<script>
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
<\/script>`;

  // ── Build sys prompt & userText depending on ref presence ──
  let sys, userText;

  if (hasRef) {
    // ── REF PATH: short, focused prompt — let the image do the talking ──
    // The longer the prompt, the more the model defaults to its trained patterns.
    // With a reference image, keep instructions minimal so the visual signal dominates.

    // Build spec hints (only if analysis succeeded)
    let specHints = '';
    if (cleanSpec) {
      const p = spec.palette || {};
      const css = spec.cssSnippets || {};
      const hFont = (spec.font && spec.font.headingFont) || '';
      const bFont = (spec.font && spec.font.bodyFont) || hFont;
      const sections = Array.isArray(spec.sections) && spec.sections.length
        ? 'Sections in this EXACT order: ' + spec.sections.join(' → ')
        : '';
      const distinctive = Array.isArray(spec.distinctive) && spec.distinctive.length
        ? 'Visual details — replicate exactly:\n' + spec.distinctive.slice(0, 8).map((d, i) => `${i + 1}. ${d}`).join('\n')
        : '';

      // Build a mandatory CSS block the model must paste verbatim
      const mandatoryCSS = [];
      if (css.colorVars) {
        mandatoryCSS.push(css.colorVars);
      } else if (Object.keys(p).length) {
        mandatoryCSS.push(`:root{${['bg','surface','text','muted','accent','accent2'].filter(k=>p[k]).map(k=>`--${k}:${p[k]}`).join(';')}}`);
      }
      if (css.navBar)       mandatoryCSS.push(css.navBar);
      if (css.heroSection)  mandatoryCSS.push(css.heroSection);
      if (css.featureCards) mandatoryCSS.push(css.featureCards);
      if (css.ctaSection)   mandatoryCSS.push(css.ctaSection);

      const mandatoryBlock = mandatoryCSS.length
        ? `━━━ MANDATORY CSS — COPY VERBATIM INTO <style> TAG ━━━\n${mandatoryCSS.join('\n')}\n━━━ END MANDATORY CSS ━━━`
        : '';

      specHints = [
        hFont && `FONTS: heading="${hFont}"${bFont && bFont !== hFont ? ` body="${bFont}"` : ''} — load from Google Fonts`,
        spec.isDark !== undefined && `THEME: ${spec.isDark ? 'dark' : 'light'} background`,
        mandatoryBlock,
        sections,
        distinctive,
      ].filter(Boolean).join('\n\n');
    }

    sys = `You are an expert HTML/CSS developer. Your task: generate a complete, ready-to-publish HTML sales funnel page.

OUTPUT RULES:
• Raw HTML only — start with <!DOCTYPE html>, no markdown, no code fences
• Single file — all CSS in one <style> tag, no external frameworks
• Fully responsive — mobile-first, with @media (min-width:768px) for desktop
• Real copy only — no placeholder text, no lorem ipsum
• Match client language/tone (Hinglish/Gujarati/English — whatever the description uses)

IMAGES:
${imagePolicy}

ANIMATIONS (add to every section):
CSS: .animate{opacity:0;transform:translateY(32px);transition:opacity .6s ease,transform .6s ease} .animate.visible{opacity:1;transform:none} @keyframes heroIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
JS before </body>: ${animJS}
Apply: hero headline/subhead → style="animation:heroIn .8s ease both" | every card/heading/testimonial → class="animate" | stat numbers → data-count="500" data-suffix="+"
${specHints ? '\n' + specHints : ''}${extraNote}`;

    userText = `CLIENT DESCRIPTION:
"""
${desc}
"""

Now generate the complete HTML sales funnel that matches the reference design shown directly above. Use all the client content from the description. Output ONLY the HTML document starting with <!DOCTYPE html>.`;

  } else {
    // ── NO-REF PATH: full detailed prompt ──
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
  ${animJS}

Apply animation classes exactly like this:
• Hero headline + subhead: add style="animation:heroIn .8s ease both"
• Every section heading (h2, h3): add class="animate"
• Every feature/benefit card: add class="animate"
• Every testimonial card: add class="animate"
• Pricing/offer box: add class="animate anim-scale"
• Left column in 2-col sections: add class="animate anim-left"
• Right column in 2-col sections: add class="animate anim-right"
• FAQ items: add class="animate"
• Stat numbers: <span data-count="500" data-suffix="+">500+</span>
• Primary CTA buttons: pulsing glow @keyframes using accent colour (infinite, 2.5s)
• All cards: CSS transition + translateY(-5px) + deeper shadow on :hover
• All buttons: translateY(-2px) + shadow on :hover, scale(.97) on :active`;

    const funnelLayoutRules = `

SALES FUNNEL LAYOUT RULES (mandatory):
• HERO: 2-column desktop — headline/subhead/CTA LEFT (55%), ${hasHero ? `client photo src="${CLIENT_PLACEHOLDER.hero}"` : 'relevant person/product photo'} RIGHT (45%). Mobile: stacked.
• COACH/ABOUT: photo LEFT (38%), bio RIGHT (62%).
• FEATURES: alternating left-right rows for 2-4 items; 3-col icon grid for 5+.
• TESTIMONIALS: card grid — avatar LEFT, quote+name RIGHT, stars visible.
• OFFER/PRICING: value stack LEFT, price box+CTA RIGHT. Price box has accent border/glow.
• Every section needs a visual element — no wall-of-text sections.
• Sticky nav with prominent CTA button.`;

    sys = `You are a world-class conversion copywriter AND senior landing-page designer. Build a complete ready-to-publish HTML sales funnel.

OUTPUT: ONLY raw HTML starting with <!DOCTYPE html>. No markdown, no fences, no commentary.
SINGLE FILE: All CSS inside one <style> tag. Load the required Google Font(s). No frameworks. Minimal vanilla JS only for FAQ accordion / smooth scroll / animations.
${imagePolicy}

${defaultSections}

COPY: Real product name, exact price, audience, bonuses, guarantee, real numbers. No lorem ipsum. Match client's language/tone (Hinglish if description is Hinglish).
DESIGN: Premium, modern, strong hierarchy, generous spacing, hover states, fully responsive (mobile + desktop @media).${funnelLayoutRules}${animationBlock}${extraNote}`;

    userText = `CLIENT DESCRIPTION:\n"""\n${desc}\n"""\n\nDesign and build the complete sales funnel. Output ONLY the HTML document starting with <!DOCTYPE html>.`;
  }

  const urlList = urlRefs.map((r) => '- ' + r.data).join('\n');
  const urlBlock = urlList
    ? `\n\nREFERENCE URLs (match this kind of design & tone; you cannot open them):\n${urlList}`
    : '';

  // ── Build content array: sys prompt FIRST, reference image(s) LAST ──
  // Placing the image right before the generation instruction gives the model
  // the strongest visual signal at the point it starts writing HTML.
  const content = [];

  // 1. Full system prompt
  content.push({ type: 'text', text: sys + urlBlock });

  // 2. PDF references
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

  // 3. Image references — placed LAST so the model sees them immediately
  //    before it starts writing HTML. This prevents the visual signal from
  //    being buried under the system prompt text.
  imgRefs.forEach((r, i) => {
    content.push({
      type: 'text',
      text: `↓ REFERENCE DESIGN IMAGE ${i + 1} — The HTML you write must visually replicate THIS layout. Look at the exact grid structure, hero layout, section order, colours, fonts, card styles. Replace any photos/people in the reference with relevant Unsplash stock photos in the same position and size. Do NOT embed this reference image itself.`,
    });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: r.mediaType, data: r.data },
    });
  });

  // 4. Client description + generation trigger — immediately after the image
  content.push({ type: 'text', text: userText });

  return {
    messages: [{ role: 'user', content: content.length === 1 ? content[0].text : content }],
    thinkingBudget: hasRef ? 6144 : 0,
    temperature: hasRef ? 0.5 : 1, // moderate — enough creativity to replicate the ref, not so low it defaults to trained patterns
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
