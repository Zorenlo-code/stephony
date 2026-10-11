/* Stephony — interface de l'application */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const Synth = window.StephonySynth, MidiFile = window.StephonyMidiFile;

  // ------------------------------------------------------------------ icônes
  const ICONS = {
    camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.3-2h5l1.3 2h1.7A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    back: '<path d="M15 5 8 12l7 7"/>',
    sliders: '<path d="M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    minus: '<path d="M5 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    speaker: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    pause: '<rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/>',
    note: '<path d="M9 18.5V6l10-2v12"/><circle cx="6.5" cy="18.5" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 19.5h14"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
    pencil: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
  const paintIcons = (root = document) => $$('[data-ico]', root).forEach((el) => { el.innerHTML = icon(el.dataset.ico); });

  // petites figures de notes / silences pour les durées
  function durIcon(base, rest) {
    if (rest) {
      const p = { 4: '<rect x="3" y="9" width="10" height="3.5" fill="currentColor"/><path d="M1 9h14"/>', 2: '<rect x="3" y="11" width="10" height="3.5" fill="currentColor"/><path d="M1 14.5h14"/>',
        1: '<path d="M6 4l4 5-3 3 4 5c-3-1-5 0-4 3-3-2-2-5 1-5L5 10z" fill="currentColor"/>', 0.5: '<circle cx="6" cy="9" r="2" fill="currentColor"/><path d="M6 10.5c2 .5 4-.5 5-2L7 22"/>',
        0.25: '<circle cx="7" cy="7" r="1.8" fill="currentColor"/><circle cx="5.5" cy="12" r="1.8" fill="currentColor"/><path d="M7 8.5c2 .4 3.5-.5 4.5-2L6 23M5.5 13.5c2 .4 3.5-.5 4.5-2"/>' }[base] || '';
      return `<svg viewBox="0 0 16 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${p}</svg>`;
    }
    const hollow = base >= 2, stem = base < 4, flags = base <= 0.25 ? 2 : base <= 0.5 ? 1 : 0;
    let s = `<ellipse cx="6.2" cy="20.5" rx="4.3" ry="3.1" transform="rotate(-22 6.2 20.5)" ${hollow ? 'fill="none" stroke="currentColor" stroke-width="1.7"' : 'fill="currentColor"'}/>`;
    if (stem) s += '<path d="M10.2 19.5V3" stroke="currentColor" stroke-width="1.6"/>';
    for (let f = 0; f < flags; f++) s += `<path d="M10.2 ${3 + f * 4.5}c1 3 5 4.5 4 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 16 26">${s}</svg>`;
  }
  function repIcon(kind) {
    const g = kind === 'start'
      ? '<rect x="1.5" y="2" width="3.2" height="18" rx=".6"/><rect x="6.5" y="2" width="1.4" height="18"/><circle cx="11.5" cy="8.6" r="1.7"/><circle cx="11.5" cy="13.4" r="1.7"/>'
      : '<circle cx="2.8" cy="8.6" r="1.7"/><circle cx="2.8" cy="13.4" r="1.7"/><rect x="6.4" y="2" width="1.4" height="18"/><rect x="9.6" y="2" width="3.2" height="18" rx=".6"/>';
    return `<svg viewBox="0 0 14 22" fill="currentColor">${g}</svg>`;
  }
  const isMark = (e) => e && (e.type === 'repeat' || e.type === 'volta' || e.type === 'key');
  const isPlayable = (e) => e && (e.type === 'note' || e.type === 'rest');
  const markName = (e) => e.type === 'key' ? 'Changement d’armure' : e.type === 'volta' ? (e.n === 2 ? '2e fin' : '1re fin') : (e.kind === 'start' ? 'Début de reprise' : 'Fin de reprise');
  const keyShort = (f) => (f === 0 ? '♮' : (f > 0 ? '♯' : '♭').repeat(Math.min(7, Math.abs(f))));
  const Expr = window.StephonyExpr;
  const ART_SIGN = { accent: '>', staccato: '·', tenuto: '–', marcato: '^', staccatissimo: '▾' };
  const DUR_NAMES = { 4: 'Ronde', 2: 'Blanche', 1: 'Noire', 0.5: 'Croche', 0.25: 'Double croche', 0.125: 'Triple croche' };
  const REST_NAMES = { 4: 'Pause', 2: 'Demi-pause', 1: 'Soupir', 0.5: 'Demi-soupir', 0.25: 'Quart de soupir', 0.125: 'Huitième de soupir' };
  const BASES = [4, 2, 1, 0.5, 0.25];
  function splitDur(d) {
    if (typeof d !== 'number') return { base: 1, dotted: false };
    for (const b of BASES) { if (Math.abs(d - b) < 1e-6) return { base: b, dotted: false }; if (Math.abs(d - b * 1.5) < 1e-6) return { base: b, dotted: true }; }
    return { base: d, dotted: false };
  }

  // ------------------------------------------------------------- noms de notes
  const LETTERS = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
  const NAMES_S = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  const NAMES_F = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
  const ACC = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
  // convention francophone : do3 = do central (MIDI 60)
  function pitchName(p, transpose = 0) {
    if (p.manual == null && p.step != null && !transpose) {
      const l = ((p.step % 7) + 7) % 7;
      return LETTERS[l] + (ACC[p.alter] || '') + (Math.floor(p.step / 7) - 1);
    }
    const m = (p.manual != null ? p.manual : p.midi) + transpose;
    return ((cur && effKey() < 0) ? NAMES_F : NAMES_S)[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 2);
  }
  const MAJ = { '-7': 'Do♭', '-6': 'Sol♭', '-5': 'Ré♭', '-4': 'La♭', '-3': 'Mi♭', '-2': 'Si♭', '-1': 'Fa', 0: 'Do', 1: 'Sol', 2: 'Ré', 3: 'La', 4: 'Mi', 5: 'Si', 6: 'Fa♯', 7: 'Do♯' };
  const MIN = { '-7': 'La♭', '-6': 'Mi♭', '-5': 'Si♭', '-4': 'Fa', '-3': 'Do', '-2': 'Sol', '-1': 'Ré', 0: 'La', 1: 'Mi', 2: 'Si', 3: 'Fa♯', 4: 'Do♯', 5: 'Sol♯', 6: 'Ré♯', 7: 'La♯' };
  const keyLabel = (f) => (f === 0 ? 'Aucune altération' : `${Math.abs(f)} ${f > 0 ? '♯' : '♭'}`) + ` — ${MAJ[f]} maj. / ${MIN[f]} min.`;

  // ------------------------------------------------------------- stockage
  const DB = {
    db: null,
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('stephony', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('scores', { keyPath: 'id' });
        r.onsuccess = () => { this.db = r.result; res(); };
        r.onerror = () => rej(r.error);
      });
    },
    store(mode) { return this.db.transaction('scores', mode).objectStore('scores'); },
    all() { return new Promise((res) => { const r = this.store('readonly').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); },
    get(id) { return new Promise((res) => { const r = this.store('readonly').get(id); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); },
    put(o) { return new Promise((res, rej) => { const r = this.store('readwrite').put(o); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
    del(id) { return new Promise((res) => { const r = this.store('readwrite').delete(id); r.onsuccess = () => res(); r.onerror = () => res(); }); },
  };

  // ------------------------------------------------------------- utilitaires UI
  let toastTimer;
  function toast(msg, ms = 2800) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  function setBusy(msg, p) {
    const b = $('#busy');
    if (msg === false) { b.hidden = true; return; }
    b.hidden = false; if (msg) $('#busyMsg').textContent = msg;
    if (p != null) $('#busyArc').style.strokeDashoffset = String(276.5 * (1 - Math.max(0.03, Math.min(1, p))));
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (t) => new Date(t).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });
  function showView(id) { $$('.view').forEach((v) => v.classList.toggle('active', v.id === id)); }

  // ------------------------------------------------------------- analyse (worker)
  let worker = null, workerBroken = false;
  function analyzeInWorker(imgData) {
    if (workerBroken || typeof Worker === 'undefined') return analyzeMain(imgData);
    return new Promise((resolve) => {
      try { if (!worker) worker = new Worker('js/omr-worker.js'); } catch (e) { workerBroken = true; resolve(analyzeMain(imgData)); return; }
      const id = Math.random().toString(36).slice(2);
      const onMsg = (e) => {
        const m = e.data; if (m.id !== id) return;
        if (m.type === 'progress') setBusy(m.msg + '…', 0.08 + 0.9 * m.p);
        else { worker.removeEventListener('message', onMsg); if (m.type === 'done') resolve(m.res); else { workerBroken = true; resolve(analyzeMain(imgData)); } }
      };
      worker.addEventListener('message', onMsg);
      // si le worker ne peut pas démarrer (environnement restreint), on analyse dans la page
      worker.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); worker.removeEventListener('message', onMsg); worker = null; workerBroken = true; resolve(analyzeMain(imgData)); };
      worker.postMessage({ id, rgba: imgData.data.buffer, w: imgData.width, h: imgData.height });
    });
  }
  let mainModel = null;
  async function analyzeMain(imgData) {
    if (!mainModel) {
      if (!window.STEPHONY_MODEL) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'js/symbols-model.js'; sc.onload = res; sc.onerror = () => rej(new Error('Modèle introuvable')); document.head.appendChild(sc); });
      mainModel = OMR.loadModel(window.STEPHONY_MODEL);
    }
    setBusy('Lecture de la partition…', 0.4);
    await new Promise((r) => setTimeout(r, 60));
    const res = OMR.analyze(imgData.data, imgData.width, imgData.height, { model: mainModel });
    res.rotation = 0; delete res._debug;
    return res;
  }
  const canvasBlob = (c, type = 'image/jpeg', q = 0.86) => new Promise((r) => c.toBlob(r, type, q));

  async function processImage(blob, title) {
    setBusy('Ouverture de la photo…', 0.03);
    try {
      let bmp;
      try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(blob); }
      const MAX = 3200;
      const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      let cw = Math.round(bmp.width * k), ch = Math.round(bmp.height * k);
      let canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
      let c2 = canvas.getContext('2d', { willReadFrequently: true });
      c2.fillStyle = '#fff'; c2.fillRect(0, 0, cw, ch); c2.drawImage(bmp, 0, 0, cw, ch);
      if (bmp.close) bmp.close();
      const data = c2.getImageData(0, 0, cw, ch);
      setBusy('Lecture de la partition…', 0.06);
      const res = await analyzeInWorker(data);
      if (res.rotation) {
        const r = document.createElement('canvas');
        const q = res.rotation / 90;
        r.width = q % 2 ? ch : cw; r.height = q % 2 ? cw : ch;
        const rc = r.getContext('2d');
        rc.translate(r.width / 2, r.height / 2); rc.rotate(res.rotation * Math.PI / 180); rc.drawImage(canvas, -cw / 2, -ch / 2);
        canvas = r; cw = r.width; ch = r.height;
      }
      const notes = (res.events || []).filter((e) => e.type === 'note').length;
      if (!res.ok || !notes) {
        setBusy(false);
        toast(res.error || 'Aucune note reconnue. Rapprochez-vous de la partition, bien à plat et éclairée.', 5000);
        return;
      }
      // ---- lecture du texte (titre, tempo, indications)
      let texts = [];
      const sp = res.metrics ? res.metrics.s / res.metrics.scale : 0;
      const blocks = (res.textBlocks || []).filter((b) => b.box[2] - b.box[0] > 4);
      if (blocks.length && window.StephonyOCR) {
        setBusy('Lecture du texte…', 0.02);
        try {
          const rot = res.rotation ? canvas : canvas; // le canvas est déjà tourné comme la photo analysée
          const read = await window.StephonyOCR.readBlocks(rot, blocks, sp, (p) => setBusy('Lecture du texte…', 0.05 + 0.9 * p));
          texts = blocks.map((b, k) => ({ text: read[k], staff: b.staff, where: b.where, top: b.top, h: b.h, box: b.box })).filter((t) => t.text && /\p{L}{2}|\d{2}/u.test(t.text));
        } catch (e) { console.warn('OCR', e); }
      }
      const time = res.time || null;
      const beatQ = Expr.beatUnit(time);
      let tempo = Math.max(40, Math.round(90 / beatQ)), tempoText = null;
      const head = texts.filter((t) => t.top);
      for (const t of head) { const k = Expr.interpretText(t.text); if (k && k.kind === 'tempo') { tempo = Math.max(30, Math.min(220, k.bpm)); tempoText = t.text; break; } }
      const autoTitle = Expr.pickTitle(texts);
      const events = res.events.map((e) => ({ ...e }));
      attachTexts(events, texts.filter((t) => t.text !== tempoText && !(t.top && /^(text|tempo)$/.test((Expr.interpretText(t.text) || { kind: 'text' }).kind))), res.staves);
      setBusy('Enregistrement…', 1);
      const image = await canvasBlob(canvas, 'image/jpeg', 0.85);
      const th = document.createElement('canvas'); const tk = 360 / cw; th.width = 360; th.height = Math.round(ch * tk);
      th.getContext('2d').drawImage(canvas, 0, 0, th.width, th.height);
      const now = Date.now();
      const sc = {
        id: 's' + now.toString(36), title: title || autoTitle || 'Partition du ' + new Date(now).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        autoTitle: !title && !!autoTitle,
        created: now, updated: now, image, w: cw, h: ch, thumb: th.toDataURL('image/jpeg', 0.7),
        events, staves: res.staves.map((st) => ({ clef: st.clef, fifths: st.fifths, geom: st.geom })),
        key: res.key || 0, time, measureLen: res.measureLen, sp,
        tempo, tempoText, beatQ, texts: texts.map((t) => ({ text: t.text, staff: t.staff, where: t.where, top: !!t.top })),
        instrument: 'piano', clefOverride: '', keyOverride: null, transpose: 0, metronome: false, loop: false, expressive: true, v: 2,
      };
      await DB.put(sc);
      setBusy(false);
      openScore(sc, true);
      const extra = [];
      if (sc.autoTitle) extra.push(`titre « ${sc.title} »`);
      if (sc.tempoText) extra.push(`tempo ${sc.tempo} ${beatWord(sc.beatQ)}`);
      toast(`${notes} notes reconnues${extra.length ? ' · ' + extra.join(' · ') : ''}. Touchez une note pour la corriger.`, 4500);
    } catch (err) {
      console.error(err);
      setBusy(false);
      toast('Oups : ' + err.message, 5000);
    }
  }

  // indication de texte -> note concernée (même portée, à l'aplomb du début du texte)
  function lineYAt(geom, li, x) {
    const pts = geom[li]; if (!pts || !pts.length) return null;
    if (x <= pts[0][0]) return pts[0][1]; if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let k = 1; k < pts.length; k++) if (pts[k][0] >= x) { const a = pts[k - 1], b = pts[k]; return a[1] + (b[1] - a[1]) * (x - a[0]) / Math.max(1e-6, b[0] - a[0]); }
    return pts[pts.length - 1][1];
  }
  function attachTexts(events, texts, staves) {
    for (const t of texts) {
      const kind = Expr.interpretText(t.text);
      let st = t.staff;
      // texte d'expression placé au-dessus d'une portée mais plus près de la portée précédente : il la concerne
      if (t.where === 'above' && st > 0 && staves[st - 1] && staves[st - 1].geom && staves[st].geom && kind && !/tempo|atempo|rit|accel/.test(kind.kind)) {
        const x = (t.box[0] + t.box[2]) / 2, yb = t.box[3];
        const dPrev = yb - lineYAt(staves[st - 1].geom, 4, x), dOwn = lineYAt(staves[st].geom, 0, x) - yb;
        if (dPrev > 0 && dPrev < dOwn * 1.2) st = st - 1;
      }
      const notes = events.filter((e) => e.type === 'note' && e.staff === st);
      if (!notes.length) continue;
      // mentions sans effet musical (renvois, copyright) : seulement si courtes et collées à la portée
      if (!kind || kind.kind === 'text') {
        const g = staves[st] && staves[st].geom; if (!g || t.text.length > 24) continue;
        const x = (t.box[0] + t.box[2]) / 2, top = lineYAt(g, 0, x), bot = lineYAt(g, 4, x), sp = (bot - top) / 4;
        const dist = t.box[3] < top ? top - t.box[3] : t.box[1] > bot ? t.box[1] - bot : 0;
        if (dist > 4.5 * sp) continue;
      }
      const x0 = t.box[0];
      const after = notes.filter((e) => e.box && e.box[2] >= x0 - 4).sort((a, b) => a.box[0] - b.box[0]);
      const tgt = after[0] || notes[notes.length - 1];
      tgt.texts = tgt.texts || [];
      if (kind && kind.kind === 'atempo' && /^[il1|][o°º]?\s*tempo/i.test(t.text.trim())) t.text = 'I° Tempo';
      tgt.texts.push({ text: t.text, kind: kind ? kind.kind : 'text', ...(kind && kind.amount ? { amount: kind.amount } : {}), ...(kind && kind.bpm ? { bpm: kind.bpm } : {}) });
    }
  }
  const tempoLabel = (sc) => ({ 1.5: '♩.', 2: 'blanche', 0.5: '♪', 0.25: 'double croche' }[sc.beatQ || 1] || '♩');
  const beatWord = (bq) => ({ 1.5: 'à la noire pointée', 2: 'à la blanche', 0.5: 'à la croche', 0.25: 'à la double croche' }[bq] || 'à la noire');
  // pictogramme de l'unité de temps (noire, noire pointée, blanche, croche)
  function beatIcon(bq) {
    const base = { 1.5: 1, 2: 2, 0.5: 0.5, 0.25: 0.25 }[bq] || 1;
    let svg = durIcon(base, false);
    if (bq === 1.5) svg = svg.replace('</svg>', '<circle cx="14" cy="20" r="1.6" fill="currentColor"/></svg>').replace('viewBox="0 0 16 26"', 'viewBox="0 0 17 26"');
    return `<span class="beat-ico">${svg}</span>`;
  }

  // ------------------------------------------------------------- bibliothèque
  async function renderLibrary() {
    const list = (await DB.all()).sort((a, b) => b.updated - a.updated);
    const lib = $('#library');
    if (!list.length) { lib.innerHTML = '<div class="empty">Vos partitions apparaîtront ici.<br>Commencez par une photo ou essayez l’exemple.</div>'; return; }
    lib.innerHTML = '';
    for (const sc of list) {
      const b = document.createElement('div');
      b.className = 'lib-item'; b.setAttribute('role', 'button'); b.tabIndex = 0;
      const n = sc.events.filter((e) => e.type === 'note').length;
      b.innerHTML = `<img alt="" src="${sc.thumb}"><div class="lib-meta"><div class="lib-title"></div><div class="lib-sub">${n} notes · ${fmtDate(sc.updated)}</div></div><button class="lib-more" aria-label="Options">⋯</button>`;
      b.querySelector('.lib-title').textContent = sc.title;
      b.onclick = async (ev) => { if (ev.target.closest('.lib-more')) { openLibSheet(sc); return; } openScore(await DB.get(sc.id), true); };
      b.onkeydown = (ev) => { if (ev.key === 'Enter') b.click(); };
      lib.appendChild(b);
    }
  }
  // menu d'une partition : ouvrir, renommer, supprimer
  let libTarget = null, libDelArmed = null;
  function openLibSheet(sc) {
    libTarget = sc; $('#libSheetTitle').textContent = sc.title;
    $('#libDelete').lastChild.textContent = ' Supprimer';
    showSheet('#libSheet');
  }
  $('#libOpen').onclick = async () => { const id = libTarget && libTarget.id; hideSheets(); if (id) openScore(await DB.get(id), true); };
  $('#libRename').onclick = () => { const sc = libTarget; hideSheets(); openRename(sc.title, async (t) => { const full = await DB.get(sc.id); full.title = t; full.autoTitle = false; full.updated = Date.now(); await DB.put(full); renderLibrary(); toast('Partition renommée'); }); };
  $('#libDelete').onclick = async () => {
    const b = $('#libDelete');
    if (!libDelArmed) { b.lastChild.textContent = ' Toucher encore pour supprimer'; libDelArmed = setTimeout(() => { libDelArmed = null; b.lastChild.textContent = ' Supprimer'; }, 3500); return; }
    clearTimeout(libDelArmed); libDelArmed = null;
    const sc = libTarget; hideSheets(); await DB.del(sc.id); renderLibrary(); toast(`« ${sc.title} » supprimée`);
  };
  // feuilles génériques
  function showSheet(sel) { hideSheets(); $('#sheetBackdrop').hidden = false; $(sel).hidden = false; }
  function hideSheets() { ['#menuSheet', '#renameSheet', '#libSheet', '#textSheet'].forEach((q) => ($(q).hidden = true)); $('#sheetBackdrop').hidden = true; }
  $$('[data-close]').forEach((b) => (b.onclick = hideSheets));
  // renommer
  let renameCb = null;
  function openRename(current, cb) {
    renameCb = cb; $('#renameInput').value = current || '';
    $('#renameHint').hidden = !(cur && cur.autoTitle && cb === renameCurrent);
    $('#renameHint').textContent = 'Titre lu automatiquement sur la partition.';
    showSheet('#renameSheet');
    setTimeout(() => { const i = $('#renameInput'); i.focus(); i.select(); }, 60);
  }
  $('#renameOk').onclick = () => { const t = $('#renameInput').value.trim(); if (!t) { $('#renameInput').focus(); return; } const cb = renameCb; hideSheets(); if (cb) cb(t); };
  $('#renameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#renameOk').click(); });
  function renameCurrent(t) { cur.title = t; cur.autoTitle = false; $('#titleInput').value = t; save(); toast('Partition renommée'); }

  // ------------------------------------------------------------- partition ouverte
  let cur = null, imgURL = null, sel = -1, playIdx = -1, zoom = 1;
  const player = new Synth.Player();
  let saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (cur) { cur.updated = Date.now(); DB.put(cur).catch(() => toast('Enregistrement impossible')); } }, 400); }
  const effKey = () => (cur.keyOverride != null ? cur.keyOverride : cur.key);
  const clefOf = (staff) => cur.clefOverride || (cur.staves[staff] && cur.staves[staff].clef) || 'G';

  // recalcul des hauteurs selon clé / armure (début de portée et changements) / altérations accidentelles
  function recompute() {
    let acc = {}, st = -1, ms = -1, fifths = 0, changed = false;
    for (const e of cur.events) {
      if (e.staff !== st) {
        st = e.staff; ms = e.measure; acc = {};
        const sf = cur.staves[st] && cur.staves[st].fifths != null ? cur.staves[st].fifths : cur.key;
        // l'armure choisie dans les réglages remplace l'armure lue jusqu'au premier changement
        fifths = cur.keyOverride != null && !changed ? cur.keyOverride : sf;
      }
      if (e.measure !== ms) { acc = {}; ms = e.measure; }
      if (e.type === 'key') { fifths = e.fifths; acc = {}; changed = true; continue; }
      if (e.type !== 'note') continue;
      const bottom = OMR.CLEF_BOTTOM[clefOf(e.staff)] || 30;
      for (const p of e.pitches) {
        if (p.pos == null) continue;
        const d = bottom + p.pos, letter = ((d % 7) + 7) % 7;
        let alter;
        if (p.explicit) { alter = p.alter; acc[d] = alter; } else if (acc[d] != null) alter = acc[d]; else alter = OMR.keyAlter(fifths, letter);
        p.step = d; p.alter = alter; p.midi = OMR.diatonicToMidi(d, alter);
      }
      e._key = fifths;
    }
  }
  // armure en vigueur à un endroit donné (pour un ajout)
  function keyAt(staff, x) {
    let f = cur.keyOverride != null ? cur.keyOverride : (cur.staves[staff] && cur.staves[staff].fifths != null ? cur.staves[staff].fifths : cur.key);
    for (const e of cur.events) { if (e.staff > staff) break; if (e.type === 'key' && (e.staff < staff || (e.x != null && e.x <= x))) f = e.fifths; }
    return f;
  }

  function openScore(sc, push) {
    if (!sc) return;
    player.stop(true); setPlaying(false);
    cur = sc; sel = -1; playIdx = -1; zoom = 1;
    if (!sc.beatQ) sc.beatQ = Expr.beatUnit(sc.time);
    if (sc.expressive == null) sc.expressive = true;
    setAddMode(false);
    if (imgURL) URL.revokeObjectURL(imgURL);
    imgURL = URL.createObjectURL(sc.image);
    $('#scoreImg').src = imgURL;
    $('#titleInput').value = sc.title;
    $('#tempo').value = sc.tempo; $('#tempoVal').textContent = sc.tempo; $('#tempoUnit').innerHTML = beatIcon(sc.beatQ || 1);
    $('#instrument').value = sc.instrument;
    applyZoom();
    recompute();
    renderAll();
    closeEditor();
    showView('score');
    $('#viewer').scrollTo(0, 0);
    // zoom initial : interligne lisible (~7 px à l'écran)
    requestAnimationFrame(() => {
      const vw = $('#viewer').clientWidth;
      if (sc.sp && vw) { zoom = Math.max(1, Math.min(4, 7.5 / (sc.sp * vw / sc.w))); applyZoom(); }
    });
    if (push) history.pushState({ view: 'score', id: sc.id }, '');
  }
  function goHome() {
    player.stop(true); setPlaying(false); releaseWake();
    cur = null; hideSheets(); setAddMode(false);
    showView('home'); renderLibrary();
  }

  function renderInfo() {
    const f = cur.keyOverride != null ? cur.keyOverride : (cur.staves[0] && cur.staves[0].fifths != null ? cur.staves[0].fifths : cur.key);
    const n = cur.events.filter((e) => e.type === 'note').length;
    const clefs = { G: 'Clé de sol', F: 'Clé de fa', C: 'Clé d’ut' };
    const clef = cur.clefOverride || (cur.staves[0] && cur.staves[0].clef) || 'G';
    $('#infoKey').textContent = `${clefs[clef]} · ${f === 0 ? 'Do maj.' : MAJ[f] + ' maj.'}${cur.time ? ' · ' + cur.time.join('/') : ''}`;
    const reps = cur.events.filter((e) => e.type === 'repeat' && e.kind === 'end').length;
    const tups = new Set(cur.events.filter((e) => e.tup).map((e) => e.tupId)).size;
    const kc = cur.events.filter((e) => e.type === 'key').length;
    const dy = cur.events.filter((e) => e.dyn).length;
    $('#infoNotes').textContent = `${n} notes` + (reps ? ` · ${reps} reprise${reps > 1 ? 's' : ''}` : '') + (tups ? ` · ${tups} triolet${tups > 1 ? 's' : ''}` : '') + (kc ? ` · ${kc} armure${kc > 1 ? 's' : ''}` : '') + (dy ? ` · ${dy} nuance${dy > 1 ? 's' : ''}` : '');
  }

  function renderOverlay() {
    const svg = $('#overlay');
    svg.setAttribute('viewBox', `0 0 ${cur.w} ${cur.h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const hs = cur.events.map((e) => e.box && !isMark(e) ? e.box[3] - e.box[1] : 0).filter(Boolean).sort((a, b) => a - b);
    const med = hs.length ? hs[hs.length >> 1] : 20;
    const pad = med * 0.18, rx = med * 0.3;
    let html = '<defs><linearGradient id="curGrad" x1="0" x2="1"><stop offset="0" stop-color="rgba(124,58,237,.45)"/><stop offset=".5" stop-color="rgba(217,70,239,.45)"/><stop offset="1" stop-color="rgba(245,158,11,.45)"/></linearGradient></defs>';
    cur.events.forEach((e, i) => {
      if (!e.box) return;
      const [x0, y0, x1, y1] = e.box;
      html += `<rect data-i="${i}" class="ev ${e.type}${e.edited ? ' edited' : ''}${i === sel ? ' sel' : ''}" x="${x0 - pad}" y="${y0 - pad}" width="${x1 - x0 + 2 * pad}" height="${y1 - y0 + 2 * pad}" rx="${rx}"/>`;
      if (e.dyn && e.type === 'note') html += `<text class="dynlbl" x="${(x0 + x1) / 2}" y="${y1 + med * 2.1}" text-anchor="middle" style="font-size:${med * 1.15}px">${e.dyn}</text>`;
    });
    if (sel >= 0 && cur.events[sel] && cur.events[sel].box && cur.events[sel].type === 'note') {
      const e = cur.events[sel], b = e.box;
      html += `<text class="lbl" x="${(b[0] + b[2]) / 2}" y="${b[1] - pad * 2.2}" text-anchor="middle" style="font-size:${med * 0.95}px">${e.pitches.map((p) => pitchName(p)).join(' ')}</text>`;
    }
    svg.innerHTML = html;
  }

  function renderStrip() {
    const strip = $('#strip');
    let html = '', lastM = null;
    cur.events.forEach((e, i) => {
      const mk = e.staff + ':' + e.measure;
      if (lastM !== null && mk !== lastM) html += '<span class="chip bar" aria-hidden="true"></span>';
      lastM = mk;
      if (e.type === 'key') { html += `<button class="chip key${i === sel ? ' sel' : ''}" data-i="${i}">Armure ${keyShort(e.fifths)}</button>`; return; }
      if (isMark(e)) {
        const ico = e.type === 'repeat' ? repIcon(e.kind) : '';
        html += `<button class="chip mark${i === sel ? ' sel' : ''}" data-i="${i}">${ico}${e.type === 'repeat' ? (e.kind === 'start' ? 'Reprise' : 'Fin') : (e.n === 2 ? '2e fin' : '1re fin')}</button>`;
        return;
      }
      const { base, dotted } = splitDur(e.dur);
      const label = e.type === 'rest' ? 'Silence' : e.pitches.map((p) => pitchName(p)).join('+');
      const pre = (e.texts && e.texts.length ? `<span class="txt">${esc(e.texts.map((t) => t.text).join(' · '))}</span>` : '') + (e.dyn ? `<span class="dyn">${e.dyn}</span>` : '') + (e.hairpin ? `<span class="dyn">${e.hairpin === 'cres' ? '&lt;' : '&gt;'}</span>` : '');
      const arts = (e.artic || []).map((a) => ART_SIGN[a] || '').join('') + (e.fermata ? '𝄐' : '') + (e.breathAfter ? '’' : '');
      html += `<button class="chip ${e.type}${e.tie ? ' tie' : ''}${e.tup ? ' tupl' : ''}${e.legato ? ' leg' : ''}${i === sel ? ' sel' : ''}${i === playIdx ? ' cur' : ''}" data-i="${i}">${pre}<span class="dur">${durIcon(base, e.type === 'rest')}</span>${label}${dotted ? '·' : ''}${e.tup ? '<span class="tup3">3</span>' : ''}${arts ? `<span class="art">${arts}</span>` : ''}</button>`;
    });
    strip.innerHTML = html || '<span class="pill">Aucune note</span>';
  }

  function renderAll() { renderInfo(); renderOverlay(); renderStrip(); if (sel >= 0) renderEditor(); }

  function setPlayHighlight(i) {
    if (i === playIdx) return;
    const prev = playIdx; playIdx = i;
    $$(`#overlay .ev.cur, #strip .chip.cur`).forEach((el) => el.classList.remove('cur'));
    if (i < 0) return;
    const r = $(`#overlay .ev[data-i="${i}"]`), c = $(`#strip .chip[data-i="${i}"]`);
    if (r) { r.classList.add('cur'); follow(i); }
    if (c) { c.classList.add('cur'); const s = $('#strip'); const left = c.offsetLeft - s.clientWidth / 2 + c.offsetWidth / 2; s.scrollTo({ left, behavior: prev < 0 ? 'auto' : 'smooth' }); }
  }
  // garde la note jouée visible dans la photo
  function follow(i) {
    const e = cur.events[i]; if (!e || !e.box) return;
    const v = $('#viewer'), k = $('#stage').clientWidth / cur.w;
    const cx = (e.box[0] + e.box[2]) / 2 * k, cy = (e.box[1] + e.box[3]) / 2 * k;
    const mx = v.clientWidth * 0.18, my = v.clientHeight * 0.2;
    let L = v.scrollLeft, T = v.scrollTop;
    if (cx < L + mx || cx > L + v.clientWidth - mx) L = cx - v.clientWidth / 2;
    if (cy < T + my || cy > T + v.clientHeight - my) T = cy - v.clientHeight * 0.4;
    if (L !== v.scrollLeft || T !== v.scrollTop) v.scrollTo({ left: L, top: T, behavior: 'smooth' });
  }

  // ------------------------------------------------------------- zoom / pincement
  function applyZoom(focal) {
    const v = $('#viewer'), st = $('#stage');
    const oldW = st.clientWidth || v.clientWidth;
    let fx = 0, fy = 0, cx = 0, cy = 0;
    if (focal) { fx = focal.x; fy = focal.y; cx = (v.scrollLeft + fx) / oldW; cy = (v.scrollTop + fy) / oldW; }
    st.style.width = (zoom * 100) + '%';
    if (focal) { const nw = st.clientWidth; v.scrollLeft = cx * nw - fx; v.scrollTop = cy * nw - fy; }
  }
  function setZoom(z, focal) { zoom = Math.max(1, Math.min(6, z)); applyZoom(focal || { x: $('#viewer').clientWidth / 2, y: $('#viewer').clientHeight / 2 }); }
  (function pinch() {
    const v = $('#viewer'); const pts = new Map(); let start = null;
    v.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, e); if (pts.size === 2) { const [a, b] = [...pts.values()]; start = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: zoom }; } });
    v.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
      if (pts.size === 2 && start) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const r = v.getBoundingClientRect();
        setZoom(start.z * d / start.d, { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top });
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) start = null; };
    v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up); v.addEventListener('pointerleave', up);
    // pincement trackpad / ctrl+molette
    v.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); const r = v.getBoundingClientRect(); setZoom(zoom * Math.exp(-e.deltaY / 200), { x: e.clientX - r.left, y: e.clientY - r.top }); }, { passive: false });
  })();

  // ------------------------------------------------------------- sélection / édition
  function select(i, opts = {}) {
    sel = i;
    renderOverlay(); renderStrip();
    if (i < 0) { closeEditor(); return; }
    renderEditor();
    $('#editor').hidden = false;
    const c = $(`#strip .chip[data-i="${i}"]`);
    if (c) { const s = $('#strip'); s.scrollTo({ left: c.offsetLeft - s.clientWidth / 2 + c.offsetWidth / 2, behavior: 'smooth' }); }
    if (opts.follow) follow(i);
    if (opts.listen) listen();
  }
  function closeEditor() { $('#editor').hidden = true; if (sel >= 0) { sel = -1; renderOverlay(); renderStrip(); } }
  let edTab = 'note';
  function setTab(t) {
    edTab = t;
    $$('#edTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    $$('.ed-pane').forEach((p) => (p.hidden = p.dataset.pane !== t));
  }
  $('#edTabs').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
  function renderEditor() {
    const e = cur.events[sel]; if (!e) return;
    const mark = isMark(e), key = e.type === 'key';
    $('#edTabs').hidden = mark;
    $$('.ed-pane').forEach((p) => (p.hidden = mark || p.dataset.pane !== edTab));
    $('#edMarkRow').hidden = !mark || key;
    $('#edKeyRow').hidden = !key;
    $('#edListen').hidden = mark;
    if (key) {
      $('#edName').textContent = 'Changement d’armure';
      $('#edSub').textContent = `${keyLabel(e.fifths)} · portée ${e.staff + 1}`;
      const ks = $('#edKeySel');
      ks.innerHTML = Array.from({ length: 15 }, (_, i) => i - 7).map((f) => `<option value="${f}">${keyLabel(f)}</option>`).join('');
      ks.value = String(e.fifths);
      return;
    }
    if (mark) {
      $('#edName').textContent = markName(e);
      $('#edSub').textContent = e.type === 'volta' ? `Crochet de ${e.n === 2 ? 'deuxième' : 'première'} fin · portée ${e.staff + 1}` : `Barre de reprise · portée ${e.staff + 1}, mesure ${e.measure + 1}`;
      if (e.type === 'volta') {
        $('#edMarkA').textContent = '1re fin'; $('#edMarkB').textContent = '2e fin'; $('#edMarkB').hidden = false;
        $('#edMarkA').classList.toggle('on', e.n !== 2); $('#edMarkB').classList.toggle('on', e.n === 2);
      } else {
        $('#edMarkA').textContent = e.kind === 'start' ? '→ Fin de reprise' : '→ Début de reprise'; $('#edMarkA').classList.remove('on');
        $('#edMarkB').hidden = true;
      }
      return;
    }
    $('#edTupBtn').classList.toggle('on', !!e.tup);
    $$('.rep-ico').forEach((el) => (el.innerHTML = repIcon(el.dataset.rep)));
    const { base, dotted } = splitDur(e.dur);
    const rest = e.type === 'rest';
    $('#edName').textContent = rest ? (REST_NAMES[base] || 'Silence') : e.pitches.map((p) => pitchName(p)).join(' + ');
    const extras = [];
    if (e.dyn) extras.push(e.dyn);
    (e.artic || []).forEach((a) => extras.push({ accent: 'accent', staccato: 'staccato', tenuto: 'tenuto', marcato: 'marcato', staccatissimo: 'piqué' }[a]));
    if (e.legato) extras.push('lié');
    $('#edSub').textContent = `${rest ? 'Silence' : (DUR_NAMES[base] || 'Durée ' + base)}${dotted ? ' pointée' : ''}${e.tup ? ' de triolet' : ''} · portée ${e.staff + 1}, mesure ${e.measure + 1}${extras.length ? ' · ' + extras.join(', ') : ''}`;
    $('#edPitchRow').style.opacity = rest ? 0.35 : 1;
    $$('#edPitchRow button').forEach((b) => (b.disabled = rest));
    $('#edDurRow').innerHTML = BASES.map((b) => `<button class="ed-btn${b === base ? ' on' : ''}" data-dur="${b}" aria-label="${(rest ? REST_NAMES : DUR_NAMES)[b]}">${durIcon(b, rest)}</button>`).join('') +
      `<button class="ed-btn${dotted ? ' on' : ''}" data-act="dot" aria-label="Pointée">•</button>`;
    $('#edRestBtn').textContent = rest ? '→ Note' : '→ Silence';
    $('#edTieBtn').classList.toggle('on', !!e.tie);
    $('#edTieBtn').disabled = rest;
    // onglet « Jeu »
    $('#edDynRow').innerHTML = ['pp', 'p', 'mp', 'mf', 'f', 'ff', 'sf', 'fp'].map((d) => `<button class="ed-btn${e.dyn === d ? ' on' : ''}" data-dyn="${d}">${d}</button>`).join('');
    $$('#edArtRow [data-art]').forEach((b) => {
      const a = b.dataset.art;
      b.classList.toggle('on', a === 'fermata' ? !!e.fermata : a === 'breath' ? !!e.breathAfter : (e.artic || []).includes(a));
      b.disabled = rest && a !== 'fermata' && a !== 'breath';
    });
    $('#edArtRow [data-act="texts"]').classList.toggle('on', !!(e.texts && e.texts.length));
    $('#edPhrRow [data-act="legato"]').classList.toggle('on', !!e.legato);
    $('#edPhrRow [data-act="cres"]').classList.toggle('on', e.hairpin === 'cres');
    $('#edPhrRow [data-act="dim"]').classList.toggle('on', e.hairpin === 'dim');
    $('#edPhrRow [data-act="hpEnd"]').classList.toggle('on', !!e.hairpinEnd);
  }
  function listen() {
    const e = cur.events[sel]; if (!e || e.type !== 'note') return;
    e.pitches.forEach((p) => Synth.previewNote(cur.instrument, (p.manual != null ? p.manual : p.midi) + (cur.transpose || 0)));
  }
  function edited() { const e = cur.events[sel]; if (e) e.edited = true; renderAll(); reloadPlayer(); save(); }

  $('#editor').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b || sel < 0) return;
    const e = cur.events[sel];
    if (b.dataset.dur) { const { dotted } = splitDur(e.dur); e.dur = +b.dataset.dur * (dotted ? 1.5 : 1); edited(); return; }
    if (b.dataset.dyn) { e.dyn = e.dyn === b.dataset.dyn ? undefined : b.dataset.dyn; if (!e.dyn) delete e.dyn; edited(); return; }
    if (b.dataset.art) {
      const a = b.dataset.art;
      if (a === 'fermata') e.fermata = !e.fermata;
      else if (a === 'breath') e.breathAfter = !e.breathAfter;
      else {
        e.artic = e.artic || [];
        if (e.artic.includes(a)) e.artic = e.artic.filter((x) => x !== a); else {
          // staccato / piqué s'excluent ; accent / marcato aussi
          const excl = { staccato: 'staccatissimo', staccatissimo: 'staccato', accent: 'marcato', marcato: 'accent' }[a];
          e.artic = e.artic.filter((x) => x !== excl); e.artic.push(a);
        }
        if (!e.artic.length) delete e.artic;
      }
      edited(); return;
    }
    switch (b.dataset.act) {
      case 'semi+': case 'semi-': case 'oct+': case 'oct-': {
        const d = { 'semi+': 1, 'semi-': -1, 'oct+': 12, 'oct-': -12 }[b.dataset.act];
        e.pitches.forEach((p) => { p.manual = Math.max(12, Math.min(120, (p.manual != null ? p.manual : p.midi) + d)); });
        edited(); listen(); break;
      }
      case 'dot': { const { base, dotted } = splitDur(e.dur); e.dur = base * (dotted ? 1 : 1.5); edited(); break; }
      case 'toggleRest':
        if (e.type === 'rest') { e.type = 'note'; e.pitches = e._pitches || [{ manual: neighbourMidi(sel), midi: neighbourMidi(sel) }]; delete e._pitches; }
        else { e._pitches = e.pitches; e.pitches = []; e.type = 'rest'; e.tie = false; }
        edited(); break;
      case 'tie': e.tie = !e.tie; edited(); break;
      case 'legato': {
        // liaison d'expression vers la note suivante
        e.legato = !e.legato;
        const nx = cur.events.slice(sel + 1).find((q) => isPlayable(q));
        if (e.legato) { delete e.slurEnd; if (nx && nx.type === 'note' && !nx.legato) nx.slurEnd = true; } else if (nx) delete nx.slurEnd;
        edited(); break;
      }
      case 'cres': case 'dim': e.hairpin = e.hairpin === b.dataset.act ? undefined : b.dataset.act; if (!e.hairpin) delete e.hairpin; edited(); break;
      case 'hpEnd': e.hairpinEnd = !e.hairpinEnd; if (!e.hairpinEnd) delete e.hairpinEnd; edited(); break;
      case 'texts': openTextSheet({ kind: 'text', target: sel }); break;
      case 'tempoHere': openTextSheet({ kind: 'tempo', target: sel }); break;
      case 'keyHere': {
        const k = { type: 'key', fifths: e._key != null ? e._key : keyAt(e.staff, e.x || 0), staff: e.staff, measure: e.measure, dur: 0, x: e.x, y: e.y, box: e.box ? [e.box[0] - (e.box[3] - e.box[1]) * 2.2, e.box[1] - (e.box[3] - e.box[1]) * 1.5, e.box[0] - (e.box[3] - e.box[1]) * 0.6, e.box[3] + (e.box[3] - e.box[1]) * 1.5] : null, edited: true };
        cur.events.splice(sel, 0, k);
        recompute(); renderAll(); select(sel); toast('Choisissez la nouvelle armure'); save();
        break;
      }
      case 'insertBefore': {
        const n = JSON.parse(JSON.stringify(e)); n.edited = true; n.tie = false; delete n.texts; delete n.dyn; delete n.hairpin; delete n.hairpinEnd;
        if (n.box) { const w = n.box[2] - n.box[0]; n.box = [n.box[0] - w * 1.15, n.box[1], n.box[2] - w * 1.15, n.box[3]]; }
        cur.events.splice(sel, 0, n); edited(); break;
      }
      case 'tuplet': {
        if (e.tup) { const id = e.tupId; cur.events.forEach((q) => { if (q.tupId === id) { delete q.tup; delete q.tupId; } }); }
        else {
          const id = 'u' + Date.now().toString(36); let k = 0;
          for (let j = sel; j < cur.events.length && k < 3; j++) { const q = cur.events[j]; if (q.type !== 'note' && q.type !== 'rest') continue; if (q.tup) { const old = q.tupId; cur.events.forEach((z) => { if (z.tupId === old) { delete z.tup; delete z.tupId; } }); } q.tup = 2 / 3; q.tupId = id; k++; }
        }
        edited(); break;
      }
      case 'repStart': case 'repEnd': case 'volta': {
        const hgt = e.box ? e.box[3] - e.box[1] : 20;
        const before = b.dataset.act !== 'repEnd';
        const box = e.box ? (before ? [e.box[0] - hgt * 1.3, e.box[1] - hgt * 1.2, e.box[0] - hgt * 0.5, e.box[3] + hgt * 1.2] : [e.box[2] + hgt * 0.5, e.box[1] - hgt * 1.2, e.box[2] + hgt * 1.3, e.box[3] + hgt * 1.2]) : null;
        let m;
        if (b.dataset.act === 'volta') {
          let n = 1; for (let j = sel - 1; j >= 0; j--) { const q = cur.events[j]; if (isMark(q)) { if (q.type === 'repeat' && q.kind === 'end') n = 2; break; } }
          m = { type: 'volta', n, staff: e.staff, measure: e.measure, dur: 0, box: e.box ? [e.box[0] - hgt * 0.4, e.box[1] - hgt * 2.6, e.box[0] + hgt * 1.6, e.box[1] - hgt * 1.4] : null, edited: true };
        } else m = { type: 'repeat', kind: before ? 'start' : 'end', staff: e.staff, measure: e.measure, dur: 0, box, edited: true };
        cur.events.splice(before ? sel : sel + 1, 0, m);
        if (before) sel++;
        renderAll(); reloadPlayer(); save();
        toast(m.type === 'volta' ? `${markName(m)} ajoutée` : `${markName(m)} ajouté`);
        break;
      }
      case 'markA':
        if (e.type === 'volta') e.n = 1; else e.kind = e.kind === 'start' ? 'end' : 'start';
        e.edited = true; renderAll(); reloadPlayer(); save(); break;
      case 'markB': if (e.type === 'volta') { e.n = 2; e.edited = true; renderAll(); reloadPlayer(); save(); } break;
      case 'playFromMark': { let j = sel; while (j < cur.events.length && !isPlayable(cur.events[j])) j++; closeEditor(); Synth.audio(); reloadPlayer(); player.play(j); setPlaying(true); keepAwake(); break; }
      case 'insert': {
        const n = JSON.parse(JSON.stringify(e)); n.edited = true; n.tie = false; delete n.texts; delete n.dyn; delete n.hairpin; delete n.hairpinEnd;
        if (n.box) { const w = n.box[2] - n.box[0]; n.box = [n.box[0] + w * 1.15, n.box[1], n.box[2] + w * 1.15, n.box[3]]; }
        cur.events.splice(sel + 1, 0, n); sel++; edited(); break;
      }
      case 'delete':
        cur.events.splice(sel, 1);
        if (sel >= cur.events.length) sel = cur.events.length - 1;
        recompute(); renderAll(); reloadPlayer(); save(); if (sel < 0) closeEditor(); else renderEditor();
        toast('Élément supprimé');
        break;
    }
  });
  function neighbourMidi(i) {
    for (let d = 1; d < cur.events.length; d++) for (const j of [i - d, i + d]) { const e = cur.events[j]; if (e && e.type === 'note' && e.pitches.length) { const p = e.pitches[0]; return p.manual != null ? p.manual : p.midi; } }
    return 67;
  }
  $('#edKeySel').onchange = (ev) => { const e = cur.events[sel]; if (!e || e.type !== 'key') return; e.fifths = +ev.target.value; e.edited = true; recompute(); renderAll(); reloadPlayer(); save(); };
  $('#edClose').onclick = () => closeEditor();
  $('#edListen').onclick = () => listen();
  $('#overlay').addEventListener('click', (ev) => {
    if (addMode) { placeAt(ev); return; }
    const r = ev.target.closest('.ev');
    if (r) select(+r.dataset.i, { listen: !player.playing }); else closeEditor();
  });

  // ------------------------------------------------------------- textes / tempo
  let textCtx = null;
  const TEXT_SUGG = { text: ['cresc.', 'dim.', 'rit.', 'a tempo', 'dolce', 'legato', 'plus fort', 'moins fort', 'accel.'], tempo: ['Largo', 'Adagio', 'Andante', 'Moderato', 'Allegretto', 'Allegro', 'Presto', 'a tempo'] };
  function openTextSheet(ctx) {
    textCtx = ctx;
    const e = cur.events[ctx.target];
    $('#textSheetTitle').textContent = ctx.kind === 'tempo' ? 'Tempo à partir de cette note' : 'Indication d’expression';
    $('#textInput').value = '';
    $('#textInput').placeholder = ctx.kind === 'tempo' ? 'ex. Allegro, ♩ = 96, a tempo…' : 'ex. cresc., rit., dolce…';
    $('#textSugg').innerHTML = TEXT_SUGG[ctx.kind === 'tempo' ? 'tempo' : 'text'].map((t) => `<button>${esc(t)}</button>`).join('');
    renderTextList(e);
    $('#textHint').textContent = '';
    showSheet('#textSheet');
  }
  function renderTextList(e) {
    $('#textList').innerHTML = (e && e.texts || []).map((t, k) => `<span>${esc(t.text)}<button data-k="${k}" aria-label="Retirer">×</button></span>`).join('');
  }
  function describe(k) {
    if (!k) return '';
    return { tempo: `Tempo : ${k.bpm} à la pulsation`, atempo: 'Retour au tempo', rit: 'Ralentir progressivement', accel: 'Accélérer progressivement', cresc: 'Crescendo jusqu’à la nuance suivante', dim: 'Diminuendo jusqu’à la nuance suivante', louder: 'Un peu plus fort', softer: 'Un peu moins fort', legato: 'Indication (lié)', staccato: 'Indication (détaché)', text: 'Texte sans effet sur le jeu' }[k.kind] || '';
  }
  $('#textInput').addEventListener('input', (ev) => { $('#textHint').textContent = describe(Expr.interpretText(ev.target.value)); });
  $('#textInput').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('#textOk').click(); });
  $('#textSugg').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; $('#textInput').value = b.textContent; $('#textHint').textContent = describe(Expr.interpretText(b.textContent)); $('#textOk').click(); });
  $('#textList').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-k]'); if (!b || !textCtx) return;
    const e = cur.events[textCtx.target]; e.texts.splice(+b.dataset.k, 1); if (!e.texts.length) delete e.texts;
    renderTextList(e); renderAll(); reloadPlayer(); save();
  });
  $('#textOk').onclick = () => {
    const t = $('#textInput').value.trim(); if (!t || !textCtx) return;
    const e = cur.events[textCtx.target]; if (!e) return;
    let k = Expr.interpretText(t);
    if (textCtx.kind === 'tempo' && k && k.kind === 'text' && /^\d{2,3}$/.test(t)) k = { kind: 'tempo', bpm: +t };
    if (textCtx.target === firstPlayable() && k && k.kind === 'tempo') {
      // tempo de départ : règle aussi le curseur
      cur.tempo = Math.max(30, Math.min(220, k.bpm)); cur.tempoText = t; $('#tempo').value = cur.tempo; $('#tempoVal').textContent = cur.tempo;
    }
    e.texts = e.texts || []; e.texts.push({ text: t, kind: k ? k.kind : 'text', ...(k && k.amount ? { amount: k.amount } : {}), ...(k && k.bpm ? { bpm: k.bpm } : {}) });
    e.edited = true;
    renderTextList(e); $('#textInput').value = ''; $('#textHint').textContent = 'Ajouté.';
    renderAll(); reloadPlayer(); save();
  };
  const firstPlayable = () => cur.events.findIndex((q) => isPlayable(q));

  // ------------------------------------------------------------- ajout d'éléments non détectés
  let addMode = false, addKind = 'note', addDur = 1, addFifths = 0;
  function setAddMode(on) {
    addMode = !!on;
    $('#addBar').hidden = !addMode; $('#addBtn').classList.toggle('on', addMode); $('#viewer').classList.toggle('adding', addMode);
    if (addMode) { closeEditor(); renderAddOpts(); }
  }
  function renderAddOpts() {
    $$('#addKinds button').forEach((b) => b.classList.toggle('on', b.dataset.kind === addKind));
    const o = $('#addOpts');
    if (addKind === 'note' || addKind === 'rest') o.innerHTML = BASES.map((b) => `<button data-adur="${b}" class="${b === addDur ? 'on' : ''}" aria-label="${(addKind === 'rest' ? REST_NAMES : DUR_NAMES)[b]}">${durIcon(b, addKind === 'rest')}</button>`).join('');
    else if (addKind === 'key') o.innerHTML = `<select id="addKeySel">${Array.from({ length: 15 }, (_, i) => i - 7).map((f) => `<option value="${f}"${f === addFifths ? ' selected' : ''}>${keyLabel(f)}</option>`).join('')}</select>`;
    else o.innerHTML = '<span class="hint">puis écrivez l’indication (rit., cresc., Allegro…)</span>';
    const ks = $('#addKeySel'); if (ks) ks.onchange = () => (addFifths = +ks.value);
  }
  $('#addBtn').onclick = () => { if (!cur) return; if (!cur.staves.some((st) => st.geom)) { toast('Partition importée avec une ancienne version : sélectionnez une note puis « + Après » ou « + Avant ».', 5000); return; } setAddMode(!addMode); if (addMode) toast('Touchez la partition à l’endroit de l’élément manquant'); };
  $('#addClose').onclick = () => setAddMode(false);
  $('#addKinds').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-kind]'); if (!b) return; addKind = b.dataset.kind; if (addKind === 'key' && sel < 0) addFifths = cur.staves[0] ? cur.staves[0].fifths || 0 : 0; renderAddOpts(); });
  $('#addOpts').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-adur]'); if (!b) return; addDur = +b.dataset.adur; renderAddOpts(); });
  // point touché -> portée, hauteur (lignes de la portée), position dans la suite d'événements
  function placeAt(ev) {
    const svg = $('#overlay'); const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const m = svg.getScreenCTM(); if (!m) return;
    const p = pt.matrixTransform(m.inverse()); const x = p.x, y = p.y;
    let best = -1, bd = 1e9, spB = 10;
    cur.staves.forEach((st, k) => {
      if (!st.geom) return;
      const y0 = lineYAt(st.geom, 0, x), y4 = lineYAt(st.geom, 4, x), sp = (y4 - y0) / 4;
      const xa = st.geom[0][0][0], xb = st.geom[0][st.geom[0].length - 1][0];
      if (x < xa - 3 * sp || x > xb + 2 * sp) return;
      const d = y < y0 ? y0 - y : y > y4 ? y - y4 : 0;
      if (d < 6 * sp && d < bd) { bd = d; best = k; spB = sp; }
    });
    if (best < 0) { toast('Touchez sur une portée (ou juste au-dessus / en dessous)'); return; }
    const st = cur.staves[best];
    const y4 = lineYAt(st.geom, 4, x);
    const pos = Math.round((y4 - y) / (spB / 2));
    // position dans la suite : avant le premier événement de cette portée situé plus à droite
    let at = cur.events.findIndex((q) => q.staff > best || (q.staff === best && q.x != null && q.x > x));
    if (at < 0) at = cur.events.length;
    const prev = cur.events.slice(0, at).reverse().find((q) => q.staff === best);
    const measure = prev ? prev.measure : (cur.events[at] ? cur.events[at].measure : 0);
    const yc = y4 - pos * spB / 2;
    const box = [x - 0.7 * spB, yc - 0.55 * spB, x + 0.7 * spB, yc + 0.55 * spB];
    let n;
    if (addKind === 'note' || addKind === 'rest') {
      n = { type: addKind, staff: best, measure, dur: addDur, x, y: yc, box, edited: true, added: true, pitches: [] };
      if (addKind === 'note') {
        const bottom = OMR.CLEF_BOTTOM[clefOf(best)] || 30, d = bottom + pos;
        const alter = OMR.keyAlter(keyAt(best, x), ((d % 7) + 7) % 7);
        n.pitches = [{ midi: OMR.diatonicToMidi(d, alter), step: d, pos, alter, explicit: false }];
        n.stem = 0; n.beams = 0;
      } else { n.y = lineYAt(st.geom, 2, x); n.box = [x - 0.6 * spB, n.y - 1.2 * spB, x + 0.6 * spB, n.y + 1.2 * spB]; }
    } else if (addKind === 'key') {
      n = { type: 'key', fifths: addFifths, staff: best, measure, dur: 0, x, y: lineYAt(st.geom, 2, x), box: [x - 0.8 * spB, lineYAt(st.geom, 0, x) - 0.8 * spB, x + 0.8 * spB, y4 + 0.8 * spB], edited: true, added: true };
    } else {
      // texte : rattaché à la note la plus proche à droite du point touché
      let j = cur.events.findIndex((q, k) => k >= at && q.staff === best && q.type === 'note');
      if (j < 0) j = cur.events.map((q, k) => (q.staff === best && q.type === 'note' ? k : -1)).filter((k) => k >= 0).pop();
      if (j == null || j < 0) { toast('Aucune note sur cette portée'); return; }
      openTextSheet({ kind: 'text', target: j });
      return;
    }
    cur.events.splice(at, 0, n);
    recompute(); renderAll(); reloadPlayer(); save();
    setTab('note');
    select(at, { listen: n.type === 'note' });
    $('#editor').hidden = false;
    toast(n.type === 'note' ? `Note ajoutée : ${pitchName(n.pitches[0])}. Ajustez-la si besoin.` : n.type === 'rest' ? 'Silence ajouté' : 'Armure ajoutée');
  }
  $('#strip').addEventListener('click', (ev) => { const c = ev.target.closest('.chip[data-i]'); if (c) select(+c.dataset.i, { follow: true, listen: !player.playing }); });

  // ------------------------------------------------------------- lecture
  let wakeLock = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* */ } }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
  function playerOpts() { return { tempo: cur.tempo, beatQ: cur.beatQ || 1, barQ: cur.measureLen || (cur.time ? cur.time[0] * 4 / cur.time[1] : 4), instrument: cur.instrument, transpose: cur.transpose || 0, repeats: cur.playRepeats !== false, expressive: cur.expressive !== false }; }
  function reloadPlayer() {
    const was = player.playing, at = playIdx;
    player.load(cur.events, playerOpts());
    player.loop = !!cur.loop; player.metronome = !!cur.metronome;
    player.beatsPerBar = cur.time ? cur.time[0] : Math.round(cur.measureLen || 4);
    if (was) player.play(Math.max(0, at)); else resumeFrom = null;
  }
  let resumeFrom = null;
  function setPlaying(on) {
    const b = $('#playBtn'); b.classList.toggle('playing', on);
    b.querySelector('.ico').innerHTML = icon(on ? 'pause' : 'play');
    b.setAttribute('aria-label', on ? 'Pause' : 'Lecture');
  }
  player.onPos = (i, q) => {
    setPlayHighlight(i);
    $('#progressBar').style.width = (100 * Math.min(1, q / (player.tl.total || 1))) + '%';
  };
  player.onEnd = () => { setPlaying(false); setPlayHighlight(-1); resumeFrom = null; $('#progressBar').style.width = '100%'; releaseWake(); };
  $('#playBtn').onclick = () => {
    if (!cur) return;
    if (player.playing) { player.stop(); resumeFrom = playIdx; setPlaying(false); releaseWake(); return; }
    Synth.audio();
    reloadPlayer();
    const from = sel >= 0 ? sel : (resumeFrom != null && resumeFrom >= 0 ? resumeFrom : 0);
    if (sel >= 0) closeEditor();
    player.play(from); setPlaying(true); keepAwake();
  };
  $('#stopBtn').onclick = () => { player.stop(); setPlaying(false); setPlayHighlight(-1); resumeFrom = null; $('#progressBar').style.width = '0'; $('#viewer').scrollTo({ top: 0, left: 0, behavior: 'smooth' }); releaseWake(); };
  $('#tempo').oninput = (e) => { cur.tempo = +e.target.value; $('#tempoVal').textContent = cur.tempo; if (player.playing) reloadPlayer(); save(); };
  const instrSel = $('#instrument');
  instrSel.innerHTML = Object.entries(Synth.INSTRUMENTS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  instrSel.onchange = () => { cur.instrument = instrSel.value; if (player.playing) reloadPlayer(); else { const e = cur.events.find((x) => x.type === 'note'); if (e) Synth.previewNote(cur.instrument, e.pitches[0].midi + (cur.transpose || 0)); } save(); };

  // ------------------------------------------------------------- réglages
  function openSheet() {
    $('#clefSel').value = cur.clefOverride || '';
    const ks = $('#keySel');
    ks.innerHTML = `<option value="">Détectée : ${keyLabel(cur.key)}</option>` + Array.from({ length: 15 }, (_, i) => i - 7).map((f) => `<option value="${f}">${keyLabel(f)}</option>`).join('');
    ks.value = cur.keyOverride != null ? String(cur.keyOverride) : '';
    $('#trVal').textContent = (cur.transpose > 0 ? '+' : '') + (cur.transpose || 0);
    $('#metroChk').checked = !!cur.metronome; $('#loopChk').checked = !!cur.loop; $('#repChk').checked = cur.playRepeats !== false;
    $('#midiField').hidden = !navigator.requestMIDIAccess;
    $('#exprChk').checked = cur.expressive !== false;
    const info = [];
    if (cur.autoTitle) info.push(`Titre lu : <b>${esc(cur.title)}</b>`);
    if (cur.tempoText) info.push(`Tempo lu : <b>${esc(cur.tempoText)}</b> → ${cur.tempo} ${beatWord(cur.beatQ)}${cur.beatQ === 1.5 ? ' (en mesure composée, le chiffre vaut pour la noire pointée)' : ''}`);
    const nt = cur.events.filter((e) => e.texts && e.texts.length).length;
    if (nt) info.push(`${nt} indication${nt > 1 ? 's' : ''} d’expression lue${nt > 1 ? 's' : ''} : ${esc(cur.events.filter((e) => e.texts).flatMap((e) => e.texts.map((t) => t.text)).slice(0, 6).join(' · '))}`);
    $('#readInfo').innerHTML = info.join('<br>'); $('#readInfo').hidden = !info.length;
    showSheet('#menuSheet');
  }
  function closeSheet() { hideSheets(); }
  $('#menuBtn').onclick = openSheet;
  $('#sheetBackdrop').onclick = hideSheets;
  $('#exprChk').onchange = (e) => { cur.expressive = e.target.checked; reloadPlayer(); save(); toast(cur.expressive ? 'Nuances et articulations jouées' : 'Lecture neutre, sans nuances'); };
  $('#renameBtn2').onclick = () => openRename(cur.title, renameCurrent);
  $('#renameBtn').onclick = () => openRename(cur.title, renameCurrent);
  $('#clefSel').onchange = (e) => { cur.clefOverride = e.target.value; recompute(); renderAll(); reloadPlayer(); save(); };
  $('#keySel').onchange = (e) => { cur.keyOverride = e.target.value === '' ? null : +e.target.value; recompute(); renderAll(); reloadPlayer(); save(); };
  $$('#menuSheet [data-tr]').forEach((b) => (b.onclick = () => { cur.transpose = Math.max(-24, Math.min(24, (cur.transpose || 0) + +b.dataset.tr)); $('#trVal').textContent = (cur.transpose > 0 ? '+' : '') + cur.transpose; reloadPlayer(); save(); }));
  $('#metroChk').onchange = (e) => { cur.metronome = e.target.checked; player.metronome = cur.metronome; save(); };
  $('#loopChk').onchange = (e) => { cur.loop = e.target.checked; player.loop = cur.loop; save(); };
  $('#repChk').onchange = (e) => { cur.playRepeats = e.target.checked; reloadPlayer(); save(); toast(cur.playRepeats ? 'Les reprises seront jouées' : 'Lecture d’un trait, sans reprises'); };
  const midiSel = $('#midiSel');
  midiSel.innerHTML = '<option value="">Haut-parleur du téléphone</option><option value="__scan">Rechercher un appareil MIDI…</option>';
  midiSel.onchange = async () => {
    if (midiSel.value === '__scan') {
      const outs = await Synth.Midi.init();
      midiSel.innerHTML = '<option value="">Haut-parleur du téléphone</option>' + outs.map((o) => `<option value="${o.id}">${o.name}</option>`).join('') + '<option value="__scan">Rechercher à nouveau…</option>';
      midiSel.value = '';
      toast(outs.length ? `${outs.length} appareil(s) MIDI trouvé(s)` : 'Aucun appareil MIDI branché (USB ou Bluetooth)');
      return;
    }
    Synth.Midi.select(midiSel.value);
    player.useSynth = !midiSel.value;
    toast(midiSel.value ? 'Son envoyé vers l’appareil MIDI' : 'Son joué par le téléphone');
  };
  $('#exportBtn').onclick = async () => {
    const po = playerOpts();
    const tl = Synth.buildTimeline(cur.events, cur.transpose || 0, cur.playRepeats !== false, po);
    const keyChanges = [];
    tl.items.forEach((it, k) => { const e = cur.events[it.i]; const prevKey = k ? cur.events[tl.items[k - 1].i]._key : null; if (e._key != null && prevKey != null && e._key !== prevKey) keyChanges.push({ q: it.q0, fifths: e._key }); });
    const k0 = tl.items.length ? cur.events[tl.items[0].i]._key : 0;
    const bytes = MidiFile.toSMF(tl, { tempo: cur.tempo * (cur.beatQ || 1), program: Synth.INSTRUMENTS[cur.instrument].gm, title: cur.title, timeSig: cur.time, key: k0 || 0, keyChanges });
    const name = (cur.title || 'partition').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '_') + '.mid';
    const file = new File([bytes], name, { type: 'audio/midi' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: cur.title }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Fichier MIDI enregistré dans vos téléchargements');
  };
  // suppression en deux temps (pas de boîte de dialogue système)
  let delArmed = null;
  $('#deleteBtn').onclick = async () => {
    const b = $('#deleteBtn');
    if (!delArmed) {
      b.lastChild.textContent = ' Toucher encore pour supprimer';
      delArmed = setTimeout(() => { delArmed = null; b.lastChild.textContent = ' Supprimer'; }, 3500);
      return;
    }
    clearTimeout(delArmed); delArmed = null; b.lastChild.textContent = ' Supprimer';
    const title = cur.title;
    await DB.del(cur.id); closeSheet(); history.back();
    toast(`« ${title} » supprimée`);
  };
  $('#titleInput').onchange = (e) => { cur.title = e.target.value.trim() || 'Sans titre'; cur.autoTitle = false; save(); };
  $('#zoomIn').onclick = () => setZoom(zoom * 1.5);
  $('#zoomOut').onclick = () => setZoom(zoom / 1.5);
  $('#backBtn').onclick = () => (history.state && history.state.view === 'score' ? history.back() : goHome());
  window.addEventListener('popstate', () => { hideSheets(); if ($('#score').classList.contains('active')) goHome(); });

  // ------------------------------------------------------------- entrées photo
  const onPick = (input) => input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; if (f) processImage(f); });
  onPick($('#camInput')); onPick($('#fileInput'));
  $$('.demo-chip').forEach((b) => (b.onclick = async () => {
    try { const r = await fetch(b.dataset.demo); processImage(await r.blob(), b.dataset.title); } catch (e) { toast('Exemple indisponible'); }
  }));
  // partage d'image vers l'app (glisser-déposer sur ordinateur)
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) processImage(f); });

  // ------------------------------------------------------------- installation PWA
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
  $('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
  window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Stephony est installée'); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

  // ------------------------------------------------------------- démarrage
  paintIcons();
  const dbReady = DB.open().then(renderLibrary).catch(() => toast('Stockage indisponible : les partitions ne seront pas conservées'));
  history.replaceState({ view: 'home' }, '', location.pathname);
  // image reçue via « Partager » depuis la galerie
  if (/shared=1/.test(location.search) && 'caches' in window) {
    dbReady.then(() => caches.open('stephony-share')).then(async (c) => { const r = await c.match('shared-image'); if (r) { await c.delete('shared-image'); processImage(await r.blob()); } });
  }
  window.Stephony = { processImage, get score() { return cur; } };
})();
