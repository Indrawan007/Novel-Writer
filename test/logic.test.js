/* Uji logika murni (Storage / TextUtil / Exporter) tanpa DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './helpers.mjs';

const { Storage, TextUtil, RichText, Exporter, ImageUtil, sandbox } = await loadLogic();

/* Objek dari konteks vm punya prototype realm lain -> normalkan lewat JSON
   sebelum deepEqual (strict membandingkan prototype). */
const plain = (v) => JSON.parse(JSON.stringify(v));

test('TextUtil.countWords: teks polos, tanda baca lepas tidak dihitung', () => {
  assert.equal(TextUtil.countWords(''), 0);
  assert.equal(TextUtil.countWords(null), 0);
  assert.equal(TextUtil.countWords('   \n\n  '), 0);
  assert.equal(TextUtil.countWords('satu dua tiga'), 3);
  assert.equal(TextUtil.countWords('Ia berhenti — lalu pergi.'), 4);
  assert.equal(TextUtil.countWords('"Halo," katanya.  Tahun 1998!'), 4);
  assert.equal(TextUtil.countWords('baris satu\nbaris dua\n\nbaris tiga'), 6);
  assert.equal(TextUtil.countWords('* * *'), 0);
});

test('TextUtil.paragraphs: satu baris = satu paragraf, baris kosong = jeda', () => {
  assert.deepEqual(plain(TextUtil.paragraphs('')), []);
  assert.deepEqual(plain(TextUtil.paragraphs('\n\n  \n')), []);
  assert.deepEqual(plain(TextUtil.paragraphs('a\nb')), [{ text: 'a', gap: false }, { text: 'b', gap: false }]);
  assert.deepEqual(plain(TextUtil.paragraphs('\n\na\n\n\nb\nc\n')), [
    { text: 'a', gap: false }, { text: 'b', gap: true }, { text: 'c', gap: false }
  ], 'baris kosong di awal diabaikan; di tengah jadi gap');
  assert.deepEqual(plain(TextUtil.paragraphs('  satu  \r\ndua\rtiga')), [
    { text: 'satu', gap: false }, { text: 'dua', gap: false }, { text: 'tiga', gap: false }
  ], 'CRLF/CR didukung, spasi tepi dirapikan');
  // Sintaks Markdown TIDAK diinterpretasi: tampil apa adanya
  assert.deepEqual(plain(TextUtil.paragraphs('# bukan judul\n**bukan tebal**')), [
    { text: '# bukan judul', gap: false }, { text: '**bukan tebal**', gap: false }
  ]);
});


test('Exporter.sanitize nama file: karakter ilegal & kontrol, panjang dibatasi', () => {
  assert.equal(Exporter.sanitize('A/B:C*?'), 'A_B_C__');
  assert.equal(Exporter.sanitize('   '), 'novel');
  assert.equal(Exporter.sanitize(null), 'novel');
  assert.equal(Exporter.sanitize('judul\n\tbaru'), 'judul baru');
  const panjang = 'x'.repeat(300);
  assert.ok(Exporter.sanitize(panjang).length <= 80);
  assert.equal(Exporter.sanitize('Judul Bagus!'), 'Judul Bagus!');
});

test('Storage: tulis/baca & kegagalan kuota dilaporkan', () => {
  assert.equal(Storage.saveProject({ id: 'p1', title: 'A', chapters: [] }), true);
  assert.equal(Storage.getProject('p1').title, 'A');

  const orig = sandbox.localStorage.setItem;
  sandbox.localStorage.setItem = () => {
    const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
  };
  assert.equal(Storage.saveProject({ id: 'p2', title: 'B', chapters: [] }), false);
  assert.equal(Storage.lastError(), 'quota');
  sandbox.localStorage.setItem = orig;
  assert.equal(Storage.saveProject({ id: 'p3', title: 'C', chapters: [] }), true);
  assert.equal(Storage.lastError(), null, 'error state pulih setelah tulis sukses');
});

test('Storage: uid unik', () => {
  const ids = new Set(Array.from({ length: 3000 }, () => Storage.uid()));
  assert.equal(ids.size, 3000);
});

test('Storage.importAll: id berbahaya disanitasi, order diresequens', () => {
  const jahat = JSON.stringify({
    projects: [{
      id: '"><img src=x onerror=alert(1)>',
      title: 'Sah',
      chapters: [
        { id: 'c2', title: 'dua', content: '', order: 9 },
        { id: 'c1', title: 'satu', content: '', order: 9 },
        { id: '"><b>', title: 'tiga', content: '', order: 1 }
      ]
    }],
    settings: { lang: 'id' }
  });
  assert.equal(Storage.importAll(jahat), true);
  const p = Storage.getProjects()[0];
  assert.match(p.id, /^[A-Za-z0-9_-]{1,64}$/);
  p.chapters.forEach((c) => assert.match(c.id, /^[A-Za-z0-9_-]{1,64}$/));
  assert.equal(p.chapters.map((c) => c.order).join(','), '1,2,3');
});

test('Storage.importAll menolak bentuk tidak valid', () => {
  assert.throws(() => Storage.importAll('{"projects": "bukan array"}'));
  assert.throws(() => Storage.importAll('bukan json'));
});

test('Storage: snapshot & restoreSnapshot (undo restore)', () => {
  Storage.saveProject({ id: 'asli', title: 'Asli', chapters: [] });
  assert.equal(Storage.hasSnapshot(), true); // dibuat otomatis oleh importAll sebelumnya
  const sebelum = Storage.exportAll();
  Storage.snapshot();
  Storage.deleteProject('asli');
  assert.equal(Storage.getProject('asli'), null);
  assert.equal(Storage.restoreSnapshot(), true);
  assert.equal(Storage.getProject('asli').title, 'Asli');
  assert.equal(Storage.hasSnapshot(), false);
  assert.ok(sebelum.length > 0);
});

