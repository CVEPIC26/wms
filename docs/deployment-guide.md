# Panduan Deployment WMS - CV Edukasi Pratama Insan Cemerlang

Panduan men-deploy backend Google Apps Script dan menghubungkan frontend.
Deployment dilakukan oleh pemilik akun Google (memerlukan akses ke
project Apps Script) — tidak dapat dilakukan dari repository.

## 1. Struktur Sheet Database yang Dibutuhkan

Buat 9 sheet berikut di satu Google Spreadsheet dengan header persis
(baris pertama) seperti di bawah. Urutan kolom harus sama.

### MASTER_SKU
```
sku | nama_produk | status_aktif
```

### USERS
```
email | nama | peran | status_aktif
```

### RECEIVING
```
receiving_id | tanggal | supplier | nomor_po | user_email | status | created_at
```

### RECEIVING_DETAIL
```
receiving_id | sku | nama_produk | qty_diterima | qty_reject | qty_diterima_qc | alasan_reject | catatan
```

### STOCK
```
sku | nama_produk | qty_stock | updated_at
```

### STOCK_MOVEMENT
```
movement_id | tanggal | sku | tipe_transaksi | qty | source | source_id | keterangan | user_email | created_at
```

### STOCK_OPNAME
```
opname_id | tanggal | lokasi | user_email | status | created_at
```

### STOCK_OPNAME_DETAIL
```
opname_id | sku | system_qty | physical_qty | difference_qty | notes
```

### STOCK_ADJUSTMENT
```
adjustment_id | tanggal | sku | nama_produk | qty_adjustment | alasan | user_email | status | verified_by | created_at | verified_at
```

> Catatan: `PENYIAPAN` adalah sheet eksternal terpisah (bukan bagian
> database WMS) — lihat kontrak kolom di `CONFIG.PENYIAPAN` pada
> `api/Config.gs` dan sesuaikan dengan sheet sumber aktual.

## 2. Deploy Backend Apps Script

1. Buka https://script.google.com → project WMS.
2. Salin seluruh isi file `api/*.gs` dari repository ke editor Apps
   Script (13 file): `Code.gs`, `Config.gs`, `Response.gs`,
   `Validation.gs`, `MasterSkuService.gs`, `UserService.gs`,
   `ReceivingService.gs`, `StockService.gs`, `MovementService.gs`,
   `PreparationService.gs`, `OpnameService.gs`, `AdjustmentService.gs`,
   `DashboardService.gs`.
3. Isi `CONFIG.SPREADSHEET_ID` di `Config.gs` dengan ID spreadsheet
   database (dari URL spreadsheet), atau biarkan kosong jika script
   terikat ke spreadsheet.
4. (Opsional) Isi `CONFIG.PENYIAPAN.SPREADSHEET_ID` jika sheet
   PENYIAPAN berada di file terpisah, dan sesuaikan
   `CONFIG.PENYIAPAN.HEADERS` dengan header aktual.
5. Deploy → Manage deployments → pilih deployment → **Version: New
   version** → Deploy. URL `/exec` tidak berubah.

## 3. Verifikasi Deployment

Setelah New version aktif, verifikasi struktur database dan endpoint:

```
GET {URL}/exec?action=health_check
```

- Jika `valid: true` → seluruh 9 sheet dan header sesuai.
- Jika `valid: false` → daftar `problems` menunjukkan sheet/header yang
  perlu diperbaiki.

Verifikasi user:

```
GET {URL}/exec?action=user_me&user_email=<email-user-di-USERS>
```

## 4. Konfigurasi Frontend

Isi dua nilai di `frontend/js/config.js`:

```js
API_BASE_URL: '<URL /exec dari langkah 2>',
USER_EMAIL: '<email user aktif yang terdaftar di sheet USERS>'
```

Hanya dua nilai ini yang perlu diubah — tidak ada konfigurasi lain.

## 5. Menjalankan Frontend

Frontend statis (HTML/CSS/JS). Jalankan via server statis atau hosting
(GitHub Pages):

```bash
cd frontend
python3 -m http.server 8000
# buka http://localhost:8000
```

## 6. Endpoint yang Terhubung (27 action)

GET: `master_sku`, `users`, `user_me`, `health_check`, `stock_get`,
`stock_list`, `stock_card`, `preparation_list`, `receiving_list`,
`receiving_get`, `opname_list`, `opname_get`, `opname_sku`,
`adjustment_list`, `adjustment_get`, `dashboard_summary`

POST: `receiving_create`, `receiving_submit`, `receiving_verify`,
`stockout_process`, `stockout_batch`, `opname_create`,
`opname_add_detail`, `opname_submit`, `opname_verify`,
`adjustment_create`, `adjustment_submit`, `adjustment_verify`
