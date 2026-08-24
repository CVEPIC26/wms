# Test Plan & Review - STEP 5A (RECEIVING + QC + STOCK IN)

Review implementasi `api/` terhadap
[database.md](database.md) dan [google-sheets-setup.md](google-sheets-setup.md).
Tidak ada fitur baru yang ditambahkan. Tidak ada deployment.

## Cara Menjalankan Test

Test dilakukan setelah deployment manual oleh user (Web App URL `/exec`).
Setiap skenario memakai data uji di spreadsheet:

- `MASTER_SKU`: satu SKU aktif (`<SKU-UJI>`, status `YA`) dan satu SKU
  nonaktif (`<SKU-NONAKTIF>`, status `TIDAK`).
- `USERS`: satu user aktif (`<user-aktif@domain.id>`, status `YA`) dan
  satu user nonaktif (`<user-nonaktif@domain.id>`, status `TIDAK`).

Verifikasi hasil dilakukan dengan membaca langsung sheet
`RECEIVING`, `RECEIVING_DETAIL`, `STOCK_MOVEMENT`, dan `STOCK`.

---

## Hasil Review per Area

| # | Area | Hasil |
|---|------|-------|
| 1 | receiving_create | ⚠️ Bug ditemukan (BUG-2) |
| 2 | RECEIVING_DETAIL | ✅ Sesuai — nama_produk dari MASTER_SKU, kolom persis header |
| 3 | Validasi MASTER_SKU | ✅ Ada + aktif |
| 4 | Validasi USERS | ✅ Ada + aktif, perbandingan email case-insensitive |
| 5 | receiving_submit | ⚠️ Bug ditemukan (BUG-1) |
| 6 | qty_diterima_qc | ✅ Dihitung server: `qty_diterima − qty_reject` |
| 7 | STOCK_IN | ✅ Hanya saat TERVERIFIKASI, skip qty 0 |
| 8 | STOCK_MOVEMENT | ✅ Append-only, kolom persis header, `source=RECEIVING`, `source_id=receiving_id` |
| 9 | STOCK update | ✅ Tambah jika ada, buat baris jika belum; tidak ada edit manual |
| 10 | Idempotency | ✅ Cek `source + source_id + sku`; submit ulang TERVERIFIKASI → sukses tanpa proses |
| 11 | LockService | ✅ `tryLock(30000)` membungkus finalisasi, `releaseLock()` di `finally` |

---

## Bug yang Ditemukan

### BUG-1: Status `MENUNGGU_VERIFIKASI` tidak pernah digunakan

- **File:** `api/ReceivingService.gs`
- **Fungsi:** `receivingCreate_()` dan `receivingSubmit_()`
- **Masalah:** Alur status yang didesain adalah
  `DRAFT → MENUNGGU_VERIFIKASI → TERVERIFIKASI`. Namun `receivingCreate_()`
  membuat status `DRAFT`, dan `receivingSubmit_()` langsung mengubah
  status apapun (DRAFT atau MENUNGGU_VERIFIKASI) menjadi `TERVERIFIKASI`
  sambil memproses STOCK_IN. Status `MENUNGGU_VERIFIKASI` tidak pernah
  ditulis, sehingga tidak ada tahap "menunggu verifikasi" yang nyata
  sebelum stok masuk.
- **Dampak:** Sedang. Tidak menyebabkan double stock, tetapi menyimpang
  dari desain status di `docs/database.md` dan berarti STOCK_IN bisa
  terjadi tanpa pernah melewati status verifikasi yang terdokumentasi.
- **Perbaikan yang diperlukan:** Pisahkan langkahnya —
  `receiving_submit` pertama kali mengubah `DRAFT → MENUNGGU_VERIFIKASI`
  (atau tambahkan action `receiving_verify` untuk
  `MENUNGGU_VERIFIKASI → TERVERIFIKASI` + STOCK_IN). Alternatif minimal:
  dokumentasikan bahwa `receiving_submit` adalah gabungan
  submit+verifikasi dan hapus `MENUNGGU_VERIFIKASI` dari klaim alur.
  **Keputusan desain diperlukan dari user sebelum perbaikan.**

### BUG-2: `receiving_create` sebagian tersimpan jika penulisan detail gagal

- **File:** `api/ReceivingService.gs`
- **Fungsi:** `receivingCreate_()`
- **Masalah:** Header RECEIVING di-append lebih dulu, lalu detail
  di-append satu per satu tanpa lock/rollback. Jika terjadi error di
  tengah penulisan detail (misal gangguan Spreadsheet), tersimpan header
  DRAFT dengan detail yang tidak lengkap.
- **Dampak:** Rendah-sedang. Receiving DRAFT parsial masih bisa
  di-submit (validasi hanya mensyaratkan detail tidak kosong), sehingga
  stok bisa masuk dari data yang tidak lengkap.
- **Perbaikan yang diperlukan:** Bungkus penulisan header+detail dengan
  `LockService`, dan/atau tulis seluruh detail sekaligus dengan
  `getRange(...).setValues()` alih-alih `appendRow` per baris agar lebih
  atomik. **Menunggu persetujuan user.**

### Catatan (bukan bug): potensi ID movement/receiving duplikat lintas hari

- **File:** `api/MovementService.gs` (`nextMovementId_`),
  `api/ReceivingService.gs` (`nextReceivingId_`)
- **Masalah:** Nomor urut dihitung dari `getLastRow()` sehingga unik
  selama data tidak dihapus. Karena tanggal ada di dalam ID, penomoran
  tetap unik lintas hari. Risiko hanya muncul jika baris data dihapus
  manual — yang sudah dilarang oleh aturan append-only.
