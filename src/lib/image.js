// Shrink an image (keeping aspect ratio) and re-encode as JPEG to cut payload.
// Returns a Promise that resolves to a JPEG data URL.
export function downscaleImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1600;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > MAX || h > MAX) {
        const s = MAX / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      try {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h); // flatten transparency for JPEG
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.82));
      } catch (e) {
        resolve(dataUrl); // fallback: original
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Resize client images to a smaller target (they're embedded in funnel, not just analysis).
export function downscaleClientImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 900;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > MAX || h > MAX) {
        const s = MAX / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      try {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.84));
      } catch (e) { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Crop (box = {x1,y1,x2,y2} as 0-1 fractions) + apply CSS-like filters via canvas.
export function cropAndFilter(dataUrl, box, brightness, contrast, saturation) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const sw = img.naturalWidth || img.width;
      const sh = img.naturalHeight || img.height;
      const sx = Math.round(box.x1 * sw);
      const sy = Math.round(box.y1 * sh);
      const sw2 = Math.round((box.x2 - box.x1) * sw);
      const sh2 = Math.round((box.y2 - box.y1) * sh);
      const MAX = 1000;
      let dw = sw2, dh = sh2;
      if (dw > MAX) { dh = Math.round(dh * MAX / dw); dw = MAX; }
      const c = document.createElement('canvas');
      c.width = dw; c.height = dh;
      const ctx = c.getContext('2d');
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      ctx.drawImage(img, sx, sy, sw2, sh2, 0, 0, dw, dh);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Read a File into a data URL.
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}
