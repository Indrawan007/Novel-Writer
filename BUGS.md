# Laporan Bug — Novel Writer v1.4.0

**Tanggal pemeriksaan:** 22 September 2026
**Commit:** `6f511fc` (branch `arena/01a0c692-novel-writer`)
**Cakupan:** `index.html`, `css/style.css`, `js/*.js`, `sw.js`, `manifest.json`,
`tools/generate-icons.js`, `test/*`, `.github/workflows/*`, `README.md`

## Metode

1. `npm test` (51 kasus pada saat audit, Node 22 + jsdom) — dijalankan ±12 kali.
2. ESLint 9 dengan aturan `no-undef`, `no-dupe-keys`, `no-unreachable`, dll.
3. Pemeriksaan silang statis: id HTML ↔ JS, kunci i18n ↔ kamus, `data-icon` ↔ `Icons`,
   aset SW/manifest ↔ berkas nyata, kelas CSS ↔ markup/JS, variabel CSS.
4. Proyeksi perilaku langsung di jsdom (probes): mode baca, mode fokus, CRUD,
   hapus proyek/bab, sinkronisasi antar-tab, ekspor, i18n, modal & fokus.
5. Fuzz ringan pada `RichText.sanitize()` (15 bentuk HTML) untuk idempotensi & fidelitas.

## Ringkasan

| Keparahan | Jumlah | ID | Status |
|---|---|---|---|
| Kritis | 0 | — | — |
| Tinggi | 1 | BUG-01 | ✅ |
| Sedang | 5 | BUG-02 … BUG-06 | ✅ |
| Rendah | 13 | BUG-07 … BUG-19 | ✅ |
| Kosmetik / kode mati | 1 | BUG-20 | ✅ |
| **Total** | **20** | | **20/20 diperbaiki** |

Tidak ada bug yang merusak data secara permanen pada alur utama, tetapi ada
**satu fitur yang benar-benar mati** (BUG-01) dan **beberapa jalur kehilangan
tulisan / jebakan fokus** (BUG-03, BUG-05).

> **Pembaruan (v1.4.1)** — seluruh 20 temuan sudah diperbaiki. Jumlah kasus uji
> naik 51 → 62 (regresi untuk BUG-01…06, 09, 11, 12, 13, 15, 16). Rincian tiap
> perbaikan ada di baris **Status** masing-masing entri di bawah.

---

## Detail

### BUG-01 — Blok kode yatim: `Alt+←/→` di Mode Baca tidak pernah jalan (dan menyandung `e` tak terdefinisi)

- **Lokasi:** `js/app.js:1758-1763` (di dalam `bindEvents()`, di luar semua handler)
- **Keparahan:** Tinggi
- **Status:** ✅ Diperbaiki (v1.4.1) — blok yatim dipindahkan ke dalam handler `document.addEventListener('keydown', …)`; tes “BUG-01: Alt+Panah di Mode Baca benar-benar memindah bab”.
- **Bukti:**

  ```js
  $('#inp-restore')?.addEventListener('change', (e) => { … });   // baris 1754-1757
  if (isReaderMode && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      gotoReaderChapter(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
  ```

  Blok ini terselip di badan `bindEvents()` — bukan di dalam sebuah handler
  `keydown`. `e` tidak terdefinisi di scope itu (ESLint: `no-undef` × 5).
  Satu-satunya alasan aplikasi tidak meledak adalah `isReaderMode` selalu `false`
  saat `bindEvents()` dipanggil dari `init()`, sehingga `&&` short-circuit.
  Akibatnya **pintasan `Alt+←` / `Alt+→` yang dijanjikan README tidak pernah
  terdaftar** dan tidak berfungsi sama sekali.
- **Dampak:** fitur navigasi bab (README: “`Alt+←` / `Alt+→` — Bab sebelum/sesudah
  (saat Mode Baca)”) mati total. Kalau kelak `bindEvents()` dipanggil ulang saat
  Mode Baca aktif, baris ini melempar `ReferenceError` dan **seluruh sisa
  pemasangan event** (Escape, Ctrl+S, flush sebelum tab ditutup, sinkronisasi
  antar-tab, tombol tutup modal) gagal terpasang.
- **Verifikasi:** probe jsdom — masuk Mode Baca → dispatch `Alt+ArrowRight` →
  bab aktif tetap `c1` (harusnya `c2`).
