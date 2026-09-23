/* Uji perilaku aplikasi nyata di jsdom (UI, editor, keamanan, i18n, restore). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, wait, click, key, type, select, setFileInput, breakStorageSetItem } from './helpers.mjs';

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
  const tersimpan = S.getProject(S.getProjects()[0].id).chapters[0];
  assert.equal(tersimpan.content, '<p>satu dua tiga empat lima</p>');
  assert.equal(tersimpan.format, 'html');
  assert.equal($('#stat-chapter').textContent, '5');
  assert.deepEqual(w.__errors, []);
});

test('Tab/Shift+Tab meng-indent per paragraf TANPA menimpa seleksi (regresi bug penghapus bab)', async () => {
  const { w, $, nw } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  ed.focus();
  ed.innerHTML = '<p>baris pertama yang penting</p><p>baris kedua yang penting</p>';
  const [b1, b2] = ed.querySelectorAll('p');
  select(w, b1.firstChild, 0, b2.firstChild, 24);

  key(w, ed, { key: 'Tab' });
  assert.equal(ed.textContent, '\u00a0\u00a0baris pertama yang penting\u00a0\u00a0baris kedua yang penting',
    'indent per paragraf, isi tidak hilang');
  assert.ok(ed.textContent.includes('pertama yang penting'), 'seleksi tidak menimpa isi');

  key(w, ed, { key: 'Tab', shiftKey: true });
  assert.equal(ed.textContent, 'baris pertama yang pentingbaris kedua yang penting', 'Shift+Tab mengembalikan semula');

  // seleksi satu kata pun tidak boleh lenyap
  ed.innerHTML = '<p>baris pertama yang penting</p><p>baris kedua yang penting</p>';
  const t1 = ed.querySelector('p').firstChild;
  select(w, t1, 6, t1, 13); // kata "pertama"
  key(w, ed, { key: 'Tab' });
  assert.ok(ed.textContent.includes('pertama'), 'kata terseleksi tetap ada');
  assert.deepEqual(w.__errors, []);
  void nw;
});

test('ketikan tersimpan saat tab ditutup (flush pagehide/beforeunload)', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, 'kalimat terakhir sebelum pergi');
  w.dispatchEvent(new w.Event('pagehide'));
  const ch = S.getProject('p1').chapters.find(c => c.id === 'c1');
  assert.equal(ch.content, '<p>kalimat terakhir sebelum pergi</p>', 'tersimpan seketika, tanpa menunggu debounce');
  assert.equal(ch.format, 'html');


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
  assert.equal(S.getProject('p1').chapters.find(c => c.id === 'c1').content,
    '<p>disimpan lewat pintasan</p>');
  assert.match($('#toast').textContent, /Tersimpan/);
});

test('panel format WYSIWYG: format asli lewat DOM, tanpa penyisipan penanda', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const ed = $('#editor');

  // panel format ada, mode pratinjau sumber tidak ada
  assert.ok($('#format-bar'), 'panel format tampil');
  assert.ok($('#btn-bold') && $('#btn-italic') && $('#btn-heading'));
  assert.ok($('#btn-quote') && $('#btn-scene'));
  assert.equal($('#btn-preview'), null);
  assert.equal($('#editor').getAttribute('contenteditable'), 'true');
  const ph = $('#editor').getAttribute('data-placeholder') || '';
  assert.doesNotMatch(ph, /markdown|\*\*|#/i, 'placeholder tidak mengajarkan sintaks');

  // Ctrl+B / Ctrl+I memberi format DOM nyata — tidak ada karakter penanda
  ed.focus();
  ed.innerHTML = '<p>kalimat biasa</p>';
  const t = ed.querySelector('p').firstChild;
  select(w, t, 0, t, 7);
  key(w, ed, { key: 'b', ctrlKey: true });
  assert.equal(ed.querySelector('strong')?.textContent, 'kalimat', 'Ctrl+B = <strong>');
  assert.doesNotMatch(ed.textContent, /\*\*/, 'tanpa penanda tersisip');

  select(w, ed.querySelector('strong').firstChild, 0, ed.querySelector('strong').firstChild, 7);
  key(w, ed, { key: 'i', ctrlKey: true });
  assert.equal(ed.querySelector('em')?.textContent, 'kalimat', 'Ctrl+I = <em>');

  // tombol subjudul mengubah jenis blok, bukan menyisip "#"
  const t2 = [...ed.querySelector('p').childNodes]
    .find(n => n.nodeType === 3 && n.nodeValue.includes('biasa'));
  select(w, t2, 0, t2, 5);
  click(w, $('#btn-heading'));
  assert.ok(ed.querySelector('h2'), 'subjudul = <h2>');
  assert.doesNotMatch(ed.textContent, /#/, 'tanpa penanda judul');

  // tombol jeda adegan menyisip "* * *" sebagai paragraf terpusat
  click(w, $('#btn-scene'));
  assert.ok(ed.querySelector('p.scene'), 'jeda adegan = p.scene');

  assert.equal(ed.hidden, false, 'editor tetap tampil (tanpa terpisah pratinjau)');
  assert.deepEqual(w.__errors, []);
});

