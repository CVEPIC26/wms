# API (Rencana)

Folder ini disiapkan untuk backend/API WMS pada tahap berikutnya.

## Rencana

- Backend API akan menjadi jembatan antara Web App (frontend) dan Google Spreadsheet sebagai sumber data awal.
- Koneksi ke Google Spreadsheet **belum diimplementasikan** pada tahap ini.

## Kebutuhan API di masa depan

1. **Receiving + QC**
   - Mencatat hasil scan/input SKU, qty receiving, qty reject, dan qty lolos QC (stock in).
   - Membutuhkan verifikasi email user sebelum transaksi tersimpan.

2. **Stock Keluar / Pemesanan**
   - Membaca data penyiapan dari Google Spreadsheet (penyiapan tidak diinput via Web App).
   - Mengurangi stock berdasarkan transaksi stock keluar/accrual.
   - Loading/penyiapan tidak mengurangi stock lagi.

3. **Persediaan**
   - Menyediakan data stock terkini (stock in dikurangi stock keluar).

4. **Stock Opname**
   - Mencatat hasil opname via scan/input SKU.
   - Membutuhkan verifikasi email user.
