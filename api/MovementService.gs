/**
 * MovementService.gs
 * Mengelola sheet STOCK_MOVEMENT (append-only).
 * Baris tidak pernah diedit atau dihapus — koreksi dilakukan lewat
 * movement baru.
 */

/**
 * Cek idempotency: apakah movement untuk kombinasi
 * source + source_id + sku sudah ada.
 */
function movementExists_(source, sourceId, sku) {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_MOVEMENT);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][5]).trim() === source &&
        String(values[i][6]).trim() === sourceId &&
        String(values[i][2]).trim() === sku) {
      return true;
    }
  }
  return false;
}

/**
 * Membuat satu baris STOCK_MOVEMENT di baris paling bawah (append).
 */
function createMovement_(movement) {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_MOVEMENT);
  sheet.appendRow([
    movement.movement_id,
    movement.tanggal,
    movement.sku,
    movement.tipe_transaksi,
    movement.qty,
    movement.source,
    movement.source_id,
    movement.keterangan || '',
    movement.user_email,
    movement.created_at
  ]);
  return movement;
}

function nextMovementId_() {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_MOVEMENT);
  var count = sheet.getLastRow(); // header + data
  var seq = ('0000' + count).slice(-4);
  return 'MV-' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd') + '-' + seq;
}
