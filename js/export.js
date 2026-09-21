/* ============================================
   Export Module — TXT, PDF, DOCX (teks polos)
   Isi bab diperlakukan apa adanya: satu baris = satu paragraf,
   baris kosong = jeda antar-paragraf (lihat js/text.js).
   Catatan keamanan: semua teks pengguna masuk ke DOM lewat textContent
   (bukan innerHTML), dan <style> ekspor di-scope ke .nw-pdf agar tidak
   menata UI aplikasi.
   ============================================ */

const Exporter = {
  _libPromises: {},

  /**
   * Ambil konten yang akan diekspor.
   * scope: 'chapter' (satu bab) | 'all' (seluruh novel, urut `order`).
   * Mengembalikan { title, author, sections: [{ heading, content }] }
   * — `heading` null untuk ekspor satu bab (judulnya sudah jadi judul dokumen).
   */
  getContent(scope, projectId, chapterId) {
    const proj = Storage.getProject(projectId);
    if (!proj || !proj.chapters?.length) return null;
    const untitled = typeof t === 'function' ? t('untitled') : 'Untitled';

    if (scope === 'chapter') {
      const ch = proj.chapters.find(c => c.id === chapterId);
      if (!ch) return null;
      return {
        title: ch.title || untitled,
        author: proj.author || '',
        sections: [{ heading: null, content: ch.content || '' }]
      };
    }

    const sorted = [...proj.chapters].sort((a, b) => a.order - b.order);
    return {
      title: proj.title || untitled,
      author: proj.author || '',
      sections: sorted.map(ch => ({ heading: ch.title || untitled, content: ch.content || '' }))
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
   * Isi bab ditulis persis seperti yang diketik.
   */
  buildText(data) {
    const nl = '\n';
    let out = data.title + nl;
    if (data.author) out += data.author + nl;
    data.sections.forEach(sec => {
      out += nl + nl;
      if (sec.heading) out += sec.heading + nl + nl;
      out += String(sec.content || '').replace(/\r\n?/g, nl).replace(/\s+$/, '') + nl;
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

    // Isi: judul bab (h1) + paragraf teks polos; semuanya lewat textContent
    const body = document.createElement('div');
    data.sections.forEach(sec => {
      if (sec.heading) {
        const h = document.createElement('h1');
        h.textContent = sec.heading;
        body.appendChild(h);
      }
      TextUtil.appendParagraphs(sec.content, body);
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
      .nw-pdf p { text-indent: 1.5em; text-align: justify; margin: 0.4em 0; }
      .nw-pdf h1 + p { text-indent: 0; }
      .nw-pdf p.gap { margin-top: 1.4em; }
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
   */
  buildDocxChildren(data, lib) {
    const { Paragraph, TextRun, HeadingLevel, AlignmentType, convertInchesToTwip } = lib;
    const children = [];

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
      TextUtil.paragraphs(sec.content).forEach(para => {
        children.push(new Paragraph({
          spacing: { before: para.gap ? 240 : 0, after: 80, line: 360 },
          indent: { firstLine: convertInchesToTwip(0.5) },
          alignment: AlignmentType.JUSTIFIED,
          pageBreakBefore: pageBreak,
          children: [new TextRun({ text: para.text, font: 'Georgia' })]
        }));
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
