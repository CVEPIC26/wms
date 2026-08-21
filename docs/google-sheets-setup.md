# Setup Google Spreadsheet - WMS CV Edukasi Pratama Insan Cemerlang

Dokumen ini adalah panduan implementasi struktur database Google
Spreadsheet berdasarkan desain di [docs/database.md](database.md).

> Tahap ini hanya dokumentasi implementasi. Tidak ada API, Apps Script,
> fitur frontend, atau database SQL yang dibuat.

---

## Urutan Pembuatan Sheet

Buat sheet dalam satu file Google Spreadsheet dengan urutan berikut
(sesuai tab dari kiri ke kanan). Urutan ini mengikuti ketergantungan:
master data dulu, baru transaksi.

| Urutan | Nama Sheet | Keterangan |
|--------|-----------|------------|
| 1 | `MASTER_SKU` | Master produk — dibuat pertama karena direferensi semua sheet |
| 2 | `USERS` | Master user — direferensi transaksi sebagai pelaksana |
| 3 | `RECEIVING` | Header transaksi receiving + QC |
| 4 | `RECEIVING_DETAIL` | Detail receiving, merujuk `RECEIVING` dan `MASTER_SKU` |
| 5 | `STOCK` | Saldo stok per SKU (dikelola sistem) |
| 6 | `STOCK_MOVEMENT` | Histori perubahan stok (append-only) |
| 7 | `STOCK_OPNAME` | Header stock opname |
| 8 | `STOCK_OPNAME_DETAIL` | Detail opname, merujuk `STOCK_OPNAME` dan `MASTER_SKU` |

Source eksternal `PENYIAPAN` **tidak dibuat** di spreadsheet ini —
sheet tersebut sudah ada di file terpisah dan hanya dibaca oleh API
pada tahap berikutnya.

---

## Aturan Umum Semua Sheet

### Format tanggal
- Kolom `tanggal` memakai format **`YYYY-MM-DD`** (contoh: `2026-08-19`).
- Di Spreadsheet: Format → Number → Custom date and time → `yyyy-MM-dd`.

### Format datetime
- Kolom `created_at` dan `updated_at` memakai format
  **`YYYY-MM-DD HH:MM`** (contoh: `2026-08-19 09:15`), zona waktu
  lokal operasional (WIB).
- Di Spreadsheet: Format → Number → Custom date and time →
  `yyyy-MM-dd HH:mm`.

### Format SKU
- `sku` adalah **teks** (bukan angka), huruf kapital, tanpa spasi.
- Ditentukan oleh tim bisnis sesuai kode produk yang berlaku.
- Format sel kolom: **Plain text** agar Spreadsheet tidak mengubah
  nilai (misal SKU yang terlihat seperti angka/tanggal).

### Aturan agar ID tidak berubah
- Semua kolom ID (`receiving_id`, `opname_id`, `movement_id`,
  `source_id`) diisi sebagai **teks**.
- Set format sel kolom ID ke **Plain text** sebelum data diisi.
- Jangan mengetik ID dengan awalan `=` (dianggap formula).
- Pola penomoran: `PREFIX-YYYYMMDD-NNN` (contoh pola:
  `RCV-20260819-001`, `OPN-20260819-001`, `MV-20260819-0001`).
  Prefix: `RCV` (receiving), `OPN` (opname), `MV` (movement).

### Aturan agar STOCK_MOVEMENT append-only
- Baris baru selalu **ditambahkan di baris paling bawah** — jangan
  menyisipkan baris di tengah.
- Baris yang sudah ada **tidak boleh diedit dan tidak boleh dihapus**
  oleh siapa pun, termasuk admin.
- Koreksi kesalahan dilakukan dengan menambahkan movement baru
  (misal `STOCK_ADJUSTMENT`), bukan mengubah histori.
- Rekomendasi teknis: kunci sheet/range `STOCK_MOVEMENT` via
  **Data → Protect sheets and ranges**, edit hanya oleh sistem/API
  pada tahap berikutnya.

