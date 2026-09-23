/* ============================================
   ImageUtil — ilustrasi (gambar) untuk isi bab
   Dipakai fitur "Sisipkan Ilustrasi" (panel format) untuk menyematkan
   ilustrasi tokoh/karakter di dalam naskah.

   Prinsip yang sama dengan seluruh aplikasi:
   1. AMAN — src gambar divalidasi ketat (allowlist). Hanya data URL gambar
      (png/jpeg/webp/gif) dan tautan http(s) yang diterima; `javascript:`,
      `data:text/html`, SVG (bisa membawa skrip), dan semacamnya DIBUANG.
      Berkas `image/*` selain keempat tipe di atas (mis. SVG) ditolak.
   2. HEMAT TEMPAT — isi bab tersimpan di localStorage (kuota kecil, ~5 MB).
      Karena itu gambar diperkecil (sisi terpanjang <= MAX_EDGE) dan
      dikompres bertahap sampai muat di TARGET_BYTES; gambar kecil
      (< KEEP_AS_IS) dipakai apa adanya tanpa dikode ulang.
   3. TANPA LAYANAN LUAR — seluruh pemrosesan terjadi di browser (canvas).
      Bila canvas tidak tersedia (lingkungan uji, browser sangat lama),
      berkas tetap diterima apa adanya — bukan kegagalan.
   ============================================ */

