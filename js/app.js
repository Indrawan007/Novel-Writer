/* ============================================
   APP — Novel Writer v1.0 (Safe & Robust)
   ============================================ */

(function () {
  'use strict';

  // ============ STATE ============
  let data = Storage.load();
  let activeProjectId = data.settings.lastProject;
  let activeChapterId = data.settings.lastChapter;
  let isPreview = false;
  let saveTimer = null;
  let confirmCallback = null;
  let renameTarget = null;
  let autoSaveDelay = data.settings.autoSaveDelay || 1000;

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
    preview:       $('#preview'),
    emptyState:    $('#empty-state'),
    toolbarTitle:  $('#toolbar-title'),
    statChapter:   $('#stat-chapter'),
    statTotal:     $('#stat-total'),
    sidebarFooter: $('#sidebar-footer'),
    saveIndicator: $('#save-indicator'),
    modalOverlay:  $('#modal-overlay'),
    toast:         $('#toast'),
    fmtBtns:       $$('.fmt-btn'),
    fmtDivider:    $('#fmt-divider'),
    btnExport:     $('#btn-export'),
    btnPreview:    $('#btn-preview'),
  };

  // ============ HELPERS ============
  function wordCount(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  let toastTimer;
  function toast(msg, ms = 2000) {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (dom.toast) dom.toast.hidden = true; }, ms);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'novel';
  }

  // ============ MODAL ============
  function openModal(id) {
    $$('.modal').forEach(m => m.hidden = true);
    const target = $(`#${id}`);
    if (target) target.hidden = false;
    if (dom.modalOverlay) dom.modalOverlay.hidden = false;
    const inp = $(`#${id} input[type="text"]`);
    if (inp) setTimeout(() => { inp.focus(); inp.select(); }, 60);
  }

  function closeModal() {
    if (dom.modalOverlay) dom.modalOverlay.hidden = true;
    $$('.modal').forEach(m => m.hidden = true);
    renameTarget = null;
  }

  function showConfirm(msg, cb) {
    const msgEl = $('#confirm-msg');
    if (msgEl) msgEl.textContent = msg;
    confirmCallback = cb;
    openModal('modal-confirm');
  }

  // ============ RENDER ============
  function renderProjects() {
    if (!dom.projectList) return;
    const projects = Storage.getProjects();
    dom.projectList.innerHTML = projects.map(p => `
      <li class="${p.id === activeProjectId ? 'active' : ''}" data-id="${p.id}">
        <span class="item-title">📖 ${escHtml(p.title || t('untitled'))}</span>
        <span class="item-actions">
          <button class="rename-btn" data-rename-proj="${p.id}" title="Rename">✏️</button>
          <button data-del-proj="${p.id}" title="${t('delete')}">🗑</button>
        </span>
      </li>
    `).join('');
  }

  function renderChapters() {
    const proj = Storage.getProject(activeProjectId);
    if (!proj) {
      if (dom.chapterSec) dom.chapterSec.hidden = true;
      if (dom.sidebarFooter) dom.sidebarFooter.hidden = true;
      return;
    }
    if (dom.chapterSec) dom.chapterSec.hidden = false;
    if (dom.sidebarFooter) dom.sidebarFooter.hidden = false;

    const chapters = (proj.chapters || []).sort((a, b) => a.order - b.order);
    if (dom.chapterList) {
      dom.chapterList.innerHTML = chapters.map(ch => `
        <li class="${ch.id === activeChapterId ? 'active' : ''}"
            data-id="${ch.id}"
            draggable="true">
          <span class="item-title">📑 ${escHtml(ch.title || t('chapter'))}</span>
          <span class="item-actions">
            <button class="rename-btn" data-rename-ch="${ch.id}" title="Rename">✏️</button>
            <button data-del-ch="${ch.id}" title="${t('delete')}">🗑</button>
          </span>
        </li>
      `).join('');
    }

    updateStats();
    bindDragDrop();
  }

  function renderEditor() {
    const proj = Storage.getProject(activeProjectId);
    const ch = proj?.chapters?.find(c => c.id === activeChapterId);

    if (!ch) {
      if (dom.editorWrap) dom.editorWrap.hidden = true;
      if (dom.emptyState) dom.emptyState.hidden = false;
      if (dom.toolbarTitle) dom.toolbarTitle.textContent = t('selectChapter');
      dom.fmtBtns.forEach(b => b.hidden = true);
      if (dom.fmtDivider) dom.fmtDivider.hidden = true;
      if (dom.btnExport) dom.btnExport.hidden = true;
      if (dom.btnPreview) dom.btnPreview.hidden = true;
      return;
    }

    if (dom.emptyState) dom.emptyState.hidden = true;
    if (dom.editorWrap) dom.editorWrap.hidden = false;
    dom.fmtBtns.forEach(b => b.hidden = false);
    if (dom.fmtDivider) dom.fmtDivider.hidden = false;
    if (dom.btnExport) dom.btnExport.hidden = false;
    if (dom.btnPreview) dom.btnPreview.hidden = false;
    if (dom.toolbarTitle) dom.toolbarTitle.textContent = ch.title || t('chapter');

    if (!isPreview) {
      if (dom.editor) dom.editor.hidden = false;
      if (dom.preview) dom.preview.hidden = true;
      if (dom.editor) {
        const pos = dom.editor.selectionStart || 0;
        dom.editor.value = ch.content || '';
        dom.editor.setSelectionRange(pos, pos);
      }
    } else {
      if (dom.editor) dom.editor.hidden = true;
      if (dom.preview) dom.preview.hidden = false;
      renderPreview(ch.content || '');
    }
  }

  function renderPreview(md) {
    if (!dom.preview) return;
    if (typeof marked !== 'undefined') {
      dom.preview.innerHTML = marked.parse(md);
    } else {
      dom.preview.innerHTML = escHtml(md).replace(/\n/g, '<br>');
    }
  }

  function updateStats() {
    const proj = Storage.getProject(activeProjectId);
    if (!proj) return;
    const chapters = proj.chapters || [];
    const ch = chapters.find(c => c.id === activeChapterId);
    if (dom.statChapter) dom.statChapter.textContent = ch ? wordCount(ch.content || '').toLocaleString() : '0';
    const total = chapters.reduce((s, c) => s + wordCount(c.content || ''), 0);
    if (dom.statTotal) dom.statTotal.textContent = total.toLocaleString();
  }

  function renderAll() {
    renderProjects();
    renderChapters();
    renderEditor();
  }

  // ============ PROJECT CRUD ============
  function createProject() {
    const titleInp = $('#inp-proj-title');
    if (!titleInp) return;
    const title = titleInp.value.trim();
    if (!title) return;
    const proj = {
      id: Storage.uid(),
      title,
      author: $('#inp-proj-author')?.value.trim() || '',
      description: $('#inp-proj-desc')?.value.trim() || '',
      chapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    Storage.saveProject(proj);
    activeProjectId = proj.id;
    activeChapterId = null;
    Storage.saveSettings({ lastProject: proj.id, lastChapter: null });
    closeModal();
    titleInp.value = '';
    if ($('#inp-proj-author')) $('#inp-proj-author').value = '';
    if ($('#inp-proj-desc')) $('#inp-proj-desc').value = '';
    renderAll();
  }

  function deleteProject(id) {
    showConfirm(t('confirmDelProj'), () => {
      Storage.deleteProject(id);
      if (activeProjectId === id) {
        activeProjectId = null;
        activeChapterId = null;
      }
      renderAll();
    });
  }

  function selectProject(id) {
    saveCurrentChapter();
    activeProjectId = id;
    activeChapterId = null;
    isPreview = false;
    Storage.saveSettings({ lastProject: id, lastChapter: null });
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
    if (!renameTarget || renameTarget.type !== 'project') return;
    const inp = $('#inp-rename-proj');
    if (!inp) return;
    const title = inp.value.trim();
    if (!title) return;
    const proj = Storage.getProject(renameTarget.id);
    if (proj) {
      proj.title = title;
      Storage.saveProject(proj);
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
    const title = inp?.value.trim() || `${t('chapter')} ${proj.chapters.length + 1}`;
    const ch = {
      id: Storage.uid(),
      title,
      content: '',
      order: proj.chapters.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    proj.chapters.push(ch);
    Storage.saveProject(proj);
    activeChapterId = ch.id;
    isPreview = false;
    Storage.saveSettings({ lastChapter: ch.id });
    closeModal();
    if (inp) inp.value = '';
    renderAll();
    setTimeout(() => dom.editor?.focus(), 50);
  }

  function deleteChapter(id) {
    showConfirm(t('confirmDelCh'), () => {
      const proj = Storage.getProject(activeProjectId);
      if (!proj) return;
      proj.chapters = proj.chapters.filter(c => c.id !== id);
      proj.chapters.sort((a, b) => a.order - b.order).forEach((c, i) => c.order = i + 1);
      Storage.saveProject(proj);
      if (activeChapterId === id) activeChapterId = null;
      Storage.saveSettings({ lastChapter: activeChapterId });
      renderAll();
    });
  }

  function selectChapter(id) {
    saveCurrentChapter();
    activeChapterId = id;
    isPreview = false;
    Storage.saveSettings({ lastChapter: id });
    renderChapters();
    renderEditor();
    closeSidebar();
    setTimeout(() => dom.editor?.focus(), 50);
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
    if (!renameTarget || renameTarget.type !== 'chapter') return;
    const inp = $('#inp-rename-ch');
    if (!inp) return;
    const title = inp.value.trim();
    if (!title) return;
    const proj = Storage.getProject(activeProjectId);
    const ch = proj?.chapters?.find(c => c.id === renameTarget.id);
    if (ch) {
      ch.title = title;
      Storage.saveProject(proj);
      renderAll();
    }
    closeModal();
  }

  // ============ DRAG & DROP CHAPTERS ============
  let dragSrcId = null;

  function bindDragDrop() {
    const items = $$('#chapter-list li[draggable]');
    items.forEach(li => {
      li.addEventListener('dragstart', onDragStart);
      li.addEventListener('dragover', onDragOver);
      li.addEventListener('dragleave', onDragLeave);
      li.addEventListener('drop', onDrop);
      li.addEventListener('dragend', onDragEnd);
    });
  }

  function onDragStart(e) {
    dragSrcId = this.dataset.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSrcId);
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (this.dataset.id !== dragSrcId) {
      this.classList.add('drag-over');
    }
  }

  function onDragLeave() {
    this.classList.remove('drag-over');
  }

  function onDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    const targetId = this.dataset.id;
    if (!dragSrcId || dragSrcId === targetId) return;

    const proj = Storage.getProject(activeProjectId);
    if (!proj || !proj.chapters) return;

    const srcIdx = proj.chapters.findIndex(c => c.id === dragSrcId);
    const tgtIdx = proj.chapters.findIndex(c => c.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const srcOrder = proj.chapters[srcIdx].order;
    proj.chapters[srcIdx].order = proj.chapters[tgtIdx].order;
    proj.chapters[tgtIdx].order = srcOrder;

    Storage.saveProject(proj);
    renderChapters();
  }

  function onDragEnd() {
    dragSrcId = null;
    $$('#chapter-list li').forEach(li => {
      li.classList.remove('dragging', 'drag-over');
    });
  }

  // ============ EDITOR ============
  function saveCurrentChapter() {
    if (!activeChapterId || !activeProjectId || !dom.editor) return;
    const proj = Storage.getProject(activeProjectId);
    if (!proj) return;
    const ch = proj.chapters?.find(c => c.id === activeChapterId);
    if (!ch) return;
    const newContent = dom.editor.value;
    if (ch.content === newContent) return;
    ch.content = newContent;
    ch.updatedAt = new Date().toISOString();
    Storage.saveProject(proj);
    updateStats();
  }

  function showSaving() {
    if (!dom.saveIndicator) return;
    dom.saveIndicator.hidden = false;
    clearTimeout(showSaving._t);
    showSaving._t = setTimeout(() => { if (dom.saveIndicator) dom.saveIndicator.hidden = true; }, 1500);
  }

  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveCurrentChapter();
      showSaving();
    }, autoSaveDelay);
  }

  function insertMarkdown(before, after = '') {
    const ta = dom.editor;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    const replacement = before + (selected || 'text') + after;
    ta.setRangeText(replacement, start, end, 'select');
    ta.focus();
    autoSave();
  }

  function handleTab(e) {
    e.preventDefault();
    const ta = dom.editor;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    if (e.shiftKey) {
      const before = ta.value.substring(0, start);
      const lineStart = before.lastIndexOf('\n') + 1;
      const linePrefix = ta.value.substring(lineStart, start);
      if (linePrefix.startsWith('  ')) {
        ta.setRangeText('', lineStart, lineStart + 2, 'end');
      }
    } else {
      ta.setRangeText('  ', start, end, 'end');
    }
    autoSave();
  }

  function togglePreview() {
    if (!activeChapterId) return;
    saveCurrentChapter();
    isPreview = !isPreview;
    renderEditor();
  }

  // ============ SIDEBAR ============
  function openSidebar() {
    if (dom.sidebar) dom.sidebar.classList.add('open');
    if (dom.overlay) dom.overlay.hidden = false;
  }
  function closeSidebar() {
    if (dom.sidebar) dom.sidebar.classList.remove('open');
    if (dom.overlay) dom.overlay.hidden = true;
  }

  // ============ THEME ============
  function toggleTheme() {
    const s = Storage.getSettings();
    const next = s.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    Storage.saveSettings({ theme: next });
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = $('#btn-theme');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#121214' : '#fafafa';
  }

  // ============ EXPORT ============
  function getExportContent(scope) {
    const proj = Storage.getProject(activeProjectId);
    if (!proj || !proj.chapters?.length) return null;

    if (scope === 'chapter') {
      const ch = proj.chapters.find(c => c.id === activeChapterId);
      if (!ch) return null;
      return { title: ch.title, content: ch.content, author: proj.author, projTitle: proj.title };
    }

    const sorted = [...proj.chapters].sort((a, b) => a.order - b.order);
    const full = sorted.map(ch => `# ${ch.title}\n\n${ch.content}`).join('\n\n---\n\n');
    return { title: proj.title, content: full, author: proj.author, projTitle: proj.title };
  }

  function exportMarkdown(scope) {
    const data = getExportContent(scope);
    if (!data) return toast(t('noChapter'));
    const header = `# ${data.title}\n${data.author ? `**${data.author}**\n` : ''}\n---\n\n`;
    const blob = new Blob([header + data.content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${sanitizeFilename(data.title)}.md`);
    toast(t('exported'));
    closeModal();
  }

  async function exportPDF(scope) {
    const data = getExportContent(scope);
    if (!data) return toast(t('noChapter'));
    closeModal();
    toast(t('loading'), 8000);

    if (!window.html2pdf) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    const htmlContent = typeof marked !== 'undefined' ? marked.parse(data.content) : `<pre>${escHtml(data.content)}</pre>`;
    const container = document.createElement('div');
    container.style.cssText = 'font-family:Georgia,"Times New Roman",serif;font-size:12pt;line-height:1.8;color:#111;padding:20px;max-width:600px;';
    container.innerHTML = `
      <h1 style="text-align:center;font-size:24pt;margin-bottom:4px;font-family:sans-serif;">${escHtml(data.title)}</h1>
      ${data.author ? `<p style="text-align:center;color:#555;margin-bottom:40px;font-size:14pt;">${escHtml(data.author)}</p>` : '<div style="margin-bottom:30px"></div>'}
      ${htmlContent}
    `;
    document.body.appendChild(container);

    try {
      await html2pdf().set({
        margin: [20, 18, 20, 18],
        filename: `${sanitizeFilename(data.title)}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }).from(container).save();
      toast(t('exported'));
    } catch (err) {
      console.error('PDF export error:', err);
      toast('Export failed');
    } finally {
      document.body.removeChild(container);
    }
  }

  async function exportDocx(scope) {
    const data = getExportContent(scope);
    if (!data) return toast(t('noChapter'));
    closeModal();
    toast(t('loading'), 8000);

    if (!window.docx) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/docx@8.5.0/build/index.umd.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } = docx;

    function parseInline(text) {
      const runs = [];
      const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
      let last = 0, m;
      while ((m = regex.exec(text)) !== null) {
        if (m.index > last) {
          runs.push(new TextRun({ text: text.slice(last, m.index), font: 'Georgia', size: 24 }));
        }
        if (m[2]) {
          runs.push(new TextRun({ text: m[2], bold: true, font: 'Georgia', size: 24 }));
        } else if (m[3]) {
          runs.push(new TextRun({ text: m[3], italics: true, font: 'Georgia', size: 24 }));
        }
        last = regex.lastIndex;
      }
      if (last < text.length) {
        runs.push(new TextRun({ text: text.slice(last), font: 'Georgia', size: 24 }));
      }
      return runs.length ? runs : [new TextRun({ text: text, font: 'Georgia', size: 24 })];
    }

    function parseContent(text) {
      const lines = text.split('\n');
      const paragraphs = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
          continue;
        }

        if (trimmed.startsWith('# ')) {
          paragraphs.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
            children: [new TextRun({ text: trimmed.slice(2), bold: true, size: 36, font: 'Georgia' })]
          }));
          continue;
        }
        if (trimmed.startsWith('## ')) {
          paragraphs.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
            children: [new TextRun({ text: trimmed.slice(3), bold: true, size: 28, font: 'Georgia' })]
          }));
          continue;
        }
        if (trimmed === '---') {
          paragraphs.push(new Paragraph({
            spacing: { before: 200, after: 200 },
            children: [new TextRun({ text: '— — —', color: '999999', font: 'Georgia' })],
            alignment: AlignmentType.CENTER
          }));
          continue;
        }

        const runs = parseInline(trimmed);
        paragraphs.push(new Paragraph({
          spacing: { after: 120, line: 360 },
          indent: { firstLine: 480 },
          alignment: AlignmentType.JUSTIFIED,
          children: runs
        }));
      }
      return paragraphs;
    }

    const children = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: data.title, bold: true, size: 48, font: 'Georgia' })]
      })
    ];

    if (data.author) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({ text: data.author, size: 24, color: '666666', font: 'Georgia' })]
      }));
    }

    children.push(...parseContent(data.content));

    const doc = new Document({
      sections: [{ properties: {}, children }]
    });

    try {
      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `${sanitizeFilename(data.title)}.docx`);
      toast(t('exported'));
    } catch (err) {
      console.error(err);
      toast('Export failed');
    }
  }

  // ============ BACKUP / RESTORE ============
  function backupData() {
    const json = Storage.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `novel-writer-backup-${date}.json`);
    toast(t('backupDone'));
  }

  function restoreData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        Storage.importAll(e.target.result);
        data = Storage.load();
        activeProjectId = data.settings.lastProject;
        activeChapterId = data.settings.lastChapter;
        autoSaveDelay = data.settings.autoSaveDelay || 1000;
        applyTheme(data.settings.theme);
        applyLanguage(data.settings.lang);
        applyFontSize(data.settings.fontSize);
        applyAutoSave(autoSaveDelay);
        renderAll();
        toast(t('restoreDone'));
        closeModal();
      } catch {
        toast(t('restoreFail'));
      }
    };
    reader.readAsText(file);
  }

  // ============ SETTINGS ============
  function applyFontSize(size) {
    document.documentElement.style.setProperty('--editor-size', size + 'px');
    const val = $('#fontsize-val');
    if (val) val.textContent = size + 'px';
    const inp = $('#set-fontsize');
    if (inp) inp.value = size;
  }

  function applyAutoSave(delay) {
    autoSaveDelay = delay;
    const val = $('#autosave-val');
    if (val) val.textContent = (delay / 1000).toFixed(1) + 's';
    const inp = $('#set-autosave');
    if (inp) inp.value = delay;
  }

  // ============ EVENTS ============
  function bindEvents() {
    $('#btn-open-sidebar')?.addEventListener('click', openSidebar);
    $('#btn-close-sidebar')?.addEventListener('click', closeSidebar);
    dom.overlay?.addEventListener('click', closeSidebar);

    $('#btn-new-project')?.addEventListener('click', () => openModal('modal-project'));
    $('#btn-empty-new')?.addEventListener('click', () => openModal('modal-project'));
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

    dom.editor?.addEventListener('input', autoSave);
    dom.editor?.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') handleTab(e);
    });

    $('#btn-bold')?.addEventListener('click', () => insertMarkdown('**', '**'));
    $('#btn-italic')?.addEventListener('click', () => insertMarkdown('*', '*'));
    $('#btn-heading')?.addEventListener('click', () => insertMarkdown('## '));
    dom.btnPreview?.addEventListener('click', togglePreview);
    $('#btn-theme')?.addEventListener('click', toggleTheme);

    dom.btnExport?.addEventListener('click', () => openModal('modal-export'));
    $$('.btn-export-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const checked = $('input[name="exp-scope"]:checked');
        const scope = checked ? checked.value : 'chapter';
        const fmt = btn.dataset.format;
        if (fmt === 'md') exportMarkdown(scope);
        else if (fmt === 'pdf') exportPDF(scope);
        else if (fmt === 'docx') exportDocx(scope);
      });
    });

    $('#btn-settings')?.addEventListener('click', () => {
      const s = Storage.getSettings();
      const langSel = $('#set-lang');
      if (langSel) langSel.value = s.lang;
      applyFontSize(s.fontSize);
      applyAutoSave(s.autoSaveDelay || 1000);
      openModal('modal-settings');
    });

    $('#set-lang')?.addEventListener('change', (e) => {
      applyLanguage(e.target.value);
      Storage.saveSettings({ lang: e.target.value });
      renderAll();
    });

    $('#set-fontsize')?.addEventListener('input', (e) => {
      const size = parseInt(e.target.value);
      applyFontSize(size);
      Storage.saveSettings({ fontSize: size });
    });

    $('#set-autosave')?.addEventListener('input', (e) => {
      const delay = parseInt(e.target.value);
      applyAutoSave(delay);
      Storage.saveSettings({ autoSaveDelay: delay });
    });

    $('#btn-backup')?.addEventListener('click', backupData);
    $('#btn-restore')?.addEventListener('click', () => $('#inp-restore')?.click());
    $('#inp-restore')?.addEventListener('change', (e) => {
      if (e.target.files[0]) restoreData(e.target.files[0]);
      e.target.value = '';
    });

    $$('[data-close]').forEach(btn => btn.addEventListener('click', closeModal));
    dom.modalOverlay?.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) closeModal();
    });

    $('#btn-confirm-yes')?.addEventListener('click', () => {
      closeModal();
      if (confirmCallback) { confirmCallback(); confirmCallback = null; }
    });

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 's') { e.preventDefault(); saveCurrentChapter(); toast(t('saved')); }
      if (mod && e.key === 'e') { e.preventDefault(); togglePreview(); }
      if (mod && e.key === 'b' && dom.editor && !dom.editor.hidden) { e.preventDefault(); insertMarkdown('**', '**'); }
      if (mod && e.key === 'i' && dom.editor && !dom.editor.hidden) { e.preventDefault(); insertMarkdown('*', '*'); }
      if (e.key === 'Escape') closeModal();
    });

    $('#inp-proj-title')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') createProject(); });
    $('#inp-ch-title')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') createChapter(); });
    $('#inp-rename-proj')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRenameProject(); });
    $('#inp-rename-ch')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRenameChapter(); });
  }

  // ============ REGISTER PWA SERVICE WORKER ============
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .catch(() => {});
      });
    }
  }

  // ============ INIT ============
  function init() {
    const s = Storage.getSettings();
    applyTheme(s.theme);
    applyLanguage(s.lang);
    applyFontSize(s.fontSize);
    applyAutoSave(s.autoSaveDelay || 1000);
    renderAll();
    bindEvents();
    registerServiceWorker();

    if (activeChapterId) {
      setTimeout(() => dom.editor?.focus(), 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();