### Aturan agar STOCK tidak diedit manual
- `STOCK.qty_stock` adalah saldo yang **dikelola sistem**; operator
  **tidak boleh mengedit manual**.
- Perubahan saldo hanya terjadi melalui transaksi yang tercatat di
  `STOCK_MOVEMENT`.
- Koreksi stok hanya lewat **Stock Opname → `STOCK_ADJUSTMENT`**.
- Rekomendasi teknis: kunci sheet `STOCK` via
  **Data → Protect sheets and ranges**, edit hanya oleh sistem/API.

---

## 1. Sheet MASTER_SKU

Master produk. `sku` adalah identitas utama yang menjadi dasar
scan/input operator di semua transaksi.

**Header kolom (baris 1, persis):**

```
sku | nama_produk | status_aktif
```

| Kolom | Tipe Data | Wajib | Aturan Pengisian |
|-------|-----------|-------|------------------|
| `sku` | text | ✅ | Kode SKU unik, kapital, tanpa spasi, format sel Plain text. Tidak boleh duplikat. |
| `nama_produk` | text | ✅ | Nama produk lengkap (buku, modul, tas, seragam, dll.). |
| `status_aktif` | text | ✅ | Hanya `YA` atau `TIDAK`. `YA` = dapat ditransaksikan. |

**Contoh 1 baris (placeholder):**

| sku | nama_produk | status_aktif |
|-----|-------------|--------------|
| `<SKU-PRODUK>` | `<NAMA PRODUK>` | `YA` |

---

## 2. Sheet USERS

Master user pelaksana. Tahap ini hanya pencatatan identitas —
belum ada sistem autentikasi/login.

**Header kolom (baris 1, persis):**

```
email | nama | peran | status_aktif
```

| Kolom | Tipe Data | Wajib | Aturan Pengisian |
|-------|-----------|-------|------------------|
| `email` | text | ✅ | Email user, unik, huruf kecil. Dipakai sebagai `user_email` di transaksi dan untuk verifikasi nanti. |
| `nama` | text | ✅ | Nama lengkap user. |
| `peran` | text | ✅ | Peran user, misal `operator` atau `admin`. |
| `status_aktif` | text | ✅ | Hanya `YA` atau `TIDAK`. |

**Contoh 1 baris (placeholder):**

| email | nama | peran | status_aktif |
|-------|------|-------|--------------|
| `<email-user@domain.id>` | `<NAMA USER>` | `operator` | `YA` |

---

## 3. Sheet RECEIVING

Header transaksi penerimaan barang dari supplier. Satu baris per
transaksi receiving (satu proses dengan QC).

**Header kolom (baris 1, persis):**

```
receiving_id | tanggal | supplier | nomor_po | user_email | status | created_at
```

| Kolom | Tipe Data | Wajib | Aturan Pengisian |
|-------|-----------|-------|------------------|
| `receiving_id` | text | ✅ | ID unik, pola `RCV-YYYYMMDD-NNN`, format sel Plain text. |
| `tanggal` | date | ✅ | Format `YYYY-MM-DD`. |
| `supplier` | text | ✅ | Nama/kode supplier. |
| `nomor_po` | text | ✅ | Nomor PO, format sel Plain text. |
| `user_email` | text | ✅ | Email pelaksana, harus ada di `USERS.email`. |
| `status` | text | ✅ | `DRAFT` / `MENUNGGU_VERIFIKASI` / `TERVERIFIKASI`. |
| `created_at` | datetime | ✅ | Format `YYYY-MM-DD HH:MM`. |

**Contoh 1 baris (placeholder):**

| receiving_id | tanggal | supplier | nomor_po | user_email | status | created_at |
|---|---|---|---|---|---|---|
| `RCV-<YYYYMMDD>-001` | `<YYYY-MM-DD>` | `<NAMA SUPPLIER>` | `<NOMOR PO>` | `<email-user@domain.id>` | `DRAFT` | `<YYYY-MM-DD HH:MM>` |

