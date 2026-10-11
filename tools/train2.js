// Extraction d'exemples annotés (symboles, nuances, articulations, textes, liaisons) pour le kNN
// usage: node train2.js out.json DIR...
const sharp = require('/opt/npm-tools/node_modules/sharp');
const fs = require('fs'), path = require('path');
const OMR = require('../js/omr.js');
const outName = process.argv[2];
const dirs = process.argv.slice(3);
const MAP = { E050: 'clefG', E062: 'clefF', E05C: 'clefC', E260: 'flat', E261: 'natural', E262: 'sharp', E263: 'dsharp', E264: 'dflat',
  E883: 'tuplet3', E4E3: 'restWH', E4E4: 'restWH', E4E5: 'rest4', E4E6: 'rest8', E4E7: 'rest16', E4E8: 'rest32', DOT: 'dot', E08A: 'timeC', E08B: 'timeCut',
  E4A0: 'accent', E4A1: 'accent', E4A2: 'dot', E4A3: 'dot', E4A4: 'tenuto', E4A5: 'tenuto', E4A6: 'stacciss', E4A7: 'stacciss', E4A8: 'stacciss', E4A9: 'stacciss',
  E4AC: 'marcato', E4AD: 'marcato', E4C0: 'fermata', E4C1: 'fermata', E4CE: 'breath', BREATH: 'breath' };
for (let d = 0; d <= 9; d++) MAP['E08' + d] = 't' + d;
const DYNWORDS = new Set(['mf', 'mp', 'pp', 'ff', 'sf', 'fp', 'fz', 'sfz', 'rf', 'ppp', 'fff']);
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
        let cls = MAP[g.code] || (g.code === 'DYN' ? 'DYN' : g.code === 'TEXT' ? 'TEXT' : g.code === 'SLUR' ? 'SLUR' : g.code === 'HAIRPIN' ? 'HAIRPIN' : 'other');
        if (/^t\d|time/.test(cls) && g.cls !== 'meterSig') cls = 'other';
        if (g.cls === 'notehead') cls = 'HEAD';
        const p0 = OMR.fromSource(T, g.box[0] * k, g.box[1] * k), p1 = OMR.fromSource(T, g.box[2] * k, g.box[3] * k);
        return { cls, word: g.word, x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1] };
      });
      const iouBoxes = boxes.filter((b) => !/^(DYN|TEXT|SLUR|HAIRPIN|HEAD)$/.test(b.cls));
      const inside = (C, b, pad) => C.x0 >= b.x0 - pad && C.x1 <= b.x1 + pad && C.y0 >= b.y0 - pad && C.y1 <= b.y1 + pad;
      const hits = (C, b) => C.x0 <= b.x1 && C.x1 >= b.x0 && C.y0 <= b.y1 && C.y1 >= b.y0;
      const dynGroups = new Map();
      const pend = [];
      for (const C of D.comps) {
        if (C.area < 0.03 * s * s || C.w > 8 * s || C.h > 9 * s) continue;
        let best = 'other', bi = 0;
        for (const b of iouBoxes) {
          const ix = Math.max(0, Math.min(C.x1 + 1, b.x1) - Math.max(C.x0, b.x0)), iy = Math.max(0, Math.min(C.y1 + 1, b.y1) - Math.max(C.y0, b.y0));
          const inter = ix * iy; if (!inter) continue;
          const iou = inter / (C.w * C.h + (b.x1 - b.x0) * (b.y1 - b.y0) - inter);
          if (iou > bi) { bi = iou; best = b.cls; }
        }
        let cls = bi >= 0.45 ? best : 'other';
        if (cls === 'other') {
          const dy = boxes.find((b) => b.cls === 'DYN' && inside(C, b, 0.15 * s));
          if (dy) { if (!dynGroups.has(dy)) dynGroups.set(dy, []); dynGroups.get(dy).push(C); continue; }
          if (boxes.some((b) => b.cls === 'TEXT' && inside(C, b, 0.25 * s))) cls = 'text';
          else if (C.area / C.w < 0.45 * s && !boxes.some((b) => b.cls === 'HEAD' && hits(C, b))) {
            if (boxes.some((b) => b.cls === 'HAIRPIN' && inside(C, b, 0.2 * s))) cls = 'hairpin';
            else if (boxes.some((b) => b.cls === 'SLUR' && inside(C, b, 0.2 * s))) cls = 'curve';
          }
        }
        pend.push([C, cls]);
      }
      for (const [b, cs] of dynGroups) {
        cs.sort((a, c) => a.x0 - c.x0);
        const word = b.word || '';
        if (cs.length === word.length) cs.forEach((C, i) => pend.push([C, 'dyn_' + word[i]]));
        else if (cs.length === 1 && DYNWORDS.has(word)) pend.push([cs[0], 'dyn_' + word]);
      }
      for (const [C, cls] of pend) samples.push({ c: cls, f: Array.from(OMR.componentFeatures(D.ns, D.w, D.labels, C, s)) });
    }
    console.error('done', dir, samples.length);
  }
  const by = {};
  samples.forEach((x) => (by[x.c] = by[x.c] || []).push(x));
  console.error(Object.entries(by).map(([c, v]) => c + ':' + v.length).join(' '));
  fs.writeFileSync(path.join(__dirname, outName), JSON.stringify(samples));
})();
