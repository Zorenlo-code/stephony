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

  // timeline issue de StephonySynth.buildTimeline
  function toSMF(timeline, { tempo = 100, program = 0, title = 'Stephony', timeSig = null, key = 0 } = {}) {
    const ev = []; // {tick, order, bytes}
    const usPerQ = Math.round(60000000 / tempo);
    ev.push({ tick: 0, o: 0, b: [0xff, 0x03, ...vlq(str(title).length), ...str(title)] });
    ev.push({ tick: 0, o: 0, b: [0xff, 0x51, 0x03, (usPerQ >> 16) & 255, (usPerQ >> 8) & 255, usPerQ & 255] });
    if (timeSig) ev.push({ tick: 0, o: 0, b: [0xff, 0x58, 0x04, timeSig[0], Math.round(Math.log2(timeSig[1])), 24, 8] });
    ev.push({ tick: 0, o: 0, b: [0xff, 0x59, 0x02, (key + 256) & 255, 0] });
    ev.push({ tick: 0, o: 1, b: [0xc0, program & 127] });
    for (const it of timeline.items) {
      if (it.rest || it.tied) continue;
      const a = Math.round(it.start * PPQ), b = Math.round((it.start + it.dur) * PPQ) - 1;
      it.midis.forEach((m) => {
        if (m < 0 || m > 127) return;
        ev.push({ tick: a, o: 3, b: [0x90, m, 96] });
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
