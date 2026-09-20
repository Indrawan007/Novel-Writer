/* ============================================
   Export Module — MD, PDF, DOCX
   Catatan keamanan: semua konten pengguna melewati Markdown.parse()
   (HTML mentah di-escape) + Markdown.sanitizeLinks() sebelum masuk DOM,
   dan <style> ekspor di-scope ke .nw-pdf agar tidak menata UI aplikasi.
   ============================================ */

const Exporter = {
  _libPromises: {},

  /**
   * Ambil konten yang akan diekspor.
   * scope: 'chapter' (satu bab) | 'all' (seluruh novel, urut `order`).
   */
  getContent(scope, projectId, chapterId) {
    const proj = Storage.getProject(projectId);
    if (!proj || !proj.chapters?.length) return null;

    if (scope === 'chapter') {
      const ch = proj.chapters.find(c => c.id === chapterId);
      if (!ch) return null;
      return {
        title: ch.title || (typeof t === 'function' ? t('untitled') : 'Untitled'),
        content: ch.content || '',
        author: proj.author
      };
    }

    const sorted = [...proj.chapters].sort((a, b) => a.order - b.order);
    const full = sorted
      .map(ch => `# ${ch.title || ''}\n\n${ch.content || ''}`)
      .join('\n\n---\n\n');
    return {
      title: proj.title || (typeof t === 'function' ? t('untitled') : 'Untitled'),
      content: full,
      author: proj.author
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

  /** Ekspor Markdown (.md) */
  toMarkdown(scope, projectId, chapterId) {
    const data = this.getContent(scope, projectId, chapterId);
    if (!data) return false;

    const header = `# ${data.title}\n${data.author ? `**${data.author}**\n` : ''}\n---\n\n`;
    const blob = new Blob([header + data.content], {
      type: 'text/markdown;charset=utf-8'
    });
    this.download(blob, `${this.sanitize(data.title)}.md`);
    return true;
  },

  /** Ekspor PDF (lazy-load html2pdf.js) */
  async toPDF(scope, projectId, chapterId) {
    const data = this.getContent(scope, projectId, chapterId);
    if (!data) return false;

    await this.ensureLib(
      'html2pdf',
      'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
    );

    // Konten dirender lewat jalur Markdown yang aman (escape + sanitasi)
    const body = document.createElement('div');
    Markdown.render(data.content, body);

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

    // Gaya di-SCOPE ke .nw-pdf: tidak lagi menata UI aplikasi selama ekspor
    const style = document.createElement('style');
    style.textContent = `
      .nw-pdf h1 { font-size: 18pt; margin-top: 30px; page-break-before: always; }
      .nw-pdf h1:first-of-type { page-break-before: avoid; }
      .nw-pdf h2 { font-size: 14pt; margin-top: 20px; }
      .nw-pdf p { text-indent: 1.5em; text-align: justify; margin: 0.4em 0; }
      .nw-pdf hr { border: none; border-top: 1px solid #ccc; margin: 2em 0; }
      .nw-pdf strong { font-weight: 700; }
      .nw-pdf em { font-style: italic; }
      .nw-pdf blockquote { margin: 1em 0 1em 1.2em; font-style: italic; color: #555; }
      .nw-pdf ul, .nw-pdf ol { margin: 0.6em 0 0.6em 1.4em; }
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

  /** Ekspor DOCX (lazy-load docx.js) */
  async toDocx(scope, projectId, chapterId) {
    const data = this.getContent(scope, projectId, chapterId);
    if (!data) return false;

    await this.ensureLib('docx', 'https://unpkg.com/docx@8.5.0/build/index.umd.js');

    const {
      Document, Paragraph, TextRun, HeadingLevel,
      Packer, AlignmentType, convertInchesToTwip
    } = docx;

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
    children.push(
      new Paragraph({
        children: [new TextRun({ break: 1 })],
        pageBreakBefore: true
      })
    );

    // ---- Isi ----
    const lines = data.content.split('\n');
    let inFence = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Blok kode (``` ... ```) -> paragraf monospace apa adanya
      if (/^```/.test(trimmed)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) {
        children.push(new Paragraph({
          spacing: { after: 0 },
          indent: { left: convertInchesToTwip(0.3) },
          children: [new TextRun({ text: line.replace(/\t/g, '  '), font: 'Consolas', size: 20 })]
        }));
        continue;
      }

      if (!trimmed) {
        children.push(new Paragraph({ spacing: { after: 100 } }));
        continue;
      }

      if (trimmed.startsWith('# ')) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 480, after: 240 },
          pageBreakBefore: true,
          children: this.parseInlineDocx(trimmed.slice(2), { bold: true, size: 36 })
        }));
        continue;
      }

      if (trimmed.startsWith('## ')) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 360, after: 180 },
          children: this.parseInlineDocx(trimmed.slice(3), { bold: true, size: 28 })
        }));
        continue;
      }

      if (/^###\s+/.test(trimmed)) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 300, after: 150 },
          children: this.parseInlineDocx(trimmed.replace(/^###\s+/, ''), { bold: true, size: 24 })
        }));
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [new TextRun({ text: '• • •', color: '999999', size: 24 })]
        }));
        continue;
      }

      // Kutipan (blockquote)
      if (trimmed.startsWith('> ')) {
        children.push(new Paragraph({
          spacing: { before: 120, after: 120 },
          indent: { left: convertInchesToTwip(0.4) },
          children: this.parseInlineDocx(trimmed.slice(2), { italics: true, color: '555555' })
        }));
        continue;
      }

      // Daftar tak berurut
      const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
      if (bullet) {
        children.push(new Paragraph({
          spacing: { after: 60 },
          indent: { left: convertInchesToTwip(0.4), hanging: convertInchesToTwip(0.2) },
          children: [
            new TextRun({ text: '•\t', font: 'Georgia' }),
            ...this.parseInlineDocx(bullet[1])
          ]
        }));
        continue;
      }

      // Daftar berurut (penanda angka dipertahankan sebagai teks)
      const ordered = trimmed.match(/^(\d+[.)])\s+(.*)$/);
      if (ordered) {
        children.push(new Paragraph({
          spacing: { after: 60 },
          indent: { left: convertInchesToTwip(0.4), hanging: convertInchesToTwip(0.25) },
          children: [
            new TextRun({ text: ordered[1] + '\t', font: 'Georgia' }),
            ...this.parseInlineDocx(ordered[2])
          ]
        }));
        continue;
      }

      // Paragraf biasa
      children.push(new Paragraph({
        spacing: { after: 80, line: 360 },
        indent: { firstLine: convertInchesToTwip(0.5) },
        alignment: AlignmentType.JUSTIFIED,
        children: this.parseInlineDocx(trimmed)
      }));
    }

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
   * Tokenizer inline Markdown -> TextRun[] (bold, italic, strike, code, link, gambar).
   * `base` = gaya dasar yang diwarisi setiap run (mis. untuk heading/blockquote).
   */
  parseInlineDocx(text, base) {
    const { TextRun } = docx;
    const b = base || {};
    const mk = (txt, extra) => new TextRun({ text: txt, font: 'Georgia', ...b, ...(extra || {}) });
    const runs = [];
    const re = /!\[(?<imgAlt>[^\]]*)\]\((?<imgUrl>[^)]*)\)|\[(?<linkText>[^\]]*)\]\((?<linkUrl>[^)]*)\)|(?<boldM>\*\*|__)(?<boldText>[\s\S]+?)\k<boldM>|(?<emM>\*|_)(?<emText>[^\s*_][\s\S]*?)\k<emM>|~~(?<strike>[\s\S]+?)~~|`(?<code>[^`]+)`/g;

    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) runs.push(mk(text.slice(last, m.index)));
      const g = m.groups;
      if (g.imgAlt !== undefined) {
        runs.push(mk(g.imgAlt || '', { italics: true, color: '888888' }));
      } else if (g.linkText !== undefined) {
        runs.push(mk(g.linkText, { color: '8A3B2E', underline: {} }));
      } else if (g.boldText !== undefined) {
        runs.push(mk(g.boldText, { bold: true }));
      } else if (g.emText !== undefined) {
        runs.push(mk(g.emText, { italics: true }));
      } else if (g.strike !== undefined) {
        runs.push(mk(g.strike, { strike: true }));
      } else if (g.code !== undefined) {
        runs.push(mk(g.code, { font: 'Consolas' }));
      }
      last = re.lastIndex;
    }
    if (last < text.length) runs.push(mk(text.slice(last)));
    return runs.length ? runs : [mk(text || '')];
  },

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

