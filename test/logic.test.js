/* Uji logika murni (Storage / TextUtil / Exporter) tanpa DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './helpers.mjs';

const { Storage, TextUtil, Exporter, sandbox } = await loadLogic();

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

test('Exporter.getContent: satu bab vs seluruh novel (urut order, tanpa markup)', () => {
  seedNovel();
  const one = Exporter.getContent('chapter', 'nov', 'b1');
  assert.equal(one.title, 'Bab Satu');
  assert.equal(one.author, 'Aku');
  assert.deepEqual(plain(one.sections), [{ heading: null, content: 'Kalimat pertama.\n\nSetelah jeda.\n' }]);

  const all = Exporter.getContent('all', 'nov');
  assert.equal(all.title, 'Novel Uji');
  assert.deepEqual(plain(all.sections.map((s) => s.heading)), ['Bab Satu', 'Bab Dua']);
  assert.equal(all.sections[1].content, 'Isi dua.');
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
