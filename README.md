# Novel Writer

Aplikasi web minimalis untuk menulis novel — **editor teks berformat (WYSIWYG)**
sebagai pengganti Markdown: tebal, miring, subjudul, kutipan, dan jeda adegan
tanpa menulis sintaks apa pun. _Distraction-free_, **offline-first (PWA)**,
tanpa backend. Seluruh data tersimpan di `localStorage` browser.

## Fitur

- Manajemen **proyek & bab** (buat, ganti nama, hapus)
- Urutkan bab dengan **drag & drop** (mouse), **tahan-lalu-geser** (layar sentuh),
  atau **Alt + ↑/↓** (keyboard)
- **Editor teks berformat (WYSIWYG)** — pengganti Markdown: panel format
  (**Tebal**, **Miring**, **Subjudul**, **Kutipan**, **Jeda adegan**) menerapkan
  format sungguhan; tidak ada `**`, `#`, atau penanda apa pun yang diketik/disimpan.
  Tekan Enter untuk paragraf baru; baris kosong = jeda (mis. ganti adegan)
- **Mode Fokus** (`Ctrl+Shift+F` / `F9`) & **Mode Baca** (`Ctrl+Shift+R` / `F10`) —
  imersif penuh: fullscreen otomatis, semua chrome (sidebar, toolbar, panel
  format, HUD) lenyap total dan hanya muncul saat ada aktivitas; kursor pun
  disembunyikan saat idle. Fokus: mesin ketik (kursor di tengah), fokus
  paragraf (sekitar redup), penghitung kata sesi. Baca: halaman buku dengan
  judul bab, bilah progres, navigasi bab, estimasi sisa baca
- **Auto-save** (interval 0,5–5 detik, bisa diatur) + **flush otomatis saat tab ditutup**
- Statistik kata (tanda baca yang berdiri sendiri tidak dihitung)
- Ekspor **TXT / PDF / DOCX** — per bab atau seluruh novel (format tebal/miring/
  judul ikut terbawa ke PDF & DOCX; TXT dilumat jadi teks polos tanpa penanda)
- **Cadangkan & pulihkan** data: konfirmasi ber-ringkasan sebelum menimpa,
  snapshot otomatis, dan **undo restore** dari Pengaturan
- **Draf darurat**: bila bab yang sedang ditulis dihapus tab lain, ketikan
  disimpan sebagai draf dan bisa ditempelkan ke bab lain dari Pengaturan
- **Sinkronisasi antar-tab** (tab lain menulis → data diadopsi; ketikan lokal
  dipertahankan, atau diselamatkan jadi draf bila babnya ikut hilang)
- Tema gelap/terang, ukuran font & tinggi baris bisa diatur
- Bilingual: **Indonesia / English** (termasuk tooltip & label aksesibilitas)
- **Aman**: isi bab melewati sanitasi allowlist ketat — hanya `p/h2/blockquote/
  strong/em` yang hidup; script, handler acara, atribut berbahaya, dan tag asing
  dibuang. Node DOM selalu dibangun ulang (tanpa `innerHTML` dari data pengguna).
  Isi lama berupa teks polos tampil apa adanya (teks, bukan HTML); id dari file
  backup divalidasi
- **Offline-ready** via Service Worker (navigasi network-first → update langsung terasa)
- **Test suite** 66 kasus (Node + jsdom) + CI

## Desain

Tema _editorial_: kertas hangat, tinta, dan aksen oxblood (merah pena penyunting).
Permukaan menulis memakai serif; ikon berupa SVG stroke — tanpa emoji.
Layout responsif: sidebar menjadi _off-canvas_ di layar sempit.

### Model dokumen

Isi bab disimpan dalam satu bentuk kanonik (format `html`):

| Elemen | Arti |
|---|---|
| `<p>` | paragraf |
| `<p class="gap">` | paragraf setelah jeda (baris kosong sebelumnya) |
| `<p class="scene">* * *</p>` | jeda adegan |
| `<h2>` | subjudul bagian |
| `<blockquote>` | kutipan |
| `<strong>` / `<em>` | tebal / miring |

Isi lama (format `text`, tanpa properti format) tetap didukung penuh:
satu baris = satu paragraf, baris kosong = jeda — tampil dan diekspor apa adanya.

## Menjalankan

