import { useCallback, useRef, useState } from 'react';
import Nav from './components/Nav';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import Toast from './components/Toast';
import { VARIATION_PROMPTS } from './lib/data';
import { apiGenerate, analyzeReferences, buildMessages, buildDescriptionFromContent, editFunnel, extractHtml, CLIENT_PLACEHOLDER } from './lib/generate';

export default function App() {
  const [desc, setDesc] = useState('');
  const [refs, setRefs] = useState([]);           // [{type,data,mediaType,label,dataUrl,size}]
  const [clientImages, setClientImages] = useState([]); // [{id,role,label,dataUrl,base64,mediaType}]
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('prev'); // 'prev' | 'code'
  const [device, setDevice] = useState('desk'); // 'desk' | 'mob'

  const [toastMsg, setToastMsg] = useState('Done!');
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef(null);

  const lastDesc = useRef('');
  // Cached design spec (so Regenerate / variations reuse it — 1 request).
  const refSpec = useRef(null);
  const refSig = useRef('');

  const toast = useCallback((m) => {
    setToastMsg(m);
    setToastShow(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 2400);
  }, []);

  const refsSig = () => refs.map((r) => r.type + ':' + r.label + ':' + r.size).join('|');

  async function getSpec() {
    if (!refs.some((r) => r.type === 'image' || r.type === 'pdf')) {
      refSpec.current = null;
      refSig.current = '';
      return null;
    }
    const sig = refsSig();
    if (refSpec.current && sig === refSig.current) return refSpec.current; // cached
    refSpec.current = await analyzeReferences(refs, toast);
    refSig.current = sig;
    return refSpec.current;
  }

  async function runGen(description, extra) {
    setBusy(true);
    setError('');
    setHtml('');

    let effectiveDesc = description;

    try {
      // STEP 1 — get a design spec + extracted content from the reference (cached).
      let spec = null;
      try {
        const hasImages = refs.some((r) => r.type === 'image' || r.type === 'pdf');
        if (hasImages) toast('Analysing your reference images…');
        spec = await getSpec();
      } catch (e) {
        if (/limit|quota|overloaded/i.test(e.message)) throw e;
        spec = null;
      }

      // If description was empty, try to auto-fill from extracted content in the images.
      if (!effectiveDesc && spec?.extractedContent) {
        const autoDesc = buildDescriptionFromContent(spec.extractedContent);
        if (autoDesc) {
          effectiveDesc = autoDesc;
          setDesc(autoDesc);
          toast('Content extracted from your images!');
        }
      }

      if (!effectiveDesc) {
        throw new Error('Please paste a description OR upload reference images with readable content.');
      }

      // STEP 2 — build the funnel HTML with the spec hard-coded in.
      const payload = buildMessages(effectiveDesc, extra, spec, refs, clientImages);
      const data = await apiGenerate(payload, toast);
      const text = (data.content || []).map((b) => b.text || '').join('');
      if (!text.trim()) throw new Error(data.error?.message || 'Empty response. Please try again.');

      // Replace client image placeholders with actual base64 data URIs
      let generatedHtml = extractHtml(text);
      clientImages.forEach((img) => {
        const ph = CLIENT_PLACEHOLDER[img.role];
        if (ph) {
          const dataUri = `data:${img.mediaType || 'image/jpeg'};base64,${img.base64}`;
          generatedHtml = generatedHtml.replaceAll(ph, dataUri);
        }
      });
      setHtml(generatedHtml);
      setView('prev');
      toast('Funnel ready! Desktop + Mobile preview available.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function generate() {
    const d = desc.trim();
    const hasImages = refs.some((r) => r.type === 'image' || r.type === 'pdf');
    if (!d && !hasImages) {
      toast('Please paste a description or upload reference images!');
      return;
    }
    lastDesc.current = d;
    runGen(d, null);
  }
  function regen() {
    if (lastDesc.current) runGen(lastDesc.current, null);
  }
  function variation(v) {
    if (lastDesc.current) runGen(lastDesc.current, VARIATION_PROMPTS[v]);
  }

  async function applyEdit(instruction) {
    if (!html || !instruction.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await editFunnel(html, instruction.trim(), toast);
      if (!updated.trim()) throw new Error('Empty response. Please try again.');
      setHtml(extractHtml(updated));
      toast('Layout updated!');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ── EXPORT actions ──
  function dlHtml() {
    if (!html) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'funnel.html';
    a.click();
    toast('funnel.html downloaded!');
  }
  function cpCode() {
    if (!html) return;
    navigator.clipboard.writeText(html).then(() => toast('Full HTML copied!'));
  }
  function openTab() {
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return (
    <>
      <Nav />
      <div className="shell">
        <LeftPanel
          desc={desc}
          setDesc={setDesc}
          refs={refs}
          setRefs={setRefs}
          clientImages={clientImages}
          setClientImages={setClientImages}
          onGenerate={generate}
          busy={busy}
          toast={toast}
        />
        <RightPanel
          html={html}
          busy={busy}
          error={error}
          hasRef={refs.length > 0}
          view={view}
          setView={setView}
          device={device}
          setDevice={setDevice}
          onRegen={regen}
          onVariation={variation}
          onDownload={dlHtml}
          onCopy={cpCode}
          onOpenTab={openTab}
          onEdit={applyEdit}
        />
      </div>
      <Toast message={toastMsg} show={toastShow} />
    </>
  );
}
