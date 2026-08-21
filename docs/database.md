# Desain Database - Google Spreadsheet
## WMS CV Edukasi Pratama Insan Cemerlang

Dokumen ini adalah desain struktur database WMS tahap pertama yang akan
diimplementasikan di **Google Spreadsheet** (bukan SQL). Setiap "tabel"
adalah satu **sheet**. API (tahap berikutnya) akan membaca/menulis sheet
ini dari Web App.

> Tahap ini hanya dokumentasi. Tidak ada API, tidak ada fitur frontend,
> tidak ada perubahan business process.

---

## Daftar Sheet

| # | Sheet | Jenis | Keterangan |
|---|-------|-------|------------|
| 1 | `MASTER_SKU` | Master | Data produk |
| 2 | `USERS` | Master | Data user/pelaksana |
| 3 | `RECEIVING` | Transaksi (header) | Penerimaan barang + QC |
| 4 | `RECEIVING_DETAIL` | Transaksi (detail) | Item per transaksi receiving |
| 5 | `STOCK` | Saldo | Stok terkini per SKU |
| 6 | `STOCK_MOVEMENT` | Histori | Seluruh perubahan stok |
| 7 | `STOCK_OPNAME` | Transaksi (header) | Stock opname |
| 8 | `STOCK_OPNAME_DETAIL` | Transaksi (detail) | Item per opname |
| - | `PENYIAPAN` | **Source data eksternal** | Bukan database WMS utama |

### Source Data Eksternal: PENYIAPAN

- Sheet `PENYIAPAN` **bukan bagian database WMS utama**.
- Datanya sudah ada/diinput di Google Spreadsheet di luar Web App.
- API akan **membaca** `PENYIAPAN` dan memprosesnya menjadi transaksi
  `STOCK_OUT` (lihat bagian F dan G).

---

## Diagram Relasi Sederhana

```
MASTER_SKU ──< RECEIVING_DETAIL >── RECEIVING ── USERS
    │                                          (user pelaksana)
    │
    ├──< STOCK (saldo per SKU)
    │
    └──< STOCK_MOVEMENT ── reference_id ──> RECEIVING_DETAIL (STOCK_IN)
                 │                    └──> PENYIAPAN (STOCK_OUT, eksternal)
                 │                    └──> STOCK_OPNAME_DETAIL (STOCK_ADJUSTMENT)
                 │
MASTER_SKU ──< STOCK_OPNAME_DETAIL >── STOCK_OPNAME ── USERS

PENYIAPAN (eksternal) ──API──> STOCK_OUT ──> STOCK (berkurang)
                                        └──> STOCK_MOVEMENT
```

Relasi antar sheet dijaga lewat kolom kunci (`SKU`, `receiving_id`,
`opname_id`, `reference_id`) — bukan foreign key database.

---

## A. MASTER_SKU

Identitas utama produk. Seluruh transaksi mengacu ke sheet ini lewat `SKU`.

| Kolom | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `sku` | text | ✅ | Kode SKU unik, identitas utama produk (dasar scan/input operator) |
| `nama_produk` | text | ✅ | Nama produk (buku, modul, tas, seragam, dll.) |
| `status_aktif` | boolean (`YA`/`TIDAK`) | ✅ | `YA` = produk aktif, `TIDAK` = nonaktif |

Contoh:

| sku | nama_produk | status_aktif |
|-----|-------------|--------------|
| BK-001 | Buku Tematik Kelas 1 | YA |
| MD-010 | Modul Literasi SD | YA |

---

## B. USERS

Data user pelaksana. Untuk tahap ini hanya dokumentasi field —
**belum ada sistem autentikasi** (lihat bagian I).

| Kolom | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `email` | text | ✅ | Email user, dipakai untuk pencatatan pelaksana dan verifikasi nanti |
| `nama` | text | ✅ | Nama user |
| `peran` | text | ✅ | Peran, misal: `operator`, `admin` |
| `status_aktif` | boolean (`YA`/`TIDAK`) | ✅ | Status user aktif |

