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
  const isMark = (e) => e && (e.type === 'repeat' || e.type === 'volta');
  const markName = (e) => e.type === 'volta' ? (e.n === 2 ? '2e fin' : '1re fin') : (e.kind === 'start' ? 'Début de reprise' : 'Fin de reprise');
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
      setBusy('Enregistrement…', 1);
      const image = await canvasBlob(canvas, 'image/jpeg', 0.85);
      const th = document.createElement('canvas'); const tk = 360 / cw; th.width = 360; th.height = Math.round(ch * tk);
      th.getContext('2d').drawImage(canvas, 0, 0, th.width, th.height);
      const now = Date.now();
      const sc = {
        id: 's' + now.toString(36), title: title || 'Partition du ' + new Date(now).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        created: now, updated: now, image, w: cw, h: ch, thumb: th.toDataURL('image/jpeg', 0.7),
        events: res.events.map((e) => ({ ...e })), staves: res.staves.map((s) => ({ clef: s.clef, fifths: s.fifths })),
        key: res.key || 0, time: res.time, measureLen: res.measureLen, sp: res.metrics ? res.metrics.s / res.metrics.scale : 0,
        tempo: 90, instrument: 'piano', clefOverride: '', keyOverride: null, transpose: 0, metronome: false, loop: false,
      };
      await DB.put(sc);
      setBusy(false);
      openScore(sc, true);
      toast(`${notes} notes reconnues. Touchez une note pour la corriger.`, 3500);
    } catch (err) {
      console.error(err);
      setBusy(false);
      toast('Oups : ' + err.message, 5000);
    }
  }

  // ------------------------------------------------------------- bibliothèque
  async function renderLibrary() {
    const list = (await DB.all()).sort((a, b) => b.updated - a.updated);
    const lib = $('#library');
    if (!list.length) { lib.innerHTML = '<div class="empty">Vos partitions apparaîtront ici.<br>Commencez par une photo ou essayez l’exemple.</div>'; return; }
    lib.innerHTML = '';
    for (const sc of list) {
      const b = document.createElement('button');
      b.className = 'lib-item';
      const n = sc.events.filter((e) => e.type === 'note').length;
      b.innerHTML = `<img alt="" src="${sc.thumb}"><div class="lib-meta"><div class="lib-title"></div><div class="lib-sub">${n} notes · ${fmtDate(sc.updated)}</div></div>`;
      b.querySelector('.lib-title').textContent = sc.title;
      b.onclick = async () => openScore(await DB.get(sc.id), true);
      lib.appendChild(b);
    }
  }

  // ------------------------------------------------------------- partition ouverte
  let cur = null, imgURL = null, sel = -1, playIdx = -1, zoom = 1;
  const player = new Synth.Player();
  let saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (cur) { cur.updated = Date.now(); DB.put(cur).catch(() => toast('Enregistrement impossible')); } }, 400); }
  const effKey = () => (cur.keyOverride != null ? cur.keyOverride : cur.key);
  const clefOf = (staff) => cur.clefOverride || (cur.staves[staff] && cur.staves[staff].clef) || 'G';

  // recalcul des hauteurs selon clé / armure / altérations accidentelles
  function recompute() {
    const fifths = effKey();
    let acc = {}, st = -1, ms = -1;
    for (const e of cur.events) {
      if (e.staff !== st || e.measure !== ms) { acc = {}; st = e.staff; ms = e.measure; }
      if (e.type !== 'note') continue;
      const bottom = OMR.CLEF_BOTTOM[clefOf(e.staff)] || 30;
      for (const p of e.pitches) {
        if (p.pos == null) continue;
        const d = bottom + p.pos, letter = ((d % 7) + 7) % 7;
        let alter;
        if (p.explicit) { alter = p.alter; acc[d] = alter; } else if (acc[d] != null) alter = acc[d]; else alter = OMR.keyAlter(fifths, letter);
        p.step = d; p.alter = alter; p.midi = OMR.diatonicToMidi(d, alter);
      }
    }
  }

  function openScore(sc, push) {
    if (!sc) return;
    player.stop(true); setPlaying(false);
    cur = sc; sel = -1; playIdx = -1; zoom = 1;
    if (imgURL) URL.revokeObjectURL(imgURL);
    imgURL = URL.createObjectURL(sc.image);
    $('#scoreImg').src = imgURL;
    $('#titleInput').value = sc.title;
    $('#tempo').value = sc.tempo; $('#tempoVal').textContent = sc.tempo;
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
    cur = null; closeSheet();
    showView('home'); renderLibrary();
  }

  function renderInfo() {
    const f = effKey();
    const n = cur.events.filter((e) => e.type === 'note').length;
    const clefs = { G: 'Clé de sol', F: 'Clé de fa', C: 'Clé d’ut' };
    const clef = cur.clefOverride || (cur.staves[0] && cur.staves[0].clef) || 'G';
    $('#infoKey').textContent = `${clefs[clef]} · ${f === 0 ? 'Do maj.' : MAJ[f] + ' maj.'}${cur.time ? ' · ' + cur.time.join('/') : ''}`;
    const reps = cur.events.filter((e) => e.type === 'repeat' && e.kind === 'end').length;
    const tups = new Set(cur.events.filter((e) => e.tup).map((e) => e.tupId)).size;
    $('#infoNotes').textContent = `${n} notes` + (reps ? ` · ${reps} reprise${reps > 1 ? 's' : ''}` : '') + (tups ? ` · ${tups} triolet${tups > 1 ? 's' : ''}` : '');
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
      if (isMark(e)) {
        const ico = e.type === 'repeat' ? repIcon(e.kind) : '';
        html += `<button class="chip mark${i === sel ? ' sel' : ''}" data-i="${i}">${ico}${e.type === 'repeat' ? (e.kind === 'start' ? 'Reprise' : 'Fin') : (e.n === 2 ? '2e fin' : '1re fin')}</button>`;
        return;
      }
      const { base, dotted } = splitDur(e.dur);
      const label = e.type === 'rest' ? 'Silence' : e.pitches.map((p) => pitchName(p)).join('+');
      html += `<button class="chip ${e.type}${e.tie ? ' tie' : ''}${e.tup ? ' tupl' : ''}${i === sel ? ' sel' : ''}${i === playIdx ? ' cur' : ''}" data-i="${i}"><span class="dur">${durIcon(base, e.type === 'rest')}</span>${label}${dotted ? '·' : ''}${e.tup ? '<span class="tup3">3</span>' : ''}</button>`;
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
  function renderEditor() {
    const e = cur.events[sel]; if (!e) return;
    const mark = isMark(e);
    ['#edPitchRow', '#edDurRow', '#edNoteRow', '#edStructRow'].forEach((q) => ($(q).hidden = mark));
    $('#edMarkRow').hidden = !mark;
    $('#edListen').hidden = mark;
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
    $('#edSub').textContent = `${rest ? 'Silence' : (DUR_NAMES[base] || 'Durée ' + base)}${dotted ? ' pointée' : ''}${e.tup ? ' de triolet' : ''} · portée ${e.staff + 1}, mesure ${e.measure + 1}`;
    $('#edPitchRow').style.opacity = rest ? 0.35 : 1;
    $$('#edPitchRow button').forEach((b) => (b.disabled = rest));
    $('#edDurRow').innerHTML = BASES.map((b) => `<button class="ed-btn${b === base ? ' on' : ''}" data-dur="${b}" aria-label="${(rest ? REST_NAMES : DUR_NAMES)[b]}">${durIcon(b, rest)}</button>`).join('') +
      `<button class="ed-btn${dotted ? ' on' : ''}" data-act="dot" aria-label="Pointée">•</button>`;
    $('#edRestBtn').textContent = rest ? '→ Note' : '→ Silence';
    $('#edTieBtn').classList.toggle('on', !!e.tie);
    $('#edTieBtn').disabled = rest;
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
      case 'playFromMark': { let j = sel; while (j < cur.events.length && isMark(cur.events[j])) j++; closeEditor(); Synth.audio(); reloadPlayer(); player.play(j); setPlaying(true); keepAwake(); break; }
      case 'insert': {
        const n = JSON.parse(JSON.stringify(e)); n.edited = true; n.tie = false;
        if (n.box) { const w = n.box[2] - n.box[0]; n.box = [n.box[0] + w * 1.15, n.box[1], n.box[2] + w * 1.15, n.box[3]]; }
        cur.events.splice(sel + 1, 0, n); sel++; edited(); break;
      }
      case 'delete':
        cur.events.splice(sel, 1);
        if (sel >= cur.events.length) sel = cur.events.length - 1;
        renderAll(); reloadPlayer(); save(); if (sel < 0) closeEditor(); else renderEditor();
        toast('Élément supprimé');
        break;
    }
  });
  function neighbourMidi(i) {
    for (let d = 1; d < cur.events.length; d++) for (const j of [i - d, i + d]) { const e = cur.events[j]; if (e && e.type === 'note' && e.pitches.length) { const p = e.pitches[0]; return p.manual != null ? p.manual : p.midi; } }
    return 67;
  }
  $('#edClose').onclick = () => closeEditor();
  $('#edListen').onclick = () => listen();
  $('#overlay').addEventListener('click', (ev) => {
    const r = ev.target.closest('.ev');
    if (r) select(+r.dataset.i, { listen: !player.playing }); else closeEditor();
  });
  $('#strip').addEventListener('click', (ev) => { const c = ev.target.closest('.chip[data-i]'); if (c) select(+c.dataset.i, { follow: true, listen: !player.playing }); });

  // ------------------------------------------------------------- lecture
  let wakeLock = null;
  async function keepAwake() { try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* */ } }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
  function playerOpts() { return { tempo: cur.tempo, instrument: cur.instrument, transpose: cur.transpose || 0, repeats: cur.playRepeats !== false }; }
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
    $('#sheetBackdrop').hidden = false; $('#menuSheet').hidden = false;
  }
  function closeSheet() { $('#sheetBackdrop').hidden = true; $('#menuSheet').hidden = true; }
  $('#menuBtn').onclick = openSheet;
  $('#sheetBackdrop').onclick = closeSheet;
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
    const tl = Synth.buildTimeline(cur.events, cur.transpose || 0, cur.playRepeats !== false);
    const bytes = MidiFile.toSMF(tl, { tempo: cur.tempo, program: Synth.INSTRUMENTS[cur.instrument].gm, title: cur.title, timeSig: cur.time, key: effKey() });
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
  $('#titleInput').onchange = (e) => { cur.title = e.target.value.trim() || 'Sans titre'; save(); };
  $('#zoomIn').onclick = () => setZoom(zoom * 1.5);
  $('#zoomOut').onclick = () => setZoom(zoom / 1.5);
  $('#backBtn').onclick = () => (history.state && history.state.view === 'score' ? history.back() : goHome());
  window.addEventListener('popstate', () => { if (!$('#menuSheet').hidden) { closeSheet(); } if ($('#score').classList.contains('active')) goHome(); });

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
