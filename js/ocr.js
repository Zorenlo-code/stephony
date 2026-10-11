/* Stephony — lecture du texte de la partition (titre, tempo, indications) avec Tesseract, 100 % local */
(function (root) {
  'use strict';
  let workerP = null;
  const BASE = () => new URL('vendor/tesseract/', location.href).href;

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Lecteur de texte indisponible')); document.head.appendChild(s); });
  }
  function load() {
    if (workerP) return workerP;
    workerP = (async () => {
      if (!root.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
      const b = BASE();
      const w = await root.Tesseract.createWorker('fra', 1, {
        workerPath: b + 'worker.min.js', corePath: b, langPath: b + 'lang', gzip: true, cacheMethod: 'none', workerBlobURL: false,
      });
      await w.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' });
      return w;
    })();
    workerP.catch(() => { workerP = null; });
    return workerP;
  }

  // canvas : photo de la partition ; blocks : [{box:[x0,y0,x1,y1]}] en pixels de la photo ; sp : interligne (px)
  async function readBlocks(canvas, blocks, sp, onProgress) {
    if (!blocks.length) return [];
    const w = await load();
    const out = [];
    const tmp = document.createElement('canvas'); const c = tmp.getContext('2d', { willReadFrequently: true });
    for (let k = 0; k < blocks.length; k++) {
      const b = blocks[k];
      const pad = Math.max(4, 0.45 * (sp || 10));
      const x0 = Math.max(0, Math.floor(b.box[0] - pad)), y0 = Math.max(0, Math.floor(b.box[1] - pad));
      const x1 = Math.min(canvas.width, Math.ceil(b.box[2] + pad)), y1 = Math.min(canvas.height, Math.ceil(b.box[3] + pad));
      const bw = x1 - x0, bh = y1 - y0; if (bw < 4 || bh < 4) { out.push(''); continue; }
      const kz = Math.max(1, Math.min(4, 48 / Math.max(1, b.box[3] - b.box[1])));
      tmp.width = Math.round(bw * kz); tmp.height = Math.round(bh * kz);
      c.fillStyle = '#fff'; c.fillRect(0, 0, tmp.width, tmp.height);
      c.imageSmoothingQuality = 'high';
      c.filter = 'grayscale(1) contrast(1.25)';
      c.drawImage(canvas, x0, y0, bw, bh, 0, 0, tmp.width, tmp.height);
      c.filter = 'none';
      try {
        const { data } = await w.recognize(tmp);
        const text = (data.text || '').replace(/\s+/g, ' ').trim();
        out.push(data.confidence >= 45 ? text : (data.confidence >= 25 && text.length > 3 ? text : ''));
      } catch (e) { out.push(''); }
      if (onProgress) onProgress((k + 1) / blocks.length);
    }
    return out;
  }
  root.StephonyOCR = { load, readBlocks };
})(typeof window !== 'undefined' ? window : this);
