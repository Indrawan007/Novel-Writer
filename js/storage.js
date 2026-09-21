/* ============================================
   Storage — lapisan data (localStorage + cache in-memory)

   Prinsip:
   1. Satu kali parse, banyak baca  -> _cache (write-through).
   2. Kegagalan tulis TIDAK pernah diam-diam -> save() mengembalikan
      boolean + lastError() untuk ditampilkan ke pengguna.
   3. Data dari sumber tidak tepercaya (file backup, atau localStorage yang
      diubah di luar aplikasi) dinormalisasi: id divalidasi, order di-
      resequens supaya tidak kembar/berlubang.
   ============================================ */

const DB_KEY = 'novel-writer-data';
const SNAPSHOT_KEY = 'novel-writer-data-prev'; // cadangan otomatis sebelum restore

const Storage = {
  _cache: null,
  _lastError: null,

  _default() {
    return {
      projects: [],
      settings: {
        theme: 'light',
        fontSize: 18,
        lineHeight: 1.8,
        autoSaveDelay: 1000,
        lang: 'id',
        lastProject: null,
        lastChapter: null,
        sidebarCollapsed: false,
        focusFullscreen: true,
        readerFullscreen: true,
        typewriter: true,
        paraFocus: true,
        readerFont: 19
      }
    };
  },

  /* ---- id: hanya karakter aman (mencegah injeksi ke atribut HTML) ---- */
  _safeId(v) {
    return (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)) ? v : this.uid();
  },

  /* ---- cache in-memory ---- */

  /** Baca (dan bila perlu parse + normalisasi) seluruh database. */
  _read() {
    if (this._cache) return this._cache;
    let data = null;
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) {
      console.warn('Data tersimpan tidak dapat dibaca, memakai default:', e);
    }
    this._cache = data ? this._coerce(data) : this._default();
    return this._cache;
  },

  /** Buang cache — dipakai saat tab lain menulis (event `storage`). */
  invalidate() {
    this._cache = null;
    return this._read();
  },

  /**
   * Akses database. Objek yang dikembalikan adalah REFERENSI ke cache;
   * mutasi harus diikuti save()/saveProject()/saveSettings() agar persisten.
   */
  load() {
    return this._read();
  },

  /** Tulis ke localStorage sekaligus memperbarui cache. */
  save(data) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(data));
      this._cache = data;
      this._lastError = null;
      return true;
    } catch (e) {
      this._lastError = (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'))
        ? 'quota' : 'write';
      console.warn('Storage full or unavailable:', e);
      return false;
    }
  },

  /** 'quota' | 'write' | null — alasan kegagalan tulis terakhir. */
  lastError() {
    return this._lastError;
  },

  /** Simpan cache saat ini apa adanya (dipakai setelah mutasi langsung). */
  commit() {
    return this.save(this._read());
  },

  uid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  /* ---- Normalisasi ---- */

  _normalizeChapter(c, idx) {
    if (!c || typeof c !== 'object') return null;
    const now = new Date().toISOString();
    const order = Number(c.order);
    return {
      id: this._safeId(c.id),
      title: typeof c.title === 'string' ? c.title.slice(0, 300) : '',
      content: typeof c.content === 'string' ? c.content : '',
      // 'html' = isi tersimpan sebagai HTML kanonik (js/richtext.js);
      // selain itu = teks polos lama (satu baris = satu paragraf)
      format: c.format === 'html' ? 'html' : 'text',
      order: Number.isFinite(order) ? order : idx + 1,
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : now,
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : now,
      _idx: idx
    };
  },

  _normalizeProject(p) {
    if (!p || typeof p !== 'object') return null;
    const now = new Date().toISOString();
    const raw = Array.isArray(p.chapters) ? p.chapters : [];
    // Urutkan stabil (order, lalu posisi asli) lalu resequens 1..n
    // supaya tidak ada order kembar/berlubang hasil file eksternal.
    const chapters = raw
      .map((c, i) => this._normalizeChapter(c, i))
      .filter(Boolean)
      .sort((a, b) => (a.order - b.order) || (a._idx - b._idx))
      .map((c, i) => { delete c._idx; c.order = i + 1; return c; });
    return {
      id: this._safeId(p.id),
      title: typeof p.title === 'string' ? p.title.slice(0, 300) : '',
      author: typeof p.author === 'string' ? p.author.slice(0, 200) : '',
      description: typeof p.description === 'string' ? p.description.slice(0, 1000) : '',
      chapters,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : now,
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : now
    };
  },

  _settingsFrom(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const d = this._default().settings;
    const clamp = (v, def, min, max) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    };
    return {
      theme: s.theme === 'dark' ? 'dark' : 'light',
      fontSize: clamp(s.fontSize, d.fontSize, 14, 28),
      lineHeight: clamp(s.lineHeight, d.lineHeight, 1.4, 2.2),
      autoSaveDelay: clamp(s.autoSaveDelay, d.autoSaveDelay, 500, 5000),
      lang: s.lang === 'en' ? 'en' : 'id',
      lastProject: typeof s.lastProject === 'string' ? s.lastProject : null,
      lastChapter: typeof s.lastChapter === 'string' ? s.lastChapter : null,
      sidebarCollapsed: s.sidebarCollapsed === true,
      focusFullscreen: s.focusFullscreen !== false,
      readerFullscreen: s.readerFullscreen !== false,
      typewriter: s.typewriter !== false,
      paraFocus: s.paraFocus !== false,
      readerFont: clamp(s.readerFont, d.readerFont, 14, 28)
    };
  },

  /** Bentuk kanonik untuk data apa pun (dipakai saat baca & impor). */
  _coerce(data) {
    return {
      projects: (Array.isArray(data.projects) ? data.projects : [])
        .map(p => this._normalizeProject(p))
        .filter(Boolean),
      settings: this._settingsFrom(data.settings)
    };
  },

  /* ---- Query ---- */

  getProjects() {
    return this._read().projects;
  },

  getProject(id) {
    return this._read().projects.find(p => p.id === id) || null;
  },

  getSettings() {
    return this._read().settings;
  },

  /* ---- Mutasi (semuanya mengembalikan boolean sukses tulis) ---- */

  saveProject(project) {
    const data = this._read();
    const idx = data.projects.findIndex(p => p.id === project.id);
    project.updatedAt = new Date().toISOString();
    if (idx >= 0) data.projects[idx] = project;
    else data.projects.push(project);
    return this.save(data);
  },

  deleteProject(id) {
    const data = this._read();
    data.projects = data.projects.filter(p => p.id !== id);
    if (data.settings.lastProject === id) {
      data.settings.lastProject = data.projects[0] ? data.projects[0].id : null;
      data.settings.lastChapter = null;
    }
    return this.save(data);
  },

  reorderChapters(projectId, chapterIds) {
    const data = this._read();
    const proj = data.projects.find(p => p.id === projectId);
    if (!proj || !proj.chapters) return false;
    chapterIds.forEach((id, idx) => {
      const ch = proj.chapters.find(c => c.id === id);
      if (ch) ch.order = idx + 1;
    });
    return this.save(data);
  },

  saveSettings(settings) {
    const data = this._read();
    data.settings = { ...data.settings, ...settings };
    return this.save(data);
  },

  /**
   * Pastikan penanda "terakhir dibuka" menunjuk ke data yang benar-benar ada
   * (dipakai setelah impor/hapus agar UI tidak terbuka dalam keadaan nyangkut).
   */
  repairPointers() {
    const data = this._read();
    const s = data.settings;
    const proj = data.projects.find(p => p.id === s.lastProject) || null;
    if (!proj) {
      s.lastProject = data.projects[0] ? data.projects[0].id : null;
      s.lastChapter = null;
    } else if (s.lastChapter && !(proj.chapters || []).some(c => c.id === s.lastChapter)) {
      s.lastChapter = null;
    }
    return s;
  },

  /* ---- Backup / Restore ---- */

  exportAll() {
    return JSON.stringify(this._read(), null, 2);
  },

  /** Ringkasan data yang sedang tersimpan (untuk dialog konfirmasi). */
  summarizeData(data) {
    const projects = (data && Array.isArray(data.projects)) ? data.projects : [];
    let chapters = 0, words = 0;
    projects.forEach(p => {
      (Array.isArray(p.chapters) ? p.chapters : []).forEach(c => {
        chapters++;
        // tag HTML tidak dihitung sebagai kata
        const txt = (typeof c.content === 'string' ? c.content : '')
          .replace(/<[^>]*>/g, ' ').trim();
        if (txt) words += txt.split(/\s+/).length;
      });
    });
    return { projects: projects.length, chapters, words };
  },

  summarizeCurrent() {
    return this.summarizeData(this._read());
  },

  /** Ringkasan file JSON backup — melempar error bila bentuknya tidak valid. */
  summarizeJson(jsonStr) {
    const data = JSON.parse(jsonStr); // biarkan throw -> ditangkap pemanggil
    if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) {
      throw new Error('Invalid backup: properti "projects" (array) tidak ditemukan');
    }
    return this.summarizeData(data);
  },

  /** Simpan salinan data sekarang agar restore bisa dibatalkan. */
  snapshot() {
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(this._read()));
      return true;
    } catch (e) {
      console.warn('Snapshot gagal dibuat:', e);
      return false;
    }
  },

  hasSnapshot() {
    try { return !!localStorage.getItem(SNAPSHOT_KEY); } catch { return false; }
  },

  /** Kembalikan data ke kondisi sebelum restore terakhir. */
  restoreSnapshot() {
    let raw = null;
    try { raw = localStorage.getItem(SNAPSHOT_KEY); } catch { return false; }
    if (!raw) return false;
    try {
      const data = this._coerce(JSON.parse(raw));
      if (!this.save(data)) return false;
      try { localStorage.removeItem(SNAPSHOT_KEY); } catch {}
      return true;
    } catch (e) {
      console.warn('Snapshot rusak:', e);
      return false;
    }
  },

  /**
   * Impor file backup: validasi -> normalisasi -> perbaiki penanda -> tulis.
   * Snapshot data lama dibuat lebih dulu (bisa dibatalkan).
   */
  importAll(jsonStr) {
    const data = JSON.parse(jsonStr); // biarkan throw -> ditangkap pemanggil
    if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) {
      throw new Error('Invalid backup: properti "projects" (array) tidak ditemukan');
    }
    const coerced = this._coerce(data);
    this.snapshot();
    if (!this.save(coerced)) return false;
    this.repairPointers();
    return this.commit();
  }
};