- **Saran:** pindahkan blok tersebut ke dalam handler
  `document.addEventListener('keydown', …)` yang sudah ada (`js/app.js:1777`),
  sebelum/bersamaan dengan penanganan `Escape`.

---

### BUG-02 — `renderEditor()` mencuri fokus dari modal yang sedang terbuka

- **Lokasi:** `js/app.js:292-346` (`renderEditor()` → `RichText.focusEnd(dom.editor)` pada baris 340)
- **Keparahan:** Sedang
- **Status:** ✅ Diperbaiki (v1.4.1) — `RichText.focusEnd()` dilewati bila `modalOpen()` benar (`js/app.js`, `renderEditor`).
- **Dampak:** `renderAll()` dipanggil dari beberapa tempat, termasuk penggantian
  bahasa di Pengaturan (`js/app.js:1698-1706`) dan sinkronisasi antar-tab
  (`onExternalStorage`). Karena `renderEditor()` selalu memanggil `focusEnd()`,
  fokus melompat ke editor **di belakang overlay modal** — focus trap rusak,
  pengguna keyboard “tersesat” di balik modal, dan pembaca layar akan
  mengumumkan editor.
- **Verifikasi:** probe jsdom — buka Pengaturan → tunggu fokus mendarat di
  `#set-lang` → ganti bahasa → `document.activeElement` berubah menjadi `#editor`,
  padahal modal masih terbuka (`$('#modal-settings').contains(activeElement) === false`).
- **Saran:** jangan panggil `focusEnd()` bila `modalOpen()` benar, atau hanya
  panggil bila editor sudah menjadi elemen aktif sebelumnya
  (`document.activeElement === dom.editor`).

---

### BUG-03 — `Tab` selalu dicegat di editor: perangkap keyboard (a11y)

- **Lokasi:** `js/app.js:858-864` (`handleTab`)
- **Keparahan:** Sedang
- **Status:** ✅ Diperbaiki (v1.4.1) — `handleTab()` memanggil `preventDefault()` hanya bila `RichText.indent()` mengembalikan `true`.
- **Bukti:**

  ```js
  function handleTab(e) {
    const ed = dom.editor;
    if (!ed) return;
    e.preventDefault();                                    // selalu
    if (RichText.indent(ed, e.shiftKey ? -1 : 1)) markDirty();
  }
  ```

  `preventDefault()` dipanggil meski `RichText.indent()` gagal / tidak melakukan
  apa pun (mis. kursor berada di blok kosong, atau tidak ada blok tersentuh).
- **Dampak:** pengguna keyboard **tidak bisa keluar dari editor** dengan `Tab`
  (WCAG 2.1.1). Satu-satunya jalan keluar adalah mengklik dengan mouse.
- **Verifikasi:** probe jsdom — `Tab` di editor selalu menghasilkan
  `defaultPrevented === true`.
- **Saran:** hanya `preventDefault()` bila `RichText.indent()` mengembalikan
  `true`; sisanya biarkan browser memindahkan fokus (opsional: sediakan
  `Esc` lalu `Tab` seperti editor CMS pada umumnya).

---

### BUG-04 — Hapus proyek aktif membuat UI dan data tersimpan tidak sinkron

- **Lokasi:** `js/app.js:431-441` (`deleteProject`)  ↔ `js/storage.js:209-217` (`Storage.deleteProject`)
- **Keparahan:** Sedang
- **Status:** ✅ Diperbaiki (v1.4.1) — `deleteProject()` mengadopsi hasil `Storage.repairPointers()` lalu membuka bab pertama proyek berikutnya (sama seperti `selectProject`).
- **Dampak:** `Storage.deleteProject()` mengalihkan `settings.lastProject` ke
  proyek pertama yang tersisa, sedangkan `deleteProject()` di app hanya
  menyetel `activeProjectId = null`. Maka sesi berjalan menampilkan empty-state
  “Pilih proyek”, tetapi **setelah dimuat ulang aplikasi membuka proyek lain**.
  Statistik sidebar, daftar bab, dan toolbar ikut hilang meski proyek masih ada.
- **Verifikasi:** probe jsdom dengan dua proyek — hapus proyek aktif:
  `activeProjectId = null` tetapi `settings.lastProject = 'p2'`.
