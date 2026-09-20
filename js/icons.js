/* ============================================
   Icons — SVG stroke inline (tanpa emoji)
   Ikon statis: <span class="icon" data-icon="nama"></span>
   Ikon dinamis: langsung pakai Icons.nama di template JS.
   ============================================ */

(function () {
  function svg(inner, size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"' +
      ' width="' + (size || 16) + '" height="' + (size || 16) + '"' +
      ' fill="none" stroke="currentColor" stroke-width="1.7"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner + '</svg>';
  }

  const Icons = {
    menu:     svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    close:    svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    plus:     svg('<path d="M12 5v14M5 12h14"/>'),
    book:     svg('<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>', 14),
    file:     svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>', 14),
    pencil:   svg('<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>', 13),
    trash:    svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>', 13),
    eye:      svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
    upload:   svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
    sun:      svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon:     svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    alert:    svg('<path d="M12 3l9.5 17H2.5z"/><path d="M12 9v5M12 17.2v.1"/>'),
    feather:  svg('<path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><path d="M16 8L2 22"/><path d="M17.5 15H9"/>', 44),
    maximize: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    minimize: svg('<path d="M4 14h6v6M20 10h-6V4M14 14h6v6M10 4H4v6"/>'),
    bookOpen: svg('<path d="M12 6c2-1.2 3.5-1.5 6-1 1.2.2 2 1 2 3v11c0-1-.8-1.7-2-2-1.2-.3-2.5.2-4 1-1.2.6-2.4.6-4 0-1.5-.8-2.8-1.3-4-1-1.2.3-2 1-2 2V8c0-2 1-2.8 2-3 2.5-.5 4 0 6 1z"/><path d="M12 6v13"/>', 16)
  };

  function hydrateIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(el => {
      if (el.childElementCount) return; // sudah terisi
      const svgStr = Icons[el.dataset.icon];
      if (svgStr) el.innerHTML = svgStr;
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => hydrateIcons());
    } else {
      hydrateIcons();
    }
  }

  if (typeof window !== 'undefined') {
    window.Icons = Icons;
    window.hydrateIcons = hydrateIcons;
  }
})();
