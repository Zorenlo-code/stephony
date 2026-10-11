/*
 * Stephony — moteur de reconnaissance de partition (OMR) 100 % local.
 * Pipeline classique : niveaux de gris -> redressement -> normalisation d'échelle
 * -> binarisation -> détection des portées -> suppression des lignes
 * -> têtes de notes (transformée de distance) -> hampes / ligatures / crochets
 * -> classification des autres symboles (kNN) -> hauteurs / durées.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OMR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TARGET_S = 20; // interligne visé (px) après normalisation

  // ------------------------------------------------------------------ images
  function rgbaToGray(data, w, h) {
    const n = w * h, g = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    return g;
  }

  // Redimensionne + tourne (angle en degrés) en une passe. Sur-échantillonnage si réduction.
  function warp(src, w, h, scale, angleDeg) {
    const a = angleDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const sw = w * scale, sh = h * scale;
    const nw = Math.max(1, Math.round(Math.abs(sw * ca) + Math.abs(sh * sa)));
    const nh = Math.max(1, Math.round(Math.abs(sw * sa) + Math.abs(sh * ca)));
    const dst = new Uint8Array(nw * nh);
    const cxs = w / 2, cys = h / 2, cxd = nw / 2, cyd = nh / 2;
    const k = scale < 0.75 ? Math.min(4, Math.ceil(1 / scale)) : 1;
    const inv = 1 / scale;
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let acc = 0;
        for (let sy = 0; sy < k; sy++) {
          for (let sx = 0; sx < k; sx++) {
            const dx = x + (sx + 0.5) / k - 0.5 - cxd, dy = y + (sy + 0.5) / k - 0.5 - cyd;
            // rotation inverse
            const ux = (dx * ca + dy * sa) * inv + cxs, uy = (-dx * sa + dy * ca) * inv + cys;
            acc += sampleBilinear(src, w, h, ux, uy);
          }
        }
        dst[y * nw + x] = acc / (k * k);
      }
    }
    return { img: dst, w: nw, h: nh, scale, angle: angleDeg, srcW: w, srcH: h };
  }
  function sampleBilinear(src, w, h, x, y) {
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 255;
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const a = src[y0 * w + x0], b = src[y0 * w + x1], c = src[y1 * w + x0], d = src[y1 * w + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  // coordonnées image traitée -> image d'origine
  function toSource(T, x, y) {
    const a = T.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const dx = x - T.w / 2, dy = y - T.h / 2;
    return [(dx * ca + dy * sa) / T.scale + T.srcW / 2, (-dx * sa + dy * ca) / T.scale + T.srcH / 2];
  }
  function fromSource(T, x, y) {
    const a = T.angle * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const ux = (x - T.srcW / 2) * T.scale, uy = (y - T.srcH / 2) * T.scale;
    return [ux * ca - uy * sa + T.w / 2, ux * sa + uy * ca + T.h / 2];
  }

  // Flou boîte séparable (rx, ry en pixels)
  function boxBlur(src, w, h, rx, ry) {
    let a = src;
    if (rx > 0) {
      const o = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        const r = y * w; let acc = 0, n = 0;
        for (let x = -rx; x < w; x++) {
          const xa = x + rx; if (xa < w) { acc += a[r + xa]; n++; }
          const xr = x - rx - 1; if (xr >= 0) { acc -= a[r + xr]; n--; }
          if (x >= 0) o[r + x] = acc / n;
        }
      }
      a = o;
    }
    if (ry > 0) {
      const o = new Uint8Array(w * h);
      for (let x = 0; x < w; x++) {
        let acc = 0, n = 0;
        for (let y = -ry; y < h; y++) {
          const ya = y + ry; if (ya < h) { acc += a[ya * w + x]; n++; }
          const yr = y - ry - 1; if (yr >= 0) { acc -= a[yr * w + x]; n--; }
          if (y >= 0) o[y * w + x] = acc / n;
        }
      }
      a = o;
    }
    return a === src ? src.slice() : a;
  }
  // Binarisation adaptative (Bradley) + garde de contraste
  function binarize(g, w, h, win, T = 0.12) {
    const W1 = w + 1;
    const ii = new Uint32Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += g[y * w + x];
        ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + row;
      }
    }
    const r = Math.max(4, win >> 1);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const cnt = (x1 - x0) * (y1 - y0);
        const sum = ii[y1 * W1 + x1] - ii[y0 * W1 + x1] - ii[y1 * W1 + x0] + ii[y0 * W1 + x0];
        const v = g[y * w + x];
        const mean = sum / cnt;
        out[y * w + x] = (v < mean * (1 - T) && mean - v > 12) ? 1 : 0;
      }
    }
    return out;
  }

  // Épaisseur de ligne (t) et interligne (s) par histogrammes de plages verticales
  function staffMetrics(bin, w, h) {
    const black = new Float64Array(80);
    const step = Math.max(1, Math.round(w / 600));
    for (let x = 0; x < w; x += step) {
      let y = 0;
      while (y < h) {
        if (bin[y * w + x]) { const st = y; while (y < h && bin[y * w + x]) y++; const L = y - st; if (L < 80) black[L]++; }
        else y++;
      }
    }
    let t = 1; for (let i = 1; i < 80; i++) if (black[i] > black[t]) t = i;
    const pair = new Float64Array(300);
    for (let x = 0; x < w; x += step) {
      let y = 0, prev = -1;
      while (y < h) {
        if (bin[y * w + x]) {
          const st = y; while (y < h && bin[y * w + x]) y++;
          const L = y - st;
          if (L <= 2 * t + 2) { if (prev >= 0) { const d = (st + y) / 2 - prev; if (d < 300) pair[Math.round(d)]++; } prev = (st + y) / 2; }
          else prev = -1;
        } else y++;
      }
    }
    let s = 2 * t + 2; for (let i = 2 * t + 2; i < 300; i++) if (pair[i] > pair[s]) s = i;
    // affinage par moyenne pondérée autour du pic
    let num = 0, den = 0;
    for (let i = Math.max(1, s - 2); i <= Math.min(299, s + 2); i++) { num += i * pair[i]; den += pair[i]; }
    // épaisseur moyenne pondérée
    let tn = 0, td = 0;
    for (let i = Math.max(1, t - 1); i <= t + 1; i++) { tn += i * black[i]; td += black[i]; }
    return { t: td ? tn / td : t, s: den ? num / den : s, confidence: pair[s] };
  }

  // Estimation de l'inclinaison par maximisation de la variance des projections
  function estimateSkew(bin, w, h) {
    const pts = [];
    const stride = Math.max(1, Math.round((w * h) / 400000));
    for (let y = 0; y < h; y++) for (let x = (y * 7) % stride; x < w; x += stride) if (bin[y * w + x]) pts.push(x, y);
    if (pts.length < 200) return 0;
    const score = (deg) => {
      const tn = Math.tan(deg * Math.PI / 180);
      const off = Math.ceil(w * Math.abs(tn)) + 2;
      const hist = new Float64Array(h + 2 * off + 2);
      for (let i = 0; i < pts.length; i += 2) {
        const yy = pts[i + 1] - pts[i] * tn + off;
        hist[Math.round(yy)]++;
      }
      let sc = 0; for (let i = 0; i < hist.length; i++) sc += hist[i] * hist[i];
      return sc;
    };
    let best = 0, bs = -1;
    for (let d = -12; d <= 12; d += 0.5) { const sc = score(d); if (sc > bs) { bs = sc; best = d; } }
    let best2 = best;
    for (let d = best - 0.5; d <= best + 0.5; d += 0.05) { const sc = score(d); if (sc > bs) { bs = sc; best2 = d; } }
    // y' = y - x tan(d) aligné => les lignes ont une pente tan(d)
    return best2;
  }

  // ----------------------------------------------------------- composantes
  // Étiquetage en composantes connexes (union-find, balayage). pred(i) -> bool
  function labelComponents(img, w, h, conn8, want = 1) {
    const labels = new Int32Array(w * h);
    const parent = [0];
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; } return Math.min(a, b); };
    let next = 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (img[i] !== want) continue;
        let l = 0;
        const consider = (j) => { const lj = labels[j]; if (lj) l = l ? union(l, lj) : find(lj); };
        if (x > 0) consider(i - 1);
        if (y > 0) {
          consider(i - w);
          if (conn8) { if (x > 0) consider(i - w - 1); if (x < w - 1) consider(i - w + 1); }
        }
        if (!l) { l = next++; parent.push(l); }
        labels[i] = l;
      }
    }
    // compactage + statistiques
    const remap = new Int32Array(next);
    const comps = [];
    for (let l = 1; l < next; l++) {
      const r = find(l);
      if (!remap[r]) { comps.push({ id: comps.length + 1, x0: 1e9, y0: 1e9, x1: -1, y1: -1, area: 0, sx: 0, sy: 0 }); remap[r] = comps.length; }
      remap[l] = remap[r];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x; const l = labels[i];
        if (!l) continue;
        const c = remap[l]; labels[i] = c;
        const C = comps[c - 1];
        if (x < C.x0) C.x0 = x; if (x > C.x1) C.x1 = x; if (y < C.y0) C.y0 = y; if (y > C.y1) C.y1 = y;
        C.area++; C.sx += x; C.sy += y;
      }
    }
    for (const C of comps) { C.w = C.x1 - C.x0 + 1; C.h = C.y1 - C.y0 + 1; C.cx = C.sx / C.area; C.cy = C.sy / C.area; }
    return { labels, comps };
  }

  // Transformée de distance euclidienne exacte (Felzenszwalb) : distance au fond
  function distanceTransform(img, w, h) {
    const INF = 1e10;
    const f = new Float64Array(Math.max(w, h));
    const d = new Float64Array(Math.max(w, h));
    const v = new Int32Array(Math.max(w, h));
    const z = new Float64Array(Math.max(w, h) + 1);
    const out = new Float32Array(w * h);
    const dt1 = (n) => {
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < n; q++) {
        let s;
        while (true) {
          s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
          if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
        }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
    };
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = img[y * w + x] ? INF : 0;
      dt1(h);
      for (let y = 0; y < h; y++) out[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) f[x] = out[y * w + x];
      dt1(w);
      for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
    }
    return out;
  }

  // --------------------------------------------------------------- portées
  function findStaves(bin, w, h, t, s, dbg, shear) {
    const SW = Math.max(30, Math.round(5 * s));
    const nStrips = Math.max(1, Math.floor(w / SW));
    const proj = new Float64Array(h), tmp = new Float64Array(h);
    const maxLineRun = Math.max(3, Math.round(2.2 * t + 2));
    const patterns = [];
    for (let k = 0; k < nStrips; k++) {
      const xa = k * SW, xb = Math.min(w, xa + SW);
      // projection cisaillée : on retient l'inclinaison locale la plus "piquée"
      const xc = (xa + xb) / 2;
      let bestScore = -1;
      for (const deg of (shear ? [0, -1.5, 1.5, -3, 3] : [0])) {
        const tn = Math.tan(deg * Math.PI / 180);
        tmp.fill(0);
        for (let x = xa; x < xb; x++) {
          const off = Math.round((x - xc) * tn);
          for (let y = Math.max(0, off); y < Math.min(h, h + off); y++) if (bin[y * w + x]) tmp[y - off]++;
        }
        let sc = 0; for (let y = 0; y < h; y++) sc += tmp[y] * tmp[y];
        if (sc > bestScore * 1.02) { bestScore = sc; proj.set(tmp); }
      }
      const thr = 0.42 * (xb - xa);
      const cands = [];
      let y = 0;
      while (y < h) {
        if (proj[y] >= thr) {
          const st = y; let num = 0, den = 0;
          while (y < h && proj[y] >= thr) { num += y * proj[y]; den += proj[y]; y++; }
          if (y - st <= maxLineRun) { let mx = 0; for (let q = st; q < y; q++) mx = Math.max(mx, proj[q]); cands.push({ y: num / den, strength: mx / (xb - xa) }); }
        } else y++;
      }
      // énumération de tous les motifs à 5 lignes équidistantes, puis suppression des non-maxima
      const local = [];
      for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length && cands[j].y - cands[i].y <= 1.35 * s; j++) {
          const sp = cands[j].y - cands[i].y;
          if (sp < 0.7 * s) continue;
          const seq = [i, j];
          for (let m = 2; m < 5; m++) {
            const exp = cands[seq[m - 1]].y + sp;
            let bestIdx = -1, bd = Math.max(1.5, 0.18 * sp);
            for (let q = seq[m - 1] + 1; q < cands.length && cands[q].y < exp + 0.3 * sp; q++) {
              const dd = Math.abs(cands[q].y - exp); if (dd < bd) { bd = dd; bestIdx = q; }
            }
            if (bestIdx < 0) break;
            seq.push(bestIdx);
          }
          if (seq.length === 5) {
            const ys = seq.map((q) => cands[q].y);
            const sc = seq.reduce((a, q) => a + Math.min(1, cands[q].strength), 0) - Math.abs((ys[4] - ys[0]) / 4 - s) / s;
            local.push({ k, xc: (xa + xb) / 2, ys, top: ys[0], sp: (ys[4] - ys[0]) / 4, score: sc });
          }
        }
      }
      local.sort((a, b) => b.score - a.score);
      const kept = [];
      for (const p of local) {
        if (kept.some((q) => p.ys[0] < q.ys[4] + 0.5 * q.sp && p.ys[4] > q.ys[0] - 0.5 * q.sp)) continue;
        kept.push(p);
      }
      patterns.push(...kept.sort((a, b) => a.top - b.top));
    }
    // chaînage horizontal des motifs
    const chains = [];
    for (const p of patterns) {
      let best = null, bd = 1e9;
      for (const c of chains) {
        const last = c.pts[c.pts.length - 1];
        const gap = p.k - last.k;
        if (gap < 1 || gap > 6) continue;
        let pred = last.top;
        if (c.pts.length >= 2) { const pr = c.pts[c.pts.length - 2]; pred += (last.top - pr.top) / (last.k - pr.k) * gap; }
        const dd = Math.abs(pred - p.top);
        if (dd < 0.45 * p.sp + 0.15 * s * gap && Math.abs(last.sp - p.sp) < 0.25 * p.sp && dd < bd) { bd = dd; best = c; }
      }
      if (best) best.pts.push(p); else chains.push({ pts: [p] });
    }
    if (dbg) { console.log('patterns', patterns.map((p) => p.k + ':' + Math.round(p.top)).join(' ')); console.log('chains', chains.map((c) => c.pts.length + '@' + Math.round(c.pts[0].top) + '[' + c.pts[0].k + '-' + c.pts[c.pts.length - 1].k + ']').join(' ')); }
    // regroupement des chaînes appartenant à la même portée (ajustement linéaire)
    chains.sort((a, b) => b.pts.length - a.pts.length);
    const groups = [];
    const fitLine = (pts) => {
      if (pts.length < 2) return (x) => pts[0].top;
      let sx = 0, sy = 0, sxx = 0, sxy = 0; const n = pts.length;
      for (const p of pts) { sx += p.xc; sy += p.top; sxx += p.xc * p.xc; sxy += p.xc * p.top; }
      const den = n * sxx - sx * sx; const b = den ? (n * sxy - sx * sy) / den : 0; const a0 = (sy - b * sx) / n;
      return (x) => a0 + b * x;
    };
    for (const c of chains) {
      let best = null, bd = 1e9;
      for (const g of groups) {
        const f = g.fit;
        const d = c.pts.reduce((acc, p) => acc + Math.abs(f(p.xc) - p.top), 0) / c.pts.length;
        const overlapK = c.pts.filter((p) => g.ks.has(p.k)).length;
        if (d < 0.7 * c.pts[0].sp && overlapK <= 1 && d < bd) { bd = d; best = g; }
      }
      if (best) { best.pts.push(...c.pts.filter((p) => !best.ks.has(p.k))); best.pts.sort((a, b) => a.k - b.k); c.pts.forEach((p) => best.ks.add(p.k)); best.fit = fitLine(best.pts); }
      else groups.push({ pts: c.pts.slice(), ks: new Set(c.pts.map((p) => p.k)), fit: fitLine(c.pts) });
    }
    const maxLen = groups.reduce((m, g) => Math.max(m, g.pts.length), 0);
    const staves = groups.filter((g) => g.pts.length >= Math.max(2, Math.min(3, 0.1 * maxLen)));
    // prolongement des portées strip par strip (lignes faibles ou encombrées)
    const stripProj = (k) => {
      const xa = k * SW, xb = Math.min(w, xa + SW); const pr = new Float64Array(h);
      for (let y = 0; y < h; y++) { let c = 0; const row = y * w; for (let x = xa; x < xb; x++) c += bin[row + x]; pr[y] = c / (xb - xa); }
      return pr;
    };
    for (const g of staves) {
      g.pts.sort((a, b) => a.k - b.k);
      for (const dir of [-1, 1]) {
        let fails = 0;
        while (fails < 3) {
          const edge = dir < 0 ? g.pts[0] : g.pts[g.pts.length - 1];
          const nb = dir < 0 ? g.pts[Math.min(g.pts.length - 1, 2)] : g.pts[Math.max(0, g.pts.length - 3)];
          const k = edge.k + dir * (fails + 1);
          if (k < 0 || k >= nStrips) break;
          const slope = nb.k !== edge.k ? (edge.top - nb.top) / (edge.k - nb.k) : 0;
          const pred = edge.ys.map((y) => y + slope * (k - edge.k));
          const pr = stripProj(k);
          let best = null, bs = -1;
          for (let dy = -Math.round(0.45 * edge.sp); dy <= Math.round(0.45 * edge.sp); dy++) {
            let sc = 0, cnt = 0;
            for (const y0 of pred) {
              let m = 0; for (let q = -1; q <= 1; q++) { const yy = Math.round(y0 + dy + q); if (yy >= 0 && yy < h) m = Math.max(m, pr[yy]); }
              sc += m; if (m >= 0.3) cnt++;
            }
            if (cnt >= 3 && sc > bs) { bs = sc; best = dy; }
          }
          if (best === null) { fails++; continue; }
          const ys = pred.map((y) => y + best);
          const np = { k, xc: k * SW + Math.min(SW, w - k * SW) / 2, ys, top: ys[0], sp: (ys[4] - ys[0]) / 4, score: 0, ext: true };
          if (dir < 0) g.pts.unshift(np); else g.pts.push(np);
          fails = 0;
        }
      }
    }
    const result = staves.map((g) => buildStaff(g.pts, w, bin, h, s, t));
    result.sort((a, b) => a.mid - b.mid);
    const out = [];
    for (const st of result) {
      if (out.length && Math.abs(out[out.length - 1].mid - st.mid) < 2 * st.sp) continue;
      out.push(st);
    }
    return out;
  }

  function polyfit(xs, ys, deg) {
    // moindres carrés (deg 1 ou 2), x normalisé
    const n = xs.length, m = deg + 1;
    const A = Array.from({ length: m }, () => new Float64Array(m + 1));
    for (let i = 0; i < n; i++) {
      const p = [1, xs[i], xs[i] * xs[i]];
      for (let r = 0; r < m; r++) { for (let c = 0; c < m; c++) A[r][c] += p[r] * p[c]; A[r][m] += p[r] * ys[i]; }
    }
    for (let c = 0; c < m; c++) {
      let piv = c; for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]];
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (let r = 0; r < m; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= m; k++) A[r][k] -= f * A[c][k]; }
    }
    return A.map((row, i) => row[m] / row[i]);
  }
  function buildStaff(pts, w, bin, h, s, t) {
    const n = pts.length;
    const X = pts.map((p) => p.xc / w);
    // ajustement robuste de chaque ligne (quadratique si assez de points)
    let inl = pts.map(() => true);
    const fits = [];
    for (let iter = 0; iter < 3; iter++) {
      const idx = pts.map((_, i) => i).filter((i) => inl[i]);
      const deg = idx.length >= 6 ? 2 : (idx.length >= 2 ? 1 : 0);
      for (let li = 0; li < 5; li++) {
        if (deg === 0) { fits[li] = [pts[idx[0] || 0].ys[li], 0, 0]; continue; }
        const c = polyfit(idx.map((i) => X[i]), idx.map((i) => pts[i].ys[li]), deg) || [pts[0].ys[li], 0];
        fits[li] = [c[0], c[1] || 0, c[2] || 0];
      }
      const sp = pts.reduce((a, p) => a + p.sp, 0) / n;
      const ev = (li, x) => fits[li][0] + fits[li][1] * x + fits[li][2] * x * x;
      const res = pts.map((p, i) => Math.max(...p.ys.map((y, li) => Math.abs(y - ev(li, X[i])))));
      const lim = Math.max(0.3 * sp, iter === 0 ? 0.8 * sp : 0.4 * sp);
      const ninl = res.map((r) => r <= lim);
      if (ninl.filter(Boolean).length < Math.max(2, 0.4 * n)) break;
      inl = ninl;
    }
    const ly = [0, 1, 2, 3, 4].map(() => new Float32Array(w));
    const ip = pts.filter((_, i) => inl[i]).sort((a, b) => a.xc - b.xc);
    for (let li = 0; li < 5; li++) {
      const f = fits[li];
      const ev = (x) => { const u = x / w; return f[0] + f[1] * u + f[2] * u * u; };
      let j = 0;
      for (let x = 0; x < w; x++) {
        let y;
        if (ip.length < 2 || x <= ip[0].xc) y = ev(x) + (ip.length ? ip[0].ys[li] - ev(ip[0].xc) : 0);
        else if (x >= ip[ip.length - 1].xc) { const L = ip[ip.length - 1]; y = ev(x) + (L.ys[li] - ev(L.xc)); }
        else {
          while (ip[j + 1].xc < x) j++;
          const A = ip[j], B = ip[j + 1], u = (x - A.xc) / (B.xc - A.xc);
          y = A.ys[li] + (B.ys[li] - A.ys[li]) * u;
        }
        ly[li][x] = y;
      }
    }
    const allPts = pts;
    // affinage local : recentrage de chaque ligne sur le pixel noir le plus proche (suivi)
    for (let li = 0; li < 5; li++) {
      const L = ly[li];
      const refined = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        const yc = L[x]; let best = null, bd = 1e9;
        for (let y = Math.round(yc - t - 1); y <= Math.round(yc + t + 1); y++) {
          if (y < 0 || y >= h || !bin[y * w + x]) continue;
          // centre de la plage
          let a = y, b = y; while (a > 0 && bin[(a - 1) * w + x]) a--; while (b < h - 1 && bin[(b + 1) * w + x]) b++;
          if (b - a + 1 > 2 * t + 2) continue;
          const c = (a + b) / 2, dd = Math.abs(c - yc);
          if (dd < bd) { bd = dd; best = c; }
        }
        refined[x] = best === null ? NaN : best;
      }
      // lissage : moyenne glissante des écarts valides
      const R = Math.round(1.5 * s);
      let sum = 0, cnt = 0;
      const dev = new Float32Array(w); const ok = new Uint8Array(w);
      for (let x = 0; x < w; x++) if (!isNaN(refined[x])) { dev[x] = refined[x] - L[x]; ok[x] = 1; }
      const out = new Float32Array(w);
      for (let x = 0; x < w + R; x++) {
        if (x < w && ok[x]) { sum += dev[x]; cnt++; }
        const xo = x - R - 1; if (xo >= 0 && ok[xo]) { sum -= dev[xo]; cnt--; }
        const xc = x - (R >> 1);
        if (xc >= 0 && xc < w) out[xc] = cnt > 3 ? sum / cnt : 0;
      }
      for (let x = 0; x < w; x++) L[x] += out[x];
    }
    // étendue horizontale
    const n2 = allPts.length;
    const x0g = 0, x1g = w - 1;
    const present = (x) => {
      let c = 0;
      for (let li = 0; li < 5; li++) {
        const y = Math.round(ly[li][x]);
        let hit = 0; for (let dy = -2; dy <= 2; dy++) { const yy = y + dy; if (yy >= 0 && yy < h && bin[yy * w + x]) hit = 1; }
        c += hit;
      }
      if (c < 4) return false;
      // les interlignes doivent être majoritairement blancs (pas un bord de page noir)
      let white = 0;
      for (let li = 0; li < 4; li++) { const y = Math.round((ly[li][x] + ly[li + 1][x]) / 2); if (y >= 0 && y < h && !bin[y * w + x]) white++; }
      return white >= 2;
    };
    let x0 = Math.round(Math.min(...allPts.map((p) => p.xc))), x1 = Math.round(Math.max(...allPts.map((p) => p.xc)));
    const extend = (start, dir, lim) => {
      const Wn = Math.round(2 * s); const hist = []; let cnt = 0, last = start;
      for (let x = start; dir < 0 ? x >= lim : x <= lim; x += dir) {
        const p = present(x) ? 1 : 0; hist.push(p); cnt += p;
        if (hist.length > Wn) cnt -= hist.shift();
        if (p) last = x;
        if (hist.length >= Wn && cnt < 0.2 * Wn) break;
      }
      return last;
    };
    x0 = extend(x0, -1, x0g);
    x1 = extend(x1, +1, x1g);
    const xm = Math.round((x0 + x1) / 2);
    const sp = (ly[4][xm] - ly[0][xm]) / 4;
    return { ly, x0, x1, sp, mid: ly[2][xm] };
  }

  function staffSp(st, x) { x = Math.max(0, Math.min(st.ly[0].length - 1, Math.round(x))); return (st.ly[4][x] - st.ly[0][x]) / 4; }
  function lineAt(st, li, x) { x = Math.max(0, Math.min(st.ly[0].length - 1, Math.round(x))); return st.ly[li][x]; }

  // Suppression des lignes de portée et des lignes supplémentaires
  function removeStaffLines(bin, w, h, staves, t, s) {
    const out = bin.slice();
    const maxRun = Math.max(Math.round(t) + 2, Math.round(1.7 * t));
    const eraseAt = (x, yc, tol) => {
      let best = -1, bd = 1e9;
      for (let y = Math.round(yc - tol); y <= Math.round(yc + tol); y++) {
        if (y < 0 || y >= h || !bin[y * w + x]) continue;
        const dd = Math.abs(y - yc); if (dd < bd) { bd = dd; best = y; }
      }
      if (best < 0) return 0;
      let a = best, b = best;
      while (a > 0 && bin[(a - 1) * w + x]) a--;
      while (b < h - 1 && bin[(b + 1) * w + x]) b++;
      if (b - a + 1 <= maxRun) { for (let y = a; y <= b; y++) out[y * w + x] = 0; return 1; }
      return 2; // traversé par un symbole
    };
    for (const st of staves) {
      const xa = Math.max(0, st.x0 - 2), xb = Math.min(w - 1, st.x1 + 2);
      for (let li = 0; li < 5; li++) for (let x = xa; x <= xb; x++) eraseAt(x, st.ly[li][x], t / 2 + 1.5);
      // lignes supplémentaires (au-dessus / en dessous)
      for (const dir of [-1, 1]) {
        for (let k = 1; k <= 5; k++) {
          const segs = [];
          let run = null;
          for (let x = xa; x <= xb; x++) {
            const sp = staffSp(st, x);
            const yc = (dir < 0 ? st.ly[0][x] : st.ly[4][x]) + dir * k * sp;
            let hit = false;
            for (let y = Math.round(yc - t / 2 - 1.5); y <= Math.round(yc + t / 2 + 1.5); y++) if (y >= 0 && y < h && bin[y * w + x]) { hit = true; break; }
            if (hit) { if (!run) run = { a: x, b: x }; else run.b = x; }
            else if (run) { segs.push(run); run = null; }
          }
          if (run) segs.push(run);
          for (const sg of segs) {
            const L = sg.b - sg.a + 1;
            if (L < 0.9 * s || L > 4.5 * s) continue;
            // vérifier que la majorité des colonnes sont de fines plages (ligne)
            let thin = 0;
            for (let x = sg.a; x <= sg.b; x++) {
              const sp = staffSp(st, x);
              const yc = (dir < 0 ? st.ly[0][x] : st.ly[4][x]) + dir * k * sp;
              let y = -1; for (let yy = Math.round(yc - t / 2 - 1.5); yy <= Math.round(yc + t / 2 + 1.5); yy++) if (yy >= 0 && yy < h && bin[yy * w + x]) { y = yy; break; }
              if (y < 0) continue;
              let a = y, b = y; while (a > 0 && bin[(a - 1) * w + x]) a--; while (b < h - 1 && bin[(b + 1) * w + x]) b++;
              if (b - a + 1 <= maxRun) thin++;
            }
            if (thin < 0.35 * L) continue;
            for (let x = sg.a; x <= sg.b; x++) {
              const sp = staffSp(st, x);
              eraseAt(x, (dir < 0 ? st.ly[0][x] : st.ly[4][x]) + dir * k * sp, t / 2 + 1.5);
            }
          }
        }
      }
    }
    return out;
  }

  // Remplissage des trous de taille "tête de note"
  function fillNoteHoles(src, w, h, s, target, strict, nsLabels) {
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) inv[i] = src[i] ? 0 : 1;
    const { labels, comps } = labelComponents(inv, w, h, false, 1);
    const ok = new Uint8Array(comps.length + 1);
    for (const c of comps) {
      if (c.x0 === 0 || c.y0 === 0 || c.x1 === w - 1 || c.y1 === h - 1) continue;
      if (c.w > 1.25 * s || c.h > 1.05 * s) continue;
      const ratio = c.area / (c.w * c.h);
      if (c.area > 0.12 * s * s && ratio > 0.86) continue; // rectangle (entre lignes et hampes)
      if (c.area > 0.12 * s * s && c.h < 0.17 * s) continue; // interstice de ligatures
      if (strict && (c.h < 0.28 * s || c.w / c.h > 2.6 || c.area < 0.06 * s * s || ratio > 0.84)) continue;
      if (strict) {
        // part du contour formée par des pixels de ligne de portée effacés
        let bnd = 0, lineB = 0;
        for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
          if (labels[y * w + x] !== c.id) continue;
          for (const j of [(y - 1) * w + x, (y + 1) * w + x, y * w + x - 1, y * w + x + 1]) {
            if (src[j]) { bnd++; if (!strict[j]) lineB++; }
          }
        }
        if (!bnd) continue;
        // trou entre deux symboles distincts (altération collée à une tête, etc.) : pas une tête creuse
        if (lineB / bnd > 0.3) {
          // tête creuse dont le haut/bas coïncide avec les lignes : parois latérales épaisses et courbes
          if (c.w < 0.35 * s || c.w > 1.0 * s || c.h < 0.5 * s) continue;
          const yc = Math.round(c.cy);
          let xl = c.x0 - 1, xr = c.x1 + 1;
          while (xl >= 0 && labels[yc * w + xl] === c.id) xl--;
          let lw = 0; while (xl - lw >= 0 && src[yc * w + xl - lw]) lw++;
          while (xr < w && labels[yc * w + xr] === c.id) xr++;
          let rw = 0; while (xr + rw < w && src[yc * w + xr + rw]) rw++;
          if (lw < 0.18 * s || rw < 0.18 * s || lw > 0.8 * s || rw > 0.8 * s) continue;
        }
      }
      ok[c.id] = 1;
    }
    for (let i = 0; i < w * h; i++) if (labels[i] && ok[labels[i]]) target[i] = 1;
  }

  // ---------------------------------------------------------- classification
  // Descripteur d'une composante (taille relative + grille de densité 8x8)
  function componentFeatures(img, w, labels, C, s, idSet) {
    const G = 8;
    const f = new Float32Array(4 + G * G);
    f[0] = C.w / s; f[1] = C.h / s; f[2] = C.area / (C.w * C.h); f[3] = C.w / C.h;
    const cnt = new Float32Array(G * G), tot = new Float32Array(G * G);
    for (let y = C.y0; y <= C.y1; y++) {
      const gy = Math.min(G - 1, Math.floor((y - C.y0) * G / C.h));
      for (let x = C.x0; x <= C.x1; x++) {
        const gx = Math.min(G - 1, Math.floor((x - C.x0) * G / C.w));
        tot[gy * G + gx]++;
        const l = labels[y * w + x];
        if (idSet ? idSet.has(l) : l === C.id) cnt[gy * G + gx]++;
      }
    }
    for (let i = 0; i < G * G; i++) f[4 + i] = tot[i] ? cnt[i] / tot[i] : 0;
    return f;
  }
  function featuresPred(x0, y0, x1, y1, pred, area, s) {
    const G = 8, W = x1 - x0 + 1, H = y1 - y0 + 1;
    const f = new Float32Array(4 + G * G);
    f[0] = W / s; f[1] = H / s; f[2] = area / (W * H); f[3] = W / H;
    const cnt = new Float32Array(G * G), tot = new Float32Array(G * G);
    for (let y = y0; y <= y1; y++) {
      const gy = Math.min(G - 1, Math.floor((y - y0) * G / H));
      for (let x = x0; x <= x1; x++) { const gx = Math.min(G - 1, Math.floor((x - x0) * G / W)); tot[gy * G + gx]++; if (pred(x, y)) cnt[gy * G + gx]++; }
    }
    for (let i = 0; i < G * G; i++) f[4 + i] = tot[i] ? cnt[i] / tot[i] : 0;
    return f;
  }
  const FW = [3.0, 3.0, 1.5, 1.5]; // poids des 4 premières caractéristiques
  function knnClassify(feat, model, k = 5) {
    if (!model || !model.samples) return { cls: 'other', conf: 0 };
    const S = model.samples, D = model.dim, sc = model.scale;
    const dists = []; let worst = Infinity;
    for (let i = 0; i < S.length; i++) {
      const v = S[i].v; let d = 0;
      for (let j = 0; j < 4; j++) { const diff = (feat[j] - v[j] / sc[j]) * FW[j]; d += diff * diff; }
      if (d >= worst) continue;
      for (let j = 4; j < D; j++) { const diff = feat[j] - v[j] / 255; d += diff * diff; if (d >= worst) break; }
      if (d >= worst) continue;
      dists.push([d, S[i].c]);
      if (dists.length >= k) { dists.sort((a, b) => a[0] - b[0]); dists.length = k; worst = dists[k - 1][0]; }
    }
    dists.sort((a, b) => a[0] - b[0]);
    const votes = {};
    for (let i = 0; i < Math.min(k, dists.length); i++) {
      const wgt = 1 / (1e-3 + Math.sqrt(dists[i][0]));
      votes[dists[i][1]] = (votes[dists[i][1]] || 0) + wgt;
    }
    let best = 'other', bv = -1, tot = 0;
    for (const c in votes) { tot += votes[c]; if (votes[c] > bv) { bv = votes[c]; best = c; } }
    for (const c in votes) votes[c] /= tot;
    return { cls: best, conf: bv / tot, dist: Math.sqrt(dists[0][0]), votes };
  }

  // -------------------------------------------------------------- musique
  const CLEF_BOTTOM = { G: 30, F: 18, C: 24 }; // index diatonique de la ligne du bas (C0=0 : C4=28)
  const STEP_SEMI = [0, 2, 4, 5, 7, 9, 11];
  const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B (indices de lettres)
  const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];  // B E A D G C F
  function diatonicToMidi(d, alter) { const oct = Math.floor(d / 7), l = ((d % 7) + 7) % 7; return 12 * (oct + 1) + STEP_SEMI[l] + alter; }
  function keyAlter(fifths, letter) {
    if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(letter) ? 1 : 0;
    if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).includes(letter) ? -1 : 0;
    return 0;
  }
  const NOTE_NAMES_FR = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];

  // ----------------------------------------------------------------- analyse
  function analyze(rgba, W0, H0, opts = {}) {
    const log = opts.log || (() => {});
    const progress = opts.progress || (() => {});
    const t0 = Date.now();
    const gray0 = rgbaToGray(rgba, W0, H0);
    progress(0.05, 'Préparation de l’image');
    // passe 1 : basse résolution pour inclinaison + interligne
    const r1 = Math.min(1, 2000 / Math.max(W0, H0));
    let P = warp(gray0, W0, H0, r1, 0);
    let b1 = binarize(P.img, P.w, P.h, Math.round(Math.max(P.w, P.h) / 25));
    let angle = opts.angle != null ? opts.angle : -estimateSkew(b1, P.w, P.h);
    if (Math.abs(angle) > 0.15) { P = warp(gray0, W0, H0, r1, angle); b1 = binarize(P.img, P.w, P.h, Math.round(Math.max(P.w, P.h) / 25)); }
    let m1 = staffMetrics(b1, P.w, P.h);
    log('passe1', { angle, m1 });
    // la passe basse résolution peut rater des portées minuscules : retente en pleine résolution
    if (m1.s < 7 && r1 < 1) {
      const r1b = Math.min(1, 2800 / Math.max(W0, H0));
      const Pb = warp(gray0, W0, H0, r1b, angle);
      const bb = binarize(Pb.img, Pb.w, Pb.h, Math.round(Math.max(Pb.w, Pb.h) / 25));
      const mb = staffMetrics(bb, Pb.w, Pb.h);
      m1 = { t: mb.t * r1 / r1b, s: mb.s * r1 / r1b };
    }
    const sOrig = m1.s / r1;
    let scale = TARGET_S / sOrig;
    const maxDim = 5200;
    if (Math.max(W0, H0) * scale > maxDim) scale = maxDim / Math.max(W0, H0);
    progress(0.15, 'Normalisation');
    P = warp(gray0, W0, H0, scale, angle);
    const w = P.w, h = P.h;
    const gs = P.img;
    let bin = binarize(gs, w, h, Math.round(TARGET_S * 5));
    const met = staffMetrics(bin, w, h);
    const s = met.s, t = Math.max(1, met.t);
    log('metrics', { scale, s, t, w, h });
    progress(0.25, 'Recherche des portées');
    const binL = binarize(boxBlur(P.img, w, h, Math.round(0.4 * s), 0), w, h, Math.round(TARGET_S * 5), 0.08);
    for (let i = 0; i < w * h; i++) binL[i] |= bin[i];
    const stA = findStaves(bin, w, h, t, s), stB = findStaves(binL, w, h, t, s), stC = opts.noShear ? [] : findStaves(binL, w, h, t, s, false, true);
    const staves = stA.slice();
    for (const b of stB.concat(stC)) {
      const i = staves.findIndex((a) => Math.abs(a.mid - b.mid) < 2 * a.sp);
      if (i < 0) staves.push(b);
      else if ((b.x1 - b.x0) > 1.15 * (staves[i].x1 - staves[i].x0)) staves[i] = b;
    }
    staves.sort((a, b) => a.mid - b.mid);
    log('staves', staves.length);
    const T = { scale, angle, w, h, srcW: W0, srcH: H0 };
    if (!staves.length) return { ok: false, error: 'Aucune portée détectée. Cadrez la partition bien à plat, nette et éclairée.', transform: T, staves: [], events: [] };
    progress(0.35, 'Suppression des lignes');
    const ns = removeStaffLines(bin, w, h, staves, t, s);
    progress(0.45, 'Analyse des symboles');
    const { labels, comps } = labelComponents(ns, w, h, true, 1);
    // attribution des composantes aux portées
    const staffOf = (x, y) => {
      let best = -1, bd = 1e9;
      staves.forEach((st, i) => { const d = Math.abs(lineAt(st, 2, x) - y); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    for (const C of comps) {
      C.staff = staffOf(C.cx, C.cy);
      const st = staves[C.staff];
      C.rel = (C.cy - lineAt(st, 2, C.cx)) / staffSp(st, C.cx); // position relative à la ligne du milieu (en interlignes)
    }
    // ---- têtes de notes
    progress(0.55, 'Têtes de notes');
    const filled = ns.slice();
    fillNoteHoles(ns, w, h, s, filled);
    if (!opts.noBinHoles) fillNoteHoles(bin, w, h, s, filled, ns, labels);
    const dt = distanceTransform(filled, w, h);
    const coreThr = 0.34 * s;
    const core = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (dt[i] >= coreThr) core[i] = 1;
    const cores = labelComponents(core, w, h, true, 1).comps;
    let heads = [];
    // noyaux trop grands (tête soudée à une altération, trous comblés entre symboles) : seuil local plus élevé
    for (let ci = 0; ci < cores.length; ci++) {
      const c = cores[ci];
      if (c.sub || !(c.w > 1.6 * s || c.h > 1.2 * s) || c.w > 6 * s || c.h > 4 * s) continue;
      for (const thr of [0.42 * s, 0.5 * s]) {
        const bw = c.w, bh = c.h, sub = new Uint8Array(bw * bh);
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = (c.y0 + y) * w + c.x0 + x; if (dt[i] >= thr) sub[y * bw + x] = 1; }
        const sc = labelComponents(sub, bw, bh, true, 1).comps.filter((q) => q.w <= 2.2 * s && q.h <= 1.2 * s);
        if (sc.length) { sc.forEach((q) => cores.push({ x0: q.x0 + c.x0, y0: q.y0 + c.y0, x1: q.x1 + c.x0, y1: q.y1 + c.y0, w: q.w, h: q.h, cx: q.cx + c.x0, cy: q.cy + c.y0, sub: true })); break; }
      }
    }
    for (const c of cores) {
      if (c.w > 2.2 * s || c.h > 1.2 * s) continue;
      let cx = c.cx, cy = c.cy;
      const st = staves[staffOf(cx, cy)];
      if (!st) continue;
      const sp = staffSp(st, cx);
      if (cx < st.x0 - s || cx > st.x1 + s) continue;
      if (cy < lineAt(st, 0, cx) - 5.5 * sp || cy > lineAt(st, 4, cx) + 5.5 * sp) continue;
      // au-delà de la portée, une vraie note s'appuie sur TOUTES les lignes supplémentaires intermédiaires
      const above = cy < lineAt(st, 0, cx) - 1.2 * sp, below = cy > lineAt(st, 4, cx) + 1.2 * sp;
      if (above || below) {
        const dist = above ? lineAt(st, 0, cx) - cy : cy - lineAt(st, 4, cx);
        const K = Math.max(1, Math.floor(dist / sp + 0.25));
        let okL = true;
        for (let kk = 1; kk <= K && okL; kk++) {
          const ly0 = above ? lineAt(st, 0, cx) - kk * sp : lineAt(st, 4, cx) + kk * sp;
          let hits = 0, tot = 0; const tol = t + 1 + (kk > 1 ? 1 : 0);
          for (let x = Math.round(cx - 0.9 * s); x <= Math.round(cx + 0.9 * s); x++) {
            tot++;
            for (let y = Math.round(ly0 - tol); y <= Math.round(ly0 + tol); y++) if (y >= 0 && y < h && x >= 0 && x < w && bin[y * w + x]) { hits++; break; }
          }
          if (hits < 0.75 * tot) okL = false;
        }
        if (!okL) continue;
      }
      // étendue de la tête dans l'image remplie
      const row = Math.round(cy) * w;
      let xl = Math.round(cx), xr = Math.round(cx);
      while (xl > 0 && filled[row + xl - 1] && cx - xl < 1.4 * s) xl--;
      while (xr < w - 1 && filled[row + xr + 1] && xr - cx < 1.4 * s) xr++;
      let yt = Math.round(cy), yb = Math.round(cy);
      while (yt > 0 && filled[(yt - 1) * w + Math.round(cx)] && cy - yt < 1.2 * s) yt--;
      while (yb < h - 1 && filled[(yb + 1) * w + Math.round(cx)] && yb - cy < 1.2 * s) yb++;
      let hw = (xr - xl + 1); const hh = (yb - yt + 1);
      if (hw > 1.75 * s && c.sub) { xl = Math.max(xl, Math.round(c.cx - 0.68 * s)); xr = Math.min(xr, Math.round(c.cx + 0.68 * s)); hw = xr - xl + 1; }
      if ((cx - xl >= 1.4 * s - 1 && xr - cx >= 1.4 * s - 1) || hw > 2.15 * s || hw < 0.8 * s || hh < 0.75 * s || hh > 1.6 * s) continue;
      let maxd = 0; for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (dt[y * w + x] > maxd) maxd = dt[y * w + x];
      if (maxd < 0.37 * s && c.w * c.h < 4) continue; // noyau ponctuel : coin comblé entre ligature et ligne
      heads.push({ cx: (xl + xr) / 2, cy: (yt + yb) / 2 * 0.5 + cy * 0.5, wpx: hw, hpx: hh, r: maxd, st: staves.indexOf(st), comp: majorityLabel(labels, w, h, cx, cy, 0.7 * s), sub: !!c.sub });
    }
    // fusion des doublons
    heads.sort((a, b) => a.cx - b.cx);
    const merged = [];
    for (const hd of heads) {
      const m = merged.find((q) => Math.abs(q.cx - hd.cx) < 0.6 * s && Math.abs(q.cy - hd.cy) < 0.45 * s);
      if (m) { if (hd.r > m.r) Object.assign(m, hd); } else merged.push(hd);
    }
    heads = merged;
    // ---- classification des composantes (kNN)
    const model = opts.model;
    for (const C of comps) {
      if (C.area < 0.03 * s * s) { C.cls = 'speck'; continue; }
      if (C.w > 8 * s || C.h > 9 * s) { C.cls = 'other'; continue; }
      C.feat = componentFeatures(ns, w, labels, C, s);
      const r = knnClassify(C.feat, model);
      C.cls = r.cls; C.conf = r.conf; C.kdist = r.dist; C.votes = r.votes;
    }
    // fusion de fragments (symbole coupé par la suppression des lignes)
    if (model) mergeFragments(comps, labels, ns, w, h, s, t, model);
    // ---- lignes de texte (titre, tempo, indications, paroles) : jamais des notes
    const { textComps, textLines } = findTextLines(comps, staves, s, new Set(heads.map((hd) => hd.comp)));
    // une tête dans un symbole reconnu (clé, chiffre, altération, silence, nuance, texte) est un faux positif
    const NONHEAD = /^(clef|t\d|time|sharp|flat|natural|dsharp|dflat|rest)/, NONHEAD2 = /^(dyn_|accent|marcato|fermata|breath)/;
    heads = heads.filter((hd) => {
      const C = comps[hd.comp - 1];
      if (C && NONHEAD.test(C.cls) && C.conf >= 0.6) return false;
      if (C && NONHEAD2.test(C.cls) && C.conf >= 0.85) return false;
      if (C && textComps.has(C.id)) return false;
      return !textLines.some((L) => hd.cx > L.x0 - 0.2 * s && hd.cx < L.x1 + 0.2 * s && hd.cy > L.y0 - 0.1 * s && hd.cy < L.y1 + 0.1 * s);
    });
    const headComp = new Set(heads.map((hd) => hd.comp));
    for (const C of comps) C.isHead = headComp.has(C.id);
    // ---- en-têtes (clé, armure, chiffrage) par portée
    progress(0.7, 'Clés et armures');
    const staffInfo = staves.map((st, si) => {
      const sp = st.sp;
      const mine = comps.filter((C) => C.staff === si && C.x1 >= st.x0 - 0.5 * s && C.x0 <= st.x1 && Math.abs(C.rel) < 6);
      mine.sort((a, b) => a.x0 - b.x0);
      let clef = null;
      for (const C of mine) {
        if (C.x0 > st.x0 + 12 * sp) break;
        if (C.w > 4 * sp || C.h > 9 * sp) continue;
        if ((C.h >= 2.6 * sp && C.w >= 1.2 * sp && (!model || /^clef/.test(C.cls))) || /^clef/.test(C.cls)) {
          let shape = null;
          if (C.cls === 'clefG' || C.cls === 'clefF' || C.cls === 'clefC') shape = C.cls.slice(4);
          if (!shape) shape = C.h > 5.2 * sp ? 'G' : (C.y1 < lineAt(st, 3, C.cx) + 0.5 * sp && C.y0 > lineAt(st, 0, C.cx) - 0.8 * sp) ? 'F' : (C.h > 3.6 * sp && C.h < 4.8 * sp ? 'C' : 'G');
          clef = { shape, comp: C };
          break;
        }
      }
      let x = clef ? clef.comp.x1 : st.x0;
      // armure : suite d'altérations juste après la clé
      const firstHeadX = Math.min(...heads.filter((hd) => hd.st === si && hd.cx > x + 0.6 * sp).map((hd) => hd.cx - hd.wpx), st.x1);
      let sharps = 0, flats = 0; const keyComps = [];
      const after = mine.filter((C) => C.x0 > x - 0.2 * sp && C.x1 < firstHeadX && !C.isHead && C.cls !== 'speck' && !(clef && C.id === clef.comp.id));
      // ignorer les points de la clé de fa
      for (const C of after) {
        if (C.area < 0.3 * sp * sp && C.x0 < x + 1.2 * sp && keyComps.length === 0) continue; // points de la clé de fa, débris
        if (C.cls !== 'sharp' && C.cls !== 'flat' && C.cls !== 'natural' && ((C.h < 1.2 * sp && C.w < 0.8 * sp) || C.h < 0.6 * sp)) continue; // fragment / reste de ligne
        if (C.x0 > x + 2.2 * sp) break;
        if (C.cls === 'sharp') { sharps++; keyComps.push(C); x = C.x1; }
        else if (C.cls === 'flat') { flats++; keyComps.push(C); x = C.x1; }
        else if (C.cls === 'natural') { keyComps.push(C); x = C.x1; }
        else break;
      }
      const fifths = sharps > flats ? Math.min(7, sharps) : -Math.min(7, flats);
      // chiffrage de mesure
      let time = null; const timeComps = [];
      const ts = after.filter((C) => C.x0 >= x - 0.2 * sp && C.x0 < x + 3 * sp && /^(t\d|timeC|timeCut)$/.test(C.cls));
      if (model && !ts.some((C) => C.cls === 'timeC' || C.cls === 'timeCut')) {
        // chiffres collés (6 sur 8 soudés après effacement des lignes) : découpe à la ligne du milieu
        const region = after.filter((C) => C.x0 >= x - 0.2 * sp && C.x0 < x + 3 * sp && C.h >= 0.8 * sp && C.w >= 0.2 * sp && C.w <= 2.6 * sp && !/^(sharp|flat|natural)$/.test(C.cls));
        const parts = [];
        for (const C of region) {
          const ym = lineAt(st, 2, C.cx);
          const halves = (C.y0 < ym - 0.5 * sp && C.y1 > ym + 0.5 * sp) ? [[C.y0, Math.floor(ym)], [Math.ceil(ym), C.y1]] : [[C.y0, C.y1]];
          for (const [ya, yb] of halves) {
            const pred = (xx, yy) => yy >= ya && yy <= yb && labels[yy * w + xx] === C.id;
            let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, area = 0;
            for (let yy = ya; yy <= yb; yy++) for (let xx = C.x0; xx <= C.x1; xx++) if (pred(xx, yy)) { area++; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
            if (area < 0.15 * sp * sp || y1 - y0 < 0.6 * sp) continue;
            const r = knnClassify(featuresPred(x0, y0, x1, y1, pred, area, s), model);
            if (/^t\d$/.test(r.cls) && r.conf >= 0.5) parts.push({ cls: r.cls, rel: ((y0 + y1) / 2 - ym) / sp, x0, x1, C });
          }
        }
        const top = parts.filter((p) => p.rel < 0).sort((a, b) => a.x0 - b.x0), bot = parts.filter((p) => p.rel >= 0).sort((a, b) => a.x0 - b.x0);
        if (top.length && bot.length) {
          const num = parseInt(top.map((p) => p.cls.slice(1)).join(''), 10), den = parseInt(bot.map((p) => p.cls.slice(1)).join(''), 10);
          if (num > 0 && num <= 16 && [2, 4, 8, 16].includes(den)) { time = [num, den]; parts.forEach((p) => { if (!timeComps.includes(p.C)) timeComps.push(p.C); }); }
        }
      }
      if (!time && ts.length) {
        const c0 = ts.find((C) => C.cls === 'timeC' || C.cls === 'timeCut');
        if (c0) { time = c0.cls === 'timeC' ? [4, 4] : [2, 2]; timeComps.push(c0); }
        else {
          const top = ts.filter((C) => C.rel < 0).sort((a, b) => a.x0 - b.x0);
          const bot = ts.filter((C) => C.rel >= 0).sort((a, b) => a.x0 - b.x0);
          const num = parseInt(top.map((C) => C.cls.slice(1)).join(''), 10), den = parseInt(bot.map((C) => C.cls.slice(1)).join(''), 10);
          if (num > 0 && [1, 2, 4, 8, 16, 32].includes(den)) { time = [num, den]; timeComps.push(...top, ...bot); }
        }
      }
      const headerEnd = Math.max(x, ...timeComps.map((C) => C.x1));
      return { clef: clef ? clef.shape : 'G', clefComp: clef && clef.comp, fifths, keyComps, time, headerEnd };
    });
    // une armure est commune : on prend la valeur la plus fréquente non nulle si la plupart des portées l'ont
    const keyVotes = {}; staffInfo.forEach((si) => (keyVotes[si.fifths] = (keyVotes[si.fifths] || 0) + 1));
    const globalKey = +Object.keys(keyVotes).sort((a, b) => keyVotes[b] - keyVotes[a])[0];
    const timeSig = (staffInfo.find((si) => si.time) || {}).time || null;

    // filtrage des têtes situées dans l'en-tête (clé, armure)
    heads = heads.filter((hd) => {
      const si = staffInfo[hd.st];
      if (si.clefComp && hd.cx < si.clefComp.x1 + 0.3 * s && hd.cx > si.clefComp.x0 - 0.3 * s) return false;
      if (hd.cx < si.headerEnd - 0.2 * s) return false;
      return true;
    });

    // ---- hampes, ligatures, crochets
    progress(0.8, 'Rythmes');
    let vrunX = 0; const gapTol = Math.max(1, Math.round(0.2 * s));
    const binS = binarize(P.img, w, h, Math.round(TARGET_S * 3), 0.06);
    for (let i = 0; i < w * h; i++) binS[i] |= bin[i];
    const vrun = (x, y, dir, maxLen) => { // plage noire verticale suivie (tolère 1px de trou et une légère inclinaison)
      let yy = y, xx = x, gap = 0, L = 0, lastX = x;
      while (L < maxLen) {
        const ny = yy + dir; if (ny < 0 || ny >= h) break;
        const r = ny * w;
        if (binS[r + xx]) { gap = 0; lastX = xx; }
        else if (xx > 0 && binS[r + xx - 1] && !binS[r + xx + 1]) { xx--; gap = 0; lastX = xx; }
        else if (xx < w - 1 && binS[r + xx + 1] && !binS[r + xx - 1]) { xx++; gap = 0; lastX = xx; }
        else if (++gap > gapTol) break;
        yy = ny; L++;
      }
      vrunX = lastX;
      return L - gap;
    };
    for (const hd of heads) {
      const st = staves[hd.st]; const sp = staffSp(st, hd.cx);
      const half = hd.wpx / 2;
      // hollow ?
      let blk = 0, tot = 0; const rr = Math.max(1.5, 0.2 * s);
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        const x = Math.round(hd.cx + dx), y = Math.round(hd.cy + dy); tot++; if (ns[y * w + x]) blk++;
      }
      hd.hollow = blk / tot < 0.5;
      if (!hd.hollow) {
        // test en niveaux de gris : centre plus clair que l'encre ?
        const G = P.img, rc = Math.max(1, 0.12 * s);
        let cs = 0, cn = 0; const vals = [];
        for (let dy = -Math.round(hd.hpx / 2); dy <= Math.round(hd.hpx / 2); dy++) for (let dx = -Math.round(hd.wpx / 2); dx <= Math.round(hd.wpx / 2); dx++) {
          const x = Math.round(hd.cx + dx), y = Math.round(hd.cy + dy); if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const v = G[y * w + x]; vals.push(v);
          if (dx * dx + dy * dy <= rc * rc) { cs += v; cn++; }
        }
        vals.sort((a, b) => a - b);
        const ink = vals[Math.floor(vals.length * 0.1)], paper = vals[vals.length - 1 - Math.floor(vals.length * 0.05)];
        const hv = paper - ink > 20 ? (cs / cn - ink) / (paper - ink) : 0;
        hd.hv = hv;
        if (hv > (opts.hollowThr || 0.3)) hd.hollow = true;
      }
      // recherche de hampe
      let best = { len: 0 };
      const tryCols = (xa, xb, dir) => {
        for (let x = Math.round(xa); x <= Math.round(xb); x++) {
          if (x < 0 || x >= w) continue;
          for (let y0 = Math.round(hd.cy - 0.35 * s); y0 <= Math.round(hd.cy + 0.35 * s); y0 += 2) {
            if (!bin[y0 * w + x]) continue;
            const R = vrun(x, y0, dir, Math.round(8 * s));
            const L = R + Math.abs(y0 - hd.cy) * (Math.sign(y0 - hd.cy) === dir ? 1 : -1);
            if (L > best.len) best = { len: L, x, dir, tip: y0 + dir * R, tipX: vrunX };
          }
        }
      };
      tryCols(hd.cx + half - 0.35 * s, hd.cx + half + 0.25 * s, -1); // hampe montante à droite
      tryCols(hd.cx - half - 0.25 * s, hd.cx - half + 0.35 * s, +1); // hampe descendante à gauche
      // largeur réelle de la "hampe" : rejeter les barres épaisses
      if (best.len >= 2.3 * sp) {
        hd.stem = { x: best.x, dir: best.dir, tip: best.tip, len: best.len, tipX: best.tipX };
        // affiner x de la hampe : colonne centrale de la plage horizontale à mi-hauteur
        const ym = Math.round((hd.cy + best.tip) / 2);
        let a = best.x, b = best.x; while (a > 0 && ns[ym * w + a - 1]) a--; while (b < w - 1 && ns[ym * w + b + 1]) b++;
        hd.stem.x = (a + b) / 2; hd.stem.width = b - a + 1;
        if (hd.stem.width > 0.6 * s) hd.stem = null;
      }
    }
    // une tête issue d'un noyau découpé doit être pleine (sinon : interstice entre ligatures, entre symboles)
    heads = heads.filter((hd) => !(hd.sub && hd.hollow));
    // fausses têtes au bout d'une hampe (crochets épais) : on les retire
    {
      const drop = new Set();
      for (const H of heads) {
        if (!H.stem) continue;
        for (const G of heads) {
          if (G === H || drop.has(H)) continue;
          if (Math.abs(G.cx - H.stem.tipX) < 1.1 * s && Math.abs(G.cy - H.stem.tip) < 1.3 * s && Math.abs(G.cy - H.cy) > 1.8 * s) {
            if (G.stem && G.stem.dir === H.stem.dir && Math.abs(G.stem.tip - H.stem.tip) > 1.5 * s) continue;
            if (G.r > 0.92 * H.r || drop.has(G)) continue;
            drop.add(G);
          }
        }
      }
      if (drop.size) heads = heads.filter((hd) => !drop.has(hd));
    }
    // les chiffres de triolets près des ligatures ne doivent pas compter comme ligatures
    const skipComp = new Uint8Array(comps.length + 1);
    const tupScore = (v) => v ? (v.tuplet3 || 0) + (v.t3 || 0) : 0;
    for (const C of comps) if (tupScore(C.votes) >= 0.6) skipComp[C.id] = 1;
    // chiffre « 3 » collé à la ligature : on l'isole au-dessus (ou en dessous) de la ligne des pointes de hampes
    const mergedTup = [];
    const digitMask = new Uint8Array(w * h);
    if (model) {
      const byComp = new Map();
      for (const hd of heads) if (hd.stem && hd.comp) { if (!byComp.has(hd.comp)) byComp.set(hd.comp, []); byComp.get(hd.comp).push(hd); }
      for (const [cid, hs] of byComp) {
        if (hs.length < 3) continue;
        hs.sort((a, b) => a.cx - b.cx);
        for (let k = 0; k + 2 < hs.length; k++) {
          const A = hs[k], M = hs[k + 1], Z = hs[k + 2];
          if (A.stem.dir !== Z.stem.dir || M.stem.dir !== A.stem.dir) continue;
          const dir = A.stem.dir; // -1 : hampes vers le haut, ligature en haut
          const ax = A.stem.tipX, ay = A.stem.tip, zx = Z.stem.tipX, zy = Z.stem.tip;
          if (zx - ax < 0.5 * s) continue;
          const lineY = (x) => ay + (zy - ay) * (x - ax) / (zx - ax);
          const xc = M.stem.tipX;
          const xa = Math.round(xc - 1.0 * s), xb = Math.round(xc + 1.0 * s);
          const inDigit = (x, y) => labels[y * w + x] === cid && (dir < 0 ? y < lineY(x) - 1 : y > lineY(x) + 1);
          let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, area = 0;
          const ya = Math.round(dir < 0 ? lineY(xc) - 2.2 * s : lineY(xc)), yb = Math.round(dir < 0 ? lineY(xc) : lineY(xc) + 2.2 * s);
          for (let y = Math.max(0, ya); y <= Math.min(h - 1, yb); y++) for (let x = Math.max(0, xa); x <= Math.min(w - 1, xb); x++) {
            if (!inDigit(x, y)) continue;
            area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
          if (area < 0.2 * s * s) continue;
          const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
          if (bh < 0.6 * s || bh > 2.0 * s || bw < 0.4 * s || bw > 1.6 * s) continue;
          const f = featuresPred(x0, y0, x1, y1, inDigit, area, s);
          const r = knnClassify(f, model);
          if (tupScore(r.votes) >= 0.6) {
            const st = staves[A.st];
            mergedTup.push({ staff: A.st, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inDigit(x, y)) digitMask[y * w + x] = 1;
            k += 2;
          }
        }
      }
    }
    // têtes partageant une hampe (accords) -> une seule hampe de référence
    for (const hd of heads) {
      if (!hd.stem) continue;
      const toHead = -hd.stem.dir; // direction de la pointe vers la tête
      const maxScan = Math.min(2.3 * s, Math.max(0.6 * s, Math.abs(hd.stem.tip - hd.cy) - 0.9 * s));
      let nb = 0;
      const probe = (px) => {
        px = Math.round(px); if (px < 0 || px >= w) return 0;
        let runs = 0, inRun = false, runLen = 0, longest = 0, total = 0;
        const yStart = Math.round(hd.stem.tip - toHead * 0.4 * s);
        for (let i = 0; i <= maxScan + 0.4 * s; i++) {
          const y = yStart + toHead * i; if (y < 0 || y >= h) break;
          const b = ns[y * w + px] && !skipComp[labels[y * w + px]] && !digitMask[y * w + px];
          if (b) { if (!inRun) { inRun = true; runLen = 0; } runLen++; total++; }
          else if (inRun) { inRun = false; if (runLen >= Math.max(2, 0.3 * s)) { runs++; longest = Math.max(longest, runLen); } }
        }
        if (inRun && runLen >= Math.max(2, 0.3 * s)) { runs++; longest = Math.max(longest, runLen); }
        if (longest > 1.0 * s) runs = Math.max(runs, Math.round((total + 0.25 * s) / (0.75 * s)));
        return runs;
      };
      const sx = hd.stem.tipX != null ? hd.stem.tipX : hd.stem.x, off1 = 0.45 * s, off2 = 0.75 * s;
      const right = probe(sx + off1) || probe(sx + off2);
      const left = probe(sx - off1) || probe(sx - off2);
      nb = Math.max(right, left);
      hd.beams = Math.min(4, nb);
    }
    // ---- barres de mesure
    const bars = [];
    for (const C of comps) {
      if (C.isHead) continue;
      const st = staves[C.staff]; const sp = staffSp(st, C.cx);
      if (C.h < 3.4 * sp || C.h > 4.6 * sp) continue;
      const meanW = C.area / C.h; // épaisseur moyenne (tolère une barre penchée par la perspective)
      if (meanW > 0.75 * sp || meanW < 0.06 * sp || C.w > Math.max(0.8 * sp, meanW + 0.12 * C.h)) continue;
      if (/^(sharp|flat|natural|dsharp|dflat|rest|clef|t\d|time)/.test(C.cls) && C.conf >= 0.8) continue;
      const top = lineAt(st, 0, C.cx), bot = lineAt(st, 4, C.cx);
      if (Math.abs(C.y0 - top) > 0.6 * sp || Math.abs(C.y1 - bot) > 0.6 * sp) continue;
      if (C.cx < staffInfo[C.staff].headerEnd - 0.5 * sp) continue;
      bars.push({ st: C.staff, x: C.cx, thick: meanW > 0.35 * sp, comp: C });
    }
    // ---- points (prolongation, reprises)
    const dots = comps.filter((C) => !C.isHead && C.w <= 0.8 * s && C.h <= 0.8 * s && C.w >= 0.18 * s && C.h >= 0.18 * s && Math.abs(C.w - C.h) <= 0.3 * s && C.area / (C.w * C.h) > 0.5);
    // ---- barres de reprise : deux points dans les 2e et 3e interlignes, collés à une barre
    const repeats = [];
    const repDots = new Set();
    for (const B of bars) {
      const st = staves[B.st]; const sp = staffSp(st, B.x);
      const yA = (lineAt(st, 1, B.x) + lineAt(st, 2, B.x)) / 2, yB = (lineAt(st, 2, B.x) + lineAt(st, 3, B.x)) / 2;
      for (const side of [-1, 1]) {
        const near = dots.filter((D) => D.staff === B.st && (side < 0 ? D.cx < B.comp.x0 && D.cx > B.comp.x0 - 1.3 * sp : D.cx > B.comp.x1 && D.cx < B.comp.x1 + 1.3 * sp));
        let dA = near.find((D) => Math.abs(D.cy - yA) < 0.35 * sp), dB = near.find((D) => Math.abs(D.cy - yB) < 0.35 * sp);
        if (!dA || !dB) {
          // deux points reliés en une seule composante (« : »)
          const colon = comps.find((D) => !D.isHead && D.staff === B.st && D.w <= 0.75 * sp && D.h >= 0.9 * sp && D.h <= 1.9 * sp &&
            Math.abs((D.y0 + D.y1) / 2 - lineAt(st, 2, B.x)) < 0.35 * sp && (side < 0 ? D.cx < B.comp.x0 && D.cx > B.comp.x0 - 1.3 * sp : D.cx > B.comp.x1 && D.cx < B.comp.x1 + 1.3 * sp));
          if (!colon) {
            // photo floue : points fondus avec la barre fine. On cherche, à côté d'une barre épaisse,
            // des colonnes noires dans les 2e et 3e interlignes mais blanches dans les 1er et 4e.
            if (!B.thick) continue;
            const y1s = (lineAt(st, 0, B.x) + lineAt(st, 1, B.x)) / 2, y4s = (lineAt(st, 3, B.x) + lineAt(st, 4, B.x)) / 2;
            const blk = (x, y) => { for (let d = -Math.round(0.15 * sp); d <= Math.round(0.15 * sp); d++) { const yy = Math.round(y + d); if (yy >= 0 && yy < h && ns[yy * w + x]) return true; } return false; };
            let cols = 0, cx0 = 1e9, cx1 = -1, thinBar = false;
            const xs = side < 0 ? B.comp.x0 - 1 : B.comp.x1 + 1;
            for (let k = 0; k < Math.round(1.8 * sp); k++) {
              const x = xs + side * k; if (x < 0 || x >= w) break;
              if (!thinBar) { if (k > 0.9 * sp) break; if (blk(x, y1s) && blk(x, y4s) && blk(x, yA) && blk(x, yB)) thinBar = true; continue; }
              const yl2 = Math.round(lineAt(st, 2, x));
              const midWhite = !ns[yl2 * w + x] || !ns[(yl2 - 1) * w + x] || !ns[(yl2 + 1) * w + x];
              if (blk(x, yA) && blk(x, yB) && !blk(x, y1s) && !blk(x, y4s) && midWhite) { cols++; cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x); }
            }
            if (cols < Math.max(2, 0.15 * sp)) continue;
            const pseudo = { x0: cx0, x1: cx1, cx: (cx0 + cx1) / 2 };
            dA = dB = pseudo;
          } else dA = dB = colon;
        }
        if (Math.abs(dA.cx - dB.cx) > 0.4 * sp) continue;
        const kind = side < 0 ? 'end' : 'start';
        const x = side < 0 ? Math.min(dA.x0, dB.x0) : Math.max(dA.x1, dB.x1);
        if (repeats.some((r) => r.st === B.st && r.kind === kind && Math.abs(r.x - x) < 2 * sp)) continue;
        repeats.push({ st: B.st, kind, x: side < 0 ? B.comp.x0 - 0.01 : B.comp.x1 + 0.01, box: [Math.min(B.comp.x0, dA.x0), B.comp.y0, Math.max(B.comp.x1, dA.x1), B.comp.y1] });
        repDots.add(dA); repDots.add(dB);
      }
    }
    // ---- crochets de 1re / 2e fin (voltes) au-dessus de la portée
    const voltas = [];
    for (const C of comps) {
      if (C.isHead || C.dead || C.cls === 'speck') continue;
      const st = staves[C.staff]; const sp = staffSp(st, C.cx);
      const top = lineAt(st, 0, C.cx);
      if (C.w < 2.5 * sp || C.h < 0.6 * sp || C.h > 3.2 * sp || C.y1 > top - 0.2 * sp || C.y0 < top - 7 * sp) continue;
      if (C.area / (C.w * C.h) > 0.35) continue;
      // trait horizontal en haut + crochet vertical à gauche
      let hrow = 0;
      for (let y = C.y0; y <= C.y0 + Math.max(2, Math.round(0.3 * sp)); y++) { let c = 0; for (let x = C.x0; x <= C.x1; x++) if (labels[y * w + x] === C.id) c++; hrow = Math.max(hrow, c); }
      if (hrow < 0.75 * C.w) continue;
      let vcol = 0;
      for (let x = C.x0; x <= C.x0 + Math.max(2, Math.round(0.3 * sp)); x++) { let c = 0; for (let y = C.y0; y <= C.y1; y++) if (labels[y * w + x] === C.id) c++; vcol = Math.max(vcol, c); }
      if (vcol < 0.6 * C.h) continue;
      const afterRepeat = repeats.some((r) => r.st === C.staff && r.kind === 'end' && C.x0 > r.box[0] - 0.5 * sp && C.x0 - r.box[2] < 1.5 * sp);
      if (C.w < (afterRepeat ? 2.2 : 3.5) * sp) continue;
      const nearBar = afterRepeat || bars.some((B) => B.st === C.staff && Math.abs(B.comp.x1 - C.x0) < 1.2 * sp) || Math.abs(C.x0 - staffInfo[C.staff].headerEnd) < 2 * sp;
      if (!nearBar) continue;
      voltas.push({ st: C.staff, x0: C.x0, x1: C.x1, comp: C });
    }
    // points de staccato : à l'aplomb d'une tête, au-dessus ou en dessous
    const staccDots = new Map();
    for (const D of dots) {
      if (repDots.has(D) || textComps.has(D.id) || (model && D.cls !== 'dot' && D.cls !== 'other')) continue;
      // point du numéro de volte (« 1. ») : pas un staccato
      if (voltas.some((v) => v.st === D.staff && D.cx >= v.comp.x0 - 0.3 * s && D.cx <= v.comp.x0 + 3.5 * s && D.cy >= v.comp.y0 - 0.5 * s && D.cy <= v.comp.y1 + 1.5 * s)) continue;
      let best = null, bd = 1e9;
      for (const hd of heads) {
        if (hd.st !== D.staff) continue;
        const dx = Math.abs(hd.cx - D.cx), dy = Math.abs(hd.cy - D.cy);
        if (dx > 0.42 * s || dy < 0.6 * s || dy > 4.6 * s) continue;
        if (hd.stem && Math.abs(hd.stem.x - D.cx) < 0.25 * s && (D.cy - hd.cy) * hd.stem.dir > 0 && Math.abs(D.cy - hd.cy) < Math.abs(hd.stem.tip - hd.cy)) continue;
        if (dy < bd) { bd = dy; best = hd; }
      }
      if (best) staccDots.set(D, best);
    }
    // points de prolongation
    for (const hd of heads) {
      const right = hd.cx + hd.wpx / 2;
      hd.dotted = dots.some((C) => !repDots.has(C) && !staccDots.has(C) && !textComps.has(C.id) && C.cx > right + 0.05 * s && C.cx < right + 1.4 * s && C.cy > hd.cy - 0.85 * s && C.cy < hd.cy + 0.35 * s && (C.cls === 'dot' || !model || C.cls === 'other' || C.cls === 'speck'));
    }
    // durées
    for (const hd of heads) {
      let d;
      if (hd.hollow) d = hd.stem ? 2 : 4;
      else d = hd.stem ? (hd.beams ? 1 / Math.pow(2, hd.beams) : 1) : 1;
      if (hd.dotted) d *= 1.5;
      hd.dur = d;
    }
    // ---- altérations accidentelles et silences
    const accs = comps.filter((C) => ['sharp', 'flat', 'natural', 'dsharp', 'dflat'].includes(C.cls) && !textComps.has(C.id));
    const keyIds = new Set(staffInfo.flatMap((si) => si.keyComps.map((C) => C.id)));
    // ---- changements d'armure après une barre (et armures de précaution en fin de portée)
    const keyChanges = [];
    staves.forEach((st, si) => {
      const hdrEnd = staffInfo[si].headerEnd;
      const myAcc = accs.filter((C) => C.staff === si && ['sharp', 'flat', 'natural'].includes(C.cls) && C.conf >= 0.6 && Math.abs(C.rel) < 3.2 && C.x0 > hdrEnd + 0.3 * s && !keyIds.has(C.id)).sort((a, b) => a.x0 - b.x0);
      const myHeads = heads.filter((hd) => hd.st === si);
      const barX = bars.filter((b) => b.st === si).map((b) => b.comp.x1);
      const attached = (C) => myHeads.some((hd) => { const left = hd.cx - hd.wpx / 2; return (left - C.x1 > -0.3 * s || hd.cx < C.x1 + 0.1 * s) && left - C.x1 < 1.2 * s && hd.cx > C.x0 && hd.cy > C.y0 - 0.1 * s && hd.cy < C.y1 + 0.1 * s; });
      const chains = [];
      for (const C of myAcc) {
        const L = chains[chains.length - 1];
        const prev = L && L[L.length - 1];
        if (prev && C.x0 - prev.x1 < 1.0 * st.sp && !myHeads.some((hd) => hd.cx > prev.x1 && hd.cx < C.x0)) L.push(C);
        else chains.push([C]);
      }
      for (const G of chains) {
        if (G.length >= 2 && attached(G[G.length - 1]) && G[G.length - 1].x0 - G[G.length - 2].x1 > 0.6 * st.sp) G.pop();
        const afterBar = barX.some((x) => G[0].x0 - x > -0.2 * s && G[0].x0 - x < 1.8 * st.sp);
        if (G.length === 1 && (!afterBar || attached(G[0]))) continue;
        if (G.length >= 2 && G.some((C) => attached(C)) && !afterBar) continue;
        // une armure alterne haut/bas : pas deux altérations à la même hauteur
        if (G.length >= 2 && G.some((C, i) => i && Math.abs(C.cy - G[i - 1].cy) < 0.3 * st.sp)) continue;
        const sh = G.filter((C) => C.cls === 'sharp').length, fl = G.filter((C) => C.cls === 'flat').length;
        const fifths = sh > fl ? Math.min(7, sh) : -Math.min(7, fl);
        const xe = G[G.length - 1].x1;
        const courtesy = !myHeads.some((hd) => hd.cx > xe);
        G.forEach((C) => keyIds.add(C.id));
        const xb = Math.min(G[0].x0 - 0.05 * s, ...barX.filter((x) => x <= G[0].x0 + 0.2 * s && G[0].x0 - x < 1.8 * st.sp));
        keyChanges.push({ st: si, x: xb, x1: xe, fifths, courtesy, box: [G[0].x0, Math.min(...G.map((C) => C.y0)), xe, Math.max(...G.map((C) => C.y1))] });
      }
    });
    if (keyChanges.length) heads = heads.filter((hd) => !keyChanges.some((k) => k.st === hd.st && hd.cx > k.box[0] - 0.1 * s && hd.cx < k.box[2] + 0.1 * s));
    for (const hd of heads) {
      const sp = staffSp(staves[hd.st], hd.cx);
      const left = hd.cx - hd.wpx / 2;
      let best = null, bd = 1e9;
      for (const C of accs) {
        if (keyIds.has(C.id) || C.staff !== hd.st) continue;
        // altération soudée à la tête
        if (C.w > 1.9 * s && hd.cx > C.x0 + 0.6 * s && hd.cx < C.x1 + 0.1 * s && hd.cy > C.y0 && hd.cy < C.y1 && left - C.x0 > 0.5 * s) { best = C; bd = -1; break; }
        if (C.x1 > left + 0.25 * s || C.x1 < left - 1.6 * s) continue;
        const anchor = (C.cls === 'flat' || C.cls === 'dflat') ? C.y1 - 0.5 * sp : (C.y0 + C.y1) / 2;
        const dy = Math.abs(anchor - hd.cy);
        if (dy < 0.45 * sp && dy + (left - C.x1) * 0.1 < bd) { bd = dy; best = C; }
      }
      if (best) hd.acc = { sharp: 1, flat: -1, natural: 0, dsharp: 2, dflat: -2 }[best.cls];
    }
    const rests = [];
    for (const C of comps) {
      if (!/^rest/.test(C.cls)) continue;
      const si = staffInfo[C.staff], st = staves[C.staff]; const sp = staffSp(st, C.cx);
      if (C.cx < si.headerEnd || Math.abs(C.rel) > 3.2) continue;
      if (C.conf < 0.5) continue;
      let dur;
      if (C.cls === 'restWH') {
        // pendue sous la 2e ligne = pause (ronde), posée sur la 3e = demi-pause
        const l1 = lineAt(st, 1, C.cx), l2 = lineAt(st, 2, C.cx);
        if (Math.abs(C.y0 - l1) < Math.abs(C.y1 - l2)) dur = 'measure'; else dur = 2;
        if (C.w < 0.7 * sp || C.h > 0.9 * sp || C.area / (C.w * C.h) < 0.7) continue;
        if (Math.abs(C.y0 - l1) > 0.35 * sp && Math.abs(C.y1 - l2) > 0.35 * sp) continue;
      } else dur = { rest4: 1, rest8: 0.5, rest16: 0.25, rest32: 0.125 }[C.cls];
      if (!dur) continue;
      const dotted = dots.some((D) => !repDots.has(D) && D.cx > C.x1 && D.cx < C.x1 + 1.2 * s && D.cy > C.y0 - 0.2 * s && D.cy < C.y0 + 1.6 * s && D !== C);
      rests.push({ st: C.staff, x: C.cx, y: C.cy, dur: dur === 'measure' ? 'measure' : dur * (dotted ? 1.5 : 1), comp: C });
    }

    // ---- séquence d'événements
    progress(0.9, 'Assemblage');
    const events = [];
    let carryKey = null; // armure en vigueur à la fin de la portée précédente
    staves.forEach((st, si) => {
      const info = staffInfo[si];
      const bottom = CLEF_BOTTOM[info.clef] || 30;
      // armure de début de portée : celle lue, sinon celle héritée (une armure manquée est plus probable qu'un retour silencieux à do)
      let fifths = info.fifths !== 0 ? info.fifths : (carryKey != null ? carryKey : globalKey);
      info.fifthsUsed = fifths;
      const myHeads = heads.filter((hd) => hd.st === si);
      const myBars = bars.filter((b) => b.st === si).map((b) => b.x).sort((a, b) => a - b)
        .filter((x, k, arr) => k === 0 || x - arr[k - 1] > 1.3 * st.sp); // double barre = une seule séparation
      // regroupement en accords
      const groups = [];
      for (const hd of myHeads.sort((a, b) => a.cx - b.cx)) {
        const g = groups.find((G) => G.some((q) => (q.stem && hd.stem && Math.abs(q.stem.x - hd.stem.x) < 0.4 * s && q.stem.dir === hd.stem.dir) || (!q.stem && !hd.stem && Math.abs(q.cx - hd.cx) < 0.5 * s)));
        if (g) g.push(hd); else groups.push([hd]);
      }
      const items = groups.map((G) => ({ kind: 'note', x: Math.min(...G.map((q) => q.cx)), heads: G }))
        .concat(rests.filter((r) => r.st === si).map((r) => ({ kind: 'rest', x: r.x, rest: r })))
        .concat(repeats.filter((r) => r.st === si).map((r) => ({ kind: 'repeat', x: r.x, rep: r })))
        .concat(voltas.filter((v) => v.st === si).map((v) => ({ kind: 'volta', x: v.x0 + 0.3 * s, volta: v })))
        .concat(keyChanges.filter((k) => k.st === si).map((k) => ({ kind: 'key', x: k.x, key: k })));
      items.sort((a, b) => a.x - b.x || (a.kind === 'repeat' && a.rep.kind === 'end' ? -1 : 0));
      let measureAcc = {};
      let barIdx = 0;
      for (const it of items) {
        while (barIdx < myBars.length && myBars[barIdx] < it.x) { barIdx++; measureAcc = {}; }
        if (it.kind === 'key') {
          fifths = it.key.fifths; measureAcc = {};
          if (it.key.courtesy) continue;
          const [sx, sy] = toSource(T, it.x, lineAt(st, 2, it.x));
          events.push({ type: 'key', fifths, staff: si, measure: barIdx, dur: 0, x: sx, y: sy, box: boxOf(T, ...it.key.box) });
          continue;
        }
        if (it.kind === 'repeat') {
          const [sx, sy] = toSource(T, it.x, lineAt(st, 2, it.x));
          events.push({ type: 'repeat', kind: it.rep.kind, staff: si, measure: barIdx, dur: 0, x: sx, y: sy, box: boxOf(T, ...it.rep.box) });
          continue;
        }
        if (it.kind === 'volta') {
          const C = it.volta.comp; const [sx, sy] = toSource(T, C.x0, C.y0);
          events.push({ type: 'volta', n: 1, staff: si, measure: barIdx, dur: 0, x: sx, y: sy, box: boxOf(T, C.x0, C.y0, C.x0 + Math.min(C.w, 2 * s), C.y1) });
          continue;
        }
        if (it.kind === 'rest') {
          const [sx, sy] = toSource(T, it.rest.comp.cx, it.rest.comp.cy);
          const C = it.rest.comp;
          const p0 = toSource(T, C.x0, C.y0), p1 = toSource(T, C.x1, C.y1);
          events.push({ type: 'rest', staff: si, measure: barIdx, dur: it.rest.dur, x: sx, y: sy, box: boxOf(T, C.x0, C.y0, C.x1, C.y1), _x: it.x, _y: C.cy });
          continue;
        }
        const pitches = [];
        const durs = [];
        let box = null;
        for (const hd of it.heads) {
          const st2 = staves[si]; const sp = staffSp(st2, hd.cx);
          const pos = Math.round((lineAt(st2, 4, hd.cx) - hd.cy) / (sp / 2));
          const d = bottom + pos;
          const letter = ((d % 7) + 7) % 7;
          let alter;
          if (hd.acc != null) { alter = hd.acc; measureAcc[d] = alter; }
          else if (measureAcc[d] != null) alter = measureAcc[d];
          else alter = keyAlter(fifths, letter);
          pitches.push({ midi: diatonicToMidi(d, alter), step: d, pos, alter, explicit: hd.acc != null });
          durs.push(hd.dur);
          const b = boxOf(T, hd.cx - hd.wpx / 2, hd.cy - hd.hpx / 2, hd.cx + hd.wpx / 2, hd.cy + hd.hpx / 2);
          box = box ? unionBox(box, b) : b;
        }
        const hd0 = it.heads[0];
        const [sx, sy] = toSource(T, hd0.cx, hd0.cy);
        events.push({
          type: 'note', staff: si, measure: barIdx, dur: Math.max(...durs), pitches: pitches.sort((a, b) => a.midi - b.midi),
          x: sx, y: sy, box, hollow: hd0.hollow, stem: hd0.stem ? hd0.stem.dir : 0, beams: hd0.beams || 0, dotted: hd0.dotted,
          _h: it.heads, _x: it.x, _y: it.heads[0].cy,
        });
      }
      carryKey = fifths;
    });
    // ---- triolets : chiffre 3 près d'un groupe de trois notes/silences
    let tupId = 0;
    const inVolta = (C) => voltas.some((v) => v.st === C.staff && C.cx >= v.comp.x0 - 0.3 * s && C.cx <= v.comp.x0 + 3.5 * s && C.cy >= v.comp.y0 - 0.5 * s && C.cy <= v.comp.y1 + 1.2 * s);
    // un chiffre entouré d'autres caractères alignés appartient à un texte (titre, paroles…)
    const textLike = (C) => comps.filter((D) => D !== C && !D.isHead && D.cls !== 'speck' && D.w < 1.5 * C.h && D.area / (D.w * D.h) > 0.2 && Math.abs(D.cy - C.cy) < 0.35 * C.h && Math.abs(D.h - C.h) < 0.6 * C.h &&
      Math.max(D.x0 - C.x1, C.x0 - D.x1) < 1.2 * C.h).length >= 2;
    const tupDigits = comps.filter((C) => tupScore(C.votes) >= 0.6 && Math.abs(C.rel) < 7.5 && C.cx > staffInfo[C.staff].headerEnd && !inVolta(C) && !textLike(C) && !textComps.has(C.id)).concat(mergedTup);
    for (const D of tupDigits) {
      const evs = events.filter((e) => e.staff === D.staff && (e.type === 'note' || e.type === 'rest') && !e.tup);
      let best = -1, bd = 1e9;
      for (let k = 0; k + 2 < evs.length; k++) {
        const a = evs[k]._x, c = evs[k + 2]._x;
        if (c - a > 14 * s) continue;
        const d = Math.abs((a + c) / 2 - D.cx);
        const vy = Math.min(...[evs[k], evs[k + 1], evs[k + 2]].map((e) => Math.abs(e._y - D.cy)));
        if (vy > 7 * s) continue;
        if (d < bd) { bd = d; best = k; }
      }
      if (best < 0 || bd > 2.6 * s) continue;
      tupId++;
      for (let k = best; k < best + 3; k++) { evs[k].tup = 2 / 3; evs[k].tupId = tupId; }
    }
    // numérotation des voltes : 2e fin si elle suit directement une barre de reprise finale
    events.forEach((e, i) => {
      if (e.type !== 'volta') return;
      let n = 1;
      for (let j = i - 1; j >= 0; j--) {
        const q = events[j];
        if (q.type === 'repeat' || q.type === 'volta') { if (q.type === 'repeat' && q.kind === 'end') n = 2; break; }
      }
      e.n = n;
    });
    // ==== signes d'expression ====
    progress(0.94, 'Nuances et articulations');
    const headEv = new Map(); events.forEach((e) => { if (e._h) e._h.forEach((hd) => headEv.set(hd, e)); });
    const addArt = (e, k) => { e.artic = e.artic || []; if (!e.artic.includes(k)) e.artic.push(k); };
    const nearestHead = (si, cx, cy, maxDx, maxDy, minDy) => {
      let best = null, bd = 1e9;
      for (const hd of heads) {
        if (hd.st !== si || !headEv.has(hd)) continue;
        const dx = Math.abs(hd.cx - cx), dy = Math.abs(hd.cy - cy);
        if (dx > maxDx || dy > maxDy || dy < (minDy || 0)) continue;
        const sc = dx + 0.12 * dy; if (sc < bd) { bd = sc; best = hd; }
      }
      return best;
    };
    const exprUsed = new Set();
    // articulations et points d'orgue
    const ART = { accent: 'accent', tenuto: 'tenuto', marcato: 'marcato', stacciss: 'staccatissimo', fermata: 'fermata' };
    const fermatas = [];
    if (model) for (const C of comps) {
      const kind = ART[C.cls];
      if (!kind || C.dead || C.isHead || textComps.has(C.id) || C.conf < 0.55 || C.w > 2.6 * s || C.h > 2 * s) continue;
      const hd = nearestHead(C.staff, C.cx, C.cy, kind === 'fermata' ? 1.5 * s : 1.0 * s, kind === 'fermata' ? 10 * s : 8 * s, 0.55 * s);
      if (!hd) continue;
      const e = headEv.get(hd);
      if (kind === 'fermata') { e.fermata = true; fermatas.push(C); } else addArt(e, kind);
      exprUsed.add(C.id);
    }
    for (const [D, hd] of staccDots) {
      if (fermatas.some((F) => Math.abs(F.cx - D.cx) < 1.0 * s && D.cy > F.y0 - 0.4 * s && D.cy < F.y1 + 0.7 * s)) continue;
      const e = headEv.get(hd); if (!e) continue;
      addArt(e, 'staccato'); exprUsed.add(D.id); D.staccOf = e;
    }
    // respirations : marque au-dessus de la portée, appliquée à la note qui précède
    const noteList = events.filter((e) => e.type === 'note');
    if (model) for (const C of comps) {
      if (C.cls !== 'breath' || C.conf < 0.7 || C.dead || C.isHead || textComps.has(C.id)) continue;
      if (C.h < 0.45 * s || C.h > 1.9 * s || C.w > 1.5 * s) continue;
      const st = staves[C.staff]; if (C.y1 > lineAt(st, 0, C.cx) + 0.4 * st.sp) continue;
      let prev = null;
      for (const e of noteList) { if (e.staff === C.staff && e._x < C.cx - 0.2 * s) prev = e; }
      if (!prev) { const before = noteList.filter((e) => e.staff < C.staff); prev = before[before.length - 1]; }
      if (prev) { prev.breathAfter = true; exprUsed.add(C.id); }
    }
    // nuances : lettres p, m, f, s, z… regroupées en mots
    const DYN_OK = new Set(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sf', 'sfz', 'fz', 'fp', 'sfp', 'rf', 'rfz', 'sffz', 'pppp', 'ffff']);
    const dynMarks = [];
    if (model) {
      const outStaff = (C) => { const st = staves[C.staff]; return C.y0 > lineAt(st, 4, C.cx) - 0.3 * st.sp || C.y1 < lineAt(st, 0, C.cx) + 0.3 * st.sp; };
      const dl = comps.filter((C) => /^dyn_/.test(C.cls) && C.conf >= 0.5 && !C.dead && !C.isHead && !textComps.has(C.id) && outStaff(C) && C.h < 3.4 * s).sort((a, b) => a.x0 - b.x0);
      const groups = [];
      for (const C of dl) {
        const g = groups.find((G) => { const L = G[G.length - 1]; return L.staff === C.staff && C.x0 - L.x1 < 0.6 * s && Math.min(L.y1, C.y1) - Math.max(L.y0, C.y0) > 0.3 * Math.min(L.h, C.h); });
        if (g) g.push(C); else groups.push([C]);
      }
      for (const G of groups) {
        const word = G.map((C) => C.cls.slice(4)).join('');
        if (!DYN_OK.has(word)) continue;
        const x0 = G[0].x0, x1 = G[G.length - 1].x1, si = G[0].staff;
        const mine = noteList.filter((e) => e.staff === si);
        const gcx = (x0 + x1) / 2;
        let tgt = mine.filter((e) => e._x >= x0 - 0.5 * s && e._x <= x1 + 2 * s).sort((a, b) => Math.abs(a._x - gcx) - Math.abs(b._x - gcx))[0];
        if (!tgt) tgt = mine.filter((e) => e._x >= x0 - 0.5 * s).sort((a, b) => a._x - b._x)[0];
        if (!tgt || tgt._x - x1 > 6 * s) tgt = mine.sort((a, b) => Math.abs(a._x - gcx) - Math.abs(b._x - gcx))[0];
        if (!tgt) continue;
        if (!tgt.dyn) tgt.dyn = word;
        G.forEach((C) => exprUsed.add(C.id));
        dynMarks.push({ st: si, word, box: boxOf(T, x0, Math.min(...G.map((C) => C.y0)), x1, Math.max(...G.map((C) => C.y1))) });
      }
    }
    // soufflets : sur une image où les traits effacés comme « lignes supplémentaires » hors portée sont restaurés
    const hairpinIds = new Set();
    const hpMask = new Uint8Array(w * h);
    {
      const nsL = ns.slice();
      for (const st of staves) {
        for (let x = Math.max(0, st.x0 - 2); x <= Math.min(w - 1, st.x1 + 2); x++) {
          const top = st.ly[0][x] - t - 2, bot = st.ly[4][x] + t + 2;
          for (let y = 0; y < h; y++) { if (y > top && y < bot) continue; const i = y * w + x; if (bin[i] && !ns[i]) nsL[i] = 1; }
        }
      }
      const LL = labelComponents(nsL, w, h, true, 1);
      const lab2 = LL.labels;
      const isText = (C) => { // composante recouvrant du texte ou une nuance
        for (let y = C.y0; y <= C.y1; y += 2) for (let x = C.x0; x <= C.x1; x += 2) { const l = labels[y * w + x]; if (l && (textComps.has(l) || exprUsed.has(l))) return true; } return false;
      };
      const hasHead = (C) => heads.some((hd) => hd.cx > C.x0 && hd.cx < C.x1 && hd.cy > C.y0 && hd.cy < C.y1);
      const mark = (C) => { for (let y = C.y0; y <= C.y1; y++) for (let x = C.x0; x <= C.x1; x++) if (lab2[y * w + x] === C.id) hpMask[y * w + x] = 1; };
      const apply = (si, x0, x1, kind) => {
        const mine = noteList.filter((e) => e.staff === si && e._x >= x0 - 1.0 * s && e._x <= x1 + 0.6 * s).sort((a, b) => a._x - b._x);
        if (!mine.length) return;
        if (!mine[0].hairpin) mine[0].hairpin = kind; mine[mine.length - 1].hairpinEnd = true;
      };
      const outsideStaff = (C, si) => { const st = staves[si]; return !(C.y1 > lineAt(st, 0, C.cx) - 0.2 * st.sp && C.y0 < lineAt(st, 4, C.cx) + 0.2 * st.sp); };
      const cands = LL.comps.filter((C) => C.w >= 1.0 * s && C.h <= 2.8 * s && C.area / C.w < 0.8 * s);
      const segs = [];
      for (const C of cands) {
        const si = staffOf(C.cx, C.cy); if (si < 0 || !outsideStaff(C, si) || hasHead(C) || isText(C)) continue;
        const kind = hairpinOf(C, lab2, w, s);
        if (kind) { mark(C); apply(si, C.x0, C.x1, kind); continue; }
        const L = straightLine(C, lab2, w, s); if (L) { L.st = si; segs.push(L); }
      }
      segs.sort((a, b) => a.x0 - b.x0);
      const lines = [];
      for (const L of segs) {
        const M = lines.find((q) => q.st === L.st && L.x0 - q.x1 < 1.5 * s && L.x0 - q.x1 > -0.5 * s && Math.abs(q.a + q.b * L.x0 - (L.a + L.b * L.x0)) < 0.25 * s && Math.abs(q.b - L.b) < 0.06);
        if (M) { const n0 = M.x1 - M.x0, n1 = L.x1 - L.x0; M.b = (M.b * n0 + L.b * n1) / (n0 + n1); M.a = (M.a * n0 + L.a * n1) / (n0 + n1); M.x1 = Math.max(M.x1, L.x1); M.comps.push(...L.comps); }
        else lines.push(Object.assign({}, L, { comps: L.comps.slice() }));
      }
      const usedL = new Set();
      for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
        const A = lines[i], B = lines[j];
        if (usedL.has(A) || usedL.has(B) || A.st !== B.st) continue;
        const xl = Math.max(A.x0, B.x0), xr = Math.min(A.x1, B.x1);
        if (xr - xl < 2 * s || xr - xl < 0.7 * Math.min(A.x1 - A.x0, B.x1 - B.x0)) continue;
        const dl = Math.abs((A.a + A.b * xl) - (B.a + B.b * xl)), dr = Math.abs((A.a + A.b * xr) - (B.a + B.b * xr));
        if (Math.max(dl, dr) > 2.2 * s) continue;
        let kind = null;
        if (dl < 0.5 * s && dr > dl + 0.35 * s) kind = 'cres'; else if (dr < 0.5 * s && dl > dr + 0.35 * s) kind = 'dim';
        if (!kind) continue;
        usedL.add(A); usedL.add(B);
        [...A.comps, ...B.comps].forEach(mark);
        apply(A.st, Math.min(A.x0, B.x0), Math.max(A.x1, B.x1), kind);
      }
      for (const C of comps) { if (C.dead) continue; const i = Math.round(C.cy) * w + Math.round(C.cx); if (hpMask[i]) hairpinIds.add(C.id); }
    }
    // liaisons : arcs fins
    const skip = new Uint8Array(comps.length + 1);
    for (const C of comps) {
      if (textComps.has(C.id) || hairpinIds.has(C.id) || exprUsed.has(C.id)) skip[C.id] = 1;
      else if (/^(clef|sharp|flat|natural|dsharp|dflat|rest|t\d|time|tuplet3|dyn_|accent|marcato|fermata|breath)/.test(C.cls) && C.conf >= 0.7) skip[C.id] = 1;
    }
    const curves = findCurves(ns, w, h, s, labels, skip, heads, hpMask);
    const curveOut = [];
    for (const K of curves) {
      const si = staffOf((K.x0 + K.x1) / 2, K.cy); const st = staves[si];
      if (!st || K.cy < lineAt(st, 0, K.x0) - 9 * st.sp || K.cy > lineAt(st, 4, K.x0) + 9 * st.sp) continue;
      const mine = noteList.filter((e) => e.staff === si && e._x >= K.x0 - 0.75 * s && e._x <= K.x1 + 0.4 * s).sort((a, b) => a._x - b._x);
      const vert = mine.filter((e) => e._h.some((hd) => Math.abs(hd.cy - K.cy) < 7 * s));
      if (!vert.length) continue;
      const lastOfStaff = noteList.filter((e) => e.staff === si).slice(-1)[0];
      const openEnd = lastOfStaff && vert[vert.length - 1] === lastOfStaff && K.x1 > lastOfStaff._x + 1.5 * s;
      if (vert.length === 2 && !openEnd) {
        const [A, B] = vert;
        const same = A.pitches.length === B.pitches.length && A.pitches.every((p, k) => p.midi === B.pitches[k].midi);
        const iA = events.indexOf(A), iB = events.indexOf(B);
        const between = events.slice(iA + 1, iB).some((e) => e.type === 'note' || e.type === 'rest');
        if (same && !between) { B.tie = true; curveOut.push({ kind: 'tie', box: boxOf(T, K.x0, K.y0, K.x1, K.y1) }); continue; }
      }
      // point d'orgue en deux morceaux (arc + point)
      if (K.above && K.x1 - K.x0 < 3.2 * s) {
        const D = dots.find((q) => Math.abs(q.cx - (K.x0 + K.x1) / 2) < 0.3 * (K.x1 - K.x0) && q.cy > K.y0 && q.cy < K.y1 + 0.8 * s);
        if (D) {
          const hd = nearestHead(si, D.cx, D.cy, 1.5 * s, 10 * s, 0.5 * s);
          if (hd && hd.cy > D.cy) {
            const e = headEv.get(hd); e.fermata = true;
            if (D.staccOf && D.staccOf.artic) { D.staccOf.artic = D.staccOf.artic.filter((a) => a !== 'staccato'); if (!D.staccOf.artic.length) delete D.staccOf.artic; }
            continue;
          }
        }
      }
      if (vert.length < 2 && !openEnd) continue;
      vert[0].slurStart = true; vert[vert.length - 1].slurEnd = !openEnd;
      vert.forEach((e, k) => { if (k < vert.length - 1 || openEnd) e.legato = true; });
      curveOut.push({ kind: 'slur', box: boxOf(T, K.x0, K.y0, K.x1, K.y1) });
    }
    // ancien repli pour les liaisons de prolongation courtes non reconstituées
    const arcs = comps.filter((C) => !C.isHead && !C.dead && (C.cls === 'other' || C.cls === 'curve') && C.w > 1.0 * s && C.h < 1.6 * s && C.h > 0.15 * s && C.area / C.w < 0.4 * s && !textComps.has(C.id) && !hairpinIds.has(C.id));
    const noteEvs = events.filter((e) => e.type === 'note' || e.type === 'rest');
    for (let i = 1; i < noteEvs.length; i++) {
      const A = noteEvs[i - 1], B = noteEvs[i];
      if (A.type !== 'note' || B.type !== 'note' || A.staff !== B.staff || B.tie) continue;
      if (A.pitches.length !== B.pitches.length || A.pitches.some((p, k) => p.midi !== B.pitches[k].midi)) continue;
      const ha = A._h[0], hb = B._h[0];
      const hit = arcs.some((C) => C.staff === A.staff && C.x0 > ha.cx - 0.3 * s && C.x1 < hb.cx + 1.0 * s && C.x0 < hb.cx && (C.x1 - C.x0) > 0.45 * (hb.cx - ha.cx) &&
        Math.min(Math.abs(C.cy - ha.cy), Math.abs(C.cy - hb.cy)) < 1.8 * s);
      if (hit) { B.tie = true; if (A.legato && A.slurStart && B.slurEnd) { delete A.legato; delete A.slurStart; delete B.slurEnd; } }
    }
    // blocs de texte à lire par OCR (titre, tempo, indications)
    const textBlocks = textLines.map((L) => {
      const st = staves[L.staff];
      const where = L.y1 < lineAt(st, 0, (L.x0 + L.x1) / 2) ? 'above' : 'below';
      const firstAbove = L.staff === 0 && where === 'above';
      return { staff: L.staff, where, top: firstAbove, h: L.mh / s, box: boxOf(T, L.x0, L.y0, L.x1, L.y1), x: toSource(T, L.x0, L.y0)[0], _x0: L.x0 };
    });
    events.forEach((e) => { delete e._h; delete e._x; delete e._y; });
    // mesure entière (pause) -> durée de la mesure
    const measureLen = timeSig ? timeSig[0] * 4 / timeSig[1] : inferMeasureLen(events) || 4;
    events.forEach((e) => { if (e.dur === 'measure') e.dur = measureLen; });
    progress(1, 'Terminé');
    return {
      ok: true,
      transform: T,
      metrics: { s, t, scale, angle, ms: Date.now() - t0 },
      staves: staves.map((st, i) => ({
        index: i, clef: staffInfo[i].clef, fifths: staffInfo[i].fifthsUsed != null ? staffInfo[i].fifthsUsed : (staffInfo[i].fifths || globalKey),
        lines: [0, 1, 2, 3, 4].map((li) => [toSource(T, st.x0, st.ly[li][st.x0]), toSource(T, st.x1, st.ly[li][st.x1])]),
        polygon: [toSource(T, st.x0, st.ly[0][st.x0] - st.sp), toSource(T, st.x1, st.ly[0][st.x1] - st.sp), toSource(T, st.x1, st.ly[4][st.x1] + st.sp), toSource(T, st.x0, st.ly[4][st.x0] + st.sp)],
        bars: bars.filter((b) => b.st === i).map((b) => toSource(T, b.x, st.ly[2][Math.round(b.x)])),
        // géométrie des 5 lignes (points échantillonnés, coordonnées de la photo) pour placer un ajout manuel
        geom: [0, 1, 2, 3, 4].map((li) => Array.from({ length: 25 }, (_, k) => { const x = Math.round(st.x0 + (st.x1 - st.x0) * k / 24); return toSource(T, x, st.ly[li][x]).map((v) => Math.round(v * 10) / 10); })),
      })),
      key: globalKey,
      time: timeSig,
      measureLen,
      events,
      textBlocks,
      marks: { dyn: dynMarks, curves: curveOut },
      _debug: opts.debug ? { w, h, bin, ns, staves, heads, comps, labels, staffInfo, bars, rests, repeats, voltas, P, textLines, curves, keyChanges } : undefined,
    };
  }
  // Soufflet (crescendo / diminuendo) : deux traits fins qui divergent depuis une pointe
  function hairpinOf(C, labels, w, s) {
    if (C.w < 2.2 * s || C.h < 0.3 * s || C.h > 2.6 * s || C.area / C.w > 0.75 * s) return null;
    const N = C.w; let two = 0; const spread = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = C.x0 + i; let runs = 0, inR = false, fy = -1, ly = -1;
      for (let y = C.y0; y <= C.y1; y++) {
        const b = labels[y * w + x] === C.id;
        if (b) { if (!inR) { runs++; inR = true; } if (fy < 0) fy = y; ly = y; } else inR = false;
      }
      if (runs === 2) two++;
      spread[i] = fy < 0 ? 0 : ly - fy + 1;
      if (runs > 2) return null;
    }
    if (two < 0.45 * N) return null;
    const k = Math.max(2, Math.round(0.06 * N));
    let L = 0, R = 0; for (let i = 0; i < k; i++) { L += spread[i]; R += spread[N - 1 - i]; } L /= k; R /= k;
    // évasement régulier : la largeur au milieu est intermédiaire
    const M = spread[N >> 1];
    if (R - L > 0.45 * s && L < 0.55 * s && M > L - 1 && M < R + 1) return 'cres';
    if (L - R > 0.45 * s && R < 0.55 * s && M > R - 1 && M < L + 1) return 'dim';
    return null;
  }

  // Trait fin rectiligne (branche de soufflet) : une seule plage fine par colonne, ajustement linéaire
  function straightLine(C, labels, w, s) {
    if (C.w < 1.0 * s || C.h > 1.8 * s || C.area / C.w > 0.4 * s) return null;
    const xs = [], ys = [];
    for (let x = C.x0; x <= C.x1; x++) {
      let runs = 0, inR = false, sy = 0, n = 0;
      for (let y = C.y0; y <= C.y1; y++) {
        const b = labels[y * w + x] === C.id;
        if (b) { if (!inR) { runs++; inR = true; } sy += y; n++; } else inR = false;
      }
      if (runs > 1 || n > 0.4 * s) return null;
      if (n) { xs.push(x); ys.push(sy / n); }
    }
    if (xs.length < 0.8 * C.w) return null;
    const c = polyfit(xs.map((x) => x - C.x0), ys, 1); if (!c) return null;
    let rss = 0; xs.forEach((x, i) => { const e = ys[i] - (c[0] + c[1] * (x - C.x0)); rss += e * e; });
    if (Math.sqrt(rss / xs.length) > 0.1 * s || Math.abs(c[1]) > 0.35) return null;
    return { x0: C.x0, x1: C.x1, a: c[0] - c[1] * C.x0, b: c[1], comps: [C] };
  }

  // Arcs fins (liaisons d'expression et de prolongation) reconstitués à partir des fragments
  function findCurves(ns, w, h, s, labels, skip, heads, hpMask) {
    const maxV = Math.max(3, Math.round(0.55 * s));
    const thin = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        if (!ns[y * w + x]) { y++; continue; }
        const st = y; while (y < h && ns[y * w + x]) y++;
        if (y - st <= maxV) for (let q = st; q < y; q++) if (!skip[labels[q * w + x]] && !(hpMask && hpMask[q * w + x])) thin[q * w + x] = 1;
      }
    }
    for (const hd of heads) {
      const rx = hd.wpx / 2 + 0.12 * s, ry = hd.hpx / 2 + 0.12 * s;
      for (let y = Math.round(hd.cy - ry); y <= Math.round(hd.cy + ry); y++) for (let x = Math.round(hd.cx - rx); x <= Math.round(hd.cx + rx); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const u = (x - hd.cx) / rx, v = (y - hd.cy) / ry; if (u * u + v * v <= 1) thin[y * w + x] = 0;
      }
    }
    const { labels: tl, comps: tc } = labelComponents(thin, w, h, true, 1);
    const pieces = [];
    for (const P of tc) {
      if (P.w < 0.3 * s || P.area < 0.06 * s * s || P.w < 0.6 * P.h) continue;
      const cols = new Float32Array(P.w).fill(NaN); let wide = 0;
      for (let i = 0; i < P.w; i++) {
        const x = P.x0 + i; let sy = 0, n = 0, fy = -1, ly = -1;
        for (let y = P.y0; y <= P.y1; y++) if (tl[y * w + x] === P.id) { sy += y; n++; if (fy < 0) fy = y; ly = y; }
        if (n) { cols[i] = sy / n; if (ly - fy > 0.55 * s) wide++; }
      }
      if (wide > 0.25 * P.w) continue;
      const k = Math.max(2, Math.min(P.w >> 1, Math.round(0.5 * s)));
      const avg = (a, b) => { let t = 0, n = 0; for (let i = a; i < b; i++) if (!isNaN(cols[i])) { t += cols[i]; n++; } return n ? t / n : NaN; };
      const ly0 = avg(0, k), ly1 = avg(P.w - k, P.w);
      const sl0 = (avg(k, 2 * k) - ly0) / k, sl1 = (ly1 - avg(P.w - 2 * k, P.w - k)) / k;
      pieces.push({ P, cols, x0: P.x0, x1: P.x1, ly0, ly1, sl0: isNaN(sl0) ? 0 : sl0, sl1: isNaN(sl1) ? 0 : sl1, next: null, prev: null });
    }
    pieces.sort((a, b) => a.x0 - b.x0);
    for (const A of pieces) {
      let best = null, bs = 1e9;
      for (const B of pieces) {
        if (B === A || B.prev || B.x0 < A.x1 - 0.3 * s || B.x0 - A.x1 > 1.3 * s) continue;
        const gap = Math.max(0, B.x0 - A.x1);
        const pred = A.ly1 + A.sl1 * gap;
        const err = Math.abs(pred - B.ly0);
        if (err > 0.3 * s + 0.25 * gap) continue;
        if (Math.abs(A.sl1 - B.sl0) > 0.9) continue;
        const sc = err + 0.3 * gap;
        if (sc < bs) { bs = sc; best = B; }
      }
      if (best) { A.next = best; best.prev = A; }
    }
    const curves = [];
    for (const A of pieces) {
      if (A.prev) continue;
      const chain = []; for (let p = A; p && chain.length < 40; p = p.next) chain.push(p);
      const xs = [], ys = [];
      chain.forEach((p) => p.cols.forEach((y, i) => { if (!isNaN(y)) { xs.push(p.x0 + i); ys.push(y); } }));
      if (xs.length < 4) continue;
      const x0 = Math.min(...xs), x1 = Math.max(...xs), span = x1 - x0;
      if (span < 1.1 * s) continue;
      const y0 = ys[xs.indexOf(x0)], y1 = ys[xs.indexOf(x1)];
      // flèche par rapport à la corde
      let sag = 0, pos = 0, neg = 0;
      for (let i = 0; i < xs.length; i++) {
        const cy = y0 + (y1 - y0) * (xs[i] - x0) / span; const d = ys[i] - cy;
        if (Math.abs(d) > Math.abs(sag)) sag = d;
        if (d > 0.05 * s) pos++; else if (d < -0.05 * s) neg++;
      }
      if (Math.abs(sag) < Math.max(0.22 * s, 0.035 * span)) continue;
      const maj = Math.max(pos, neg); if (maj < 0.7 * (pos + neg) || maj < 0.4 * xs.length) continue;
      // régularité : pas de zigzag (ajustement quadratique)
      const u = xs.map((x) => (x - x0) / span);
      const c = polyfit(u, ys, 2);
      if (!c) continue;
      let rss = 0; for (let i = 0; i < xs.length; i++) { const e = ys[i] - (c[0] + c[1] * u[i] + c[2] * u[i] * u[i]); rss += e * e; }
      const rms = Math.sqrt(rss / xs.length);
      if (rms > 0.2 * s + 0.02 * span) continue;
      curves.push({ x0, x1, y0: Math.min(...ys), y1: Math.max(...ys), ya: y0, yb: y1, above: sag < 0, cy: ys.reduce((a, b) => a + b, 0) / ys.length, pieces: chain.map((p) => p.P.id) });
    }
    return curves;
  }

  // Lignes de texte : suites de composantes de taille « lettre » alignées horizontalement, hors des lignes de la portée
  function findTextLines(comps, staves, s, headComps) {
    const outside = (C) => {
      const st = staves[C.staff]; if (!st) return true;
      const top = lineAt(st, 0, C.cx), bot = lineAt(st, 4, C.cx);
      return C.y1 < top + 0.45 * s || C.y0 > bot - 0.45 * s || C.cx < st.x0 - s || C.cx > st.x1 + s;
    };
    const cand = comps.filter((C) => !C.dead && C.cls !== 'speck' && C.h >= 0.3 * s && C.h <= 4.2 * s && (C.w <= 6 * s || (C.w <= 12 * s && C.h >= 0.5 * s && C.area / (C.w * C.h) >= 0.25)) && C.area >= 0.03 * s * s && outside(C) && !(headComps && headComps.has(C.id) && C.h > 2.0 * s));
    cand.sort((a, b) => a.x0 - b.x0);
    const par = new Map(cand.map((C) => [C, C]));
    const find = (a) => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
    const vov = (A, B) => Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
    for (let i = 0; i < cand.length; i++) {
      const A = cand[i];
      for (let j = i + 1; j < cand.length; j++) {
        const B = cand[j];
        if (B.x0 > A.x1 + 1.6 * s) break;
        const gap = B.x0 - A.x1, mh = Math.max(A.h, B.h), nh = Math.min(A.h, B.h);
        if (gap > 0.75 * mh || gap < -0.5 * nh) continue;
        if (mh / nh > 3.2 || vov(A, B) < 0.45 * nh) continue;
        par.set(find(A), find(B));
      }
    }
    const groups = new Map();
    for (const C of cand) { const r = find(C); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(C); }
    // mots -> lignes : mots voisins sur la même ligne de base (lettres italiques souvent soudées)
    let words = [...groups.values()].map((g) => ({ g, x0: Math.min(...g.map((C) => C.x0)), x1: Math.max(...g.map((C) => C.x1)), y0: Math.min(...g.map((C) => C.y0)), y1: Math.max(...g.map((C) => C.y1)), mh: g.map((C) => C.h).sort((a, b) => a - b)[g.length >> 1] }));
    words = words.filter((W) => W.y1 - W.y0 <= 4.5 * s).sort((a, b) => a.x0 - b.x0);
    const wl = [];
    for (const W of words) {
      const L = wl.find((q) => W.x0 - q.x1 < 2.4 * Math.max(q.mh, W.mh) && W.x0 - q.x1 > -0.3 * s && Math.min(q.y1, W.y1) - Math.max(q.y0, W.y0) > 0.5 * Math.min(q.y1 - q.y0, W.y1 - W.y0) && Math.max(q.mh, W.mh) / Math.min(q.mh, W.mh) < 2.5);
      if (L) { L.g.push(...W.g); L.nw++; L.x1 = Math.max(L.x1, W.x1); L.y0 = Math.min(L.y0, W.y0); L.y1 = Math.max(L.y1, W.y1); L.mh = Math.max(L.mh, W.mh); }
      else wl.push(Object.assign({}, W, { g: W.g.slice(), nw: 1 }));
    }
    const lines = [];
    for (const W of wl) {
      const g = W.g;
      const width = W.x1 - W.x0;
      const hs = g.map((C) => C.h).sort((a, b) => a - b), mh = hs[hs.length >> 1];
      const far = Math.abs(g[0].rel) > 6;
      if (mh > (far ? 3.8 : 2.2) * s || mh < 0.5 * s || hs[hs.length - 1] < 0.6 * s) continue;
      // lettres : composantes compactes (pas des crochets de triolet ni des traits)
      const SYM = /^(accent|marcato|fermata|breath|stacciss|tenuto|dot|sharp|flat|natural|rest|clef|tuplet3|curve|hairpin)/;
      const nl = g.filter((C) => C.w <= 2.2 * C.h && C.area / (C.w * C.h) > 0.12 && !(SYM.test(C.cls) && C.conf >= 0.8) && !(C.votes && (C.votes.tuplet3 || 0) > 0.5)).length;
      // alignement sur une ligne de base (des têtes de notes successives montent et descendent)
      const ys1 = g.map((C) => C.y1).sort((a, b) => a - b), my1 = ys1[ys1.length >> 1];
      const ys0 = g.map((C) => C.y0).sort((a, b) => a - b), my0 = ys0[ys0.length >> 1];
      const aligned = g.filter((C) => Math.abs(C.y1 - my1) <= 0.2 * mh + 1 || Math.abs(C.y0 - my0) <= 0.2 * mh + 1).length;
      if (g.length >= 3 && aligned < 0.6 * g.length) continue;
      const hosts = g.filter((C) => headComps && headComps.has(C.id)).length;
      const st0 = staves[g[0].staff];
      const nearStaff = st0 && W.y0 < lineAt(st0, 4, (W.x0 + W.x1) / 2) + 4.5 * st0.sp && W.y1 > lineAt(st0, 0, (W.x0 + W.x1) / 2) - 4.5 * st0.sp;
      if (nearStaff && hosts >= 2 && hosts >= 0.4 * g.length) continue;
      if (!(nl >= 3 || (nl === 2 && g.length === 2 && width >= 2.6 * mh) || (g.length === 1 && width >= 3.5 * mh && W.y1 - W.y0 < 1.6 * s && g[0].cls === 'text' && g[0].conf >= 0.7))) continue;
      if (width < 1.4 * s) continue;
      if (g.every((C) => /^dyn_/.test(C.cls) && C.conf >= 0.6)) continue; // nuances (sfz, f … p)
      lines.push({ comps: g, x0: W.x0, x1: W.x1, y0: W.y0, y1: W.y1, mh });
    }
    // absorption des mots courts (« a », « de ») et des signes isolés alignés sur une ligne
    for (const L of lines) {
      for (const C of cand) {
        if (L.comps.includes(C) || C.h > 1.6 * L.mh) continue;
        if (C.x1 < L.x0 - 3 * L.mh || C.x0 > L.x1 + 3 * L.mh) continue;
        if (Math.min(L.y1, C.y1) - Math.max(L.y0, C.y0) < 0.5 * C.h) continue;
        if (/^dyn_/.test(C.cls) && C.conf >= 0.7) continue;
        L.comps.push(C); L.x0 = Math.min(L.x0, C.x0); L.x1 = Math.max(L.x1, C.x1);
      }
    }
    // fusion des lignes qui se chevauchent sur la même hauteur
    lines.sort((a, b) => a.x0 - b.x0);
    const out = [];
    for (const L of lines) {
      const M = out.find((q) => Math.min(q.y1, L.y1) - Math.max(q.y0, L.y0) > 0.4 * Math.min(q.y1 - q.y0, L.y1 - L.y0) && L.x0 < q.x1 + 4 * Math.max(q.mh, L.mh));
      if (M) { M.comps.push(...L.comps); M.x0 = Math.min(M.x0, L.x0); M.x1 = Math.max(M.x1, L.x1); M.y0 = Math.min(M.y0, L.y0); M.y1 = Math.max(M.y1, L.y1); M.mh = Math.max(M.mh, L.mh); }
      else out.push(L);
    }
    const textComps = new Set();
    out.forEach((L) => { L.comps.forEach((C) => textComps.add(C.id)); L.staff = L.comps[0].staff; });
    return { textComps, textLines: out };
  }
  function mergeFragments(comps, labels, ns, w, h, s, t, model) {
    const SYM = /^(sharp|flat|natural|dsharp|dflat|rest|clef|t\d|time)/;
    const cand = comps.filter((C) => C.cls !== 'speck' && C.w < 4 * s && C.h < 4 * s && (C.cls === 'other' || C.conf < 0.8 || C.cls === 'dot'));
    const pad = Math.round(t + 2);
    const near = (A, B) => A.x0 - pad <= B.x1 && B.x0 - pad <= A.x1 && A.y0 - pad <= B.y1 && B.y0 - pad <= A.y1;
    const all = comps.filter((C) => C.cls !== 'speck' && C.w < 4 * s && C.h < 4 * s && !C.dead);
    for (const A of cand) {
      if (A.dead) continue;
      for (const B of all) {
        if (B === A || B.dead || !near(A, B)) continue;
        const M = { id: -1, x0: Math.min(A.x0, B.x0), y0: Math.min(A.y0, B.y0), x1: Math.max(A.x1, B.x1), y1: Math.max(A.y1, B.y1), area: A.area + B.area };
        M.w = M.x1 - M.x0 + 1; M.h = M.y1 - M.y0 + 1;
        if (M.w > 3 * s || M.h > 4 * s) continue;
        const ids = new Set([A.id, B.id]);
        const f = componentFeatures(ns, w, labels, M, s, ids);
        const r = knnClassify(f, model);
        if (SYM.test(r.cls) && r.conf >= 0.8 && (!SYM.test(B.cls) || B.conf < 0.8 || r.cls === B.cls)) {
          // fusion : B absorbe A
          for (let y = A.y0; y <= A.y1; y++) for (let x = A.x0; x <= A.x1; x++) if (labels[y * w + x] === A.id) labels[y * w + x] = B.id;
          B.sx += A.sx; B.sy += A.sy; B.area += A.area;
          Object.assign(B, { x0: M.x0, y0: M.y0, x1: M.x1, y1: M.y1, w: M.w, h: M.h, cx: B.sx / B.area, cy: B.sy / B.area, cls: r.cls, conf: r.conf, kdist: r.dist, votes: r.votes, feat: f });
          A.dead = true; A.cls = 'speck';
          break;
        }
      }
    }
  }
  function majorityLabel(labels, w, h, cx, cy, r) {
    const cnt = new Map(); let best = 0, bc = 0;
    for (let y = Math.round(cy - r); y <= Math.round(cy + r); y++) {
      if (y < 0 || y >= h) continue;
      for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++) {
        if (x < 0 || x >= w) continue;
        const l = labels[y * w + x]; if (!l) continue;
        const c = (cnt.get(l) || 0) + 1; cnt.set(l, c); if (c > bc) { bc = c; best = l; }
      }
    }
    return best;
  }
  function boxOf(T, x0, y0, x1, y1) {
    const pts = [toSource(T, x0, y0), toSource(T, x1, y0), toSource(T, x0, y1), toSource(T, x1, y1)];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  function unionBox(a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]; }
  function inferMeasureLen(events) {
    const sums = {};
    events.forEach((e) => { if (typeof e.dur === 'number') { const k = e.staff + ':' + e.measure; sums[k] = (sums[k] || 0) + e.dur * (e.tup || 1); } });
    const votes = {};
    Object.values(sums).forEach((v) => { const r = Math.round(v * 4) / 4; if (r >= 1 && r <= 8) votes[r] = (votes[r] || 0) + 1; });
    const best = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
    return best ? +best : null;
  }

  // modèle compact : { dim, scale, classes, data (base64 : 1 octet classe + dim octets) }
  function loadModel(m) {
    if (!m || m.samples) return m;
    const bin = typeof atob === 'function' ? atob(m.data) : Buffer.from(m.data, 'base64').toString('binary');
    const rec = m.dim + 1, n = bin.length / rec, samples = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = new Uint8Array(m.dim);
      for (let j = 0; j < m.dim; j++) v[j] = bin.charCodeAt(i * rec + 1 + j);
      samples[i] = { c: m.classes[bin.charCodeAt(i * rec)], v };
    }
    return { dim: m.dim, scale: m.scale, samples };
  }
  // ordre de lecture avec reprises et 1re/2e fins (indices dans events)
  function expandRepeats(events) {
    const order = [], n = events.length, done = new Set();
    let start = 0, pass = 1, i = 0, guard = 0;
    while (i < n && guard++ < 200000) {
      const e = events[i];
      if (e.type === 'repeat' && e.kind === 'start') { start = i + 1; pass = 1; i++; continue; }
      if (e.type === 'repeat' && e.kind === 'end') {
        if (!done.has(i)) { done.add(i); pass = 2; i = start; continue; }
        pass = 1; i++; start = i; continue;
      }
      if (e.type === 'volta') {
        if (e.n === 1 && pass === 2) {
          let j = i + 1, target = n;
          for (; j < n; j++) {
            if (events[j].type === 'repeat' && events[j].kind === 'end') { done.add(j); target = j + 1; break; }
            if (events[j].type === 'volta' && events[j].n >= 2) { target = j; break; }
          }
          i = target; pass = 1; start = i; continue;
        }
        i++; continue;
      }
      order.push(i); i++;
    }
    return order;
  }
  function noteName(midi, preferFlat) {
    const names = preferFlat ? ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'] : ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
    return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  }

  return {
    analyze, loadModel, expandRepeats, rgbaToGray, warp, binarize, staffMetrics, estimateSkew, findStaves, removeStaffLines, labelComponents,
    componentFeatures, featuresPred, knnClassify, boxBlur, distanceTransform, toSource, fromSource, noteName, diatonicToMidi, keyAlter, NOTE_NAMES_FR, CLEF_BOTTOM,
  };
});
