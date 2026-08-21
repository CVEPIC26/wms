# Business Process - WMS CV Edukasi Pratama Insan Cemerlang

## Alur Proses Utama

```
SUPPLIER
→ RECEIVING + QC
→ PERSEDIAAN
→ STOCK KELUAR / PEMESANAN
→ LOADING / PENYIAPAN
→ OUTLET
```

```
PERSEDIAAN
→ STOCK OPNAME
```

## Penjelasan Tiap Proses

### 1. Supplier
Barang datang dari supplier ke gudang.

### 2. Receiving + QC
- Receiving dan QC adalah **satu proses** pada Web App (bukan dua langkah terpisah).
- Operator melakukan **scan/input berdasarkan SKU**.
- **Qty receiving dicatat** pada saat penerimaan.
- QC hanya **pemeriksaan ringan**, fokus pada:
  - Kesesuaian qty (jumlah yang diterima vs yang seharusnya).
  - Barang reject, misalnya robek atau rusak.
- **Qty reject tidak masuk stock.**
- **Qty yang lolos QC menjadi STOCK IN** dan menambah persediaan.
- Transaksi ini nantinya membutuhkan **verifikasi email user** (belum diimplementasikan).

### 3. Persediaan
- Stock persediaan = akumulasi STOCK IN (qty lolos QC) dikurangi stock keluar.
- Persediaan juga menjadi objek stock opname.

### 4. Stock Keluar / Pemesanan
- Stock keluar **berasal dari data penyiapan yang sudah ada di Google Spreadsheet**.
- Penyiapan **tidak diinput melalui Web App**.
- Stock berkurang berdasarkan **transaksi stock keluar/accrual**.

### 5. Loading / Penyiapan
- Proses penyiapan barang untuk dikirim ke outlet.
- **Loading tidak mengurangi stock lagi** (stock sudah berkurang saat transaksi stock keluar).

### 6. Outlet
Barang diterima oleh outlet (tujuan akhir distribusi).

### 7. Stock Opname
- Dilakukan **melalui Web App** dengan **scan/input SKU**.
- Digunakan untuk mencocokkan stock fisik dengan stock sistem.
- Nantinya membutuhkan **verifikasi email user** (belum diimplementasikan).

## Ringkasan Ketentuan Bisnis

| Aturan | Keterangan |
|---|---|
| Receiving + QC | Satu proses di Web App |
| Input operator | Scan/input berdasarkan SKU |
| Qty receiving | Dicatat saat penerimaan |
| QC | Pemeriksaan ringan: kesesuaian qty & barang reject (robek/rusak) |
| Qty reject | Tidak masuk stock |
| Qty lolos QC | Menjadi STOCK IN |
| Sumber stock keluar | Data penyiapan di Google Spreadsheet |
| Input penyiapan | Tidak melalui Web App |
| Pengurangan stock | Berdasarkan transaksi stock keluar/accrual |
| Loading | Tidak mengurangi stock lagi |
| Stock opname | Via Web App, scan/input SKU |
| Verifikasi email | Diperlukan untuk Receiving/QC dan Stock Opname (tahap berikutnya) |
