/* ============================================
   i18n — Bilingual (ID / EN)
   Mendukung: teks, placeholder, title, dan aria-label.
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
    backupData:      "Cadangkan",
    restoreData:     "Pulihkan",
    undoRestore:     "Batalkan restore terakhir",
    undoRestoreDone: "Data sebelum restore berhasil dikembalikan.",
    undoRestoreNone: "Tidak ada cadangan restore untuk dibatalkan.",
    undoRestoreFail: "Gagal mengembalikan cadangan.",
    plainText:       "Teks Biasa",
    currentChapter:  "Bab saat ini",
    entireNovel:     "Seluruh novel",
    chapterWords:    "Kata (bab)",
    totalWords:      "Total kata",
    selectChapter:   "Pilih bab untuk mulai menulis",
    editorPlaceholder: "Mulai menulis...\n\nTekan Enter untuk paragraf baru. Format tebal/miring/judul lewat panel di atas — tanpa menulis sintaks.",
    welcomeTitle:    "Selamat Datang di Novel Writer",
    welcomeDesc:     "Buat proyek baru untuk mulai menulis novelmu.",
    emptyPickProjTitle: "Pilih proyek",
    emptyPickProjDesc:  "Pilih salah satu proyek di sidebar untuk mulai menulis.",
    emptyNoChTitle:  "Belum ada bab",
    emptyNoChDesc:   "Proyek ini belum memiliki bab. Buat bab pertama untuk mulai menulis.",
    emptyPickChTitle: "Pilih bab",
    emptyPickChDesc:  "Pilih bab di sidebar untuk mulai menulis, atau buat bab baru.",
    offlineReady:    "Siap digunakan offline",
    updateAvailable: "Versi baru tersedia — muat ulang halaman untuk memperbarui.",
    syncedFromOtherTab: "Data diperbarui dari tab lain.",
    editorLabel:     "Editor bab",
    confirmDelProj:  "Hapus proyek ini beserta semua babnya?",
    confirmDelCh:    "Hapus bab ini?",
    confirmRestore:  "Pulihkan data dari file ini?\n\nFile berisi: {projects} proyek, {chapters} bab ({words} kata).\nData saat ini: {curProjects} proyek, {curChapters} bab ({curWords} kata) — akan ditimpa.\n\nCadangan otomatis dibuat, jadi restore bisa dibatalkan dari Pengaturan.",
    continue:        "Lanjutkan",
    saved:           "Tersimpan",
    saving:          "Menyimpan...",
    storageFull:     "Penyimpanan browser penuh — data TIDAK tersimpan! Unduh cadangan sekarang.",
    storageSaveFail: "Gagal menyimpan ke browser.",
    exported:        "Berhasil diekspor!",
    exportFail:      "Ekspor gagal.",
    exportLibFail:   "Pustaka ekspor gagal dimuat — ekspor PDF/DOCX butuh koneksi internet sekali.",
    exportEmpty:     "Tidak ada bab untuk diekspor.",
    backupDone:      "Cadangan berhasil diunduh!",
    restoreDone:     "Data berhasil dipulihkan!",
    restoreFail:     "File tidak valid!",
    noChapter:       "Tidak ada bab untuk diekspor.",
    untitled:        "Tanpa Judul",
    chapter:         "Bab",
    rename:          "Ganti Nama",
    renameProject:   "Ganti Nama Proyek",
    renameChapter:   "Ganti Nama Bab",
    autoSave:        "Auto-save",
    save:            "Simpan",
    shortcuts:       "Pintasan Keyboard",
    shortcutSave:    "Simpan",
    shortcutClose:   "Tutup modal",
    shortcutIndent:  "Indent / un-indent",
    shortcutReorder: "Urutkan bab (fokus di daftar bab)",
    loading:         "Memuat...",
    /* Label & tooltip toolbar */
    menu:            "Menu",
    themeToDark:     "Ganti ke tema gelap",
    themeToLight:    "Ganti ke tema terang",
    openProject:     "Buka proyek",
    reorderHint:     "Tahan & geser, atau Alt+Panah untuk mengurutkan",
    showSidebar:     "Tampilkan sidebar",
    hideSidebar:     "Sembunyikan sidebar",
    focusMode:       "Mode Fokus",
    readerMode:      "Mode Baca",
    exitFocusMode:   "Keluar Mode Fokus",
    exitReaderMode:  "Keluar Mode Baca",
    focusModeActive: "Keluar Mode Fokus (Esc)",
    readerModeActive:"Keluar Mode Baca (Esc)",
    focusToast:      "Mode Fokus — Esc untuk keluar",
    readerToast:     "Mode Baca — Esc untuk keluar",
    focusHint:       "Tulis tanpa distraksi",
    readerHint:      "Baca dengan nyaman",
    shortcutFocus:   "Ctrl+Shift+F",
    shortcutReader:  "Ctrl+Shift+R",
    /* Panel format (WYSIWYG) */
    formatToolbar:   "Panel format",
    fmtBold:         "Tebal",
    fmtItalic:       "Miring",
    fmtHeading:      "Subjudul",
    fmtQuote:        "Kutipan",
    fmtScene:        "Jeda adegan",
    shortcutBoldItalic: "Tebal / Miring",
    /* Mode imersif (fokus & baca): layar penuh, nol gangguan */
    immersiveSettings: "Mode Imersif",
    focusFullscreen: "Layar penuh otomatis (Mode Fokus)",
    readerFullscreen: "Layar penuh otomatis (Mode Baca)",
    typewriterMode:  "Mesin ketik — jaga kursor di tengah",
    paraFocus:       "Fokus paragraf — redupkan sekitarnya",
    readerFont:      "Font Mode Baca",
    exitImmersive:   "Keluar (Esc)",
    words:           "kata",
    sessionSuffix:   "sesi ini",
    prevChapter:     "Bab sebelumnya",
    nextChapter:     "Bab berikutnya",
    chapterOf:       "Bab {cur} dari {total}",
    minLeft:         "±{n} mnt lagi",
    readingDone:     "selesai",
    decreaseFont:    "Kecilkan huruf",
    increaseFont:    "Besarkan huruf",
    enterFullscreen: "Layar penuh",
    exitFullscreen:  "Keluar layar penuh",
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
    backupData:      "Backup",
    restoreData:     "Restore",
    undoRestore:     "Undo last restore",
    undoRestoreDone: "Data from before the restore was recovered.",
    undoRestoreNone: "No restore backup to undo.",
    undoRestoreFail: "Failed to recover the backup.",
    plainText:       "Plain Text",
    currentChapter:  "Current chapter",
    entireNovel:     "Entire novel",
    chapterWords:    "Words (chapter)",
    totalWords:      "Total words",
    selectChapter:   "Select a chapter to start writing",
    editorPlaceholder: "Start writing...\n\nOne line = one paragraph. Press Enter for a new paragraph.",
    editorPlaceholder: "Start writing...\n\nPress Enter for a new paragraph. Use the toolbar for bold, italics, and headings — no syntax to learn.",
    welcomeTitle:    "Welcome to Novel Writer",
    welcomeDesc:     "Create a new project to start writing your novel.",
    emptyPickProjTitle: "Select a project",
    emptyPickProjDesc:  "Pick a project from the sidebar to start writing.",
    emptyNoChTitle:  "No chapters yet",
    emptyNoChDesc:   "This project has no chapters. Create the first one to start writing.",
    emptyPickChTitle: "Select a chapter",
    emptyPickChDesc:  "Pick a chapter from the sidebar, or create a new one.",
    offlineReady:    "Ready for offline use",
    updateAvailable: "A new version is available — reload the page to update.",
    syncedFromOtherTab: "Data updated from another tab.",
    editorLabel:     "Chapter editor",
    confirmDelProj:  "Delete this project and all its chapters?",
    confirmDelCh:    "Delete this chapter?",
    confirmRestore:  "Restore data from this file?\n\nFile contains: {projects} projects, {chapters} chapters ({words} words).\nCurrent data: {curProjects} projects, {curChapters} chapters ({curWords} words) — will be overwritten.\n\nAn automatic backup is kept, so the restore can be undone from Settings.",
    continue:        "Continue",
    saved:           "Saved",
    saving:          "Saving...",
    storageFull:     "Browser storage is full — data NOT saved! Download a backup now.",
    storageSaveFail: "Failed to save to the browser.",
    exported:        "Exported successfully!",
    exportFail:      "Export failed.",
    exportLibFail:   "Export library failed to load — PDF/DOCX export needs an internet connection once.",
    exportEmpty:     "No chapters to export.",
    backupDone:      "Backup downloaded!",
    restoreDone:     "Data restored successfully!",
    restoreFail:     "Invalid file!",
    noChapter:       "No chapters to export.",
    untitled:        "Untitled",
    chapter:         "Chapter",
    rename:          "Rename",
    renameProject:   "Rename Project",
    renameChapter:   "Rename Chapter",
    autoSave:        "Auto-save",
    save:            "Save",
    shortcuts:       "Keyboard Shortcuts",
    shortcutSave:    "Save",
    shortcutClose:   "Close modal",
    shortcutIndent:  "Indent / un-indent",
    shortcutReorder: "Reorder chapters (focus in chapter list)",
    loading:         "Loading...",
    /* Toolbar labels & tooltips */
    menu:            "Menu",
    themeToDark:     "Switch to dark theme",
    themeToLight:    "Switch to light theme",
    openProject:     "Open project",
    reorderHint:     "Hold & drag, or Alt+Arrow to reorder",
    showSidebar:     "Show sidebar",
    hideSidebar:     "Hide sidebar",
    focusMode:       "Focus Mode",
    readerMode:      "Reader Mode",
    exitFocusMode:   "Exit Focus Mode",
    exitReaderMode:  "Exit Reader Mode",
    focusModeActive: "Exit Focus Mode (Esc)",
    readerModeActive:"Exit Reader Mode (Esc)",
    focusToast:      "Focus Mode — press Esc to exit",
    readerToast:     "Reader Mode — press Esc to exit",
    focusHint:       "Distraction-free writing",
    readerHint:      "Comfortable reading",
    shortcutFocus:   "Ctrl+Shift+F",
    shortcutReader:  "Ctrl+Shift+R",
    /* Format toolbar (WYSIWYG) */
    formatToolbar:   "Format toolbar",
    fmtBold:         "Bold",
    fmtItalic:       "Italic",
    fmtHeading:      "Heading",
    fmtQuote:        "Quote",
    fmtScene:        "Scene break",
    shortcutBoldItalic: "Bold / Italic",
    /* Immersive modes (focus & reader): fullscreen, zero distraction */
    immersiveSettings: "Immersive Modes",
    focusFullscreen: "Auto fullscreen (Focus Mode)",
    readerFullscreen: "Auto fullscreen (Reader Mode)",
    typewriterMode:  "Typewriter — keep caret centered",
    paraFocus:       "Paragraph focus — dim surroundings",
    readerFont:      "Reader Mode Font",
    exitImmersive:   "Exit (Esc)",
    words:           "words",
    sessionSuffix:   "this session",
    prevChapter:     "Previous chapter",
    nextChapter:     "Next chapter",
    chapterOf:       "Chapter {cur} of {total}",
    minLeft:         "±{n} min left",
    readingDone:     "done",
    decreaseFont:    "Decrease font",
    increaseFont:    "Increase font",
    enterFullscreen: "Enter fullscreen",
    exitFullscreen:  "Exit fullscreen",
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

/** Terjemahan; mendukung interpolasi `{nama}` melalui argumen kedua. */
function t(key, vars) {
  let str = (I18N[currentLang] && I18N[currentLang][key]) || key;
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }
  return str;
}

/** Bahasa aktif ('id' | 'en') — dipakai juga untuk format angka. */
function getLang() {
  return currentLang;
}

function applyLanguage(lang) {
  if (lang === 'en' || lang === 'id') currentLang = lang;
  document.documentElement.lang = currentLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = t(el.dataset.i18nPlaceholder);
    el.placeholder = val;                       // input / textarea
    el.setAttribute('data-placeholder', val);   // contenteditable (CSS ::before)
  });

  // Tooltip & label aksesibilitas ikut diterjemahkan
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });

  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}