---

## C. RECEIVING (Header)

Satu baris per transaksi penerimaan barang dari supplier.
Receiving dan QC adalah **satu proses** — detail QC ada di
`RECEIVING_DETAIL`.

| Kolom | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `receiving_id` | text | ✅ | ID unik transaksi, misal `RCV-20260819-001` |
| `tanggal` | date | ✅ | Tanggal receiving |
| `supplier` | text | ✅ | Nama/kode supplier |
| `nomor_po` | text | ✅ | Nomor PO |
| `user_email` | text | ✅ | Email pelaksana (referensi `USERS.email`) |
| `status` | text | ✅ | `DRAFT` / `MENUNGGU_VERIFIKASI` / `TERVERIFIKASI` |
| `created_at` | datetime | ✅ | Waktu pembuatan record |

---

## D. RECEIVING_DETAIL

Satu baris per SKU dalam satu transaksi receiving.

| Kolom | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `receiving_id` | text | ✅ | Referensi `RECEIVING.receiving_id` |
| `sku` | text | ✅ | Referensi `MASTER_SKU.sku` (hasil scan/input operator) |
| `nama_produk` | text | ✅ | Snapshot nama produk saat transaksi |
| `qty_diterima` | number | ✅ | Qty yang diterima dari supplier |
| `qty_reject` | number | ✅ | Qty reject (robek/rusak) — **tidak masuk stok** |
| `qty_diterima_qc` | number | ✅ | Qty lolos QC → menjadi **STOCK_IN** |
| `alasan_reject` | text | opsional | Misal: `robek`, `rusak` |
| `catatan` | text | opsional | Catatan QC |

**Rumus:**

```
qty_diterima_qc = qty_diterima - qty_reject
```

### QC (bagian J)

QC bersifat **ringan** karena produk berupa buku, modul, tas, seragam,
dll. dalam jumlah besar. QC hanya memeriksa:

- Kesesuaian qty
- Robek
- Rusak / reject
- Catatan

Tidak perlu QC per unit.

---

## E. STOCK

Saldo stok **saat ini** per SKU. Satu baris per SKU. Diupdate oleh
setiap transaksi yang tercatat di `STOCK_MOVEMENT`.

| Kolom | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `sku` | text | ✅ | Referensi `MASTER_SKU.sku`, satu baris per SKU |
| `nama_produk` | text | ✅ | Nama produk |
| `qty_stock` | number | ✅ | Saldo stok terkini |
| `updated_at` | datetime | ✅ | Waktu update terakhir |

`qty_stock` selalu konsisten dengan histori:

```
qty_stock = Σ STOCK_IN − Σ STOCK_OUT ± Σ STOCK_ADJUSTMENT
```

---

## F. STOCK_MOVEMENT

Histori **seluruh** perubahan stok. Bersifat append-only
(tidak diedit/dihapus).

| Kolom | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `movement_id` | text | ✅ | ID unik movement, misal `MV-20260819-0001` |
| `tanggal` | date | ✅ | Tanggal efektif transaksi |
| `sku` | text | ✅ | Referensi `MASTER_SKU.sku` |
| `tipe_transaksi` | text | ✅ | `STOCK_IN` / `STOCK_OUT` / `STOCK_ADJUSTMENT` |
| `qty` | number | ✅ | Jumlah perubahan (selalu positif; arah ditentukan `tipe_transaksi`) |
| `reference_id` | text | ✅ | ID sumber transaksi (unik per transaksi, lihat idempotency) |
| `keterangan` | text | opsional | Keterangan tambahan |
| `user_email` | text | ✅ | Email pelaksana |
| `created_at` | datetime | ✅ | Waktu record dibuat |

### Tipe transaksi awal

| Tipe | Sumber | Efek ke `STOCK.qty_stock` |
|------|--------|---------------------------|
| `STOCK_IN` | `RECEIVING_DETAIL.qty_diterima_qc` | bertambah |
| `STOCK_OUT` | Source data `PENYIAPAN` (via API) | berkurang |
| `STOCK_ADJUSTMENT` | `STOCK_OPNAME_DETAIL` yang disetujui | menyesuaikan selisih |

