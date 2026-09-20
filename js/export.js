/* ============================================
   Export Module — MD, PDF, DOCX
   ============================================ */

const Exporter = {
  /**
   * Get content for export
   */
  getContent(scope, projectId, chapterId) {
    const proj = Storage.getProject(projectId);
    if (!proj || !proj.chapters?.length) return null;

    if (scope === 'chapter') {
      const ch = proj.chapters.find(c => c.id === chapterId);
      if (!ch) return null;
      return {
        title: ch.title,
        content: ch.content || '',
        author: proj.author
      };
    }

    // All chapters
    const sorted = [...proj.chapters].sort((a, b) => a.order - b.order);
    const full = sorted
      .map(ch => `# ${ch.title}\n\n${ch.content || ''}`)
      .join('\n\n---\n\n');
    return {
      title: proj.title,
      content: full,
      author: proj.author
    };
  },

  /**
   * Download helper
   */
  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Export as Markdown
   */
  toMarkdown(scope, projectId, chapterId) {
    const data = this.getContent(scope, projectId, chapterId);
    if (!data) return null;

    const header = `# ${data.title}\n${data.author ? `**${data.author}**\n` : ''}\n---\n\n`;
    const blob = new Blob([header + data.content], {
      type: 'text/markdown;charset=utf-8'
    });
    this.download(blob, `${this.sanitize(data.title)}.md`);
    return true;
  },

  /**
   * Export as PDF (lazy-loads html2pdf.js)
   */
  async toPDF(scope, projectId, chapterId) {
    const data = this.getContent(scope, projectId, chapterId);
    if (!data) return null;

    // Lazy load html2pdf
    if (!window.html2pdf) {
      await this.loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
      );
    }

    // Convert markdown to HTML
    const htmlContent = typeof marked !== 'undefined'
      ? marked.parse(data.content)
      : `<pre>${this.escapeHtml(data.content)}</pre>`;

    // Build styled container
    const container = document.createElement('div');
    container.style.cssText = `
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.8;
      color: #1a1a1a;
      padding: 10px 0;
    `;
    container.innerHTML = `
      <h1 style="text-align:center;font-size:24pt;margin-bottom:6px;font-family:sans-serif;">
        ${this.escapeHtml(data.title)}
      </h1>
      ${data.author ? `<p style="text-align:center;color:#666;font-size:11pt;margin-bottom:40px;">${this.escapeHtml(data.author)}</p>` : '<div style="margin-bottom:30px;"></div>'}
      <style>
        h1 { font-size: 18pt; margin-top: 30px; page-break-before: always; }
        h1:first-of-type { page-break-before: avoid; }
        h2 { font-size: 14pt; margin-top: 20px; }
        p { text-indent: 1.5em; text-align: justify; margin: 0.4em 0; }
        hr { border: none; border-top: 1px solid #ccc; margin: 2em 0; }
        strong { font-weight: 700; }
        em { font-style: italic; }
      </style>
      ${htmlContent}
    `;
    document.body.appendChild(container);

    await html2pdf().set({
      margin: [20, 18, 20, 18],
      filename: `${this.sanitize(data.title)}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }).from(container).save();

    document.body.removeChild(container);
    return true;
  },

  /**
   * Export as DOCX (lazy-loads docx.js)
   */
  async toDocx(scope, projectId, chapterId) {
    const data = this.getContent(scope, projectId, chapterId);
    if (!data) return null;

    // Lazy load docx
    if (!window.docx) {
      await this.loadScript(
        'https://unpkg.com/docx@8.5.0/build/index.umd.js'
      );
    }

    const {
      Document, Paragraph, TextRun, HeadingLevel,
      Packer, AlignmentType, TabStopPosition, TabStopType,
      convertInchesToTwip
    } = docx;

    // Parse markdown-ish content into docx paragraphs
    const children = [];

    // Title page
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

    // Content
    const lines = data.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        children.push(new Paragraph({ spacing: { after: 100 } }));
        continue;
      }

      if (trimmed.startsWith('# ')) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 480, after: 240 },
          pageBreakBefore: true,
          children: [new TextRun({ text: trimmed.slice(2), bold: true, size: 36, font: 'Georgia' })]
        }));
        continue;
      }

      if (trimmed.startsWith('## ')) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 360, after: 180 },
          children: [new TextRun({ text: trimmed.slice(3), bold: true, size: 28, font: 'Georgia' })]
        }));
        continue;
      }

      if (trimmed === '---') {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [new TextRun({ text: '• • •', color: '999999', size: 24 })]
        }));
        continue;
      }

      // Normal paragraph with inline bold/italic
      const runs = this.parseInlineDocx(trimmed);
      children.push(new Paragraph({
        spacing: { after: 80, line: 360 },
        indent: { firstLine: convertInchesToTwip(0.5) },
        alignment: AlignmentType.JUSTIFIED,
        children: runs
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

  parseInlineDocx(text) {
    const { TextRun } = docx;
    const runs = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let last = 0, m;

    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) {
        runs.push(new TextRun({ text: text.slice(last, m.index), font: 'Georgia' }));
      }
      if (m[2]) {
        runs.push(new TextRun({ text: m[2], bold: true, font: 'Georgia' }));
      } else if (m[3]) {
        runs.push(new TextRun({ text: m[3], italics: true, font: 'Georgia' }));
      }
      last = regex.lastIndex;
    }
    if (last < text.length) {
      runs.push(new TextRun({ text: text.slice(last), font: 'Georgia' }));
    }
    return runs.length ? runs : [new TextRun({ text, font: 'Georgia' })];
  },

  escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },

  sanitize(name) {
    return name.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim() || 'novel';
  },

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
};