/* Uji konsistensi statis antar-berkas (markup, i18n, ikon, SW, manifest). */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* BUG-15: dulu tes aset Service Worker (urutan ke-4) bergantung pada berkas
   ikon yang baru dibuat tes generator (urutan terakhir) -> clone baru selalu
   gagal sekali. Sekarang ikon dihasilkan lebih dulu untuk seluruh berkas ini. */
before(() => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'generate-icons.js')], { stdio: 'pipe' });
});
const html = read('index.html');
const i18n = read('js/i18n.js');
const iconsJs = read('js/icons.js');
const swJs = read('sw.js');
const manifest = JSON.parse(read('manifest.json'));

test('semua key data-i18n* di HTML ada di kedua kamus bahasa', () => {
  const used = [...html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map(m => m[1]);
  const dictId = i18n.slice(i18n.indexOf('id: {'), i18n.indexOf('en: {'));
  const dictEn = i18n.slice(i18n.indexOf('en: {'));
  const missing = used.filter(k => !new RegExp(`^\\s{4}${k}:`, 'm').test(dictId) || !new RegExp(`^\\s{4}${k}:`, 'm').test(dictEn));
  assert.deepEqual(missing, [], `key hilang: ${missing.join(', ')}`);
});

test('semua nama data-icon ada di Icons', () => {
  const used = [...html.matchAll(/data-icon="([^"]+)"/g)].map(m => m[1]);
  const defined = new Set([...iconsJs.matchAll(/^\s{4}(\w+):\s+svg\(/gm)].map(m => m[1]));
  const missing = used.filter(u => !defined.has(u));
  assert.deepEqual(missing, []);
});

test('tidak ada emoji / karakter non-SVG di markup (prinsip desain)', () => {
  const emoji = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FF00}-\u{FFEF}]/gu) || [];
  assert.deepEqual(emoji, [], `karakter tak diinginkan: ${emoji.join(' ')}`);
});

test('BUG-13: Service Worker mem-precache seluruh ikon yang dipakai HTML', () => {
  const htmlIcons = [...read('index.html').matchAll(/(?:href|src)="((?:icons|icon)\/?[^"]*)"/g)].map(m => m[1]);
  for (const ic of htmlIcons) {
    assert.ok(swJs.includes(`'${ic}'`), `aset SW belum memuat ${ic}`);
  }
  assert.ok(swJs.includes("'icons/apple-touch-icon.png'"), 'ikon iOS ikut di-precache');
});

test('semua aset Service Worker & manifest benar-benar ada', () => {
  const assets = [...swJs.matchAll(/^\s*'([^']+)',?$/gm)].map(m => m[1]).filter(a => a && !a.includes('//'));
  for (const a of assets) {
    if (a === '') continue; // BASE
    assert.ok(fs.existsSync(path.join(ROOT, a)), `aset SW tidak ada: ${a}`);
  }
  for (const icon of manifest.icons) {
    if (icon.src.startsWith('data:')) continue;
    assert.ok(fs.existsSync(path.join(ROOT, icon.src)), `ikon manifest tidak ada: ${icon.src}`);
  }
});

test('manifest tidak lagi memakai ikon data: URL (tak didukung untuk instalasi)', () => {
  assert.equal(manifest.icons.some(i => i.src.startsWith('data:')), false);
  assert.ok(manifest.icons.some(i => i.src.endsWith('.png') && i.purpose === 'any'));
  assert.ok(manifest.icons.some(i => i.src.endsWith('.png') && i.purpose === 'maskable'));
});

test('cache Service Worker dinaikkan versinya saat strategi berubah', () => {
  assert.match(swJs, /novel-writer-v\d+/);
  assert.match(swJs, /request\.mode === 'navigate'/, 'navigasi harus network-first');
});

test('seluruh skrip lolos pemeriksaan sintaks Node', () => {
  for (const f of ['js/i18n.js', 'js/storage.js', 'js/icons.js', 'js/text.js', 'js/richtext.js', 'js/export.js', 'js/app.js', 'sw.js', 'tools/generate-icons.js']) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
  }
});

test('editor WYSIWYG: tanpa parser sintaks, panel format = format asli (bukan penyisip penanda)', () => {
  for (const f of ['index.html', 'js/app.js', 'js/text.js', 'js/richtext.js', 'js/export.js', 'js/i18n.js', 'css/style.css', 'sw.js']) {
    assert.doesNotMatch(read(f), /markdown|marked/i, `${f} masih menyebut parser sintaks`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'js/markdown.js')), false);
  assert.doesNotMatch(read('package.json'), /"marked"/);
  // panel format ada dan bekerja lewat model DOM (data-fmt), bukan menyisip karakter
  assert.match(html, /id="format-bar"/, 'panel format harus ada');
  assert.match(html, /data-fmt="bold"|data-fmt="italic"|data-fmt="heading"/);
  assert.doesNotMatch(html, /btn-preview|data-format="md"/, 'tanpa mode pratinjau sumber');
  assert.match(html, /contenteditable="true"/, 'permukaan editor = contenteditable');
  const appJs = read('js/app.js');
  assert.doesNotMatch(appJs, /'\*\*|"## "|`## /, 'app.js tidak pernah menyisipkan penanda');
});

test('generator ikon menghasilkan keluaran yang konsisten dengan PNG', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'generate-icons.js')], { stdio: 'pipe' });
  for (const f of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icon.svg']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} tidak dihasilkan`);
  }
  const svg = read('icon.svg');
  assert.match(svg, /^<svg /);
  assert.ok(svg.includes('#8a3b2e') && svg.includes('#f4f1e8'), 'warna identitas konsisten');
});