test('penyimpanan tersanitasi: skrip & handler dari tempel/backup tidak ikut hidup', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  // simulasi tempelan kotor dari aplikasi lain
  ed.innerHTML = '<div onclick="alert(1)">Paragraf <b>penting</b><script>alert(2)</script><img src=x onerror=alert(3)></div>';
  ed.dispatchEvent(new w.Event('input', { bubbles: true }));
  w.dispatchEvent(new w.Event('pagehide'));

  const ch = S.getProject('p1').chapters.find(c => c.id === 'c1');
  assert.equal(ch.content, '<p>Paragraf <strong>penting</strong></p>', 'kanonik & bersih di storage');
  assert.equal(ch.format, 'html');
  assert.doesNotMatch(ch.content, /onclick|script|img/i);

  // mode baca memakai model blok yang sama — node dibangun ulang, bukan innerHTML
  click(w, $('#btn-reader'));
  const rv = $('#reader-view');
  assert.equal(rv.querySelector('strong')?.textContent, 'penting', 'format ikut tampil');
  assert.equal(rv.querySelector('script'), null);
  assert.equal(rv.querySelector('img'), null);
  assert.equal(rv.querySelector('[onclick]'), null);
  assert.deepEqual(w.__errors, []);
});

test('isi berformat tampil utuh di Mode Baca (judul/kutipan/jeda)', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  // bab dengan format 'html' dari data (mis. hasil backup)
  const proj = S.getProject('p1');
  proj.chapters[0].content = '<h2>Bagian Satu</h2><p>Kata <strong>bal</strong> <em>mir</em>.</p><p class="gap">Setelah jeda.</p><p class="scene">* * *</p><blockquote>Seru bisiknya.</blockquote>';
  proj.chapters[0].format = 'html';
  S.saveProject(proj);
  w.NovelWriter.renderAll();
  click(w, $('#btn-reader'));

  const rv = $('#reader-view');
  assert.equal(rv.querySelector('h2').textContent, 'Bagian Satu');
  assert.equal(rv.querySelector('strong').textContent, 'bal');
  assert.equal(rv.querySelector('em').textContent, 'mir');
  assert.ok([...rv.querySelectorAll('p')].some(p => p.classList.contains('gap')));
  assert.ok([...rv.querySelectorAll('p')].some(p => p.classList.contains('scene')));
  assert.equal(rv.querySelector('blockquote').textContent, 'Seru bisiknya.');
  assert.deepEqual(w.__errors, []);
});

test('isi teks polos lama (tanpa format) tetap tampil sebagai teks apa adanya', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const proj = S.getProject('p1');
  proj.chapters[0].content = 'Baris satu.\n\nBaris dua <img src=x onerror="alert(1)"> # bukan judul';
  // tanpa properti format -> 'text' (kompatibilitas backup lama)
  S.saveProject(proj);
  w.NovelWriter.renderAll();
  click(w, $('#btn-reader'));

  const rv = $('#reader-view');
  const ps = [...rv.querySelectorAll('p')];
  assert.deepEqual(ps.map(p => p.textContent),
    ['Baris satu.', 'Baris dua <img src=x onerror="alert(1)"> # bukan judul']);
  assert.deepEqual(ps.map(p => p.classList.contains('gap')), [false, true], 'baris kosong -> jeda');
  assert.equal(rv.querySelector('img'), null, 'HTML mentah tidak pernah di-parse');
  assert.deepEqual(w.__errors, []);
});

test('statistik kata: teks apa adanya, tanda baca lepas tidak dihitung', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, 'Ia menoleh — lalu berkata, "Cukup."\n\nDua paragraf.');
  await wait(1300);
  assert.equal($('#stat-chapter').textContent, '7', 'tanda pisah "—" bukan kata');
});

