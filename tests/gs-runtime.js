// Mock runtime Google Apps Script untuk menguji logika backend WMS (.gs)
// tanpa akses nyata ke spreadsheet/Apps Script.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

class MockSheet {
  constructor(name, rows) {
    this.name = name;
    this.rows = rows.map(r => r.slice());
  }
  getDataRange() {
    const self = this;
    return { getValues: () => self.rows.map(r => r.slice()) };
  }
  getRange(row, col, rows, cols) {
    const self = this;
    const startRow = row - 1;
    if (rows && cols) {
      return {
        setValues(vals) {
          for (let i = 0; i < vals.length; i++) {
            self.rows[startRow + i] = self.rows[startRow + i] || [];
            for (let c = 0; c < vals[i].length; c++) {
              self.rows[startRow + i][col - 1 + c] = vals[i][c];
            }
          }
        }
      };
    }
    return {
      setValue(v) {
        self.rows[startRow] = self.rows[startRow] || [];
        self.rows[startRow][col - 1] = v;
      }
    };
  }
  getLastRow() { return this.rows.length; }
  appendRow(arr) { this.rows.push(arr.slice()); return this.rows.length; }
  deleteRow(row) { this.rows.splice(row - 1, 1); }
  deleteRows(startRow, numRows) { this.rows.splice(startRow - 1, numRows); }
}

class MockSpreadsheet {
  constructor(sheets) {
    this.sheetMap = new Map();
    for (const [name, rows] of Object.entries(sheets)) {
      this.sheetMap.set(name, new MockSheet(name, rows));
    }
  }
  getSheetByName(name) { return this.sheetMap.get(name) || null; }
}

const GAS = {
  SpreadsheetApp: {
    openById(id) { return this._ss; },
    getActiveSpreadsheet() { return this._ss; }
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(content) {
      const o = { _content: String(content), _mime: null };
      o.setMimeType = function (m) { this._mime = m; return this; };
      o.getContent = function () { return this._content; };
      return o;
    }
  },
  LockService: {
    getScriptLock() {
      return {
        tryLock() { if (!GAS.__lock) { GAS.__lock = true; return true; } return false; },
        releaseLock() { GAS.__lock = false; }
      };
    }
  },
  Utilities: {
    formatDate(date, tz, fmt) {
      const pad = (n, w) => String(n).padStart(w, '0');
      return fmt
        .replace(/yyyy/g, String(date.getFullYear()))
        .replace(/MM/g, pad(date.getMonth() + 1, 2))
        .replace(/dd/g, pad(date.getDate(), 2))
        .replace(/HH/g, pad(date.getHours(), 2))
        .replace(/mm/g, pad(date.getMinutes(), 2));
    }
  },
  Logger: { log() {} },
  __lock: false
};

function loadGs(apiDir) {
  const files = [
    'Config.gs', 'Response.gs', 'Validation.gs',
    'MasterSkuService.gs', 'UserService.gs', 'MovementService.gs',
    'StockService.gs', 'ReceivingService.gs', 'Code.gs'
  ];
  let src = '';
  for (const f of files) {
    src += '\n' + fs.readFileSync(path.join(apiDir, f), 'utf8');
  }
  const sandbox = {
    SpreadsheetApp: GAS.SpreadsheetApp,
    ContentService: GAS.ContentService,
    LockService: GAS.LockService,
    Utilities: GAS.Utilities,
    Logger: GAS.Logger,
    console,
    Date, Math, JSON, String, Number, Array, Object, Error,
    parseInt, isNaN, isFinite,
    require
  };
  sandbox.global = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: 'wms-backend.js' });
  return sandbox;
}

const makeGetEvent = (params) => ({ parameter: params || {} });
const makePostEvent = (action, payload) => ({
  parameter: { action },
  postData: { contents: JSON.stringify(payload) }
});
const outputJson = (out) => JSON.parse(out.getContent());

module.exports = { loadGs, MockSpreadsheet, makeGetEvent, makePostEvent, outputJson };