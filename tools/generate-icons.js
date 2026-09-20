#!/usr/bin/env node
/* ============================================
   Generate ikon PWA (PNG + SVG) tanpa dependensi
   Desain: monogram "N" krem di latar oxblood #8a3b2e
   Keluaran: icons/*.png (di-gitignore) + icon.svg (di-commit)
   Cara pakai: node tools/generate-icons.js  (atau: npm run icons)
   ============================================ */

'use strict';

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- PNG encoder (minimal, 8-bit RGBA) ----

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- Gambar ----

const BG = [138, 59, 46];   // #8a3b2e (oxblood, konsisten dengan tema UI)
const FG = [244, 241, 232]; // #f4f1e8 (kertas hangat)

// Monogram "N" 8x8 (bar kiri + diagonal + bar kanan)
const N = [
  '11100011',
  '11100011',
  '11010011',
  '11010011',
  '11001011',
  '11001011',
  '11000111',
  '11000111'
];

function renderIcon(size) {
  const SS = 4; // supersampling untuk tepi halus
  const big = size * SS;
  const buf = Buffer.alloc(big * big * 4);

  // Latar full-bleed (aman untuk "maskable")
  for (let i = 0; i < big * big; i++) {
    buf[i * 4] = BG[0];
    buf[i * 4 + 1] = BG[1];
    buf[i * 4 + 2] = BG[2];
    buf[i * 4 + 3] = 255;
  }

  // Kotak huruf: 46% lebar x 56% tinggi, ditengah
  const grid = 8;
  const cellW = (big * 0.46) / grid;
  const cellH = (big * 0.56) / grid;
  const x0 = (big - cellW * grid) / 2;
  const y0 = (big - cellH * grid) / 2;

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      if (N[gy][gx] !== '1') continue;
      const px0 = Math.floor(x0 + gx * cellW);
      const px1 = Math.ceil(x0 + (gx + 1) * cellW);
      const py0 = Math.floor(y0 + gy * cellH);
      const py1 = Math.ceil(y0 + (gy + 1) * cellH);
      for (let y = py0; y < py1; y++) {
        for (let x = px0; x < px1; x++) {
          const i = (y * big + x) * 4;
          buf[i] = FG[0];
          buf[i + 1] = FG[1];
          buf[i + 2] = FG[2];
          buf[i + 3] = 255;
        }
      }
    }
  }

  // Downsample SSxSS (box filter)
  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * big + (x * SS + dx)) * 4;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, out);
}

/* ---- Versi SVG (di-commit: dipakai manifest & favicon) ---- */

function renderSvg(size) {
  const boxW = size * 0.46;
  const boxH = size * 0.56;
  const cellW = boxW / 8;
  const cellH = boxH / 8;
  const x0 = (size - boxW) / 2;
  const y0 = (size - boxH) / 2;
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const r2 = (n) => Math.round(n * 100) / 100;

  // Gabungkan sel yang bersebelahan secara horizontal jadi satu <rect>
  const rects = [];
  for (let gy = 0; gy < 8; gy++) {
    let gx = 0;
    while (gx < 8) {
      if (N[gy][gx] !== '1') { gx++; continue; }
      let span = 1;
      while (gx + span < 8 && N[gy][gx + span] === '1') span++;
      rects.push(
        `    <rect x="${r2(x0 + gx * cellW)}" y="${r2(y0 + gy * cellH)}" ` +
        `width="${r2(span * cellW)}" height="${r2(cellH)}" fill="${hex(FG)}"/>`
      );
      gx += span;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <title>Novel Writer</title>
  <rect width="${size}" height="${size}" fill="${hex(BG)}"/>
${rects.join('\n')}
</svg>
`;
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180]
];

for (const [file, size] of targets) {
  const dest = path.join(outDir, file);
  fs.writeFileSync(dest, renderIcon(size));
  console.log('✓', 'icons/' + file, size + 'x' + size);
}

// SVG di root repo (di-commit) — favicon + ikon manifest
const svgDest = path.join(__dirname, '..', 'icon.svg');
fs.writeFileSync(svgDest, renderSvg(512));
console.log('✓', 'icon.svg', '(vektor, di-commit)');
console.log('Selesai.');