# Backend API - Google Apps Script

Backend WMS berbasis **Google Apps Script Web App** dengan Google
Spreadsheet sebagai database (8 sheet sesuai
[../docs/database.md](../docs/database.md) dan
[../docs/google-sheets-setup.md](../docs/google-sheets-setup.md)).

**Scope tahap saat ini:** RECEIVING + QC + STOCK IN (selesai), modul
STOCK / STOCK_OPNAME / STOCK_ADJUSTMENT / Dashboard, plus **reader
read-only sheet PENYIAPAN eksternal** (`GET ?action=penyiapan`, tahap
integrasi - belum memproses STOCK_OUT dari source tersebut).

## Struktur File

| File | Peran |
|------|-------|
| `Code.gs` | Entry point `doGet`/`doPost`, routing via parameter `?action=` |
| `Config.gs` | Nama sheet, header kolom, konstanta status — persis sesuai struktur spreadsheet |
| `Response.gs` | Response JSON konsisten (`success`/`error_code`) |
| `Validation.gs` | Validasi input request |
| `MasterSkuService.gs` | Membaca MASTER_SKU, validasi SKU aktif |
| `UserService.gs` | Membaca USERS, verifikasi email pelaksana |
| `ReceivingService.gs` | Logika RECEIVING + QC, finalisasi, STOCK_IN |
| `StockService.gs` | Update saldo STOCK (hanya oleh sistem) |
| `MovementService.gs` | Append STOCK_MOVEMENT + cek idempotency |
| `PreparationService.gs` | Integrasi PENYIAPAN → STOCK_OUT (tahap integrasi) |
| `PenyiapanService.gs` | **READ-ONLY** pembaca sheet PENYIAPAN eksternal |

> Seluruh file ditempatkan dalam satu project Apps Script; semua
> fungsi/global berbagi scope yang sama (perilaku standar Apps Script).

## Endpoint

Semua endpoint memakai satu URL Web App dengan parameter `action`
(tanpa path routing kompleks).

| Method | Action | Fungsi |
|--------|--------|--------|
| GET | `master_sku` | Membaca seluruh MASTER_SKU |
| GET | `users` | Membaca seluruh USERS |
| GET | `penyiapan` | **READ-ONLY** baca spreadsheet eksternal PENYIAPAN (tahap integrasi) |
| POST | `receiving_create` | Membuat RECEIVING (DRAFT) + RECEIVING_DETAIL |
| POST | `receiving_submit` | DRAFT → MENUNGGU_VERIFIKASI |
| POST | `receiving_verify` | MENUNGGU_VERIFIKASI → TERVERIFIKASI + STOCK_IN |

## Contoh Request

### GET master SKU
```
GET {WEB_APP_URL}?action=master_sku
```

### GET penyiapan (READ-ONLY, spreadsheet eksternal PENYIAPAN)
```
GET {WEB_APP_URL}?action=penyiapan
```
Membaca sheet `PENYIAPAN` dari spreadsheet eksternal yang ditunjuk
`CONFIG.EXTERNAL_SPREADSHEET_ID`. **Hanya baca** - tidak mengubah STOCK,
STOCK_MOVEMENT, maupun spreadsheet PENYIAPAN itu sendiri. `tipe_modul`
tidak di-map ke SKU pada tahap ini.

### POST receiving_create
```
POST {WEB_APP_URL}?action=receiving_create
Content-Type: application/json

{
  "tanggal": "2026-08-19",
  "supplier": "<NAMA SUPPLIER>",
  "nomor_po": "<NOMOR PO>",
  "user_email": "<email-user@domain.id>",
  "items": [
    {
      "sku": "<SKU-PRODUK>",
      "qty_diterima": 100,
      "qty_reject": 3,
      "alasan_reject": "robek",
      "catatan": "<CATATAN OPSIONAL>"
    }
  ]
}
```
`nama_produk` di RECEIVING_DETAIL diambil dari MASTER_SKU, bukan dari
client. `qty_diterima_qc` dihitung server: `qty_diterima - qty_reject`.

### POST receiving_submit
```
POST {WEB_APP_URL}?action=receiving_submit
Content-Type: application/json

{
  "receiving_id": "RCV-20260819-001",
  "user_email": "<email-user@domain.id>"
}
```
Mengubah status `DRAFT → MENUNGGU_VERIFIKASI`. Tidak menyentuh
STOCK maupun STOCK_MOVEMENT.

### POST receiving_verify
```
POST {WEB_APP_URL}?action=receiving_verify
Content-Type: application/json

{
  "receiving_id": "RCV-20260819-001",
  "user_email": "<email-user@domain.id>"
}
```
Mengubah status `MENUNGGU_VERIFIKASI → TERVERIFIKASI` lalu memproses
STOCK_IN. Hanya proses ini yang menghasilkan STOCK_IN.

