/* ============================================
   APP — Novel Writer (Safe & Robust)
   Inti aplikasi: state, render, CRUD, editor, drag&drop,
   sinkronisasi antar-tab, PWA.
   ============================================ */

(function () {
  'use strict';

  const VERSION = '1.4.0';

  // ============ STATE ============
  const initSettings = Storage.getSettings();
  let activeProjectId = initSettings.lastProject;
  let activeChapterId = initSettings.lastChapter;
  let isFocusMode = false;
  let isReaderMode = false;
  let immersiveFullscreen = initSettings.immersiveFullscreen !== false; // layar penuh browser
  let typewriterOn = initSettings.focusTypewriter === true;             // kursor dijaga di tengah
  let fsRequested = false;   // layar penuh diminta OLEH aplikasi (bukan pengguna)
  let fsFailNotified = false;// penolakan layar penuh cukup diberitahu sekali
  let hudTimer = null;       // pemudar otomatis HUD
  let cursorTimer = null;    // penyembunyi kursor mouse saat menganggur
  let typewriterRaf = 0;
  let readerRaf = 0;
  let readerPosTimer = null;
  let readerPct = 0;         // progres baca bab aktif (0-100)
  let saveTimer = null;
  let confirmCallback = null;
  let renameTarget = null;
  let autoSaveDelay = initSettings.autoSaveDelay || 1000;
  let lastFocused = null;   // elemen pemanggil modal (fokus dikembalikan saat tutup)
  let dirty = false;        // ada ketikan yang belum tersimpan

  // ============ DOM REFS ============
  const $ = (s, p) => (p || document).querySelector(s);
  const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

  const dom = {
    sidebar:       $('#sidebar'),
    overlay:       $('#sidebar-overlay'),
    projectList:   $('#project-list'),
    chapterList:   $('#chapter-list'),
    chapterSec:    $('#chapter-section'),
    editorWrap:    $('#editor-wrap'),
    formatBar:     $('#format-bar'),
    editor:        $('#editor'),
    reader:        $('#reader-view'),
    emptyState:    $('#empty-state'),
    emptyTitle:    $('#empty-title'),
    emptyDesc:     $('#empty-desc'),
    emptyAction:   $('#btn-empty-action'),
    toolbarTitle:  $('#toolbar-title'),
    statChapter:   $('#stat-chapter'),
    statTotal:     $('#stat-total'),
    sidebarFooter: $('#sidebar-footer'),
    saveIndicator: $('#save-indicator'),
    modalOverlay:  $('#modal-overlay'),
    toast:         $('#toast'),
    btnExport:     $('#btn-export'),
    btnFocus:      $('#btn-focus'),
    btnReader:     $('#btn-reader'),
    btnTheme:      $('#btn-theme'),
    /* HUD imersif — satu-satunya kontrol di Mode Fokus / Mode Baca */
    hud:           $('#immersive-hud'),
    hudInfo:       $('#hud-info'),
    hudPrev:       $('#hud-prev'),
    hudNext:       $('#hud-next'),
    hudFontDown:   $('#hud-font-down'),
    hudFontUp:     $('#hud-font-up'),
    hudTheme:      $('#hud-theme'),
    hudSwitch:     $('#hud-switch'),
    hudExit:       $('#hud-exit'),
    hudProgress:   $('#hud-progress-fill'),
  };

  // ============ HELPERS ============

  /** Jumlah kata (tanda baca yang berdiri sendiri tidak dihitung). */
  function wordCount(content, format) {
    return RichText.wordCount(content, format);
  }

  /** Format angka mengikuti bahasa aktif. */
  function nf(n) {
    const locale = (typeof getLang === 'function' && getLang() === 'en') ? 'en-US' : 'id-ID';
    try { return Number(n || 0).toLocaleString(locale); }
    catch { return String(n || 0); }
  }

  /** Escape untuk konteks TEKS. */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Escape untuk konteks ATRIBUT (id proyek/bab disisipkan di sini). */
  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let toastTimer;
  function toast(msg, ms = 2000, type) {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.classList.toggle('toast-error', type === 'error');
    dom.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (dom.toast) dom.toast.hidden = true; }, ms);
  }

  /**
   * Semua penulisan ke Storage melewati sini: kegagalan (mis. kuota penuh)
   * TIDAK pernah lagi ditelan diam-diam.
   */
  function persist(ok) {
    if (ok) return true;
    const reason = Storage.lastError();
    toast(reason === 'quota' ? t('storageFull') : t('storageSaveFail'), 8000, 'error');
    showSaveError();
    return false;
  }

  // ============ MODAL ============
  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function focusableIn(root) {
    return $$(FOCUSABLE, root).filter(el => !el.disabled && !el.hasAttribute('hidden'));
  }

  function openModal(id) {
    $$('.modal').forEach(m => m.hidden = true);
    const target = $(`#${id}`);
    if (!target) return;
    lastFocused = document.activeElement;
    target.hidden = false;
    if (dom.modalOverlay) dom.modalOverlay.hidden = false;
    document.body.classList.add('modal-open');
    const field = target.querySelector('input[type="text"], textarea, select');
    const first = focusableIn(target)[0];
    const target2 = field || first;
    if (target2) {
      setTimeout(() => {
        try { target2.focus(); if (field && target2.select) target2.select(); } catch {}
      }, 40);
    }
  }

  function closeModal() {
    if (dom.modalOverlay) dom.modalOverlay.hidden = true;
    $$('.modal').forEach(m => m.hidden = true);
    document.body.classList.remove('modal-open');
    renameTarget = null;
    confirmCallback = null;
    if (lastFocused && document.contains(lastFocused)) {
      try { lastFocused.focus(); } catch {}
    }
    lastFocused = null;
  }

  function modalOpen() {
    return !!(dom.modalOverlay && !dom.modalOverlay.hidden);
  }

  /** Fokus tetap berada di dalam modal (Tab / Shift+Tab melingkar). */
  function trapFocus(e) {
    if (e.key !== 'Tab' || !modalOpen()) return;
    const modal = $$('.modal').find(m => !m.hidden);
    if (!modal) return;
    const items = focusableIn(modal);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement;
    if (!modal.contains(active)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  /**
   * Dialog konfirmasi serbaguna.
   * opts: { confirmLabel, danger }
   */
  function showConfirm(msg, cb, opts) {
    const o = opts || {};
    const msgEl = $('#confirm-msg');
    if (msgEl) msgEl.textContent = msg;
    const yes = $('#btn-confirm-yes');
    if (yes) {
      yes.textContent = o.confirmLabel || t('delete');
      yes.className = o.danger === false ? 'btn-primary' : 'btn-danger';
      yes.id = 'btn-confirm-yes';
    }
    confirmCallback = cb;
    openModal('modal-confirm');
  }

  // ============ RENDER ============
  function renderProjects() {
    if (!dom.projectList) return;
    const projects = Storage.getProjects();
    dom.projectList.innerHTML = projects.map(p => `
      <li class="${p.id === activeProjectId ? 'active' : ''}"
          data-id="${escAttr(p.id)}" tabindex="0"
          ${p.id === activeProjectId ? 'aria-current="true"' : ''}
          title="${escAttr(t('openProject'))}">
        <span class="item-icon" aria-hidden="true">${Icons.book}</span>
        <span class="item-title">${escHtml(p.title || t('untitled'))}</span>
        <span class="item-actions">
          <button class="rename-btn" data-rename-proj="${escAttr(p.id)}" title="${escAttr(t('rename'))}" aria-label="${escAttr(t('rename'))}">${Icons.pencil}</button>
          <button data-del-proj="${escAttr(p.id)}" title="${escAttr(t('delete'))}" aria-label="${escAttr(t('delete'))}">${Icons.trash}</button>
        </span>
      </li>
    `).join('');
  }

  function sortedChapters(proj) {
    return [...(proj && proj.chapters ? proj.chapters : [])].sort((a, b) => a.order - b.order);
  }

  function renderChapters() {
    const proj = Storage.getProject(activeProjectId);
    if (!proj) {
      if (dom.chapterSec) dom.chapterSec.hidden = true;
      if (dom.sidebarFooter) dom.sidebarFooter.hidden = true;
      if (dom.chapterList) dom.chapterList.innerHTML = '';
      return;
    }
    if (dom.chapterSec) dom.chapterSec.hidden = false;
    if (dom.sidebarFooter) dom.sidebarFooter.hidden = false;

    const chapters = sortedChapters(proj);
    if (dom.chapterList) {
      dom.chapterList.innerHTML = chapters.map(ch => `
        <li class="${ch.id === activeChapterId ? 'active' : ''}"
            data-id="${escAttr(ch.id)}"
            ${ch.id === activeChapterId ? 'aria-current="true"' : ''}
            tabindex="0" draggable="true"
            title="${escAttr(t('reorderHint'))}">
          <span class="item-icon" aria-hidden="true">${Icons.file}</span>
          <span class="item-title">${escHtml(ch.title || t('chapter'))}</span>
          <span class="item-actions">
            <button class="rename-btn" data-rename-ch="${escAttr(ch.id)}" title="${escAttr(t('rename'))}" aria-label="${escAttr(t('rename'))}">${Icons.pencil}</button>
            <button data-del-ch="${escAttr(ch.id)}" title="${escAttr(t('delete'))}" aria-label="${escAttr(t('delete'))}">${Icons.trash}</button>
          </span>
        </li>
      `).join('');
    }

    updateStats();
    bindDragDrop();
  }

  /** Empty-state kontekstual: belum ada proyek / belum ada bab / belum dipilih. */
  function renderEmptyState() {
    const projects = Storage.getProjects();
    const proj = Storage.getProject(activeProjectId);
    let title, desc, label, action;

    if (!projects.length) {
      title = t('welcomeTitle');      desc = t('welcomeDesc');
      label = t('newProject');        action = 'new-project';
    } else if (!proj) {
      title = t('emptyPickProjTitle'); desc = t('emptyPickProjDesc');
      label = t('newProject');         action = 'new-project';
    } else if (!sortedChapters(proj).length) {
      title = t('emptyNoChTitle');  desc = t('emptyNoChDesc');
      label = t('newChapter');      action = 'new-chapter';
    } else {
      title = t('emptyPickChTitle'); desc = t('emptyPickChDesc');
      label = t('newChapter');       action = 'new-chapter';
    }

    if (dom.emptyTitle) { dom.emptyTitle.textContent = title; delete dom.emptyTitle.dataset.i18n; }
    if (dom.emptyDesc)  { dom.emptyDesc.textContent = desc;   delete dom.emptyDesc.dataset.i18n; }
    if (dom.emptyAction) {
      dom.emptyAction.textContent = label;
      dom.emptyAction.dataset.action = action;
      delete dom.emptyAction.dataset.i18n;
    }
  }

  function renderEditor() {
    const proj = Storage.getProject(activeProjectId);
    const ch = proj?.chapters?.find(c => c.id === activeChapterId);

    if (!ch) {
      if (dom.editorWrap) dom.editorWrap.hidden = true;
      if (dom.emptyState) dom.emptyState.hidden = false;
      renderEmptyState();
      if (dom.toolbarTitle) dom.toolbarTitle.textContent = t('selectChapter');
      if (dom.btnExport) dom.btnExport.hidden = true;
      if (dom.btnFocus) dom.btnFocus.hidden = true;
      if (dom.btnReader) dom.btnReader.hidden = true;
      // keluar dari mode immersive jika tidak ada bab
      if (isFocusMode || isReaderMode) { exitFocusMode(false); exitReaderMode(false); }
      return;
    }

    if (dom.emptyState) dom.emptyState.hidden = true;
    if (dom.editorWrap) dom.editorWrap.hidden = false;
    if (dom.btnExport) dom.btnExport.hidden = false;
    if (dom.btnFocus) dom.btnFocus.hidden = false;
    if (dom.btnReader) dom.btnReader.hidden = false;
    if (dom.toolbarTitle) dom.toolbarTitle.textContent = ch.title || t('chapter');

    // MODE BACA — tampilkan bab sebagai halaman buku (judul + paragraf)
    if (isReaderMode) {
      if (dom.editor) dom.editor.hidden = true;
      if (dom.formatBar) dom.formatBar.hidden = true;
      if (dom.reader) dom.reader.hidden = false;
      renderReader(ch);
      // Gulung ke atas dulu, lalu pulihkan posisi baca terakhir bab ini
      try {
        if (dom.editorWrap) dom.editorWrap.scrollTop = 0;
        if (dom.reader) dom.reader.scrollTop = 0;
      } catch {}
      readerPct = 0;
      updateHud();
      // Posisi baca disimpan sebagai rasio — butuh layout, jadi tunda satu frame
      raf(() => restoreReaderPosition(activeChapterId));
      raf(() => { try { if (dom.reader) dom.reader.focus({ preventScroll: true }); } catch {} });
      updateFocusReaderButtons();
      return;
    }

    // MODE TULIS (biasa / fokus) — editor teks berformat (WYSIWYG)
    if (dom.reader) dom.reader.hidden = true;
    if (dom.formatBar) dom.formatBar.hidden = false;
    if (dom.editor) {
      dom.editor.hidden = false;
      const keep = dirty ? RichText.getHtml(dom.editor) : null;
      if (keep != null) {
        RichText.setContent(dom.editor, keep, 'html');
      } else {
        RichText.setContent(dom.editor, ch.content || '', ch.format);
        // Kursor di akhir konten — posisi lama milik bab sebelumnya
        RichText.focusEnd(dom.editor);
      }
    }
    updateToolbar();
    updateHud();
    updateFocusReaderButtons();
  }

  /**
   * Isi tampilan Mode Baca: judul bab sebagai <h1>, lalu isi bab.
   * Isi 'html' dirender dari model blok tersanitasi (js/richtext.js);
   * isi 'text' lama = paragraf teks polos (js/text.js — textContent,
   * jadi bebas injeksi HTML).
   */
  function renderReader(ch) {
    if (!dom.reader) return;
    dom.reader.textContent = '';
    const doc = dom.reader.ownerDocument || document;
    // Judul bab: textContent = tidak pernah di-parse sebagai HTML
    const h1 = doc.createElement('h1');
    h1.className = 'reader-title';
    h1.textContent = (ch && ch.title) || t('chapter');
    dom.reader.appendChild(h1);
    if (ch && ch.format === 'html') {
      const frag = RichText.buildNodes(dom.reader, RichText.blocks(ch.content || ''));
      dom.reader.appendChild(frag);
    } else {
      TextUtil.appendParagraphs((ch && ch.content) || '', dom.reader);
    }
  }

  function updateStats() {
    const proj = Storage.getProject(activeProjectId);
    if (!proj) {
      if (dom.statChapter) dom.statChapter.textContent = '0';
      if (dom.statTotal) dom.statTotal.textContent = '0';
      return;
    }
    const chapters = proj.chapters || [];
    const ch = chapters.find(c => c.id === activeChapterId);
    if (dom.statChapter) dom.statChapter.textContent = nf(ch ? wordCount(ch.content || '', ch.format) : 0);
    const total = chapters.reduce((s, c) => s + wordCount(c.content || '', c.format), 0);
    if (dom.statTotal) dom.statTotal.textContent = nf(total);
    updateHudInfo();
  }

  function renderAll() {
    renderProjects();
    renderChapters();
    renderEditor();
  }

  /** Label toolbar yang bergantung konteks/bahasa (bukan data-i18n statis). */
  function applyDynamicLabels() {
    const set = (el, title, aria) => {
      if (!el) return;
      el.title = title;
      el.setAttribute('aria-label', aria || title);
    };
    if (dom.btnTheme) {
      const dark = document.documentElement.dataset.theme === 'dark';
      set(dom.btnTheme, dark ? t('themeToLight') : t('themeToDark'));
    }
    applySidebarLabels();
    updateFocusReaderButtons();
    updateHud();
  }

  // ============ PROJECT CRUD ============
  function createProject() {
    const titleInp = $('#inp-proj-title');
    if (!titleInp) return;
    const title = titleInp.value.trim();
    if (!title) { titleInp.focus(); return; }
    const now = new Date().toISOString();
    const proj = {
      id: Storage.uid(),
      title: title.slice(0, 300),
      author: ($('#inp-proj-author')?.value || '').trim().slice(0, 200),
      description: ($('#inp-proj-desc')?.value || '').trim().slice(0, 1000),
      chapters: [],
      createdAt: now,
      updatedAt: now
    };
    if (!persist(Storage.saveProject(proj))) return;
    activeProjectId = proj.id;
    activeChapterId = null;
    persist(Storage.saveSettings({ lastProject: proj.id, lastChapter: null }));
    closeModal();
    titleInp.value = '';
    if ($('#inp-proj-author')) $('#inp-proj-author').value = '';
    if ($('#inp-proj-desc')) $('#inp-proj-desc').value = '';
    renderAll();
  }

  function deleteProject(id) {
    showConfirm(t('confirmDelProj'), () => {
      persist(Storage.deleteProject(id));
      if (activeProjectId === id) {
        activeProjectId = null;
        activeChapterId = null;
      }
      Storage.repairPointers();
      renderAll();
    });
  }

  function selectProject(id) {
    if (id === activeProjectId) { closeSidebar(); return; }
    saveCurrentChapter({ silent: true });
    const proj = Storage.getProject(id);
    activeProjectId = id;
    // Langsung buka bab pertama: lebih cepat menulis, tanpa layar kosong
    activeChapterId = proj && proj.chapters && proj.chapters.length
      ? sortedChapters(proj)[0].id : null;
    dirty = false;
    persist(Storage.saveSettings({ lastProject: id, lastChapter: activeChapterId }));
    renderAll();
    closeSidebar();
  }

  function renameProject(id) {
    const proj = Storage.getProject(id);
    if (!proj) return;
    renameTarget = { type: 'project', id };
    const inp = $('#inp-rename-proj');
    if (inp) inp.value = proj.title;
    openModal('modal-rename-project');
  }

  function saveRenameProject() {
    if (!renameTarget || renameTarget.type !== 'project') { closeModal(); return; }
    const inp = $('#inp-rename-proj');
    if (!inp) return;
    const title = inp.value.trim();
    if (!title) { inp.focus(); return; }
    const proj = Storage.getProject(renameTarget.id);
    if (proj) {
      proj.title = title.slice(0, 300);
      persist(Storage.saveProject(proj));
      renderAll();
    }
    closeModal();
  }

  // ============ CHAPTER CRUD ============
  function createChapter() {
    const proj = Storage.getProject(activeProjectId);
    if (!proj) return;
    if (!proj.chapters) proj.chapters = [];
    const inp = $('#inp-ch-title');
    const title = (inp?.value || '').trim() || `${t('chapter')} ${proj.chapters.length + 1}`;
    const now = new Date().toISOString();
    const ch = {
      id: Storage.uid(),
      title: title.slice(0, 300),
      content: '',
      format: 'html',
      order: sortedChapters(proj).length + 1,
      createdAt: now,
      updatedAt: now
    };
    proj.chapters.push(ch);
    if (!persist(Storage.saveProject(proj))) { proj.chapters.pop(); return; }
    activeChapterId = ch.id;
    dirty = false;
    persist(Storage.saveSettings({ lastChapter: ch.id }));
    closeModal();
    if (inp) inp.value = '';
    renderAll();
    setTimeout(() => { try { dom.editor?.focus(); } catch {} }, 50);
  }

  function deleteChapter(id) {
    showConfirm(t('confirmDelCh'), () => {
      const proj = Storage.getProject(activeProjectId);
      if (!proj) return;
      proj.chapters = (proj.chapters || []).filter(c => c.id !== id);
      sortedChapters(proj).forEach((c, i) => { c.order = i + 1; });
      persist(Storage.saveProject(proj));
      if (activeChapterId === id) {
        activeChapterId = sortedChapters(proj).length ? sortedChapters(proj)[0].id : null;
        dirty = false;
      }
      persist(Storage.saveSettings({ lastChapter: activeChapterId }));
      renderAll();
    });
  }

  function selectChapter(id) {
    if (id === activeChapterId) { closeSidebar(); return; }
    saveCurrentChapter({ silent: true });
    saveReaderPosition();          // ingat posisi baca bab yang ditinggalkan
    activeChapterId = id;
    dirty = false;
    persist(Storage.saveSettings({ lastChapter: id }));
    renderChapters();
    renderEditor();
    closeSidebar();
    if (isReaderMode) {
      // tetap di halaman buku: tampilkan judul bab baru di HUD sebentar
      setHudVisible(true);
      return;
    }
    setTimeout(() => { try { dom.editor?.focus(); } catch {} }, 50);
  }

  function renameChapter(id) {
    const proj = Storage.getProject(activeProjectId);
    const ch = proj?.chapters?.find(c => c.id === id);
    if (!ch) return;
    renameTarget = { type: 'chapter', id };
    const inp = $('#inp-rename-ch');
    if (inp) inp.value = ch.title;
    openModal('modal-rename-chapter');
  }

  function saveRenameChapter() {
    if (!renameTarget || renameTarget.type !== 'chapter') { closeModal(); return; }
    const inp = $('#inp-rename-ch');
    if (!inp) return;
    const title = inp.value.trim();
    if (!title) { inp.focus(); return; }
    const proj = Storage.getProject(activeProjectId);
    const ch = proj?.chapters?.find(c => c.id === renameTarget.id);
    if (ch) {
      ch.title = title.slice(0, 300);
      persist(Storage.saveProject(proj));
      renderAll();
    }
    closeModal();
  }

  // ============ URUTKAN BAB ============
  /**
   * Hitung urutan baru (fungsi murni — mudah diuji).
   * Sisipkan `srcId` sebelum/sesudah `targetId`.
   */
  function computeReorder(ids, srcId, targetId, insertAfter) {
    const arr = ids.slice();
    const srcIdx = arr.indexOf(srcId);
    let tgtIdx = arr.indexOf(targetId);
    if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return null;
    const [moved] = arr.splice(srcIdx, 1);
    if (srcIdx < tgtIdx) tgtIdx -= 1;
    arr.splice(insertAfter ? tgtIdx + 1 : tgtIdx, 0, moved);
    return arr;
  }

  function currentChapterIds() {
    return sortedChapters(Storage.getProject(activeProjectId)).map(c => c.id);
  }

  function applyReorder(srcId, targetId, insertAfter) {
    const next = computeReorder(currentChapterIds(), srcId, targetId, insertAfter);
    if (!next) return false;
    const ok = persist(Storage.reorderChapters(activeProjectId, next));
    renderChapters();
    return ok;
  }

  /* --- Mouse: HTML5 Drag & Drop --- */
  let dragSrcId = null;

  function bindDragDrop() {
    const items = $$('#chapter-list li[draggable]');
    items.forEach(li => {
      li.addEventListener('dragstart', onDragStart);
      li.addEventListener('dragover', onDragOver);
      li.addEventListener('dragleave', onDragLeave);
      li.addEventListener('drop', onDrop);
      li.addEventListener('dragend', onDragEnd);
      // Sentuhan/pena: HTML5 DnD tidak jalan di layar sentuh
      li.addEventListener('pointerdown', onTouchDragStart);
    });
  }

  function onDragStart(e) {
    dragSrcId = this.dataset.id;
    this.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragSrcId); } catch {}
    }
  }

  function onDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (this.dataset.id !== dragSrcId) {
      const rect = this.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      this.classList.toggle('drag-over-after', after);
      this.classList.toggle('drag-over-before', !after);
    }
  }

  function onDragLeave() {
    this.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
  }

  function onDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over', 'drag-over-before', 'drag-over-after');
    const targetId = this.dataset.id;
    if (!dragSrcId || dragSrcId === targetId) return;
    const rect = this.getBoundingClientRect();
    const insertAfter = (e.clientY - rect.top) > rect.height / 2;
    applyReorder(dragSrcId, targetId, insertAfter);
  }

  function onDragEnd() {
    dragSrcId = null;
    $$('#chapter-list li').forEach(li => {
      li.classList.remove('dragging', 'drag-over', 'drag-over-before', 'drag-over-after');
    });
  }

  /* --- Sentuhan/pena: tahan sebentar lalu geser (long-press drag) --- */
  let touchDrag = null;

  function onTouchDragStart(e) {
    if (e.pointerType === 'mouse') return;              // biar DnD native yang menangani
    if (e.target.closest('button')) return;             // jangan ganggu rename/hapus
    const li = e.currentTarget;
    const startY = e.clientY;
    touchDrag = { li, id: li.dataset.id, startY, active: false, pointerId: e.pointerId };
    touchDrag.timer = setTimeout(() => {
      if (!touchDrag) return;
      touchDrag.active = true;
      li.classList.add('dragging');
      li.style.touchAction = 'none';
      try { li.setPointerCapture && li.setPointerCapture(e.pointerId); } catch {}
      try { navigator.vibrate && navigator.vibrate(12); } catch {}
    }, 260);
    window.addEventListener('pointermove', onTouchDragMove);
    window.addEventListener('pointerup', onTouchDragEnd);
    window.addEventListener('pointercancel', onTouchDragEnd);
  }

  function clearDropMarks(except) {
    $$('#chapter-list li').forEach(x => {
      if (x !== except) x.classList.remove('drag-over-before', 'drag-over-after');
    });
  }

  function onTouchDragMove(e) {
    if (!touchDrag) return;
    if (!touchDrag.active) {
      // Gerakan sebelum long-press aktif = pengguna menggulir daftar
      if (Math.abs(e.clientY - touchDrag.startY) > 10) cancelTouchDrag();
      return;
    }
    if (e.cancelable) e.preventDefault();
    const el = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(e.clientX, e.clientY) : null;
    const li = el && el.closest ? el.closest('#chapter-list li') : null;
    clearDropMarks(li);
    if (!li || li === touchDrag.li) return;
    const rect = li.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    li.classList.toggle('drag-over-after', after);
    li.classList.toggle('drag-over-before', !after);
  }

  function onTouchDragEnd(e) {
    if (!touchDrag) return;
    const { li, id, active } = touchDrag;
    if (active) {
      const el = typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(e.clientX, e.clientY) : null;
      const target = el && el.closest ? el.closest('#chapter-list li') : null;
      if (target && target !== li && target.dataset.id) {
        const rect = target.getBoundingClientRect();
        applyReorder(id, target.dataset.id, (e.clientY - rect.top) > rect.height / 2);
      } else {
        renderChapters();
      }
    }
    cancelTouchDrag();
  }

  function cancelTouchDrag() {
    if (touchDrag) {
      clearTimeout(touchDrag.timer);
      if (touchDrag.li) {
        touchDrag.li.classList.remove('dragging');
        touchDrag.li.style.touchAction = '';
        try { touchDrag.li.releasePointerCapture && touchDrag.li.releasePointerCapture(touchDrag.pointerId); } catch {}
      }
    }
    touchDrag = null;
    $$('#chapter-list li').forEach(li => li.classList.remove('drag-over-before', 'drag-over-after'));
    window.removeEventListener('pointermove', onTouchDragMove);
    window.removeEventListener('pointerup', onTouchDragEnd);
    window.removeEventListener('pointercancel', onTouchDragEnd);
  }

  /** Pindahkan bab satu posisi lewat keyboard (Alt+Panah). */
  function moveChapterByKeyboard(id, dir) {
    const ids = currentChapterIds();
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return false;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const ok = persist(Storage.reorderChapters(activeProjectId, ids));
    renderChapters();
    const el = $$('#chapter-list li').find(li => li.dataset.id === id);
    if (el) { try { el.focus(); } catch {} }
    return ok;
  }

  // ============ EDITOR ============
  function markDirty() {
    dirty = true;
    RichText.syncEmpty(dom.editor);
    updateHudInfo();        // hitungan kata di HUD ikut tiap ketikan
    scheduleTypewriter();   // Mode Fokus: jaga baris aktif di tengah
    autoSave();
  }

   /**
   * Simpan isi editor ke bab aktif (selalu HTML kanonik tersanitasi).
   * Mengembalikan true bila tersimpan / tidak ada yang perlu disimpan.
   */
  function saveCurrentChapter(opts) {
    const o = opts || {};
    clearTimeout(saveTimer);
    if (!activeChapterId || !activeProjectId || !dom.editor) return true;
    /* Mode Baca: editor tersembunyi dan masih memuat bab yang DIBUKA SEBELUMNYA
       (pindah bab di Mode Baca tidak menyentuh editor). Menulis isi DOM editor
       ke bab aktif akan menimpa bab yang salah -> sumber kebenaran = storage. */
    if (isReaderMode || dom.editor.hidden) { dirty = false; return true; }
    const proj = Storage.getProject(activeProjectId);
    if (!proj) return true;
    const ch = proj.chapters?.find(c => c.id === activeChapterId);
    if (!ch) return true;
    const newContent = RichText.getHtml(dom.editor);
    if (ch.format === 'html' && ch.content === newContent) { dirty = false; return true; }
    ch.content = newContent;
    ch.format = 'html';
    ch.updatedAt = new Date().toISOString();
    const ok = Storage.saveProject(proj);
    if (ok) {
      dirty = false;
      updateStats();
      if (!o.silent) showSaving();
    } else {
      dirty = true;
      persist(false);
    }
    return ok;
  }

  function showSaving() {
    if (!dom.saveIndicator) return;
    dom.saveIndicator.classList.remove('save-error');
    dom.saveIndicator.hidden = false;
    clearTimeout(showSaving._t);
    showSaving._t = setTimeout(() => { if (dom.saveIndicator) dom.saveIndicator.hidden = true; }, 1500);
  }

  function showSaveError() {
    if (!dom.saveIndicator) return;
    dom.saveIndicator.classList.add('save-error');
    dom.saveIndicator.hidden = false;
    clearTimeout(showSaving._t);
  }

  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveCurrentChapter(); }, autoSaveDelay);
  }

  /** Simpan sekarang juga (dipakai saat unload / ganti bab / ekspor). */
  function flushNow() {
    clearTimeout(saveTimer);
    return saveCurrentChapter({ silent: true });
  }

  /**
   * Terapkan perintah panel format ke seleksi di editor.
   * fmt: 'bold' | 'italic' | 'heading' | 'quote' | 'scene'
   * (semua operasi DOM nyata — tidak ada penanda teks yang disisipkan).
   */
  function applyFmt(fmt) {
    const ed = dom.editor;
    if (!ed || ed.hidden) return;
    let ok = false;
    if (fmt === 'bold') ok = RichText.toggleInline(ed, 'strong');
    else if (fmt === 'italic') ok = RichText.toggleInline(ed, 'em');
    else if (fmt === 'heading') ok = RichText.toggleBlock(ed, 'h2');
    else if (fmt === 'quote') ok = RichText.toggleBlock(ed, 'blockquote');
    else if (fmt === 'scene') ok = RichText.insertSceneBreak(ed);
    if (ok) {
      markDirty();
      updateToolbar();
      try { ed.focus(); } catch {}
    }
  }

  /** Sinkronkan tombol panel format (aria-pressed) dengan posisi kursor. */
  function updateToolbar() {
    if (!dom.formatBar || !dom.editor || dom.editor.hidden) return;
    const st = RichText.queryState(dom.editor);
    const press = (id, on) => {
      const b = $(id);
      if (b) b.setAttribute('aria-pressed', String(!!on));
    };
    press('#btn-bold', st.bold);
    press('#btn-italic', st.italic);
    press('#btn-heading', st.heading);
    press('#btn-quote', st.quote);
  }

  /**
   * Tab / Shift+Tab = indent & un-indent tiap paragraf tersentuh seleksi.
   * Seleksi TIDAK PERNAH ditimpa (bug lama: seluruh bab bisa lenyap).
   */
  function handleTab(e) {
    const ed = dom.editor;
    if (!ed) return;
    e.preventDefault();
    if (RichText.indent(ed, e.shiftKey ? -1 : 1)) markDirty();
  }

  // ============ MODE IMERSIF: MODE FOKUS & MODE BACA ============
  /* Layar penuh tanpa gangguan sama sekali:
     1. Seluruh chrome (sidebar, toolbar, panel format, statistik,
        scrollbar) dihapus dari layar oleh CSS `html.immersive` — bukan
        digeser, jadi tidak menyisakan ruang layout.
     2. Browser diminta masuk layar penuh (Fullscreen API). Bisa
        dimatikan di Pengaturan; bila ditolak (iframe/izin), mode tetap
        berjalan penuh lewat CSS.
     3. Satu-satunya kontrol = HUD melayang: muncul saat pointer menyentuh
        tepi atas layar atau saat dinavigasi keyboard, lalu memudar sendiri.
        HUD tidak pernah menghalangi teks (pointer-events: none saat pudar).
     4. Kursor mouse ikut disembunyikan setelah tangan pindah ke keyboard. */

  const HUD_PEEK_EDGE  = 84;    // px dari tepi atas = area pemanggil HUD
  const HUD_HIDE_MS    = 2200;  // ms HUD bertahan tanpa interaksi
  const CURSOR_IDLE_MS = 2400;  // ms tanpa gerak pointer -> kursor disembunyikan
  const READER_POS_KEY = 'novel-writer-reader-pos';
  const FONT_MIN = 14, FONT_MAX = 28;

  /** requestAnimationFrame (dengan jaring pengaman di lingkungan tanpa rAF). */
  function raf(fn) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }

  function isImmersive() { return isFocusMode || isReaderMode; }

  /** Layar sentuh / tanpa hover: aturan HUD-nya sedikit berbeda. */
  function coarsePointer() {
    try {
      return !!(window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches);
    } catch { return false; }
  }

  /* ---- Layar penuh browser ---- */

  function fsActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  /** Minta layar penuh; gagal/ditolak TIDAK membatalkan mode imersif. */
  function requestImmersiveFullscreen() {
    if (!immersiveFullscreen) return Promise.resolve(false);
    const el = document.documentElement;
    if (!el) return Promise.resolve(false);
    // Sudah penuh (atau sudah diminta) — mis. pindah Mode Fokus <-> Mode Baca:
    // jangan keluar-masuk layar penuh, itu membuat kedipan yang mengganggu.
    if (fsActive() || fsRequested) return Promise.resolve(true);
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (typeof fn !== 'function') return Promise.resolve(false);
    let p;
    try { p = fn.call(el, { navigationUI: 'hide' }); }
    catch { try { p = fn.call(el); } catch { return Promise.resolve(false); } }
    if (!p || typeof p.then !== 'function') return Promise.resolve(false);
    fsRequested = true;
    return p.then(() => true).catch(() => {
      fsRequested = false;
      // Cukup sekali per sesi: mode tetap jalan penuh lewat CSS
      if (!fsFailNotified) { fsFailNotified = true; toast(t('fullscreenFail'), 5000); }
      return false;
    });
  }

  /** Lepas layar penuh — hanya bila aplikasi yang memintanya. */
  function leaveImmersiveFullscreen() {
    if (!fsRequested) return;
    fsRequested = false;
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (typeof fn !== 'function') return;
    try {
      const p = fn.call(document);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
  }

  /** Layar penuh ditutup dari luar (Esc browser, tombol OS) -> ikut keluar. */
  function onFullscreenChange() {
    if (fsActive()) return;
    fsRequested = false;
    if (isFocusMode) exitFocusMode(false);
    else if (isReaderMode) exitReaderMode(false);
  }

  /* ---- HUD ---- */

  function hudVisible() {
    return !!(dom.hud && dom.hud.classList.contains('is-visible'));
  }

  function setHudVisible(show, autoHide = true) {
    if (!dom.hud || dom.hud.hidden) return;
    dom.hud.classList.toggle('is-visible', !!show);
    clearTimeout(hudTimer);
    hudTimer = null;
    if (!show || !autoHide) return;
    hudTimer = setTimeout(() => {
      if (!dom.hud || dom.hud.hidden) return;
      if (dom.hud.contains(document.activeElement)) return; // sedang dipakai keyboard
      setHudVisible(false, false);
    }, coarsePointer() ? HUD_HIDE_MS * 2 : HUD_HIDE_MS);
  }

  /** Bagian HUD yang murah (dipanggil tiap ketikan / tiap gulungan). */
  function updateHudInfo() {
    if (!dom.hud || dom.hud.hidden) return;
    if (dom.hudInfo) {
      if (isReaderMode) {
        const proj = Storage.getProject(activeProjectId);
        const ch = proj?.chapters?.find(c => c.id === activeChapterId);
        const title = (ch && ch.title) || t('chapter');
        dom.hudInfo.textContent = `${title} · ${Math.round(readerPct)}%`;
      } else {
        dom.hudInfo.textContent = wordsLabel(currentWords());
      }
    }
    if (dom.hudProgress) {
      const pct = isReaderMode ? Math.max(0, Math.min(100, readerPct)) : 0;
      dom.hudProgress.style.width = pct.toFixed(1) + '%';
    }
  }

  /** Isi HUD lengkap: tombol, label, ikon, keadaan nonaktif. */
  function updateHud() {
    if (!dom.hud) return;
    updateHudInfo();
    const ids = currentChapterIds();
    const i = ids.indexOf(activeChapterId);
    const many = ids.length > 1;
    if (dom.hudPrev) { dom.hudPrev.hidden = !many; dom.hudPrev.disabled = i <= 0; }
    if (dom.hudNext) { dom.hudNext.hidden = !many; dom.hudNext.disabled = i < 0 || i >= ids.length - 1; }
    const sepNav = dom.hud.querySelector('.hud-sep');
    if (sepNav) sepNav.hidden = !many;

    if (dom.hudTheme) {
      const dark = document.documentElement.dataset.theme === 'dark';
      dom.hudTheme.innerHTML = dark ? Icons.sun : Icons.moon;
      const label = dark ? t('themeToLight') : t('themeToDark');
      dom.hudTheme.title = label;
      dom.hudTheme.setAttribute('aria-label', label);
    }
    if (dom.hudSwitch) {
      dom.hudSwitch.innerHTML = isReaderMode ? Icons.write : Icons.bookOpen;
      const label = isReaderMode ? t('toFocusMode') : t('toReaderMode');
      dom.hudSwitch.title = label;
      dom.hudSwitch.setAttribute('aria-label', label);
    }
    if (dom.hudExit) {
      const label = isReaderMode ? t('exitReaderMode') : t('exitFocusMode');
      dom.hudExit.innerHTML = Icons.minimize;
      dom.hudExit.title = `${label} (Esc)`;
      dom.hudExit.setAttribute('aria-label', label);
    }
    const size = Storage.getSettings().fontSize || 18;
    if (dom.hudFontDown) {
      dom.hudFontDown.disabled = size <= FONT_MIN;
      dom.hudFontDown.title = t('smallerFont');
      dom.hudFontDown.setAttribute('aria-label', t('smallerFont'));
    }
    if (dom.hudFontUp) {
      dom.hudFontUp.disabled = size >= FONT_MAX;
      dom.hudFontUp.title = t('largerFont');
      dom.hudFontUp.setAttribute('aria-label', t('largerFont'));
    }
  }

  /** Jumlah kata bab aktif — dibaca langsung dari editor saat menulis. */
  function currentWords() {
    if (dom.editor && !dom.editor.hidden && (dirty || isFocusMode)) {
      return TextUtil.countWords((dom.editor.textContent || '').replace(/\u00a0/g, ' '));
    }
    const proj = Storage.getProject(activeProjectId);
    const ch = proj?.chapters?.find(c => c.id === activeChapterId);
    return ch ? wordCount(ch.content || '', ch.format) : 0;
  }

  function wordsLabel(n) {
    const num = nf(n);
    const one = (typeof getLang === 'function' && getLang() === 'en' && Number(n) === 1);
    return t(one ? 'wordCountOne' : 'wordsCount', { n: num });
  }

  /** Pointer menyentuh tepi atas -> HUD muncul sebentar. */
  function onImmersivePointer(e) {
    if (!isImmersive()) return;
    wakeCursor();
    const y = typeof e.clientY === 'number' ? e.clientY : -1;
    if (y < 0) return;
    if (dom.hud && e.target && dom.hud.contains(e.target)) { setHudVisible(true); return; }
    const edge = coarsePointer()
      ? Math.max(72, Math.round((window.innerHeight || 0) * 0.14))
      : HUD_PEEK_EDGE;
    if (y <= edge) setHudVisible(true);
    else if (coarsePointer()) setHudVisible(false, false); // ketukan di teks = sembunyikan
  }

  /* ---- Kursor mouse yang menganggur ---- */

  function wakeCursor() {
    document.documentElement.classList.remove('cursor-idle');
    clearTimeout(cursorTimer);
    if (!isImmersive()) return;
    cursorTimer = setTimeout(() => {
      if (!isImmersive() || hudVisible()) return;
      document.documentElement.classList.add('cursor-idle');
    }, CURSOR_IDLE_MS);
  }

  /* ---- Progres & posisi baca ---- */

  function readerProgressPct() {
    const wrap = dom.editorWrap;
    if (!wrap) return null;
    const max = wrap.scrollHeight - wrap.clientHeight;
    if (!(max > 1)) return 100;   // lebih pendek dari satu layar = sudah terbaca
    return Math.min(100, Math.max(0, (wrap.scrollTop / max) * 100));
  }

  function updateReaderProgress() {
    const pct = readerProgressPct();
    if (pct == null) return;
    readerPct = pct;
    updateHudInfo();
  }

  function readPositions() {
    try { return JSON.parse(sessionStorage.getItem(READER_POS_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  /** Simpan posisi baca bab aktif (rasio, bukan piksel — tahan ubah ukuran). */
  function saveReaderPosition(id) {
    const key = id || activeChapterId;
    if (!key || !isReaderMode) return;
    const wrap = dom.editorWrap;
    if (!wrap) return;
    const max = wrap.scrollHeight - wrap.clientHeight;
    if (!(max > 1)) return;
    const ratio = Math.min(1, Math.max(0, wrap.scrollTop / max));
    const map = readPositions();
    map[key] = Math.round(ratio * 1000) / 1000;
    try { sessionStorage.setItem(READER_POS_KEY, JSON.stringify(map)); } catch {}
  }

  /** Lanjutkan membaca dari posisi terakhir bab ini. */
  function restoreReaderPosition(id) {
    if (!isReaderMode || !id) return;
    const ratio = Number(readPositions()[id]);
    const wrap = dom.editorWrap;
    if (Number.isFinite(ratio) && ratio > 0 && wrap) {
      const max = wrap.scrollHeight - wrap.clientHeight;
      if (max > 1) wrap.scrollTop = Math.round(max * Math.min(1, ratio));
    }
    updateReaderProgress();
  }

  function onReaderScroll() {
    if (!isReaderMode || readerRaf) return;
    readerRaf = raf(() => {
      readerRaf = 0;
      updateReaderProgress();
      // Menyimpan posisi cukup sekali setelah gulungan berhenti (bukan tiap frame)
      clearTimeout(readerPosTimer);
      readerPosTimer = setTimeout(() => saveReaderPosition(), 400);
    });
  }

  /* ---- Navigasi baca ---- */

  /** Pindah bab tanpa meninggalkan mode imersif. */
  function chapterStep(delta) {
    const ids = currentChapterIds();
    const i = ids.indexOf(activeChapterId);
    if (i < 0) return false;
    const j = i + delta;
    if (j < 0) { toast(t('firstChapter'), 1800); return false; }
    if (j >= ids.length) { toast(t('lastChapter'), 1800); return false; }
    selectChapter(ids[j]);
    return true;
  }

  function readerScrollBy(px) {
    const wrap = dom.editorWrap;
    if (!wrap) return;
    const max = wrap.scrollHeight - wrap.clientHeight;
    if (!(max > 0)) return;
    wrap.scrollTop = Math.min(max, Math.max(0, wrap.scrollTop + px));
  }

  function readerPage(delta) {
    const wrap = dom.editorWrap;
    const vh = (wrap && wrap.clientHeight) || window.innerHeight || 600;
    readerScrollBy(delta * Math.max(80, Math.round(vh * 0.88)));
  }

  function readerScrollToRatio(ratio) {
    const wrap = dom.editorWrap;
    if (!wrap) return;
    const max = wrap.scrollHeight - wrap.clientHeight;
    if (!(max > 0)) return;
    wrap.scrollTop = Math.round(max * Math.min(1, Math.max(0, ratio)));
  }

  /** Pembacaan lewat keyboard tidak boleh membajak kontrol yang sedang fokus. */
  function readerKeysAllowed() {
    if (!isReaderMode || modalOpen()) return false;
    const a = document.activeElement;
    if (!a || !a.tagName) return true;
    return !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(a.tagName);
  }

  /**
   * Panah kiri/kanan di dalam HUD = pindah tombol (pola toolbar ARIA),
   * BUKAN ganti bab — supaya kontrol yang sedang difokuskan tetap bisa
   * dipakai penuh dari keyboard.
   */
  function hudArrowNav(e) {
    if (!dom.hud || dom.hud.hidden) return false;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
    const active = document.activeElement;
    if (!active || !dom.hud.contains(active)) return false;
    const items = $$('.hud-btn', dom.hud).filter(b =>
      !b.hidden && !b.disabled && !(isFocusMode && b.classList.contains('hud-font')));
    const i = items.indexOf(active);
    if (i < 0) return false;
    e.preventDefault();
    items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length].focus();
    setHudVisible(true, false);
    return true;
  }

  /** Space / PageUp-Down / panah / Home / End saat Mode Baca. */
  function handleReaderKey(e) {
    if (!readerKeysAllowed() || e.ctrlKey || e.metaKey || e.altKey) return false;
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); chapterStep(1); return true;
      case 'ArrowLeft':  e.preventDefault(); chapterStep(-1); return true;
      case 'PageDown':   e.preventDefault(); readerPage(1); return true;
      case 'PageUp':     e.preventDefault(); readerPage(-1); return true;
      case ' ': case 'Spacebar':
        e.preventDefault(); readerPage(e.shiftKey ? -1 : 1); return true;
      case 'ArrowDown':  e.preventDefault(); readerPage(0.35); return true;
      case 'ArrowUp':    e.preventDefault(); readerPage(-0.35); return true;
      case 'Home':       e.preventDefault(); readerScrollToRatio(0); return true;
      case 'End':        e.preventDefault(); readerScrollToRatio(1); return true;
      default: return false;
    }
  }

  /* ---- Typewriter (Mode Fokus): baris aktif dijaga di tengah ---- */

  function scheduleTypewriter() {
    if (!isFocusMode || !typewriterOn || typewriterRaf) return;
    typewriterRaf = raf(() => { typewriterRaf = 0; typewriterScroll(); });
  }

  function typewriterScroll() {
    if (!isFocusMode || !typewriterOn) return;
    const ed = dom.editor;
    if (!ed || ed.hidden) return;
    const doc = ed.ownerDocument || document;
    const sel = doc.getSelection ? doc.getSelection() : null;
    if (!sel || !sel.rangeCount) return;
    let rect = null;
    try {
      const r = sel.getRangeAt(0);
      const rects = typeof r.getClientRects === 'function' ? r.getClientRects() : null;
      rect = (rects && rects.length ? rects[rects.length - 1] : null) ||
             (typeof r.getBoundingClientRect === 'function' ? r.getBoundingClientRect() : null);
    } catch { return; }
    const vh = window.innerHeight || 0;
    // Tanpa layout nyata (mis. jsdom) semua nilai 0 -> tidak ada yang digulirkan
    if (!rect || !vh || (!rect.top && !rect.bottom && !rect.height)) return;
    const delta = rect.top - vh * 0.45;
    if (Math.abs(delta) < 24) return;   // hindari getar untuk geseran kecil
    try {
      if (typeof ed.scrollBy === 'function') ed.scrollBy({ top: delta, behavior: 'smooth' });
      else ed.scrollTop += delta;
    } catch { try { ed.scrollTop += delta; } catch {} }
  }

  /* ---- Sinkronisasi chrome imersif ---- */

  /** Selaraskan kelas, HUD, dan layar penuh dengan mode yang aktif. */
  function syncImmersive() {
    const root = document.documentElement;
    const on = isImmersive();
    root.classList.toggle('immersive', on);
    root.classList.toggle('typewriter', on && isFocusMode && typewriterOn);
    if (dom.hud) dom.hud.hidden = !on;
    if (!on) {
      clearTimeout(hudTimer);    hudTimer = null;
      clearTimeout(cursorTimer); cursorTimer = null;
      clearTimeout(readerPosTimer); readerPosTimer = null;
      root.classList.remove('cursor-idle');
      if (dom.hud) dom.hud.classList.remove('is-visible');
      leaveImmersiveFullscreen();
      return;
    }
    updateHud();
    setHudVisible(true);
    wakeCursor();
  }

  /** Ukuran huruf dari HUD (Mode Baca) — pengaturan global yang sama. */
  function bumpFontSize(delta) {
    const s = Storage.getSettings();
    const next = Math.min(FONT_MAX, Math.max(FONT_MIN, (s.fontSize || 18) + delta));
    if (next === s.fontSize) { updateHud(); return; }
    applyFontSize(next);
    persist(Storage.saveSettings({ fontSize: next }));
    updateHud();
    setHudVisible(true);
  }

  /** Tombol "baca/tulis" di HUD: berpindah tanpa keluar dari layar penuh. */
  function switchImmersiveMode() {
    if (isReaderMode) enterFocusMode();
    else if (isFocusMode) enterReaderMode();
  }

  function exitImmersive(showToast = true) {
    if (isFocusMode) exitFocusMode(showToast);
    else if (isReaderMode) exitReaderMode(showToast);
  }

  // ============ MODE FOKUS & MODE BACA (masuk / keluar) ============
  function updateFocusReaderButtons() {
    if (dom.btnFocus) {
      dom.btnFocus.setAttribute('aria-pressed', String(isFocusMode));
      const label = isFocusMode ? t('exitFocusMode') : t('focusMode');
      dom.btnFocus.title = label + ' (' + t('shortcutFocus') + ')';
      dom.btnFocus.setAttribute('aria-label', label);
      dom.btnFocus.innerHTML = isFocusMode ? Icons.minimize : Icons.maximize;
    }
    if (dom.btnReader) {
      dom.btnReader.setAttribute('aria-pressed', String(isReaderMode));
      const label = isReaderMode ? t('exitReaderMode') : t('readerMode');
      dom.btnReader.title = label + ' (' + t('shortcutReader') + ')';
      dom.btnReader.setAttribute('aria-label', label);
      dom.btnReader.innerHTML = Icons.bookOpen;
    }
  }

  function enterFocusMode() {
    if (!activeChapterId) { toast(t('selectChapter')); return; }
    if (modalOpen()) closeModal();     // modal = gangguan: tutup dulu
    saveCurrentChapter({ silent: true });
    const wasImmersive = isImmersive();
    isReaderMode = false;
    isFocusMode = true;
    const root = document.documentElement;
    root.classList.remove('reader-mode');
    root.classList.add('focus-mode');
    closeSidebar();
    renderEditor();
    syncImmersive();                       // chrome hilang, HUD menyala sebentar
    requestImmersiveFullscreen();          // layar penuh browser (bila diizinkan)
    if (!wasImmersive) toast(t('focusToast'), 3000);
    setTimeout(() => { try { dom.editor?.focus(); } catch {} }, 80);
  }

  function exitFocusMode(showToast = true) {
    if (!isFocusMode) return;
    isFocusMode = false;
    document.documentElement.classList.remove('focus-mode', 'typewriter');
    renderEditor();
    syncImmersive();                       // HUD & layar penuh dilepas
    updateFocusReaderButtons();
    if (showToast) toast(t('exitFocusMode'), 2000);
    setTimeout(() => { try { dom.editor?.focus(); } catch {} }, 50);
  }

  function toggleFocusMode() {
    if (isFocusMode) exitFocusMode();
    else enterFocusMode();
  }

  function enterReaderMode() {
    if (!activeChapterId) { toast(t('selectChapter')); return; }
    if (modalOpen()) closeModal();     // modal = gangguan: tutup dulu
    saveCurrentChapter({ silent: true });
    const wasImmersive = isImmersive();
    isFocusMode = false;
    isReaderMode = true;
    const root = document.documentElement;
    root.classList.remove('focus-mode', 'typewriter');
    root.classList.add('reader-mode');
    closeSidebar();
    renderEditor();                        // merender halaman buku (renderReader)
    syncImmersive();
    requestImmersiveFullscreen();
    if (!wasImmersive) toast(t('readerToast'), 3500);
  }

  function exitReaderMode(showToast = true) {
    if (!isReaderMode) return;
    saveReaderPosition();                  // lanjutkan di sini lain kali
    isReaderMode = false;
    readerPct = 0;
    dirty = false;                         // isi editor basi -> muat ulang dari storage
    document.documentElement.classList.remove('reader-mode');
    renderEditor();
    syncImmersive();
    updateFocusReaderButtons();
    if (showToast) toast(t('exitReaderMode'), 2000);
    setTimeout(() => { try { if (!isReaderMode) dom.editor?.focus(); } catch {} }, 50);
  }

  function toggleReaderMode() {
    if (isReaderMode) exitReaderMode();
    else enterReaderMode();
  }
  function sidebarOpen() {
    return !!(dom.sidebar && dom.sidebar.classList.contains('open'));
  }

  function sidebarCollapsed() {
    const app = $('#app');
    return !!(app && app.classList.contains('sidebar-collapsed'));
  }

  // ============ SIDEBAR ============
  function isMobileViewport() {
    try {
      // jsdom (pengujian) tidak punya viewport nyata — anggap mobile agar drawer diuji
      if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return true;
      return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 880px)').matches);
    } catch { return false; }
  }

  function openSidebar() {
    if (!dom.sidebar) return;
    if (isMobileViewport()) {
      dom.sidebar.classList.add('open');
      if (dom.overlay) dom.overlay.hidden = false;
      document.body.style.overflow = 'hidden';
    } else {
      setSidebarCollapsed(false);
      return;
    }
    applySidebarLabels();
  }

  function closeSidebar() {
    if (!dom.sidebar) return;
    if (isMobileViewport()) {
      dom.sidebar.classList.remove('open');
      if (dom.overlay) dom.overlay.hidden = true;
      document.body.style.overflow = '';
    } else {
      if (dom.overlay) dom.overlay.hidden = true;
      dom.sidebar.classList.remove('open');
    }
    applySidebarLabels();
  }

  function setSidebarCollapsed(v, persistIt = true) {
    const app = $('#app');
    if (!app) return;
    app.classList.toggle('sidebar-collapsed', !!v);
    if (persistIt) persist(Storage.saveSettings({ sidebarCollapsed: !!v }));
    if (!isMobileViewport() && dom.sidebar) {
      dom.sidebar.classList.remove('open');
      if (dom.overlay) dom.overlay.hidden = true;
      document.body.style.overflow = '';
    }
    applySidebarLabels();
  }

  function toggleSidebar() {
    if (isMobileViewport()) {
      if (sidebarOpen()) closeSidebar();
      else openSidebar();
      return;
    }
    setSidebarCollapsed(!sidebarCollapsed());
  }

  function applySidebarLabels() {
    const btnOpen = $('#btn-open-sidebar');
    const btnClose = $('#btn-close-sidebar');
    const isMobile = isMobileViewport();
    const collapsed = sidebarCollapsed();
    const isOpen = sidebarOpen();
    if (btnOpen) {
      let title, aria;
      if (isMobile) {
        btnOpen.setAttribute('aria-expanded', String(isOpen));
        title = t('menu');
        aria = t('menu');
      } else {
        btnOpen.setAttribute('aria-expanded', String(!collapsed));
        title = collapsed ? t('showSidebar') : t('hideSidebar');
        aria = title;
      }
      btnOpen.title = title;
      btnOpen.setAttribute('aria-label', aria);
    }
    if (btnClose) {
      const closeTitle = isMobile ? t('close') : t('hideSidebar');
      btnClose.title = closeTitle;
      btnClose.setAttribute('aria-label', closeTitle);
    }
  }

  // ============ THEME ============
  function toggleTheme() {
    const s = Storage.getSettings();
    const next = s.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    persist(Storage.saveSettings({ theme: next }));
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    if (dom.btnTheme) dom.btnTheme.innerHTML = theme === 'dark' ? Icons.sun : Icons.moon;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#17150f' : '#f4f1e8';
    applyDynamicLabels();
  }

  // ============ BACKUP / RESTORE ============
  function backupData() {
    flushNow();                                   // pastikan isi terbaru ikut
    const json = Storage.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    Exporter.download(blob, `novel-writer-backup-${date}.json`);
    toast(t('backupDone'));
  }

  /** Terapkan ulang seluruh settings + render setelah data diganti total. */
  function afterDataReplaced() {
    Storage.invalidate();
    const s = Storage.getSettings();
    activeProjectId = s.lastProject;
    activeChapterId = s.lastChapter;
    // Data diganti total -> keluar dari mode imersif (chrome & layar penuh dilepas)
    if (isImmersive()) {
      isFocusMode = false;
      isReaderMode = false;
      readerPct = 0;
      document.documentElement.classList.remove('focus-mode', 'reader-mode', 'typewriter');
      syncImmersive();
    }
    dirty = false;
    autoSaveDelay = s.autoSaveDelay || 1000;
    applyTheme(s.theme);
    applyLanguage(s.lang);
    const langSel = $('#set-lang'); if (langSel) langSel.value = s.lang;
    applyFontSize(s.fontSize);
    applyLineHeight(s.lineHeight || 1.8);
    applyAutoSave(autoSaveDelay);
    setSidebarCollapsed(s.sidebarCollapsed === true, false);
    renderAll();
    applySidebarLabels();
  }

  function updateUndoRestoreButton() {
    const btn = $('#btn-undo-restore');
    if (btn) btn.hidden = !Storage.hasSnapshot();
  }

  /**
   * Pulihkan dari file: validasi -> konfirmasi berisi ringkasan -> impor.
   * Data lama di-snapshot otomatis sehingga bisa dibatalkan.
   */
  function requestRestore(file) {
    const reader = new FileReader();
    reader.onerror = () => toast(t('restoreFail'), 4000, 'error');
    reader.onload = (e) => {
      const text = String(e.target && e.target.result || '');
      let incoming;
      try {
        incoming = Storage.summarizeJson(text);
      } catch (err) {
        toast(t('restoreFail'), 4000, 'error');
        return;
      }
      const cur = Storage.summarizeCurrent();
      showConfirm(t('confirmRestore', {
        projects: incoming.projects, chapters: incoming.chapters, words: nf(incoming.words),
        curProjects: cur.projects, curChapters: cur.chapters, curWords: nf(cur.words)
      }), () => {
        let ok = false;
        try { ok = Storage.importAll(text); }
        catch (err) { console.warn('Restore gagal:', err); }
        if (!ok) {
          toast(Storage.lastError() === 'quota' ? t('storageFull') : t('restoreFail'), 8000, 'error');
          return;
        }
        afterDataReplaced();
        updateUndoRestoreButton();
        closeModal();
        toast(t('restoreDone'), 3000);
      }, { confirmLabel: t('continue'), danger: false });
    };
    reader.readAsText(file);
  }

  function undoRestore() {
    if (!Storage.hasSnapshot()) { toast(t('undoRestoreNone'), 3000); return; }
    if (!Storage.restoreSnapshot()) { toast(t('undoRestoreFail'), 4000, 'error'); return; }
    afterDataReplaced();
    updateUndoRestoreButton();
    toast(t('undoRestoreDone'), 3000);
  }

  // ============ SETTINGS ============
  function applyFontSize(size) {
    document.documentElement.style.setProperty('--editor-size', size + 'px');
    const val = $('#fontsize-val');
    if (val) val.textContent = size + 'px';
    const inp = $('#set-fontsize');
    if (inp) inp.value = size;
  }

  function applyLineHeight(lh) {
    document.documentElement.style.setProperty('--editor-lh', lh);
    const val = $('#lineheight-val');
    if (val) val.textContent = Number(lh).toFixed(1);
    const inp = $('#set-lineheight');
    if (inp) inp.value = lh;
  }

  function applyAutoSave(delay) {
    autoSaveDelay = delay;
    const val = $('#autosave-val');
    if (val) val.textContent = (delay / 1000).toFixed(1) + 's';
    const inp = $('#set-autosave');
    if (inp) inp.value = delay;
  }

  // ============ SINKRONISASI ANTAR-TAB ============
  /* Tab lain menulis -> adopsi data baru TANPA menulis balik (mencegah
     ping-pong), dan pertahankan ketikan yang belum tersimpan di editor. */
  function onExternalStorage(e) {
    if (e.key !== DB_KEY) return;
    const keep = (dirty && dom.editor && !dom.editor.hidden) ? RichText.getHtml(dom.editor) : null;
    afterDataReplaced();
    if (keep != null && dom.editor) {
      RichText.setContent(dom.editor, keep, 'html');
      dirty = true;
      autoSave();
    }
    toast(t('syncedFromOtherTab'), 2500);
  }

  // ============ EVENTS ============
  function bindEvents() {
  $('#btn-open-sidebar')?.addEventListener('click', toggleSidebar);
  $('#btn-close-sidebar')?.addEventListener('click', () => {
    if (isMobileViewport()) closeSidebar(); else setSidebarCollapsed(true);
  });
    dom.overlay?.addEventListener('click', closeSidebar);

    $('#btn-new-project')?.addEventListener('click', () => openModal('modal-project'));
    $('#btn-empty-action')?.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      openModal(action === 'new-chapter' ? 'modal-chapter' : 'modal-project');
    });
    $('#btn-create-project')?.addEventListener('click', createProject);
    $('#btn-save-rename-proj')?.addEventListener('click', saveRenameProject);

    dom.projectList?.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del-proj]');
      if (del) { e.stopPropagation(); deleteProject(del.dataset.delProj); return; }
      const ren = e.target.closest('[data-rename-proj]');
      if (ren) { e.stopPropagation(); renameProject(ren.dataset.renameProj); return; }
      const li = e.target.closest('li[data-id]');
      if (li) selectProject(li.dataset.id);
    });

    dom.projectList?.addEventListener('keydown', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectProject(li.dataset.id); }
    });

    $('#btn-new-chapter')?.addEventListener('click', () => openModal('modal-chapter'));
    $('#btn-create-chapter')?.addEventListener('click', createChapter);
    $('#btn-save-rename-ch')?.addEventListener('click', saveRenameChapter);

    dom.chapterList?.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del-ch]');
      if (del) { e.stopPropagation(); deleteChapter(del.dataset.delCh); return; }
      const ren = e.target.closest('[data-rename-ch]');
      if (ren) { e.stopPropagation(); renameChapter(ren.dataset.renameCh); return; }
      const li = e.target.closest('li[data-id]');
      if (li) selectChapter(li.dataset.id);
    });

    dom.chapterList?.addEventListener('keydown', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectChapter(li.dataset.id); return; }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        moveChapterByKeyboard(li.dataset.id, e.key === 'ArrowDown' ? 1 : -1);
      }
    });

    dom.editor?.addEventListener('input', markDirty);
    dom.editor?.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { handleTab(e); return; }
      // Ctrl/Cmd+B, I = tebal / miring (format asli, tanpa penanda)
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && !e.shiftKey) {
        const k = typeof e.key === 'string' ? e.key.toLowerCase() : '';
        if (k === 'b') { e.preventDefault(); applyFmt('bold'); return; }
        if (k === 'i') { e.preventDefault(); applyFmt('italic'); }
      }
    });

    // Panel format: mousedown disimpan agar seleksi di editor tidak hilang
    if (dom.formatBar) {
      dom.formatBar.addEventListener('mousedown', (e) => { e.preventDefault(); });
      dom.formatBar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-fmt]');
        if (btn) applyFmt(btn.dataset.fmt);
      });
    }
    document.addEventListener('selectionchange', () => { updateToolbar(); scheduleTypewriter(); });

    dom.btnFocus?.addEventListener('click', toggleFocusMode);
    dom.btnReader?.addEventListener('click', toggleReaderMode);
    $('#btn-theme')?.addEventListener('click', toggleTheme);

    /* ---- HUD imersif (Mode Fokus & Mode Baca) ---- */
    dom.hudPrev?.addEventListener('click', () => { chapterStep(-1); });
    dom.hudNext?.addEventListener('click', () => { chapterStep(1); });
    dom.hudFontDown?.addEventListener('click', () => bumpFontSize(-1));
    dom.hudFontUp?.addEventListener('click', () => bumpFontSize(1));
    dom.hudTheme?.addEventListener('click', () => { toggleTheme(); updateHud(); });
    dom.hudSwitch?.addEventListener('click', switchImmersiveMode);
    dom.hudExit?.addEventListener('click', () => exitImmersive(true));
    // HUD yang sedang disentuh/difokuskan tidak boleh memudar
    dom.hud?.addEventListener('mouseenter', () => setHudVisible(true, false));
    dom.hud?.addEventListener('mouseleave', () => { if (isImmersive()) setHudVisible(true); });
    dom.hud?.addEventListener('focusin', () => setHudVisible(true, false));
    dom.hud?.addEventListener('focusout', (e) => {
      if (dom.hud && !dom.hud.contains(e.relatedTarget)) setHudVisible(false, false);
    });
    // Pemanggil HUD: pointer menyentuh tepi atas layar (ketukan di layar sentuh)
    document.addEventListener('pointermove', onImmersivePointer, { passive: true });
    document.addEventListener('pointerdown', onImmersivePointer, { passive: true });
    if (typeof window.PointerEvent !== 'function') {
      // Peramban lama / lingkungan uji tanpa PointerEvent
      document.addEventListener('mousemove', onImmersivePointer, { passive: true });
      document.addEventListener('mousedown', onImmersivePointer, { passive: true });
    }
    // Progres baca + posisi baca terakhir
    dom.editorWrap?.addEventListener('scroll', onReaderScroll, { passive: true });
    // Ubah ukuran layar/rotasi -> hitung ulang progres baca
    window.addEventListener('resize', () => {
      if (isReaderMode) raf(() => updateReaderProgress());
    });
    // Layar penuh ditutup dari luar (Esc browser / tombol OS) -> ikut keluar
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    dom.btnExport?.addEventListener('click', () => openModal('modal-export'));
    $$('.btn-export-opt').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scope = $('input[name="exp-scope"]:checked')?.value || 'chapter';
        const fmt = btn.dataset.format;
        if (fmt !== 'txt' && fmt !== 'pdf' && fmt !== 'docx') return;

        // Pastikan konten terbaru ikut ter-ekspor (mengisi jeda auto-save)
        flushNow();

        const isAsync = fmt === 'pdf' || fmt === 'docx';
        if (isAsync) {
          closeModal();
          toast(t('loading'), 15000);
        }

        try {
          const ok = fmt === 'txt'
            ? Exporter.toText(scope, activeProjectId, activeChapterId)
            : fmt === 'pdf'
              ? await Exporter.toPDF(scope, activeProjectId, activeChapterId)
              : await Exporter.toDocx(scope, activeProjectId, activeChapterId);
          if (!isAsync && ok) closeModal();
          if (ok) toast(t('exported'));
          else toast(t('exportEmpty'), 3000, 'error');
        } catch (err) {
          console.error('Export error:', err);
          if (err && err.code === 'lib') toast(t('exportLibFail'), 8000, 'error');
          else toast(t('exportFail'), 4000, 'error');
        }
      });
    });

    $('#btn-settings')?.addEventListener('click', () => {
      const s = Storage.getSettings();
      const langSel = $('#set-lang');
      if (langSel) langSel.value = s.lang;
      applyFontSize(s.fontSize);
      applyLineHeight(s.lineHeight || 1.8);
      applyAutoSave(s.autoSaveDelay || 1000);
      const fs = $('#set-fullscreen'); if (fs) fs.checked = s.immersiveFullscreen !== false;
      const tw = $('#set-typewriter'); if (tw) tw.checked = s.focusTypewriter === true;
      updateUndoRestoreButton();
      openModal('modal-settings');
    });

    $('#set-lang')?.addEventListener('change', (e) => {
      applyLanguage(e.target.value);

      persist(Storage.saveSettings({ lang: e.target.value }));
      applyDynamicLabels();
      applyTheme(Storage.getSettings().theme); // label tombol tema ikut bahasa
      renderAll();
    });

    $('#set-fontsize')?.addEventListener('input', (e) => {
      const size = parseInt(e.target.value, 10);
      applyFontSize(size);
      persist(Storage.saveSettings({ fontSize: size }));
    });

    $('#set-lineheight')?.addEventListener('input', (e) => {
      const lh = parseFloat(e.target.value);
      applyLineHeight(lh);
      persist(Storage.saveSettings({ lineHeight: lh }));
    });

    $('#set-autosave')?.addEventListener('input', (e) => {
      const delay = parseInt(e.target.value, 10);
      applyAutoSave(delay);
      persist(Storage.saveSettings({ autoSaveDelay: delay }));
    });

    /* ---- Mode imersif ---- */
    $('#set-fullscreen')?.addEventListener('change', (e) => {
      immersiveFullscreen = !!e.target.checked;
      persist(Storage.saveSettings({ immersiveFullscreen: immersiveFullscreen }));
      // Perubahan langsung terasa: sedang berada di mode imersif?
      if (!isImmersive()) return;
      if (immersiveFullscreen) requestImmersiveFullscreen();
      else leaveImmersiveFullscreen();
    });

    $('#set-typewriter')?.addEventListener('change', (e) => {
      typewriterOn = !!e.target.checked;
      persist(Storage.saveSettings({ focusTypewriter: typewriterOn }));
      document.documentElement.classList.toggle('typewriter', isImmersive() && isFocusMode && typewriterOn);
      scheduleTypewriter();
    });

    $('#btn-backup')?.addEventListener('click', backupData);
    $('#btn-restore')?.addEventListener('click', () => $('#inp-restore')?.click());
    $('#btn-undo-restore')?.addEventListener('click', undoRestore);
    $('#inp-restore')?.addEventListener('change', (e) => {
      if (e.target.files[0]) requestRestore(e.target.files[0]);
      e.target.value = '';
    });

    $$('[data-close]').forEach(btn => btn.addEventListener('click', closeModal));
    dom.modalOverlay?.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) closeModal();
    });

    $('#btn-confirm-yes')?.addEventListener('click', () => {
      const cb = confirmCallback;
      closeModal();                 // menutup = reset confirmCallback
      if (cb) cb();
    });

    document.addEventListener('keydown', trapFocus);

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : ''; // CapsLock-safe

      if (mod && key === 's') {
        e.preventDefault();
        const ok = saveCurrentChapter();
        if (ok) toast(t('saved'));
        else toast(Storage.lastError() === 'quota' ? t('storageFull') : t('storageSaveFail'), 8000, 'error');
        return;
      }
      if (mod && e.shiftKey && key === 'f') { e.preventDefault(); toggleFocusMode(); return; }
      if (mod && e.shiftKey && key === 'r') { e.preventDefault(); toggleReaderMode(); return; }
      if (e.key === 'F9' && !mod) { e.preventDefault(); toggleFocusMode(); return; }
      if (e.key === 'F10' && !mod) { e.preventDefault(); toggleReaderMode(); return; }

      // HUD sedang difokuskan: panah = pindah tombol (bukan ganti bab)
      if (isImmersive() && hudArrowNav(e)) return;
      // Mode Baca: panah = ganti bab, Space/PgUp-PgDn = balik halaman
      if (isReaderMode && handleReaderKey(e)) return;

      if (e.key === 'Escape') {
        if (modalOpen()) closeModal();
        else if (isFocusMode) exitFocusMode();
        else if (isReaderMode) exitReaderMode();
        else if (sidebarOpen()) closeSidebar();
      }
    });

    $('#inp-proj-title')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') createProject(); });
    $('#inp-ch-title')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') createChapter(); });
    $('#inp-rename-proj')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRenameProject(); });
    $('#inp-rename-ch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRenameChapter(); });

    // ---- Selamatkan tulisan saat tab ditutup / dipindah ke latar ----
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', (e) => {
      const ok = flushNow();
      if (!ok) { e.preventDefault(); e.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNow();
    });

    // ---- Tab lain menulis data ----
    window.addEventListener('storage', onExternalStorage);
  }

  // ============ REGISTER PWA SERVICE WORKER ============
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          // Tampilkan "siap offline" hanya satu kali
          if (!localStorage.getItem('nw-offline-ready-shown')) {
            localStorage.setItem('nw-offline-ready-shown', '1');
            toast(t('offlineReady'), 3000);
          }
          // Beri tahu bila versi baru sudah terpasang dan menunggu
          if (reg && reg.waiting) toast(t('updateAvailable'), 6000);
          if (reg) {
            reg.addEventListener('updatefound', () => {
              const nw = reg.installing;
              if (!nw) return;
              nw.addEventListener('statechange', () => {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                  toast(t('updateAvailable'), 6000);
                }
              });
            });
          }
        })
        .catch(() => {});
    });
  }

  // ============ INIT ============
  function init() {
    // Enter = paragraf baru <p> di browser yang mendukung (hasil tetap
    // dinormalisasi ke model blok saat disimpan)
    try {
      if (document.execCommand) document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {}
    const s = Storage.getSettings();
    Storage.repairPointers();
    activeProjectId = s.lastProject;
    activeChapterId = s.lastChapter;
    applyTheme(s.theme);
    applyLanguage(s.lang);
    applyDynamicLabels();
    applyFontSize(s.fontSize);
    applyLineHeight(s.lineHeight || 1.8);
    applyAutoSave(s.autoSaveDelay || 1000);
    // terapkan preferensi sidebar (tanpa persist)
    setSidebarCollapsed(s.sidebarCollapsed === true, false);
    renderAll();
    bindEvents();
    // sinkronkan label sidebar setelah render awal
    applySidebarLabels();
    // saat keluar dari mobile, tutup drawer dan refresh label
    try {
      const mql = window.matchMedia('(max-width: 880px)');
      const onViewportChange = () => {
        if (!mql.matches) {
          // desktop: pastikan overlay drawer tertutup
          if (dom.sidebar) dom.sidebar.classList.remove('open');
          if (dom.overlay) dom.overlay.hidden = true;
          document.body.style.overflow = '';
        }
        applySidebarLabels();
      };
      if (mql.addEventListener) mql.addEventListener('change', onViewportChange);
      else if (mql.addListener) mql.addListener(onViewportChange);
    } catch {}
    registerServiceWorker();

    if (activeChapterId) {
      setTimeout(() => { try { dom.editor?.focus(); } catch {} }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Hook kecil untuk pengujian/debug (bukan API publik yang stabil).
  if (typeof window !== 'undefined') {
    window.NovelWriter = {
      version: VERSION,
      computeReorder,
      wordCount,
      escAttr,
      saveCurrentChapter,
      flushNow,
      renderAll,
      /* mode imersif: dipanggil pengujian, bukan API publik yang stabil */
      enterFocusMode,
      exitFocusMode,
      enterReaderMode,
      exitReaderMode,
      chapterStep,
      updateHud,
      setHudVisible,
      get state() {
        return {
          activeProjectId, activeChapterId, isFocusMode, isReaderMode,
          dirty, fullscreenRequested: fsRequested, readerPct
        };
      }
    };
  }
})();