---

## 4. Sheet RECEIVING_DETAIL

Detail per SKU untuk setiap transaksi receiving, termasuk hasil
QC ringan (kesesuaian qty, robek/rusak, catatan — tanpa QC per unit).

**Header kolom (baris 1, persis):**

```
receiving_id | sku | nama_produk | qty_diterima | qty_reject | qty_diterima_qc | alasan_reject | catatan
```

| Kolom | Tipe Data | Wajib | Aturan Pengisian |
|-------|-----------|-------|------------------|
| `receiving_id` | text | ✅ | Harus ada di `RECEIVING.receiving_id`. |
| `sku` | text | ✅ | Harus ada di `MASTER_SKU.sku`, hasil scan/input operator. |
| `nama_produk` | text | ✅ | Snapshot nama produk saat transaksi. |
| `qty_diterima` | number | ✅ | Qty diterima dari supplier, bilangan bulat ≥ 0. |
| `qty_reject` | number | ✅ | Qty reject (robek/rusak), bilangan bulat ≥ 0. **Tidak masuk stok.** |
| `qty_diterima_qc` | number | ✅ | Qty lolos QC → **STOCK_IN**. Rumus: `qty_diterima − qty_reject`. |
| `alasan_reject` | text | opsional | Wajib diisi jika `qty_reject > 0`, misal `robek`, `rusak`. |
| `catatan` | text | opsional | Catatan QC tambahan. |

**Contoh 1 baris (placeholder):**

| receiving_id | sku | nama_produk | qty_diterima | qty_reject | qty_diterima_qc | alasan_reject | catatan |
|---|---|---|---|---|---|---|---|
| `RCV-<YYYYMMDD>-001` | `<SKU-PRODUK>` | `<NAMA PRODUK>` | `<QTY>` | `<QTY REJECT>` | `<QTY − QTY REJECT>` | `<robek/rusak>` | `<CATATAN>` |

---

## 5. Sheet STOCK

Saldo stok terkini per SKU. **Dikelola sistem — tidak diedit manual
oleh operator** (lihat aturan umum di atas).

**Header kolom (baris 1, persis):**

```
sku | nama_produk | qty_stock | updated_at
```

| Kolom | Tipe Data | Wajib | Aturan Pengisian |
|-------|-----------|-------|------------------|
| `sku` | text | ✅ | Harus ada di `MASTER_SKU.sku`. Satu baris per SKU, tidak duplikat. |
| `nama_produk` | text | ✅ | Nama produk sesuai master. |
| `qty_stock` | number | ✅ | Saldo terkini, hanya berubah lewat transaksi `STOCK_MOVEMENT`. |
| `updated_at` | datetime | ✅ | Waktu update terakhir, format `YYYY-MM-DD HH:MM`. |

**Contoh 1 baris (placeholder):**

| sku | nama_produk | qty_stock | updated_at |
|-----|-------------|-----------|------------|
| `<SKU-PRODUK>` | `<NAMA PRODUK>` | `<SALDO>` | `<YYYY-MM-DD HH:MM>` |

---

## 6. Sheet STOCK_MOVEMENT

Histori seluruh perubahan stok. **Append-only — baris tidak boleh
diedit/dihapus** (lihat aturan umum di atas).

**Header kolom (baris 1, persis):**

```
movement_id | tanggal | sku | tipe_transaksi | qty | source | source_id | keterangan | user_email | created_at
```