- **Saran:** setelah `Storage.deleteProject()`, baca ulang
  `Storage.repairPointers()` dan pakai `settings.lastProject` sebagai
  `activeProjectId` (atau set `lastProject = null` bila memang ingin kosong).

---

### BUG-05 — Ketikan hilang tanpa peringatan bila tab lain menghapus bab aktif

- **Lokasi:** `js/app.js:1504-1515` (`onExternalStorage`) + `js/app.js:754-780` (`saveCurrentChapter`)
- **Keparahan:** Sedang
- **Status:** ✅ Diperbaiki (v1.4.1) — ditambah `Storage.saveDraft/hasDraft/takeDraft()` + tombol “Pulihkan draf” di Pengaturan + toast error; ketikan tak lagi hilang diam-diam.
- **Dampak:** saat tab lain menulis, `onExternalStorage()` mengembalikan ketikan
  lokal ke editor dan menandai `dirty = true`. Jika bab yang sedang dibuka
  **dihapus** di tab lain, `saveCurrentChapter()` tidak menemukan bab
  (`if (!ch) return true;`) → `dirty` tetap `true`, autosave berikutnya juga
  tidak menyimpan apa pun, dan **teks hilang** saat render/reload berikutnya.
  Tidak ada toast peringatan.
- **Verifikasi:** probe jsdom — ketik di editor → tab lain menghapus bab aktif →
  setelah autosave, teks masih ada di editor tetapi tidak ada di
  `localStorage` (`Proyek B:` tanpa isi).
- **Saran:** bila `afterDataReplaced()` membuat `activeChapterId` tidak valid,
  simpan draf ke penampung sementara (`novel-writer-draft-<id>`) dan tampilkan
  toast; atau konfirmasi sebelum membuang ketikan yang belum tersimpan.

---

### BUG-06 — Judul kosong: tombol “Buat” / “Simpan” diam saja tanpa pesan

- **Lokasi:** `js/app.js:409` (`createProject`), `471` (`saveRenameProject`), `552` (`saveRenameChapter`)
- **Keparahan:** Sedang (UX)
- **Status:** ✅ Diperbaiki (v1.4.1) — ditambah `rejectEmptyTitle()`/`clearTitleError()`: toast + `aria-invalid="true"` + garis tepi merah di CSS.
- **Dampak:** pengguna mengisi form, menekan “Buat”/“Simpan” (atau Enter) dengan
  judul kosong/berisi spasi → modal tetap terbuka, **tidak ada toast, tidak ada
  pesan error, tidak ada penanda `aria-invalid`**. Terlihat seperti aplikasi
  macet. Bandingkan dengan `createChapter()` (baris 482) yang memberi nama
  otomatis “Bab N”.
- **Verifikasi:** probe jsdom — judul `"   "` → modal tetap terbuka, jumlah
  proyek tidak berubah, `#toast` tetap `hidden`.
- **Saran:** tampilkan `toast(...)` + fokuskan input + `aria-invalid="true"`,
  atau pakai nama default seperti pada bab baru.

---

### BUG-07 — Duplikat kunci `editorPlaceholder` di kamus bahasa Inggris

- **Lokasi:** `js/i18n.js:164-165`
- **Keparahan:** Rendah
- **Status:** ✅ Diperbaiki (v1.4.1) — kunci ganda dihapus; kamus ID/EN kini 120 kunci tanpa duplikasi.
- **Bukti:**

  ```js
  editorPlaceholder: "Start writing...\n\nOne line = one paragraph. Press Enter for a new paragraph.",
  editorPlaceholder: "Start writing...\n\nPress Enter for a new paragraph. Use the toolbar for …",
  ```

  Kunci pertama (peninggalan era teks polos/Markdown) selalu tertimpa oleh yang
  kedua → **kode mati**; ESLint `no-dupe-keys` error.
- **Dampak:** tidak terlihat pengguna, tetapi membingungkan saat menerjemahkan
  dan berpotensi error di mode strict (ESM/`"use strict"` pada objek tidak
  error, namun banyak linter/CI menolaknya).
- **Saran:** hapus baris 164.

---

### BUG-08 — Kelas `modal-open` dipasang tapi tidak punya aturan CSS

