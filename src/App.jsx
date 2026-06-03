import { useCallback, useRef, useState } from 'react';
import Nav from './components/Nav';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import Toast from './components/Toast';
import { VARIATION_PROMPTS } from './lib/data';
import { apiGenerate, analyzeReferences, buildMessages, extractHtml } from './lib/generate';

export default function App() {
  const [desc, setDesc] = useState('');
  const [refs, setRefs] = useState([]); // [{type,data,mediaType,label,dataUrl,size}]
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

    try {
      // STEP 1 — get a design spec from the reference (cached; skipped if none).
      let spec = null;
      try {
        spec = await getSpec();
      } catch (e) {
        if (/limit|quota/i.test(e.message)) throw e; // don't burn a 2nd request
        spec = null;
      }
      // STEP 2 — build the funnel HTML, with the spec hard-coded in.
      const payload = buildMessages(description, extra, spec, refs);
      const data = await apiGenerate(payload, toast);
      const text = (data.content || []).map((b) => b.text || '').join('');
      if (!text.trim()) throw new Error(data.error?.message || 'Empty response. Please retry.');
      setHtml(extractHtml(text));
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
    if (!d) {
      toast('Please paste a description first!');
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
        />
      </div>
      <Toast message={toastMsg} show={toastShow} />
    </>
  );
}
