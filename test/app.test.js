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