test('BUG-07: importAll ABORT bila snapshot gagal (tanpa undo, import dilarang)', () => {
  Storage.save({ projects: [{ id: 'lama', title: 'Lama', chapters: [] }],
    settings: Storage.getSettings() });
  const store = sandbox.localStorage;
  const origSet = store.setItem;
  store.setItem = () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  try {
    assert.throws(
      () => Storage.importAll(JSON.stringify({ projects: [{ id: 'baru', title: 'Baru', chapters: [] }] })),
      (e) => e.code === 'snapshot',
      'snapshot gagal -> import dilempar dengan code "snapshot"');
    Storage.invalidate();
    assert.equal(Storage.getProject('lama').title, 'Lama', 'data lama tidak boleh ditimpa');
    assert.equal(Storage.getProject('baru'), null, 'data masuk tidak boleh setengah masuk');
  } finally {
    store.setItem = origSet;
  }
});

test('Storage.repairPointers: penunjuk rusak diperbaiki', () => {
  Storage.save({ projects: [{ id: 'x', title: 'X', chapters: [{ id: 'c', title: 'C', content: '', order: 1 }] }],
    settings: { ...Storage.getSettings(), lastProject: 'hilang', lastChapter: 'juga-hilang' } });
  const s = Storage.repairPointers();
  assert.equal(s.lastProject, 'x');
  assert.equal(s.lastChapter, null);
});

const seedNovel = () => {
  Storage.saveProject({
    id: 'nov', title: 'Novel Uji', author: 'Aku', chapters: [
      { id: 'b2', title: 'Bab Dua', content: 'Isi dua.', order: 2 },
      { id: 'b1', title: 'Bab Satu', content: 'Kalimat pertama.\n\nSetelah jeda.\n', order: 1 }
    ]
  });
};

test('Exporter.getContent: satu bab vs seluruh novel (urut order, format ikut terbawa)', () => {
  seedNovel();
  const one = Exporter.getContent('chapter', 'nov', 'b1');
  assert.equal(one.title, 'Bab Satu');
  assert.equal(one.author, 'Aku');
  assert.deepEqual(plain(one.sections), [{ heading: null, content: 'Kalimat pertama.\n\nSetelah jeda.\n', format: 'text' }]);

  const all = Exporter.getContent('all', 'nov');
  assert.equal(all.title, 'Novel Uji');
  assert.deepEqual(plain(all.sections.map((s) => s.heading)), ['Bab Satu', 'Bab Dua']);
  assert.equal(all.sections[1].content, 'Isi dua.');
  assert.deepEqual(plain(all.sections.map((s) => s.format)), ['text', 'text']);
  assert.equal(Exporter.getContent('chapter', 'nov', 'tidak-ada'), null);
  assert.equal(Exporter.getContent('all', 'tidak-ada'), null);
});

