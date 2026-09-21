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

/* ============ MODE IMERSIF: MODE FOKUS & MODE BACA ============ */

const rootEl = (w) => w.document.documentElement;
const movePointer = (w, clientY) =>
  w.document.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientY }));

test('mode fokus: chrome hilang total, HUD imersif membawa hitungan kata', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const ed = $('#editor');
  type(w, ed, 'tiga kata dulu');
  click(w, $('#btn-focus'));

  const root = rootEl(w);
  assert.equal(root.classList.contains('focus-mode'), true);
  assert.equal(root.classList.contains('immersive'), true, 'satu kelas bersama: semua chrome disembunyikan');

  const hud = $('#immersive-hud');
  assert.equal(hud.hidden, false, 'HUD tersedia selama mode imersif');
  assert.equal(hud.classList.contains('is-visible'), true, 'HUD menyala sebentar saat masuk');
  assert.equal($('#hud-info').textContent, '3 kata');
  assert.equal($('#hud-switch').getAttribute('aria-label'), w.NW.t('toReaderMode'));
  assert.ok($('#hud-exit').getAttribute('aria-label').match(/Keluar Mode Fokus/i));

  // hitungan kata mengikuti ketikan tanpa menunggu auto-save
  type(w, ed, 'tiga kata dulu lalu bertambah dua');
  assert.equal($('#hud-info').textContent, '6 kata');
  assert.deepEqual(w.__errors, []);
});

test('mode fokus: keluar lewat HUD, lewat Esc, dan saat layar penuh ditutup browser', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const root = rootEl(w);

  click(w, $('#btn-focus'));
  assert.equal(root.classList.contains('immersive'), true);
  click(w, $('#hud-exit'));
  assert.equal(root.classList.contains('focus-mode'), false);
  assert.equal(root.classList.contains('immersive'), false);
  assert.equal($('#immersive-hud').hidden, true, 'HUD ikut hilang setelah keluar');
  assert.equal($('#immersive-hud').classList.contains('is-visible'), false);

  click(w, $('#btn-focus'));
  key(w, w.document, { key: 'Escape' });
  assert.equal(root.classList.contains('focus-mode'), false, 'Esc keluar dari layar penuh');

  // Layar penuh ditutup dari luar (Esc native browser / tombol OS)
  click(w, $('#btn-focus'));
  assert.equal(root.classList.contains('focus-mode'), true);
  w.document.dispatchEvent(new w.Event('fullscreenchange'));
  assert.equal(root.classList.contains('focus-mode'), false, 'keluar layar penuh = keluar Mode Fokus');
  assert.equal(root.classList.contains('immersive'), false);
  assert.equal($('#immersive-hud').hidden, true);
  assert.deepEqual(w.__errors, []);
});

test('layar penuh browser diminta saat masuk, tidak diobrak-abrik saat pindah mode', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const root = rootEl(w);
  const calls = [];
  root.requestFullscreen = () => { calls.push('enter'); return Promise.resolve(); };
  w.document.exitFullscreen = () => { calls.push('exit'); return Promise.resolve(); };

  click(w, $('#btn-focus'));
  await wait(20);
  assert.deepEqual(calls, ['enter'], 'masuk Mode Fokus = minta layar penuh');
  assert.equal(w.NovelWriter.state.fullscreenRequested, true);

  // Fokus -> Baca lewat HUD: tetap satu sesi layar penuh (tanpa kedip)
  click(w, $('#hud-switch'));
  await wait(20);
  assert.deepEqual(calls, ['enter'], 'pindah mode tidak keluar-masuk layar penuh');
  assert.equal(root.classList.contains('reader-mode'), true);
  assert.equal(root.classList.contains('focus-mode'), false);
  assert.equal(root.classList.contains('immersive'), true);

  key(w, w.document, { key: 'Escape' });
  await wait(20);
  assert.deepEqual(calls, ['enter', 'exit'], 'keluar mode = lepas layar penuh');
  assert.equal(w.NovelWriter.state.fullscreenRequested, false);
  assert.deepEqual(w.__errors, []);
});

test('tanpa Fullscreen API / ditolak browser: mode imersif tetap jalan penuh', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  const root = rootEl(w);
  root.requestFullscreen = () => Promise.reject(new Error('NotAllowedError'));
  click(w, $('#btn-focus'));
  await wait(20);
  assert.equal(root.classList.contains('immersive'), true, 'CSS layar penuh tetap dipakai');
  assert.equal($('#immersive-hud').hidden, false);
  assert.match($('#toast').textContent, /layar penuh/i, 'penolakan browser diberitahukan');
  assert.equal(w.NovelWriter.state.fullscreenRequested, false);
  assert.deepEqual(w.__errors, []);
});

