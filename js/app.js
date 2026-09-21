/* ============================================
   APP — Novel Writer (Safe & Robust)
   Inti aplikasi: state, render, CRUD, editor, drag&drop,
   sinkronisasi antar-tab, PWA.
   ============================================ */

(function () {
  'use strict';

  const VERSION = '1.2.0';

  // ============ STATE ============
  let activeProjectId = Storage.getSettings().lastProject;
  let activeChapterId = Storage.getSettings().lastChapter;
  let isPreview = false;
  let isFocusMode = false;
  let isReaderMode = false;
  let saveTimer = null;
  let confirmCallback = null;
  let renameTarget = null;
  let autoSaveDelay = Storage.getSettings().autoSaveDelay || 1000;
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
  };

  // ============ HELPERS ============

  /** Jumlah kata (tanda baca yang berdiri sendiri tidak dihitung). */
  function wordCount(text) {
    return TextUtil.countWords(text);
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
      if (dom.reader) dom.reader.hidden = false;
      renderReader(ch);
      try { if (dom.reader) dom.reader.scrollTop = 0; } catch {}
      updateFocusReaderButtons();
      return;
    }

    // MODE TULIS (biasa / fokus) — textarea polos
    if (dom.reader) dom.reader.hidden = true;
    if (dom.editor) {
      dom.editor.hidden = false;
      const keep = dirty ? dom.editor.value : null;
      dom.editor.value = keep != null ? keep : (ch.content || '');
      if (keep == null) {
        // Kursor di akhir konten — posisi lama milik bab sebelumnya
        const len = dom.editor.value.length;
        try { dom.editor.setSelectionRange(len, len); } catch {}
      }
    }
    updateFocusReaderButtons();
  }

  /**
   * Isi tampilan Mode Baca: judul bab sebagai <h1>, lalu isi bab sebagai
   * paragraf teks polos (js/text.js — textContent, jadi bebas injeksi HTML).
   */
  function renderReader(ch) {
    if (!dom.reader) return;
    dom.reader.textContent = '';
    const h1 = document.createElement('h1');
    h1.textContent = ch.title || t('chapter');
    dom.reader.appendChild(h1);
    TextUtil.appendParagraphs(ch.content || '', dom.reader);
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
    if (dom.statChapter) dom.statChapter.textContent = nf(ch ? wordCount(ch.content || '') : 0);
    const total = chapters.reduce((s, c) => s + wordCount(c.content || ''), 0);
    if (dom.statTotal) dom.statTotal.textContent = nf(total);
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
    autoSave();
  }

  /**
   * Simpan isi editor ke bab aktif.
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
    const newContent = dom.editor.value;
    if (ch.content === newContent) { dirty = false; return true; }
    ch.content = newContent;
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
   * Tambah/hapus awalan di SETIAP baris yang tersentuh seleksi
   * (dipakai tombol Heading: "## " harus di awal baris).
   */
  function toggleLinePrefix(prefix) {
    const ta = dom.editor;
    if (!ta || ta.hidden) return;
    const value = ta.value;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const blockStart = value.lastIndexOf('\n', start - 1) + 1;
    const nl = value.indexOf('\n', end);
    const blockEnd = nl === -1 ? value.length : nl;
    const lines = value.slice(blockStart, blockEnd).split('\n');
    const filled = lines.filter(l => l.trim().length);
    const allHave = filled.length > 0 && filled.every(l => l.startsWith(prefix));
    const out = lines.map(l => {
      if (!l.trim()) return l;
      if (allHave) return l.slice(prefix.length);
      return prefix + l.replace(/^#{1,6}\s+/, ''); // ganti level heading lama
    });
    const oldBlock = lines.join('\n');
    const newBlock = out.join('\n');
    if (newBlock === oldBlock) { try { ta.focus(); } catch {} return; }

    ta.setSelectionRange(blockStart, blockEnd);
    ta.setRangeText(newBlock, blockStart, blockEnd, 'end');
    const firstDelta = out[0].length - lines[0].length;
    const totalDelta = newBlock.length - oldBlock.length;
    const newStart = Math.max(blockStart, start + firstDelta);
    try { ta.setSelectionRange(newStart, Math.max(newStart, end + totalDelta)); } catch {}
    try { ta.focus(); } catch {}
    markDirty();
  }

  /**
   * Tab / Shift+Tab = indent & un-indent PER BARIS pada seluruh seleksi.
   * Seleksi TIDAK PERNAH ditimpa (bug lama: seluruh bab bisa lenyap).
   */
  function handleTab(e) {
    const ta = dom.editor;
    if (!ta) return;
    e.preventDefault();
    const INDENT = '  ';
    const value = ta.value;
    const start = ta.selectionStart, end = ta.selectionEnd;

    // Caret tunggal + Tab = sisip indent di posisi caret
    if (start === end && !e.shiftKey) {
      ta.setRangeText(INDENT, start, end, 'end');
      markDirty();
      return;
    }

    const blockStart = value.lastIndexOf('\n', start - 1) + 1;
    const nl = value.indexOf('\n', end);
    const blockEnd = nl === -1 ? value.length : nl;
    const lines = value.slice(blockStart, blockEnd).split('\n');

    const out = e.shiftKey
      ? lines.map(l => l.startsWith(INDENT) ? l.slice(INDENT.length) : l.replace(/^(\t| {1,2})/, ''))
      : lines.map(l => l.length ? INDENT + l : l);

    const oldBlock = lines.join('\n');
    const newBlock = out.join('\n');
    if (newBlock === oldBlock) return; // mis. Shift+Tab di baris tanpa indent

    ta.setSelectionRange(blockStart, blockEnd);
    ta.setRangeText(newBlock, blockStart, blockEnd, 'end');
    const firstDelta = out[0].length - lines[0].length;
    const totalDelta = newBlock.length - oldBlock.length;
    const newStart = Math.max(blockStart, start + firstDelta);
    try { ta.setSelectionRange(newStart, Math.max(newStart, end + totalDelta)); } catch {}
    markDirty();
  }

  // ============ MODE FOKUS & MODE BACA ============
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
    if (isReaderMode) exitReaderMode(false);
    saveCurrentChapter({ silent: true });
    isFocusMode = true;
    document.documentElement.classList.add('focus-mode');
    closeSidebar();
    renderEditor();
    updateFocusReaderButtons();
    toast(t('focusToast'), 3000);
    setTimeout(() => { try { dom.editor?.focus(); } catch {} }, 80);
  }
  function exitFocusMode(showToast = true) {
    if (!isFocusMode) return;
    isFocusMode = false;
    document.documentElement.classList.remove('focus-mode');
    document.querySelector('#toolbar')?.classList.remove('is-peek');
    renderEditor();
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
    if (isFocusMode) exitFocusMode(false);
    saveCurrentChapter({ silent: true });
    isReaderMode = true;
    document.documentElement.classList.add('reader-mode');
    closeSidebar();
    renderEditor(); // merender tampilan baca (renderReader) karena isReaderMode aktif
    updateFocusReaderButtons();
    toast(t('readerToast'), 3000);
  }
  function exitReaderMode(showToast = true) {
    if (!isReaderMode) return;
    isReaderMode = false;
    document.documentElement.classList.remove('reader-mode');
    renderEditor();
    updateFocusReaderButtons();
    if (showToast) toast(t('exitReaderMode'), 2000);
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
    if (isFocusMode) { isFocusMode = false; document.documentElement.classList.remove('focus-mode'); document.querySelector('#toolbar')?.classList.remove('is-peek'); }
    if (isReaderMode) { isReaderMode = false; document.documentElement.classList.remove('reader-mode'); }
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
    const keep = (dirty && dom.editor && !dom.editor.hidden) ? dom.editor.value : null;
    afterDataReplaced();
    if (keep != null && dom.editor) {
      dom.editor.value = keep;
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
      if (e.key === 'Tab') handleTab(e);
    });

    dom.btnFocus?.addEventListener('click', toggleFocusMode);
    dom.btnReader?.addEventListener('click', toggleReaderMode);
    $('#btn-theme')?.addEventListener('click', toggleTheme);

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

    // ---- toolbar peek di focus-mode ----
    let _peekTimer = null;
    document.addEventListener('mousemove', (e) => {
      if (!isFocusMode) return;
      const tb = document.querySelector('#toolbar');
      if (!tb) return;
      if (e.clientY < 56) {
        tb.classList.add('is-peek');
        clearTimeout(_peekTimer);
      } else if (!tb.matches(':hover') && !tb.contains(document.activeElement)) {
        clearTimeout(_peekTimer);
        _peekTimer = setTimeout(() => tb.classList.remove('is-peek'), 900);
      }
    });

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
      get state() {
        return { activeProjectId, activeChapterId, isFocusMode, isReaderMode, dirty };
      }
    };
  }
})();