test('Exporter.buildText: dokumen .txt polos — isi persis seperti diketik', () => {
  seedNovel();
  const txt = Exporter.buildText(Exporter.getContent('all', 'nov'));
  assert.equal(txt,
    'Novel Uji\nAku\n' +
    '\n\nBab Satu\n\nKalimat pertama.\n\nSetelah jeda.\n' +
    '\n\nBab Dua\n\nIsi dua.\n');
  assert.doesNotMatch(txt, /[#*_`>]/, 'tidak ada penanda sintaks yang disisipkan');

  const single = Exporter.buildText(Exporter.getContent('chapter', 'nov', 'b2'));
  assert.equal(single, 'Bab Dua\nAku\n\n\nIsi dua.\n', 'satu bab: tanpa judul bab berulang');
});

test('Exporter.buildDocxChildren: paragraf polos, judul bab jadi Heading 1, jeda jadi spasi', () => {
  class Paragraph { constructor(o) { Object.assign(this, o); } }
  class TextRun { constructor(o) { Object.assign(this, o); } }
  const lib = {
    Paragraph, TextRun,
    HeadingLevel: { HEADING_1: 'H1' },
    AlignmentType: { CENTER: 'center', JUSTIFIED: 'both' },
    convertInchesToTwip: (n) => n * 1440
  };
  seedNovel();
  const kids = Exporter.buildDocxChildren(Exporter.getContent('all', 'nov'), lib);
  const texts = kids.map((p) => (p.children || []).map((r) => r.text).join(''));
  assert.deepEqual(plain(texts.filter(Boolean)), ['Novel Uji', 'Aku', 'Bab Satu', 'Kalimat pertama.', 'Setelah jeda.', 'Bab Dua', 'Isi dua.']);
  const h1 = kids.filter((p) => p.heading === 'H1');
  assert.equal(h1.length, 2);
  assert.ok(h1.every((p) => p.pageBreakBefore === true), 'tiap bab mulai di halaman baru');
  const jeda = kids.find((p) => texts[kids.indexOf(p)] === 'Setelah jeda.');
  assert.ok(jeda.spacing.before > 0, 'baris kosong -> jarak ekstra');
  assert.equal(jeda.children[0].bold, undefined, 'tidak ada format inline');

  // Satu bab: paragraf pertama pindah halaman setelah halaman judul
  const one = Exporter.buildDocxChildren(Exporter.getContent('chapter', 'nov', 'b2'), lib);
  const first = one.find((p) => (p.children || []).some((r) => r.text === 'Isi dua.'));
  assert.equal(first.pageBreakBefore, true);
  assert.equal(one.some((p) => p.heading === 'H1'), false);
});

test('Storage.summarizeData menghitung proyek/bab/kata', () => {
  const s = Storage.summarizeData({
    projects: [{ chapters: [{ content: 'satu dua tiga' }, { content: 'empat' }] }]
  });
  assert.equal(JSON.stringify(s), JSON.stringify({ projects: 1, chapters: 2, words: 4 }));
});

test('Storage.summarizeData: tag HTML tidak dihitung sebagai kata', () => {
  const s = Storage.summarizeData({
    projects: [{ chapters: [{ content: '<p><strong>satu dua</strong> tiga</p>', format: 'html' }] }]
  });
  assert.equal(s.words, 3);
});

/* ================= RichText (editor berformat) ================= */

test('RichText.fromPlainText/toPlainText: putar-balik setia, tanpa penanda', () => {
  const kasus = [
    '',
    'satu baris saja',
    'a\nb\nc',
    'Kalimat pertama.\n\nSetelah jeda.\n',
    '\n\na\n\n\n\nb\n\nc\n'
  ];
  for (const txt of kasus) {
    const html = RichText.fromPlainText(txt);
    assert.doesNotMatch(html, /[<]strong|[<]em|[#*`]/, 'konversi tidak menambah format');
    const back = RichText.toPlainText(html);
    // putar-balik: bentuk kanonik (baris tepi dirapikan, jeda rangkap jadi satu)
    assert.equal(back, RichText.toPlainText(RichText.fromPlainText(back)), `stabil untuk ${JSON.stringify(txt)}`);
  }
  assert.equal(RichText.toPlainText(RichText.fromPlainText('x\n\ny')), 'x\n\ny');
  assert.equal(RichText.toPlainText(RichText.fromPlainText('x\ny')), 'x\ny');
  assert.equal(RichText.fromPlainText('# bukan judul\n**bukan tebal**'),
    '<p># bukan judul</p><p>**bukan tebal**</p>', 'penanda lama tampil sebagai teks biasa');
});

test('RichText.sanitize: allowlist ketat — script/handler/atribut berbahaya dibuang', () => {
  assert.equal(RichText.sanitize('<p onclick="x()">Halo <strong>dunia</strong></p>'),
    '<p>Halo <strong>dunia</strong></p>');
  assert.equal(RichText.sanitize('<script>alert(1)</script><p>aman</p>'), '<p>aman</p>');
  assert.equal(RichText.sanitize('<img src=x onerror=alert(1)><p>aman</p>'), '<p>aman</p>');
  assert.equal(RichText.sanitize('<style>p{color:red}</style><p>aman</p>'), '<p>aman</p>');
  assert.equal(RichText.sanitize('<a href="javascript:1">tautan</a>'), '<p>tautan</p>', 'tautan dilumat jadi teks');
  assert.equal(RichText.sanitize('<div><b>bal</b> <i>mir</i><br>baris dua</div>'),
    '<p><strong>bal</strong> <em>mir</em></p><p>baris dua</p>', 'tag dinormalkan ke model');
  assert.equal(RichText.sanitize('<p>a</p><p> </p><p>b</p>'), '<p>a</p><p class="gap">b</p>',
    'paragraf kosong = jeda');
  assert.equal(RichText.sanitize('<hr>'), '<p class="scene">* * *</p>', 'garis = jeda adegan');
  assert.equal(RichText.sanitize('<h3>Judul</h3>'), '<h2>Judul</h2>', 'judul diratakan ke satu tingkat');
  assert.equal(RichText.sanitize('<blockquote><p>satu</p><p>dua</p></blockquote>'),
    '<blockquote>satu</blockquote><blockquote>dua</blockquote>', 'kutipan berparagraf diratakan');
  assert.equal(RichText.sanitize('<p>&lt;b&gt;literal&lt;/b&gt;</p>'), '<p>&lt;b&gt;literal&lt;/b&gt;</p>',
    'tag yang diketik sebagai teks tetap teks');
});

test('RichText.toPlainText: jeda antar-blok (judul/kutipan/jeda adegan)', () => {
  assert.equal(
    RichText.toPlainText('<h2>Judul</h2><p>Isi.</p><p class="gap">Lagi.</p><p class="scene">* * *</p><blockquote>Kutip.</blockquote><p>Penutup.</p>'),
    'Judul\n\nIsi.\n\nLagi.\n\n* * *\n\nKutip.\n\nPenutup.'
  );
  assert.equal(RichText.wordCount('<p><strong>satu</strong> dua — tiga.</p>', 'html'), 3);
  assert.equal(RichText.wordCount('satu dua empat', 'text'), 3);
});

test('Exporter.buildText: isi html dilumat jadi teks polos', () => {
  Storage.saveProject({
    id: 'nov2', title: 'Dua', author: '', chapters: [
      { id: 'h1', title: 'Bab HTML', format: 'html', content: '<p>Kalimat <strong>penting</strong>.</p><p class="gap">Setelah jeda.</p>', order: 1 },
      { id: 't1', title: 'Bab Teks', content: 'polos saja', order: 2 }
    ]
  });
  const txt = Exporter.buildText(Exporter.getContent('all', 'nov2'));
  assert.equal(txt,
    'Dua\n' +
    '\n\nBab HTML\n\nKalimat penting.\n\nSetelah jeda.\n' +
    '\n\nBab Teks\n\npolos saja\n');
  assert.doesNotMatch(txt, /strong|class=|<>/);
});

test('Exporter.buildDocxChildren: run berformat (bold/italics) dari isi html', () => {
  class Paragraph { constructor(o) { Object.assign(this, o); } }
  class TextRun { constructor(o) { Object.assign(this, o); } }
  const lib = {
    Paragraph, TextRun,
    HeadingLevel: { HEADING_1: 'H1', HEADING_2: 'H2' },
    AlignmentType: { CENTER: 'center', JUSTIFIED: 'both' },
    convertInchesToTwip: (n) => n * 1440
  };
  const data = {
    title: 'X', author: '',
    sections: [{
      heading: null, format: 'html',
      content: '<p>Kata <strong>bal</strong> dan <em>mir</em>.</p><h2>Sub</h2><p class="scene">* * *</p><blockquote>Kutip.</blockquote>'
    }]
  };
  const kids = Exporter.buildDocxChildren(data, lib);
  const isi = kids.find((p) => (p.children || []).some((r) => r.text === 'Kata '));
  assert.ok(isi, 'paragraf isi ada');
  const runs = isi.children;
  assert.equal(runs.find((r) => r.text === 'bal').bold, true, 'bold terbawa ke docx');
  assert.equal(runs.find((r) => r.text === 'mir').italics, true, 'italics terbawa ke docx');
  assert.equal(runs.find((r) => r.text === 'bal').italics, undefined);
  const sub = kids.find((p) => p.heading === 'H2');
  assert.ok(sub, 'subjudul jadi Heading 2');
  const scene = kids.find((p) => p.alignment === 'center' && (p.children || []).some((r) => r.text === '* * *'));
  assert.ok(scene, 'jeda adegan rata tengah');
  const quote = kids.find((p) => p.indent && p.indent.left > 0 && (p.children || []).some((r) => r.text === 'Kutip.'));
  assert.ok(quote, 'kutipan menjorok masuk');
});

test('BUG-09: spasi/baris baru antar tag blok BUKAN jeda palsu', () => {
  // newline pada hasil tempel Word/Google Docs dulu jadi class="gap"
  assert.equal(RichText.sanitize('<p>a</p>\n\n<p>b</p>'), '<p>a</p><p>b</p>');
  assert.equal(RichText.sanitize('<p>a</p>\n<p>b</p>'), '<p>a</p><p>b</p>');
  assert.equal(RichText.sanitize('<p>a</p>\n \n<p>b</p>'), '<p>a</p><p>b</p>');
  assert.equal(RichText.sanitize('  \n <p>a</p>'), '<p>a</p>', 'spasi awal tidak jadi jeda');
  assert.equal(RichText.sanitize('<h2>Judul</h2>\n\n<p>isi</p>'), '<h2>Judul</h2><p>isi</p>');
  // spasi di dalam satu blok tetap dipertahankan
  assert.equal(RichText.sanitize('<p>a <strong>b</strong> c</p>'), '<p>a <strong>b</strong> c</p>');
  // jeda yang sesungguhnya (paragraf kosong / class eksplisit) tetap hidup
  assert.equal(RichText.sanitize('<p>a</p><p><br></p><p>b</p>'), '<p>a</p><p class="gap">b</p>');
  assert.equal(RichText.sanitize('<p>a</p>\n\n<p class="gap">b</p>'), '<p>a</p><p class="gap">b</p>');
});

test('BUG-11: RichText.domText menghitung kata tanpa parse ulang dokumen', () => {
  const el = sandbox.document.createElement('div');
  el.innerHTML = '<p>Halo <strong>dunia</strong>.</p><p>Kedua</p>';
  assert.equal(RichText.domText(el), 'Halo  dunia . Kedua ');
  assert.equal(TextUtil.countWords(RichText.domText(el)), 3); // Halo + dunia + Kedua
  // nbsp (indent pengguna) tidak dihitung sebagai kata
  const ind = sandbox.document.createElement('p');
  ind.textContent = '\u00a0\u00a0Halo';
  assert.equal(TextUtil.countWords(RichText.domText(ind)), 1);
  assert.equal(RichText.domText(null), '');
});

/* ---- Regresi audit ulang (BUGS.md: B-02, B-03, B-04) ---- */

test('B-02: draf darurat benar-benar ditulis, dibaca, lalu dibersihkan', () => {
  assert.equal(Storage.saveDraft('<p>tulisan darurat</p>'), true, 'tulis draf sukses');
  assert.equal(Storage.hasDraft(), true, 'draf terdeteksi (tombol pulihkan muncul)');
  const d = Storage.takeDraft();
  assert.equal(d && d.html, '<p>tulisan darurat</p>', 'isi draf kembali utuh');
  assert.equal(Storage.hasDraft(), false, 'draf sekali pakai');
  assert.equal(Storage.takeDraft(), null);
});

test('B-03: id kembar dari berkas cadangan di-dedupe (butir kedua tetap terbuka)', () => {
  const backup = JSON.stringify({ projects: [
    { id: 'dupx', title: 'Duplikat A', chapters: [
      { id: 'ca', title: 'C1', content: '<p>a</p>', format: 'html', order: 1 }] },
    { id: 'dupx', title: 'Duplikat B', chapters: [
      { id: 'cb', title: 'C2', content: '<p>b</p>', format: 'html', order: 1 }] },
    { id: 'dupy', title: 'Duplikat C', chapters: [
      { id: 'cd', title: 'C3', content: '<p>c</p>', format: 'html', order: 1 },
      { id: 'cd', title: 'C4', content: '<p>d</p>', format: 'html', order: 2 }] }
  ], settings: {} });
  assert.equal(Storage.importAll(backup), true);

  const byTitle = (t) => Storage.getProjects().find(p => p.title === t);
  const a = byTitle('Duplikat A'), b = byTitle('Duplikat B');
  assert.notEqual(a.id, b.id, 'id proyek kembar jadi unik');
  assert.equal(Storage.getProject(b.id).title, 'Duplikat B', 'proyek kedua bisa dibuka lewat id-nya');

  const c = byTitle('Duplikat C');
  assert.equal(c.chapters.length, 2, 'tidak ada bab yang hilang');
  assert.equal(new Set(c.chapters.map(ch => ch.id)).size, 2, 'id bab kembar dalam satu proyek jadi unik');
  assert.deepEqual(plain(c.chapters.map(ch => ch.title)).sort(), ['C3', 'C4']);
});

test('B-04: hitung kata dialog restore = hitungan aplikasi (entitas & tanda baca lepas)', () => {
  const sum = (content) => Storage.summarizeData({ projects: [{ chapters: [{ content }] }] }).words;
  const app = (content) => RichText.wordCount(content, 'html');

  assert.equal(sum('<p>—</p>'), 0, 'tanda baca yang berdiri sendiri bukan kata');
  assert.equal(sum('<p>a &amp; b</p>'), 2, 'entitas HTML tidak dihitung sebagai kata');
  assert.equal(sum('<p>Halo <strong>dunia</strong>.</p>'), 2);
  for (const c of ['<p>—</p>', '<p>a &amp; b</p>', '<p>Halo <strong>dunia</strong>.</p>', '<p>&lt;tag&gt;</p>']) {
    assert.equal(sum(c), app(c), `ringkasan harus sama dengan aplikasi untuk ${c}`);
  }
});

/* ================= Ilustrasi (gambar ilustrasi tokoh/karakter) ================= */

/* PNG 1x1 yang sah — cukup untuk menguji alur tanpa berkas sungguhan. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

test('ImageUtil.safeSrc: allowlist ketat — hanya data URL gambar & http(s)', () => {
  assert.equal(ImageUtil.safeSrc(PNG), PNG);
  assert.equal(ImageUtil.safeSrc('https://example.com/tokoh.jpg'), 'https://example.com/tokoh.jpg');
  assert.equal(ImageUtil.safeSrc('javascript:alert(1)'), '');
  assert.equal(ImageUtil.safeSrc('vbscript:msgbox(1)'), '');
  assert.equal(ImageUtil.safeSrc('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.equal(ImageUtil.safeSrc('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), '', 'SVG bisa bawa skrip — ditolak');
  assert.equal(ImageUtil.safeSrc('data:image/png;base64,****'), '');
  assert.equal(ImageUtil.safeSrc(''), '');
  assert.equal(ImageUtil.safeSrc(null), '');
});

test('ImageUtil: isImageFile, fit, dan bytesOf', () => {
  const f = (name, type) => ({ name, type, size: 10 });
  assert.equal(ImageUtil.isImageFile(f('a.png', 'image/png')), true);
  assert.equal(ImageUtil.isImageFile(f('a.JPG', 'image/jpeg')), true);
  assert.equal(ImageUtil.isImageFile(f('a.svg', 'image/svg+xml')), false);
  assert.equal(ImageUtil.isImageFile(f('a.txt', 'text/plain')), false);
  assert.equal(ImageUtil.isImageFile(f('a.png', '')), true, 'tanpa MIME: ekstensi dipakai');
  assert.equal(ImageUtil.isImageFile(null), false);

  assert.deepEqual(plain(ImageUtil.fit(4000, 2000, 1000)), { width: 1000, height: 500 });
  assert.deepEqual(plain(ImageUtil.fit(400, 200, 1000)), { width: 400, height: 200 }, 'tidak pernah membesar');
  assert.deepEqual(plain(ImageUtil.fit(0, 0, 800)), { width: 800, height: 800 });
  assert.equal(ImageUtil.bytesOf('data:image/png;base64,' + 'A'.repeat(4000)), 3000);
  assert.equal(ImageUtil.bytesOf(''), 0);
});

test('ImageUtil.docxImage: data URL -> byte + ukuran yang muat di halaman', () => {
  const shot = ImageUtil.docxImage(PNG, 1200, 800, 500, 680);
  assert.ok(shot, 'gambar data URL bisa diekspor');
  assert.equal(shot.type, 'png');
  assert.equal(shot.width, 500);
  assert.equal(shot.height, 333);
  assert.ok(shot.data && shot.data.length > 0, 'byte gambar ikut');
  // gambar kecil tidak diperbesar
  const kecil = ImageUtil.docxImage(PNG, 60, 40, 500, 680);
  assert.equal(kecil.width, 60);
  assert.equal(kecil.height, 40);
  // byte hasil decode = ukuran asli berkas (PNG 1x1 ini 70 byte)
  assert.equal(ImageUtil.docxImage(PNG, 1200, 800, 500, 680).data.length, 70);
  // tautan luar tidak diunduh saat ekspor -> keterangan saja
  assert.equal(ImageUtil.docxImage('https://example.com/a.png', 100, 100, 500, 680), null);
});

test('RichText: blok ilustrasi (figure) tersimpan utuh — src, ukuran, keterangan', () => {
  const html = '<figure class="fig-l"><img src="' + PNG + '" alt="Nyai" width="1200" height="800">' +
    '<figcaption>Nyai Ontosoroh</figcaption></figure>';
  assert.equal(RichText.sanitize(html), html, 'bentuk kanonik stabil (round-trip)');
  const [b] = RichText.blocks(html);
  assert.equal(b.tag, 'figure');
  assert.equal(b.src, PNG);
  assert.equal(b.alt, 'Nyai');
  assert.equal(b.caption, 'Nyai Ontosoroh');
  assert.equal(b.size, 'l');
  assert.equal(b.width, 1200);
  assert.equal(b.height, 800);
});

test('RichText: ukuran tak dikenal -> sedang; <img> lepas jadi blok ilustrasi', () => {
  assert.equal(RichText.sanitize('<figure class="fig-aneh"><img src="' + PNG + '"></figure>'),
    '<figure class="fig-m"><img src="' + PNG + '" alt=""></figure>');
  assert.equal(RichText.sanitize('<p>teks</p><img src="' + PNG + '" alt="Tokoh">'),
    '<p>teks</p><figure class="fig-m"><img src="' + PNG + '" alt="Tokoh"></figure>');
  // keterangan dipangkas & dirapikan
  assert.equal(RichText.sanitize('<figure><img src="' + PNG + '"><figcaption>  Minke\n  Annelis  </figcaption></figure>'),
    '<figure class="fig-m"><img src="' + PNG + '" alt="Minke Annelis"><figcaption>Minke Annelis</figcaption></figure>');
});

test('RichText: src gambar berbahaya dibuang, teks keterangan diselamatkan', () => {
  assert.equal(RichText.sanitize('<img src="javascript:alert(1)" alt="tokoh">'), '<p>tokoh</p>');
  assert.equal(RichText.sanitize('<figure><img src="x" onerror="alert(1)"><figcaption>Minke</figcaption></figure>'),
    '<p>Minke</p>', 'teks keterangan tidak ikut lenyap bersama gambar');
  assert.equal(RichText.sanitize('<figure><img src="data:text/html;base64,PHNjcmlwdD4="></figure>'), '');
  assert.equal(RichText.sanitize('<p>aman</p><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">'), '<p>aman</p>');
  // atribut berbahaya pada gambar yang sah pun tidak pernah ikut tersimpan
  assert.equal(RichText.sanitize('<img src="' + PNG + '" onerror="alert(1)" onload="x()" alt="a">'),
    '<figure class="fig-m"><img src="' + PNG + '" alt="a"></figure>');
  // teks yang diketik sebagai alt tetap teks
  assert.equal(RichText.sanitize('<figure><img src="' + PNG + '" alt="&quot;&lt;b&gt;&quot;">' +
    '<figcaption>&lt;b&gt;</figcaption></figure>'),
    '<figure class="fig-m"><img src="' + PNG + '" alt="&quot;&lt;b&gt;&quot;"><figcaption>&lt;b&gt;</figcaption></figure>');
});

test('BUG-03: <figure> src tidak aman -> sisa isi figure tidak ikut hilang', () => {
  // caption diselamatkan (perilaku lama) — SEKARANG sisa isi ikut selamat
  assert.equal(
    RichText.sanitize('<p>sebelum</p><figure class="fig-m"><img src="javascript:alert(1)" alt="">' +
      '<figcaption>tokoh A</figcaption><p>teks lanjutan di dalam figure</p></figure><p>sesudah</p>'),
    '<p>sebelum</p><p>tokoh A</p><p>teks lanjutan di dalam figure</p><p>sesudah</p>',
    'teks di dalam figure ikut diselamatkan ketika gambarnya dibuang');
  // tanpa caption: sisa isi tetap menjadi paragraf
  assert.equal(
    RichText.sanitize('<figure><img src="javascript:alert(1)"><p>hanya sisa</p></figure>'),
    '<p>hanya sisa</p>');
  // jalur src aman tetap seperti semula (tidak terdampak)
  assert.equal(
    RichText.sanitize('<figure class="fig-m"><img src="' + PNG + '"><figcaption>T</figcaption><p>sisa</p></figure>'),
    '<figure class="fig-m"><img src="' + PNG + '" alt="T"><figcaption>T</figcaption></figure><p>sisa</p>');
});

test('RichText.toPlainText: ilustrasi jadi baris keterangan (ekspor .txt)', () => {
  assert.equal(
    RichText.toPlainText('<p>Prosa.</p><figure class="fig-m"><img src="' + PNG + '">' +
      '<figcaption>Nyai Ontosoroh</figcaption></figure><p>Lanjut.</p>'),
    'Prosa.\n\nNyai Ontosoroh\n\nLanjut.');
  // tanpa keterangan: tidak meninggalkan baris kosong sisa
  assert.equal(RichText.toPlainText('<p>Prosa.</p><figure><img src="' + PNG + '"></figure><p>Lanjut.</p>'),
    'Prosa.\nLanjut.');
  assert.equal(RichText.wordCount('<figure><img src="' + PNG + '"><figcaption>Minke</figcaption></figure>', 'html'), 1);
});

test('RichText: operasi blok tidak pernah merusak ilustrasi', () => {
  // figure bukan blok teks: indent/judul/kutipan tidak menyentuhnya
  const el = sandbox.document.createElement('div');
  el.innerHTML = '<figure><img src="' + PNG + '"><figcaption>Minke</figcaption></figure>';
  assert.equal(RichText.blocks(el.innerHTML).length, 1);
  assert.equal(RichText.sanitize(el.innerHTML).indexOf('<figure'), 0);
  // dan tidak pernah ada innerHTML yang menyisipkan skrip saat dibangun ulang
  const host = sandbox.document.createElement('div');
  host.appendChild(RichText.buildNodes(host, RichText.blocks(
    '<figure><img src="' + PNG + '" alt="a"><figcaption>Minke</figcaption></figure>')));
  const fig = host.querySelector('figure');
  assert.ok(fig && fig.querySelector('img'), 'node figure dibangun ulang');
  assert.equal(fig.querySelector('img').getAttribute('src'), PNG);
  assert.equal(fig.querySelector('img').getAttribute('contenteditable'), 'false', 'gambar utuh: satu hapus = satu ilustrasi');
  assert.equal(fig.querySelector('figcaption').textContent, 'Minke');
});

test('RichText: ilustrasi tidak hilang saat diserialisasi (regresi bug serialize)', () => {
  const html = '<p>Prosa.</p><figure class="fig-s"><img src="' + PNG + '" alt="Nyai" width="900" height="600">' +
    '<figcaption>Nyai Ontosoroh</figcaption></figure><p>Lanjut.</p>';
  assert.equal(RichText.sanitize(html), html, 'round-trip kanonik utuh (img + keterangan + ukuran)');
  // ilustrasi di awal/akhir dokumen pun tetap hidup
  assert.equal(RichText.sanitize('<figure><img src="' + PNG + '"></figure>'),
    '<figure class="fig-m"><img src="' + PNG + '" alt=""></figure>');
});

test('RichText.removeFigure: ilustrasi terhapus, paragraf lanjutan kosong ikut dibuang', () => {
  // pola hasil insertFigure: figure + paragraf lanjutan kosong
  const el = sandbox.document.createElement('div');
  el.innerHTML = '<p>Sebelum.</p><figure class="fig-m"><img src="' + PNG + '" alt="Tokoh">' +
    '<figcaption>Tokoh</figcaption></figure><p><br></p><p>Sesudah.</p>';
  const fig = el.querySelector('figure');
  assert.equal(RichText.removeFigure(el, fig), true);
  assert.equal(el.innerHTML, '<p>Sebelum.</p><p>Sesudah.</p>', 'tanpa jeda "hantu"');
  assert.equal(RichText.removeFigure(el, fig), false, 'tidak ada yang bisa dihapus');

  // paragraf SETELAH figure yang berisi teks TIDAK ikut terhapus
  const el2 = sandbox.document.createElement('div');
  el2.innerHTML = '<figure><img src="' + PNG + '"></figure><p>Teks penting.</p>';
  assert.equal(RichText.removeFigure(el2, el2.querySelector('figure')), true);
  assert.equal(el2.innerHTML, '<p>Teks penting.</p>');

  // ilustrasi satu-satunya: editor jadi kosong (placeholder siap tampil)
  const el3 = sandbox.document.createElement('div');
  el3.innerHTML = '<figure><img src="' + PNG + '"></figure><p><br></p>';
  assert.equal(RichText.removeFigure(el3, el3.querySelector('figure')), true);
  assert.equal(el3.innerHTML, '');
  assert.equal(el3.getAttribute('data-empty'), 'true');

  // bukan ilustrasi / di luar editor -> ditolak apa adanya
  const el4 = sandbox.document.createElement('div');
  el4.innerHTML = '<p>bukan figure</p>';
  assert.equal(RichText.removeFigure(el4, el4.querySelector('p')), false);
  const luar = sandbox.document.createElement('div');
  assert.equal(RichText.removeFigure(el4, luar), false);
});

test('RichText.replaceFigureImage: src & ukuran diperbarui di tempat, keterangan & kelas tetap', () => {
  const el = sandbox.document.createElement('div');
  el.innerHTML = '<figure class="fig-s"><img src="' + PNG + '" alt="Minke" width="100" height="100">' +
    '<figcaption>Minke</figcaption></figure>';
  const fig = el.querySelector('figure');
  const newSrc = 'data:image/jpeg;base64,' + 'Q'.repeat(120);
  assert.equal(RichText.replaceFigureImage(el, fig, { src: newSrc, width: 640, height: 480 }), true);
  const img = el.querySelector('figure img');
  assert.equal(img.getAttribute('src'), newSrc);
  assert.equal(img.getAttribute('width'), '640');
  assert.equal(img.getAttribute('height'), '480');
  assert.equal(fig.className, 'fig-s', 'kelas ukuran dipertahankan');
  assert.equal(fig.querySelector('figcaption').textContent, 'Minke', 'keterangan dipertahankan');
  // hasil tetap lolos sanitasi (round-trip)
  assert.ok(RichText.sanitize(el.innerHTML).includes(newSrc), 'src baru tersimpan lewat sanitasi');

  // src berbahaya ditolak — gambar lama tidak berubah
  assert.equal(RichText.replaceFigureImage(el, fig, { src: 'javascript:alert(1)' }), false);
  assert.equal(RichText.replaceFigureImage(el, fig, { src: 'data:image/svg+xml;base64,PHN2Zz4=' }), false);
  assert.equal(el.querySelector('figure img').getAttribute('src'), newSrc);

  // ukuran tak dikenal -> atribut width/height dibuang (rasio CSS yang mengatur)
  assert.equal(RichText.replaceFigureImage(el, fig, { src: PNG }), true);
  assert.equal(el.querySelector('figure img').hasAttribute('width'), false);
  assert.equal(el.querySelector('figure img').hasAttribute('height'), false);

  // bukan figure / figure tanpa img -> ditolak
  const el4 = sandbox.document.createElement('div');
  el4.innerHTML = '<p>bukan figure</p>';
  assert.equal(RichText.replaceFigureImage(el4, el4.querySelector('p'), { src: PNG }), false);
  const el5 = sandbox.document.createElement('div');
  el5.innerHTML = '<figure></figure>';
  assert.equal(RichText.replaceFigureImage(el5, el5.querySelector('figure'), { src: PNG }), false);
});

test('RichText.figureFromNode: mencari ilustrasi leluhur dari node mana pun', () => {
  const el = sandbox.document.createElement('div');
  el.innerHTML = '<p>Prosa.</p><figure class="fig-m"><img src="' + PNG + '" alt="a">' +
    '<figcaption>Minke</figcaption></figure>';
  const fig = el.querySelector('figure');
  assert.equal(RichText.figureFromNode(fig, el), fig);
  assert.equal(RichText.figureFromNode(fig.querySelector('img'), el), fig);
  assert.equal(RichText.figureFromNode(fig.querySelector('figcaption').firstChild, el), fig);
  assert.equal(RichText.figureFromNode(el.querySelector('p'), el), null, 'paragraf biasa bukan ilustrasi');
});

test('Exporter.buildText: ilustrasi jadi baris keterangan di .txt', () => {
  Storage.saveProject({
    id: 'gbr', title: 'Bergambar', author: '', chapters: [{
      id: 'g1', title: 'Bab Satu', format: 'html', order: 1,
      content: '<p>Prosa.</p><figure class="fig-m"><img src="' + PNG + '" alt="">' +
        '<figcaption>Nyai Ontosoroh</figcaption></figure><p>Lanjut.</p>'
    }]
  });
  const txt = Exporter.buildText(Exporter.getContent('all', 'gbr'));
  assert.match(txt, /Prosa\.\n\nNyai Ontosoroh\n\nLanjut\./);
  assert.doesNotMatch(txt, /data:image|<figure|<img/, 'berkas .txt polos tanpa sisa HTML');
});

test('Exporter.buildDocxChildren: ilustrasi ikut ke DOCX (gambar + keterangan)', () => {
  class Paragraph { constructor(o) { Object.assign(this, o); } }
  class TextRun { constructor(o) { Object.assign(this, o); } }
  class ImageRun { constructor(o) { Object.assign(this, o); this.__image = true; } }
  const lib = {
    Paragraph, TextRun, ImageRun,
    HeadingLevel: { HEADING_1: 'H1', HEADING_2: 'H2' },
    AlignmentType: { CENTER: 'center', JUSTIFIED: 'both' },
    convertInchesToTwip: (n) => n * 1440
  };
  const data = {
    title: 'X', author: '',
    sections: [{
      heading: null, format: 'html',
      content: '<p>Prosa.</p><figure class="fig-s"><img src="' + PNG + '" width="1200" height="800">' +
        '<figcaption>Nyai Ontosoroh</figcaption></figure><p>Lanjut.</p>'
    }]
  };
  const kids = Exporter.buildDocxChildren(data, lib);
  const img = kids.find(p => (p.children || []).some(c => c && c.__image));
  assert.ok(img, 'gambar disematkan di paragraf sendiri');
  assert.equal(img.children[0].type, 'png');
  assert.equal(img.children[0].transformation.width, 500);
  assert.equal(img.children[0].transformation.height, 333);
  assert.ok(img.children[0].data.length > 0, 'byte gambar ikut');
  const cap = kids.find(p => (p.children || []).some(r => r.text === 'Nyai Ontosoroh'));
  assert.ok(cap, 'keterangan jadi paragraf sendiri');
  assert.equal(cap.alignment, 'center');

  // Tanpa dukungan gambar (pustaka lama): ekspor tetap jalan, keterangan saja
  const plain2 = Exporter.buildDocxChildren(data, { ...lib, ImageRun: undefined });
  const texts = plain2.map(p => (p.children || []).map(r => r.text).join('')).filter(Boolean);
  assert.deepEqual(plain(texts), ['X', 'Prosa.', 'Nyai Ontosoroh', 'Lanjut.']);
  assert.equal(plain2.some(p => (p.children || []).some(c => c && c.__image)), false);

  // Gambar dari tautan luar tidak diunduh -> tidak pernah merusak berkas
  const remote = Exporter.buildDocxChildren({
    title: 'X', author: '',
    sections: [{ heading: null, format: 'html', content: '<figure><img src="https://example.com/a.png"><figcaption>Minke</figcaption></figure>' }]
  }, lib);
  assert.equal(remote.some(p => (p.children || []).some(c => c && c.__image)), false);
  assert.ok(remote.some(p => (p.children || []).some(r => r.text === 'Minke')));
});

test('RichText: teks asing di dalam <figure> tidak ikut hilang (Enter di keterangan)', () => {
  // Browser bisa menyisipkan <p> di dalam figure saat Enter ditekan pada
  // keterangan — tulisan itu harus selamat, bukan lenyap bersama gambar.
  assert.equal(
    RichText.sanitize('<figure><img src="' + PNG + '"><figcaption>Minke</figcaption><p>tulisan penting</p></figure>'),
    '<figure class="fig-m"><img src="' + PNG + '" alt="Minke"><figcaption>Minke</figcaption></figure>' +
    '<p>tulisan penting</p>');
  // teks lepas di dalam figure pun diselamatkan
  assert.equal(RichText.sanitize('<figure><img src="' + PNG + '">sisa teks</figure>'),
    '<figure class="fig-m"><img src="' + PNG + '" alt=""></figure><p>sisa teks</p>');
});
