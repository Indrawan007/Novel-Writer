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
- **Mode Fokus** (`Ctrl+Shift+F`) & **Mode Baca** (`Ctrl+Shift+R`) — bab tampil
  seperti halaman buku, format ikut tampil utuh
- **Auto-save** (interval 0,5–5 detik, bisa diatur) + **flush otomatis saat tab ditutup**
- Statistik kata (tanda baca yang berdiri sendiri tidak dihitung)
- Ekspor **TXT / PDF / DOCX** — per bab atau seluruh novel (format tebal/miring/
  judul ikut terbawa ke PDF & DOCX; TXT dilumat jadi teks polos tanpa penanda)
- **Cadangkan & pulihkan** data: konfirmasi ber-ringkasan sebelum menimpa,
  snapshot otomatis, dan **undo restore** dari Pengaturan
- **Sinkronisasi antar-tab** (tab lain menulis → data diadopsi, ketikan lokal tidak dibuang)
- Tema gelap/terang, ukuran font & tinggi baris bisa diatur
- Bilingual: **Indonesia / English** (termasuk tooltip & label aksesibilitas)
- **Aman**: isi bab melewati sanitasi allowlist ketat — hanya `p/h2/blockquote/
  strong/em` yang hidup; script, handler acara, atribut berbahaya, dan tag asing
  dibuang. Node DOM selalu dibangun ulang (tanpa `innerHTML` dari data pengguna).
  Isi lama berupa teks polos tampil apa adanya (teks, bukan HTML); id dari file
  backup divalidasi
- **Offline-ready** via Service Worker (navigasi network-first → update langsung terasa)
- **Test suite** 48 kasus (Node + jsdom) + CI

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
npm test        # 48 kasus: logika, perilaku UI, keamanan, konsistensi
```

Cakupan: CRUD & auto-save, panel format WYSIWYG (tebal/miring/judul/kutipan/
jeda adegan, tanpa penyisipan penanda), regresi "Tab menghapus seleksi",
flush saat unload, kuota penuh, Mode Baca (isi berformat + isi lama polos),
sanitasi (script/handler tidak ikut hidup), keamanan restore, ekspor
(TXT/DOCX menghormati format), i18n, fokus modal, urutan bab (keyboard & drag),
sinkronisasi antar-tab, konsistensi markup↔kamus↔ikon↔SW↔manifest, serta
jaminan **tanpa parser sintaks** di seluruh produk.

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