| Kolom | Tipe Data | Wajib | Aturan Pengisian |
|-------|-----------|-------|------------------|
| `movement_id` | text | ✅ | ID unik, pola `MV-YYYYMMDD-NNNN`, format sel Plain text. |
| `tanggal` | date | ✅ | Tanggal efektif transaksi, format `YYYY-MM-DD`. |
| `sku` | text | ✅ | Harus ada di `MASTER_SKU.sku`. |
| `tipe_transaksi` | text | ✅ | `STOCK_IN` / `STOCK_OUT` / `STOCK_ADJUSTMENT`. |
| `qty` | number | ✅ | Selalu positif; arah perubahan ditentukan `tipe_transaksi`. |
| `source` | text | ✅ | Asal transaksi: `RECEIVING` / `PENYIAPAN` / `STOCK_OPNAME`. |
| `source_id` | text | ✅ | Identitas unik transaksi **per SKU** pada sumbernya. Bukan sekadar nomor PO/dokumen. Format final ditetapkan setelah struktur sheet `PENYIAPAN` dianalisis. Format sel Plain text. |
| `keterangan` | text | opsional | Keterangan tambahan. |
| `user_email` | text | ✅ | Email pelaksana; untuk transaksi otomatis dari API gunakan nilai penanda sistem (misal `system`). |
| `created_at` | datetime | ✅ | Format `YYYY-MM-DD HH:MM`. |

**Contoh 1 baris (placeholder):**

| movement_id | tanggal | sku | tipe_transaksi | qty | source | source_id | keterangan | user_email | created_at |
|---|---|---|---|---|---|---|---|---|---|
| `MV-<YYYYMMDD>-0001` | `<YYYY-MM-DD>` | `<SKU-PRODUK>` | `STOCK_IN` | `<QTY>` | `RECEIVING` | `<ID SUMBER PER SKU>` | `<KETERANGAN>` | `<email-user@domain.id>` | `<YYYY-MM-DD HH:MM>` |

---

## 7. Sheet STOCK_OPNAME

Header transaksi stock opname (dilakukan via Web App, scan/input SKU).

**Header kolom (baris 1, persis):**

```
opname_id | tanggal | lokasi | user_email | status | created_at
```

| Kolom | Tipe Data | Wajib | Aturan Pengisian |
|-------|-----------|-------|------------------|
| `opname_id` | text | ✅ | ID unik, pola `OPN-YYYYMMDD-NNN`, format sel Plain text. |
| `tanggal` | date | ✅ | Format `YYYY-MM-DD`. |
| `lokasi` | text | opsional | Lokasi/gudang jika diperlukan. |
| `user_email` | text | ✅ | Email pelaksana, harus ada di `USERS.email`. |
| `status` | text | ✅ | `DRAFT` / `MENUNGGU_VERIFIKASI` / `TERVERIFIKASI` / `DISETUJUI`. |
| `created_at` | datetime | ✅ | Format `YYYY-MM-DD HH:MM`. |

**Contoh 1 baris (placeholder):**

| opname_id | tanggal | lokasi | user_email | status | created_at |
|---|---|---|---|---|---|
| `OPN-<YYYYMMDD>-001` | `<YYYY-MM-DD>` | `<LOKASI/GUDANG>` | `<email-user@domain.id>` | `DRAFT` | `<YYYY-MM-DD HH:MM>` |

---

## 8. Sheet STOCK_OPNAME_DETAIL

Detail per SKU untuk setiap sesi opname.

**Header kolom (baris 1, persis):**

```
opname_id | sku | system_qty | physical_qty | difference_qty | notes
```

| Kolom | Tipe Data | Wajib | Aturan Pengisian |
|-------|-----------|-------|------------------|
| `opname_id` | text | ✅ | Harus ada di `STOCK_OPNAME.opname_id`. |
| `sku` | text | ✅ | Harus ada di `MASTER_SKU.sku`, hasil scan/input. |
| `system_qty` | number | ✅ | **Snapshot** `STOCK.qty_stock` saat SKU dicatat dalam sesi opname. Setelah dibuat, nilai ini **tidak berubah** walaupun stok berubah setelahnya. |
| `physical_qty` | number | ✅ | Qty hasil hitung fisik, bilangan bulat ≥ 0. |
| `difference_qty` | number | ✅ | Rumus: `physical_qty − system_qty` (boleh negatif). |
| `notes` | text | opsional | Catatan hasil opname. |

