# WMS - CV Edukasi Pratama Insan Cemerlang

Warehouse Management System (WMS) untuk CV Edukasi Pratama Insan Cemerlang.

## Tujuan Project

Membangun sistem manajemen gudang berbasis web untuk mengelola alur barang:

```
SUPPLIER → RECEIVING + QC → PERSEDIAAN → STOCK KELUAR / PEMESANAN → LOADING / PENYIAPAN → OUTLET
PERSEDIAAN → STOCK OPNAME
```

Detail proses bisnis: [docs/business-process.md](docs/business-process.md)
Rancangan struktur data: [docs/database.md](docs/database.md)

## Status Tahap Ini

Tahap pertama hanya menyiapkan **struktur project dan dokumentasi**:

- Frontend Web App sederhana (HTML + CSS + Vanilla JavaScript) berisi kerangka
  halaman dan navigasi antar modul (Dashboard, Receiving + QC, Persediaan,
  Stock Keluar, Stock Opname).
- Placeholder folder `api/` untuk backend di tahap berikutnya.
- Dokumentasi business process dan rancangan database.

**Belum diimplementasikan** (sesuai rencana bertahap):

- Koneksi API / Google Spreadsheet.
- Fitur scan/input SKU, pencatatan qty, dan perhitungan stock.
- Verifikasi email user untuk Receiving/QC dan Stock Opname.
- Database SQL.

## Struktur Folder

```
frontend/
  index.html        # Halaman utama Web App
  css/style.css     # Styling
  js/app.js         # Navigasi antar modul (vanilla JS)

api/
  README.md         # Rencana backend/API tahap berikutnya

docs/
  business-process.md  # Dokumentasi alur proses bisnis
  database.md          # Rancangan struktur data
```

## Teknologi

- HTML, CSS, Vanilla JavaScript (tanpa framework frontend seperti React/Vue/Next.js).
- Backend/API dan integrasi Google Spreadsheet direncanakan pada tahap berikutnya.

## Menjalankan Frontend

Buka langsung `frontend/index.html` di browser, atau jalankan server statis:

```bash
cd frontend
python3 -m http.server 8000
# lalu buka http://localhost:8000
```