test('mode baca: judul bab + paragraf; HTML mentah diketik tampil sebagai teks', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, 'Paragraf satu.\nParagraf dua.\n\nSetelah jeda <img src=x onerror="alert(1)"> # bukan judul');
  click(w, $('#btn-reader'));

  const rv = $('#reader-view');
  assert.equal(rv.hidden, false);
  assert.equal(ed.hidden, true);
  assert.equal(w.document.documentElement.classList.contains('reader-mode'), true);
  assert.equal(rv.querySelector('h1').textContent, 'Bab 1', 'judul bab dari data, bukan dari sintaks');
  const ps = [...rv.querySelectorAll('p')];
  assert.deepEqual(ps.map(p => p.textContent), ['Paragraf satu.', 'Paragraf dua.', 'Setelah jeda <img src=x onerror="alert(1)"> # bukan judul']);
  assert.deepEqual(ps.map(p => p.classList.contains('gap')), [false, false, true], 'baris kosong -> jeda');
  assert.equal(rv.querySelector('img'), null, 'HTML tidak pernah di-parse');
  assert.equal(S.getProject('p1').chapters[0].content.includes('Paragraf satu.'), true, 'masuk mode baca = tersimpan');

  key(w, w.document, { key: 'Escape' });
  assert.equal(rv.hidden, true);
  assert.equal(ed.hidden, false, 'Esc kembali ke editor');
  assert.deepEqual(w.__errors, []);
});

test('i18n: tooltip, aria-label, judul modal, dan empty-state ikut bahasa', async () => {
  const { w, $ } = await createApp({ seed: seedProject(false) });
  click(w, $('#btn-settings'));
  const sel = $('#set-lang'); sel.value = 'en';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  click(w, $('#modal-settings [data-close]'));

  assert.equal($('#btn-new-project').title, 'New Project');
  assert.equal($('#btn-settings').title, 'Settings');
  assert.equal($('#btn-export').title, 'Export');
  assert.equal($('#btn-focus').title, 'Focus Mode (Ctrl+Shift+F)');
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
  assert.equal(w.NW.RichText.getHtml(ed), '<p>ketikan lokal yang belum tersimpan</p>', 'ketikan pengguna tidak dibuang');
});

test('Esc: tutup modal dulu, baru sidebar', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
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

test('mode fokus imersif: HUD kata sesi, toggle persisten, Esc keluar hening', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  click(w, $('#btn-focus'));
  const root = w.document.documentElement;
  assert.equal(root.classList.contains('focus-mode'), true);
  assert.equal($('#focus-hud').hidden, false);
  assert.equal(root.classList.contains('typewriter-on'), true);
  assert.equal(root.classList.contains('parafocus-on'), true);
  assert.match($('#focus-words').textContent, /0 kata/);

  type(w, $('#editor'), 'satu dua tiga');
  assert.match($('#focus-words').textContent, /3 kata/);
  assert.match($('#focus-session').textContent, /\+3 sesi ini/);

  click(w, $('#btn-typewriter'));
  assert.equal(S.getSettings().typewriter, false);
  assert.equal(root.classList.contains('typewriter-on'), false);
  assert.equal($('#btn-typewriter').getAttribute('aria-pressed'), 'false');

  key(w, w.document, { key: 'Escape' });
  assert.equal(root.classList.contains('focus-mode'), false);
  assert.equal($('#focus-hud').hidden, true);
  assert.deepEqual(w.__errors, []);
});

test('mode baca imersif: navigasi bab, progres, font persisten', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  click(w, $('#btn-reader'));
  const root = w.document.documentElement;
  assert.equal(root.classList.contains('reader-mode'), true);
  assert.equal($('#reader-hud').hidden, false);
  assert.equal($('#reader-progress').hidden, false);
  assert.equal($('#btn-prev-ch').disabled, true);
  assert.equal($('#btn-next-ch').disabled, false);
  assert.match($('#reader-pos').textContent, /Bab 1 dari 3/);

  click(w, $('#btn-next-ch'));
  assert.equal(w.NovelWriter.state.activeChapterId, 'c2');
  assert.match($('#reader-pos').textContent, /Bab 2 dari 3/);
  assert.equal($('#btn-prev-ch').disabled, false);
  assert.equal($('#reader-view').querySelector('h1').textContent, 'Bab 2');

  click(w, $('#btn-reader-inc'));
  assert.equal(S.getSettings().readerFont, 20);
  assert.equal(root.style.getPropertyValue('--reader-size'), '20px');

  key(w, w.document, { key: 'Escape' });
  assert.equal(root.classList.contains('reader-mode'), false);
  assert.equal(w.NovelWriter.state.activeChapterId, 'c2', 'pindah bab bertahan setelah keluar');
  assert.deepEqual(w.__errors, []);
});

test('pengaturan imersif tersimpan dan diterapkan', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  click(w, $('#btn-settings'));
  assert.equal($('#set-typewriter').checked, true);
  assert.equal($('#set-focus-fullscreen').checked, true);
  $('#set-parafocus').checked = false;
  $('#set-parafocus').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(S.getSettings().paraFocus, false);
  $('#set-readerfont').value = '22';
  $('#set-readerfont').dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(S.getSettings().readerFont, 22);
  assert.equal(w.document.documentElement.style.getPropertyValue('--reader-size'), '22px');
  click(w, $('#modal-settings [data-close]'));
  assert.deepEqual(w.__errors, []);
});