**Contoh 1 baris (placeholder):**

| opname_id | sku | system_qty | physical_qty | difference_qty | notes |
|---|---|---|---|---|---|
| `OPN-<YYYYMMDD>-001` | `<SKU-PRODUK>` | `<QTY SISTEM>` | `<QTY FISIK>` | `<FISIK − SISTEM>` | `<CATATAN>` |

Jika opname menghasilkan selisih dan berstatus `DISETUJUI`, sistem
membuat `STOCK_MOVEMENT` bertipe `STOCK_ADJUSTMENT`
(`source = STOCK_OPNAME`) dan menyesuaikan `STOCK.qty_stock`.

---

## Source Eksternal: PENYIAPAN

- **Bukan** bagian spreadsheet database WMS — tidak dibuat di sini.
- Data penyiapan sudah ada/diinput di Google Spreadsheet terpisah
  (di luar Web App).
- Pada tahap API nanti: API membaca `PENYIAPAN`, membuat
  `STOCK_MOVEMENT` bertipe `STOCK_OUT` dengan `source = PENYIAPAN`,
  dan mengurangi `STOCK.qty_stock` **satu kali** (accrual).
- Idempotency per SKU via `source` + `source_id` + `sku` mencegah
  pemrosesan ganda; Loading tidak mengurangi stok lagi.
- Struktur kolom asli `PENYIAPAN` akan dianalisis pada tahap API
  untuk menetapkan format final `source_id`.

---

## Rekomendasi (belum ditambahkan, menunggu persetujuan)

Kolom berikut **tidak** ditambahkan ke struktur — hanya dicatat sebagai
pertimbangan:

1. **`satuan` pada `MASTER_SKU`** — satuan qty (pcs, box, pak, dll.)
   membantu operator membaca qty dengan benar saat receiving/opname.
2. **`kategori` pada `MASTER_SKU`** — pengelompokan produk (buku,
   modul, tas, seragam) memudahkan filter laporan.
3. **`nama_produk` pada `STOCK_OPNAME_DETAIL`** — snapshot nama produk
   memudahkan operator memverifikasi hasil scan tanpa membuka sheet
   master (konsisten dengan `RECEIVING_DETAIL` yang sudah memiliki
   `nama_produk`).
4. **`approved_by` dan `approved_at` pada `STOCK_OPNAME`** — mencatat
   siapa dan kapan selisih opname disetujui menjadi `STOCK_ADJUSTMENT`,
   untuk kebutuhan audit.
5. **`row_number` pada `RECEIVING_DETAIL` dan `STOCK_OPNAME_DETAIL`** —
   nomor urut baris detail memudahkan penunjukan baris saat koreksi
   data.

---

## Ringkasan Seluruh Header

| Sheet | Header |
|-------|--------|
| `MASTER_SKU` | `sku`, `nama_produk`, `status_aktif` |
| `USERS` | `email`, `nama`, `peran`, `status_aktif` |
| `RECEIVING` | `receiving_id`, `tanggal`, `supplier`, `nomor_po`, `user_email`, `status`, `created_at` |
| `RECEIVING_DETAIL` | `receiving_id`, `sku`, `nama_produk`, `qty_diterima`, `qty_reject`, `qty_diterima_qc`, `alasan_reject`, `catatan` |
| `STOCK` | `sku`, `nama_produk`, `qty_stock`, `updated_at` |
| `STOCK_MOVEMENT` | `movement_id`, `tanggal`, `sku`, `tipe_transaksi`, `qty`, `source`, `source_id`, `keterangan`, `user_email`, `created_at` |
| `STOCK_OPNAME` | `opname_id`, `tanggal`, `lokasi`, `user_email`, `status`, `created_at` |
| `STOCK_OPNAME_DETAIL` | `opname_id`, `sku`, `system_qty`, `physical_qty`, `difference_qty`, `notes` |