- **Lokasi:** `js/app.js:148` & `162` ↔ `css/style.css` (tidak ada selektor `.modal-open`)
- **Keparahan:** Rendah
- **Status:** ✅ Diperbaiki (v1.4.1) — ditambah `body.modal-open { overflow: hidden; }` di `css/style.css`.
- **Dampak:** latar belakang masih bisa digulung/di-scroll saat modal terbuka
  (dan pada perangkat sentuh, gesture ikut menggulung halaman di balik overlay).
- **Saran:** tambahkan `body.modal-open { overflow: hidden; }` (atau hapus kelas
  bila memang tidak diperlukan).

---

### BUG-09 — Spasi/baris baru di antara tag blok pada HTML tempel/impor dianggap “jeda adegan”

- **Lokasi:** `js/richtext.js:72-80` (`pushText`) dan `58-68` (`endBlock`)
- **Keparahan:** Rendah
- **Status:** ✅ Diperbaiki (v1.4.1) — `pushText()` mengabaikan teks yang hanya berisi spasi biasa di antara dua blok (nbsp tetap dihargai).
- **Bukti:** `sanitize('<p>a</p>\n\n<p>b</p>')` → `'<p>a</p><p class="gap">b</p>'`
  (seharusnya `<p>a</p><p>b</p>`).
  Teks murni ` "\n\n" ` dinormalisasi menjadi `" "` → dianggap run yang berisi →
  blok sempat dibuat, lalu dibuang saat `_finalizeBlock()` mengembalikan `null`
  dengan `gapOnEmpty = true` → `pendingGap = true` → paragraf berikutnya
  mendapat `class="gap"`.
- **Dampak:** hasil tempel dari Word/Google Docs/editor lain (yang menyisipkan
  newline antar-`<p>`) mendapat **spasi vertikal palsu** di editor, Mode Baca,
  dan ekspor PDF/DOCX/TXT. Konten kanonik buatan aplikasi sendiri aman
  (serialisasi tanpa whitespace → idempoten, sudah diuji).
- **Saran:** di `pushText`, anggap teks yang **seluruhnya** terdiri dari
  whitespace biasa (bukan `&nbsp;`) sebagai pemisah blok, bukan run:
  `if (!/[^\s]/.test(norm)) { if (cur) endBlock(); else pendingGap = true; return; }`
  — dengan tetap mempertahankan `\u00a0` (indent pengguna).

---

### BUG-10 — Semua listener mode imersif terdaftar di luar `init()`/`bindEvents()`

- **Lokasi:** `js/app.js:1820-1856` (`mousemove`, `pointerdown`, `wheel`,
  `touchstart`, `keydown`, `selectionchange`, `fullscreenchange`,
  `webkitfullscreenchange`) — menjorok ke dalam seolah masih di dalam
  `bindEvents()`, padahal fungsi sudah ditutup di baris 1817.
- **Keparahan:** Rendah (struktural)
- **Status:** ✅ Diperbaiki (v1.4.1) — ketujuh listener imersif dipindahkan ke dalam `bindEvents()` (diverifikasi: Mode Fokus/Esc/intip toolbar tetap jalan).
- **Dampak:** listener terpasang pada saat skrip dievaluasi, **sebelum
  `init()`** berjalan (dan sebelum `DOMContentLoaded` bila skrip dieksekusi
  saat `readyState === 'loading'`). Untuk saat ini tidak meledak karena semua
  handler diawali `if (!immersiveActive()) return;`, tetapi ini jebakan: setiap
  perbaikan yang menyentuh `dom.*` sebelum init akan menjadi bug nyata, dan
  listener ini tidak bisa dilepas/dipasang ulang seperti event lain.
- **Saran:** pindahkan seluruh blok ke dalam `bindEvents()`.

---

### BUG-11 — Mode Fokus: seluruh bab di-parse ulang (DOMParser) pada **setiap ketikan**

- **Lokasi:** `js/app.js:1048-1056` (`liveChapterWords`) ← dipanggil
  `updateFocusHud()` (baris 1058) ← `markDirty()` (baris 743-749)
- **Keparahan:** Rendah (performa)
- **Status:** ✅ Diperbaiki (v1.4.1) — HUD memakai `RichText.domText()` (walk node teks) — tanpa `DOMParser` per ketikan.
- **Dampak:** `RichText.getHtml(dom.editor)` = `sanitize(innerHTML)` = parse
  dokumen utuh dari awal. Untuk bab panjang (puluhan ribu kata) ini berjalan
  per penekanan tombol → potensi jeda saat mengetik pada perangkat lambat.
