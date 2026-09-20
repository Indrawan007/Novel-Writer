# Novel Writer

Aplikasi web minimalis untuk menulis novel — *distraction-free*, **offline-first (PWA)**, tanpa backend.
Seluruh data tersimpan di `localStorage` browser.

## Fitur

- Manajemen **proyek & bab** (buat, ganti nama, hapus)
- Urutkan bab dengan **drag & drop** (sisipkan di posisi mana pun)
- Editor **Markdown** dengan preview (`Ctrl+E`), bold/italic/heading
- **Auto-save** (interval 0,5–5 detik, bisa diatur)
- Ekspor **Markdown / PDF / DOCX** — per bab atau seluruh novel
- **Cadangkan & pulihkan** data (file JSON, tervalidasi saat pulihkan)
- Tema gelap/terang, ukuran font & tinggi baris bisa diatur
- Bilingual: **Indonesia / English**
- **Aman**: HTML mentah dalam Markdown di-escape & tautan `javascript:` diblokir
- **Offline-ready** via Service Worker

## Desain

Tema *editorial*: kertas hangat, tinta, dan aksen oxblood (merah pena penyunting).
Permukaan menulis memakai serif; ikon berupa SVG stroke — tanpa emoji.
Layout responsif: sidebar menjadi *off-canvas* di layar sempit.

## Menjalankan

Aplikasi statis — cukup buka `index.html`, atau jalankan server lokal:

```bash
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
| `Ctrl+S` | Simpan |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+E` | Preview Markdown |
| `Esc` | Tutup modal |
| `Tab` / `Shift+Tab` | Indent / un-indent |

## Struktur Proyek

```
index.html            Struktur UI (sidebar, editor, modal)
css/style.css         Tema editorial light/dark (CSS variables), layout, responsif
js/storage.js         Lapisan data (localStorage, key: novel-writer-data)
js/i18n.js            Terjemahan ID/EN (bahasa disimpan di settings.lang)
js/icons.js           Ikon SVG stroke inline (tanpa emoji)
js/markdown.js        Render Markdown aman (escape HTML + sanitasi tautan)
js/export.js          Modul ekspor (Markdown / PDF / DOCX)
js/app.js             Inti aplikasi (state, render, CRUD, editor, PWA)
sw.js                 Service Worker (cache offline)
manifest.json         Manifest PWA
icons/                Ikon PNG (192/512/180) — hasil generate, tidak di-commit
tools/generate-icons.js  Generator ikon (tanpa dependensi)
```

## Regenerasi Ikon

```bash
node tools/generate-icons.js
```

> Folder `icons/` **tidak di-commit** (lihat `.gitignore`) — hasilnya di-generate.
> **Wajib jalankan perintah di atas sebelum deploy** agar ikon PWA tersedia
> dan aplikasi bisa ter-install. Service Worker tetap terpasang walau ikon
> hilang (aset di-cache satu per satu), tapi fitur install PWA butuh ikon.

## Dependensi

Tidak ada dependensi npm. Library eksternal dimuat via CDN saat dibutuhkan:

- [marked](https://marked.js.org/) — parsing Markdown
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) — ekspor PDF (lazy-load)
- [docx](https://docx.js.org/) — ekspor DOCX (lazy-load)
