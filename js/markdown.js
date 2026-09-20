/* ============================================
   Markdown — render aman (XSS-safe) + utilitas teks
   Dipakai oleh preview (app.js) dan ekspor PDF (export.js).
   ============================================ */

const Markdown = {

  /**
   * Netralkan HTML mentah SEBELUM di-parse marked.
   * Hanya `<` yang perlu di-escape: tanpa `<`, tag/atribut HTML
   * tidak mungkin terbentuk. Entitas seperti `&amp;` dan sintaks
   * Markdown biasa (bold, italic, heading, list, link) tetap jalan.
   */
  escapeRawHtml(text) {
    return String(text).replace(/</g, '&lt;');
  },

  /**
   * Fallback tanpa marked: escape + ubah baris baru jadi <br>.
   */
  fallbackHtml(text) {
    return this.escapeRawHtml(text).replace(/\n/g, '<br>');
  },

  /**
   * Parse Markdown → HTML aman.
   */
  parse(md) {
    const src = this.escapeRawHtml(md);
    if (typeof marked !== 'undefined') {
      try {
        return marked.parse(src);
      } catch (e) {
        console.warn('Markdown parse error:', e);
      }
    }
    return this.fallbackHtml(md);
  },

  /**
   * Hapus href berbahaya dari hasil render (mis. [x](javascript:...)).
   */
  sanitizeLinks(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    container.querySelectorAll('a[href]').forEach(a => {
      const href = (a.getAttribute('href') || '').trim().toLowerCase();
      if (href.startsWith('javascript:') ||
          href.startsWith('vbscript:') ||
          href.startsWith('data:')) {
        a.removeAttribute('href');
      }
    });
    // Atribut event inline (on*) tidak boleh lolos dari konten impor
    container.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      });
      if (el.hasAttribute('srcdoc')) el.removeAttribute('srcdoc');
    });
  },

  /**
   * Render Markdown ke container (innerHTML + sanitasi).
   */
  render(md, container) {
    if (!container) return;
    container.innerHTML = this.parse(md);
    this.sanitizeLinks(container);
  },

  /**
   * Buang sintaks Markdown → teks polos (untuk hitung kata & ekspor DOCX).
   */
  plainText(md) {
    return String(md == null ? '' : md)
      .replace(/```[\s\S]*?```/g, m => m.replace(/^```|```$/g, '').replace(/[^\S\n]+/g, ' '))
      .replace(/`([^`]*)`/g, '$1')                     // inline code
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')        // gambar -> alt text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')         // link -> label
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')              // heading marker
      .replace(/^\s{0,3}>\s?/gm, '')                   // blockquote marker
      .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')         // list marker
      .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, ' ')    // thematic break (---, ***)
      .replace(/(\*\*|__)([\s\S]+?)\1/g, '$2')         // bold
      .replace(/(\*|_)([^\s*_][\s\S]*?)\1/g, '$2')     // italic
      .replace(/~~([\s\S]+?)~~/g, '$1')                // strikethrough
      .replace(/<\/?[a-z][^>]*>/gi, ' ')               // sisa tag HTML
      .replace(/[|]/g, ' ');                           // pipa tabel
  },

  /**
   * Jumlah kata yang benar-benar ditulis (markup tidak dihitung).
   */
  countWords(md) {
    const text = this.plainText(md).trim();
    if (!text) return 0;
    // Token yang hanya berisi simbol (sisa markup, tanda baca) bukan kata
    return text.split(/\s+/).filter(tok => /[\p{L}\p{N}]/u.test(tok)).length;
  }
};
