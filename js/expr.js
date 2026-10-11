/*
 * Stephony — interprétation : nuances -> vélocité, articulations -> durée jouée,
 * indications de tempo et d'expression (texte lu par OCR) -> tempo, crescendo, ritardando.
 */
(function (root) {
  'use strict';
  const LEVELS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
  const VEL = { ppp: 30, pp: 42, p: 55, mp: 67, mf: 80, f: 96, ff: 110, fff: 122 };
  const DEFAULT_VEL = VEL.mf;
  const levelOf = (v) => { let best = 'mf', bd = 1e9; for (const k of LEVELS) { const d = Math.abs(VEL[k] - v); if (d < bd) { bd = d; best = k; } } return best; };
  const stepLevel = (v, n) => { const i = Math.max(0, Math.min(LEVELS.length - 1, LEVELS.indexOf(levelOf(v)) + n)); return VEL[LEVELS[i]]; };

  // tempos usuels (pulsations par minute, dans l'unité de temps de la mesure)
  const TEMPO_WORDS = [
    [/grave/i, 40], [/largo/i, 50], [/larghetto/i, 63], [/lento/i, 55], [/adagio/i, 66], [/andantino/i, 88], [/andante/i, 76],
    [/moderato/i, 100], [/allegretto/i, 112], [/allegro\s+moderato/i, 116], [/allegro\s+(vivace|molto)/i, 150], [/allegro/i, 132],
    [/vivace|vif/i, 150], [/presto/i, 172], [/prestissimo/i, 190], [/lent/i, 60], [/modéré|modere/i, 100], [/animé|anime/i, 132], [/vite/i, 150],
  ];
  const norm = (t) => (t || '').replace(/[‘’`´]/g, "'").replace(/\s+/g, ' ').trim();
  const fold = (t) => norm(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Analyse d'un texte lu sur la partition
  function interpretText(raw) {
    const t = fold(raw);
    if (!t) return null;
    // tempo chiffré : M.M. 108, ♩ = 92, MM=120
    const mm = t.match(/(?:m\.?\s*m\.?|metronome|♩|q)\s*(?:de|=|:)?\s*(\d{2,3})/) || (/(allegro|andante|adagio|moderato|lento|largo|presto|vivace|tempo)/.test(t) && t.match(/\((?:[^)]*?)(\d{2,3})/));
    let word = null;
    for (const [re, bpm] of TEMPO_WORDS) if (re.test(t)) { word = bpm; break; }
    if (/^(i|1|l)\s*[°o]?\s*tempo\b|tempo\s*(i|1|primo)\b|a\s*tempo|^tempo$/.test(t)) return { kind: 'atempo' };
    if (mm || (word && /^[a-z ]{4,30}$/.test(t.replace(/\(.*\)/, '').trim()))) {
      const bpm = mm ? +mm[1] : word;
      if (bpm >= 30 && bpm <= 260) return { kind: 'tempo', bpm, guessed: !mm };
    }
    if (/\b(poco\s+)?(rit|ritard|ritardando|rall|rallentando|allarg|allargando|elargissant|en\s+elargissant|ralentir|retenu|cedez|smorz|morendo)/.test(t)) return { kind: 'rit', amount: /poco/.test(t) ? 0.88 : 0.8 };
    if (/\b(accel|accelerando|stringendo|pressez|animez)/.test(t)) return { kind: 'accel', amount: 1.15 };
    if (/\b(cresc|crescendo|plus\s+fort|en\s+augmentant)/.test(t)) return { kind: /plus\s+fort/.test(t) ? 'louder' : 'cresc' };
    if (/\b(dim|diminuendo|decresc|decrescendo|en\s+diminuant)/.test(t)) return { kind: 'dim' };
    if (/moins\s+fort|sans\s+force|dolce|doux|piano|calando/.test(t)) return { kind: 'softer' };
    if (/\b(legato|lie)\b/.test(t)) return { kind: 'legato' };
    if (/\b(stacc|staccato|detache)\b/.test(t)) return { kind: 'staccato' };
    return { kind: 'text' };
  }

  // Titre : plus grande ligne de texte au-dessus de la première portée (hors tempo, numéros, mentions)
  function pickTitle(blocks) {
    const cand = blocks.filter((b) => b.top && b.text && /[a-zà-ÿ]{3}/i.test(b.text));
    const ok = cand.filter((b) => { const k = interpretText(b.text); return !(k && (k.kind === 'tempo' || k.kind === 'atempo')) && !/^(no|n°|nr|op|bwv|k\.?)\s*\.?\s*\d/i.test(b.text.trim()) && !/edited|edition|arr\.|arrang|©|copyright|press|rights|page/i.test(b.text); });
    if (!ok.length) return null;
    const hmax = Math.max(...ok.map((b) => b.h));
    const big = ok.filter((b) => b.h >= 0.85 * hmax).sort((a, b) => b.text.length - a.text.length);
    let t = norm(big[0].text).replace(/^[^\p{L}\p{N}«"]+|[^\p{L}\p{N}»".!?)]+$/gu, '');
    if (t.length < 3) return null;
    const letters = t.replace(/[^\p{L}]/gu, '');
    if (letters && letters === letters.toUpperCase()) {
      // MAJUSCULES -> casse de phrase (usage français) : « De l'articulation »
      t = t.toLowerCase().replace(/^(\P{L}*)(\p{L})/u, (m, a, c) => a + c.toUpperCase());
    }
    return t;
  }

  // Unité de temps (en noires) selon le chiffrage : 6/8 -> noire pointée, 2/2 -> blanche
  function beatUnit(time) {
    if (!time) return 1;
    const [n, d] = time;
    if (d === 8 && n % 3 === 0 && n >= 6) return 1.5;
    if (d === 8) return 0.5;
    if (d === 2) return 2;
    if (d === 16) return 0.25;
    return 1;
  }

  /*
   * Calcule pour chaque événement joué : vélocité (1-127), proportion de durée jouée (gate),
   * facteur de tempo local et allongement (point d'orgue).
   * order : indices dans events (ordre de lecture). Renvoie un Map index -> {vel, gate, tf, stretch}
   */
  function perform(events, order, opts = {}) {
    const expressive = opts.expressive !== false;
    const out = new Map();
    const seq = order.filter((i) => events[i].type === 'note' || events[i].type === 'rest');
    // 1) niveaux de nuance (marques explicites + textes)
    let level = DEFAULT_VEL;
    const base = new Array(seq.length);
    const accentOnce = new Array(seq.length).fill(0);
    const ramps = []; // {a, b, kind}
    const openRamp = { cres: null, dim: null };
    let tempoF = 1, ritFrom = -1, ritTo = 1;
    const tf = new Array(seq.length).fill(1);
    for (let k = 0; k < seq.length; k++) {
      const e = events[seq[k]];
      if (expressive && e.type === 'note') {
        const texts = (e.texts || []).map((x) => x.kind ? x : interpretText(x.text || x)).filter(Boolean);
        for (const x of texts) {
          if (x.kind === 'cresc') ramps.push({ a: k, b: -1, kind: 'cres', text: true });
          else if (x.kind === 'dim') ramps.push({ a: k, b: -1, kind: 'dim', text: true });
          else if (x.kind === 'louder') level = stepLevel(level, 1);
          else if (x.kind === 'softer') level = stepLevel(level, -1);
          else if (x.kind === 'rit') { ritFrom = k; ritTo = x.amount; }
          else if (x.kind === 'accel') { ritFrom = k; ritTo = x.amount; }
          else if (x.kind === 'atempo' || x.kind === 'tempo') { ritFrom = -1; tempoF = 1; }
        }
        if (e.dyn) {
          const d = e.dyn;
          if (VEL[d]) level = VEL[d];
          else if (/^(sf|sfz|fz|rf|rfz|sffz)$/.test(d)) accentOnce[k] = Math.max(VEL.ff, level + 24);
          else if (d === 'fp') { accentOnce[k] = VEL.f; level = VEL.p; }
          else if (d === 'sfp') { accentOnce[k] = VEL.ff; level = VEL.p; }
          // un texte de crescendo s'arrête à la nuance suivante
          ramps.forEach((r) => { if (r.text && r.b < 0 && r.a < k) r.b = k; });
        }
        if (e.hairpin) { const r = { a: k, b: -1, kind: e.hairpin }; ramps.push(r); openRamp[e.hairpin] = r; }
        if (e.hairpinEnd) { const r = ramps.filter((q) => !q.text && q.b < 0 && q.a <= k).pop(); if (r) r.b = k; }
      }
      base[k] = level;
      // ritardando : rampe sur ~2 mesures (8 noires) puis palier
      if (ritFrom >= 0) {
        let q = 0; for (let j = ritFrom; j < k; j++) q += durQ(events[seq[j]]);
        const p = Math.min(1, q / 8);
        tempoF = 1 + (ritTo - 1) * p;
      }
      tf[k] = tempoF;
    }
    // 2) rampes de crescendo / diminuendo : jusqu'à la nuance suivante ou un niveau
    const vel = base.slice();
    for (const r of ramps) {
      let b = r.b;
      if (b < 0) b = Math.min(seq.length - 1, r.a + (r.text ? 12 : 4));
      // cible : nuance explicite juste après la fin, sinon ±1 niveau (±2 pour un texte « crescendo »)
      let target = null;
      for (let j = b; j <= Math.min(seq.length - 1, b + 2); j++) { const e = events[seq[j]]; if (j > r.a && e.dyn && VEL[e.dyn]) { target = VEL[e.dyn]; break; } }
      const from = base[r.a];
      if (target == null || (r.kind === 'cres' && target <= from) || (r.kind === 'dim' && target >= from)) target = stepLevel(from, (r.kind === 'cres' ? 1 : -1) * (r.text ? 2 : 1));
      const n = Math.max(1, b - r.a);
      for (let j = r.a; j <= b; j++) vel[j] = Math.round(from + (target - from) * (j - r.a) / n);
      // le niveau atteint persiste jusqu'à la prochaine nuance
      for (let j = b + 1; j < seq.length && base[j] === base[r.a] && !(events[seq[j]].dyn); j++) vel[j] = target;
    }
    // 3) articulations
    for (let k = 0; k < seq.length; k++) {
      const e = events[seq[k]];
      let v = vel[k], gate = 0.9, stretch = 1;
      if (expressive && e.type === 'note') {
        const a = e.artic || [];
        if (accentOnce[k]) v = accentOnce[k];
        if (a.includes('accent')) v += 18;
        if (a.includes('marcato')) v += 25;
        if (a.includes('tenuto')) { v += 4; gate = 0.98; }
        if (e.legato) gate = e.slurEnd ? 0.88 : 1.0;
        if (a.includes('staccato')) gate = a.includes('tenuto') ? 0.75 : 0.5;
        if (a.includes('staccatissimo')) gate = 0.3;
        if (e.breathAfter) gate = Math.min(gate, 0.72);
        if (e.fermata) { stretch = 1.6; gate = Math.max(gate, 0.95); }
      } else if (!expressive) { v = 96; gate = 0.92; }
      out.set(seq[k], { vel: Math.max(1, Math.min(127, Math.round(v))), gate, tf: expressive ? tf[k] : 1, stretch });
    }
    return out;
  }
  function durQ(e) { return (typeof e.dur === 'number' ? e.dur : 1) * (e.tup || 1); }

  const DYN_WORDS = ['pp', 'p', 'mp', 'mf', 'f', 'ff', 'sf', 'fp'];
  root.StephonyExpr = { interpretText, pickTitle, beatUnit, perform, VEL, LEVELS, DYN_WORDS, fold };
})(typeof self !== 'undefined' ? self : this);
