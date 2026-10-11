// Exemples de chiffres de mesure découpés dans leur boîte (gère les chiffres collés 6/8, 3/4…)
const sharp = require('/opt/npm-tools/node_modules/sharp');
const fs = require('fs'), path = require('path');
const OMR = require('../js/omr.js');
const outName = process.argv[2], dirs = process.argv.slice(3);
(async () => {
  const samples = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((x) => /\.(png|jpg)$/.test(x))) {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.(png|jpg)$/, '.json'))));
      const ms = meta.glyphs.filter((g) => g.cls === 'meterSig' && /^E08\d$/.test(g.code));
      if (!ms.length) continue;
      const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const res = OMR.analyze(data, info.width, info.height, { debug: true });
      if (!res.ok) continue;
      const D = res._debug, T = res.transform, s = res.metrics.s, w = D.w, k = info.width / meta.pngW;
      for (const g of ms) {
        const p0 = OMR.fromSource(T, g.box[0] * k, g.box[1] * k), p1 = OMR.fromSource(T, g.box[2] * k, g.box[3] * k);
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, area = 0;
        for (let y = Math.round(p0[1]); y <= Math.round(p1[1]); y++) for (let x = Math.round(p0[0]); x <= Math.round(p1[0]); x++) {
          if (!D.ns[y * w + x]) continue; area++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        if (area < 0.1 * s * s) continue;
        const ff = OMR.featuresPred(x0, y0, x1, y1, (x, y) => D.ns[y * w + x] === 1, area, s);
        samples.push({ c: 't' + g.code[3], f: Array.from(ff) });
      }
    }
    console.error('done', dir, samples.length);
  }
  const by = {}; samples.forEach((x) => (by[x.c] = (by[x.c] || 0) + 1)); console.error(by);
  fs.writeFileSync(path.join(__dirname, outName), JSON.stringify(samples));
})();