/* ============================================
   Regresi — bug yang ditemukan pada audit (lihat BUGS.md)
   ============================================ */

const seedTwoProjects = () => ({
  projects: [
    { id: 'p1', title: 'Proyek A', author: '', description: '', chapters: [
      { id: 'c1', title: 'Bab 1', content: '<p>satu</p>', format: 'html', order: 1, createdAt: 'x', updatedAt: 'x' }
    ], createdAt: 'x', updatedAt: 'x' },
    { id: 'p2', title: 'Proyek B', author: '', description: '', chapters: [
      { id: 'c2', title: 'Bab 2', content: '<p>dua</p>', format: 'html', order: 1, createdAt: 'x', updatedAt: 'x' }
    ], createdAt: 'x', updatedAt: 'x' }
  ],
  settings: { theme: 'light', fontSize: 18, lineHeight: 1.8, autoSaveDelay: 1000, lang: 'id', lastProject: 'p1', lastChapter: 'c1' }
});

test('BUG-01: Alt+Panah di Mode Baca benar-benar memindah bab', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  click(w, $('#btn-reader'));
  assert.equal(w.NovelWriter.state.activeChapterId, 'c1');

  key(w, w.document, { key: 'ArrowRight', altKey: true });
  assert.equal(w.NovelWriter.state.activeChapterId, 'c2', 'Alt+→ = bab berikutnya');
  assert.equal($('#reader-view').querySelector('h1').textContent, 'Bab 2');

  key(w, w.document, { key: 'ArrowLeft', altKey: true });
  assert.equal(w.NovelWriter.state.activeChapterId, 'c1', 'Alt+← = bab sebelumnya');
  assert.deepEqual(w.__errors, []);
});

test('BUG-02: ganti bahasa tidak mencuri fokus dari modal Pengaturan', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  click(w, $('#btn-settings'));
  await wait(80);                       // openModal memindahkan fokus setelah ~40 md
  assert.ok($('#modal-settings').contains(w.document.activeElement), 'fokus mula-mula di dalam modal');

  const sel = $('#set-lang');
  sel.value = 'en';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  await wait(30);

  assert.ok($('#modal-settings').contains(w.document.activeElement),
    'fokus TETAP di dalam modal (tidak dilompatkan ke editor)');
  assert.equal($('#btn-new-project').title, 'New Project', 'bahasa tetap berganti');
  assert.ok($('body').classList.contains('modal-open'), 'penanda modal masih aktif');
});

test('BUG-03: Tab hanya dicegat bila indent bekerja (kursor tidak terjebak)', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  ed.focus();
  ed.innerHTML = '<p>baris tanpa indent</p>';
  const t = ed.querySelector('p').firstChild;
  select(w, t, 0, t, 5);

  const tab1 = new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  ed.dispatchEvent(tab1);
  assert.equal(tab1.defaultPrevented, true, 'indent berhasil -> Tab dicegat');

  const untab1 = new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  ed.dispatchEvent(untab1);
  assert.equal(untab1.defaultPrevented, true, 'un-indent berhasil -> Tab dicegat');

  const untab2 = new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  ed.dispatchEvent(untab2);
  assert.equal(untab2.defaultPrevented, false,
    'tidak ada lagi indent -> Tab dibiarkan supaya fokus bisa pindah (a11y)');
});

test('BUG-04: hapus proyek aktif -> UI & penunjuk tersimpan sinkron', async () => {
  const { w, $, S } = await createApp({ seed: seedTwoProjects() });
  const del = [...$('#project-list').querySelectorAll('[data-del-proj]')].find(b => b.dataset.delProj === 'p1');
  click(w, del);
  click(w, $('#btn-confirm-yes'));
  await wait(30);

  assert.equal(S.getProjects().length, 1);
  assert.equal(w.NovelWriter.state.activeProjectId, S.getSettings().lastProject,
    'UI mengikuti penunjuk tersimpan (bukan null)');
  assert.equal(w.NovelWriter.state.activeProjectId, 'p2');
  assert.equal(w.NovelWriter.state.activeChapterId, 'c2', 'bab pertama proyek berikutnya langsung terbuka');
  assert.equal($('#empty-state').hidden, true, 'tidak nyangkut di empty-state');
  assert.equal($('#toolbar-title').textContent, 'Bab 2');
});

