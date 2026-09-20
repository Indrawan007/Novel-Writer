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
        projects: data.projects || [],
        settings: { ...this._default().settings, ...data.settings }
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

  importAll(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data.projects || !data.settings) throw new Error('Invalid');
    this.save(data);
  }
};