## Contoh Response

### Sukses
```json
{
  "success": true,
  "message": "Receiving terverifikasi, STOCK_IN diproses",
  "data": {
    "receiving_id": "RCV-20260819-001",
    "status": "TERVERIFIKASI",
    "diverifikasi_oleh": "<email-user@domain.id>",
    "movement_dibuat": 1,
    "movement_dilewati": 0
  }
}
```

### Error
```json
{
  "success": false,
  "message": "SKU tidak ditemukan di MASTER_SKU: <SKU>",
  "error_code": "SKU_NOT_FOUND"
}
```

> Apps Script Web App tidak mendukung custom HTTP status code; status
> keberhasilan disampaikan lewat field `success` dan `error_code`.

## Validasi yang Diterapkan

- `user_email` wajib ada di `USERS` dan `status_aktif = YA`
  (verifikasi email sederhana — tanpa login/password).
- `sku` wajib ada di `MASTER_SKU` dan `status_aktif = YA`.
- `qty_diterima` dan `qty_reject` wajib integer ≥ 0.
- `qty_reject` tidak boleh lebih besar dari `qty_diterima`.
- `qty_diterima_qc = qty_diterima - qty_reject` (dihitung server).
- `alasan_reject` wajib jika `qty_reject > 0`.
- `nama_produk` detail selalu dari MASTER_SKU.
- `receiving_submit` hanya menerima status `DRAFT`; menolak receiving
  tanpa detail / ID tidak dikenal.
- `receiving_verify` hanya menerima status `MENUNGGU_VERIFIKASI`;
  receiving `TERVERIFIKASI` mengembalikan sukses idempotent.
- `receiving_create` memvalidasi seluruh input sebelum menulis; satu
  detail invalid → tidak ada baris yang ditulis sama sekali.

## Status Receiving

```
DRAFT → MENUNGGU_VERIFIKASI → TERVERIFIKASI
```

Transisi yang valid:
- `DRAFT → MENUNGGU_VERIFIKASI` hanya via `receiving_submit`.
- `MENUNGGU_VERIFIKASI → TERVERIFIKASI` hanya via `receiving_verify`.
- `DRAFT → TERVERIFIKASI` langsung **ditolak** (`INVALID_STATUS`).
- STOCK_IN hanya terjadi pada `receiving_verify`; tidak pernah pada
  `receiving_create` maupun `receiving_submit`.

## Mekanisme Anti-Double-Stock

1. **Idempotency per SKU** — sebelum membuat movement, sistem memeriksa
   `STOCK_MOVEMENT` untuk kombinasi `source=RECEIVING` +
   `source_id=receiving_id` + `sku`. Jika sudah ada, SKU dilewati.
2. **Status idempotent** — `receiving_verify` pada receiving yang sudah
   `TERVERIFIKASI` langsung mengembalikan sukses tanpa memproses ulang.
3. **LockService** — seluruh proses `receiving_verify` (perubahan status
   + movement + stock) dibungkus `LockService.getScriptLock()` sehingga
   dua request bersamaan tidak menyebabkan double stock.
4. **qty_diterima_qc = 0** tidak membuat movement.
5. `STOCK_MOVEMENT` bersifat **append-only**; `STOCK` hanya diubah
   oleh sistem melalui transaksi.

## Error Code

| error_code | Keterangan |
|------------|------------|
| `VALIDATION_ERROR` | Input tidak valid / field wajib kosong |
| `SKU_NOT_FOUND` | SKU tidak ada di MASTER_SKU |
| `SKU_INACTIVE` | SKU nonaktif |
| `USER_NOT_FOUND` | Email tidak terdaftar di USERS |
| `USER_INACTIVE` | User nonaktif |
| `RECEIVING_NOT_FOUND` | receiving_id tidak ditemukan |
| `INVALID_STATUS` | Transisi status tidak valid (misal verify saat masih DRAFT) |
| `LOCK_TIMEOUT` | Gagal mendapatkan lock (sistem sibuk) |
| `UNKNOWN_ACTION` | Parameter action tidak dikenal |
| `INTERNAL_ERROR` | Error tak terduga (dicatat via Logger.log) |

## Deployment (oleh user, bukan tahap ini)

1. Buat project Apps Script baru (atau terikat ke spreadsheet database).
2. Salin seluruh file `.gs` ke project tersebut.
3. Isi `CONFIG.SPREADSHEET_ID` jika script tidak terikat ke spreadsheet.
4. Deploy → New deployment → Web app, catat URL `/exec`.
