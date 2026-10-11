// Visualisation : texte (cyan), arcs (bleu), changements d'armure (vert), classes kNN
const sharp = require('/opt/npm-tools/node_modules/sharp');
const OMR = require('../js/omr.js');
global.self = global; require('../js/symbols-model.js'); const model = OMR.loadModel(self.STEPHONY_MODEL);
(async () => {
  const f = process.argv[2], out = process.argv[3];
  const crop = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const res = OMR.analyze(data, info.width, info.height, { debug: true, model });
  const D = res._debug; const { w, h } = D;
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { const v = D.ns[i] ? 0 : (D.bin[i] ? 200 : 255); px[3 * i] = px[3 * i + 1] = px[3 * i + 2] = v; }
  let svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  for (const hd of D.heads) svg += `<ellipse cx="${hd.cx}" cy="${hd.cy}" rx="${hd.wpx / 2}" ry="${hd.hpx / 2}" fill="none" stroke="${hd.hollow ? 'blue' : 'lime'}" stroke-width="2"/>`;
  const skipc = /^(other|speck)$/;
  for (const C of D.comps) if (C.cls && !skipc.test(C.cls)) svg += `<rect x="${C.x0}" y="${C.y0}" width="${C.w}" height="${C.h}" fill="none" stroke="magenta" stroke-width="1"/><text x="${C.x0}" y="${C.y0 - 2}" font-size="11" fill="magenta">${C.cls}${C.conf != null ? ' ' + C.conf.toFixed(1) : ''}</text>`;
  for (const L of D.textLines) svg += `<rect x="${L.x0}" y="${L.y0}" width="${L.x1 - L.x0}" height="${L.y1 - L.y0}" fill="rgba(0,200,255,0.25)" stroke="cyan" stroke-width="2"/>`;
  for (const K of D.curves) svg += `<rect x="${K.x0}" y="${K.y0}" width="${K.x1 - K.x0}" height="${K.y1 - K.y0}" fill="none" stroke="blue" stroke-width="2" stroke-dasharray="6 3"/>`;
  for (const k of D.keyChanges) svg += `<rect x="${k.box[0]}" y="${k.box[1]}" width="${k.box[2] - k.box[0]}" height="${k.box[3] - k.box[1]}" fill="rgba(0,255,0,0.3)" stroke="green" stroke-width="3"/><text x="${k.box[0]}" y="${k.box[1] - 4}" font-size="16" fill="green">K${k.fifths}${k.courtesy ? 'c' : ''}</text>`;
  for (const b of D.bars) svg += `<line x1="${b.x}" y1="${b.comp.y0}" x2="${b.x}" y2="${b.comp.y1}" stroke="rgba(255,0,0,0.5)" stroke-width="4"/>`;
  svg += '</svg>';
  let img = sharp(px, { raw: { width: w, height: h, channels: 3 } }).composite([{ input: Buffer.from(svg) }]);
  if (crop) img = sharp(await img.png().toBuffer()).extract({ left: crop[0], top: crop[1], width: Math.min(crop[2], w - crop[0]), height: Math.min(crop[3], h - crop[1]) });
  await img.png().toFile(out);
  console.log(w, h);
})();
