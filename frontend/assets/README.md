# Aset Logo WMS

Letakkan logo resmi perusahaan di folder ini.

## Cara mengganti logo

1. Ganti file `logo.svg` dengan file logo resmi Anda, ATAU tambahkan `logo.png`
   lalu ubah referensi `assets/logo.svg` → `assets/logo.png` pada `index.html`.
2. Semua `<img>` memakai `object-fit: contain` agar logo tidak stretching.
3. Pastikan logo transparan atau memiliki latar yang sesuai.

## File yang direferensikan
| File | Pemakaian |
|------|-----------|
| `logo.svg` | Splash screen, sidebar desktop, topbar/header mobile |
| `favicon.svg` | Ikon browser (tab) |

## Catatan

- `logo.svg` adalah placeholder SVG sederhana berwarna brand (merah-oranye).
  Bisa langsung diganti dengan file PNG/JPG/WebP milik Anda.
- Semua `<img>` memakai `object-fit: contain` agar logo tidak stretching.
- Tidak ada logo yang dibuat baru di luar placeholder — logo resmi akan di-upload oleh pemilik.