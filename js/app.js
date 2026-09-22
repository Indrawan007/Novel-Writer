/* ============================================
   APP — Novel Writer (Safe & Robust)
   Inti aplikasi: state, render, CRUD, editor, drag&drop,
   sinkronisasi antar-tab, PWA.
   ============================================ */

(function () {
  'use strict';

  const VERSION = '1.4.1';

  // ============ STATE ============
  let activeProjectId = Storage.getSettings().lastProject;
  let activeChapterId = Storage.getSettings().lastChapter;
  let isFocusMode = false;
  let isReaderMode = false;
  let saveTimer = null;
  let confirmCallback = null;
  let renameTarget = null;
  let autoSaveDelay = Storage.getSettings().autoSaveDelay || 1000;
  let lastFocused = null;   // elemen pemanggil modal (fokus dikembalikan saat tutup)
  let dirty = false;        // ada ketikan yang belum tersimpan
  let wordsBase = null;     // cache total kata bab non-aktif (lihat updateStats)
  // ---- imersif ----
  let typewriterOn = Storage.getSettings().typewriter !== false;
  let paraFocusOn = Storage.getSettings().paraFocus !== false;
  let readerFontSize = Storage.getSettings().readerFont || 19;
  let focusStartWords = 0;  // kata bab saat Mode Fokus dimulai (basis sesi)
  let immersiveFullscreen = false; // fullscreen diminta oleh mode imersif
  let idleTimer = null;     // pewaktu sembunyi-otomatis chrome imersif
  let peekTimer = null;     // pewaktu intipan toolbar
  const hintShown = { focus: false, reader: false }; // petunjuk sekali per sesi

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
    // ---- chrome imersif ----
    focusHud:      $('#focus-hud'),
    focusWords:    $('#focus-words'),
    focusSession:  $('#focus-session'),
    focusSave:     $('#focus-save'),
    btnTypewriter: $('#btn-typewriter'),
    btnParafocus:  $('#btn-parafocus'),
    btnFocusFs:    $('#btn-focus-fullscreen'),
    btnExitFocus:  $('#btn-exit-focus'),
    readerHud:     $('#reader-hud'),
    readerPos:     $('#reader-pos'),
    readerProgress: $('#reader-progress'),
    readerFill:    $('#reader-progress-fill'),
    btnPrevCh:     $('#btn-prev-ch'),
    btnNextCh:     $('#btn-next-ch'),
    btnReaderDec:  $('#btn-reader-dec'),
    btnReaderInc:  $('#btn-reader-inc'),
    btnReaderFs:   $('#btn-reader-fullscreen'),
    btnExitReader: $('#btn-exit-reader'),
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
    // Saat imersif, info biasa dipersingkat; error tetap menonjol
    if ((isFocusMode || isReaderMode) && type !== 'error') ms = Math.min(ms, 1600);
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

  /**
   * Input judul wajib diisi. Dulu tombol "Buat"/"Simpan" diam saja sehingga
   * tampak seperti aplikasi macet — sekarang: fokus kembali + toast + a11y.
   */
  function rejectEmptyTitle(inp) {
    if (inp) {
      inp.setAttribute('aria-invalid', 'true');
      try { inp.focus(); } catch {}
    }
    toast(t('titleRequired'), 3000, 'error');
  }

  function clearTitleError(inp) {
    if (inp) inp.removeAttribute('aria-invalid');
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
    invalidateWordsBase();
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
      if (isFocusMode || isReaderMode) { exitFocusMode(); exitReaderMode(); }
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
      try { if (dom.editorWrap) dom.editorWrap.scrollTop = 0; if (dom.reader) dom.reader.scrollTop = 0; } catch {}
      updateFocusReaderButtons();
      updateReaderHud();
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
        // Kursor di akhir konten — posisi lama milik bab sebelumnya.
        // Jangan pernah mencuri fokus dari modal yang sedang terbuka.
        if (!modalOpen()) RichText.focusEnd(dom.editor);
      }
      if (isFocusMode) updateFocusCurrent();
    }
    updateToolbar();
    updateFocusReaderButtons();
  }

  /**
   * Isi tampilan Mode Baca: judul bab sebagai <h1>, lalu isi bab.
   * Isi 'html' dirender dari model blok tersanitasi (js/richtext.js);
   * isi 'text' lama = paragraf teks polos (js/text.js — textContent,
   * jadi bebas injeksi HTML). Judul dipasang via textContent (aman).
   */
  function renderReader(ch) {
    if (!dom.reader) return;
    dom.reader.textContent = '';
    const h1 = document.createElement('h1');
    h1.textContent = ch.title || t('chapter');
    dom.reader.appendChild(h1);
    if (ch.format === 'html') {
      const frag = RichText.buildNodes(dom.reader, RichText.blocks(ch.content || ''));
      dom.reader.appendChild(frag);
    } else {
      TextUtil.appendParagraphs(ch.content || '', dom.reader);
    }
  }

  /**
   * Total kata bab-bab SELAIN bab aktif (cache).
   * Dihitung ulang hanya bila data berubah — bukan pada setiap ketikan —
   * sehingga pembaruan statistik langsung tetap murah untuk novel besar.
   */
  function invalidateWordsBase() { wordsBase = null; }

  function wordsBaseOf(chapters, activeCh) {
    if (wordsBase == null) {
      wordsBase = (chapters || []).reduce(
        (s, c) => s + (c === activeCh ? 0 : wordCount(c.content || '', c.format)), 0);
    }
    return wordsBase;
  }

  function updateStats() {
    const proj = Storage.getProject(activeProjectId);
    if (!proj) {
      if (dom.statChapter) dom.statChapter.textContent = '0';
      if (dom.statTotal) dom.statTotal.textContent = '0';
      updateFocusHud();
      return;
    }
    const chapters = proj.chapters || [];
    const ch = chapters.find(c => c.id === activeChapterId);
    const cur = ch ? chapterWords(ch) : 0;
    if (dom.statChapter) dom.statChapter.textContent = nf(cur);
    if (dom.statTotal) dom.statTotal.textContent = nf(wordsBaseOf(chapters, ch) + cur);
    updateFocusHud();
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
  }

  // ============ PROJECT CRUD ============
  function createProject() {
    const titleInp = $('#inp-proj-title');
    if (!titleInp) return;
    const title = titleInp.value.trim();
    if (!title) { rejectEmptyTitle(titleInp); return; }
    clearTitleError(titleInp);
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
        // Adopsi penunjuk yang sudah diperbaiki Storage (proyek pertama yang
        // tersisa) supaya UI dan data tersimpan tidak berbeda cerita.
        const s = Storage.repairPointers();
        activeProjectId = s.lastProject || null;
        const proj = activeProjectId ? Storage.getProject(activeProjectId) : null;
        const first = proj ? sortedChapters(proj)[0] : null;
        activeChapterId = first ? first.id : null;
        dirty = false;
        persist(Storage.saveSettings({
          lastProject: activeProjectId,
          lastChapter: activeChapterId
        }));
      }
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
    if (!title) { rejectEmptyTitle(inp); return; }
    clearTitleError(inp);
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
    activeChapterId = id;
    dirty = false;
    persist(Storage.saveSettings({ lastChapter: id }));
    renderChapters();
    renderEditor();
    closeSidebar();
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
    if (!title) { rejectEmptyTitle(inp); return; }
    clearTitleError(inp);
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
    if (touchDrag) cancelTouchDrag();                   // cegah timer/listener bocor
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
    updateStats();               // ringan: dihitung dari DOM, bukan parse ulang
    if (isFocusMode) updateFocusCurrent();
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
      invalidateWordsBase();
      updateStats();
      if (!o.silent) showSaving();
    } else {
      dirty = true;
      persist(false);
    }
    return ok;
  }

  /** Titik status simpan di HUD fokus (pengganti footer yang disembunyikan). */
  function setFocusSave(visible, isError) {
    if (!dom.focusSave) return;
    dom.focusSave.hidden = !visible;
    dom.focusSave.classList.toggle('save-error', !!isError);
  }

  function showSaving() {
    if (dom.saveIndicator) {
      dom.saveIndicator.classList.remove('save-error');
      dom.saveIndicator.hidden = false;
    }
    setFocusSave(true, false);
    clearTimeout(showSaving._t);
    showSaving._t = setTimeout(() => {
      if (dom.saveIndicator) dom.saveIndicator.hidden = true;
      setFocusSave(false, false);
    }, 1500);
  }

  function showSaveError() {
    if (dom.saveIndicator) {
      dom.saveIndicator.classList.add('save-error');
      dom.saveIndicator.hidden = false;
    }
    setFocusSave(true, true);
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
    // Tab HANYA dicegat bila indent/un-indent benar-benar mengubah sesuatu.
    // Bila tidak (mis. tidak ada blok tersentuh), biarkan browser memindahkan
    // fokus — bila tidak, pengguna keyboard terjebak di dalam editor.
    if (RichText.indent(ed, e.shiftKey ? -1 : 1)) {
      e.preventDefault();
      markDirty();
    }
  }

  // ============ MODE FOKUS & MODE BACA ============

  // ============ MODE FOKUS & MODE BACA (imersif: fullscreen, nol gangguan) ============

  /* ---- Fullscreen bawaan browser (kegagalan = mode tetap jalan tanpa fullscreen) ---- */

  function fullscreenSupported() {
    try {
      const el = document.documentElement;
      return typeof el.requestFullscreen === 'function' ||
             typeof el.webkitRequestFullscreen === 'function';
    } catch { return false; }
  }

  function isFullscreen() {
    try { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    catch { return false; }
  }

  function requestImmersiveFullscreen() {
    if (!fullscreenSupported() || isFullscreen()) return;
    try {
      const el = document.documentElement;
      const p = typeof el.requestFullscreen === 'function'
        ? el.requestFullscreen({ navigationUI: 'hide' })
        : el.webkitRequestFullscreen();
      if (p && typeof p.then === 'function') {
        p.then(
          () => { immersiveFullscreen = isFullscreen(); updateFullscreenButtons(); },
          () => { immersiveFullscreen = false; }
        );
      } else {
        immersiveFullscreen = true;
      }
    } catch { immersiveFullscreen = false; }
  }

  function releaseImmersiveFullscreen() {
    if (!immersiveFullscreen && !isFullscreen()) return;
    immersiveFullscreen = false;
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        const p = document.exitFullscreen();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else if (document.webkitFullscreenElement && typeof document.webkitExitFullscreen === 'function') {
        document.webkitExitFullscreen();
      }
    } catch {}
    updateFullscreenButtons();
  }

  function immersiveActive() { return isFocusMode || isReaderMode; }

  /* ---- Chrome imersif: tampil saat ada aktivitas, lenyap saat idle ---- */
  const IDLE_MS = 2600;

  function showHud(hud) {
    if (!hud) return;
    hud.hidden = false;
    hud.classList.remove('is-hidden');
  }

  function hideHud(hud) {
    if (!hud) return;
    hud.classList.add('is-hidden');
    hud.hidden = true;
  }

  function revealImmersiveChrome() {
    document.documentElement.classList.remove('immersive-idle');
    [dom.focusHud, dom.readerHud].forEach(h => {
      if (h && !h.hidden) h.classList.remove('is-hidden');
    });
    updateFocusFormatBar();
  }

  function concealImmersiveChrome() {
    if (!immersiveActive() || modalOpen()) return;
    document.documentElement.classList.add('immersive-idle');
    [dom.focusHud, dom.readerHud].forEach(h => { if (h) h.classList.add('is-hidden'); });
    const tb = document.querySelector('#toolbar');
    if (tb) tb.classList.remove('is-peek');
    if (dom.formatBar) dom.formatBar.classList.remove('is-visible');
  }

  /** Setiap aktivitas pengguna me-reset pewaktu idle. */
  function pokeImmersive() {
    if (!immersiveActive()) return;
    revealImmersiveChrome();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(concealImmersiveChrome, IDLE_MS);
  }

  /** Toolbar muncul saat kursor/ketukan menyentuh tepi atas layar. */
  function peekToolbarIfNeeded(clientY) {
    if (!immersiveActive()) return;
    const tb = document.querySelector('#toolbar');
    if (!tb) return;
    if (clientY < 64) {
      tb.classList.add('is-peek');
      clearTimeout(peekTimer);
      updateFocusFormatBar();
    } else if (!tb.contains(document.activeElement)) {
      let hover = false;
      try { hover = tb.matches(':hover'); } catch {}
      if (!hover) {
        clearTimeout(peekTimer);
        peekTimer = setTimeout(() => {
          tb.classList.remove('is-peek');
          updateFocusFormatBar();
        }, 900);
      }
    }
  }

  /* ---- Fokus paragraf + mesin ketik (Mode Fokus) ---- */

  /** Blok (p/h2/blockquote) tempat kursor berada — null bila tak relevan. */
  function currentFocusBlock() {
    if (!isFocusMode || (!typewriterOn && !paraFocusOn)) return null;
    try {
      const sel = document.getSelection();
      if (!sel || !sel.anchorNode || !dom.editor || !dom.editor.contains(sel.anchorNode)) return null;
      const n = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
      const blk = n && n.closest ? n.closest('p, h1, h2, blockquote') : null;
      return blk && dom.editor.contains(blk) ? blk : null;
    } catch { return null; }
  }

  function clearFocusMarks() {
    if (!dom.editor) return;
    try {
      dom.editor.querySelectorAll('.focus-current').forEach(el => el.classList.remove('focus-current'));
    } catch {}
    dom.editor.classList.remove('has-focus-current');
  }

  /** Tandai paragraf aktif (redupkan sekitarnya) + jaga di tengah layar. */
  function updateFocusCurrent() {
    const ed = dom.editor;
    if (!ed) return;
    if (!isFocusMode || (!typewriterOn && !paraFocusOn)) { clearFocusMarks(); return; }
    const blk = currentFocusBlock();
    if (!blk) { clearFocusMarks(); return; }
    try {
      ed.querySelectorAll('.focus-current').forEach(el => { if (el !== blk) el.classList.remove('focus-current'); });
    } catch {}
    blk.classList.add('focus-current');
    ed.classList.add('has-focus-current');
    if (typewriterOn) centerFocusBlock(ed, blk);
  }

  /** Gulir editor agar blok aktif duduk ~42% dari atas (seketika). */
  function centerFocusBlock(ed, blk) {
    try {
      if (typeof ed.getBoundingClientRect !== 'function') return;
      const edRect = ed.getBoundingClientRect();
      const r = blk.getBoundingClientRect();
      if (!edRect || !r || !(edRect.height > 0)) return;
      const top = r.top - edRect.top + ed.scrollTop - edRect.height * 0.42 + r.height / 2;
      const next = Math.max(0, top);
      if (Math.abs(next - ed.scrollTop) > 4) ed.scrollTop = next;
    } catch {}
  }

  /** Panel format di Mode Fokus: hanya muncul saat ada seleksi / toolbar diintip. */
  function updateFocusFormatBar() {
    const bar = dom.formatBar;
    if (!bar) return;
    if (!isFocusMode) { bar.classList.remove('is-visible'); return; }
    const tb = document.querySelector('#toolbar');
    const peek = !!(tb && (tb.classList.contains('is-peek') || tb.contains(document.activeElement)));
    let hasSel = false;
    try {
      const sel = document.getSelection();
      hasSel = !!(sel && !sel.isCollapsed && dom.editor && dom.editor.contains(sel.anchorNode));
    } catch {}
    bar.classList.toggle('is-visible', peek || hasSel);
  }

  /* ---- HUD kata (Mode Fokus) ---- */

  /** Kata bab aktif termasuk ketikan yang belum tersimpan. */
  function liveChapterWords() {
    const proj = Storage.getProject(activeProjectId);
    const ch = proj?.chapters?.find(c => c.id === activeChapterId);
    if (!ch) return 0;
    if (dirty && dom.editor && !dom.editor.hidden) {
      // Hitung dari DOM yang sudah ada — jauh lebih murah daripada
      // RichText.getHtml() yang mem-parse ulang seluruh bab setiap ketikan.
      try { return TextUtil.countWords(RichText.domText(dom.editor)); } catch {}
    }
    return wordCount(ch.content || '', ch.format);
  }

  /** Kata sebuah bab: ketikan yang belum tersimpan ikut dihitung bila `dirty`. */
  function chapterWords(ch) {
    if (!ch) return 0;
    if (dirty && ch.id === activeChapterId && dom.editor && !dom.editor.hidden) {
      return liveChapterWords();
    }
    return wordCount(ch.content || '', ch.format);
  }

  function updateFocusHud() {
    if (!dom.focusWords) return;
    const cur = liveChapterWords();
    dom.focusWords.textContent = nf(cur) + ' ' + t('words');
    if (dom.focusSession) {
      const sess = cur - focusStartWords;
      dom.focusSession.textContent = (sess < 0 ? '-' : '+') + nf(Math.abs(sess)) + ' ' + t('sessionSuffix');
    }
  }

  /* ---- HUD baca: progres, navigasi bab, ukuran huruf ---- */

  function readerChapterList() {
    return sortedChapters(Storage.getProject(activeProjectId));
  }

  function updateReaderHud() {
    if (!isReaderMode) return;
    const chs = readerChapterList();
    const idx = Math.max(0, chs.findIndex(c => c.id === activeChapterId));
    let pct = 1;
    try {
      const sc = dom.editorWrap;
      if (sc) {
        const max = sc.scrollHeight - sc.clientHeight;
        pct = max > 0 ? Math.min(1, Math.max(0, sc.scrollTop / max)) : 1;
      }
    } catch {}
    if (dom.readerFill) {
      try { dom.readerFill.style.width = (pct * 100).toFixed(1) + '%'; } catch {}
    }
    const proj = Storage.getProject(activeProjectId);
    const ch = proj?.chapters?.find(c => c.id === activeChapterId);
    const words = ch ? wordCount(ch.content || '', ch.format) : 0;
    const left = Math.max(0, Math.round(words * (1 - pct)));
    const mins = left <= 0 ? 0 : Math.max(1, Math.round(left / 200));
    if (dom.readerPos) {
      const tail = mins === 0 ? t('readingDone') : t('minLeft', { n: nf(mins) });
      dom.readerPos.textContent =
        t('chapterOf', { cur: nf(idx + 1), total: nf(Math.max(1, chs.length)) }) +
        ' • ' + Math.round(pct * 100) + '% • ' + tail;
    }
    updateReaderNavState();
  }

  /** Status tombol bab sebelum/sesudah — aman dipanggil kapan pun. */
  function updateReaderNavState() {
    const chs = readerChapterList();
    const idx = chs.findIndex(c => c.id === activeChapterId);
    if (dom.btnPrevCh) {
      dom.btnPrevCh.disabled = !(isReaderMode && idx > 0);
      dom.btnPrevCh.title = t('prevChapter');
      dom.btnPrevCh.setAttribute('aria-label', t('prevChapter'));
    }
    if (dom.btnNextCh) {
      dom.btnNextCh.disabled = !(isReaderMode && idx >= 0 && idx < chs.length - 1);
      dom.btnNextCh.title = t('nextChapter');
      dom.btnNextCh.setAttribute('aria-label', t('nextChapter'));
    }
  }

  function gotoReaderChapter(dir) {
    if (!isReaderMode) return;
    const chs = readerChapterList();
    const idx = chs.findIndex(c => c.id === activeChapterId);
    const nxt = chs[idx + dir];
    if (!nxt) return;
    activeChapterId = nxt.id;
    dirty = false;
    persist(Storage.saveSettings({ lastChapter: nxt.id }));
    renderChapters();
    renderEditor();
    try { if (dom.editorWrap) dom.editorWrap.scrollTop = 0; } catch {}
    updateReaderHud();
    pokeImmersive();
  }

  function applyReaderFont(px) {
    const n = Math.round(Number(px));
    readerFontSize = Number.isFinite(n) ? Math.min(28, Math.max(14, n)) : 19;
    try { document.documentElement.style.setProperty('--reader-size', readerFontSize + 'px'); } catch {}
    const val = $('#readerfont-val');
    if (val) val.textContent = readerFontSize + 'px';
    const inp = $('#set-readerfont');
    if (inp) inp.value = String(readerFontSize);
  }

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
    if (dom.btnTypewriter) {
      dom.btnTypewriter.setAttribute('aria-pressed', String(typewriterOn));
      dom.btnTypewriter.title = t('typewriterMode');
      dom.btnTypewriter.setAttribute('aria-label', t('typewriterMode'));
    }
    if (dom.btnParafocus) {
      dom.btnParafocus.setAttribute('aria-pressed', String(paraFocusOn));
      dom.btnParafocus.title = t('paraFocus');
      dom.btnParafocus.setAttribute('aria-label', t('paraFocus'));
    }
    updateFullscreenButtons();
    updateReaderNavState();
  }

  function updateFullscreenButtons() {
    const on = isFullscreen();
    [dom.btnFocusFs, dom.btnReaderFs].forEach(btn => {
      if (!btn) return;
      try { btn.innerHTML = on ? Icons.minimize : Icons.maximize; } catch {}
      const label = on ? t('exitFullscreen') : t('enterFullscreen');
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  function enterFocusMode() {
    if (!activeChapterId) { toast(t('selectChapter')); return; }
    if (isReaderMode) exitReaderMode();
    if (isFocusMode) return;
    saveCurrentChapter({ silent: true });
    isFocusMode = true;
    focusStartWords = liveChapterWords();
    document.documentElement.classList.add('focus-mode');
    document.documentElement.classList.toggle('typewriter-on', typewriterOn);
    document.documentElement.classList.toggle('parafocus-on', paraFocusOn);
    closeSidebar();
    showHud(dom.focusHud);
    if (Storage.getSettings().focusFullscreen !== false) requestImmersiveFullscreen();
    renderEditor();
    updateFocusReaderButtons();
    updateFocusHud();
    updateFocusFormatBar();
    pokeImmersive();
    // Petunjuk sekali per sesi — setelah itu nol gangguan
    if (!hintShown.focus) { hintShown.focus = true; toast(t('focusToast'), 1800); }
    setTimeout(() => { try { dom.editor?.focus(); } catch {} updateFocusCurrent(); }, 80);
  }
  // Keluar Mode Fokus selalu hening (petunjuk hanya sekali per sesi).
  function exitFocusMode() {
    if (!isFocusMode) return;
    isFocusMode = false;
    saveCurrentChapter({ silent: true });
    clearTimeout(idleTimer);
    clearTimeout(peekTimer);
    document.documentElement.classList.remove('focus-mode', 'typewriter-on', 'parafocus-on', 'immersive-idle');
    document.querySelector('#toolbar')?.classList.remove('is-peek');
    if (dom.formatBar) dom.formatBar.classList.remove('is-visible');
    clearFocusMarks();
    hideHud(dom.focusHud);
    setFocusSave(false, false);
    releaseImmersiveFullscreen();
    renderEditor();
    updateFocusReaderButtons();
    setTimeout(() => { try { dom.editor?.focus(); } catch {} }, 50);
  }
  function toggleFocusMode() {
    if (isFocusMode) exitFocusMode();
    else enterFocusMode();
  }

  function enterReaderMode() {
    if (!activeChapterId) { toast(t('selectChapter')); return; }
    if (isFocusMode) exitFocusMode();
    if (isReaderMode) return;
    saveCurrentChapter({ silent: true });
    isReaderMode = true;
    document.documentElement.classList.add('reader-mode');
    closeSidebar();
    showHud(dom.readerHud);
    if (dom.readerProgress) dom.readerProgress.hidden = false;
    if (Storage.getSettings().readerFullscreen !== false) requestImmersiveFullscreen();
    renderEditor(); // merender tampilan baca (renderReader) karena isReaderMode aktif
    updateFocusReaderButtons();
    try { if (dom.editorWrap) dom.editorWrap.scrollTop = 0; } catch {}
    updateReaderHud();
    pokeImmersive();
    if (!hintShown.reader) { hintShown.reader = true; toast(t('readerToast'), 1800); }
  }
  function exitReaderMode() {
    if (!isReaderMode) return;
    isReaderMode = false;
    clearTimeout(idleTimer);
    clearTimeout(peekTimer);
    document.documentElement.classList.remove('reader-mode', 'immersive-idle');
    document.querySelector('#toolbar')?.classList.remove('is-peek');
    hideHud(dom.readerHud);
    if (dom.readerProgress) dom.readerProgress.hidden = true;
    releaseImmersiveFullscreen();
    renderEditor();
    updateFocusReaderButtons();
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
    // Isi terbaru di-flush lebih dulu. Bila gagal menulis ke browser, berkas
    // tetap dibuat (memuat cache in-memory) tetapi pengguna diperingatkan —
    // jangan sampai ia mengira datanya sudah aman tersimpan.
    const flushed = flushNow();
    const json = Storage.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    Exporter.download(blob, `novel-writer-backup-${date}.json`);
    if (flushed) toast(t('backupDone'));
    else toast(t('exportNotSaved'), 8000, 'error');
  }

  /** Terapkan ulang seluruh settings + render setelah data diganti total. */
  function afterDataReplaced() {
    Storage.invalidate();
    const s = Storage.getSettings();
    activeProjectId = s.lastProject;
    activeChapterId = s.lastChapter;
    if (isFocusMode) {
      isFocusMode = false;
      document.documentElement.classList.remove('focus-mode', 'typewriter-on', 'parafocus-on');
      clearFocusMarks();
      hideHud(dom.focusHud);
      setFocusSave(false, false);
    }
    if (isReaderMode) {
      isReaderMode = false;
      document.documentElement.classList.remove('reader-mode');
      hideHud(dom.readerHud);
      if (dom.readerProgress) dom.readerProgress.hidden = true;
    }
    document.documentElement.classList.remove('immersive-idle');
    document.querySelector('#toolbar')?.classList.remove('is-peek');
    clearTimeout(idleTimer);
    releaseImmersiveFullscreen();
    dirty = false;
    invalidateWordsBase();
    autoSaveDelay = s.autoSaveDelay || 1000;
    typewriterOn = s.typewriter !== false;
    paraFocusOn = s.paraFocus !== false;
    applyTheme(s.theme);
    applyLanguage(s.lang);
    const langSel = $('#set-lang'); if (langSel) langSel.value = s.lang;
    applyFontSize(s.fontSize);
    applyLineHeight(s.lineHeight || 1.8);
    applyAutoSave(autoSaveDelay);
    applyReaderFont(s.readerFont || 19);
    setSidebarCollapsed(s.sidebarCollapsed === true, false);
    renderAll();
    applySidebarLabels();
    // state turunan ikut disetel ulang: penghitung sesi & tombol draf/undo
    focusStartWords = liveChapterWords();
    updateFocusHud();
    updateUndoRestoreButton();
    updateRestoreDraftButton();
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
      } catch {
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
        catch { ok = false; }
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
    updateRestoreDraftButton();
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
    let kept = false;
    if (keep != null && dom.editor) {
      const proj = Storage.getProject(activeProjectId);
      const ch = proj?.chapters?.find(c => c.id === activeChapterId);
      if (ch) {
        RichText.setContent(dom.editor, keep, 'html');
        dirty = true;
        autoSave();
      } else {
        // Bab yang sedang ditulis lenyap di tab lain — simpan draf & beri tahu.
        // (Dulu: teks tetap tampil di editor lalu hilang tanpa peringatan.)
        Storage.saveDraft(keep);
        kept = true;
      }
    }
    updateRestoreDraftButton();
    // Peringatan draf jangan ditimpa toast "tersinkron" yang biasa saja.
    if (kept) toast(t('draftKept'), 9000, 'error');
    else toast(t('syncedFromOtherTab'), 2500);
  }

  /** Tombol "Pulihkan draf" hanya tampil bila ada draf tersimpan. */
  function updateRestoreDraftButton() {
    const btn = $('#btn-restore-draft');
    if (btn) btn.hidden = !Storage.hasDraft();
  }

  /** Tempelkan draf darurat ke akhir bab yang sedang dibuka. */
  function restoreDraft() {
    const draft = Storage.takeDraft();
    if (!draft) { toast(t('draftNone'), 3000); updateRestoreDraftButton(); return; }
    const proj = Storage.getProject(activeProjectId);
    const ch = proj?.chapters?.find(c => c.id === activeChapterId);
    if (!ch) {                                  // kembalikan, jangan dibuang
      Storage.saveDraft(draft.html);
      toast(t('draftNeedChapter'), 4000, 'error');
      updateRestoreDraftButton();
      return;
    }
    if (!dom.editor) return;
    RichText.setContent(dom.editor, RichText.getHtml(dom.editor) + draft.html, 'html');
    dirty = true;
    markDirty();
    updateRestoreDraftButton();
    toast(t('draftRestored'), 3000);
    try { dom.editor.focus(); } catch {}
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
    document.addEventListener('selectionchange', updateToolbar);

    dom.btnFocus?.addEventListener('click', toggleFocusMode);
    dom.btnReader?.addEventListener('click', toggleReaderMode);
    $('#btn-theme')?.addEventListener('click', toggleTheme);

    // ---- HUD Mode Fokus ----
    dom.btnTypewriter?.addEventListener('click', () => {
      typewriterOn = !typewriterOn;
      persist(Storage.saveSettings({ typewriter: typewriterOn }));
      document.documentElement.classList.toggle('typewriter-on', typewriterOn);
      const box = $('#set-typewriter'); if (box) box.checked = typewriterOn;
      updateFocusCurrent();
      updateFocusReaderButtons();
      pokeImmersive();
    });
    dom.btnParafocus?.addEventListener('click', () => {
      paraFocusOn = !paraFocusOn;
      persist(Storage.saveSettings({ paraFocus: paraFocusOn }));
      document.documentElement.classList.toggle('parafocus-on', paraFocusOn);
      const box = $('#set-parafocus'); if (box) box.checked = paraFocusOn;
      updateFocusCurrent();
      updateFocusReaderButtons();
      pokeImmersive();
    });
    const toggleNativeFullscreen = () => {
      if (isFullscreen()) releaseImmersiveFullscreen();
      else requestImmersiveFullscreen();
      pokeImmersive();
    };
    dom.btnFocusFs?.addEventListener('click', toggleNativeFullscreen);
    dom.btnReaderFs?.addEventListener('click', toggleNativeFullscreen);
    dom.btnExitFocus?.addEventListener('click', () => exitFocusMode());
    dom.btnExitReader?.addEventListener('click', () => exitReaderMode());

    // ---- HUD Mode Baca ----
    dom.btnPrevCh?.addEventListener('click', () => gotoReaderChapter(-1));
    dom.btnNextCh?.addEventListener('click', () => gotoReaderChapter(1));
    dom.btnReaderDec?.addEventListener('click', () => {
      applyReaderFont(readerFontSize - 1);
      persist(Storage.saveSettings({ readerFont: readerFontSize }));
      updateReaderHud();
      pokeImmersive();
    });
    dom.btnReaderInc?.addEventListener('click', () => {
      applyReaderFont(readerFontSize + 1);
      persist(Storage.saveSettings({ readerFont: readerFontSize }));
      updateReaderHud();
      pokeImmersive();
    });
    dom.editorWrap?.addEventListener('scroll', () => { if (isReaderMode) updateReaderHud(); }, { passive: true });

    // HUD tak boleh mencuri fokus ketikan
    [dom.focusHud, dom.readerHud].forEach(h => {
      h?.addEventListener('pointerdown', (e) => { e.stopPropagation(); pokeImmersive(); });
      h?.addEventListener('mousedown', (e) => { e.preventDefault(); });
    });

    dom.btnExport?.addEventListener('click', () => openModal('modal-export'));
    $$('.btn-export-opt').forEach(btn => {
      btn.addEventListener('click', async () => {
        const scope = $('input[name="exp-scope"]:checked')?.value || 'chapter';
        const fmt = btn.dataset.format;
        if (fmt !== 'txt' && fmt !== 'pdf' && fmt !== 'docx') return;

        // Pastikan konten terbaru ikut ter-ekspor (mengisi jeda auto-save).
        // Bila gagal menulis ke browser, berkas tetap memuatnya dari cache
        // in-memory — tetapi pengguna diberi tahu di akhir.
        const flushed = flushNow();

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
          if (!ok) toast(t('exportEmpty'), 3000, 'error');
          else if (flushed) toast(t('exported'));
          else toast(t('exportNotSaved'), 8000, 'error');
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
      applyReaderFont(s.readerFont || 19);
      const setBox = (id, val) => { const el = $(id); if (el) el.checked = !!val; };
      setBox('#set-focus-fullscreen', s.focusFullscreen !== false);
      setBox('#set-reader-fullscreen', s.readerFullscreen !== false);
      setBox('#set-typewriter', s.typewriter !== false);
      setBox('#set-parafocus', s.paraFocus !== false);
      updateUndoRestoreButton();
      updateRestoreDraftButton();
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

    $('#set-focus-fullscreen')?.addEventListener('change', (e) => {
      persist(Storage.saveSettings({ focusFullscreen: e.target.checked }));
    });
    $('#set-reader-fullscreen')?.addEventListener('change', (e) => {
      persist(Storage.saveSettings({ readerFullscreen: e.target.checked }));
    });
    $('#set-typewriter')?.addEventListener('change', (e) => {
      typewriterOn = e.target.checked;
      persist(Storage.saveSettings({ typewriter: typewriterOn }));
      document.documentElement.classList.toggle('typewriter-on', typewriterOn);
      updateFocusCurrent();
      updateFocusReaderButtons();
    });
    $('#set-parafocus')?.addEventListener('change', (e) => {
      paraFocusOn = e.target.checked;
      persist(Storage.saveSettings({ paraFocus: paraFocusOn }));
      document.documentElement.classList.toggle('parafocus-on', paraFocusOn);
      updateFocusCurrent();
      updateFocusReaderButtons();
    });
    $('#set-readerfont')?.addEventListener('input', (e) => {
      applyReaderFont(parseInt(e.target.value, 10));
      persist(Storage.saveSettings({ readerFont: readerFontSize }));
      updateReaderHud();
    });

    $('#btn-backup')?.addEventListener('click', backupData);
    $('#btn-restore')?.addEventListener('click', () => $('#inp-restore')?.click());
    $('#btn-undo-restore')?.addEventListener('click', undoRestore);
    $('#btn-restore-draft')?.addEventListener('click', restoreDraft);
    // penanda "judul wajib diisi" hilang begitu pengguna mengetik
    ['#inp-proj-title', '#inp-rename-proj', '#inp-rename-ch'].forEach(sel => {
      $(sel)?.addEventListener('input', (e) => clearTitleError(e.currentTarget));
    });
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

      // Mode Baca: Alt+Panah = bab sebelum/sesudah
      if (isReaderMode && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        gotoReaderChapter(e.key === 'ArrowRight' ? 1 : -1);
        return;
      }

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

    // ---- Aktivitas pengguna saat imersif: tampilkan chrome + intip toolbar ----
    document.addEventListener('mousemove', (e) => {
      if (!immersiveActive()) return;
      pokeImmersive();
      peekToolbarIfNeeded(e.clientY);
    }, { passive: true });
    document.addEventListener('pointerdown', (e) => {
      if (!immersiveActive()) return;
      pokeImmersive();
      if (e && typeof e.clientY === 'number') peekToolbarIfNeeded(e.clientY);
    }, { passive: true });
    document.addEventListener('wheel', () => { if (immersiveActive()) pokeImmersive(); }, { passive: true });
    document.addEventListener('touchstart', (e) => {
      if (!immersiveActive()) return;
      pokeImmersive();
      try {
        const y = e.touches && e.touches[0] && e.touches[0].clientY;
        if (typeof y === 'number') peekToolbarIfNeeded(y);
      } catch {}
    }, { passive: true });
    document.addEventListener('keydown', () => { if (immersiveActive()) pokeImmersive(); });
    document.addEventListener('selectionchange', () => {
      if (!immersiveActive()) return;
      updateFocusCurrent();
      updateFocusFormatBar();
    });
    const onFullscreenChange = () => {
      updateFullscreenButtons();
      if (isFullscreen()) return;
      immersiveFullscreen = false;
      // Esc bawaan browser keluar dari fullscreen duluan (keydown tak sampai):
      // ikut keluar dari mode imersif agar tidak nyangkut setengah jalan.
      if (isFocusMode) exitFocusMode();
      else if (isReaderMode) exitReaderMode();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
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
    typewriterOn = s.typewriter !== false;
    paraFocusOn = s.paraFocus !== false;
    applyReaderFont(s.readerFont || 19);
    // terapkan preferensi sidebar (tanpa persist)
    setSidebarCollapsed(s.sidebarCollapsed === true, false);
    renderAll();
    bindEvents();
    updateRestoreDraftButton();
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
      get state() {
        return { activeProjectId, activeChapterId, isFocusMode, isReaderMode, dirty, typewriterOn, paraFocusOn, readerFontSize };
      }
    };
  }
})();

