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
- **Mode Fokus** (`Ctrl+Shift+F`) & **Mode Baca** (`Ctrl+Shift+R`) — keduanya kini
  **imersif penuh**: layar penuh browser, semua chrome hilang, hanya tulisan yang
  tersisa (lihat [Mode Imersif](#mode-imersif--layar-penuh-tanpa-gangguan))
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
- **Test suite** 60 kasus (Node + jsdom) + CI

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

## Mode Imersif — Layar Penuh Tanpa Gangguan

Mode Fokus dan Mode Baca berbagi satu mesin imersif: begitu aktif, **yang tersisa
di layar hanyalah tulisan**.

| Yang hilang | Cara kerjanya |
|---|---|
| Sidebar, toolbar, panel format, statistik, indikator simpan | `display: none` (bukan digeser) — tidak menyisakan ruang layout |
| Chrome browser (tab, address bar, bookmark) | Fullscreen API diminta saat masuk mode; bisa dimatikan di Pengaturan |
| Scrollbar | Disembunyikan (`scrollbar-width: none`) — menggulir tetap normal |
| Kursor mouse | Menghilang setelah ~2,4 detik tanpa gerak, kembali begitu pointer bergerak |

**HUD melayang** adalah satu-satunya kontrol. Ia muncul saat pointer menyentuh
tepi atas layar (atau saat dinavigasi dengan `Tab`), lalu memudar sendiri setelah
±2 detik. Saat pudar, HUD tidak menangkap klik (`pointer-events: none`), jadi
tidak pernah menghalangi teks.

Isi HUD menyesuaikan mode:

- **Mode Fokus** — `‹ bab` · *jumlah kata (langsung saat mengetik)* · `bab ›` ·
  tema · pindah ke Mode Baca · keluar
- **Mode Baca** — `‹ bab` · *judul bab · progres %* · `bab ›` · ukuran huruf
  (`A−` / `A+`) · tema · kembali menulis · keluar, plus **rambut progres** 2px di
  dasar layar

Perilaku Mode Baca:

- Bab dirender sebagai **halaman buku**: judul bab di tengah dengan garis rambut,
  paragraf rata kanan-kiri, teks memudar di tepi atas/bawah
- **Pindah bab tanpa keluar mode** (tombol HUD atau `←` / `→`), termasuk saat
  layar penuh — tidak ada kedipan karena sesi layar penuh dipertahankan
- **Balik halaman** dengan `Space` / `PageDown` / `PageUp` / `↑` `↓` / `Home` / `End`
- **Posisi baca diingat** per bab (rasio, tahan ubah ukuran layar) — kembali ke
  bab itu melanjutkan dari tempat terakhir
- Ukuran huruf diubah dari HUD memakai rentang pengaturan yang sama (14–28px)

Perilaku Mode Fokus:

- Kolom tulis dipusatkan dengan padding longgar (atas `clamp(30px, 9vh, 104px)`,
  bawah ≥ 30vh) sehingga tidak ada "dinding" di akhir bab
- Opsional **typewriter scrolling** (Pengaturan → *Kursor dijaga di tengah*):
  baris yang sedang ditulis otomatis digulir ke ±45% tinggi layar
- Format tetap bisa dipakai lewat `Ctrl+B` / `Ctrl+I` walau panel format tersembunyi

Pengaturan (Pengaturan → **Mode Imersif**):

- **Layar penuh otomatis** — minta Fullscreen API saat masuk mode (bawaan: aktif).
  Bila browser menolak (mis. iframe tanpa izin), aplikasi memberitahu sekali dan
  mode tetap berjalan penuh lewat CSS.
- **Kursor dijaga di tengah** — typewriter scrolling untuk Mode Fokus (bawaan: mati).

Keluar dari mode imersif: `Esc`, tombol keluar di HUD, atau pintasan mode yang
sama (`Ctrl+Shift+F` / `Ctrl+Shift+R`). Menutup layar penuh dari browser
(Esc native / tombol OS) juga mengeluarkan mode secara otomatis.

## Pintasan Keyboard

| Tombol | Fungsi |
|---|---|
| `Ctrl+S` | Simpan sekarang |
| `Ctrl+B` / `Ctrl+I` | Tebal / Miring pada seleksi |
| `Ctrl+Shift+F` / `F9` | Mode Fokus (toggle, layar penuh) |
| `Ctrl+Shift+R` / `F10` | Mode Baca (toggle, layar penuh) |
| `←` / `→` | Mode Baca: bab sebelumnya / berikutnya |
| `Space` / `PageDown` / `PageUp` | Mode Baca: balik halaman |
| `Home` / `End` | Mode Baca: awal / akhir bab |
| `Tab` | Mode imersif: panggil HUD (lalu panah = pindah tombol HUD) |
| `Tab` / `Shift+Tab` | Indent / un-indent **per paragraf** pada seleksi (di editor) |
| `Alt+↑` / `Alt+↓` | Pindahkan bab (saat fokus di daftar bab) |
| `Enter` / `Spasi` | Buka proyek/bab (saat fokus di daftar) |
| `Esc` | Tutup modal → keluar Mode Fokus/Baca (+ layar penuh) → tutup sidebar |

## Struktur Proyek

```
index.html            Struktur UI (sidebar, panel format, editor, HUD imersif, modal)
css/style.css         Tema editorial light/dark (CSS variables), layout, responsif,
                      mode imersif (Fokus/Baca layar penuh + HUD)
js/storage.js         Lapisan data (cache in-memory + localStorage, key: novel-writer-data)
js/i18n.js            Terjemahan ID/EN (teks, placeholder, title, aria-label)
js/icons.js           Ikon SVG stroke inline (tanpa emoji)
js/text.js            Utilitas teks polos (paragraf, hitung kata)
js/richtext.js        Model blok + sanitasi allowlist + operasi seleksi (WYSIWYG)
js/export.js          Modul ekspor (TXT / PDF / DOCX)
js/app.js             Inti aplikasi (state, render, CRUD, editor, DnD, mode imersif, PWA)
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
npm test        # 60 kasus: logika, perilaku UI, keamanan, konsistensi
```

Cakupan: CRUD & auto-save, panel format WYSIWYG (tebal/miring/judul/kutipan/
jeda adegan, tanpa penyisipan penanda), regresi "Tab menghapus seleksi",
flush saat unload, kuota penuh, Mode Baca (isi berformat + isi lama polos),
sanitasi (script/handler tidak ikut hidup), keamanan restore, ekspor
(TXT/DOCX menghormati format), i18n, fokus modal, urutan bab (keyboard & drag),
sinkronisasi antar-tab, **mode imersif** (chrome hilang, HUD & hitungan kata,
permintaan/pelepasan layar penuh, layar penuh yang ditutup browser, pudar HUD +
kursor menganggur, navigasi & progres Mode Baca, ukuran huruf dari HUD,
pengaturan tersimpan), konsistensi markup↔kamus↔ikon↔SW↔manifest, serta
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

## Catatan Rilis v1.4

- **Mode Fokus & Mode Baca jadi benar-benar imersif**: layar penuh browser
  (Fullscreen API, bisa dimatikan), seluruh chrome dihapus dari layout
  (sidebar, toolbar, panel format, statistik, indikator simpan, scrollbar),
  dan satu **HUD melayang** yang muncul saat diminta lalu memudar sendiri.
- **Mode Baca**: judul bab kini dirender sebagai judul halaman (regresi v1.3
  diperbaiki), pindah bab tanpa keluar mode (HUD / `←` `→`), balik halaman
  (`Space` / `PgUp` / `PgDn`), rambut progres baca, posisi baca terakhir diingat
  per bab, dan ukuran huruf bisa diubah dari HUD.
- **Mode Fokus**: kolom tulis lebih longgar, kursor mouse disembunyikan saat
  menganggur, dan opsi **typewriter scrolling** (baris aktif dijaga di tengah).
- Pindah Mode Fokus ↔ Mode Baca mempertahankan satu sesi layar penuh (tanpa kedipan);
  menutup layar penuh dari browser ikut mengeluarkan mode.
- **Perbaikan data**: isi editor yang "basi" tidak lagi mungkin dituliskan ke bab
  lain — `saveCurrentChapter()` menolak menulis saat editor tersembunyi (Mode
  Baca), dan keluar dari Mode Baca selalu memuat ulang bab dari storage.
- **Perbaikan**: judul bab hilang di Mode Baca & ekspor `.txt` (regresi v1.3),
  CSS Mode Fokus lama yang menunjuk variabel tak ada (`--surface-2`), blok
  `.reader-nav` mati yang tak pernah dipakai, dan pemantau `mousemove` yang
  terpasang di luar `bindEvents()`.

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