- **Saran:** hitung kata langsung dari DOM editor (walk node teks) untuk HUD,
  atau debounce `updateFocusHud()` (mis. 150–250 ms) terpisah dari autosave.

---

### BUG-12 — Statistik kata di sidebar baru diperbarui setelah autosave, bukan saat mengetik

- **Lokasi:** `js/app.js:368-381` (`updateStats`) — hanya dipanggil dari
  `renderChapters()` dan `saveCurrentChapter()`
- **Keparahan:** Rendah
- **Status:** ✅ Diperbaiki (v1.4.1) — `markDirty()` memanggil `updateStats()`; `chapterWords()` menghitung dari DOM saat `dirty`.
- **Verifikasi:** probe jsdom — setelah mengetik 6 kata, `#stat-chapter` masih
  `2`; menjadi `6` hanya setelah debounce 1 s.
- **Saran:** panggil `updateStats()` (ringan: hitung dari DOM editor) dari
  `markDirty()`, atau sinkronkan dengan jeda pendek.

---

### BUG-13 — `icons/apple-touch-icon.png` dipakai di HTML tetapi tidak di-precache Service Worker

- **Lokasi:** `index.html:20` ↔ `sw.js:12-31` (daftar `ASSETS` hanya berisi
  `icons/icon-192.png` & `icons/icon-512.png`)
- **Keparahan:** Rendah
- **Status:** ✅ Diperbaiki (v1.4.1) — `icons/apple-touch-icon.png` ditambahkan ke `ASSETS`, cache dinaikkan ke `novel-writer-v10`; ada tes konsistensinya.
- **Dampak:** ikon layar beranda iOS tidak tersedia saat offline pertama kali
  (permintaan jatuh ke stale-while-revalidate dan gagal tanpa cache).
- **Saran:** tambahkan `'icons/apple-touch-icon.png'` ke `ASSETS` (dan naikkan
  `CACHE_NAME`).

---

### BUG-14 — README tidak sinkron dengan kode

- **Lokasi:** `README.md`
- **Keparahan:** Rendah (dokumentasi)
- **Status:** ✅ Diperbaiki (v1.4.1) — README disamakan (62 kasus uji) + catatan rilis v1.4.1 ditambahkan.
- **Temuan:**
  1. “**Test suite** 48 kasus (Node + jsdom) + CI” — sebenarnya **51** kasus
     (bagian “Pengujian” menyebut 51, bagian “Fitur” menyebut 48).
  2. Tabel pintasan menjanjikan `Alt+←` / `Alt+→` untuk Mode Baca — fitur ini
     mati (lihat BUG-01).
  3. “ketikan lokal tidak dibuang” pada sinkronisasi antar-tab tidak berlaku
     bila bab aktif dihapus tab lain (lihat BUG-05).
- **Saran:** samakan angka, hapus/koreksi baris pintasan sampai BUG-01 diperbaiki.

---

### BUG-15 — Satu kasus uji bersifat flaky (bergantung pada waktu)

- **Lokasi:** `test/app.test.js:53` (`await wait(1300)` untuk debounce autosave 1000 ms)
- **Keparahan:** Rendah (CI)
- **Status:** ✅ Diperbaiki (v1.4.1) — ternyata **bukan** masalah timing: tes aset SW berjalan sebelum tes generator ikon. Ditambahkan hook `before()` yang menghasilkan ikon lebih dulu.
- **Bukti:** dari ±12 kali menjalankan suite lengkap, **1 kali** menghasilkan
  `50 pass / 1 fail`; 11 kali lainnya `51 pass / 0 fail` (termasuk 3 kali dengan
  beban CPU penuh). Kandidat paling mungkin adalah tes “CRUD proyek/bab +
  auto-save” yang hanya memberi margin 300 ms.
- **Saran:** jangan mengandalkan `setTimeout` nyata — gunakan
  `t.mock.timers` (Node 22) atau panggil `window.NovelWriter.flushNow()`
  sebagai pengganti `wait(1300)`.

---

### BUG-16 — Kegagalan `flushNow()` diabaikan sebelum mencadangkan / mengekspor

