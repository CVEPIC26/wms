// Test end-to-end logika backend receiving (mock Apps Script + spreadsheet).
// Menjalankan doGet/doPost nyata dari file .gs dengan spreadsheet in-memory.

'use strict';

const { loadGs, MockSpreadsheet, makeGetEvent, makePostEvent, outputJson } = require('./gs-runtime');

function makeSpreadsheet() {
  return new MockSpreadsheet({
    MASTER_SKU: [
      ['sku', 'nama_produk', 'status_aktif'],
      ['100050', 'Flash Card', 'YA'],
      ['100051', 'Buku Panduan Menulis', 'YA'],
      ['100052', 'Buku Panduan Ekspro PU', 'TIDAK']
    ],
    USERS: [
      ['email', 'nama', 'peran', 'status_aktif'],
      ['putrawidnyana70@gmail.com', 'Putra', 'operator', 'YA'],
      ['nonaktif@test.com', 'Non Aktif', 'operator', 'TIDAK']
    ],
    RECEIVING: [
      ['receiving_id', 'tanggal', 'supplier', 'nomor_po', 'user_email', 'status', 'created_at']
    ],
    RECEIVING_DETAIL: [
      ['receiving_id', 'sku', 'nama_produk', 'qty_diterima', 'qty_reject', 'qty_diterima_qc', 'alasan_reject', 'catatan']
    ],
    STOCK: [
      ['sku', 'nama_produk', 'qty_stock', 'updated_at'],
      ['100050', 'Flash Card', 5, '2026-08-01 08:00']
    ],
    STOCK_MOVEMENT: [
      ['movement_id', 'tanggal', 'sku', 'tipe_transaksi', 'qty', 'source', 'source_id', 'keterangan', 'user_email', 'created_at']
    ],
    STOCK_OPNAME: [['opname_id', 'tanggal', 'lokasi', 'user_email', 'status', 'created_at']],
    STOCK_OPNAME_DETAIL: [['opname_id', 'sku', 'system_qty', 'physical_qty', 'difference_qty', 'notes']],
    STOCK_ADJUSTMENT: [['adjustment_id', 'tanggal', 'sku', 'nama_produk', 'qty_adjustment', 'alasan', 'user_email', 'status', 'verified_by', 'created_at', 'verified_at']]
  });
}

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; failures.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

function sheetRows(sandbox, name) {
  return sandbox.SpreadsheetApp._ss.getSheetByName(name).rows;
}