test('BUG-05: bab aktif dihapus tab lain -> draf disimpan & bisa dipulihkan', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  type(w, $('#editor'), 'ketikan yang sangat berharga');

  const dariTabLain = JSON.stringify({
    projects: [{ id: 'p1', title: 'Novel Uji', author: '', description: '', chapters: [
      { id: 'c9', title: 'Bab lain', content: '<p>isi</p>', format: 'html', order: 1, createdAt: 'x', updatedAt: 'x' }
    ], createdAt: 'x', updatedAt: 'x' }],
    settings: { theme: 'light', fontSize: 18, lineHeight: 1.8, autoSaveDelay: 1000, lang: 'id', lastProject: 'p1', lastChapter: null }
  });
  w.localStorage.setItem('novel-writer-data', dariTabLain);
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'novel-writer-data', newValue: dariTabLain }));

  assert.equal(S.hasDraft(), true, 'ketikan disimpan sebagai draf, bukan dibuang diam-diam');
  assert.equal($('#toast').hidden, false);
  assert.ok($('#toast').classList.contains('toast-error'), 'pengguna diperingatkan');

  // pulihkan ke bab yang dibuka
  click(w, $('#chapter-list li[data-id="c9"]'));
  click(w, $('#btn-settings'));
  assert.equal($('#btn-restore-draft').hidden, false, 'tombol pulihkan draf muncul');
  click(w, $('#btn-restore-draft'));
  assert.equal(S.hasDraft(), false, 'draf dipakai sekali lalu dibersihkan');
  await wait(1300);
  const ch = S.getProject('p1').chapters.find(c => c.id === 'c9');
  assert.match(ch.content, /ketikan yang sangat berharga/, 'draf menempel di bab tujuan');
  assert.deepEqual(w.__errors, []);
});

test('BUG-06: judul kosong -> pesan + aria-invalid (bukan diam saja)', async () => {
  const { w, $, S } = await createApp();
  click(w, $('#btn-new-project'));
  $('#inp-proj-title').value = '   ';
  click(w, $('#btn-create-project'));

  assert.equal($('#modal-project').hidden, false, 'modal tetap terbuka');
  assert.equal(S.getProjects().length, 0, 'proyek tidak jadi dibuat');
  assert.equal($('#inp-proj-title').getAttribute('aria-invalid'), 'true');
  assert.equal($('#toast').hidden, false, 'ada pesan untuk pengguna');
  assert.match($('#toast').textContent, /kosong/i);

  // mengetik menghapus penanda error
  $('#inp-proj-title').value = 'Judul Baru';
  $('#inp-proj-title').dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal($('#inp-proj-title').hasAttribute('aria-invalid'), false);

  // rename bab/proyek memakai aturan yang sama
  click(w, $('#btn-create-project'));
  assert.equal(S.getProjects()[0].title, 'Judul Baru');
});

test('BUG-12: statistik kata mengikuti ketikan (tanpa menunggu auto-save)', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  type(w, $('#editor'), 'satu dua tiga empat lima');
  assert.equal($('#stat-chapter').textContent, '5', 'langsung terhitung saat mengetik');
  assert.equal($('#stat-total').textContent, '5');
  await wait(1300);
  assert.equal($('#stat-chapter').textContent, '5', 'tetap konsisten setelah tersimpan');
});

test('BUG-16: cadangkan saat penyimpanan gagal -> berkas tetap dibuat + peringatan', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  let downloaded = null;
  w.NW.Exporter.download = (blob, name) => { downloaded = name; };
  type(w, $('#editor'), 'teks yang belum tersimpan');
  const restore = breakStorageSetItem(w);
  click(w, $('#btn-settings'));
  click(w, $('#btn-backup'));
  await wait(30);

  assert.match(String(downloaded), /^novel-writer-backup-\d{4}-\d{2}-\d{2}\.json$/,
    'berkas cadangan tetap dihasilkan');
  assert.equal($('#toast').hidden, false);
  assert.ok($('#toast').classList.contains('toast-error'), 'pengguna diperingatkan, bukan ditelan');
  restore();
});

test('B-05: draf tidak dibuang bila belum ada bab tujuan', async () => {
  const { w, $, S } = await createApp({ seed: seedProject(false) });
  assert.equal(S.saveDraft('<p>tulisan darurat</p>'), true);
  click(w, $('#btn-settings'));
  assert.equal($('#btn-restore-draft').hidden, false, 'tombol "Pulihkan draf" muncul');

  click(w, $('#btn-restore-draft'));
  assert.equal(S.hasDraft(), true, 'draf TIDAK dibuang — masih bisa dipulihkan nanti');
  assert.equal($('#toast').hidden, false);
  assert.match($('#toast').textContent, /Buka sebuah bab/i);
  assert.deepEqual(w.__errors, []);
});

/* ================= Ilustrasi (gambar ilustrasi tokoh/karakter) ================= */

const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

