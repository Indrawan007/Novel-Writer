/* ============================================
   RichText — editor teks berformat (WYSIWYG, tanpa sintaks)
   Pengganti penyunting sumber: penulis memilih tebal/miring/judul lewat
   panel format, dan TIDAK pernah menulis penanda apa pun.

   Model dokumen (kanonik, disimpan di ch.content dengan format 'html'):
     Blok   : <p> | <p class="gap"> | <p class="scene"> | <h2> | <blockquote>
              | <figure class="fig-s|fig-m|fig-l">   (ilustrasi tokoh/karakter)
     Inline : <strong> | <em>
   Semua masukan (ketikan browser, tempel, backup lama) DIPAKSA melewati
   model ini: sanitasi allowlist membuang tag/atribut lain — termasuk
   script, style, dan penangan acara. Tidak ada innerHTML ke DOM hidup.
   Ilustrasi hanya boleh berisi <img> dengan src yang lolos allowlist
   ImageUtil.safeSrc (data URL gambar / http(s)); src lain -> gambar dibuang
   dan teks keterangannya diselamatkan menjadi paragraf.

   Konten lama (teks polos, format 'text' / tanpa format) tetap didukung:
   satu baris = satu paragraf, baris kosong = jeda (lihat js/text.js).
   ============================================ */