function main() {
  const sandbox = loadGs(__dirname + '/../api');
  const ss = makeSpreadsheet();
  sandbox.SpreadsheetApp._ss = ss;

  const USER = 'putrawidnyana70@gmail.com';

  console.log('\n=== TEST 1: GET master_sku ===');
  let r = outputJson(sandbox.doGet(makeGetEvent({ action: 'master_sku' })));
  check('success=true', r.success === true);
  check('items berisi SKU 100050', Array.isArray(r.data.items) && r.data.items.some(i => i.sku === '100050'));

  console.log('\n=== TEST 2: GET receiving_list (awal kosong) ===');
  r = outputJson(sandbox.doGet(makeGetEvent({ action: 'receiving_list' })));
  check('success=true & items=[]', r.success === true && Array.isArray(r.data.items) && r.data.items.length === 0);

  console.log('\n=== TEST 3: POST receiving_create valid (2 item) ===');
  const payload = {
    tanggal: '2026-08-27',
    supplier: 'PT Sumber Makmur',
    nomor_po: 'PO-2026-001',
    user_email: USER,
    items: [
      { sku: '100050', qty_diterima: 10, qty_reject: 2, alasan_reject: 'Rusak', catatan: '' },
      { sku: '100051', qty_diterima: 5, qty_reject: 0, alasan_reject: '', catatan: 'ok' }
    ]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', payload)));
  check('success=true', r.success === true, JSON.stringify(r));
  check('status=DRAFT', r.data && r.data.status === 'DRAFT', JSON.stringify(r));
  check('jumlah_item=2', r.data && r.data.jumlah_item === 2);
  const rcvid = r.data && r.data.receiving_id;
  check('receiving_id format RCV-YYYYMMDD-NNN', /^RCV-\d{8}-\d{3}$/.test(rcvid || ''), rcvid);

  console.log('\n=== TEST 4: Spreadsheet state setelah create ===');
  const recRows = sheetRows(sandbox, 'RECEIVING');
  check('RECEIVING bertambah 1 row', recRows.length === 2);
  check('status di sheet = DRAFT', recRows[1][5] === 'DRAFT');
  const detRows = sheetRows(sandbox, 'RECEIVING_DETAIL');
  check('RECEIVING_DETAIL bertambah 2 row', detRows.length === 3);
  check('qty_diterima_qc baris1 = 8', detRows[1][5] === 8, 'got ' + detRows[1][5]);
  check('qty_diterima_qc baris2 = 5', detRows[2][5] === 5);
  const stockRows = sheetRows(sandbox, 'STOCK');
  check('STOCK tidak berubah (qty 5)', stockRows[1][2] === 5);
  const mvRows = sheetRows(sandbox, 'STOCK_MOVEMENT');
  check('STOCK_MOVEMENT tidak berubah (0)', mvRows.length === 1);

  console.log('\n=== TEST 5: receiving_submit ===');
  r = outputJson(sandbox.doPost(makePostEvent('receiving_submit', { receiving_id: rcvid, user_email: USER })));
  check('success=true', r.success === true);
  check('status=MENUNGGU_VERIFIKASI', r.data && r.data.status === 'MENUNGGU_VERIFIKASI');
  check('sheet status MENUNGGU_VERIFIKASI', sheetRows(sandbox, 'RECEIVING')[1][5] === 'MENUNGGU_VERIFIKASI');
  check('STOCK tetap (5)', sheetRows(sandbox, 'STOCK')[1][2] === 5);
  check('STOCK_MOVEMENT tetap (0)', sheetRows(sandbox, 'STOCK_MOVEMENT').length === 1);

  console.log('\n=== TEST 6: receiving_verify ===');
  r = outputJson(sandbox.doPost(makePostEvent('receiving_verify', { receiving_id: rcvid, user_email: USER })));
  check('success=true', r.success === true, JSON.stringify(r));
  check('status=TERVERIFIKASI', r.data && r.data.status === 'TERVERIFIKASI');
  check('movement_dibuat=2', r.data && r.data.movement_dibuat === 2);
  // STOCK: 100050 = 5 + 8 = 13 ; 100051 = 0 + 5 = 5
  const stockAfter = {};
  for (const row of sheetRows(sandbox, 'STOCK').slice(1)) stockAfter[row[0]] = row[2];
  check('STOCK 100050 = 13 (5+8)', stockAfter['100050'] === 13, 'got ' + stockAfter['100050']);
  check('STOCK 100051 = 5', stockAfter['100051'] === 5, 'got ' + stockAfter['100051']);
  const mvAfter = sheetRows(sandbox, 'STOCK_MOVEMENT');
  check('STOCK_MOVEMENT bertambah 2', mvAfter.length === 3);
  const mv1 = mvAfter[1];
  check('movement1 tipe=STOCK_IN', mv1[3] === 'STOCK_IN');
  check('movement1 source=RECEIVING', mv1[5] === 'RECEIVING');
  check('movement1 source_id=rcvid', mv1[6] === rcvid);
  check('movement1 qty=8', mv1[4] === 8);
  check('movement1 user_email=USER', mv1[8] === USER);

  console.log('\n=== TEST 7: verify dua kali (idempotency) ===');
  const stockBefore = sheetRows(sandbox, 'STOCK').map(r => r.slice());
  r = outputJson(sandbox.doPost(makePostEvent('receiving_verify', { receiving_id: rcvid, user_email: USER })));
  check('success=true (idempotent)', r.success === true);
  check('sudah_diproses=true', r.data && r.data.sudah_diproses === true, JSON.stringify(r.data));
  const stockAfter2 = sheetRows(sandbox, 'STOCK');
  check('STOCK tidak bertambah dua kali', JSON.stringify(stockBefore) === JSON.stringify(stockAfter2));
  check('STOCK_MOVEMENT tetap 3', sheetRows(sandbox, 'STOCK_MOVEMENT').length === 3);

  console.log('\n=== TEST 8: qty reject (10 diterima, 3 reject → QC 7) ===');
  const payload2 = {
    tanggal: '2026-08-27', supplier: 'PT Dua', nomor_po: 'PO-002', user_email: USER,
    items: [{ sku: '100050', qty_diterima: 10, qty_reject: 3, alasan_reject: 'Penyok', catatan: '' }]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', payload2)));
  check('create2 success', r.success === true, JSON.stringify(r));
  const rcvid2 = r.data.receiving_id;
  const det2 = sheetRows(sandbox, 'RECEIVING_DETAIL');
  check('qty_diterima_qc = 7', det2[det2.length - 1][5] === 7, 'got ' + det2[det2.length - 1][5]);
  r = outputJson(sandbox.doPost(makePostEvent('receiving_submit', { receiving_id: rcvid2, user_email: USER })));
  check('submit2 ok', r.success === true);
  r = outputJson(sandbox.doPost(makePostEvent('receiving_verify', { receiving_id: rcvid2, user_email: USER })));
  check('verify2 ok', r.success === true, JSON.stringify(r));
  check('movement_dibuat=1', r.data.movement_dibuat === 1);
  const mvLast = sheetRows(sandbox, 'STOCK_MOVEMENT');
  check('movement qty = 7', mvLast[mvLast.length - 1][4] === 7, 'got ' + mvLast[mvLast.length - 1][4]);
  const stockFinal = {};
  for (const row of sheetRows(sandbox, 'STOCK').slice(1)) stockFinal[row[0]] = row[2];
  check('STOCK 100050 = 20 (13+7)', stockFinal['100050'] === 20, 'got ' + stockFinal['100050']);

  console.log('\n=== TEST 9: invalid SKU ditolak ===');
  const badSku = {
    tanggal: '2026-08-27', supplier: 'PT X', nomor_po: 'PO-9', user_email: USER,
    items: [{ sku: '999999', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' }]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', badSku)));
  check('success=false', r.success === false);
  check('error_code=SKU_NOT_FOUND', r.error_code === 'SKU_NOT_FOUND', JSON.stringify(r));
  check('tidak ada baris baru', sheetRows(sandbox, 'RECEIVING').length === 3);

  console.log('\n=== TEST 9b: SKU tidak aktif ditolak ===');
  const inactiveSku = {
    tanggal: '2026-08-27', supplier: 'PT X', nomor_po: 'PO-9b', user_email: USER,
    items: [{ sku: '100052', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' }]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', inactiveSku)));
  check('success=false', r.success === false);
  check('error_code=SKU_INACTIVE', r.error_code === 'SKU_INACTIVE', JSON.stringify(r));

  console.log('\n=== TEST 10: user tidak aktif ditolak ===');
  const badUser = {
    tanggal: '2026-08-27', supplier: 'PT X', nomor_po: 'PO-10', user_email: 'nonaktif@test.com',
    items: [{ sku: '100050', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' }]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', badUser)));
  check('success=false', r.success === false);
  check('error_code=USER_INACTIVE', r.error_code === 'USER_INACTIVE', JSON.stringify(r));

  console.log('\n=== TEST 10b: user tidak terdaftar ditolak ===');
  const noUser = {
    tanggal: '2026-08-27', supplier: 'PT X', nomor_po: 'PO-10b', user_email: 'ghost@test.com',
    items: [{ sku: '100050', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' }]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', noUser)));
  check('success=false', r.success === false);
  check('error_code=USER_NOT_FOUND', r.error_code === 'USER_NOT_FOUND', JSON.stringify(r));

  console.log('\n=== TEST 11: qty reject > qty diterima ditolak ===');
  const badQty = {
    tanggal: '2026-08-27', supplier: 'PT X', nomor_po: 'PO-11', user_email: USER,
    items: [{ sku: '100050', qty_diterima: 5, qty_reject: 6, alasan_reject: 'x', catatan: '' }]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', badQty)));
  check('success=false', r.success === false);
  check('error_code=VALIDATION_ERROR', r.error_code === 'VALIDATION_ERROR', JSON.stringify(r));

  console.log('\n=== TEST 11b: reject>0 tanpa alasan ditolak ===');
  const noReason = {
    tanggal: '2026-08-27', supplier: 'PT X', nomor_po: 'PO-11b', user_email: USER,
    items: [{ sku: '100050', qty_diterima: 5, qty_reject: 1, alasan_reject: '', catatan: '' }]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', noReason)));
  check('success=false', r.success === false, JSON.stringify(r));

  console.log('\n=== TEST 12: double submit (submit 2x) ===');
  const payload3 = {
    tanggal: '2026-08-27', supplier: 'PT Tiga', nomor_po: 'PO-12', user_email: USER,
    items: [{ sku: '100050', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' }]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', payload3)));
  const rcvid3 = r.data.receiving_id;
  r = outputJson(sandbox.doPost(makePostEvent('receiving_submit', { receiving_id: rcvid3, user_email: USER })));
  check('submit3a ok', r.success === true);
  r = outputJson(sandbox.doPost(makePostEvent('receiving_submit', { receiving_id: rcvid3, user_email: USER })));
  check('submit3b ditolak INVALID_STATUS', r.success === false && r.error_code === 'INVALID_STATUS', JSON.stringify(r));
  r = outputJson(sandbox.doPost(makePostEvent('receiving_verify', { receiving_id: rcvid3, user_email: USER })));
  check('verify3 ok', r.success === true);
  r = outputJson(sandbox.doPost(makePostEvent('receiving_verify', { receiving_id: rcvid3, user_email: USER })));
  check('verify3 kedua idempotent (sudah_diproses)', r.data && r.data.sudah_diproses === true);
  const mvCount = sheetRows(sandbox, 'STOCK_MOVEMENT').length - 1;
  // total movement: 2 (rcv1) + 1 (rcv2) + 1 (rcv3) = 4
  check('total movement = 4 (tidak dobel)', mvCount === 4, 'got ' + mvCount);

  console.log('\n=== TEST 13: body kosong / non-JSON (parsePostBody) ===');
  r = outputJson(sandbox.doPost({ parameter: { action: 'receiving_create' }, postData: { contents: '' } }));
  check('body kosong → VALIDATION_ERROR', r.success === false && r.error_code === 'VALIDATION_ERROR', JSON.stringify(r));
  r = outputJson(sandbox.doPost({ parameter: { action: 'receiving_create' }, postData: { contents: 'not-json' } }));
  check('non-JSON → VALIDATION_ERROR', r.success === false && r.error_code === 'VALIDATION_ERROR', JSON.stringify(r));

  console.log('\n=== TEST 14: rollback saat detail gagal (header tidak tertinggal) ===');
  const beforeRows = sheetRows(sandbox, 'RECEIVING').length;
  const mixedPayload = {
    tanggal: '2026-08-27', supplier: 'PT R', nomor_po: 'PO-14', user_email: USER,
    items: [
      { sku: '100050', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' },
      { sku: '999999', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' }
    ]
  };
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', mixedPayload)));
  check('mixed ditolak', r.success === false);
  check('tidak ada baris header tersisa', sheetRows(sandbox, 'RECEIVING').length === beforeRows);

  console.log('\n=== TEST 15: ID unik untuk 2 receiving di hari sama ===');
  const a = outputJson(sandbox.doPost(makePostEvent('receiving_create', {
    tanggal: '2026-08-27', supplier: 'PT A', nomor_po: 'PO-A', user_email: USER,
    items: [{ sku: '100050', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' }]
  })));
  const b = outputJson(sandbox.doPost(makePostEvent('receiving_create', {
    tanggal: '2026-08-27', supplier: 'PT B', nomor_po: 'PO-B', user_email: USER,
    items: [{ sku: '100050', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' }]
  })));
  check('ID A != ID B', a.data.receiving_id !== b.data.receiving_id, a.data.receiving_id + ' vs ' + b.data.receiving_id);

  console.log('\n=== TEST 16: GET receiving_get ===');
  r = outputJson(sandbox.doGet(makeGetEvent({ action: 'receiving_get', receiving_id: rcvid })));
  check('success=true', r.success === true);
  check('items 2 baris', r.data.items.length === 2);
  check('nama_produk dari MASTER_SKU', r.data.items[0].nama_produk === 'Flash Card');

  console.log('\n=== TEST 17: POST body via postData (root cause fix) ===');
  // Simulasi event nyata Apps Script: postData.contents berisi JSON.
  r = outputJson(sandbox.doPost(makePostEvent('receiving_create', {
    tanggal: '2026-08-27', supplier: 'PT Fix', nomor_po: 'PO-FIX', user_email: USER,
    items: [{ sku: '100050', qty_diterima: 1, qty_reject: 0, alasan_reject: '', catatan: '' }]
  })));
  check('receiving_create via postData sukses', r.success === true, JSON.stringify(r));

  console.log('\n========================================');
  console.log('PASS: ' + passed + '  FAIL: ' + failed);
  if (failures.length) { console.log('FAILURES:\n - ' + failures.join('\n - ')); process.exit(1); }
  console.log('ALL TESTS PASSED');
}

main();