Aplikasi statis — cukup buka `index.html`, atau jalankan server lokal:

```bash
npm start            # python3 -m http.server 8000
# atau
python3 -m http.server 8000
# buka http://localhost:8000
```

> Service Worker & fitur install PWA membutuhkan server HTTP/HTTPS
> (tidak aktif via `file://`). Path relatif di `sw.js` & `manifest.json`
> membuat aplikasi aman juga saat di-deploy ke sub-path
> (mis. GitHub Pages: `https://user.github.io/Novel-Writer/`).

## Pintasan Keyboard

| Tombol | Fungsi |
|---|---|
| `Ctrl+S` | Simpan sekarang |
| `Ctrl+B` / `Ctrl+I` | Tebal / Miring pada seleksi |
| `Ctrl+Shift+F` / `F9` | Mode Fokus (toggle) |
| `Ctrl+Shift+R` / `F10` | Mode Baca (toggle) |
| `Alt+←` / `Alt+→` | Bab sebelum/sesudah (saat Mode Baca) |
| `Tab` / `Shift+Tab` | Indent / un-indent **per paragraf** pada seleksi |
| `Alt+↑` / `Alt+↓` | Pindahkan bab (saat fokus di daftar bab) |
| `Enter` / `Spasi` | Buka proyek/bab (saat fokus di daftar) |
| `Esc` | Tutup modal → keluar Mode Fokus/Baca → tutup sidebar (berurutan) |

## Struktur Proyek

```
index.html            Struktur UI (sidebar, panel format, editor, modal)
css/style.css         Tema editorial light/dark (CSS variables), layout, responsif
js/storage.js         Lapisan data (cache in-memory + localStorage, key: novel-writer-data)
js/i18n.js            Terjemahan ID/EN (teks, placeholder, title, aria-label)
js/icons.js           Ikon SVG stroke inline (tanpa emoji)
js/text.js            Utilitas teks polos (paragraf, hitung kata)
js/richtext.js        Model blok + sanitasi allowlist + operasi seleksi (WYSIWYG)
js/export.js          Modul ekspor (TXT / PDF / DOCX)
js/app.js             Inti aplikasi (state, render, CRUD, editor, DnD, PWA)
sw.js                 Service Worker (navigasi network-first, aset SWR)
manifest.json         Manifest PWA
icon.svg              Ikon vektor (di-commit; favicon + manifest)
icons/                Ikon PNG (192/512/180) — hasil generate, tidak di-commit
tools/generate-icons.js  Generator ikon PNG + SVG (tanpa dependensi)
test/                 Test suite (Node + jsdom)
.github/workflows/    CI (test) & deploy GitHub Pages
```

## Pengujian

```bash
npm install     # dependensi pengujian saja (jsdom)
npm test        # 66 kasus: logika, perilaku UI, keamanan, konsistensi
```

Cakupan: CRUD & auto-save, panel format WYSIWYG (tebal/miring/judul/kutipan/
jeda adegan, tanpa penyisipan penanda), regresi "Tab menghapus seleksi",
flush saat unload, kuota penuh, Mode Baca (isi berformat + isi lama polos),
sanitasi (script/handler tidak ikut hidup), keamanan restore, HUD imersif
(kata sesi, navigasi bab, progres baca, font baca, toggle persisten), ekspor
(TXT/DOCX menghormati format), i18n, fokus modal, urutan bab (keyboard & drag),
sinkronisasi antar-tab & draf darurat, konsistensi markup↔kamus↔ikon↔SW↔manifest,
serta jaminan **tanpa parser sintaks** di seluruh produk.

Riwayat audit bug & perbaikannya tercatat di [`BUGS.md`](BUGS.md).

## Regenerasi Ikon

```bash
npm run icons     # = node tools/generate-icons.js
```

> Folder `icons/` **tidak di-commit** (lihat `.gitignore`) — hasilnya di-generate.
> CI/Deploy menjalankannya otomatis sebelum publish. `icon.svg` (vektor)
> di-commit dan dipakai sebagai favicon serta ikon manifest.

## Deploy Otomatis (GitHub Pages)

Workflow `.github/workflows/deploy.yml` berjalan saat push ke `main`:
generate ikon → susun folder rilis → upload & deploy ke Pages.
Aktifkan sekali di repo: **Settings → Pages → Source: GitHub Actions**.

