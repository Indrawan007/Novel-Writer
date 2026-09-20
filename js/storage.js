/* ============================================
   Storage — LocalStorage wrapper — Final
   ============================================ */

const DB_KEY = 'novel-writer-data';

const Storage = {
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
        lastChapter: null
      }
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return this._default();
      const data = JSON.parse(raw);
      return {
        projects: Array.isArray(data.projects) ? data.projects : [],
        settings: {
          ...this._default().settings,
          ...(data.settings && typeof data.settings === 'object' ? data.settings : {})
        }
      };
    } catch {
      return this._default();
    }
  },

  save(data) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Storage full or unavailable:', e);
      return false;
    }
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  getProjects() {
    return this.load().projects;
  },

  getProject(id) {
    return this.load().projects.find(p => p.id === id) || null;
  },

  saveProject(project) {
    const data = this.load();
    const idx = data.projects.findIndex(p => p.id === project.id);
    project.updatedAt = new Date().toISOString();
    if (idx >= 0) data.projects[idx] = project;
    else data.projects.push(project);
    this.save(data);
  },

  deleteProject(id) {
    const data = this.load();
    data.projects = data.projects.filter(p => p.id !== id);
    if (data.settings.lastProject === id) {
      data.settings.lastProject = null;
      data.settings.lastChapter = null;
    }
    this.save(data);
  },

  reorderChapters(projectId, chapterIds) {
    const data = this.load();
    const proj = data.projects.find(p => p.id === projectId);
    if (!proj || !proj.chapters) return;
    chapterIds.forEach((id, idx) => {
      const ch = proj.chapters.find(c => c.id === id);
      if (ch) ch.order = idx + 1;
    });
    this.save(data);
  },

  getSettings() {
    return this.load().settings;
  },

  saveSettings(settings) {
    const data = this.load();
    data.settings = { ...data.settings, ...settings };
    this.save(data);
  },

  exportAll() {
    return JSON.stringify(this.load(), null, 2);
  },

  /* ---- Normalisasi (untuk data tidak tepercaya, mis. file restore) ---- */

  _normalizeChapter(c) {
    if (!c || typeof c !== 'object') return null;
    const now = new Date().toISOString();
    const order = Number(c.order);
    return {
      id: (typeof c.id === 'string' && c.id) ? c.id : this.uid(),
      title: typeof c.title === 'string' ? c.title : '',
      content: typeof c.content === 'string' ? c.content : '',
      order: Number.isFinite(order) ? order : 0,
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : now,
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : now
    };
  },

  _normalizeProject(p) {
    if (!p || typeof p !== 'object') return null;
    const now = new Date().toISOString();
    return {
      id: (typeof p.id === 'string' && p.id) ? p.id : this.uid(),
      title: typeof p.title === 'string' ? p.title : '',
      author: typeof p.author === 'string' ? p.author : '',
      description: typeof p.description === 'string' ? p.description : '',
      chapters: Array.isArray(p.chapters)
        ? p.chapters.map(c => this._normalizeChapter(c)).filter(Boolean)
        : [],
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
      lastChapter: typeof s.lastChapter === 'string' ? s.lastChapter : null
    };
  },

  importAll(jsonStr) {
    const data = JSON.parse(jsonStr); // biarkan throw → ditangkap pemanggil
    if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) {
      throw new Error('Invalid');
    }
    this.save({
      projects: data.projects.map(p => this._normalizeProject(p)).filter(Boolean),
      settings: this._settingsFrom(data.settings)
    });
  }
};