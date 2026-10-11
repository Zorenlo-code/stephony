// Construit le modèle kNN des symboles à partir des rendus Verovio annotés
const sharp = require('/opt/npm-tools/node_modules/sharp');
const fs = require('fs'), path = require('path');
const OMR = require('../js/omr.js');
const outName = process.argv[2].endsWith('.json') ? process.argv[2] : 'samples.json';
const dirs = process.argv.slice(process.argv[2].endsWith('.json') ? 3 : 2);
const MAP = { E050: 'clefG', E062: 'clefF', E05C: 'clefC', E260: 'flat', E261: 'natural', E262: 'sharp', E263: 'dsharp', E264: 'dflat',
  E883: 'tuplet3', E4E3: 'restWH', E4E4: 'restWH', E4E5: 'rest4', E4E6: 'rest8', E4E7: 'rest16', E4E8: 'rest32', DOT: 'dot', E08A: 'timeC', E08B: 'timeCut' };
for (let d = 0; d <= 9; d++) MAP['E08' + d] = 't' + d;
(async () => {
  const samples = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((x) => /\.(png|jpg)$/.test(x))) {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.(png|jpg)$/, '.json'))));
      const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const res = OMR.analyze(data, info.width, info.height, { debug: true });
      if (!res.ok) continue;
      const D = res._debug, T = res.transform, s = res.metrics.s;
      const k = info.width / meta.pngW;
      const boxes = meta.glyphs.map((g) => {
        let cls = MAP[g.code] || 'other';
        if (/^t\d|time/.test(cls) && g.cls !== 'meterSig') cls = 'other';
        const p0 = OMR.fromSource(T, g.box[0] * k, g.box[1] * k), p1 = OMR.fromSource(T, g.box[2] * k, g.box[3] * k);
        return { cls, x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1] };
      });
      for (const C of D.comps) {
        if (C.area < 0.03 * s * s || C.w > 8 * s || C.h > 9 * s) continue;
        let best = 'other', bi = 0;
        for (const b of boxes) {
          const ix = Math.max(0, Math.min(C.x1 + 1, b.x1) - Math.max(C.x0, b.x0)), iy = Math.max(0, Math.min(C.y1 + 1, b.y1) - Math.max(C.y0, b.y0));
          const inter = ix * iy; if (!inter) continue;
          const iou = inter / (C.w * C.h + (b.x1 - b.x0) * (b.y1 - b.y0) - inter);
          if (iou > bi) { bi = iou; best = b.cls; }
        }
        const cls = bi >= 0.45 ? best : 'other';
        const feat = OMR.componentFeatures(D.ns, D.w, D.labels, C, s);
        samples.push({ c: cls, f: Array.from(feat) });
      }
    }
    console.error('done', dir, samples.length);
  }
  const by = {};
  samples.forEach((x) => (by[x.c] = by[x.c] || []).push(x));
  console.error(Object.entries(by).map(([c, v]) => c + ':' + v.length).join(' '));
  fs.writeFileSync(path.join(__dirname, outName), JSON.stringify(samples));
})();
