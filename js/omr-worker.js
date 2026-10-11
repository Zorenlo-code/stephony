/* Stephony — analyse de partition dans un Web Worker (l'interface reste fluide) */
importScripts('omr.js', 'symbols-model.js');
const model = OMR.loadModel(self.STEPHONY_MODEL);

function rotate(rgba, w, h, quarterTurns) {
  // rotation horaire par quarts de tour
  const out = new Uint8ClampedArray(rgba.length);
  const nw = quarterTurns % 2 ? h : w, nh = quarterTurns % 2 ? w : h;
  const src = new Uint32Array(rgba.buffer), dst = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx, ny;
      if (quarterTurns === 1) { nx = h - 1 - y; ny = x; }
      else if (quarterTurns === 2) { nx = w - 1 - x; ny = h - 1 - y; }
      else { nx = y; ny = w - 1 - x; }
      dst[ny * nw + nx] = src[y * w + x];
    }
  }
  return { rgba: out, w: nw, h: nh };
}

self.onmessage = (e) => {
  const { id, rgba, w, h } = e.data;
  const progress = (p, msg) => self.postMessage({ id, type: 'progress', p, msg });
  try {
    const data = new Uint8ClampedArray(rgba);
    let res = OMR.analyze(data, w, h, { model, progress });
    res.rotation = 0;
    const count = (r) => (r.events || []).filter((ev) => ev.type === 'note').length;
    if (!res.ok || count(res) < 3) {
      // photo prise de côté ? on essaie les autres orientations
      for (const q of [1, 3]) {
        progress(0.1, q === 1 ? 'Essai en tournant la photo…' : 'Dernier essai…');
        const R = rotate(data, w, h, q);
        const r2 = OMR.analyze(R.rgba, R.w, R.h, { model, progress });
        if (r2.ok && count(r2) > count(res) + 2) { res = r2; res.rotation = q * 90; }
      }
    }
    delete res._debug;
    self.postMessage({ id, type: 'done', res });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err && err.message || err) });
  }
};
