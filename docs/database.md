# Database - WMS CV Edukasi Pratama Insan Cemerlang

> Tahap awal **belum menggunakan database SQL**. Dokumen ini hanya rancangan
> struktur data untuk tahap berikutnya. Sumber data awal direncanakan
> menggunakan Google Spreadsheet yang diakses melalui API.

## Rancangan Entitas / Sheet

### 1. Master Barang (Item)
| Field | Keterangan |
|---|---|
| sku | Kode SKU unik (dasar scan/input operator) |
| nama_barang | Nama barang |
| satuan | Satuan qty (pcs, box, dll.) |
| aktif | Status barang aktif/nonaktif |

### 2. Receiving + QC (Stock In)
| Field | Keterangan |
|---|---|
| id | ID transaksi |
| tanggal | Tanggal receiving |
| sku | SKU barang |
| qty_receiving | Qty yang diterima dari supplier |
| qty_reject | Qty reject (robek/rusak) — **tidak masuk stock** |
| qty_lolos_qc | Qty lolos QC = qty_receiving - qty_reject → **STOCK IN** |
| supplier | Nama/kode supplier |
| user_email | Email user (untuk verifikasi, tahap berikutnya) |
| status_verifikasi | Status verifikasi email |

### 3. Stock Keluar / Pemesanan
| Field | Keterangan |
|---|---|
| id | ID transaksi |
| tanggal | Tanggal transaksi stock keluar/accrual |
| sku | SKU barang |
| qty | Qty keluar (mengurangi stock) |
| outlet | Outlet tujuan |
| sumber | Referensi data penyiapan dari Google Spreadsheet |

> Catatan: data penyiapan diinput di Google Spreadsheet, bukan via Web App.
> Loading/penyiapan tidak membuat transaksi pengurangan stock baru.

### 4. Persediaan (Stock)
Dihitung dari transaksi, bukan diinput manual:

```
stock = SUM(qty_lolos_qc dari Receiving+QC) - SUM(qty dari Stock Keluar)
```

### 5. Stock Opname
| Field | Keterangan |
|---|---|
| id | ID transaksi opname |
| tanggal | Tanggal opname |
| sku | SKU barang (scan/input) |
| qty_sistem | Stock menurut sistem saat opname |
| qty_fisik | Qty hasil hitung fisik |
| selisih | qty_fisik - qty_sistem |
| user_email | Email user (untuk verifikasi, tahap berikutnya) |
| status_verifikasi | Status verifikasi email |

### 6. User (tahap berikutnya)
| Field | Keterangan |
|---|---|
| email | Email user untuk verifikasi |
| nama | Nama user |
| peran | Peran (operator, admin, dll.) |
