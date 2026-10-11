// Évalue l'OMR sur un dossier d'images avec vérité terrain (json)
const sharp = require('/opt/npm-tools/node_modules/sharp');
const fs = require('fs'), path = require('path');
const OMR = require('../js/omr.js');
const dir = process.argv[2];
const only = process.argv[3];
const modelPath = path.join(__dirname, '../js/symbols-model.json');
const model = fs.existsSync(modelPath) ? JSON.parse(fs.readFileSync(modelPath)) : null;

function align(pred, truth) {
  const n = pred.length, m = truth.length;
  const D = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) D[i][0] = i; for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const c = pred[i - 1].pitch === truth[j - 1].pitch ? 0 : 1;
    D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + c);
  }
  let i = n, j = m, pm = 0, dm = 0, both = 0; const errs = []; const pairs = [];
  while (i > 0 && j > 0) {
    const c = pred[i - 1].pitch === truth[j - 1].pitch ? 0 : 1;
    if (D[i][j] === D[i - 1][j - 1] + c) {
      if (!c) { pairs.push([i - 1, j - 1]); pm++; if (Math.abs(pred[i - 1].dur - truth[j - 1].dur) < 1e-3) { dm++; both++; } else errs.push(`dur@${j - 1} p${truth[j-1].pitch} ${pred[i - 1].dur} vs ${truth[j - 1].dur}`); }
      else errs.push(`pitch@${j - 1} ${pred[i - 1].pitch} vs ${truth[j - 1].pitch}`);
      i--; j--;
    } else if (D[i][j] === D[i - 1][j] + 1) { errs.push(`extra ${pred[i - 1].pitch}`); i--; }
    else { errs.push(`miss@${j - 1} ${truth[j - 1].pitch}`); j--; }
  }
  pairs.reverse(); let onOK = 0;
  for (let k = 1; k < pairs.length; k++) { const [a, b] = pairs[k - 1], [c2, d] = pairs[k]; if (Math.abs((pred[c2].q - pred[a].q) - (truth[d].q - truth[b].q)) < 1e-3) onOK++; }
  return { pm, both, onOK, errs: errs.reverse(), dist: D[n][m] };
}

(async () => {
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpg)$/.test(f) && (!only || f.startsWith(only))).sort();
  const EX = { t: 0, p: 0, b: 0, len: 0, ok: 0, n: 0 }; let T = 0, P = 0, B = 0, O = 0, PR = 0, ms = 0, rT = 0, rOK = 0; const cat = {};
  for (const f of files) {
    const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const truth = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.(png|jpg)$/, '.json'))));
    const t0 = Date.now();
    const res = OMR.analyze(data, info.width, info.height, { model });
    ms += Date.now() - t0;
    const pred = [];
    let on = 0;
    const ed = (e) => (typeof e.dur === 'number' ? e.dur : 0) * (e.tup || 1);
    (res.events || []).forEach((e) => { if (e.type === 'note') pred.push({ pitch: e.pitches[e.pitches.length - 1].midi, dur: ed(e), q: on }); on += ed(e); });
    if (truth.expanded) {
      const ord = OMR.expandRepeats(res.events || []);
      const pe = ord.map((i) => res.events[i]).filter((e) => e.type === 'note').map((e) => ({ pitch: e.pitches[e.pitches.length - 1].midi, dur: ed(e), q: 0 }));
      const te = truth.expanded.filter((n) => !n.rest).map((n) => ({ pitch: n.pitch, dur: n.dur, q: 0 }));
      const ax = align(pe, te);
      EX.t += te.length; EX.p += ax.pm; EX.b += ax.both; EX.len += Math.abs(pe.length - te.length);
      const reps = (res.events || []).filter((e) => e.type === 'repeat').map((e) => e.kind[0]).join('') + '/' + (res.events || []).filter((e) => e.type === 'volta').map((e) => e.n).join('');
      const tr = truth.repeat; const exp = (tr.explicitStart ? 's' : '') + 'e/' + (tr.endings ? '12' : '');
      if (reps === exp) EX.ok++; EX.n++;
      if (only) console.log('repeats pred', reps, 'truth', exp, 'tuplets', (res.events || []).filter((e) => e.tup).length, 'truth', truth.written.filter((n) => Math.abs(n.dur * 3 - Math.round(n.dur * 3)) < 1e-6 && Math.abs(n.dur - Math.round(n.dur * 4) / 4) > 1e-6).length);
    }
    const tr = truth.notes.map((n) => ({ pitch: n.pitch, dur: n.dur, q: n.q }));
    const a = align(pred, tr);
    T += tr.length; P += a.pm; B += a.both; O += a.onOK; PR += pred.length;
    const clefOK = res.staves && res.staves.every((s) => (s.clef === 'G') === (truth.clef === 'treble'));
    const keyF = { C: 0, G: 1, D: 2, A: 3, E: 4, F: -1, Bb: -2, Eb: -3, Ab: -4 }[truth.key];
    console.log(`${f} ${truth.font.padEnd(9)} staves=${res.staves.length} notes ${pred.length}/${tr.length} pitchOK=${a.pm} both=${a.both} key=${res.key}/${keyF} clef=${clefOK ? 'ok' : 'BAD'} time=${res.time}/${truth.meter} ${res.metrics ? res.metrics.ms : ''}ms`);
    if (only) console.log(a.errs.slice(0, 60).join('\n'));
    a.errs.forEach((e) => { let k = e.split(' ')[0].replace(/@.*/, ''); if (k === 'dur') k += ' ' + e.split(' ').slice(2).join(' '); if (k === 'pitch') { const q = e.split(' '); k += ' d' + (q[1] - q[3]); } cat[k] = (cat[k] || 0) + 1; });
  }
  console.log(Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ':' + v).join(' | '));
  if (EX.n) console.log(`DEROULE (reprises) truth=${EX.t} pitch=${(100 * EX.p / EX.t).toFixed(1)}% pitch+dur=${(100 * EX.b / EX.t).toFixed(1)}% structure exacte=${EX.ok}/${EX.n} écart longueur=${EX.len}`);
  console.log(`TOTAL truth=${T} pred=${PR} pitch=${(100 * P / T).toFixed(1)}% pitch+dur=${(100 * B / T).toFixed(1)}% rythme(onsets)=${(100 * O / T).toFixed(1)}% avg ${Math.round(ms / files.length)}ms`);
})();
