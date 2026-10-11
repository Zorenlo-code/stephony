const fs = require('fs'), path = require('path');
const OMR = require('../js/omr.js');
const samples = ['samples.json', 'samples_rep.json'].filter((f) => fs.existsSync(path.join(__dirname, f))).flatMap((f) => JSON.parse(fs.readFileSync(path.join(__dirname, f))));
const CAP = { other: 900 }, DEF = 260;
let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
samples.forEach((x) => (x.r = rnd()));
const test = samples.filter((x) => x.r < 0.2), train = samples.filter((x) => x.r >= 0.2);
const scale = [255 / 8, 255 / 9, 255, 255 / 8];
function build(set) {
  const by = {}; set.forEach((x) => (by[x.c] = by[x.c] || []).push(x));
  const out = [];
  for (const c in by) {
    const arr = by[c].sort((a, b) => a.r - b.r).slice(0, CAP[c] || DEF);
    arr.forEach((x) => out.push({ c, v: x.f.map((f, j) => Math.max(0, Math.min(255, Math.round(f * (j < 4 ? scale[j] : 255))))) }));
  }
  return { dim: samples[0].f.length, scale, samples: out };
}
const m = build(train);
const conf = {}; let ok = 0;
for (const x of test) {
  const r = OMR.knnClassify(Float32Array.from(x.f), m);
  conf[x.c] = conf[x.c] || { n: 0, ok: 0, as: {} }; conf[x.c].n++;
  if (r.cls === x.c) { ok++; conf[x.c].ok++; } else conf[x.c].as[r.cls] = (conf[x.c].as[r.cls] || 0) + 1;
}
console.log('holdout acc', (ok / test.length * 100).toFixed(1) + '%', 'model size', m.samples.length);
for (const c in conf) console.log(c.padEnd(8), conf[c].ok + '/' + conf[c].n, JSON.stringify(conf[c].as));
const full = build(samples);
const compact = { dim: full.dim, scale: full.scale, samples: full.samples };
fs.writeFileSync(path.join(__dirname, '../js/symbols-model.json'), JSON.stringify(compact));
console.log('written', (fs.statSync(path.join(__dirname, '../js/symbols-model.json')).size / 1024).toFixed(0) + 'KB');
// format compact pour l'application (chargé par importScripts)
const classes = [...new Set(full.samples.map((x) => x.c))];
const buf = Buffer.alloc(full.samples.length * (full.dim + 1));
full.samples.forEach((x, i) => { buf[i * (full.dim + 1)] = classes.indexOf(x.c); x.v.forEach((v, j) => (buf[i * (full.dim + 1) + 1 + j] = v)); });
const js = '/* Modèle kNN des symboles musicaux (généré par tools/buildmodel.js) */\nself.STEPHONY_MODEL = ' + JSON.stringify({ dim: full.dim, scale: full.scale, classes, data: buf.toString('base64') }) + ';\n';
fs.writeFileSync(path.join(__dirname, '../js/symbols-model.js'), js);
console.log('symbols-model.js', (js.length / 1024).toFixed(0) + 'KB');