- **Lokasi:** `js/app.js:1378-1386` (`backupData`) dan `js/app.js:1656` (handler ekspor)
- **Keparahan:** Rendah
- **Status:** ✅ Diperbaiki (v1.4.1) — `backupData()` & handler ekspor mengecek hasil `flushNow()`: berkas tetap dibuat, lalu toast `exportNotSaved` bila gagal.
- **Dampak:** bila penyimpanan gagal (kuota penuh), `flushNow()` mengembalikan
  `false`, tetapi `backupData()`/`Exporter` tetap jalan memakai cache in-memory.
  Berkas cadangan terlihat “lebih baru” daripada data yang benar-benar tersimpan,
  sehingga pengguna bisa keliru menganggap datanya aman.
- **Saran:** bila `flushNow()` gagal, batalkan (atau minta konfirmasi) dan
  tampilkan toast error yang sudah ada.

---

### BUG-17 — Kontainer ekspor PDF ditambahkan ke `document.body` dalam keadaan terlihat

- **Lokasi:** `js/export.js:188` (`document.body.appendChild(container)`)
- **Keparahan:** Rendah (UX)
- **Status:** ✅ Diperbaiki (v1.4.1) — kontainer ekspor kini `position: absolute; left: -10000px;` (tidak lagi berkedip di halaman).
- **Dampak:** selama `html2pdf` bekerja (bisa beberapa ratus ms pada bab
  panjang), salinan dokumen muncul di dasar halaman dan posisi gulung bisa
  berpindah — layar “berkedip”.
- **Saran:** sembunyikan di luar layar, mis.
  `position: fixed; left: -10000px; top: 0;` (html2pdf tetap merender elemen
  yang tidak terlihat oleh pengguna).

---

### BUG-18 — `afterDataReplaced()` tidak mereset state turunan

- **Lokasi:** `js/app.js:1388-1424`
- **Keparahan:** Rendah
- **Status:** ✅ Diperbaiki (v1.4.1) — `afterDataReplaced()` menyetel ulang `focusStartWords`, menyegarkan HUD, `updateUndoRestoreButton()` dan `updateRestoreDraftButton()`.
- **Temuan:**
  1. `focusStartWords` tidak dihitung ulang → penghitung “+N sesi ini” di HUD
     Mode Fokus melenceng setelah restore/undo restore.
  2. `updateUndoRestoreButton()` tidak dipanggil → tombol “Batalkan restore
     terakhir” di modal Pengaturan bisa masih menyala/mati setelah impor.
- **Saran:** setel ulang `focusStartWords = liveChapterWords()` dan panggil
  `updateUndoRestoreButton()` di akhir fungsi.

---

### BUG-19 — `touchDrag` bisa bocor bila pointerdown baru terjadi saat drag sentuh masih aktif

- **Lokasi:** `js/app.js:651-662` (`onTouchDragStart`) dan `711-721` (`cancelTouchDrag`)
- **Keparahan:** Rendah
- **Status:** ✅ Diperbaiki (v1.4.1) — `cancelTouchDrag()` dipanggil di awal `onTouchDragStart()` bila drag lama masih aktif.
- **Dampak:** `onTouchDragStart` menimpa `touchDrag` tanpa memanggil
  `cancelTouchDrag()` lebih dulu → timer long-press lama tidak dibersihkan dan
  elemen lama bisa tertinggal berkelas `dragging`.
- **Saran:** panggil `cancelTouchDrag()` di awal `onTouchDragStart` bila
  `touchDrag` belum `null`.

---

### BUG-20 — Kode mati & kebersihan (tanpa dampak fungsional)

- **Keparahan:** Kosmetik
- **Status:** ✅ Diperbaiki (v1.4.1) — `Icons.eye`/`Icons.alert`, `TextUtil.render`, 5 kunci i18n tak terpakai dibuang; parameter `showToast` dihapus; `catch {}`; dua pernyataan dipisah; `#empty-state` diberi atribut `hidden`.
- **Temuan:**
  - `js/icons.js`: `Icons.eye` dan `Icons.alert` tidak dipakai di mana pun
    (tidak di HTML, tidak di JS).
  - `js/text.js`: `TextUtil.render()` tidak pernah dipanggil.
  - `js/i18n.js`: kunci `noChapter`, `focusModeActive`, `readerModeActive`,
    `focusHint`, `readerHint` tidak dipakai di `t()` maupun `data-i18n`.
  - `js/app.js:1209` & `1250`: parameter `showToast` pada `exitFocusMode()` /
    `exitReaderMode()` diabaikan (`void showToast;`) — tinggal `exitFocusMode()`
    yang dipanggil tanpa argumen.
  - `js/app.js:1443`: `catch (err)` tidak memakai `err`.
  - `js/app.js:318`: dua pernyataan dalam satu baris
    (`dom.editor.hidden = true;if (dom.formatBar) …`).
  - `index.html:170`: `#empty-state` tidak punya atribut `hidden` → empty-state
    tampil sesaat sebelum JS init berjalan (flash).
  - `sw.js`: 14 aset, `icons/apple-touch-icon.png` belum termasuk (lihat BUG-13).
