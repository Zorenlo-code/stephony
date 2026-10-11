const sharp = require('/opt/npm-tools/node_modules/sharp');
const fs = require('fs'), path = require('path');
const OMR = require('../js/omr.js');
const modelPath = path.join(__dirname, '../js/symbols-model.json');
const model = fs.existsSync(modelPath) ? JSON.parse(fs.readFileSync(modelPath)) : null;
(async () => {
  const f = process.argv[2], out = process.argv[3];
  const crop = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const res = OMR.analyze(data, info.width, info.height, { debug: true, model });
  const D = res._debug; const { w, h } = D;
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { const v = D.ns[i] ? 0 : (D.bin[i] ? 190 : 255); px[3 * i] = px[3 * i + 1] = px[3 * i + 2] = v; }
  let svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  for (const st of D.staves) for (let li = 0; li < 5; li++) { let pts = []; for (let x = st.x0; x <= st.x1; x += 4) pts.push(x + ',' + st.ly[li][x].toFixed(1)); svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="rgba(0,160,255,0.45)" stroke-width="1"/>`; }
  for (const hd of D.heads) {
    svg += `<ellipse cx="${hd.cx}" cy="${hd.cy}" rx="${hd.wpx / 2}" ry="${hd.hpx / 2}" fill="none" stroke="${hd.hollow ? 'blue' : 'lime'}" stroke-width="2"/>`;
    if (hd.stem) svg += `<line x1="${hd.stem.x}" y1="${hd.cy}" x2="${hd.stem.x}" y2="${hd.stem.tip}" stroke="orange" stroke-width="2"/>`;
    svg += `<text x="${hd.cx - 6}" y="${hd.cy + 30}" font-size="13" fill="red">${hd.dur}</text>`;
  }
  for (const C of D.comps) if (C.cls && !['note', 'speck'].includes(C.cls)) svg += `<rect x="${C.x0}" y="${C.y0}" width="${C.w}" height="${C.h}" fill="none" stroke="magenta"/><text x="${C.x0}" y="${C.y0 - 2}" font-size="10" fill="magenta">${C.cls}</text>`;
  for (const b of D.bars) svg += `<line x1="${b.x}" y1="0" x2="${b.x}" y2="${h}" stroke="rgba(255,0,0,0.25)" stroke-width="3"/>`;
  svg += '</svg>';
  let img = sharp(px, { raw: { width: w, height: h, channels: 3 } }).composite([{ input: Buffer.from(svg) }]);
  if (crop) img = sharp(await img.png().toBuffer()).extract({ left: crop[0], top: crop[1], width: Math.min(crop[2], w - crop[0]), height: Math.min(crop[3], h - crop[1]) });
  await img.png().toFile(out);
  console.log(w, h, res.metrics, res.staves.map(s=>s.clef+s.fifths).join(' '), 'time', res.time);
})();
