/* Stephony — synthétiseur Web Audio (sons type General MIDI) + lecteur + sortie Web MIDI */
(function (root) {
  'use strict';

  let ctx = null, master = null, dry = null, wet = null;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3;
      master.connect(comp); comp.connect(ctx.destination);
      dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);
      // petite réverbération (réponse impulsionnelle générée)
      const conv = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 1.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      conv.buffer = ir;
      wet = ctx.createGain(); wet.gain.value = 0.16; wet.connect(conv); conv.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const waveCache = {};
  function wave(name, harmonics) {
    if (waveCache[name]) return waveCache[name];
    const real = new Float32Array(harmonics.length + 1), imag = new Float32Array(harmonics.length + 1);
    harmonics.forEach((a, i) => (imag[i + 1] = a));
    return (waveCache[name] = ctx.createPeriodicWave(real, imag));
  }
  function out(node, rev = 1) { node.connect(dry); const s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(wet); }
  function vibrato(param, f, depthCents, start, rate = 5.2) {
    const lfo = ctx.createOscillator(), g = ctx.createGain();
    lfo.frequency.value = rate; g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(f * (Math.pow(2, depthCents / 1200) - 1), start + 0.35);
    lfo.connect(g); g.connect(param); lfo.start(start); return lfo;
  }

  // Karplus-Strong pré-calculé (guitare / harpe)
  const ksCache = {};
  function ksBuffer(midi, bright) {
    const key = midi + ':' + bright;
    if (ksCache[key]) return ksCache[key];
    const sr = ctx.sampleRate, f = mtof(midi), N = Math.max(2, Math.round(sr / f));
    const dur = Math.min(3.5, 1.2 + 140 / f), len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(Math.PI * i / N));
    const damp = 0.996 - Math.max(0, (midi - 60)) * 0.0004;
    let p = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[p], nxt = ring[(p + 1) % N];
      d[i] = cur;
      ring[p] = damp * (0.5 * (cur + nxt) * (1 - bright * 0.3) + cur * bright * 0.3);
      p = (p + 1) % N;
    }
    return (ksCache[key] = buf);
  }

  // ------------------------------------------------------- instruments
  const INSTRUMENTS = {
    piano: { name: 'Piano', gm: 0, icon: '🎹' },
    epiano: { name: 'Piano électrique', gm: 4, icon: '🎹' },
    musicbox: { name: 'Boîte à musique', gm: 10, icon: '🎁' },
    organ: { name: 'Orgue', gm: 19, icon: '⛪' },
    guitar: { name: 'Guitare', gm: 24, icon: '🎸' },
    harp: { name: 'Harpe', gm: 46, icon: '🪕' },
    violin: { name: 'Violon', gm: 40, icon: '🎻' },
    strings: { name: 'Ensemble à cordes', gm: 48, icon: '🎻' },
    flute: { name: 'Flûte', gm: 73, icon: '🪈' },
    clarinet: { name: 'Clarinette', gm: 71, icon: '🎷' },
    trumpet: { name: 'Trompette', gm: 56, icon: '🎺' },
    synth: { name: 'Synthé', gm: 81, icon: '🎛️' },
  };

  // joue une note ; renvoie le temps de fin réel (avec relâchement)
  function playNote(instr, midi, when, dur, vel = 0.8) {
    audio();
    const f = mtof(midi), t0 = Math.max(when, ctx.currentTime), t1 = t0 + Math.max(0.05, dur);
    const g = ctx.createGain(); g.gain.value = 0;
    const nodes = [];
    const osc = (type, freq, detune = 0) => { const o = ctx.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type); o.frequency.value = freq; o.detune.value = detune; nodes.push(o); return o; };
    let end = t1 + 0.3;
    const lowNorm = Math.max(0, Math.min(1, (84 - midi) / 48));
    switch (instr) {
      case 'piano': {
        const w = wave('piano', [1, 0.55, 0.32, 0.22, 0.12, 0.09, 0.06, 0.035, 0.02, 0.012]);
        const o1 = osc(w, f, -3), o2 = osc(w, f, 3), o3 = osc('sine', f * 2.003);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
        lp.frequency.setValueAtTime(Math.min(16000, f * 14 + 2500), t0);
        lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 3), t0 + 1.4 + lowNorm);
        const g3 = ctx.createGain(); g3.gain.value = 0.18; o3.connect(g3); g3.connect(lp);
        o1.connect(lp); o2.connect(lp); lp.connect(g);
        const decay = 0.9 + lowNorm * 2.4;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vel * 0.42, t0 + 0.004);
        g.gain.setTargetAtTime(vel * 0.16, t0 + 0.004, 0.18);
        g.gain.setTargetAtTime(0.0001, t0 + 0.3, decay);
        g.gain.cancelScheduledValues(t1); g.gain.setTargetAtTime(0, t1, 0.09); end = t1 + 0.5;
        break;
      }
      case 'epiano': {
        const car = osc('sine', f), mod = osc('sine', f), mg = ctx.createGain();
        mg.gain.setValueAtTime(f * 2.2, t0); mg.gain.exponentialRampToValueAtTime(f * 0.15, t0 + 0.9);
        mod.connect(mg); mg.connect(car.frequency); car.connect(g);
        const bell = osc('sine', f * 4.01), bg = ctx.createGain(); bg.gain.setValueAtTime(0.12 * vel, t0); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5); bell.connect(bg); bg.connect(g);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vel * 0.4, t0 + 0.005); g.gain.setTargetAtTime(0.0001, t0 + 0.01, 1.2 + lowNorm);
        g.gain.cancelScheduledValues(t1); g.gain.setTargetAtTime(0, t1, 0.12); end = t1 + 0.6;
        break;
      }
      case 'musicbox': {
        [[1, 0.5], [2.0, 0.12], [3.0, 0.15], [4.16, 0.08], [5.43, 0.04]].forEach(([r, a]) => {
          const o = osc('sine', f * r), og = ctx.createGain(); og.gain.setValueAtTime(a * vel, t0); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2 / r + 0.3); o.connect(og); og.connect(g);
        });
        g.gain.setValueAtTime(1, t0); end = t0 + 2.6;
        break;
      }
      case 'organ': {
        const w = wave('organ', [1, 0.9, 0.55, 0.5, 0, 0.35, 0, 0.25, 0, 0, 0, 0.12]);
        const o1 = osc(w, f), o2 = osc(w, f * 0.5, 2);
        const og2 = ctx.createGain(); og2.gain.value = 0.5; o2.connect(og2); og2.connect(g); o1.connect(g);
        const trem = ctx.createOscillator(), tg = ctx.createGain(); trem.frequency.value = 6.2; tg.gain.value = 0.04 * vel; trem.connect(tg); tg.connect(g.gain); trem.start(t0); nodes.push(trem);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vel * 0.22, t0 + 0.03); g.gain.setValueAtTime(vel * 0.22, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.08); end = t1 + 0.12;
        break;
      }
      case 'guitar': case 'harp': {
        const src = ctx.createBufferSource(); src.buffer = ksBuffer(midi, instr === 'harp' ? 0.2 : 0.5);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = instr === 'harp' ? 3200 : 4500;
        src.connect(lp); lp.connect(g); nodes.push(src);
        g.gain.setValueAtTime(vel * (instr === 'harp' ? 0.9 : 0.8), t0);
        const stopAt = instr === 'harp' ? t0 + src.buffer.duration : Math.min(t0 + src.buffer.duration, t1 + 0.15);
        g.gain.setTargetAtTime(0, stopAt - 0.1, 0.05); end = stopAt + 0.1;
        break;
      }
      case 'violin': case 'strings': {
        const n = instr === 'strings' ? 3 : 1;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, f * 8); lp.Q.value = 0.8;
        const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2800; pk.gain.value = 5; pk.Q.value = 1.2;
        for (let i = 0; i < n; i++) {
          const o = osc('sawtooth', f, (i - (n - 1) / 2) * 9);
          nodes.push(vibrato(o.frequency, f, instr === 'violin' ? 14 : 7, t0 + 0.15, 5 + i * 0.4));
          o.connect(lp);
        }
        lp.connect(pk); pk.connect(g);
        const lvl = vel * (instr === 'violin' ? 0.2 : 0.11);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(lvl, t0 + (instr === 'violin' ? 0.07 : 0.16)); g.gain.setValueAtTime(lvl, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.22); end = t1 + 0.3;
        break;
      }
      case 'flute': {
        const o = osc(wave('flute', [1, 0.12, 0.05, 0.02]), f); nodes.push(vibrato(o.frequency, f, 9, t0 + 0.25, 5));
        o.connect(g);
        const nb = ctx.createBufferSource(), len = ctx.sampleRate; const b = ctx.createBuffer(1, len, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        nb.buffer = b; nb.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3; const ng = ctx.createGain(); ng.gain.value = 0.05; nb.connect(bp); bp.connect(ng); ng.connect(g); nodes.push(nb);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vel * 0.3, t0 + 0.06); g.gain.setValueAtTime(vel * 0.3, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.1); end = t1 + 0.15;
        break;
      }
      case 'clarinet': {
        const o = osc(wave('clar', [1, 0.02, 0.45, 0.02, 0.25, 0.01, 0.12, 0, 0.06]), f); nodes.push(vibrato(o.frequency, f, 5, t0 + 0.3, 4.8));
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(6000, f * 6); o.connect(lp); lp.connect(g);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vel * 0.28, t0 + 0.04); g.gain.setValueAtTime(vel * 0.28, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.08); end = t1 + 0.12;
        break;
      }
      case 'trumpet': {
        const o = osc('sawtooth', f); nodes.push(vibrato(o.frequency, f, 6, t0 + 0.3, 5.5));
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
        lp.frequency.setValueAtTime(f * 1.5, t0); lp.frequency.linearRampToValueAtTime(Math.min(8000, f * 7), t0 + 0.06);
        o.connect(lp); lp.connect(g);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vel * 0.26, t0 + 0.04); g.gain.setValueAtTime(vel * 0.22, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.09); end = t1 + 0.12;
        break;
      }
      default: { // synth
        const o1 = osc('sawtooth', f, -7), o2 = osc('square', f, 7);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
        lp.frequency.setValueAtTime(f * 10, t0); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2.5), t0 + 0.4);
        o1.connect(lp); o2.connect(lp); lp.connect(g);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vel * 0.14, t0 + 0.01); g.gain.setValueAtTime(vel * 0.12, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.1); end = t1 + 0.15;
      }
    }
    out(g, instr === 'organ' ? 1.4 : 1);
    nodes.forEach((n) => { try { n.start(t0); } catch (e) { /* déjà démarré */ } try { n.stop(end + 0.05); } catch (e) { /* */ } });
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* */ } }, (end - ctx.currentTime + 1) * 1000);
    return end;
  }

  function click(when, accent) {
    audio();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1180; o.type = 'square';
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(accent ? 0.18 : 0.1, when + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g); g.connect(master); o.start(when); o.stop(when + 0.06);
  }

  // ------------------------------------------------------- Web MIDI
  const Midi = {
    access: null, output: null,
    async init() {
      if (!navigator.requestMIDIAccess) return [];
      try { this.access = await navigator.requestMIDIAccess(); } catch (e) { return []; }
      return this.list();
    },
    list() { return this.access ? Array.from(this.access.outputs.values()).map((o) => ({ id: o.id, name: o.name })) : []; },
    select(id) { this.output = this.access && id ? this.access.outputs.get(id) || null : null; },
    send(bytes, atAudioTime) {
      if (!this.output) return;
      const ts = atAudioTime != null ? performance.now() + Math.max(0, (atAudioTime - ctx.currentTime) * 1000) : undefined;
      try { this.output.send(bytes, ts); } catch (e) { /* */ }
    },
    allOff() { if (this.output) for (let c = 0; c < 16; c++) this.send([0xB0 | c, 123, 0]); },
  };

  // ------------------------------------------------------- lecteur
  // timeline : [{i, start (noires), dur (noires), midis[], rest}]
  // timeline dans l'ordre de jeu (reprises et 1re/2e fins déroulées, triolets à 2/3)
  function buildTimeline(events, transpose = 0, expand = true) {
    const order = expand && root.OMR && root.OMR.expandRepeats ? root.OMR.expandRepeats(events) : events.map((e, i) => i).filter((i) => events[i].type === 'note' || events[i].type === 'rest');
    const tl = []; let t = 0; let last = null;
    for (const i of order) {
      const e = events[i];
      if (e.type !== 'note' && e.type !== 'rest') continue;
      const d = (typeof e.dur === 'number' ? e.dur : 1) * (e.tup || 1);
      if (e.type === 'rest') { tl.push({ i, start: t, dur: d, midis: [], rest: true }); last = null; }
      else {
        const midis = e.pitches.map((p) => (p.manual != null ? p.manual : p.midi) + transpose);
        if (e.tie && last && last.midis.join() === midis.join()) { last.dur += d; tl.push({ i, start: t, dur: d, midis, tied: true }); }
        else { last = { i, start: t, dur: d, midis }; tl.push(last); }
      }
      t += d;
    }
    return { items: tl, total: t };
  }

  class Player {
    constructor() { this.playing = false; this.timer = null; this.onPos = null; this.onEnd = null; this.loop = false; this.metronome = false; this.beatsPerBar = 4; this.useSynth = true; }
    load(events, opts) {
      this.stop();
      this.events = events; this.opts = opts;
      this.tl = buildTimeline(events, opts.transpose || 0, opts.repeats !== false);
    }
    get spq() { return 60 / (this.opts.tempo || 100); }
    play(fromIndex = 0) {
      audio();
      if (!this.tl || !this.tl.items.length) return;
      this.stop(true);
      const startItem = this.tl.items.find((it) => it.i === fromIndex) || this.tl.items.find((it) => it.i >= fromIndex) || this.tl.items[0];
      this.offsetQ = startItem.start;
      this.t0 = ctx.currentTime + 0.12;
      this.next = this.tl.items.indexOf(startItem);
      this.nextBeat = Math.ceil(this.offsetQ - 1e-6);
      this.playing = true;
      if (Midi.output) Midi.send([0xC0, INSTRUMENTS[this.opts.instrument] ? INSTRUMENTS[this.opts.instrument].gm : 0]);
      this.timer = setInterval(() => this.tick(), 25);
      this.tick();
      const frame = () => {
        if (!this.playing) return;
        const q = (ctx.currentTime - this.t0) / this.spq + this.offsetQ;
        if (this.onPos) this.onPos(this.indexAt(q), q);
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    }
    indexAt(q) {
      const it = this.tl.items; let lo = 0, hi = it.length - 1, ans = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (it[m].start <= q + 1e-6) { ans = m; lo = m + 1; } else hi = m - 1; }
      return ans >= 0 ? it[ans].i : -1;
    }
    tick() {
      const spq = this.spq, horizon = ctx.currentTime + 0.25;
      const items = this.tl.items;
      if (this.metronome) {
        while (true) {
          const tb = this.t0 + (this.nextBeat - this.offsetQ) * spq;
          if (tb > horizon || this.nextBeat > this.tl.total) break;
          if (tb >= ctx.currentTime - 0.01) click(tb, this.nextBeat % this.beatsPerBar === 0);
          this.nextBeat++;
        }
      }
      while (this.next < items.length) {
        const it = items[this.next];
        const when = this.t0 + (it.start - this.offsetQ) * spq;
        if (when > horizon) break;
        if (!it.rest && !it.tied) {
          const dur = it.dur * spq * 0.96;
          it.midis.forEach((m) => {
            if (this.useSynth) playNote(this.opts.instrument || 'piano', m, when, dur, 0.85);
            if (Midi.output) { Midi.send([0x90, m, 100], when); Midi.send([0x80, m, 0], when + dur); }
          });
        }
        this.next++;
      }
      const endT = this.t0 + (this.tl.total - this.offsetQ) * spq;
      if (this.next >= items.length && ctx.currentTime > endT + 0.05) {
        if (this.loop) { this.play(0); return; }
        this.stop();
        if (this.onEnd) this.onEnd();
      }
    }
    position() { return this.playing ? (ctx.currentTime - this.t0) / this.spq + this.offsetQ : 0; }
    stop(silent) {
      this.playing = false;
      clearInterval(this.timer); cancelAnimationFrame(this.raf);
      if (master && !silent) { /* coupe rapide */ const g = master.gain; const now = ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 0.05); g.linearRampToValueAtTime(0.9, now + 0.3); }
      Midi.allOff();
    }
  }

  function previewNote(instr, midi) { audio(); playNote(instr, midi, ctx.currentTime + 0.02, 0.45, 0.8); if (Midi.output) { Midi.send([0x90, midi, 100]); setTimeout(() => Midi.send([0x80, midi, 0]), 450); } }

  root.StephonySynth = { audio, playNote, previewNote, Player, INSTRUMENTS, Midi, buildTimeline };
})(typeof window !== 'undefined' ? window : this);