### STOCK OUT & Idempotency

- Stock Out **berasal dari source data `PENYIAPAN`**.
- Web App **tidak** digunakan untuk menginput Penyiapan.
- API membaca `PENYIAPAN` dan membuat movement `STOCK_OUT`.
- Menggunakan sistem **idempotency**: `reference_id` diambil dari ID
  unik baris sumber di `PENYIAPAN` (misal `PNY-000123`).
- Sebelum membuat movement, API memeriksa `STOCK_MOVEMENT` — jika
  `reference_id` + `tipe_transaksi = STOCK_OUT` sudah ada, transaksi
  **dilewati** (tidak diproses dua kali).

---

## G. ACCRUAL (Pengakuan STOCK_OUT)

Ketika transaksi `STOCK_OUT` diakui/diterima oleh sistem:

1. `STOCK.qty_stock` berkurang sesuai qty.
2. Satu baris `STOCK_MOVEMENT` bertipe `STOCK_OUT` dibuat.
3. Transaksi **tidak boleh dikurangi lagi** ketika Loading dilakukan.

**Loading** (proses penyiapan barang ke outlet) hanya proses operasional
dari data `PENYIAPAN` dan **tidak boleh melakukan pengurangan stok kedua
kali** — idempotency pada `reference_id` menjamin hal ini.

---

## H. STOCK_OPNAME (Header) & STOCK_OPNAME_DETAIL

Stock opname dilakukan melalui Web App dengan scan/input SKU.

### STOCK_OPNAME

| Kolom | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `opname_id` | text | ✅ | ID unik opname, misal `OPN-20260819-001` |
| `tanggal` | date | ✅ | Tanggal opname |
| `lokasi` | text | opsional | Lokasi/gudang jika diperlukan |
| `user_email` | text | ✅ | Email pelaksana (referensi `USERS.email`) |
| `status` | text | ✅ | `DRAFT` / `MENUNGGU_VERIFIKASI` / `TERVERIFIKASI` / `DISETUJUI` |
| `created_at` | datetime | ✅ | Waktu pembuatan record |

### STOCK_OPNAME_DETAIL

| Kolom | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `opname_id` | text | ✅ | Referensi `STOCK_OPNAME.opname_id` |
| `sku` | text | ✅ | Referensi `MASTER_SKU.sku` (hasil scan/input) |
| `system_qty` | number | ✅ | Qty menurut `STOCK.qty_stock` saat opname |
| `physical_qty` | number | ✅ | Qty hasil hitung fisik |
| `difference_qty` | number | ✅ | Selisih |
| `notes` | text | opsional | Catatan |

**Rumus:**

```
difference_qty = physical_qty - system_qty
```

Jika opname menghasilkan selisih dan **disetujui**, dibuat
`STOCK_MOVEMENT` bertipe `STOCK_ADJUSTMENT` dengan
`reference_id = opname_id + sku`, dan `STOCK.qty_stock` disesuaikan.

---

## I. USER VERIFICATION

`RECEIVING` + QC dan `STOCK_OPNAME` nantinya membutuhkan **verifikasi
email user**. Tahap ini hanya dokumentasi field — **belum dibuat sistem
autentikasi/login**.

Field yang disiapkan:

| Sheet | Kolom | Keterangan |
|-------|-------|------------|
| `USERS` | `email` | Identitas user untuk verifikasi |
| `RECEIVING` | `user_email` | Pelaksana transaksi |
| `RECEIVING` | `status` | `MENUNGGU_VERIFIKASI` → `TERVERIFIKASI` |
| `STOCK_OPNAME` | `user_email` | Pelaksana opname |
| `STOCK_OPNAME` | `status` | `MENUNGGU_VERIFIKASI` → `TERVERIFIKASI` |

---

