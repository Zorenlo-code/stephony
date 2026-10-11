// Évalue notes + signes d'expression (nuances, articulations, liaisons, soufflets, respirations, armures, chiffrage)
const sharp = require('/opt/npm-tools/node_modules/sharp');
const fs = require('fs'), path = require('path');
const OMR = require('../js/omr.js');
global.self = global; require('../js/symbols-model.js'); const model = OMR.loadModel(self.STEPHONY_MODEL);
const dir = process.argv[2], only = process.argv[3];

function align(pred, truth) {
  const n = pred.length, m = truth.length;
  const D = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) D[i][0] = i; for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (pred[i - 1].pitch === truth[j - 1].pitch ? 0 : 1));
  let i = n, j = m; const pairs = [];
  while (i > 0 && j > 0) {
    const c = pred[i - 1].pitch === truth[j - 1].pitch ? 0 : 1;
    if (D[i][j] === D[i - 1][j - 1] + c) { if (!c) pairs.push([i - 1, j - 1]); i--; j--; }
    else if (D[i][j] === D[i - 1][j] + 1) i--; else j--;
  }
  return pairs.reverse();
}
const ART = { acc: 'accent', stacc: 'staccato', ten: 'tenuto', marc: 'marcato', stacciss: 'staccatissimo' };
(async () => {
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpg)$/.test(f) && (!only || f.startsWith(only))).sort();
  const S = {}; const inc = (k, tp, fp, fn) => { S[k] = S[k] || { tp: 0, fp: 0, fn: 0 }; S[k].tp += tp; S[k].fp += fp; S[k].fn += fn; };
  let T = 0, P = 0, B = 0, keyOK = 0, keyN = 0, timeOK = 0, ms = 0; const confArt = {};
  for (const f of files) {
    const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const truth = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.(png|jpg)$/, '.json'))));
    const t0 = Date.now();
    const res = OMR.analyze(data, info.width, info.height, { model });
    ms += Date.now() - t0;
    const ev = (res.events || []).filter((e) => e.type === 'note');
    const pred = ev.map((e) => ({ pitch: e.pitches[e.pitches.length - 1].midi, dur: e.dur * (e.tup || 1), e }));
    const tr = truth.notes;
    const pairs = align(pred, tr);
    T += tr.length; P += pairs.length; B += pairs.filter(([a, b]) => Math.abs(pred[a].dur - tr[b].dur) < 1e-3).length;
    const matchedT = new Set(pairs.map((p) => p[1])), matchedP = new Set(pairs.map((p) => p[0]));
    // attributs sur les paires appariées
    for (const [a, b] of pairs) {
      const e = pred[a].e, t = tr[b];
      const ta = new Set((t.artic || []).map((x) => ART[x])), pa = new Set(e.artic || []);
      for (const k of Object.values(ART)) inc('artic:' + k, ta.has(k) && pa.has(k) ? 1 : 0, !ta.has(k) && pa.has(k) ? 1 : 0, ta.has(k) && !pa.has(k) ? 1 : 0);
      if (ta.size || pa.size) { const key = [...ta].sort().join('+') + ' -> ' + [...pa].sort().join('+'); if ([...ta].sort().join() !== [...pa].sort().join()) confArt[key] = (confArt[key] || 0) + 1; }
      inc('dyn(any)', !!t.dyn && !!e.dyn ? 1 : 0, !t.dyn && e.dyn ? 1 : 0, t.dyn && !e.dyn ? 1 : 0);
      if (t.dyn && e.dyn) inc('dyn(word ok)', t.dyn === e.dyn ? 1 : 0, t.dyn !== e.dyn ? 1 : 0, 0);
      inc('fermata', t.fermata && e.fermata ? 1 : 0, !t.fermata && e.fermata ? 1 : 0, t.fermata && !e.fermata ? 1 : 0);
      inc('hairpin start', t.hairpin && e.hairpin ? 1 : 0, !t.hairpin && e.hairpin ? 1 : 0, t.hairpin && !e.hairpin ? 1 : 0);
      if (t.hairpin && e.hairpin) inc('hairpin kind', t.hairpin === e.hairpin ? 1 : 0, t.hairpin !== e.hairpin ? 1 : 0, 0);
      const tl = !!(t.slur && !t.slurEnd), pl = !!(e.legato && !e.slurEnd);
      inc('legato', tl && pl ? 1 : 0, !tl && pl ? 1 : 0, tl && !pl ? 1 : 0);
    }
    if (only) {
      const tdy = tr.map((t, i) => t.dyn ? i + ':' + t.dyn + '@' + t.pitch : null).filter(Boolean);
      const pdy = pairs.filter(([a]) => pred[a].e.dyn).map(([a, b]) => b + ':' + pred[a].e.dyn);
      const un = pred.filter((p, i) => p.e.dyn && !matchedP.has(i)).map((p) => 'unmatched:' + p.e.dyn);
      console.log('DYN truth', tdy.join(' '), '\nDYN pred ', pdy.concat(un).join(' '));
      console.log('LEG miss', pairs.filter(([a, b]) => tr[b].slur && !tr[b].slurEnd && !(pred[a].e.legato && !pred[a].e.slurEnd)).map(([a, b]) => b).join(' '));
      console.log('FERM truth', tr.map((t, i) => t.fermata ? i : null).filter((x) => x != null).join(' '), 'pred', pairs.filter(([a]) => pred[a].e.fermata).map(([a, b]) => b).join(' '));
    }
    // respirations : marque avant la note b -> après la note b-1
    for (const [a, b] of pairs) {
      const tnext = tr[b + 1]; const tb = !!(tnext && tnext.breathBefore); const pb = !!pred[a].e.breathAfter;
      inc('breath', tb && pb ? 1 : 0, !tb && pb ? 1 : 0, tb && !pb ? 1 : 0);
    }
    // armure : changement détecté ?
    if (truth.keyChange) {
      keyN++;
      const kev = (res.events || []).filter((e) => e.type === 'key');
      const ok = kev.some((k) => k.fifths === truth.keyChange.fifths) || res.staves.some((st, i) => i > 0 && st.fifths === truth.keyChange.fifths);
      if (ok) keyOK++;
    }
    const tsig = truth.meter[0] === 'C' ? [4, 4] : truth.meter[0] === 'cut' ? [2, 2] : truth.meter;
    if (res.time && res.time[0] === tsig[0] && res.time[1] === tsig[1]) timeOK++;
    const fk = (res.events || []).filter((e) => e.type === 'key').length;
    console.log(`${f} ${truth.font.padEnd(9)} notes ${pred.length}/${tr.length} pitch=${pairs.length} time=${res.time}/${tsig} keyEv=${fk}${truth.keyChange ? ' truthKC=' + truth.keyChange.fifths : ''} ${res.metrics ? res.metrics.ms : ''}ms`);
  }
  console.log(`TOTAL notes=${T} pitch=${(100 * P / T).toFixed(1)}% pitch+dur=${(100 * B / T).toFixed(1)}% key changes ${keyOK}/${keyN} time ${timeOK}/${files.length} avg ${Math.round(ms / files.length)}ms`);
  for (const k of Object.keys(S).sort()) { const v = S[k]; const p = v.tp / Math.max(1, v.tp + v.fp), r = v.tp / Math.max(1, v.tp + v.fn); console.log(k.padEnd(22), `P=${(100 * p).toFixed(0)}% R=${(100 * r).toFixed(0)}%  (tp ${v.tp} fp ${v.fp} fn ${v.fn})`); }
  console.log('confusions artic:', Object.entries(confArt).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ':' + v).join(' | '));
})();