test('HUD hanya muncul saat diminta lalu memudar; kursor mouse ikut menganggur', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  click(w, $('#btn-focus'));
  const hud = $('#immersive-hud');
  const root = rootEl(w);
  assert.equal(hud.classList.contains('is-visible'), true);

  await wait(2500);                       // melewati masa pudar HUD + kursor
  assert.equal(hud.classList.contains('is-visible'), false, 'HUD memudar sendiri');
  assert.equal(root.classList.contains('cursor-idle'), true, 'kursor disembunyikan saat menganggur');

  movePointer(w, 400);                    // gerakan di area tulis
  assert.equal(root.classList.contains('cursor-idle'), false, 'kursor kembali begitu pointer bergerak');
  assert.equal(hud.classList.contains('is-visible'), false, 'gerakan di teks tidak memunculkan HUD');

  movePointer(w, 12);                     // menyentuh tepi atas layar
  assert.equal(hud.classList.contains('is-visible'), true, 'tepi atas = panggil HUD');
});

test('mode baca: halaman buku lengkap, pindah bab tidak meninggalkan mode', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const proj = S.getProject('p1');
  proj.chapters[0].content = '<p>Paragraf pertama bab satu.</p>';
  proj.chapters[0].format = 'html';
  proj.chapters[1].content = '<p>Isi bab dua.</p>';
  proj.chapters[1].format = 'html';
  S.saveProject(proj);
  w.NovelWriter.renderAll();

  click(w, $('#btn-reader'));
  await wait(40);
  const root = rootEl(w);
  const rv = $('#reader-view');
  assert.equal(root.classList.contains('reader-mode'), true);
  assert.equal(root.classList.contains('immersive'), true);
  assert.equal(rv.querySelector('h1.reader-title').textContent, 'Bab 1', 'judul bab jadi judul halaman');
  assert.equal(rv.querySelector('p').textContent, 'Paragraf pertama bab satu.');
  assert.equal($('#hud-info').textContent, 'Bab 1 · 100%');
  assert.equal($('#hud-progress-fill').style.width, '100%', 'bab lebih pendek dari layar = terbaca semua');
  assert.equal($('#hud-prev').disabled, true, 'bab pertama: "sebelumnya" nonaktif');
  assert.equal($('#hud-next').disabled, false);
  assert.equal($('#hud-switch').getAttribute('aria-label'), w.NW.t('toFocusMode'));

  click(w, $('#hud-next'));
  await wait(40);
  assert.equal(w.NovelWriter.state.activeChapterId, 'c2');
  assert.equal(root.classList.contains('reader-mode'), true, 'pindah bab tetap di Mode Baca');
  assert.equal(rv.querySelector('h1.reader-title').textContent, 'Bab 2');
  assert.equal(rv.querySelector('p').textContent, 'Isi bab dua.');

  key(w, w.document, { key: 'ArrowLeft' });
  await wait(40);
  assert.equal(rv.querySelector('h1.reader-title').textContent, 'Bab 1', 'panah kiri = bab sebelumnya');

  // Ujung daftar bab: diberi tahu, tidak error, tidak melompat
  key(w, w.document, { key: 'ArrowRight' });
  key(w, w.document, { key: 'ArrowRight' });
  await wait(40);
  assert.equal(w.NovelWriter.state.activeChapterId, 'c3');
  assert.equal($('#hud-next').disabled, true);
  key(w, w.document, { key: 'ArrowRight' });
  assert.equal(w.NovelWriter.state.activeChapterId, 'c3', 'tidak melampaui bab terakhir');
  assert.match($('#toast').textContent, /bab terakhir/i);
  assert.deepEqual(w.__errors, []);
});

test('mode baca: keyboard di dalam HUD tidak dibajak kendali baca (pola toolbar)', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  click(w, $('#btn-reader'));
  await wait(40);
  $('#hud-next').focus();
  key(w, w.document, { key: ' ' });            // Space di atas tombol = klik tombol itu
  assert.equal(w.NovelWriter.state.activeChapterId, 'c1', 'Space tidak dipakai membalik halaman');
  key(w, w.document, { key: 'ArrowRight' });
  assert.equal(w.NovelWriter.state.activeChapterId, 'c1', 'panah di dalam HUD = pindah tombol');
  assert.equal(w.document.activeElement.id, 'hud-font-down', 'fokus berpindah ke tombol berikutnya');

  // Fokus kembali ke halaman: panah & Space jadi kendali baca
  $('#reader-view').focus();
  key(w, w.document, { key: 'ArrowRight' });
  await wait(40);
  assert.equal(w.NovelWriter.state.activeChapterId, 'c2', 'panah di halaman = bab berikutnya');
});

test('ukuran huruf bisa diubah dari HUD Mode Baca dan tersimpan', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  click(w, $('#btn-reader'));
  assert.equal($('#hud-font-up').disabled, false);
  click(w, $('#hud-font-up'));
  click(w, $('#hud-font-up'));
  assert.equal(S.getSettings().fontSize, 20);
  assert.equal(rootEl(w).style.getPropertyValue('--editor-size'), '20px');
  click(w, $('#hud-font-down'));
  assert.equal(S.getSettings().fontSize, 19);
  assert.deepEqual(w.__errors, []);
});