## Contoh Transaksi

### Contoh 1: Receiving (STOCK_IN)

Supplier `PT Sumber Buku` mengirim PO `PO-2026-081`, diterima operator
`budi@cvepic.id` pada 19-08-2026. Dari 100 pcs buku, 3 pcs robek.

**RECEIVING**

| receiving_id | tanggal | supplier | nomor_po | user_email | status | created_at |
|---|---|---|---|---|---|---|
| RCV-20260819-001 | 2026-08-19 | PT Sumber Buku | PO-2026-081 | budi@cvepic.id | TERVERIFIKASI | 2026-08-19 09:15 |

**RECEIVING_DETAIL**

| receiving_id | sku | nama_produk | qty_diterima | qty_reject | qty_diterima_qc | alasan_reject | catatan |
|---|---|---|---|---|---|---|---|
| RCV-20260819-001 | BK-001 | Buku Tematik Kelas 1 | 100 | 3 | 97 | robek | 3 pcs cover robek |

**STOCK_MOVEMENT**

| movement_id | tanggal | sku | tipe_transaksi | qty | reference_id | keterangan | user_email | created_at |
|---|---|---|---|---|---|---|---|---|
| MV-20260819-0001 | 2026-08-19 | BK-001 | STOCK_IN | 97 | RCV-20260819-001 | Receiving PO-2026-081 | budi@cvepic.id | 2026-08-19 09:20 |

**STOCK** (misal saldo sebelumnya 0)

| sku | nama_produk | qty_stock | updated_at |
|---|---|---|---|
| BK-001 | Buku Tematik Kelas 1 | 97 | 2026-08-19 09:20 |

### Contoh 2: Stock Out dari PENYIAPAN (ACCRUAL)

Source data `PENYIAPAN` berisi baris penyiapan `PNY-000123` untuk outlet
`Outlet Bandung`: SKU `BK-001` sebanyak 20 pcs. API membaca baris ini dan
mengakuinya sebagai `STOCK_OUT`. Loading ke outlet dilakukan setelahnya
**tanpa** pengurangan stok lagi.

**STOCK_MOVEMENT**

| movement_id | tanggal | sku | tipe_transaksi | qty | reference_id | keterangan | user_email | created_at |
|---|---|---|---|---|---|---|---|---|
| MV-20260819-0002 | 2026-08-19 | BK-001 | STOCK_OUT | 20 | PNY-000123 | Penyiapan Outlet Bandung (accrual) | system | 2026-08-19 13:05 |

**STOCK**

| sku | nama_produk | qty_stock | updated_at |
|---|---|---|---|
| BK-001 | Buku Tematik Kelas 1 | 77 | 2026-08-19 13:05 |

Jika API membaca ulang `PENYIAPAN` dan menemukan `PNY-000123` lagi,
pemeriksaan idempotency menemukan `reference_id = PNY-000123` sudah ada
di `STOCK_MOVEMENT` → baris **dilewati**, stok tidak berkurang dua kali.

---

## Yang TIDAK Dibuat (batasan tahap ini)

Sesuai ketentuan, desain ini sengaja **tidak** memuat:

- Tabel reservation / reserved stock
- Picking / packing
- Login/autentikasi kompleks
- Database barcode kompleks
- Database SQL
- API
- Fitur frontend

## Catatan Penerapan di Google Spreadsheet

- Satu sheet per tabel, baris pertama = nama kolom persis seperti
  dokumentasi ini.
- Kolom ID (`receiving_id`, `opname_id`, `movement_id`, `reference_id`)
  diisi teks agar tidak diubah format oleh Spreadsheet.
- Kolom tanggal memakai format konsisten `YYYY-MM-DD` dan
  `created_at`/`updated_at` memakai `YYYY-MM-DD HH:MM`.
- Nilai boolean memakai teks `YA`/`TIDAK` agar mudah difilter.
- `STOCK_MOVEMENT` bersifat append-only: jangan mengedit/menghapus
  baris yang sudah ada.