test('sisip ilustrasi: modal -> pratinjau -> figure di editor, tersimpan & tampil di Mode Baca', async () => {
  const { w, $, S, nw } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, 'Paragraf pembuka.');

  // Tombol ilustrasi ada di panel format (bukan sintaks) dan membuka modal
  assert.ok($('#format-bar #btn-image svg'), 'tombol ilustrasi memakai ikon SVG');
  click(w, $('#btn-image'));
  assert.equal($('#modal-image').hidden, false);
  assert.equal($('#btn-insert-image').disabled, true, 'belum ada gambar -> tombol nonaktif');

  // jsdom tidak punya canvas/Image: berkas diterima apa adanya lewat FileReader
  setFileInput(w, $('#inp-img-file'), 'tokoh.png', 'isi-berkas-gambar', 'image/png');
  await wait(150);
  assert.equal($('#img-preview').hidden, false, 'pratinjau tampil');
  assert.match($('#img-preview-el').getAttribute('src'), /^data:image\/png;base64,/);
  assert.equal($('#btn-insert-image').disabled, false, 'gambar siap disisipkan');

  $('#inp-img-caption').value = 'Nyai Ontosoroh';
  $('input[name="img-size"][value="s"]').checked = true;
  click(w, $('#btn-insert-image'));
  await wait(60);
  assert.equal($('#modal-image').hidden, true, 'modal tutup setelah menyisipkan');

  const fig = $('#editor figure');
  assert.ok(fig, 'ilustrasi masuk ke editor');
  assert.equal(fig.className, 'fig-s');
  assert.match(fig.querySelector('img').getAttribute('src'), /^data:image\/png;base64,/);
  assert.equal(fig.querySelector('img').getAttribute('alt'), 'Nyai Ontosoroh');
  assert.equal(fig.querySelector('img').getAttribute('contenteditable'), 'false');
  assert.equal(fig.querySelector('figcaption').textContent, 'Nyai Ontosoroh');
  assert.equal($('#editor').getAttribute('data-empty'), 'false', 'bab berilustrasi tidak dianggap kosong');

  // langsung tersimpan (gambar ikut tersimpan di dalam bab)
  const ch = S.getProject('p1').chapters.find(c => c.id === 'c1');
  assert.match(ch.content, /^<p>Paragraf pembuka\.<\/p><figure class="fig-s">/);
  assert.match(ch.content, /<figcaption>Nyai Ontosoroh<\/figcaption><\/figure>$/);
  assert.doesNotMatch(ch.content, /contenteditable|draggable/);

  // Mode Baca menampilkan ilustrasinya
  click(w, $('#btn-reader'));
  await wait(30);
  assert.ok($('#reader-view figure img'), 'ilustrasi tampil di Mode Baca');
  click(w, $('#btn-reader'));
  await wait(30);
  assert.deepEqual(w.__errors, []);
  void nw;
});

test('ilustrasi: src berbahaya tidak pernah tersimpan (gambar dibuang, teks diselamatkan)', async () => {
  const { w, $, S, nw } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  ed.innerHTML = '<p>teks</p>' +
    '<img src="javascript:alert(1)" alt="tokoh jahat">' +
    '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">' +
    '<figure><img src="data:image/png;base64,***"><figcaption>Minke</figcaption></figure>';
  ed.dispatchEvent(new w.Event('input', { bubbles: true }));
  w.NovelWriter.flushNow();

  const ch = S.getProject('p1').chapters.find(c => c.id === 'c1');
  assert.equal(ch.content, '<p>teks</p><p>tokoh jahat</p><p>Minke</p>',
    'gambar berbahaya hilang, teksnya tidak ikut lenyap');
  assert.doesNotMatch(ch.content, /javascript|svg|alert|onerror/i);
  assert.deepEqual(w.__errors, []);
  void nw;
});

test('ilustrasi: hook sisip menolak src tidak aman & ilustrasi tahan bongkar-muat bab', async () => {
  const { w, $, $$, S, nw } = await createApp({ seed: seedProject() });
  type(w, $('#editor'), 'Prosa.');

  assert.equal(w.NovelWriter.insertFigure({ src: 'javascript:alert(1)' }), false, 'src berbahaya ditolak');
  assert.equal($('#editor figure'), null);

  assert.equal(w.NovelWriter.insertFigure({
    src: PNG1, alt: 'Minke', caption: 'Minke', width: 900, height: 600, size: 'l'
  }), true);

  // pindah bab lalu kembali: ilustrasi tetap utuh (round-trip model blok)
  const ch1 = S.getProject('p1').chapters.find(c => c.id === 'c1');
  assert.equal(ch1.content,
    '<p>Prosa.</p><figure class="fig-l"><img src="' + PNG1 + '" alt="Minke" width="900" height="600">' +
    '<figcaption>Minke</figcaption></figure>');
  click(w, $$('#chapter-list li')[1]);
  await wait(40);
  click(w, $$('#chapter-list li')[0]);
  await wait(40);
  const img = $('#editor figure img');
  assert.ok(img, 'ilustrasi kembali utuh setelah ganti bab');
  assert.equal(img.getAttribute('width'), '900');
  assert.equal($('#editor figure').className, 'fig-l');
  assert.equal($('#stat-chapter').textContent, '2', 'kata dihitung dari teks (Prosa. + Minke)');
  assert.deepEqual(w.__errors, []);
  void nw;
});

