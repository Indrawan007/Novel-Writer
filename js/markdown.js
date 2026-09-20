/* ============================================
   Markdown — Render aman (XSS-safe)
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
  },

  /**
   * Render Markdown ke container (innerHTML + sanitasi link).
   */
  render(md, container) {
    if (!container) return;
    container.innerHTML = this.parse(md);
    this.sanitizeLinks(container);
  }
};