- **Saran:** hapus atau gunakan; tambahkan aturan linter (`no-unused-vars`) ke CI.

---

## Yang sudah diperiksa dan dinyatakan aman

- **Sanitasi/keamanan:** allowlist `p/h2/blockquote/strong/em` berjalan benar —
  `script`, handler `onclick`, `img onerror`, `style`, `svg`, `iframe` dibuang;
  node dibangun ulang dari model blok (tanpa `innerHTML` dari data pengguna);
  id dari berkas cadangan divalidasi; judul di-escape untuk teks & atribut.
- **Model dokumen:** `sanitize()` idempoten pada 15 bentuk HTML uji; jeda adegan,
  kutipan, subjudul, dan `gap` lolos round-trip; konten lama berformat `text`
  tetap tampil & diekspor apa adanya.
- **Penyimpanan:** kegagalan tulis (kuota) dilaporkan; `beforeunload` menahan tab;
  flush saat `pagehide`/`visibilitychange`; snapshot & undo restore bekerja.
- **Selection/Range:** konstanta `compareBoundaryPoints` (START_TO_END = 1,
  END_TO_START = 3) dipakai sesuai spesifikasi DOM — `_intersects`, `_subRange`,
  dan `_saveSel` sudah benar (bukan bug seperti yang sekilas terlihat).
- **Markup:** 67 `<div>` seimbang, tidak ada id ganda, semua `for` /
  `aria-labelledby` / `aria-controls` menunjuk ke elemen yang ada.
- **CSS:** semua variabel yang dipakai terdefinisi (atau punya fallback),
  tidak ada selektor untuk id yang tidak ada, `html.reader-mode #editor-wrap`
  memang menjadi wadah gulung yang dipakai `updateReaderHud()`.
- **Dependensi:** tidak ada dependensi runtime; `docx@8.5.0` & `html2pdf@0.10.1`
  dimuat lambat lewat CDN dengan timeout & cache gagal.

## Cara memeriksa ulang

```bash
npm install
npm test          # 62 kasus (51 lama + 11 regresi)
npx eslint js sw tools   # bersih (kecuali peringatan lintas-berkas)
```

Regresi yang ditambahkan untuk mengunci perbaikan:

| Bug | Tes |
|---|---|
| BUG-01 | `BUG-01: Alt+Panah di Mode Baca benar-benar memindah bab` |
| BUG-02 | `BUG-02: ganti bahasa tidak mencuri fokus dari modal Pengaturan` |
| BUG-03 | `BUG-03: Tab hanya dicegat bila indent bekerja (kursor tidak terjebak)` |
| BUG-04 | `BUG-04: hapus proyek aktif -> UI & penunjuk tersimpan sinkron` |
| BUG-05 | `BUG-05: bab aktif dihapus tab lain -> draf disimpan & bisa dipulihkan` |
| BUG-06 | `BUG-06: judul kosong -> pesan + aria-invalid (bukan diam saja)` |
| BUG-09 | `BUG-09: spasi/baris baru antar tag blok BUKAN jeda palsu` |
| BUG-11 | `BUG-11: RichText.domText menghitung kata tanpa parse ulang dokumen` |
| BUG-12 | `BUG-12: statistik kata mengikuti ketikan (tanpa menunggu auto-save)` |
| BUG-13 | `BUG-13: Service Worker mem-precache seluruh ikon yang dipakai HTML` |
| BUG-15 | hook `before()` di `test/consistency.test.js` menghasilkan ikon lebih dulu |
| BUG-16 | `BUG-16: cadangkan saat penyimpanan gagal -> berkas tetap dibuat + peringatan` |
