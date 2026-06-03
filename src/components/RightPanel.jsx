import { useEffect, useRef, useState } from 'react';
import {
  Bolt,
  Monitor,
  Eye,
  Code,
  Desktop,
  Mobile,
  OpenExternal,
  Download,
  Copy,
  Refresh,
  Clock,
  ErrorCircle,
} from './Icons';
import Progress from './Progress';

export default function RightPanel({
  html,
  busy,
  error,
  hasRef,
  view,
  setView,
  device,
  setDevice,
  onRegen,
  onVariation,
  onDownload,
  onCopy,
  onOpenTab,
  onEdit,
}) {
  const iframeRef = useRef(null);
  const [editInput, setEditInput] = useState('');

  function handleEdit() {
    if (!editInput.trim()) return;
    onEdit(editInput);
    setEditInput('');
  }

  // Render the generated HTML into the iframe via a Blob URL (avoids
  // sandbox/srcdoc restrictions), exactly like the original renderFunnel().
  useEffect(() => {
    if (view !== 'prev' || !html) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    iframe.src = url;
    iframe.onload = () => {
      try {
        const h = iframe.contentDocument?.documentElement?.scrollHeight;
        if (h && h > 100) iframe.style.height = h + 'px';
      } catch (e) {
        iframe.style.height = '100%';
      }
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    return () => URL.revokeObjectURL(url);
  }, [html, view, device]);

  const showActions = !!html && !busy && !error;

  return (
    <div className="rp">
      <div className="otb">
        <div className="ott">
          <Monitor width="13" height="13" style={{ fill: 'var(--ac)' }} />
          Live Funnel Preview
        </div>

        {showActions && (
          <div className="oac">
            <div className="vtg">
              <button className={'vt' + (view === 'prev' ? ' on' : '')} onClick={() => setView('prev')}>
                <Eye />
                Preview
              </button>
              <button className={'vt' + (view === 'code' ? ' on' : '')} onClick={() => setView('code')}>
                <Code />
                Code
              </button>
            </div>

            {view === 'prev' && (
              <div className="dtg">
                <button className={'dt' + (device === 'desk' ? ' on' : '')} onClick={() => setDevice('desk')} title="Desktop">
                  <Desktop />
                </button>
                <button className={'dt' + (device === 'mob' ? ' on' : '')} onClick={() => setDevice('mob')} title="Mobile">
                  <Mobile />
                </button>
              </div>
            )}

            <button className="ob" onClick={onOpenTab}>
              <OpenExternal style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, width: 11, height: 11 }} />
              Open
            </button>
            <button className="ob" onClick={onDownload}>
              <Download style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, width: 11, height: 11 }} />
              Download
            </button>
            <button className="ob pri" onClick={onCopy}>
              <Copy />
              Copy HTML
            </button>
          </div>
        )}
      </div>

      <div className="ob2" style={html && !busy && !error ? { padding: 0 } : undefined}>
        {/* EMPTY STATE */}
        {!html && !busy && !error && (
          <div className="empty">
            <div className="empty-ic">
              <Bolt />
            </div>
            <div className="empty-t">Funnel preview will appear here</div>
            <div className="empty-d">
              Paste a description, optionally add references, then click Generate — AI will build a complete landing page.
            </div>
            <div className="steps">
              <div className="srow">
                <div className="sn">1</div>
                <div className="st">Paste client description</div>
              </div>
              <div className="srow">
                <div className="sn">2</div>
                <div className="st">Add references (optional)</div>
              </div>
              <div className="srow">
                <div className="sn">3</div>
                <div className="st">Generate — live preview instantly</div>
              </div>
            </div>
          </div>
        )}

        {/* PROGRESS */}
        {busy && <Progress hasRef={hasRef} />}

        {/* ERROR */}
        {error && !busy && (
          <div
            style={{
              padding: 16,
              fontSize: 12.5,
              color: 'var(--re)',
              background: 'rgba(240,82,82,.08)',
              border: '1px solid rgba(240,82,82,.2)',
              borderRadius: 'var(--r)',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <ErrorCircle width="14" height="14" style={{ fill: 'var(--re)' }} />
            Error: {error}
          </div>
        )}

        {/* FUNNEL RESULT */}
        {html && !busy && !error && (
          <>
            <div className="preview-shell" style={{ display: view === 'prev' ? 'flex' : 'none' }}>
              <div className="preview-bar">
                <div className="pb-dots">
                  <div className="pb-dot r"></div>
                  <div className="pb-dot y"></div>
                  <div className="pb-dot g"></div>
                </div>
                <div className="pb-url">funnel-preview — Generated by FunnelCraft AI</div>
              </div>
              <div className={'preview-scroll ' + device}>
                <iframe id="pf" ref={iframeRef} title="Funnel preview" sandbox="allow-scripts allow-popups" />
              </div>
            </div>

            <div className="code-wrap" style={{ display: view === 'code' ? 'block' : 'none' }}>
              <pre>{html}</pre>
            </div>
          </>
        )}
      </div>

      {showActions && (
        <div className="edit-bar">
          <input
            className="edit-inp"
            placeholder='Edit layout in any language... e.g. "Hero dark karo", "Add FAQ", "Button orange karo", "હીરો સેક્શન બદલો"'
            value={editInput}
            onChange={(e) => setEditInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleEdit()}
          />
          <button className="edit-btn" onClick={handleEdit} disabled={!editInput.trim()}>
            Apply ↗
          </button>
        </div>
      )}

      {showActions && (
        <div className="bbar">
          <button className="bb" onClick={onRegen}>
            <Refresh style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }} />
            Regenerate
          </button>
          <button className="bb ac" onClick={() => onVariation('new_design')}>
            <Clock style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }} />
            New Design ↗
          </button>
          <button className="bb" onClick={() => onVariation('mobile')}>
            <Mobile style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2 }} />
            Mobile First ↗
          </button>
          <button className="bb" onClick={() => onVariation('punchy')}>
            <Bolt />
            More Persuasive ↗
          </button>
        </div>
      )}
    </div>
  );
}
