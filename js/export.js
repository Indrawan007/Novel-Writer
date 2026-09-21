/* ============================================
   Export Module — TXT, PDF, DOCX
   Isi bab bisa dua format:
   - 'html' : blok berformat (js/richtext.js) — tebal/miring/judul ikut
     terbawa di PDF/DOCX, dan dilumat jadi teks polos di .txt
   - 'text' : teks polos lama — satu baris = satu paragraf,
     baris kosong = jeda antar-paragraf (lihat js/text.js).
   Catatan keamanan: semua teks pengguna masuk ke DOM lewat textContent
   (bukan innerHTML), node dibangun ulang dari model blok tersanitasi,
   dan <style> ekspor di-scope ke .nw-pdf agar tidak menata UI aplikasi.
   ============================================ */

const Exporter = {
  _libPromises: {},

  /**
   * Ambil konten yang akan diekspor.
   * scope: 'chapter' (satu bab) | 'all' (seluruh novel, urut `order`).
   * Mengembalikan { title, author, sections: [{ heading, content, format }] }
   * — `heading` null untuk ekspor satu bab (judulnya sudah jadi judul dokumen).
   */
  getContent(scope, projectId, chapterId) {
    const proj = Storage.getProject(projectId);
    if (!proj || !proj.chapters?.length) return null;
    const untitled = typeof t === 'function' ? t('untitled') : 'Untitled';
    const sec = (ch) => ({
      heading: undefined,
      content: ch.content || '',
      format: ch.format === 'html' ? 'html' : 'text'
    });

    if (scope === 'chapter') {
      const ch = proj.chapters.find(c => c.id === chapterId);
      if (!ch) return null;
      return {
        title: ch.title || untitled,
        author: proj.author || '',
        sections: [{ ...sec(ch), heading: null }]
      };
    }

    const sorted = [...proj.chapters].sort((a, b) => a.order - b.order);
    return {
      title: proj.title || untitled,
      author: proj.author || '',
      sections: sorted.map(ch => ({ ...sec(ch), heading: ch.title || untitled }))
    };
  },

  /** Download helper (satu-satunya jalur unduh di aplikasi). */
  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * Muat pustaka CDN sekali (promise di-cache, ada timeout).
   * Gagal memuat -> Error dengan code 'lib' agar UI bisa memberi
   * pesan yang tepat ("butuh koneksi internet sekali").
   */
  ensureLib(globalName, url, timeoutMs = 20000) {
    if (typeof window !== 'undefined' && window[globalName]) {
      return Promise.resolve(window[globalName]);
    }
    if (!this._libPromises[globalName]) {
      this._libPromises[globalName] = Promise.race([
        this.loadScript(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
      ])
        .then(() => window[globalName])
        .catch((err) => {
          delete this._libPromises[globalName]; // izinkan percobaan ulang
          const e = new Error(`Gagal memuat pustaka ${globalName}: ${err && err.message}`);
          e.code = 'lib';
          throw e;
        });
    }
    return this._libPromises[globalName];
  },

  /* ---- TXT ---- */

  /**
   * Susun dokumen teks polos (fungsi murni — mudah diuji).
   * Judul & penulis di atas, tiap bab diawali judulnya, dipisah baris kosong.
   * Isi 'text' ditulis persis seperti diketik; isi 'html' dilumat ke teks
   * polos tanpa penanda apa pun (lihat RichText.toPlainText).
   */
  buildText(data) {
    const nl = '\n';
    let out = data.title + nl;
    if (data.author) out += data.author + nl;
    data.sections.forEach(sec => {
      out += nl + nl;
      // Judul bab ikut tertulis (heading null = ekspor satu bab: judulnya
      // sudah jadi judul dokumen di baris pertama)
      if (sec.heading) out += sec.heading + nl + nl;
      const isi = sec.format === 'html'
        ? RichText.toPlainText(sec.content)
        : String(sec.content || '');
      out += isi.replace(/\r\n?/g, nl).replace(/\s+$/, '') + nl;
    });
    return out;
  },

  /** Ekspor teks polos (.txt) */
  toText(scope, projectId, chapterId) {
    const data = this.getContent(scope, projectId, chapterId);
    if (!data) return false;
    const blob = new Blob([this.buildText(data)], { type: 'text/plain;charset=utf-8' });
    this.download(blob, `${this.sanitize(data.title)}.txt`);
    return true;
  },

  /* ---- PDF ---- */

  /** Ekspor PDF (lazy-load html2pdf.js) */
  async toPDF(scope, projectId, chapterId) {
    const data = this.getContent(scope, projectId, chapterId);
    if (!data) return false;

    await this.ensureLib(
      'html2pdf',
      'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
    );

    // Isi: judul bab (h1) + paragraf; node dibangun ulang dari model tersanitasi
    const body = document.createElement('div');
    data.sections.forEach(sec => {
      if (sec.heading) {
        const h = document.createElement('h1');
        h.textContent = sec.heading;
        body.appendChild(h);
      }
      if (sec.format === 'html') RichText.renderInto(body, sec.content);
      else TextUtil.appendParagraphs(sec.content, body);
    });

    const container = document.createElement('div');
    container.className = 'nw-pdf';
    container.setAttribute('aria-hidden', 'true');
    container.style.cssText = `
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.8;
      color: #1a1a1a;
      padding: 10px 0;
      width: 700px;
    `;

    // Gaya di-SCOPE ke .nw-pdf: tidak menata UI aplikasi selama ekspor
    const style = document.createElement('style');
    style.textContent = `
      .nw-pdf h1 { font-size: 18pt; margin-top: 30px; page-break-before: always; }
      .nw-pdf h1:first-of-type { page-break-before: avoid; }
      .nw-pdf h2 { font-size: 13.5pt; margin: 18px 0 6px; page-break-after: avoid; }
      .nw-pdf p { text-indent: 1.5em; text-align: justify; margin: 0.4em 0; }
      .nw-pdf h1 + p, .nw-pdf h2 + p { text-indent: 0; }
      .nw-pdf p.gap { margin-top: 1.4em; }
      .nw-pdf p.scene { text-indent: 0; text-align: center; margin: 1.2em 0; letter-spacing: 0.3em; }
      .nw-pdf blockquote { margin: 0.6em 2em; text-indent: 0; }
      .nw-pdf strong { font-weight: bold; }
      .nw-pdf em { font-style: italic; }
      .nw-pdf-cover { text-align: center; font-family: sans-serif; }
      .nw-pdf-cover h1 { font-size: 24pt; margin-bottom: 6px; }
      .nw-pdf-cover p { color: #666; font-size: 11pt; margin-bottom: 40px; text-indent: 0; text-align: center; }
    `;

    const cover = document.createElement('div');
    cover.className = 'nw-pdf-cover';
    const h1 = document.createElement('h1');
    h1.textContent = data.title;            // textContent = bebas injeksi
    cover.appendChild(h1);
    if (data.author) {
      const p = document.createElement('p');
      p.textContent = data.author;
      cover.appendChild(p);
    }

    container.appendChild(style);
    container.appendChild(cover);
    container.appendChild(body);
    document.body.appendChild(container);

    try {
      await html2pdf().set({
        margin: [20, 18, 20, 18],
        filename: `${this.sanitize(data.title)}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }).from(container).save();
      return true;
    } finally {
      // Selalu bersihkan container, sekalipun ekspor gagal
      if (container.parentNode) container.parentNode.removeChild(container);
    }
  },

  /* ---- DOCX ---- */

  /**
   * Susun daftar Paragraph docx dari konten (fungsi murni — mudah diuji).
   * `lib` = objek docx ({ Paragraph, TextRun, HeadingLevel, AlignmentType, convertInchesToTwip }).
   * Isi 'html' memetakan model blok ke paragraf + TextRun berformat
   * (bold/italics); isi 'text' = satu baris = satu paragraf polos.
   */
  buildDocxChildren(data, lib) {
    const { Paragraph, TextRun, HeadingLevel, AlignmentType, convertInchesToTwip } = lib;
    const children = [];
    const run = (text, opts) => new TextRun({ text: text.replace(/\u00a0/g, ' '), font: 'Georgia', ...opts });

    // ---- Halaman judul ----
    children.push(
      new Paragraph({ spacing: { before: 3000 } }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: data.title, bold: true, size: 52, font: 'Georgia' })]
      })
    );
    if (data.author) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [new TextRun({ text: data.author, size: 26, color: '666666', font: 'Georgia' })]
        })
      );
    }

    // ---- Isi: paragraf pertama setelah halaman judul selalu di halaman baru ----
    let pageBreak = true;
    data.sections.forEach(sec => {
      if (sec.heading) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 480, after: 240 },
          pageBreakBefore: true,
          children: [new TextRun({ text: sec.heading, bold: true, size: 36, font: 'Georgia' })]
        }));
        pageBreak = false;
      }
      const blok = sec.format === 'html'
        ? RichText.blocks(sec.content)
        : TextUtil.paragraphs(sec.content).map(p => ({
            tag: 'p', gap: !!p.gap, scene: false,
            runs: [{ text: p.text, bold: false, italic: false }]
          }));
      blok.forEach(b => {
        const text = (b.runs || []).map(r => r.text).join('');
        const runs = (b.runs || []).map(r => run(r.text, {
          bold: r.bold ? true : undefined,
          italics: r.italic ? true : undefined
        }));
        if (b.tag === 'h2') {
          children.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 360, after: 180 },
            children: [run(text, { bold: true, size: 30 })]
          }));
        } else if (b.tag === 'blockquote') {
          children.push(new Paragraph({
            spacing: { before: 120, after: 120, line: 360 },
            indent: { left: convertInchesToTwip(0.35) },
            children: runs
          }));
        } else if (b.scene) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240 },
            children: [run(text)]
          }));
        } else {
          children.push(new Paragraph({
            spacing: { before: b.gap ? 240 : 0, after: 80, line: 360 },
            indent: { firstLine: convertInchesToTwip(0.5) },
            alignment: AlignmentType.JUSTIFIED,
            pageBreakBefore: pageBreak,
            children: runs
          }));
        }
        pageBreak = false;
      });
    });

    return children;
  },

  /** Ekspor DOCX (lazy-load docx.js) */
  async toDocx(scope, projectId, chapterId) {
    const data = this.getContent(scope, projectId, chapterId);
    if (!data) return false;

    await this.ensureLib('docx', 'https://unpkg.com/docx@8.5.0/build/index.umd.js');

    const { Document, Packer, convertInchesToTwip } = docx;
    const children = this.buildDocxChildren(data, docx);

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: 'Georgia', size: 24 }
          }
        }
      },
      sections: [{
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
              right: convertInchesToTwip(1)
            }
          }
        },
        children
      }]
    });

    const blob = await Packer.toBlob(doc);
    this.download(blob, `${this.sanitize(data.title)}.docx`);
    return true;
  },

  /* ---- Helpers ---- */

  /**
   * Nama file aman: karakter ilegal (termasuk karakter kontrol) diganti "_",
   * spasi dirapikan, panjang dibatasi agar tidak ditolak sistem file.
   */
  sanitize(name) {
    const s = String(name == null ? '' : name)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[<>:"/\\|?*]/g, '_')
      .trim()
      .slice(0, 80)
      .replace(/[.\s]+$/, '');
    return s || 'novel';
  },

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('script load error: ' + src));
      document.head.appendChild(s);
    });
  }
};
