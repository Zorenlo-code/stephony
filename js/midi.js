/* Stephony — export de fichier MIDI standard (type 0) */
(function (root) {
  'use strict';
  const PPQ = 480;
  function vlq(n) {
    const bytes = [n & 0x7f];
    while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
    return bytes;
  }
  function str(s) { return Array.from(new TextEncoder().encode(s)); }
  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function u16(n) { return [(n >> 8) & 255, n & 255]; }

  // timeline issue de StephonySynth.buildTimeline ; tempo = noires par minute
  function toSMF(timeline, { tempo = 100, program = 0, title = 'Stephony', timeSig = null, key = 0, keyChanges = [] } = {}) {
    const ev = []; // {tick, order, bytes}
    const tempoEv = (tick, bpm) => { const us = Math.round(60000000 / bpm); ev.push({ tick, o: 0, b: [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255] }); };
    ev.push({ tick: 0, o: 0, b: [0xff, 0x03, ...vlq(str(title).length), ...str(title)] });
    if (timeSig) ev.push({ tick: 0, o: 0, b: [0xff, 0x58, 0x04, timeSig[0], Math.round(Math.log2(timeSig[1])), 24, 8] });
    ev.push({ tick: 0, o: 0, b: [0xff, 0x59, 0x02, (key + 256) & 255, 0] });
    for (const k of keyChanges) ev.push({ tick: Math.round(k.q * PPQ), o: 0, b: [0xff, 0x59, 0x02, (k.fifths + 256) & 255, 0] });
    ev.push({ tick: 0, o: 1, b: [0xc0, program & 127] });
    // carte de tempo : ritardandos et points d'orgue
    let lastBpm = null;
    for (const it of timeline.items) {
      const bpm = Math.round(tempo * (it.tf || 1) * 100) / 100;
      if (bpm !== lastBpm) { tempoEv(Math.round((it.q0 != null ? it.q0 : it.start) * PPQ), bpm); lastBpm = bpm; }
    }
    if (lastBpm === null) tempoEv(0, tempo);
    for (const it of timeline.items) {
      if (it.rest || it.tied) continue;
      const q0 = it.q0 != null ? it.q0 : it.start, qd = it.qd != null ? it.qd : it.dur;
      const a = Math.round(q0 * PPQ), b = Math.round((q0 + qd * (it.gate || 0.95)) * PPQ) - 1;
      it.midis.forEach((m) => {
        if (m < 0 || m > 127) return;
        ev.push({ tick: a, o: 3, b: [0x90, m, Math.max(1, Math.min(127, it.vel || 96))] });
        ev.push({ tick: Math.max(a + 1, b), o: 2, b: [0x80, m, 0] });
      });
    }
    ev.sort((x, y) => x.tick - y.tick || x.o - y.o);
    const data = []; let last = 0;
    for (const e of ev) { data.push(...vlq(e.tick - last), ...e.b); last = e.tick; }
    data.push(0, 0xff, 0x2f, 0x00);
    const header = [...str('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(PPQ)];
    const track = [...str('MTrk'), ...u32(data.length), ...data];
    return new Uint8Array([...header, ...track]);
  }
  root.StephonyMidiFile = { toSMF };
})(typeof window !== 'undefined' ? window : this);
