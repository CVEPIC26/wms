// Test end-to-end backend read-only reader spreadsheet eksternal PENYIAPAN
// (GET ?action=penyiapan). Menjalankan doGet nyata dengan spreadsheet
// eksternal in-memory via mock Apps Script.

'use strict';

const { loadGs, MockSpreadsheet, makeGetEvent, outputJson } = require('./gs-runtime');

const EXT_ID = 'external-penyiapan-001';

// Header aktual sheet PENYIAPAN eksternal.
const HEADER = [
  'Tanggal', 'Nomor PO', 'Outlet', 'Tipe Modul', 'Kuantitas',
  'Total Harga (Rp)', 'Helper', 'Status', 'Keterangan', 'Pengambilan'
];

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

function sheetRows(ss, name) {
  const sh = ss.getSheetByName(name);
  return sh ? sh.rows : [];
}

function main() {
  const sandbox = loadGs(__dirname + '/../api');

  // Spreadsheet database utama WMS.
  const mainDB = new MockSpreadsheet({
    MASTER_SKU: [['sku', 'nama_produk', 'status_aktif'], ['100050', 'Flash Card', 'YA']],
    USERS: [['email', 'nama', 'peran', 'status_aktif']],
    RECEIVING: [['receiving_id', 'tanggal', 'supplier', 'nomor_po', 'user_email', 'status', 'created_at']],
    RECEIVING_DETAIL: [['receiving_id', 'sku', 'nama_produk', 'qty_diterima', 'qty_reject', 'qty_diterima_qc', 'alasan_reject', 'catatan']],
    STOCK: [['sku', 'nama_produk', 'qty_stock', 'updated_at']],
    STOCK_MOVEMENT: [['movement_id', 'tanggal', 'sku', 'tipe_transaksi', 'qty', 'source', 'source_id', 'keterangan', 'user_email', 'created_at']]
  });
  mainDB._id = 'main-db';
  sandbox.SpreadsheetApp._ss = mainDB;

  // Daftar spreadsheet eksternal yang dikenal.
  const ext = {};
  sandbox.SpreadsheetApp._ext = ext;
  const setExt = (rows) => { ext[EXT_ID] = new MockSpreadsheet({ PENYIAPAN: rows }, EXT_ID); };
  const setExternalAny = (id, rows, sheetName) => { ext[id] = new MockSpreadsheet({ [sheetName || 'PENYIAPAN']: rows }, id); };

  sandbox.CONFIG.EXTERNAL_SPREADSHEET_ID = EXT_ID;
  const makeExtRows = (extra) => {
    const rows = [HEADER.slice()];
    for (const row of (extra || [])) rows.push(row);
    return rows;
  };

  console.log('\n=== TEST 1 & 2: spreadsheet & sheet ditemukan, data terbaca ===');
  const rows1 = makeExtRows([
    ['2 Juni 2026', 'PR-00020522', 'Anemone Kalasan Sleman', 'Tas Anemone Desain Baru', 15, 975000, 'Tas Anemone Desain Baru', 'Done', '', 'Expedisi'],
    ['2 Juni 2026', 'PR-00020522', 'Anemone Kalasan Sleman', 'Modul Membaca Level 1.1', 10, 140000, 'Modul Membaca Level 1.1', 'Done', '', 'Expedisi'],
    ['2 Juni 2026', 'PR-00020522', 'Anemone Kalasan Sleman', 'Modul Membaca Level 1.2', 5, 70000, 'Modul Membaca Level 1.2', 'Done', '', 'Expedisi']
  ]);
  setExt(rows1);
  let r = outputJson(sandbox.doGet(makeGetEvent({ action: 'penyiapan' })));
  check('success=true', r.success === true, JSON.stringify(r));
  check('sheet = PENYIAPAN', r.data && r.data.sheet === 'PENYIAPAN');
  check('total_data = 3', r.data && r.data.total_data === 3, 'got ' + (r.data && r.data.total_data));
  check('tipe_modul item0 = "Tas Anemone Desain Baru"', r.data.items[0].tipe_modul === 'Tas Anemone Desain Baru');
  check('tipe_modul TIDAK di-map ke SKU', r.data.items[0].tipe_modul !== '100050');

  console.log('\n=== TEST 4: mapping header ===');
  const it = r.data.items[0];
  check('tanggal → "2026-06-02"', it.tanggal === '2026-06-02', 'got ' + JSON.stringify(it.tanggal));
  check('nomor_po', it.nomor_po === 'PR-00020522');
  check('outlet', it.outlet === 'Anemone Kalasan Sleman');
  check('kuantitas = 15 (number)', it.kuantitas === 15 && typeof it.kuantitas === 'number');
  check('total_harga = 975000 (number)', it.total_harga === 975000 && typeof it.total_harga === 'number');
  check('helper', it.helper === 'Tas Anemone Desain Baru');
  check('status', it.status === 'Done');
  check('keterangan kosong', it.keterangan === '');
  check('pengambilan', it.pengambilan === 'Expedisi');
  check('item2 tipe_modul = "Modul Membaca Level 1.1"', r.data.items[1].tipe_modul === 'Modul Membaca Level 1.1');

  console.log('\n=== TEST 5: empty row dilewati ===');
  const rowsEmpty = makeExtRows([
    ['3 Juni 2026', 'PR-001', 'Outlet A', 'Modul X', 2, 100, 'Helper A', 'Done', '', 'Expedisi'],
    ['', '', '', '', '', '', '', '', '', ''],
    ['4 Juni 2026', 'PR-002', 'Outlet B', 'Modul Y', 3, 200, 'Helper B', 'Done', '', 'Expedisi']
  ]);
  setExt(rowsEmpty);
  r = outputJson(sandbox.doGet(makeGetEvent({ action: 'penyiapan' })));
  check('total_data = 2 (baris kosong dilewati)', r.data && r.data.total_data === 2, 'got ' + (r.data && r.data.total_data));
  check('item0 tanggal "2026-06-03"', r.data.items[0].tanggal === '2026-06-03', 'got ' + r.data.items[0].tanggal);

  console.log('\n=== TEST 4b: variasi tanggal & angka-string ===');
  const rowsTgl = makeExtRows([
    ['2026-06-02', 'PO-A', 'Out A', 'M1', 3, 100, 'H', 'Done', '', 'Ex'],
    ['02 Juni 2026', 'PO-B', 'Out B', 'M2', '7', '7000', 'H', 'Done', '', 'Ex'],
    ['Juni 3, 2026', 'PO-C', 'Out C', 'M3', 8, 8000, 'H', 'Done', '', 'Ex'],
    [new Date(2026, 5, 4), 'PO-D', 'Out D', 'M4', 9, 9000, 'H', 'Done', '', 'Ex']
  ]);
  setExt(rowsTgl);
  r = outputJson(sandbox.doGet(makeGetEvent({ action: 'penyiapan' })));
  check('total_data = 4', r.data && r.data.total_data === 4, 'got ' + (r.data && r.data.total_data));
  check('tgl1 (YYYY-MM-DD) "2026-06-02"', r.data.items[0].tanggal === '2026-06-02', 'got ' + r.data.items[0].tanggal);
  check('tgl2 string "02 Juni 2026" → "2026-06-02", kuantitas 7', r.data.items[1].tanggal === '2026-06-02' && r.data.items[1].kuantitas === 7, JSON.stringify(r.data.items[1]));
  check('tgl3 "Juni 3, 2026" → "2026-06-03"', r.data.items[2].tanggal === '2026-06-03', 'got ' + r.data.items[2].tanggal);
  check('tgl4 (Date) "2026-06-04"', r.data.items[3].tanggal === '2026-06-04', 'got ' + JSON.stringify(r.data.items[3].tanggal));

  console.log('\n=== TEST 6: invalid Spreadsheet ID → PENYIAPAN_SPREADSHEET_NOT_FOUND ===');
  sandbox.CONFIG.EXTERNAL_SPREADSHEET_ID = 'tidak-ada-id';
  r = outputJson(sandbox.doGet(makeGetEvent({ action: 'penyiapan' })));
  check('success=false', r.success === false);
  check('error_code = PENYIAPAN_SPREADSHEET_NOT_FOUND', r.error_code === 'PENYIAPAN_SPREADSHEET_NOT_FOUND', JSON.stringify(r));

  console.log('\n=== TEST 7: sheet PENYIAPAN hilang → PENYIAPAN_SHEET_NOT_FOUND ===');
  sandbox.CONFIG.EXTERNAL_SPREADSHEET_ID = EXT_ID;
  setExternalAny(EXT_ID, [], 'SALAH');
  r = outputJson(sandbox.doGet(makeGetEvent({ action: 'penyiapan' })));
  check('success=false', r.success === false);
  check('error_code = PENYIAPAN_SHEET_NOT_FOUND', r.error_code === 'PENYIAPAN_SHEET_NOT_FOUND', JSON.stringify(r));

  console.log('\n=== TEST 8: header tidak valid → PENYIAPAN_HEADER_INVALID ===');
  const badHeader = makeExtRows([]);
  badHeader[0] = badHeader[0].slice();
  badHeader[0][9] = 'Pengiriman'; // ganti Pengambilan → Pengiriman
  setExt(badHeader);
  r = outputJson(sandbox.doGet(makeGetEvent({ action: 'penyiapan' })));
  check('success=false', r.success === false);
  check('error_code = PENYIAPAN_HEADER_INVALID', r.error_code === 'PENYIAPAN_HEADER_INVALID', JSON.stringify(r));

  console.log('\n=== TEST 9: regression STEP 5A + STOCK/STOCK_MOVEMENT tidak tersentuh ===');
  sandbox.CONFIG.EXTERNAL_SPREADSHEET_ID = EXT_ID;
  setExt(rows1);
  let m = outputJson(sandbox.doGet(makeGetEvent({ action: 'master_sku' })));
  check('master_sku tetap PASS', m.success === true && m.data.items.some(i => i.sku === '100050'));
  let rl = outputJson(sandbox.doGet(makeGetEvent({ action: 'receiving_list' })));
  check('receiving_list tetap PASS', rl.success === true && Array.isArray(rl.data.items));
  // STEP 5A preparation_list: membaca via CONFIG.PENYIAPAN (sheet eksternal
  // dengan kolom penyiapan_id/sku/qty). Gunakan sheet yang sesuai untuk
  // memastikan routing & service lama masih berfungsi.
  const prepExt = new MockSpreadsheet({
    PENYIAPAN: [['penyiapan_id', 'sku', 'qty', 'status'], ['PR-1', '100050', 3, 'SIAP']]
  }, 'prep-ext');
  prepExt._id = 'prep-ext';
  // Tunjuk CONFIG.PENYIAPAN.SPREADSHEET_ID ke spreadsheet itu.
  sandbox.CONFIG.PENYIAPAN = {
    SPREADSHEET_ID: 'prep-ext',
    SHEET_NAME: 'PENYIAPAN',
    HEADERS: { ID: 'penyiapan_id', SKU: 'sku', QTY: 'qty', STATUS: 'status' },
    STATUS_SIAP: ['SIAP', 'READY', 'MENUNGGU']
  };
  ext['prep-ext'] = prepExt;
  let pl = outputJson(sandbox.doGet(makeGetEvent({ action: 'preparation_list' })));
  check('preparation_list tetap PASS', pl.success === true && Array.isArray(pl.data.items), JSON.stringify(pl));
  // STOCK dan STOCK_MOVEMENT database utama tidak boleh berubah hanya karena
  // membaca PENYIAPAN (tetap 1 baris = header).
  check('STOCK utama tidak berubah', sheetRows(mainDB, 'STOCK').length === 1);
  check('STOCK_MOVEMENT utama tidak berubah', sheetRows(mainDB, 'STOCK_MOVEMENT').length === 1);

  console.log('\n========================================');
  console.log('PASS: ' + passed + '  FAIL: ' + failed);
  if (failures.length) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('ALL TESTS PASSED');
}

main();