test('ilustrasi: klik -> bilah aksi -> ganti gambar (posisi/keterangan/ukuran tetap)', async () => {
  const { w, $, S, nw } = await createApp({ seed: seedProject() });
  type(w, $('#editor'), 'Prosa pembuka.');
  assert.equal(nw.insertFigure({ src: PNG1, alt: 'Minke', caption: 'Minke', width: 900, height: 600, size: 's' }), true);
  const lama = PNG1;

  // Klik ilustrasi -> bilah aksi muncul (toolbar kecil di atasnya)
  const fig = $('#editor figure');
  fig.querySelector('img').dispatchEvent(new w.Event('click', { bubbles: true }));
  const bar = $('#figure-bar');
  assert.equal(bar.hidden, false, 'bilah aksi tampil');
  assert.equal(bar.getAttribute('role'), 'toolbar');
  assert.equal(bar.getAttribute('aria-label'), w.NW.t('figureBarAria'));
  assert.ok($('#btn-fig-replace svg'), 'tombol ganti memakai ikon SVG');
  assert.ok($('#btn-fig-delete svg'), 'tombol hapus memakai ikon SVG');

  // Klik di luar ilustrasi -> bilah lenyap, ilustrasi tetap
  const par = $('#editor p');
  par.dispatchEvent(new w.Event('click', { bubbles: true }));
  assert.equal(bar.hidden, true, 'bilah lenyap saat klik di luar');
  assert.ok($('#editor figure'), 'ilustrasi tidak ikut lenyap');

  // Klik lagi lalu pilih berkas baru lewat tombol "Ganti"
  fig.querySelector('img').dispatchEvent(new w.Event('click', { bubbles: true }));
  assert.equal(bar.hidden, false);
  setFileInput(w, $('#inp-fig-file'), 'minke-baru.png', 'gambar baru', 'image/png');
  await wait(200);

  const img = $('#editor figure img');
  assert.match(img.getAttribute('src'), /^data:image\/png;base64,/, 'gambar baru dimuat');
  assert.notEqual(img.getAttribute('src'), lama, 'src berganti');
  assert.equal($('#editor figure').className, 'fig-s', 'kelas ukuran dipertahankan');
  assert.equal(img.getAttribute('alt'), 'Minke', 'alt dipertahankan');
  assert.equal($('#editor figure figcaption').textContent, 'Minke', 'keterangan dipertahankan');
  assert.equal(bar.hidden, false, 'bilah tetap tampil setelah ganti');
  assert.equal($('#toast').textContent, w.NW.t('imageReplaced'));

  // Tersimpan di bab — ilustrasi utuh (regresi: dulu gambar hilang saat disimpan)
  const ch = S.getProject('p1').chapters.find(c => c.id === 'c1');
  assert.equal(ch.content,
    '<p>Prosa pembuka.</p><figure class="fig-s"><img src="' + img.getAttribute('src') + '" alt="Minke">' +
    '<figcaption>Minke</figcaption></figure>');
  assert.deepEqual(w.__errors, []);
});

test('ilustrasi: hapus lewat bilah aksi — naskah tersimpan tanpa jeda hantu', async () => {
  const { w, $, S, nw } = await createApp({ seed: seedProject() });
  type(w, $('#editor'), 'Prosa pembuka.');
  assert.equal(nw.insertFigure({ src: PNG1, alt: 'Minke', caption: 'Minke', width: 900, height: 600, size: 'm' }), true);

  const fig = $('#editor figure');
  fig.querySelector('img').dispatchEvent(new w.Event('click', { bubbles: true }));
  assert.equal($('#figure-bar').hidden, false);
  click(w, $('#btn-fig-delete'));
  await wait(30);

  assert.equal($('#editor figure'), null, 'ilustrasi terhapus dari editor');
  assert.equal($('#figure-bar').hidden, true, 'bilah lenyap setelah hapus');
  assert.equal($('#toast').textContent, w.NW.t('imageDeleted'));
  const ch = S.getProject('p1').chapters.find(c => c.id === 'c1');
  assert.equal(ch.content, '<p>Prosa pembuka.</p>', 'tersimpan tanpa ilustrasi & tanpa jeda hantu');
  assert.deepEqual(w.__errors, []);
  void nw;
});

