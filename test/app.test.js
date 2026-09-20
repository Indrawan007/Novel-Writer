/* Uji perilaku aplikasi nyata di jsdom (UI, editor, keamanan, i18n, restore). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, wait, click, key, type, setFileInput, breakStorageSetItem } from './helpers.mjs';

const seedProject = (withChapters = true) => ({
  projects: [{
    id: 'p1', title: 'Novel Uji', author: 'Aku', description: '',
    chapters: withChapters ? [
      { id: 'c1', title: 'Bab 1', content: '', order: 1, createdAt: 'x', updatedAt: 'x' },
      { id: 'c2', title: 'Bab 2', content: '', order: 2, createdAt: 'x', updatedAt: 'x' },
      { id: 'c3', title: 'Bab 3', content: '', order: 3, createdAt: 'x', updatedAt: 'x' }
    ] : [],
    createdAt: 'x', updatedAt: 'x'
  }],
  settings: { theme: 'light', fontSize: 18, lineHeight: 1.8, autoSaveDelay: 1000, lang: 'id', lastProject: 'p1', lastChapter: withChapters ? 'c1' : null }
});

test('bootstrap bersih, ikon SVG terpakai, a11y dasar', async () => {
  const { w, $ } = await createApp();
  assert.deepEqual(w.__errors, []);
  assert.match($('#empty-title').textContent, /Selamat Datang/);
  assert.ok($('.empty-icon svg'), 'empty-state memakai SVG (bukan emoji)');
  assert.ok($('#btn-new-chapter svg'), 'tombol bab baru memakai SVG plus');
  assert.equal($('#btn-new-chapter').getAttribute('aria-label'), w.NW.t('newChapter'),
    'aria-label ikut bahasa aktif (bukan Inggris hardcoded)');
  assert.equal($('#toast').getAttribute('role'), 'status');
  assert.equal($('#toast').getAttribute('aria-live'), 'polite');
});

test('CRUD proyek/bab + empty-state kontekstual + auto-save', async () => {
  const { w, $, S } = await createApp();
  click(w, $('#btn-new-project'));
  assert.equal($('#modal-project').hidden, false);
  $('#inp-proj-title').value = '  Bumi Manusia  ';
  click(w, $('#btn-create-project'));
  assert.equal(S.getProjects()[0].title, 'Bumi Manusia');
  assert.equal($('#modal-project').hidden, true);

  // proyek ada tapi tanpa bab -> empty-state menawarkan BAB BARU
  assert.equal($('#empty-title').textContent, 'Belum ada bab');
  assert.equal($('#btn-empty-action').dataset.action, 'new-chapter');
  click(w, $('#btn-empty-action'));
  assert.equal($('#modal-chapter').hidden, false, 'empty-state membuka modal bab');

  click(w, $('#btn-create-chapter')); // judul kosong -> nama otomatis
  const chs = S.getProject(S.getProjects()[0].id).chapters;
  assert.equal(chs[0].title, 'Bab 1');

  const ed = $('#editor');
  type(w, ed, 'satu dua tiga empat lima');
  assert.equal(chs[0].content, '', 'belum tersimpan sebelum debounce');
  await wait(1300);
  assert.equal(S.getProject(S.getProjects()[0].id).chapters[0].content, 'satu dua tiga empat lima');
  assert.equal($('#stat-chapter').textContent, '5');
  assert.deepEqual(w.__errors, []);
});

test('Tab/Shift+Tab TIDAK menimpa seleksi (regresi bug penghapus bab)', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  const asli = 'baris pertama yang penting\nbaris kedua yang penting';
  ed.focus(); ed.value = asli; ed.setSelectionRange(0, asli.length);

  key(w, ed, { key: 'Tab' });
  assert.equal(ed.value, '  baris pertama yang penting\n  baris kedua yang penting',
    'indent per baris, isi tidak hilang');
  assert.ok(ed.selectionEnd > ed.selectionStart, 'seleksi dipertahankan');

  key(w, ed, { key: 'Tab', shiftKey: true });
  assert.equal(ed.value, asli, 'Shift+Tab mengembalikan semula');

  // seleksi satu kata pun tidak boleh lenyap
  ed.value = asli; ed.setSelectionRange(6, 13); // kata "pertama"
  key(w, ed, { key: 'Tab' });
  assert.ok(ed.value.includes('pertama'), 'kata terseleksi tetap ada');
  assert.deepEqual(w.__errors, []);
  void S;
});

test('ketikan tersimpan saat tab ditutup (flush pagehide/beforeunload)', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, 'kalimat terakhir sebelum pergi');
  w.dispatchEvent(new w.Event('pagehide'));
  assert.equal(S.getProject('p1').chapters.find(c => c.id === 'c1').content,
    'kalimat terakhir sebelum pergi', 'tersimpan seketika, tanpa menunggu debounce');

  // beforeunload tidak menahan tab bila semua sudah tersimpan
  type(w, ed, 'perubahan lain');
  w.dispatchEvent(new w.Event('pagehide'));
  const ev = new w.Event('beforeunload', { cancelable: true });
  w.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, false);
});

test('beforeunload menahan tab bila tulis gagal (kuota penuh)', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, 'teks yang tidak bisa disimpan');
  const restore = breakStorageSetItem(w);
  const ev = new w.Event('beforeunload', { cancelable: true });
  w.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true, 'pengguna diperingatkan sebelum kehilangan data');
  assert.equal($('#toast').hidden, false);
  assert.ok($('#toast').classList.contains('toast-error'));
  assert.match($('#toast').textContent, /penuh/i);
  restore();
});

test('Ctrl+S huruf besar (CapsLock) tetap tersimpan', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, 'disimpan lewat pintasan');
  key(w, w.document, { key: 'S', ctrlKey: true });
  assert.equal(S.getProject('p1').chapters.find(c => c.id === 'c1').content, 'disimpan lewat pintasan');
  assert.match($('#toast').textContent, /Tersimpan/);
});

test('tombol Heading bekerja di awal baris & bisa di-toggle', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  ed.value = 'satu dua tiga'; ed.setSelectionRange(5, 5);
  click(w, $('#btn-heading'));
  assert.equal(ed.value, '## satu dua tiga', 'prefix di awal baris, bukan di tengah kalimat');
  click(w, $('#btn-heading'));
  assert.equal(ed.value, 'satu dua tiga', 'toggle melepas prefix');
});

test('statistik kata mengabaikan sintaks Markdown', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, '# Judul\n\n**tebal** dan ![gambar](x.png) serta `kode`');
  await wait(1300);
  assert.equal($('#stat-chapter').textContent, '6');
});

test('preview aman: HTML mentah di-escape, tautan berbahaya diblokir', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  ed.value = 'x <img src=x onerror="alert(1)"> [k](javascript:alert(1)) <a href="vbscript:x">v</a>';
  click(w, $('#btn-preview'));
  const pv = $('#preview');
  assert.equal(pv.querySelector('img'), null);
  assert.equal([...pv.querySelectorAll('a')].every(a => !a.getAttribute('href')), true);
  assert.equal([...pv.querySelectorAll('*')].every(el => ![...el.attributes].some(a => /^on/i.test(a.name))), true);
  assert.equal($('#btn-preview').getAttribute('aria-pressed'), 'true');
});

test('i18n: tooltip, aria-label, judul modal, dan empty-state ikut bahasa', async () => {
  const { w, $ } = await createApp({ seed: seedProject(false) });
  click(w, $('#btn-settings'));
  const sel = $('#set-lang'); sel.value = 'en';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  click(w, $('#modal-settings [data-close]'));

  assert.equal($('#btn-new-project').title, 'New Project');
  assert.equal($('#btn-settings').title, 'Settings');
  assert.equal($('#btn-bold').title, 'Bold (Ctrl+B)');
  assert.equal($('#btn-theme').getAttribute('aria-label'), 'Switch to dark theme');
  assert.equal($('#empty-title').textContent, 'No chapters yet');

  // judul modal rename dulunya menampilkan key mentah "renameProject"
  click(w, $('#project-list .rename-btn'));
  assert.equal($('#modal-rename-project h2').textContent, 'Rename Project');
  assert.equal($('#modal-rename-project h2').textContent.includes('renameProject'), false);
});

test('restore: konfirmasi ber-ringkasan, id berbahaya dinetralkan, bisa di-undo', async () => {
  const { w, $, S } = await createApp();
  click(w, $('#btn-new-project'));
  $('#inp-proj-title').value = 'Asli';
  click(w, $('#btn-create-project'));

  click(w, $('#btn-settings'));
  assert.equal($('#btn-undo-restore').hidden, true, 'belum ada snapshot');
  click(w, $('#modal-settings [data-close]'));

  const backup = JSON.stringify({
    projects: [{ id: '"><img src=x onerror=alert(1)>', title: 'Impor', chapters: [{ id: 'k1', title: 'K', content: 'isi', order: 1 }] }],
    settings: { lang: 'id' }
  });
  setFileInput(w, $('#inp-restore'), 'backup.json', backup);
  await wait(60); // FileReader async

  assert.equal($('#modal-confirm').hidden, false, 'minta konfirmasi dulu');
  assert.match($('#confirm-msg').textContent, /1 proyek, 1 bab/);
  assert.match($('#confirm-msg').textContent, /akan ditimpa/);
  assert.equal($('#btn-confirm-yes').textContent, 'Lanjutkan');
  click(w, $('#btn-confirm-yes'));

  const projs = S.getProjects();
  assert.equal(projs.length, 1);
  assert.equal(projs[0].title, 'Impor');
  assert.match(projs[0].id, /^[A-Za-z0-9_-]{1,64}$/, 'id berbahaya diganti uid aman');
  assert.equal($('#project-list').querySelector('img'), null, 'tidak ada injeksi HTML');

  click(w, $('#btn-settings'));
  assert.equal($('#btn-undo-restore').hidden, false);
  click(w, $('#btn-undo-restore'));
  assert.equal(S.getProjects()[0].title, 'Asli', 'undo mengembalikan data lama');
});

test('tab lain menulis -> data diadopsi tanpa ping-pong, ketikan lokal aman', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, 'ketikan lokal yang belum tersimpan');

  const dariTabLain = JSON.stringify({
    projects: [{ id: 'p9', title: 'DariTabLain', author: '', description: '', chapters: [], createdAt: 'x', updatedAt: 'x' }],
    settings: { theme: 'light', fontSize: 18, lineHeight: 1.8, autoSaveDelay: 1000, lang: 'id', lastProject: 'p9', lastChapter: null }
  });
  w.localStorage.setItem('novel-writer-data', dariTabLain); // tulis "tab lain"
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'novel-writer-data', newValue: dariTabLain }));

  assert.ok($('#project-list').textContent.includes('DariTabLain'), 'daftar mengikuti data baru');
  assert.equal(ed.value, 'ketikan lokal yang belum tersimpan', 'ketikan pengguna tidak dibuang');
});

test('Esc: tutup modal dulu, baru sidebar (off-canvas), baru preview', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  // perilaku off-canvas berlaku di layar sempit
  w.matchMedia = () => ({
    matches: true,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });

  click(w, $('#btn-settings'));
  assert.equal($('#modal-settings').hidden, false);
  key(w, w.document, { key: 'Escape' });
  assert.equal($('#modal-overlay').hidden, true);
  assert.equal($('#sidebar').classList.contains('open'), false);

  click(w, $('#btn-open-sidebar'));
  assert.equal($('#sidebar').classList.contains('open'), true);
  key(w, w.document, { key: 'Escape' });
  assert.equal($('#sidebar').classList.contains('open'), false, 'Esc kedua menutup sidebar');
});

test('Esc di desktop: collapse sidebar tidak ikut-ikutan tertutup saat mengetik', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  ed.focus();
  key(w, w.document, { key: 'Escape' });
  assert.equal($('#app').classList.contains('sidebar-collapsed'), false,
    'Esc tanpa modal/sidebar terbuka tidak menyembunyikan sidebar desktop');
});

test('fokus terperangkap di dalam modal (Tab melingkar)', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  click(w, $('#btn-settings'));
  await wait(80);
  const modal = $('#modal-settings');
  const items = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && !el.hasAttribute('hidden'));
  const first = items[0], last = items[items.length - 1];

  last.focus();
  key(w, last, { key: 'Tab' });
  assert.equal(w.document.activeElement, first, 'Tab dari elemen terakhir melingkar ke awal');

  first.focus();
  key(w, first, { key: 'Tab', shiftKey: true });
  assert.equal(w.document.activeElement, last, 'Shift+Tab dari elemen pertama melingkar ke akhir');

  click(w, $('#modal-settings [data-close]'));
});

test('urut bab lewat keyboard (Alt+Panah)', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const li = $('#chapter-list li[data-id="c1"]');
  li.focus();
  key(w, li, { key: 'ArrowDown', altKey: true });
  const order = [...S.getProject('p1').chapters].sort((a, b) => a.order - b.order).map(c => c.id);
  assert.equal(order.join(','), 'c2,c1,c3');
  assert.equal(w.document.activeElement?.dataset?.id, 'c1', 'fokus kembali ke item yang dipindah');
});

test('computeReorder: kasus sisip', async () => {
  const { nw } = await createApp();
  assert.deepEqual(nw.computeReorder(['a', 'b', 'c'], 'c', 'a', false), ['c', 'a', 'b']);
  assert.deepEqual(nw.computeReorder(['a', 'b', 'c'], 'a', 'c', true), ['b', 'c', 'a']);
  assert.equal(nw.computeReorder(['a', 'b', 'c'], 'a', 'a', false), null);
  assert.equal(nw.computeReorder(['a', 'b', 'c'], 'zz', 'a', false), null);
});

test('drag & drop mouse memindahkan bab', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const src = $('#chapter-list li[data-id="c3"]');
  const tgt = $('#chapter-list li[data-id="c1"]');
  const rect = { top: 0, height: 20 };
  tgt.getBoundingClientRect = () => rect;

  src.dispatchEvent(new w.Event('dragstart', { bubbles: true }));
  const over = new w.Event('dragover', { bubbles: true, cancelable: true });
  tgt.dispatchEvent(over);
  const drop = new w.Event('drop', { bubbles: true, cancelable: true });
  drop.clientY = 5; // separuh atas -> sisip sebelum
  Object.defineProperty(drop, 'clientY', { value: 5 });
  tgt.dispatchEvent(drop);
  src.dispatchEvent(new w.Event('dragend', { bubbles: true }));

  const order = [...S.getProject('p1').chapters].sort((a, b) => a.order - b.order).map(c => c.id);
  assert.equal(order.join(','), 'c3,c1,c2');
});

test('sidebar desktop: collapse/expand, tersimpan, label & aria mengikuti', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  assert.equal($('#app').classList.contains('sidebar-collapsed'), false);
  assert.equal($('#btn-open-sidebar').getAttribute('aria-expanded'), 'true');
  assert.equal($('#btn-open-sidebar').title, 'Sembunyikan sidebar');

  click(w, $('#btn-open-sidebar'));
  assert.equal($('#app').classList.contains('sidebar-collapsed'), true);
  assert.equal(S.getSettings().sidebarCollapsed, true, 'preferensi tersimpan');
  assert.equal($('#btn-open-sidebar').title, 'Tampilkan sidebar');
  assert.equal($('#btn-open-sidebar').getAttribute('aria-expanded'), 'false');

  click(w, $('#btn-open-sidebar'));
  assert.equal($('#app').classList.contains('sidebar-collapsed'), false);
  assert.equal(S.getSettings().sidebarCollapsed, false);

  // tombol X di header sidebar juga menutup di desktop
  click(w, $('#btn-close-sidebar'));
  assert.equal($('#app').classList.contains('sidebar-collapsed'), true);
});

test('preferensi sidebar collapse diterapkan saat boot', async () => {
  const seed = seedProject();
  seed.settings.sidebarCollapsed = true;
  const { $ } = await createApp({ seed });
  assert.equal($('#app').classList.contains('sidebar-collapsed'), true);
  assert.equal($('#btn-open-sidebar').title, 'Tampilkan sidebar');
});

test('sidebar layar sempit tetap off-canvas (overlay + Esc)', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  w.matchMedia = () => ({
    matches: true,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });
  click(w, $('#btn-open-sidebar'));
  assert.equal($('#sidebar').classList.contains('open'), true);
  assert.equal($('#sidebar-overlay').hidden, false);
  assert.equal($('#app').classList.contains('sidebar-collapsed'), false,
    'status collapse tidak dipakai di layar sempit');

  click(w, $('#sidebar-overlay'));
  assert.equal($('#sidebar').classList.contains('open'), false);
  assert.equal($('#sidebar-overlay').hidden, true);

  click(w, $('#btn-open-sidebar'));
  key(w, w.document, { key: 'Escape' });
  assert.equal($('#sidebar').classList.contains('open'), false, 'Esc menutup off-canvas');
});