const RichText = {

  /* ---- Peta tag ---- */
  BLOCK_MAP: {
    p: 'p', h1: 'h2', h2: 'h2', h3: 'h2', h4: 'h2', h5: 'h2', h6: 'h2',
    blockquote: 'blockquote', div: 'p', li: 'p', pre: 'p', dt: 'p', dd: 'p',
    section: 'p', article: 'p', header: 'p', footer: 'p', main: 'p',
    figcaption: 'p', caption: 'p', address: 'p', form: 'p'
  },
  INLINE_MAP: { strong: 'strong', b: 'strong', em: 'em', i: 'em' },
  /* 'img' sengaja TIDAK ada di sini: gambar kini didukung sebagai blok
     <figure> (ilustrasi) — tetapi tetap dibuang bila src-nya tidak aman. */
  DROP_WITH_CONTENT: new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template',
    'noscript', 'canvas', 'video', 'audio', 'input', 'select',
    'textarea', 'button', 'link', 'meta', 'title', 'head', 'source', 'track',
    'map', 'area', 'base', 'col', 'colgroup', 'param', 'dialog'
  ]),
  BLOCKISH: 'p,h1,h2,h3,h4,h5,h6,blockquote,div,li,pre,dt,dd,section,article,header,footer,main',
  SCENE_TEXT: '* * *',
  /* Ukuran ilustrasi: s = kecil, m = sedang, l = penuh */

  /* ============================================
     PARSER — html mentah -> daftar blok kanonik
     Setiap blok: { tag, gap, scene, runs: [{ text, bold, italic }] }
     ============================================ */

  _parserDoc(html) {
    const DP = (typeof DOMParser !== 'undefined')
      ? DOMParser
      : (typeof document !== 'undefined' && document.defaultView && document.defaultView.DOMParser);
    if (!DP) throw new Error('DOMParser tidak tersedia');
    return new DP().parseFromString(String(html == null ? '' : html), 'text/html');
  },

  /** Ubah isi bab apa pun (html/teks) menjadi daftar blok kanonik. */
  blocks(html) {
    const body = this._parserDoc(html).body;
    const out = [];
    let cur = null;
    let pendingGap = false;
    let quoteDepth = 0;

    const startBlock = (tag, gapOnEmpty) => {
      cur = { tag, gap: false, scene: false, runs: [], gapOnEmpty: gapOnEmpty !== false };
    };
    const endBlock = () => {
      if (!cur) return;
      const wasGappy = cur.gapOnEmpty;
      const b = this._finalizeBlock(cur);
      cur = null;
      if (!b) { if (wasGappy) pendingGap = true; return; }
      if (pendingGap) b.gap = true;
      pendingGap = false;
      out.push(b);
    };
    const ensure = () => { if (!cur) startBlock('p', true); };

    const pushText = (text, bold, italic) => {
      if (text == null || text === '') return;
      const norm = String(text).replace(/[\t\n\r\f]+/g, ' ');
      if (!norm) return;
      // Teks yang hanya berisi spasi biasa DI ANTARA dua blok (mis. newline
      // pada hasil tempel Word/Google Docs) tidak berarti apa-apa di HTML:
      // abaikan saja. Dulu ia menjadi blok kosong -> paragraf berikutnya
      // mendapat class="gap" (jeda palsu). Jeda yang sesungguhnya datang dari
      // paragraf kosong (<p><br></p>) atau class="gap" eksplisit.
      // nbsp tetap dihargai (indent pengguna) karena bukan spasi biasa.
      if (!cur && !/[^ ]/.test(norm)) return;
      ensure();
      const last = cur.runs[cur.runs.length - 1];
      if (last && last.bold === bold && last.italic === italic) last.text += norm;
      else cur.runs.push({ text: norm, bold: !!bold, italic: !!italic });
    };

    const visit = (node, bold, italic) => {
      const kids = [...node.childNodes];
      for (const child of kids) {
        if (child.nodeType === 3) {           // teks
          pushText(child.nodeValue, bold, italic);
          continue;
        }
        if (child.nodeType !== 1) continue;   // komentar/dll dibuang
        const tag = String(child.tagName || '').toLowerCase();

        if (tag === 'br') {                   // satu baris = satu paragraf
          if (cur) endBlock();                // baris berisi -> paragraf biasa
          else pendingGap = true;             // <br> pada baris kosong -> jeda
          continue;
        }
        if (tag === 'hr') {                   // garis = jeda adegan
          endBlock();
          startBlock('p', true);
          cur.scene = true;
          endBlock();
          continue;
        }
        if (this.DROP_WITH_CONTENT.has(tag)) continue;

        /* ---- Ilustrasi: <figure> (atau <img> lepas) jadi blok gambar ---- */
        if (tag === 'figure' || tag === 'img') {
          const host = tag === 'figure' ? child : null;
          const imgEl = tag === 'img' ? child
            : (child.querySelector ? child.querySelector('img') : null);
          const capEl = host && host.querySelector ? host.querySelector('figcaption') : null;
          const get = (el, name) => (el && el.getAttribute) ? el.getAttribute(name) : null;
          const src = this.safeImgSrc(get(imgEl, 'src'));
          const alt = this._plainText(get(imgEl, 'alt'));
          const caption = this._plainText(capEl ? capEl.textContent : '');
          const text = caption || alt;

          endBlock();
          if (!src) {
            // src tidak aman/hilang -> gambar dibuang, TEKSNYA diselamatkan
            // (keterangan/alt jadi paragraf, supaya tulisan tidak lenyap)
            if (text) { startBlock('p', true); pushText(text, false, false); endBlock(); }
            continue;
          }
          startBlock('figure', true);
          cur.src = src;
          cur.alt = alt || caption;
          cur.caption = caption;
          cur.width = this._dim(get(imgEl, 'width'));
          cur.height = this._dim(get(imgEl, 'height'));
          cur.size = this._figSize(host ? host.getAttribute('class') : '');
          endBlock();
          // Sisa isi <figure> (mis. paragraf hasil Enter di dalam keterangan)
          // TIDAK dibuang — ia jadi blok teks tersendiri setelah ilustrasi.
          if (host) {
            for (const kid of [...host.childNodes]) {
              if (kid.nodeType === 3) { pushText(kid.nodeValue, false, false); continue; }
              if (kid.nodeType !== 1) continue;
              const ktag = String(kid.tagName || '').toLowerCase();
              if (ktag === 'img' || ktag === 'figcaption') continue;
              visit(kid, false, false);
            }
            endBlock();
          }
          continue;
        }

        const asBlock = this.BLOCK_MAP[tag];
        if (asBlock) {
          endBlock();
          const structural = !!child.querySelector && !!child.querySelector(this.BLOCKISH);
          // paragraf di dalam kutipan tetap menjadi kutipan
          const effTag = (asBlock === 'p' && quoteDepth > 0) ? 'blockquote' : asBlock;
          startBlock(effTag, !structural);
          if (effTag === 'p') {
            const cls = String(child.getAttribute && child.getAttribute('class') || '');
            if (/(^|\s)scene(\s|$)/.test(cls)) cur.scene = true;
            else if (/(^|\s)gap(\s|$)/.test(cls)) cur.gap = true;
          }
          if (tag === 'blockquote') quoteDepth++;
          visit(child, false, false);          // blok tidak mewarisi penanda
          if (tag === 'blockquote') quoteDepth--;
          endBlock();
          continue;
        }
        const asInline = this.INLINE_MAP[tag];
        if (asInline === 'strong') visit(child, true, italic);
        else if (asInline === 'em') visit(child, bold, true);
        else visit(child, bold, italic);       // tak dikenal -> buang bungkusnya
      }
    };

    visit(body, false, false);
    endBlock();
    return out;
  },

  /** Rapikan satu blok: satukan run, rapikan spasi tepi, deteksi kosong. */
  _finalizeBlock(b) {
    // Ilustrasi: tidak punya run teks; hidup-matinya ditentukan src-nya.
    if (b.tag === 'figure') {
      b.runs = [];
      b.gap = false;
      b.scene = false;
      b.size = this._figSize('fig-' + (b.size || 'm'));
      b.caption = this._plainText(b.caption);
      b.alt = this._plainText(b.alt);
      return b.src ? b : null;
    }
    if (b.scene && !b.runs.some(r => r.text.trim() !== '')) {
      b.runs = [{ text: this.SCENE_TEXT, bold: false, italic: false }];
    }
    // buang run kosong
    b.runs = b.runs.filter(r => r.text !== '');
    if (!b.runs.length) return null;

    const isEdge = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
    // potong spasi tepi (nbsp sengaja dipertahankan = indent pengguna)
    while (b.runs.length) {
      const r = b.runs[0];
      let i = 0;
      while (i < r.text.length && isEdge(r.text[i])) i++;
      r.text = r.text.slice(i);
      if (r.text) break;
      b.runs.shift();
    }
    while (b.runs.length) {
      const r = b.runs[b.runs.length - 1];
      let j = r.text.length;
      while (j > 0 && isEdge(r.text[j - 1])) j--;
      r.text = r.text.slice(0, j);
      if (r.text) break;
      b.runs.pop();
    }
    if (!b.runs.length) return null;
    if (b.scene) b.gap = false;               // scene sudah punya jeda visual sendiri
    return b;
  },

  /** Escapes untuk simpul teks (cukup & < >). */
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /** Escapes untuk konteks ATRIBUT (termasuk tanda kutip). */
  escAttr(s) {
    return this.esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /* ============================================
     ILUSTRASI (figure) — pembantu
     ============================================ */

  /** src gambar yang aman disimpan; selain itu '' (lihat ImageUtil.safeSrc). */
  safeImgSrc(src) {
    if (typeof ImageUtil !== 'undefined' && ImageUtil.safeSrc) return ImageUtil.safeSrc(src);
    // Tanpa ImageUtil (seharusnya tidak pernah): jangan pernah simpan src mentah.
    return /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(String(src || ''))
      ? String(src) : '';
  },

  /** Teks keterangan/alt: baris & spasi dirapikan, panjang dibatasi. */
  _plainText(s, max) {
    const t = String(s == null ? '' : s)
      .replace(/[\r\n\t\f]+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
    return t.slice(0, max || 300);
  },

  /** Atribut lebar/tinggi gambar: angka wajar, atau 0 bila tidak ada. */
  _dim(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(8000, n) : 0;
  },

  /** Kelas figure -> ukuran ('s'|'m'|'l'), default 'm'. */
  _figSize(cls) {
    const m = /(?:^|\s)fig-([sml])(?:\s|$)/.exec(String(cls || ''));
    return m ? m[1] : 'm';
  },

  _runHtml(r) {
    if (!r.text) return '';
    let s = this.esc(r.text);
    if (r.italic) s = '<em>' + s + '</em>';
    if (r.bold) s = '<strong>' + s + '</strong>';
    return s;
  },

  /** Daftar blok -> HTML kanonik (bentuk tunggal yang disimpan). */
  serialize(blok) {
    return (blok || []).map(b => {
      if (b.tag === 'figure') return this._figureHtml(b);
      const attrs = b.scene ? ' class="scene"' : (b.gap ? ' class="gap"' : '');
      const inner = (b.runs || []).map(r => this._runHtml(r)).join('');
      return '<' + b.tag + attrs + '>' + inner + '</' + b.tag + '>';
    }).join('');
  },

  /** HTML kanonik sebuah blok ilustrasi. */
  _figureHtml(b) {
    const dims = (b.width > 0 ? ' width="' + b.width + '"' : '') +
                 (b.height > 0 ? ' height="' + b.height + '"' : '');
    const img = '<img src="' + this.escAttr(b.src) + '" alt="' + this.escAttr(b.alt || '') + '"' + dims + '>';
    const cap = b.caption ? '<figcaption>' + this.esc(b.caption) + '</figcaption>' : '';
    return '<figure class="fig-' + this._figSize('fig-' + (b.size || 'm')) + '">' + img + cap + '</figure>';
  },

  /** Sanitasi: html apa pun -> HTML kanonik aman (allowlist ketat). */
  sanitize(html) {
    return this.serialize(this.blocks(html));
  },

  /* ============================================
     TEKS POLOS <-> MODEL
     ============================================ */

  /** Teks polos -> HTML kanonik (satu baris = satu paragraf, baris kosong = jeda). */
  fromPlainText(text) {
    const paras = (typeof TextUtil !== 'undefined' && TextUtil.paragraphs)
      ? TextUtil.paragraphs(text)
      : [];
    return this.serialize(paras.map(p => ({
      tag: 'p', gap: !!p.gap, scene: false,
      runs: p.text ? [{ text: p.text, bold: false, italic: false }] : []
    })));
  },

  /** Model -> teks polos (untuk ekspor .txt & hitung kata). */
  toPlainText(html) {
    const out = [];
    let prev = null;
    for (const b of this.blocks(html)) {
      // Ilustrasi tak bisa digambar di berkas .txt: keterangannya (nama tokoh)
      // yang ditinggalkan, dipisah baris kosong seperti judul/kutipan.
      const text = b.tag === 'figure'
        ? String(b.caption || b.alt || '').replace(/\u00a0/g, ' ')
        : (b.runs || []).map(r => r.text).join('').replace(/\u00a0/g, ' ');
      const needSpace = !!(
        b.gap || b.scene || b.tag !== 'p' ||
        (prev && (prev.tag !== 'p' || prev.scene))
      );
      if (text) {
        if (needSpace && out.length) out.push('');
        out.push(text);
      }
      // ilustrasi tanpa keterangan tidak meninggalkan baris kosong sisa
      prev = (b.tag === 'figure' && !text) ? null : b;
    }
    return out.join('\n');
  },

  /** Jumlah kata isi bab — format 'html' dibaca lewat model blok. */
  wordCount(content, format) {
    const plain = format === 'html' ? this.toPlainText(content) : (content || '');
    return (typeof TextUtil !== 'undefined' && TextUtil.countWords)
      ? TextUtil.countWords(plain) : 0;
  },

  /* ============================================
     RENDER KE DOM (tanpa innerHTML — node dibangun ulang)
     ============================================ */

  /** Bangun node dari daftar blok memakai dokumen milik `container`. */
  buildNodes(container, blok) {
    const doc = container.ownerDocument || document;
    const frag = doc.createDocumentFragment();
    (blok || []).forEach(b => {
      if (b.tag === 'figure') { frag.appendChild(this._figureNode(doc, b)); return; }
      const el = doc.createElement(b.tag);
      if (b.scene) el.className = 'scene';
      else if (b.gap) el.className = 'gap';
      (b.runs || []).forEach(r => {
        let parent = el;
        if (r.bold) { const s = doc.createElement('strong'); parent.appendChild(s); parent = s; }
        if (r.italic) { const e = doc.createElement('em'); parent.appendChild(e); parent = e; }
        parent.appendChild(doc.createTextNode(r.text));
      });
      frag.appendChild(el);
    });
    return frag;
  },

  /**
   * Bangun <figure> dari blok ilustrasi.
   * Atribut di-set lewat setAttribute (bukan innerHTML) — src sudah lolos
   * allowlist, jadi tidak ada celah injeksi. Gambar ditandai tidak bisa
   * disunting (contenteditable=false) supaya satu tombol Backspace
   * menghapus seluruh ilustrasi, bukan menyisipkan teks ke dalamnya.
   */
  _figureNode(doc, b) {
    const fig = doc.createElement('figure');
    fig.className = 'fig-' + this._figSize('fig-' + (b.size || 'm'));
    const img = doc.createElement('img');
    img.setAttribute('src', b.src);
    img.setAttribute('alt', b.alt || '');
    if (b.width > 0) img.setAttribute('width', String(b.width));
    if (b.height > 0) img.setAttribute('height', String(b.height));
    img.setAttribute('contenteditable', 'false');
    img.setAttribute('draggable', 'false');
    fig.appendChild(img);
    if (b.caption) {
      const cap = doc.createElement('figcaption');
      cap.textContent = b.caption;
      fig.appendChild(cap);
    }
    return fig;
  },

  /** Ganti isi container dengan paragraf berformat hasil sanitasi. */
  renderInto(container, html) {
    if (!container) return;
    const frag = this.buildNodes(container, this.blocks(html));
    container.replaceChildren(frag);
  },

  /** Muat isi ke editor (format 'html' = HTML kanonik; selainnya teks polos lama). */
  setContent(el, content, format) {
    if (!el) return;
    const html = format === 'html'
      ? String(content == null ? '' : content)
      : this.fromPlainText(content);
    this.renderInto(el, html);
    this.syncEmpty(el);
  },

  /** Serialisasi editor -> HTML kanonik aman. */
  getHtml(el) {
    if (!el) return '';
    return this.sanitize(el.innerHTML);
  },

  /**
   * Teks polos dari DOM editor — untuk hitung kata cepat tanpa parse ulang
   * seluruh dokumen (sanitize/getHtml) pada setiap ketikan.
   */
  domText(el) {
    if (!el) return '';
    let out = '';
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) out += c.nodeValue + ' ';
        else if (c.nodeType === 1) walk(c);
      }
    };
    walk(el);
    return out.replace(/\u00a0/g, ' ');
  },

  /** Penanda kosong untuk placeholder CSS (ilustrasi tanpa teks pun berisi). */
  syncEmpty(el) {
    if (!el) return;
    const empty = !(el.textContent || '').replace(/[\s\u00a0]/g, '') &&
      !(el.querySelector && el.querySelector('img'));
    el.setAttribute('data-empty', empty ? 'true' : 'false');
  },

  /** Letakkan kursor di akhir isi editor. */
  focusEnd(el) {
    if (!el) return;
    const doc = el.ownerDocument;
    const sel = doc && doc.getSelection && doc.getSelection();
    if (!sel) return;
    try {
      const r = doc.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      if (sel.removeAllRanges) sel.removeAllRanges();
      sel.addRange(r);
      if (el.focus) el.focus();
    } catch {}
  },

  /* ============================================
     OPERASI SELEKSI (dipakai panel format & pintasan)
     Murni Selection/Range — bebas perintah browser lama.
     ============================================ */

  _sel(el) {
    const doc = el && el.ownerDocument;
    return doc && doc.getSelection ? doc.getSelection() : null;
  },

  _range(el) {
    const sel = this._sel(el);
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!r) return null;
    const root = el;
    if (r.commonAncestorContainer !== root && !root.contains(r.commonAncestorContainer)) return null;
    return r;
  },

  _nearestBlock(node, root) {
    let n = node && node.nodeType === 3 ? node.parentNode : node;
    while (n && n !== root) {
      if (n.nodeType === 1 && n.matches && n.matches(this.BLOCKISH)) return n;
      n = n.parentNode;
    }
    return root;
  },

  /**
   * Blok terdalam (tanpa blok lain di dalamnya) yang tersentuh seleksi.
   * Editor yang berisi sesuatu tetapi tak punya blok teks (mis. hanya
   * ilustrasi) menghasilkan daftar kosong — BUKAN editor itu sendiri,
   * supaya operasi format tidak pernah mengganti wadah editor.
   */
  _blocksIn(el, range) {
    const list = [...el.querySelectorAll(this.BLOCKISH)]
      .filter(b => !b.querySelector || !b.querySelector(this.BLOCKISH));
    const blocks = list.length ? list : (el.childElementCount ? [] : [el]);
    return blocks.filter(b => this._intersects(range, b));
  },

  /** Apakah `range` bersinggungan dengan isi `node`? */
  _intersects(range, node) {
    const doc = node.ownerDocument;
    try {
      const r = doc.createRange();
      r.selectNodeContents(node);
      // nilai konstanta DOM: START_TO_END=1, END_TO_START=3
      return range.compareBoundaryPoints(1, r) > 0 && range.compareBoundaryPoints(3, r) < 0;
    } catch { return false; }
  },

  /** (node, offset) -> jumlah karakter dari awal blok. */
  _offsetIn(root, node, offset) {
    let count = 0, found = false;
    const walk = (n) => {
      if (found) return;
      if (n === node) {
        if (n.nodeType === 3) { count += Math.min(offset, n.nodeValue.length); found = true; return; }
        const lim = Math.min(offset, n.childNodes.length);
        for (let i = 0; i < lim; i++) count += (n.childNodes[i].textContent || '').length;
        found = true;
        return;
      }
      if (n.nodeType === 3) { count += n.nodeValue.length; return; }
      for (const c of n.childNodes) { walk(c); if (found) return; }
    };
    if (root === node) {
      const lim = Math.min(offset, root.childNodes.length);
      for (let i = 0; i < lim; i++) count += (root.childNodes[i].textContent || '').length;
      return count;
    }
    for (const c of root.childNodes) { walk(c); if (found) break; }
    return count;
  },

  /** Jumlah karakter dari awal blok -> (node, offset). */
  _pointIn(root, offset) {
    let rest = Math.max(0, offset);
    const walk = (n) => {
      if (n.nodeType === 3) {
        if (rest <= n.nodeValue.length) return { node: n, offset: rest };
        rest -= n.nodeValue.length;
        return null;
      }
      for (const c of n.childNodes) {
        const hit = walk(c);
        if (hit) return hit;
      }
      return null;
    };
    for (const c of root.childNodes) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return { node: root, offset: root.childNodes.length };
  },

  /** Simpan posisi seleksi sebagai offset teks per blok (teks tak berubah). */
  _saveSel(el, range, blocks) {
    return blocks.map(b => {
      let start = 0, end = 0;
      try {
        const inner = b.ownerDocument.createRange();
        inner.selectNodeContents(b);
        // titik mulai: maks(range.start, awal blok)
        start = range.compareBoundaryPoints(0, inner) < 0 ? 0 : this._offsetIn(b, range.startContainer, range.startOffset);
        end = range.compareBoundaryPoints(2, inner) > 0 ? (b.textContent || '').length : this._offsetIn(b, range.endContainer, range.endOffset);
      } catch {}
      return { b, start, end };
    });
  },

  _restoreSel(el, saved) {
    if (!saved.length) return;
    const doc = el.ownerDocument;
    const sel = this._sel(el);
    if (!sel) return;
    const valid = saved.filter(s => s.b && s.b.isConnected !== false && el.contains(s.b));
    if (!valid.length) return;
    try {
      const first = valid[0], last = valid[valid.length - 1];
      const a = this._pointIn(first.b, first.start);
      const z = this._pointIn(last.b, last.end);
      const r = doc.createRange();
      r.setStart(a.node, a.offset);
      r.setEnd(z.node, z.offset);
      if (sel.removeAllRanges) sel.removeAllRanges();
      sel.addRange(r);
    } catch {}
  },

  /** Bungkus/buka bungkus penanda inline pada seleksi (strong|em). */
  toggleInline(el, tag) {
    const range = this._range(el);
    if (!range || range.collapsed) return false;
    const doc = el.ownerDocument;
    const blocks = this._blocksIn(el, range);
    if (!blocks.length) return false;

    // semua teks tersentuh sudah berpenanda? -> buka bungkus; selain itu -> bungkus
    const texts = [];
    for (const b of blocks) {
      for (const tn of this._textNodesBetween(b, range)) texts.push(tn);
    }
    const allWrapped = texts.length > 0 && texts.every(tn => this._hasMark(tn, tag, el));

    const saved = this._saveSel(el, range, blocks);
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      const sub = this._subRange(range, b);
      if (!sub) continue;
      // offset awal sebagai jangkar sisip ulang (extractContents melepas
      // titik range dari DOM induk, jadi tidak boleh dipakai ulang)
      const at = this._offsetIn(b, sub.startContainer, sub.startOffset);
      const frag = sub.extractContents();
      if (allWrapped) {
        this._unwrapAll(frag, tag);
        this._insertAt(b, at, frag);
      } else {
        const wrapper = doc.createElement(tag);
        wrapper.appendChild(frag);
        this._mergeMarks(wrapper, tag);
        this._insertAt(b, at, wrapper);
      }
      this._pruneEmpty(b);
    }
    this._restoreSel(el, saved);
    return true;
  },

  /** Sisipkan node/fragmen pada posisi offset karakter ke-`offset` dalam root. */
  _insertAt(root, offset, node) {
    const at = this._pointIn(root, offset);
    if (!at) { root.appendChild(node); return; }
    if (at.node.nodeType === 3) {
      if (at.offset <= 0) {
        at.node.parentNode.insertBefore(node, at.node);
      } else if (at.offset < at.node.nodeValue.length) {
        at.node.splitText(at.offset);
        at.node.parentNode.insertBefore(node, at.node.nextSibling);
      } else {
        at.node.parentNode.insertBefore(node, at.node.nextSibling);
      }
    } else {
      at.node.insertBefore(node, at.node.childNodes[at.offset] || null);
    }
  },

  /** Buang sisa bungkus kosong (hasil belah tepi seleksi). */
  _pruneEmpty(root) {
    const dead = [];
    const walk = (n) => {
      for (const c of [...n.childNodes]) {
        if (c.nodeType !== 1) continue;
        walk(c);
        const t = String(c.tagName).toLowerCase();
        if ((t === 'strong' || t === 'em' || t === 'b' || t === 'i') && !(c.textContent || '')) dead.push(c);
      }
    };
    walk(root);
    dead.forEach(d => { if (d.parentNode) d.parentNode.removeChild(d); });
  },

  /** Kumpulkan simpul teks dalam blok yang tersentuh seleksi. */
  _textNodesBetween(block, range) {
    const out = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          if (c.nodeValue.length && this._intersects(range, c)) out.push(c);
        } else if (c.nodeType === 1) walk(c);
      }
    };
    walk(block);
    return out;
  },

  _hasMark(node, tag, root) {
    const alt = tag === 'strong' ? 'b' : (tag === 'em' ? 'i' : null);
    let n = node && node.nodeType === 3 ? node.parentNode : node;
    while (n && n !== root) {
      if (n.nodeType === 1) {
        const t = String(n.tagName).toLowerCase();
        if (t === tag || (alt && t === alt)) return true;
      }
      n = n.parentNode;
    }
    return false;
  },

  _unwrapAll(frag, tag) {
    const alt = tag === 'strong' ? 'b' : (tag === 'em' ? 'i' : null);
    const victims = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType !== 1) continue;
        const t = String(c.tagName).toLowerCase();
        if (t === tag || (alt && t === alt)) victims.push(c);
        else walk(c);
      }
    };
    walk(frag);
    for (const v of victims) {
      const parent = v.parentNode;
      if (!parent) continue;
      while (v.firstChild) parent.insertBefore(v.firstChild, v);
      parent.removeChild(v);
    }
  },

  /** Gabungkan penanda bersarang sejenis (hasil toggle parsial). */
  _mergeMarks(wrapper, tag) {
    const walk = (n) => {
      for (const c of [...n.childNodes]) {
        if (c.nodeType !== 1) continue;
        if (String(c.tagName).toLowerCase() === tag && c !== wrapper) {
          const parent = c.parentNode;
          while (c.firstChild) parent.insertBefore(c.firstChild, c);
          parent.removeChild(c);
          continue;
        }
        walk(c);
      }
    };
    walk(wrapper);
  },

  /** Seleksi dipersempit ke isi satu blok. */
  _subRange(range, block) {
    const doc = block.ownerDocument;
    try {
      const r = doc.createRange();
      r.selectNodeContents(block);
      // mulai = maks(range.start, r.start); akhir = min(range.end, r.end)
      if (range.compareBoundaryPoints(0, r) > 0) r.setStart(range.startContainer, range.startOffset);
      if (range.compareBoundaryPoints(2, r) < 0) r.setEnd(range.endContainer, range.endOffset);
      if (r.collapsed) return null;
      return r;
    } catch { return null; }
  },

  /** Ganti jenis blok pada seleksi (p|h2|blockquote) — isi dipertahankan. */
  toggleBlock(el, tag) {
    const range = this._range(el);
    if (!range) return false;
    const blocks = this._blocksIn(el, range)
      .filter(b => b !== el && b.tagName && String(b.tagName).toLowerCase() !== 'figure');
    if (!blocks.length) return false;
    const saved = this._saveSel(el, range, blocks);
    const made = [];
    blocks.forEach(b => {
      const cur = String(b.tagName).toLowerCase();
      const target = (this.BLOCK_MAP[cur] === tag || cur === tag) ? 'p' : tag;
      const neu = b.ownerDocument.createElement(target);
      if (target === 'p' && b.classList && b.classList.contains('gap')) neu.classList.add('gap');
      while (b.firstChild) neu.appendChild(b.firstChild);
      b.parentNode.replaceChild(neu, b);
      made.push(neu);
    });
    // perbarui referensi blok pada simpanan seleksi
    saved.forEach((s, i) => { s.b = made[i] || s.b; });
    this._restoreSel(el, saved);
    return true;
  },

  /** Sisipkan jeda adegan ("* * *") + baris lanjutan kosong. */
  insertSceneBreak(el) {
    if (!el) return false;
    const doc = el.ownerDocument;
    const range = this._range(el);
    const block = range ? this._nearestBlock(range.startContainer, el) : null;
    const scene = doc.createElement('p');
    scene.className = 'scene';
    scene.appendChild(doc.createTextNode(this.SCENE_TEXT));
    const cont = doc.createElement('p');
    cont.appendChild(doc.createElement('br'));

    if (block && block !== el && el.contains(block)) {
      const empty = !(block.textContent || '').replace(/[\s\u00a0]/g, '');
      if (empty) {
        block.parentNode.insertBefore(scene, block);
      } else {
        block.parentNode.insertBefore(scene, block.nextSibling);
        scene.parentNode.insertBefore(cont, scene.nextSibling);
      }
    } else {
      el.appendChild(scene);
      el.appendChild(cont);
    }
    const target = (block && block !== el && !(block.textContent || '').replace(/[\s\u00a0]/g, '')) ? block : cont;
    try {
      const sel = this._sel(el);
      const r = doc.createRange();
      r.selectNodeContents(target);
      r.collapse(true);
      if (sel) {
        if (sel.removeAllRanges) sel.removeAllRanges();
        sel.addRange(r);
      }
    } catch {}
    return true;
  },

  /**
   * Sisipkan ilustrasi (<figure>) di posisi kursor, lalu sediakan paragraf
   * lanjutan kosong supaya penulis bisa langsung mengetik lagi.
   * data: { src, alt, caption, width, height, size }
   * Mengembalikan false bila src tidak aman (gambar tidak pernah disimpan).
   */
  insertFigure(el, data) {
    if (!el || !data) return false;
    const src = this.safeImgSrc(data.src);
    if (!src) return false;
    const doc = el.ownerDocument;
    const fig = this._figureNode(doc, {
      tag: 'figure', src,
      alt: this._plainText(data.alt),
      caption: this._plainText(data.caption),
      width: this._dim(data.width),
      height: this._dim(data.height),
      size: this._figSize('fig-' + (data.size || 'm'))
    });
    const cont = doc.createElement('p');
    cont.appendChild(doc.createElement('br'));

    const range = this._range(el);
    const block = range ? this._nearestBlock(range.startContainer, el) : null;
    if (block && block !== el && el.contains(block)) {
      const empty = !(block.textContent || '').replace(/[\s\u00a0]/g, '');
      if (empty) {
        // paragraf kosong tempat kursor berada: ganti (jangan sisakan baris hantu)
        block.parentNode.replaceChild(fig, block);
        fig.parentNode.insertBefore(cont, fig.nextSibling);
      } else {
        block.parentNode.insertBefore(fig, block.nextSibling);
        fig.parentNode.insertBefore(cont, fig.nextSibling);
      }
    } else {
      el.appendChild(fig);
      el.appendChild(cont);
    }

    // Kursor berdiri di paragraf lanjutan — lanjut menulis tanpa menyentuh mouse
    try {
      const sel = this._sel(el);
      const r = doc.createRange();
      r.selectNodeContents(cont);
      r.collapse(true);
      if (sel) {
        if (sel.removeAllRanges) sel.removeAllRanges();
        sel.addRange(r);
      }
    } catch {}
    this.syncEmpty(el);
    return true;
  },

  /**
   * Tab / Shift+Tab: indent tiap blok tersentuh dengan dua nbsp.
   * Isi seleksi TIDAK PERNAH ditimpa.
   */
  indent(el, dir) {
    const range = this._range(el);
    const blocks = range ? this._blocksIn(el, range) : [];
    if (!blocks.length) return false;
    const saved = range ? this._saveSel(el, range, blocks) : [];
    let changed = false;
    blocks.forEach((b, i) => {
      let delta = 0;
      if (dir > 0) {
        b.insertBefore(b.ownerDocument.createTextNode('\u00a0\u00a0'), b.firstChild);
        delta = 2;
      } else {
        // buang maksimal 2 karakter indent di awal blok
        let removed = 0;
        const first = this._pointIn(b, 0);
        if (first && first.node.nodeType === 3) {
          const m = /^([ \t\u00a0]{1,2})/.exec(first.node.nodeValue);
          if (m) {
            first.node.nodeValue = first.node.nodeValue.slice(m[1].length);
            removed = m[1].length;
          }
        }
        delta = -removed;
      }
      if (delta) {
        changed = true;
        if (saved[i]) {
          saved[i].start = Math.max(0, saved[i].start + delta);
          saved[i].end = Math.max(saved[i].start, saved[i].end + delta);
        }
      }
    });
    if (changed) this._restoreSel(el, saved);
    return changed;
  },

  /** Status untuk panel format (dipakai tombol aria-pressed). */
  queryState(el) {
    const st = { bold: false, italic: false, heading: false, quote: false, block: null };
    const range = this._range(el);
    if (!range) return st;
    const node = range.startContainer;
    st.bold = this._hasMark(node, 'strong', el);
    st.italic = this._hasMark(node, 'em', el);
    const b = this._nearestBlock(node, el);
    const tag = b === el ? 'p' : String(b.tagName).toLowerCase();
    st.block = this.BLOCK_MAP[tag] || 'p';
    st.heading = st.block === 'h2';
    st.quote = st.block === 'blockquote';
    return st;
  }
};

/* Muat modul (browser global / uji vm). */
if (typeof window !== 'undefined') window.RichText = RichText;
