import { useState } from 'react';
import { ImageIcon, PdfIcon, LinkIcon, Info, Close } from './Icons';
import { downscaleImage, readFileAsDataURL } from '../lib/image';

export default function ReferencePanel({ refs, setRefs, toast }) {
  const [tab, setTab] = useState('img');
  const [urlVal, setUrlVal] = useState('');
  const [dragId, setDragId] = useState(null);

  async function processFile(file, type) {
    // Use the freshest refs length via functional guard below.
    let blocked = false;
    setRefs((prev) => {
      if (prev.length >= 10) {
        blocked = true;
        return prev;
      }
      return prev;
    });
    if (blocked) {
      toast('Maximum 10 references add thai gaya!');
      return;
    }

    const dataUrl = await readFileAsDataURL(file);
    if (type === 'image') {
      // Downscale big images so up to 10 references stay within the model's
      // ~20MB inline limit. 1600px is plenty of detail for design study.
      const smallUrl = await downscaleImage(dataUrl);
      const base64 = smallUrl.split(',')[1];
      const mb = (base64.length * 0.75 / 1024 / 1024).toFixed(1) + 'MB';
      setRefs((prev) =>
        prev.length >= 10
          ? prev
          : [
              ...prev,
              { type, data: base64, mediaType: 'image/jpeg', label: file.name, dataUrl: smallUrl, size: mb },
            ]
      );
      toast(file.name + ' added!');
    } else {
      const base64 = dataUrl.split(',')[1];
      setRefs((prev) =>
        prev.length >= 10
          ? prev
          : [
              ...prev,
              {
                type,
                data: base64,
                mediaType: file.type,
                label: file.name,
                dataUrl,
                size: (file.size / 1024 / 1024).toFixed(1) + 'MB',
              },
            ]
      );
      toast(file.name + ' added!');
    }
  }

  function fileIn(e, type) {
    [...e.target.files].forEach((f) => processFile(f, type));
    e.target.value = ''; // allow re-selecting the same file
  }

  function dzDrop(e, type) {
    e.preventDefault();
    setDragId(null);
    [...e.dataTransfer.files].forEach((f) => processFile(f, type));
  }

  function addUrl() {
    const v = urlVal.trim();
    if (!v.startsWith('http')) {
      toast('Valid URL enter karo');
      return;
    }
    let blocked = false;
    setRefs((prev) => {
      if (prev.length >= 10) {
        blocked = true;
        return prev;
      }
      const host = v.replace(/^https?:\/\//, '').split('/')[0];
      toast(host + ' added!');
      return [...prev, { type: 'url', data: v, label: host, size: 'URL' }];
    });
    if (blocked) {
      toast('Maximum 10 references!');
      return;
    }
    setUrlVal('');
  }

  function removeRef(i) {
    setRefs((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="sl" style={{ color: 'var(--pu)', display: 'flex', alignItems: 'center', gap: 6 }}>
        Reference Funnels
        <span
          style={{
            fontSize: 9,
            background: 'var(--pus)',
            color: 'var(--pu)',
            padding: '1px 6px',
            borderRadius: 10,
            border: '1px solid rgba(181,123,255,.2)',
            textTransform: 'none',
            letterSpacing: 0,
          }}
        >
          up to 10
        </span>
      </div>

      <div className="ref-wrap">
        <div className="ref-header">
          <span className="ref-htitle">AI Reference Sources</span>
          <span className="ref-count">{refs.length} / 10</span>
        </div>

        <div className="reftabs">
          <button className={'rt' + (tab === 'img' ? ' on' : '')} onClick={() => setTab('img')}>
            <ImageIcon />
            Image
          </button>
          <button className={'rt' + (tab === 'pdf' ? ' on' : '')} onClick={() => setTab('pdf')}>
            <PdfIcon />
            PDF
          </button>
          <button className={'rt' + (tab === 'url' ? ' on' : '')} onClick={() => setTab('url')}>
            <LinkIcon />
            URL
          </button>
        </div>

        {/* IMAGE TAB */}
        <div className={'rpanel' + (tab === 'img' ? ' on' : '')}>
          <div
            className={'dz' + (dragId === 'img' ? ' drag' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              setDragId('img');
            }}
            onDragLeave={() => setDragId(null)}
            onDrop={(e) => dzDrop(e, 'image')}
          >
            <input type="file" accept="image/*" multiple onChange={(e) => fileIn(e, 'image')} />
            <div className="dz-ic">
              <ImageIcon />
            </div>
            <div className="dz-t">Drop reference designs here</div>
            <div className="dz-s">AI aana parthi sections design karse</div>
            <div className="dz-f">PNG · JPG · WEBP · up to 10</div>
          </div>
        </div>

        {/* PDF TAB */}
        <div className={'rpanel' + (tab === 'pdf' ? ' on' : '')}>
          <div
            className={'dz' + (dragId === 'pdf' ? ' drag' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              setDragId('pdf');
            }}
            onDragLeave={() => setDragId(null)}
            onDrop={(e) => dzDrop(e, 'pdf')}
          >
            <input type="file" accept="application/pdf" multiple onChange={(e) => fileIn(e, 'pdf')} />
            <div className="dz-ic">
              <PdfIcon />
            </div>
            <div className="dz-t">Drop PDF funnels here</div>
            <div className="dz-s">Multiple PDFs supported</div>
            <div className="dz-f">PDF only</div>
          </div>
        </div>

        {/* URL TAB */}
        <div className={'rpanel' + (tab === 'url' ? ' on' : '')}>
          <div className="url-hint">
            <Info /> Live funnel ya landing page URL
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="url"
              className="ui"
              placeholder="https://example.com/sales-page"
              style={{ flex: 1 }}
              value={urlVal}
              onChange={(e) => setUrlVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addUrl()}
            />
            <button
              onClick={addUrl}
              style={{
                background: 'var(--pus)',
                border: '1px solid rgba(181,123,255,.25)',
                color: 'var(--pu)',
                padding: '0 12px',
                borderRadius: 'var(--rs)',
                cursor: 'pointer',
                fontSize: 11.5,
                fontFamily: 'var(--fb)',
                whiteSpace: 'nowrap',
                transition: 'var(--tr)',
              }}
            >
              Add
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--hi)', marginTop: 5 }}>
            AI studies structure, tone & design to match your funnel.
          </div>
        </div>

        {/* REFS LIST */}
        {refs.length > 0 && (
          <div style={{ padding: '0 10px 10px' }}>
            <div className="ref-list">
              {refs.map((r, i) => (
                <div className="ref-item" key={i}>
                  {r.type === 'image' ? (
                    <img className="ref-thumb" src={r.dataUrl} alt="" />
                  ) : (
                    <div className="ref-thumb-ic">
                      <PdfIcon style={{ width: 12, height: 12, fill: 'none', stroke: 'var(--pu)', strokeWidth: 1.8 }} />
                    </div>
                  )}
                  <div className="ref-info">
                    <div className="ref-name">{r.label}</div>
                    <div className="ref-meta">
                      {r.type.toUpperCase()} · {r.size}
                    </div>
                  </div>
                  <button className="ref-del" onClick={() => removeRef(i)}>
                    <Close />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