## Dependensi

Tidak ada dependensi runtime npm. Library eksternal dimuat via CDN saat dibutuhkan:

- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) — ekspor PDF (lazy-load)
- [docx](https://docx.js.org/) — ekspor DOCX (lazy-load)

Dev-dependency (hanya untuk pengujian): `jsdom`.

## Catatan Rilis v1.4.2

Rilis perbaikan blocker dari audit ulang (rincian di [`BUGS.md`](BUGS.md)):

- **Aplikasi kembali hidup** — `js/richtext.js` gagal di-parse (`SyntaxError:
  Identifier 'norm' has already been declared`, deklarasi ganda sisa salin-tempel),
  sehingga modul editor tidak pernah dimuat: isi bab tampil kosong, tombol tidak
  bereaksi, dan ketikan tidak tersimpan. Deklarasi berulang dihapus.
- **Draf darurat kembali bekerja** — `DRAFT_KEY` tertelan komentar sehingga
  `saveDraft()` selalu gagal senyap, padahal UI menjanjikan "tulisanmu disimpan
  sebagai draf". Konstanta dipisah ke barisnya sendiri.
- **Impor aman dari id kembar** — id proyek/bab yang sama di dalam berkas
  cadangan kini di-dedupe (akhiran `-2`, `-3`, …), jadi butir kedua tidak lagi
  tidak-bisa-dibuka.
- **Statistik dialog restore konsisten** — hitung kata memakai aturan yang sama
  dengan aplikasi (tag & entitas HTML tidak dihitung; tanda baca lepas juga tidak).
- **Draf tidak dibuang tanpa tujuan** — `restoreDraft()` memeriksa bab tujuan dan
  editor lebih dulu sebelum draf diambil (dulu draf hilang bila tidak ada tempat
  menempelnya).
- Tambahan 4 tes regresi (B-02 … B-05) dan pembersihan kode mati.

## Catatan Rilis v1.4.1

Rilis perbaikan hasil audit menyeluruh (20 temuan — rincian di `BUGS.md`):

- **Pintasan `Alt+←/→` di Mode Baca kembali hidup** — penanganannya terselip
  di luar handler `keydown` (dan memakai variabel tak terdefinisi), sehingga
  fitur ini sama sekali tidak pernah terpasang sejak dirilis.
- **Fokus tidak lagi dicuri editor** saat `renderAll()` berjalan (mis. ganti
  bahasa) sewaktu modal terbuka — focus trap tetap utuh.
- **`Tab` tidak lagi menjebak kursor**: hanya dicegat bila indent/un-indent
  benar-benar mengubah sesuatu; sisanya fokus bebas pindah (a11y).
- **Hapus proyek aktif** kini mengadopsi proyek berikutnya, jadi UI dan
  penunjuk tersimpan tidak lagi berbeda cerita.
- **Ketikan tidak hilang diam-diam** bila bab aktif dihapus di tab lain:
  disimpan sebagai draf darurat + peringatan, dan bisa dipulihkan dari
  Pengaturan.
- **Form judul** memberi pesan & penanda `aria-invalid` saat dikosongkan
  (dulu tombol "Buat"/"Simpan" diam saja).
- **Impor/tempel bersih**: spasi & baris baru antar tag blok tidak lagi
  menghasilkan jeda (`class="gap"`) palsu.
- **Statistik kata** langsung mengikuti ketikan; Mode Fokus tidak lagi
  mem-parse ulang seluruh bab pada setiap tombol yang ditekan.
- Lain-lain: gulung latar terkunci saat modal terbuka, ikon iOS ikut
  di-precache Service Worker, peringatan bila ekspor/cadangan menyertakan
  isi yang gagal ditulis, kontainer PDF tidak lagi berkedip di layar,
  pembersihan kode mati, serta tes uji yang tidak lagi bergantung urutan.

## Catatan Rilis v1.4

- **Mode Fokus & Mode Baca imersif penuh** — fullscreen otomatis saat masuk
  (bisa dimatikan per mode di Pengaturan), seluruh chrome lenyap: sidebar,
  toolbar (muncul saat tepi atas disentuh), panel format (hanya saat ada
  seleksi), HUD mengambang (sembunyi setelah 2,6 dtk idle), bahkan kursor.
  Petunjuk toast hanya sekali per sesi; keluar selalu hening.
- **Mode Fokus**: efek mesin ketik (paragraf aktif dijaga di tengah layar),
  fokus paragraf (paragraf lain diredupkan), HUD kata (total + perolehan sesi)
  dan titik status simpan — semua toggle tersimpan dan bisa diubah dari HUD
  maupun Pengaturan.
- **Mode Baca**: judul bab kini tampil sebagai kepala halaman (huruf awal
  bab bergaya cetakan), bilah progres 3px, HUD baca berisi navigasi
  bab sebelum/sesudah (juga `Alt+←/→`), posisi (`Bab X dari N • % • sisa
  baca`), dan pengatur ukuran huruf khusus baca yang persisten.
- **Perbaikan**: judul bab yang hilang di Mode Baca dikembalikan; ekspor TXT
  seluruh novel kini mencantumkan judul tiap bab (dua-duanya sebelumnya gagal
  di test suite).

## Catatan Rilis v1.3

- **Editor teks berformat (WYSIWYG) menggantikan penyunting teks polos** —
  panel format: **Tebal** (`Ctrl+B`), **Miring** (`Ctrl+I`), **Subjudul**,
  **Kutipan**, dan **Jeda adegan** (`* * *`). Semua operasi bekerja pada model
  DOM; tidak ada karakter penanda yang perlu diketik, dan tidak ada mode
  pratinjau terpisah — yang ditulis, itulah tampilannya.
- **Model dokumen kanonik** (`js/richtext.js`): blok `p / h2 / blockquote`
  dengan penanda inline `strong / em`. Semua masukan (ketikan browser, tempel,
  backup) dinormalisasi lewat **sanitasi allowlist ketat** — script, handler
  acara, atribut, dan tag asing dibuang; node dibangun ulang tanpa `innerHTML`.
- **Mode Baca & ekspor** mengikuti format: PDF/DOCX membawa tebal/miring/judul/
  kutipan/jeda adegan; TXT dilumat jadi teks polos tanpa penanda. Bab lama
  berformat teks polos tetap tampil & diekspor persis seperti diketik.
- **Tab / Shift+Tab** kini meng-indent per paragraf (dulu per baris) —
  jaminan tidak menimpa seleksi dipertahankan.
- Model lama "satu baris = satu paragraf, baris kosong = jeda" tetap hidup:
  Enter = paragraf baru, paragraf kosong = jeda, tombol Jeda adegan = `* * *`
  terpusat.

## Catatan Rilis v1.2

- **Markdown dihapus total** — editor sempat menjadi teks polos standar. Tidak
  ada lagi library `marked` maupun mode pratinjau (`Ctrl+E`).
  Isi lama yang mengandung sintaks (`**`, `#`) tetap aman: tampil apa adanya.
- **Mode Baca** merender teks polos: judul bab + paragraf (satu baris = satu
  paragraf, baris kosong = jeda).
- **Ekspor**: opsi Markdown diganti **TXT**; PDF & DOCX memakai model paragraf
  yang sama (bab baru = halaman baru).
- **Perbaikan**: markup modal Pengaturan yang rusak dirapikan, slider ukuran
  font / tinggi baris / auto-save dikembalikan, ikon `sliders` & `undo` yang
  hilang ditambahkan, Service Worker kini mem-precache semua skrip aplikasi.

## Catatan Rilis v1.1

- **Perbaikan kehilangan data**: Tab tidak lagi menimpa seleksi; isi editor di-flush
  saat tab ditutup/bersembunyi; kegagalan tulis (kuota) dilaporkan, bukan ditelan.
- **Keamanan**: ekspor PDF memakai jalur render yang aman; `<style>` ekspor
  di-scope; id dari backup divalidasi + di-escape di semua interpolasi atribut.
- **UX**: empty-state kontekstual, undo restore, konfirmasi restore ber-ringkasan,
  i18n penuh (tooltip/aria/judul modal), fokus terperangkap di modal,
  urut bab untuk sentuh & keyboard, sinkronisasi antar-tab.
- **Arsitektur**: cache in-memory di Storage, Service Worker network-first untuk
  navigasi, ikon SVG ter-commit, test suite + CI + workflow Pages.