test('ilustrasi: Esc menutup bilah aksi; bilah lenyap saat ganti bab', async () => {
  const { w, $, $$, nw } = await createApp({ seed: seedProject() });
  type(w, $('#editor'), 'Prosa.');
  assert.equal(nw.insertFigure({ src: PNG1, alt: 'Minke', caption: 'Minke', width: 900, height: 600, size: 'm' }), true);

  const fig = $('#editor figure');
  fig.querySelector('img').dispatchEvent(new w.Event('click', { bubbles: true }));
  assert.equal($('#figure-bar').hidden, false);

  // Esc hanya menutup bilah — ilustrasi aman
  key(w, $('#btn-fig-delete'), { key: 'Escape' });
  assert.equal($('#figure-bar').hidden, true, 'Esc menyembunyikan bilah');
  assert.ok($('#editor figure'), 'ilustrasi tetap ada');

  // Klik lagi, lalu pindah bab -> bilah lenyap
  fig.querySelector('img').dispatchEvent(new w.Event('click', { bubbles: true }));
  assert.equal($('#figure-bar').hidden, false);
  click(w, $$('#chapter-list li')[1]);
  await wait(40);
  assert.equal($('#figure-bar').hidden, true, 'bilah lenyap saat ganti bab');
  assert.deepEqual(w.__errors, []);
  void nw;
});

test('ilustrasi: berkas tidak didukung saat ganti -> pesan error, gambar lama utuh', async () => {
  const { w, $, nw } = await createApp({ seed: seedProject() });
  type(w, $('#editor'), 'Prosa.');
  assert.equal(nw.insertFigure({ src: PNG1, alt: 'Minke', caption: 'Minke', width: 900, height: 600, size: 'm' }), true);

  const fig = $('#editor figure');
  fig.querySelector('img').dispatchEvent(new w.Event('click', { bubbles: true }));
  setFileInput(w, $('#inp-fig-file'), 'bukan-gambar.svg', '<svg/>', 'image/svg+xml');
  await wait(200);

  assert.equal(fig.isConnected, true, 'ilustrasi lama tetap ada');
  assert.equal($('#editor figure img').getAttribute('src'), PNG1, 'src tidak berubah');
  assert.equal($('#toast').textContent, w.NW.t('imageBadType'), 'pengguna diberi tahu');
  assert.deepEqual(w.__errors, []);
});

test('ilustrasi besar diperkecil & dikompres otomatis; gambar kecil dipakai apa adanya', async () => {
  const { w, dom } = await createApp({ seed: seedProject() });
  const IMGU = w.NW.ImageUtil;

  /* Canvas palsu: catat ukuran hasil gambar dan kembalikan data URL
     yang kebesaran pada percobaan pertama, lalu muat pada percobaan kedua. */
  const draws = [];
  const proto = w.HTMLCanvasElement.prototype;
  Object.defineProperty(proto, 'getContext', {
    configurable: true,
    value: () => ({
      fillStyle: '#000',
      fillRect() {},
      drawImage(img, x, y, dw, dh) { draws.push([dw, dh]); }
    })
  });
  let payload = 500000;                       // ≈375 KB -> di atas target 320 KB
  Object.defineProperty(proto, 'toDataURL', {
    configurable: true,
    value: () => { const s = 'data:image/jpeg;base64,' + 'A'.repeat(payload); payload = 100000; return s; }
  });
  w.Image = class {
    constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
    set src(v) { this._src = v; this.complete = true; this.naturalWidth = 3000; this.naturalHeight = 2000; }
    get src() { return this._src; }
  };

  const besar = new w.File(['x'.repeat(5000)], 'besar.jpg', { type: 'image/jpeg' });
  const out = await IMGU.fromFile(besar);
  assert.deepEqual(draws, [[1280, 853], [1100, 733]], 'diperkecil bertahap sampai muat di target');
  assert.match(out.src, /^data:image\/jpeg;base64,/, 'hasil enkode jadi JPEG');
  assert.equal(out.width, 1100);
  assert.equal(out.height, 733);
  assert.equal(out.over, false, 'hasil akhir di bawah batas lunak');

  // Gambar kecil (png) tidak dikode ulang: ukuran asli & transparansi terjaga
  const kecil = new w.File(['x'.repeat(200)], 'kecil.png', { type: 'image/png' });
  const out2 = await IMGU.fromFile(kecil);
  assert.match(out2.src, /^data:image\/png;base64,/, 'tidak diubah jadi JPEG');
  assert.equal(draws.length, 2, 'gambar kecil tidak melewati canvas');

  // Berkas bukan gambar & berkas kebesaran ditolak dengan kode yang jelas
  await assert.rejects(() => IMGU.fromFile(new w.File(['x'], 'a.gif', { type: 'image/svg+xml' })),
    (e) => e.code === 'type');
  const raksasa = new w.File(['x'], 'raksasa.png', { type: 'image/png' });
  Object.defineProperty(raksasa, 'size', { value: 99 * 1024 * 1024 });
  await assert.rejects(() => IMGU.fromFile(raksasa), (e) => e.code === 'size');

  dom.window.close();
});