- **Tindakan:** Tidak perlu perbaikan kode; cukup ditegaskan di SOP
  bahwa baris tidak boleh dihapus.

---

## Skenario Test

### TEST 1 — STOCK_IN normal (100 terima, 3 reject → 97)

1. `POST ?action=receiving_create` dengan `items: [{sku: <SKU-UJI>, qty_diterima: 100, qty_reject: 3, alasan_reject: "robek"}]`, user aktif.
2. **Expected response:** `success: true`, `data.status: "DRAFT"`.
   Di sheet: 1 baris RECEIVING (DRAFT), 1 baris RECEIVING_DETAIL dengan
   `qty_diterima_qc = 97`, `nama_produk` sesuai master.
3. `POST ?action=receiving_submit` dengan `receiving_id` tersebut.
4. **Expected:** `data.status: "TERVERIFIKASI"`, `movement_dibuat: 1`.
   Di `STOCK_MOVEMENT`: 1 baris `STOCK_IN`, `qty = 97`,
   `source = RECEIVING`, `source_id = receiving_id`. Di `STOCK`:
   `qty_stock` SKU bertambah 97 (atau baris baru = 97).

### TEST 2 — SKU tidak terdaftar

- `receiving_create` dengan SKU yang tidak ada di MASTER_SKU.
- **Expected:** `success: false`, `error_code: "SKU_NOT_FOUND"`.
  Tidak ada baris baru di RECEIVING maupun RECEIVING_DETAIL.

### TEST 3 — SKU nonaktif

- `receiving_create` dengan `<SKU-NONAKTIF>`.
- **Expected:** `error_code: "SKU_INACTIVE"`. Tidak ada baris baru.

### TEST 4 — User tidak terdaftar

- `receiving_create` dengan email yang tidak ada di USERS.
- **Expected:** `error_code: "USER_NOT_FOUND"`. Tidak ada baris baru.
- Ulangi pada `receiving_submit` → hasil sama.

### TEST 5 — User nonaktif

- `receiving_create` dengan `<user-nonaktif@domain.id>`.
- **Expected:** `error_code: "USER_INACTIVE"`. Tidak ada baris baru.
- Ulangi pada `receiving_submit` → hasil sama.

### TEST 6 — qty_reject > qty_diterima

- `receiving_create` dengan `qty_diterima: 10, qty_reject: 15`.
- **Expected:** `error_code: "VALIDATION_ERROR"`. Tidak ada baris baru.

### TEST 7 — qty_reject > 0 tanpa alasan_reject

- `receiving_create` dengan `qty_diterima: 10, qty_reject: 2` tanpa
  `alasan_reject` (atau string kosong).
- **Expected:** `error_code: "VALIDATION_ERROR"`. Tidak ada baris baru.

### TEST 8 — qty_diterima_qc = 0

1. `receiving_create` dengan `qty_diterima: 5, qty_reject: 5,
   alasan_reject: "rusak"` → DRAFT, detail tersimpan dengan
   `qty_diterima_qc = 0`.
2. `receiving_submit`.
- **Expected:** `success: true`, `status: TERVERIFIKASI`,
  `movement_dibuat: 0`, `movement_dilewati: 1`.
  **Tidak ada baris baru di STOCK_MOVEMENT**, `STOCK` tidak berubah.

### TEST 9 — receiving_submit dipanggil dua kali

1. Buat receiving (TEST 1), catat `qty_stock` setelah submit pertama.
2. Panggil `receiving_submit` lagi dengan `receiving_id` yang sama.
- **Expected:** `success: true`, `data.sudah_diproses: true`.
  `STOCK_MOVEMENT` tidak bertambah, `qty_stock` **sama** dengan setelah
  submit pertama (hanya bertambah satu kali).

### TEST 10 — Dua request receiving_submit bersamaan

1. Buat receiving baru (DRAFT).
2. Kirim dua request `receiving_submit` untuk `receiving_id` yang sama
   secara bersamaan (dua klien/tab, atau trigger berurutan secepat
   mungkin).
- **Expected:** Satu request memproses (movement dibuat, stok bertambah
  satu kali); request lainnya mendapat `sudah_diproses: true` atau
  `error_code: "LOCK_TIMEOUT"`. Pada kedua kasus: `qty_stock` hanya
  bertambah **satu kali** dan hanya ada satu movement per SKU.
- **Catatan:** LockService menjamin bagian kritis serial; idempotency
  menjamin request kedua tidak memproses ulang.

---

## Kesimpulan

**STEP 5A BELUM SIAP DINYATAKAN READY FOR DEPLOYMENT** — ditemukan 2 bug:

- **BUG-1** (sedang): status `MENUNGGU_VERIFIKASI` tidak pernah
  digunakan; STOCK_IN bisa terjadi tanpa tahap verifikasi yang
  terdokumentasi. Perlu keputusan desain dari user.
- **BUG-2** (rendah-sedang): `receiving_create` dapat menyimpan data
  parsial jika penulisan detail gagal di tengah jalan.

Keduanya tidak menyebabkan double stock (lapisan idempotency +
LockService bekerja sesuai desain), tetapi perlu keputusan/perbaikan
sebelum deployment produksi. Seluruh skenario validasi (TEST 2–8) dan
anti-double-stock (TEST 9–10) telah diverifikasi lewat penelusuran kode
dan siap diuji setelah deployment.
