# Novel Writer

Aplikasi web minimalis untuk menulis novel — *distraction-free*, **offline-first (PWA)**, tanpa backend.
Seluruh data tersimpan di `localStorage` browser.

## Fitur

- Manajemen **proyek & bab** (buat, ganti nama, hapus)
- Urutkan bab dengan **drag & drop** (mouse), **tahan-lalu-geser** (layar sentuh),
  atau **Alt + ↑/↓** (keyboard)
- Editor **Markdown** dengan preview (`Ctrl+E`), bold/italic/heading per baris
- **Auto-save** (interval 0,5–5 detik, bisa diatur) + **flush otomatis saat tab ditutup**
- Statistik kata yang **mengabaikan sintaks Markdown**
- Ekspor **Markdown / PDF / DOCX** — per bab atau seluruh novel
- **Cadangkan & pulihkan** data: konfirmasi ber-ringkasan sebelum menimpa,
  snapshot otomatis, dan **undo restore** dari Pengaturan
- **Sinkronisasi antar-tab** (tab lain menulis → data diadopsi, ketikan lokal tidak dibuang)
- Tema gelap/terang, ukuran font & tinggi baris bisa diatur
- Bilingual: **Indonesia / English** (termasuk tooltip & label aksesibilitas)
- **Aman**: HTML mentah di-escape & tautan `javascript:` diblokir di semua jalur
  (preview **dan** ekspor PDF); id dari file backup divalidasi
- **Offline-ready** via Service Worker (navigasi network-first → update langsung terasa)
- **Test suite** 36 kasus (Node + jsdom) + CI

## Desain

Tema *editorial*: kertas hangat, tinta, dan aksen oxblood (merah pena penyunting).
Permukaan menulis memakai serif; ikon berupa SVG stroke — tanpa emoji.
Layout responsif: sidebar menjadi *off-canvas* di layar sempit.

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
| `Ctrl+B` / `Ctrl+I` | Bold / Italic (toggle; tanpa seleksi caret ditaruh di tengah) |
| `Ctrl+E` | Preview Markdown |
| `Tab` / `Shift+Tab` | Indent / un-indent **per baris** pada seluruh seleksi |
| `Alt+↑` / `Alt+↓` | Pindahkan bab (saat fokus di daftar bab) |
| `Enter` / `Spasi` | Buka proyek/bab (saat fokus di daftar) |
| `Esc` | Tutup modal → sidebar → preview (berurutan) |

## Struktur Proyek

```
index.html            Struktur UI (sidebar, editor, modal)
css/style.css         Tema editorial light/dark (CSS variables), layout, responsif
js/storage.js         Lapisan data (cache in-memory + localStorage, key: novel-writer-data)
js/i18n.js            Terjemahan ID/EN (teks, placeholder, title, aria-label)
js/icons.js           Ikon SVG stroke inline (tanpa emoji)
js/markdown.js        Render Markdown aman + hitung kata + teks polos
js/export.js          Modul ekspor (Markdown / PDF / DOCX)
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
npm install     # dependensi pengujian saja (jsdom, marked)
npm test        # 36 kasus: logika, perilaku UI, keamanan, konsistensi
```

Cakupan: CRUD & auto-save, regresi "Tab menghapus seleksi", flush saat unload,
kuota penuh, keamanan preview/restore, i18n, fokus modal, urutan bab (keyboard
& drag), sinkronisasi antar-tab, serta konsistensi markup↔kamus↔ikon↔SW↔manifest.

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

- [marked](https://marked.js.org/) — parsing Markdown
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) — ekspor PDF (lazy-load)
- [docx](https://docx.js.org/) — ekspor DOCX (lazy-load)

Dev-dependencies (hanya untuk pengujian): `jsdom`, `marked`.

## Catatan Rilis v1.1

- **Perbaikan kehilangan data**: Tab tidak lagi menimpa seleksi; isi editor di-flush
  saat tab ditutup/bersembunyi; kegagalan tulis (kuota) dilaporkan, bukan ditelan.
- **Keamanan**: ekspor PDF memakai jalur Markdown yang aman; `<style>` ekspor
  di-scope; id dari backup divalidasi + di-escape di semua interpolasi atribut.
- **UX**: empty-state kontekstual, undo restore, konfirmasi restore ber-ringkasan,
  i18n penuh (tooltip/aria/judul modal), fokus terperangkap di modal,
  urut bab untuk sentuh & keyboard, sinkronisasi antar-tab.
- **Arsitektur**: cache in-memory di Storage, Service Worker network-first untuk
  navigasi, ikon SVG ter-commit, test suite + CI + workflow Pages.