test('pengaturan mode imersif tersimpan & langsung berlaku', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  click(w, $('#btn-settings'));
  const fs = $('#set-fullscreen'), tw = $('#set-typewriter');
  assert.equal(fs.checked, true, 'layar penuh otomatis aktif secara bawaan');
  assert.equal(tw.checked, false);
  fs.checked = false; fs.dispatchEvent(new w.Event('change', { bubbles: true }));
  tw.checked = true;  tw.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(S.getSettings().immersiveFullscreen, false);
  assert.equal(S.getSettings().focusTypewriter, true);
  click(w, $('#modal-settings [data-close]'));

  const calls = [];
  rootEl(w).requestFullscreen = () => { calls.push('enter'); return Promise.resolve(); };
  click(w, $('#btn-focus'));
  await wait(20);
  assert.deepEqual(calls, [], 'layar penuh tidak diminta bila pengaturan mati');
  assert.equal(rootEl(w).classList.contains('focus-mode'), true, 'mode tetap jalan tanpa layar penuh browser');
  assert.equal(rootEl(w).classList.contains('typewriter'), true, 'typewriter aktif bersama Mode Fokus');

  // typewriter hanya milik Mode Fokus
  click(w, $('#hud-switch'));
  await wait(20);
  assert.equal(rootEl(w).classList.contains('typewriter'), false);
  assert.equal(rootEl(w).classList.contains('reader-mode'), true);
  assert.deepEqual(w.__errors, []);
});

test('mode imersif otomatis dilepas bila bab/proyek hilang (data tab lain)', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  click(w, $('#btn-focus'));
  assert.equal(rootEl(w).classList.contains('immersive'), true);

  // tab lain menghapus bab yang sedang dibuka
  const proj = S.getProject('p1');
  proj.chapters = proj.chapters.filter(c => c.id !== 'c1');
  S.saveProject(proj);
  S.saveSettings({ lastChapter: null });
  w.dispatchEvent(Object.assign(new w.Event('storage'), { key: 'novel-writer-data' }));
  await wait(30);

  assert.equal(rootEl(w).classList.contains('focus-mode'), false);
  assert.equal(rootEl(w).classList.contains('immersive'), false);
  assert.equal($('#immersive-hud').hidden, true);
  assert.deepEqual(w.__errors, []);
});

test('mode baca: pindah bab tidak pernah menimpa isi bab lain (regresi kehilangan data)', async () => {
  const { w, $, S } = await createApp({ seed: seedProject() });
  const proj = S.getProject('p1');
  proj.chapters.forEach((c, i) => { c.content = `<p>Isi bab ${['satu', 'dua', 'tiga'][i]}.</p>`; c.format = 'html'; });
  S.saveProject(proj);
  w.NovelWriter.renderAll();

  click(w, $('#btn-reader'));
  await wait(30);
  key(w, w.document, { key: 'ArrowRight' });   // -> Bab 2
  key(w, w.document, { key: 'ArrowRight' });   // -> Bab 3
  await wait(30);
  assert.equal($('#reader-view').querySelector('h1.reader-title').textContent, 'Bab 3');

  // flush saat tab ditutup tidak boleh menulis isi editor yang basi
  w.dispatchEvent(new w.Event('pagehide'));
  let chs = S.getProject('p1').chapters;
  assert.deepEqual([...chs.map(c => c.content)],
    ['<p>Isi bab satu.</p>', '<p>Isi bab dua.</p>', '<p>Isi bab tiga.</p>'], 'semua bab utuh');

  // kembali menulis: editor memuat bab yang sedang dibuka, bukan bab pertama
  click(w, $('#hud-switch'));
  await wait(30);
  assert.equal($('#editor').textContent.trim(), 'Isi bab tiga.');
  assert.equal(rootEl(w).classList.contains('focus-mode'), true);
  chs = S.getProject('p1').chapters;
  assert.deepEqual([...chs.map(c => c.content)],
    ['<p>Isi bab satu.</p>', '<p>Isi bab dua.</p>', '<p>Isi bab tiga.</p>'], 'tetap utuh setelah keluar');
  assert.deepEqual(w.__errors, []);
});

test('masuk mode imersif menutup modal yang terbuka (tidak ada yang tertinggal di layar)', async () => {
  const { w, $ } = await createApp({ seed: seedProject() });
  click(w, $('#btn-settings'));
  assert.equal($('#modal-overlay').hidden, false);
  key(w, w.document, { key: 'F10' });           // Mode Baca dari keyboard
  await wait(30);
  assert.equal($('#modal-overlay').hidden, true, 'modal tertutup');
  assert.equal(w.document.body.classList.contains('modal-open'), false);
  assert.equal(rootEl(w).classList.contains('immersive'), true);
  assert.equal($('#immersive-hud').hidden, false);
  assert.deepEqual(w.__errors, []);
});
