/* ============================================
   TextUtil — utilitas teks polos (tanpa sintaks apa pun)
   Apa yang diketik, itulah yang tersimpan dan ditampilkan.
   Dipakai oleh mode baca (app.js), statistik kata, dan ekspor (export.js).
   ============================================ */

const TextUtil = {

  /**
   * Pecah teks menjadi paragraf.
   * - Satu baris berisi = satu paragraf (spasi tepi dirapikan).
   * - Baris kosong di antara paragraf tidak dibuang begitu saja:
   *   paragraf sesudahnya ditandai `gap` (jeda visual, mis. ganti adegan).
   * Mengembalikan: [{ text, gap }]
   */
  paragraphs(text) {
    const out = [];
    let gap = false;
    String(text == null ? '' : text).split(/\r\n|\r|\n/).forEach(line => {
      const s = line.trim();
      if (!s) { if (out.length) gap = true; return; }
      out.push({ text: s, gap });
      gap = false;
    });
    return out;
  },

  /**
   * Tambahkan paragraf sebagai elemen <p> ke container.
   * Memakai textContent, jadi HTML mentah tampil apa adanya (bebas injeksi).
   */
  appendParagraphs(text, container) {
    if (!container || typeof document === 'undefined') return;
    this.paragraphs(text).forEach(para => {
      const p = document.createElement('p');
      if (para.gap) p.className = 'gap';
      p.textContent = para.text;
      container.appendChild(p);
    });
  },
  
  /**
   * Jumlah kata: token yang mengandung huruf/angka.
   * Tanda baca yang berdiri sendiri (mis. "—") tidak dihitung.
   */
  countWords(text) {
    const s = String(text == null ? '' : text).trim();
    if (!s) return 0;
    return s.split(/\s+/).filter(tok => /[\p{L}\p{N}]/u.test(tok)).length;
  }
};
