/* Uji logika murni (Storage / Markdown / Exporter) tanpa DOM. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './helpers.mjs';

const { Storage, Markdown, Exporter, sandbox } = await loadLogic();

test('Markdown.countWords tidak menghitung sintaks Markdown', () => {
  assert.equal(Markdown.countWords('# Judul\n\n**tebal** dan ![gambar](x.png) serta `kode`'), 6);
  assert.equal(Markdown.countWords(''), 0);
  assert.equal(Markdown.countWords('   \n\n  '), 0);
  assert.equal(Markdown.countWords('satu dua tiga'), 3);
  assert.equal(Markdown.countWords('- poin satu\n- poin dua'), 4);
  assert.equal(Markdown.countWords('[label](https://contoh.id)'), 1);
  assert.equal(Markdown.countWords('---\n\npemisah adegan'), 2);
  assert.equal(Markdown.countWords('> kutipan yang panjang'), 3);
  assert.equal(Markdown.countWords('```js\nconst a = 1;\n```'), 4);
});

test('Markdown.escapeRawHtml menetralkan tag HTML', () => {
  assert.equal(
    Markdown.escapeRawHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror="alert(1)">'
  );
  assert.equal(Markdown.escapeRawHtml('**tebal** & *miring*'), '**tebal** & *miring*');
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

test('Exporter.parseInlineDocx: bold/italic/code/link/strike', () => {
  class TextRun { constructor(o) { Object.assign(this, o); } }
  sandbox.docx = { TextRun };
  const runs = Exporter.parseInlineDocx('a **b** *c* `d` [e](f) ~~g~~');
  const txt = runs.map((r) => r.text).join('');
  assert.equal(txt, 'a b c d e g');
  assert.equal(runs.find((r) => r.text === 'b').bold, true);
  assert.equal(runs.find((r) => r.text === 'c').italics, true);
  assert.equal(runs.find((r) => r.text === 'd').font, 'Consolas');
  assert.ok(runs.find((r) => r.text === 'e').underline);
  assert.equal(runs.find((r) => r.text === 'g').strike, true);
});

test('Storage.summarizeData menghitung proyek/bab/kata', () => {
  const s = Storage.summarizeData({
    projects: [{ chapters: [{ content: 'satu dua tiga' }, { content: 'empat' }] }]
  });
  assert.equal(JSON.stringify(s), JSON.stringify({ projects: 1, chapters: 2, words: 4 }));
});
