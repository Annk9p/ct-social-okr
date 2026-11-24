// Minimal Google Apps Script mock for running apps-script/*.gs in Node (tests only).
const fs = require('fs'), crypto = require('crypto'), cp = require('child_process'), os = require('os'), path = require('path'), vm = require('vm');
function makeEnv() {
  const props = {}, cache = {}, sheets = {}, folders = {}, triggers = [], mails = [];
  let idn = 0; const nid = p => p + (++idn);
  class Range { constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    setValues(v) { for (let i = 0; i < this.nr; i++) { this.sh.rows[this.r - 1 + i] = this.sh.rows[this.r - 1 + i] || []; for (let j = 0; j < this.nc; j++) this.sh.rows[this.r - 1 + i][this.c - 1 + j] = v[i][j]; } return this; }
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i] || []; const x = []; for (let j = 0; j < this.nc; j++) x.push(row[this.c - 1 + j] ?? ''); o.push(x); } return o; }
    clearContent() { for (let i = 0; i < this.nr; i++) { const row = this.sh.rows[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; } return this; }
    setFontWeight() { return this; } setNumberFormat() { return this; } }
  class Sheet { constructor(n) { this.name = n; this.rows = []; this.max = 1000; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    getLastRow() { let l = 0; this.rows.forEach((r, i) => { if (r && r.some(v => v !== '' && v != null)) l = i + 1; }); return l; }
    getMaxRows() { return this.max; } insertRowsAfter(a, n) { this.max += n; } setFrozenRows() {}
    appendRow(v) { this.rows[this.getLastRow()] = v.slice(); } deleteRows(s, n) { this.rows.splice(s - 1, n); } }
  const ss = { getId: () => 'SHEET', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets), deleteSheet() {} };
  const blob = (bytes, type, name) => ({ bytes: Buffer.from(bytes), getName: () => name, getContentType: () => type, getDataAsString: () => Buffer.from(bytes).toString('utf8'), getBytes: () => typeof bytes === 'string' ? [...Buffer.from(bytes, 'utf8')] : bytes });
  const mkFolder = name => { const id = nid('fold'); const f = { id, name, files: [], getId: () => id, getUrl: () => 'https://drive/' + id, createFolder: n => mkFolder(n),
    getFiles() { let i = 0; const l = f.files.slice(); return { hasNext: () => i < l.length, next: () => l[i++] }; },
    createFile(b) { const fid = nid('file'), t = new Date(Date.now() + idn); const file = { getId: () => fid, getName: () => b.getName(), getUrl: () => 'https://drive/' + fid, getBlob: () => b, getLastUpdated: () => t, getDateCreated: () => t }; f.files.push(file); return file; } };
    folders[id] = f; return f; };
  const ctx = {
    console, JSON, Math, Date, String, Number, Object, Array, Error, isFinite, encodeURIComponent, RegExp, parseInt, parseFloat, isNaN,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, getProperties: () => ({ ...props }), setProperty: (k, v) => { props[k] = String(v); }, setProperties: o => Object.entries(o).forEach(([k, v]) => props[k] = String(v)), deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
    SpreadsheetApp: { getActive: () => ss, openById: () => ss, getUi: () => { throw new Error('no ui in web context'); } },
    DriveApp: { getFolderById: id => { if (!folders[id]) throw new Error('No item with the given ID could be found'); return folders[id]; }, createFolder: n => mkFolder(n) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()],
      base64Encode: b => Buffer.from(b).toString('base64'), base64Decode: s => [...Buffer.from(s, 'base64')],
      getUuid: () => crypto.randomUUID(), newBlob: blob,
      formatDate: (d, tz, f) => { const z = new Date(d.getTime() + (tz === 'UTC' ? 0 : 7 * 3600e3)).toISOString(); return f === 'yyyy-MM' ? z.slice(0, 7) : f === 'yyyy-MM-dd' ? z.slice(0, 10) : z.slice(0, 10) + ' ' + z.slice(11, 16); },
      unzip: b => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'z')); fs.writeFileSync(dir + '/a.zip', b.bytes); cp.execSync('unzip -qq -o a.zip -d out', { cwd: dir });
        const out = []; const walk = d => fs.readdirSync(d).forEach(n => { const p = d + '/' + n; if (fs.statSync(p).isDirectory()) walk(p); else out.push(blob(fs.readFileSync(p), 'text/csv', n)); }); walk(dir + '/out'); return out; },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; } }) },
    HtmlService: { createHtmlOutput: h => ({ html: h, setTitle() { return this; } }) },
    ScriptApp: { getOAuthToken: () => 'TOKEN', getProjectTriggers: () => triggers, deleteTrigger(t) { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: h => ({ timeBased: () => ({ after: () => ({ create: () => triggers.push({ getHandlerFunction: () => h }) }), atHour: () => ({ everyDays: () => ({ inTimezone: () => ({ create() {} }) }) }), everyHours: () => ({ create: () => triggers.push({ getHandlerFunction: () => h }) }) }) }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@test' }) }, MailApp: { sendEmail: (...a) => mails.push(a) },
    UrlFetchApp: { fetch: () => { throw new Error('no network in test'); } },
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'apps-script');
  for (const f of ['TikTok.gs', 'YouTube.gs', 'Code.gs']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8').replace(/if \(typeof module[^\n]*\n?/, ''), ctx, { filename: f });
  return { ctx, props, cache, sheets, folders, mails };
}
module.exports = { makeEnv };
