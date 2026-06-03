import { useCallback, useEffect, useRef, useState } from 'react';
import { cropAndFilter } from '../lib/image';

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const HANDLES = [
  { id: 'nw', cx: 0,   cy: 0   },
  { id: 'n',  cx: 0.5, cy: 0   },
  { id: 'ne', cx: 1,   cy: 0   },
  { id: 'e',  cx: 1,   cy: 0.5 },
  { id: 'se', cx: 1,   cy: 1   },
  { id: 's',  cx: 0.5, cy: 1   },
  { id: 'sw', cx: 0,   cy: 1   },
  { id: 'w',  cx: 0,   cy: 0.5 },
];

const CURSOR_MAP = {
  nw:'nw-resize', n:'n-resize', ne:'ne-resize',
  e:'e-resize', se:'se-resize', s:'s-resize',
  sw:'sw-resize', w:'w-resize', move:'move',
};

export default function ImageEditor({ image, onSave, onClose }) {
  // Crop box corners, normalized 0-1 of container size
  const [box, setBox] = useState({ x1: 0, y1: 0, x2: 1, y2: 1 });
  const [brightness, setBrightness] = useState(100);
  const [contrast,   setContrast]   = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [saving,     setSaving]     = useState(false);

  const containerRef = useRef(null);
  const dragging     = useRef(null);

  const filterStyle = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

  function onHandleDown(handle, e) {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = { handle, startX: e.clientX, startY: e.clientY, startBox: { ...box } };
  }

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const { handle, startX, startY, startBox } = dragging.current;
    const cont = containerRef.current;
    if (!cont) return;
    const r   = cont.getBoundingClientRect();
    const dx  = (e.clientX - startX) / r.width;
    const dy  = (e.clientY - startY) / r.height;
    const MIN = 0.08;
    let { x1, y1, x2, y2 } = startBox;

    if (handle === 'move') {
      const w = x2 - x1, h = y2 - y1;
      x1 = clamp(x1 + dx, 0, 1 - w); y1 = clamp(y1 + dy, 0, 1 - h);
      x2 = x1 + w; y2 = y1 + h;
    } else {
      if (handle.includes('w')) x1 = clamp(x1 + dx, 0, x2 - MIN);
      if (handle.includes('e')) x2 = clamp(x2 + dx, x1 + MIN, 1);
      if (handle.includes('n')) y1 = clamp(y1 + dy, 0, y2 - MIN);
      if (handle.includes('s')) y2 = clamp(y2 + dy, y1 + MIN, 1);
    }
    setBox({ x1, y1, x2, y2 });
  }, [box]);

  const onMouseUp = useCallback(() => { dragging.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await cropAndFilter(image.dataUrl, box, brightness, contrast, saturation);
      const base64 = result.split(',')[1];
      onSave({ ...image, dataUrl: result, base64 });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setBox({ x1: 0, y1: 0, x2: 1, y2: 1 });
    setBrightness(100); setContrast(100); setSaturation(100);
  }

  // Box in % for CSS
  const bx1 = box.x1 * 100, by1 = box.y1 * 100;
  const bw  = (box.x2 - box.x1) * 100, bh = (box.y2 - box.y1) * 100;

  return (
    <div className="ie-backdrop" onMouseDown={onClose}>
      <div className="ie-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="ie-head">
          <span className="ie-title">Edit Image — <em>{image.label}</em></span>
          <button className="ie-x" onClick={onClose}>✕</button>
        </div>

        {/* ── IMAGE + CROP OVERLAY ── */}
        <div className="ie-preview" ref={containerRef}>
          <img src={image.dataUrl} className="ie-img" style={{ filter: filterStyle }} alt="" />

          {/* Dark masks outside crop box */}
          <div className="ie-mask" style={{ top:0, left:0, right:0, height: by1+'%' }} />
          <div className="ie-mask" style={{ bottom:0, left:0, right:0, height: (100-by1-bh)+'%' }} />
          <div className="ie-mask" style={{ top: by1+'%', left:0, width: bx1+'%', height: bh+'%' }} />
          <div className="ie-mask" style={{ top: by1+'%', right:0, width: (100-bx1-bw)+'%', height: bh+'%' }} />

          {/* Crop box + handles */}
          <div
            className="ie-box"
            style={{ left: bx1+'%', top: by1+'%', width: bw+'%', height: bh+'%' }}
            onMouseDown={e => onHandleDown('move', e)}
          >
            {/* Grid lines inside crop box */}
            <div className="ie-grid" />

            {HANDLES.map(h => (
              <div
                key={h.id}
                className="ie-handle"
                style={{
                  left: h.cx * 100 + '%',
                  top:  h.cy * 100 + '%',
                  cursor: CURSOR_MAP[h.id],
                }}
                onMouseDown={e => onHandleDown(h.id, e)}
              />
            ))}
          </div>
        </div>

        {/* ── ADJUSTMENTS ── */}
        <div className="ie-sliders">
          {[
            { label: 'Brightness', value: brightness, set: setBrightness, min: 20,  max: 200 },
            { label: 'Contrast',   value: contrast,   set: setContrast,   min: 50,  max: 200 },
            { label: 'Saturation', value: saturation, set: setSaturation, min: 0,   max: 200 },
          ].map(({ label, value, set, min, max }) => (
            <div className="ie-row" key={label}>
              <span className="ie-lbl">{label}</span>
              <input
                type="range" min={min} max={max} value={value}
                onChange={e => set(Number(e.target.value))}
                className="ie-range"
              />
              <span className="ie-val">{value}%</span>
            </div>
          ))}
        </div>

        <div className="ie-actions">
          <button className="ie-reset" onClick={reset}>Reset</button>
          <div style={{ flex: 1 }} />
          <button className="ie-cancel" onClick={onClose}>Cancel</button>
          <button className="ie-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save & Use ↗'}
          </button>
        </div>
      </div>
    </div>
  );
}