const ImageUtil = {

  /* ---- Tipe yang diterima ---- */
  ALLOWED_TYPES: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  ALLOWED_EXT: /\.(png|jpe?g|webp|gif)$/i,
  /* Tipe yang boleh dipakai apa adanya (transparansi tetap terjaga).
     webp sengaja tidak masuk: Word tidak bisa menampilkannya saat ekspor. */
  KEEP_AS_IS_MIME: /^data:image\/(?:png|gif);base64,/i,

  /* ---- Batas ---- */
  MAX_FILE_BYTES: 12 * 1024 * 1024,  // berkas sumber yang masih diterima
  TARGET_BYTES: 320 * 1024,          // batas lunak hasil enkode per ilustrasi
  KEEP_AS_IS: 120 * 1024,            // di bawah ini: pakai berkas apa adanya
  MAX_EDGE: 1280,                    // sisi terpanjang hasil enkode
  MAX_SRC_CHARS: 16 * 1024 * 1024,   // src yang masih wajar disimpan

  /* Urutan kompresi (besar -> kecil): dipakai sampai hasil muat di target. */
  STEPS: [
    { edge: 1280, q: 0.82 },
    { edge: 1100, q: 0.75 },
    { edge: 960, q: 0.68 },
    { edge: 820, q: 0.60 },
    { edge: 680, q: 0.50 }
  ],

  /* src yang diizinkan: data URL gambar (base64) atau tautan http(s). */
  SRC_RE: /^(?:data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s"'<>]+)$/i,
  DATA_RE: /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]*)$/i,

  /* Peta base64 untuk penyandi mandiri (lihat _b64Decode). */
  B64_MAP: (() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const map = {};
    for (let i = 0; i < chars.length; i++) map[chars.charCodeAt(i)] = i;
    return map;
  })(),

  /* ============================================
     VALIDASI
     ============================================ */

  /**
   * Kembalikan `src` bila aman untuk disimpan & dirender; selain itu ''.
   * Catatan: mengembalikan '' (bukan src asal) adalah inti sanitasi —
   * pemanggil lalu membuang gambarnya (lihat js/richtext.js).
   */
  safeSrc(src) {
    const s = String(src == null ? '' : src).trim();
    if (!s || s.length > this.MAX_SRC_CHARS) return '';
    return this.SRC_RE.test(s) ? s : '';
  },

  /** Nama berkas bertipe gambar yang didukung? (type diutamakan, ekstensi cadangan) */
  isImageFile(file) {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    if (type) return this.ALLOWED_TYPES.indexOf(type) >= 0;
    return this.ALLOWED_EXT.test(String(file.name || ''));
  },

  /** Ambil hanya berkas gambar dari FileList (tempel / seret-lepas). */
  imageFiles(list) {
    if (!list) return [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (this.isImageFile(list[i])) out.push(list[i]);
    }
    return out;
  },

  /** Perkiraan ukuran (byte) sebuah data URL — base64 = 4/3 dari byte asal. */
  bytesOf(dataUrl) {
    const s = String(dataUrl == null ? '' : dataUrl);
    const i = s.indexOf(',');
    const payload = i >= 0 ? s.length - i - 1 : s.length;
    return Math.max(0, Math.round(payload * 3 / 4));
  },

  /** Ukuran tampil yang muat di dalam kotak `edge` x `edge` (tidak pernah membesar). */
  fit(width, height, edge) {
    const m = Math.max(16, Math.round(Number(edge) || this.MAX_EDGE));
    let w = Math.round(Number(width) || 0);
    let h = Math.round(Number(height) || 0);
    if (w <= 0 || h <= 0) return { width: m, height: m };
    const k = Math.min(1, m / Math.max(w, h));
    if (k >= 1) return { width: w, height: h };
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
  },

  /* ============================================
     PEMUATAN & PENGKODEAN
     ============================================ */

  _doc() {
    if (typeof document !== 'undefined') return document;
    if (typeof globalThis !== 'undefined' && globalThis.document) return globalThis.document;
    return null;
  },

  /** Baca berkas jadi data URL (FileReader). */
  readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      let FR = (typeof FileReader !== 'undefined') ? FileReader : null;
      if (!FR) {
        const d = this._doc();
        FR = d && d.defaultView ? d.defaultView.FileReader : null;
      }
      if (!FR) { reject(this._err('read')); return; }
      try {
        const r = new FR();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(this._err('read'));
        r.readAsDataURL(file);
      } catch { reject(this._err('read')); }
    });
  },

  /** Muat gambar untuk diukur (null bila gagal / tak tersedia / waktu habis). */
  load(src, timeoutMs) {
    return new Promise((resolve) => {
      const d = this._doc();
      const Img = (typeof Image !== 'undefined') ? Image : (d && d.defaultView ? d.defaultView.Image : null);
      if (!d || !Img) { resolve(null); return; }
      let settled = false;
      let img = null;
      const done = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(val);
      };
      const timer = setTimeout(() => done(null), Math.max(200, Number(timeoutMs) || 5000));
      try {
        img = new Img();
        img.onload = () => done(img.naturalWidth ? img : null);
        img.onerror = () => done(null);
        img.src = src;
        // gambar yang sudah di-cache bisa langsung lengkap
        if (img.complete && img.naturalWidth) done(img);
      } catch { done(null); }
    });
  },

  /** Apakah kompresi lewat canvas mungkin dilakukan? (hasil di-cache) */
  canProcess() {
    if (this._canvasOk != null) return this._canvasOk;
    let ok = false;
    try {
      const d = this._doc();
      const c = d && d.createElement ? d.createElement('canvas') : null;
      const ctx = c && typeof c.getContext === 'function' ? c.getContext('2d') : null;
      ok = !!(ctx && typeof c.toDataURL === 'function');
    } catch { ok = false; }
    this._canvasOk = ok;
    return ok;
  },

  /**
   * Perkecil & kompres gambar ke JPEG secara bertahap sampai muat di target.
   * Mengembalikan null bila canvas tidak tersedia.
   */
  encode(img, width, height) {
    if (!img || !this.canProcess()) return null;
    const d = this._doc();
    if (!d) return null;
    let canvas = null, ctx = null;
    try {
      canvas = d.createElement('canvas');
      ctx = canvas.getContext('2d');
    } catch { return null; }
    if (!ctx) return null;

    let last = null;
    for (const step of this.STEPS) {
      const box = this.fit(width, height, step.edge);
      try {
        canvas.width = box.width;
        canvas.height = box.height;
        ctx.fillStyle = '#ffffff';                       // latar kertas: PNG transparan tidak jadi hitam
        ctx.fillRect(0, 0, box.width, box.height);
        ctx.drawImage(img, 0, 0, box.width, box.height);
        const out = canvas.toDataURL('image/jpeg', step.q);
        if (!out || out.indexOf('data:image/jpeg') !== 0) continue;
        const bytes = this.bytesOf(out);
        last = { src: out, width: box.width, height: box.height, bytes };
        if (bytes <= this.TARGET_BYTES) return last;
      } catch { /* coba langkah berikutnya */ }
    }
    return last;   // terkecil yang berhasil — pemanggil diberi tahu lewat `over`
  },

  /**
   * Berkas gambar -> siap disisipkan.
   * Hasil: { src, width, height, bytes, over }
   *   `over` = true bila hasil di atas TARGET_BYTES (peringatan kuota, bukan gagal).
   * Melempar Error dengan `code`: 'type' | 'size' | 'read'.
   */
  async fromFile(file) {
    if (!this.isImageFile(file)) throw this._err('type');
    const size = Number(file && file.size);
    if (Number.isFinite(size) && size > this.MAX_FILE_BYTES) throw this._err('size');

    const raw = await this.readAsDataUrl(file);
    if (!this.safeSrc(raw)) throw this._err('type');
    const rawBytes = this.bytesOf(raw);

    // Gambar kecil (png/gif) dipakai apa adanya: transparansi & kualitas terjaga.
    const keepAsIs = rawBytes > 0 && rawBytes <= this.KEEP_AS_IS && this.KEEP_AS_IS_MIME.test(raw);
    let img = null, width = 0, height = 0;
    if (this.canProcess()) {
      img = await this.load(raw);
      if (img) { width = img.naturalWidth || 0; height = img.naturalHeight || 0; }
    }
    const plain = { src: raw, width, height, bytes: rawBytes, over: rawBytes > this.TARGET_BYTES };
    if (keepAsIs || !img) return plain;

    const enc = this.encode(img, width, height);
    if (!enc || !this.safeSrc(enc.src)) return plain;
    return { src: enc.src, width: enc.width, height: enc.height, bytes: enc.bytes, over: enc.bytes > this.TARGET_BYTES };
  },

  /* ============================================
     EKSPOR (DOCX)
     ============================================ */

  /** Pecah data URL jadi { mime, b64 } — null bila bukan data URL gambar. */
  dataUrlParts(src) {
    const m = this.DATA_RE.exec(String(src == null ? '' : src).trim());
    if (!m) return null;
    return { mime: 'image/' + m[1].toLowerCase(), b64: m[2] };
  },

  /**
   * base64 -> Uint8Array.
   * Urutan: atob (browser) -> Buffer (Node) -> penyandi sendiri (fallback,
   * agar ekspor DOCX tetap jalan di lingkungan tanpa keduanya).
   */
  base64ToBytes(b64) {
    const s = String(b64 || '');
    if (!s) return new Uint8Array(0);
    if (typeof atob === 'function') {
      try {
        const bin = atob(s);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      } catch { /* coba jalur berikutnya */ }
    }
    if (typeof Buffer !== 'undefined') {
      try { return new Uint8Array(Buffer.from(s, 'base64')); } catch { /* coba jalur berikutnya */ }
    }
    return this._b64Decode(s);
  },

  /** Penyandi base64 mandiri (tanpa atob/Buffer) — jalur terakhir. */
  _b64Decode(s) {
    const map = this.B64_MAP;
    const out = [];
    let acc = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      const v = map[s.charCodeAt(i)];
      if (v === undefined || v < 0) continue;      // abaikan '=' dan karakter asing
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
    }
    return new Uint8Array(out);
  },

  /**
   * Siapkan gambar untuk docx: { data, type, width, height } — null bila
   * src bukan data URL (tautan luar tidak diunduh saat ekspor).
   * `width`/`height` = ukuran asli (boleh 0 bila tidak diketahui); hasil
   * diperkecil agar muat di dalam kotak `boxW` x `boxH` (piksel, 96 dpi).
   */
  docxImage(src, width, height, boxW, boxH) {
    const parts = this.dataUrlParts(src);
    if (!parts || !parts.b64) return null;
    const data = this.base64ToBytes(parts.b64);
    if (!data || !data.length) return null;
    const type = parts.mime === 'image/png' ? 'png'
      : parts.mime === 'image/gif' ? 'gif'
        : 'jpg';                       // jpeg, dan webp yang dikode ulang -> jpg
    const bw = Math.max(1, Math.round(Number(boxW) || 520));
    const bh = Math.max(1, Math.round(Number(boxH) || 700));
    let w = Math.round(Number(width) || 0);
    let h = Math.round(Number(height) || 0);
    if (w <= 0 || h <= 0) { w = 480; h = 360; }   // ukuran tak diketahui: rasio aman
    const k = Math.min(1, bw / w, bh / h);
    return {
      data, type,
      width: Math.max(1, Math.round(w * k)),
      height: Math.max(1, Math.round(h * k))
    };
  },

  /* ---- util internal ---- */
  _err(code) {
    const e = new Error(code);
    e.code = code;
    return e;
  }
};

if (typeof window !== 'undefined') window.ImageUtil = ImageUtil;
