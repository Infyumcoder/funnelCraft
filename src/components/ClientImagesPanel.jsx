import { useState } from 'react';
import { ImageIcon, Pencil, Close } from './Icons';
import { downscaleClientImage, readFileAsDataURL } from '../lib/image';
import ImageEditor from './ImageEditor';

const ROLES = [
  { value: 'hero',    label: 'Hero Photo',    emoji: '🙋' },
  { value: 'coach',   label: 'Coach / About', emoji: '👤' },
  { value: 'product', label: 'Product',       emoji: '📦' },
  { value: 'logo',    label: 'Logo',          emoji: '🏷️' },
  { value: 'bonus',   label: 'Bonus Item',    emoji: '🎁' },
  { value: 'team',    label: 'Team Photo',    emoji: '👥' },
];

const roleLabel = Object.fromEntries(ROLES.map(r => [r.value, r.label]));
const roleEmoji = Object.fromEntries(ROLES.map(r => [r.value, r.emoji]));

export default function ClientImagesPanel({ clientImages, setClientImages, toast }) {
  const [dragOver, setDragOver] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // image being edited

  async function processFile(file) {
    if (!file.type.startsWith('image/')) { toast('Please upload image files only'); return; }
    if (clientImages.length >= 8) { toast('Maximum 8 client images added!'); return; }
    const raw = await readFileAsDataURL(file);
    const scaled = await downscaleClientImage(raw);
    const base64 = scaled.split(',')[1];
    const mb = (base64.length * 0.75 / 1024 / 1024).toFixed(1) + 'MB';
    const newImg = {
      id: Date.now() + Math.random(),
      role: 'hero',
      label: file.name.replace(/\.[^.]+$/, ''),
      dataUrl: scaled,
      base64,
      mediaType: 'image/jpeg',
      size: mb,
    };
    setClientImages(prev => prev.length >= 8 ? prev : [...prev, newImg]);
    toast(file.name + ' added as client image!');
  }

  function fileIn(e) {
    [...e.target.files].forEach(processFile);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    [...e.dataTransfer.files].forEach(processFile);
  }

  function changeRole(id, role) {
    setClientImages(prev => prev.map(img => img.id === id ? { ...img, role } : img));
  }

  function removeImg(id) {
    setClientImages(prev => prev.filter(img => img.id !== id));
  }

  function onEditorSave(edited) {
    setClientImages(prev => prev.map(img => img.id === edited.id ? edited : img));
    setEditTarget(null);
    toast('Image updated!');
  }

  return (
    <div>
      {editTarget && (
        <ImageEditor
          image={editTarget}
          onSave={onEditorSave}
          onClose={() => setEditTarget(null)}
        />
      )}

      <div className="sl" style={{ color: 'var(--gr)', display: 'flex', alignItems: 'center', gap: 6 }}>
        Client Images
        <span style={{
          fontSize: 9, background: 'var(--grs)', color: 'var(--gr)',
          padding: '1px 6px', borderRadius: 10, border: '1px solid rgba(45,212,160,.2)',
          textTransform: 'none', letterSpacing: 0,
        }}>
          embedded in funnel
        </span>
      </div>

      <div className="ci-wrap">
        <div className="ci-header">
          <span className="ci-htitle">Photos used inside the funnel</span>
          <span className="ci-count">{clientImages.length} / 8</span>
        </div>

        {/* DROP ZONE */}
        <div
          className={'ci-dz' + (dragOver ? ' drag' : '')}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input type="file" accept="image/*" multiple onChange={fileIn} />
          <div className="ci-dz-ic">
            <ImageIcon />
          </div>
          <div className="ci-dz-t">Drop client photos here</div>
          <div className="ci-dz-s">Hero photo, coach photo, product image…</div>
          <div className="ci-dz-f">PNG · JPG · WEBP · up to 8 images</div>
        </div>

        {/* UPLOADED CLIENT IMAGES */}
        {clientImages.length > 0 && (
          <div className="ci-list">
            {clientImages.map(img => (
              <div className="ci-item" key={img.id}>
                <img className="ci-thumb" src={img.dataUrl} alt="" />
                <div className="ci-info">
                  <div className="ci-name">{img.label}</div>
                  <select
                    className="ci-role-sel"
                    value={img.role}
                    onChange={e => changeRole(img.id, e.target.value)}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.emoji} {r.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  className="ci-edit-btn"
                  title="Edit image"
                  onClick={() => setEditTarget(img)}
                >
                  <Pencil style={{ width: 11, height: 11, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }} />
                </button>
                <button className="ci-del" title="Remove" onClick={() => removeImg(img.id)}>
                  <Close />
                </button>
              </div>
            ))}
          </div>
        )}

        {clientImages.length === 0 && (
          <div style={{ fontSize: 10.5, color: 'var(--hi)', padding: '6px 12px 8px', textAlign: 'center' }}>
            These images go INSIDE the funnel — hero section, coach photo, product, etc.
          </div>
        )}
      </div>
    </div>
  );
}
