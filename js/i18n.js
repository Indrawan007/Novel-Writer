/* ============================================
   i18n — Bilingual (ID / EN) — Final
   ============================================ */

const I18N = {
  id: {
    appTitle:        "Novel Writer",
    projects:        "Proyek",
    chapters:        "Bab",
    newProject:      "Proyek Baru",
    newChapter:      "Bab Baru",
    title:           "Judul",
    author:          "Penulis",
    description:     "Deskripsi",
    chapterTitle:    "Judul Bab",
    create:          "Buat",
    cancel:          "Batal",
    close:           "Tutup",
    delete:          "Hapus",
    confirm:         "Konfirmasi",
    export:          "Ekspor",
    settings:        "Pengaturan",
    language:        "Bahasa",
    fontSize:        "Ukuran Font",
    lineHeight:      "Tinggi Baris",
    backupRestore:   "Cadangan & Pulihkan",
    backupData:      "💾 Cadangkan",
    restoreData:     "📂 Pulihkan",
    currentChapter:  "Bab saat ini",
    entireNovel:     "Seluruh novel",
    chapterWords:    "Kata (bab)",
    totalWords:      "Total kata",
    selectChapter:   "Pilih bab untuk mulai menulis",
    editorPlaceholder: "Mulai menulis... (Mendukung Markdown)\n\n# Judul Bab\n\nParagraf pertama...\n\n**Tebal** dan *miring*",
    welcomeTitle:    "Selamat Datang di Novel Writer",
    welcomeDesc:     "Buat proyek baru untuk mulai menulis novelmu.",
    offlineReady:    "📡 Siap digunakan offline",
    confirmDelProj:  "Hapus proyek ini beserta semua babnya?",
    confirmDelCh:    "Hapus bab ini?",
    saved:           "Tersimpan ✓",
    saving:          "Menyimpan...",
    exported:        "Berhasil diekspor!",
    backupDone:      "Cadangan berhasil diunduh!",
    restoreDone:     "Data berhasil dipulihkan!",
    restoreFail:     "File tidak valid!",
    noChapter:       "Tidak ada bab untuk diekspor.",
    untitled:        "Tanpa Judul",
    chapter:         "Bab",
    rename:          "Ganti Nama",
    save:            "Simpan",
    shortcuts:       "Pintasan Keyboard",
    shortcutSave:    "Simpan",
    shortcutPreview: "Preview",
    shortcutExport:  "Ekspor",
    shortcutClose:   "Tutup modal",
    loading:         "Memuat...",
  },
  en: {
    appTitle:        "Novel Writer",
    projects:        "Projects",
    chapters:        "Chapters",
    newProject:      "New Project",
    newChapter:      "New Chapter",
    title:           "Title",
    author:          "Author",
    description:     "Description",
    chapterTitle:    "Chapter Title",
    create:          "Create",
    cancel:          "Cancel",
    close:           "Close",
    delete:          "Delete",
    confirm:         "Confirm",
    export:          "Export",
    settings:        "Settings",
    language:        "Language",
    fontSize:        "Font Size",
    lineHeight:      "Line Height",
    backupRestore:   "Backup & Restore",
    backupData:      "💾 Backup",
    restoreData:     "📂 Restore",
    currentChapter:  "Current chapter",
    entireNovel:     "Entire novel",
    chapterWords:    "Words (chapter)",
    totalWords:      "Total words",
    selectChapter:   "Select a chapter to start writing",
    editorPlaceholder: "Start writing... (Markdown supported)\n\n# Chapter Title\n\nFirst paragraph...\n\n**Bold** and *italic*",
    welcomeTitle:    "Welcome to Novel Writer",
    welcomeDesc:     "Create a new project to start writing your novel.",
    offlineReady:    "📡 Ready for offline use",
    confirmDelProj:  "Delete this project and all its chapters?",
    confirmDelCh:    "Delete this chapter?",
    saved:           "Saved ✓",
    saving:          "Saving...",
    exported:        "Exported successfully!",
    backupDone:      "Backup downloaded!",
    restoreDone:     "Data restored successfully!",
    restoreFail:     "Invalid file!",
    noChapter:       "No chapters to export.",
    untitled:        "Untitled",
    chapter:         "Chapter",
    rename:          "Rename",
    save:            "Save",
    shortcuts:       "Keyboard Shortcuts",
    shortcutSave:    "Save",
    shortcutPreview: "Preview",
    shortcutExport:  "Export",
    shortcutClose:   "Close modal",
    loading:         "Loading...",
  }
};

/* Bahasa disimpan HANYA di settings.lang (dalam 'novel-writer-data')
   — satu sumber kebenaran, konsisten dengan theme & pengaturan lain.
   Key lama 'nw-lang' dibersihkan (migrasi). */

function readStoredLang() {
  try {
    localStorage.removeItem('nw-lang'); // migrasi: key lama tidak dipakai lagi
    const d = JSON.parse(localStorage.getItem('novel-writer-data') || 'null');
    const lang = d && d.settings && d.settings.lang;
    return (lang === 'en' || lang === 'id') ? lang : 'id';
  } catch (e) {
    return 'id';
  }
}

let currentLang = readStoredLang();

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || key;
}

/* Hanya mengubah terjemahan yang tampil di layar.
   Persistensi dilakukan pemanggil via Storage.saveSettings({ lang }),
   agar bahasa tetap satu sumber kebenaran dengan pengaturan lain. */
function applyLanguage(lang) {
  if (lang === 'en' || lang === 'id') currentLang = lang;
  document.documentElement.lang = currentLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

