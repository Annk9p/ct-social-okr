/**
 * TikTok Studio export parsing (pure JavaScript, no Apps Script services).
 * Kept separate so it can be tested outside Apps Script.
 *
 * Recognised files (Thai or English export):
 *   overview  : Date / Video Views / Profile Views / Likes / Comments / Shares
 *               or business export วันที่ / ยอดเข้าชมวิดีโอ / ... / การเติบโตสุทธิ
 *   videos    : ชื่อวิดีโอ / ลิงก์วิดีโอ / เวลาโพสต์ / ยอดเข้าชมวิดีโอ / ถูกใจ / ความคิดเห็น / แชร์ / เพิ่มลงในรายการโปรด
 *               or English Content export: Video title / Video link / Post time / Total views ...
 *   fhistory  : Date / Followers / Difference in followers from previous day
 *   factivity : Date / Hour / Active followers
 *   fgender   : Gender / Distribution
 *   fterr     : Top territories / Distribution
 */

var TT_HANDLES = { eloopth: 'tt-eloop', moovthailand: 'tt-moov' };

var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
var EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function ttParseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  var rows = [], row = [], f = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); if (row.some(function (x) { return x !== ''; })) rows.push(row); row = []; f = '';
    } else f += c;
  }
  row.push(f); if (row.some(function (x) { return x !== ''; })) rows.push(row);
  return rows;
}

function ttNum(v) { var n = Number(String(v == null ? '' : v).replace(/,/g, '').trim()); return isFinite(n) ? n : 0; }
function ttPad(n) { return (n < 10 ? '0' : '') + n; }

/** Year/month hints from a file name such as ภาพรวม(2026_10_01-2026_10_31).csv or Overview_2026-10-01_1793428910_eloopth.zip */
function ttHintsFromName(name) {
  var h = {};
  var m = String(name).match(/(20\d\d)[_-](\d\d)[_-](\d\d)/);
  if (m) { h.year = +m[1]; h.month = +m[2]; }
  var low = String(name).toLowerCase();
  Object.keys(TT_HANDLES).forEach(function (k) { if (low.indexOf(k) >= 0) h.account = TT_HANDLES[k]; });
  if (!h.account && /moov/.test(low)) h.account = 'tt-moov';
  if (!h.account && /eloop/.test(low)) h.account = 'tt-eloop';
  return h;
}

/**
 * Turn a date cell into yyyy-mm-dd.
 * ctx.year: year from the file name, ctx.fileDate: Date the file was created (fallback for exports without a year).
 */
function ttDate(s, ctx) {
  s = String(s).trim();
  var m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) return m[1] + '-' + ttPad(+m[2]) + '-' + ttPad(+m[3]);
  var day = null, mon = -1;
  m = s.match(/^(\d{1,2})\s+(\S+)/);
  if (m) { day = +m[1]; mon = TH_MONTHS.indexOf(m[2]); if (mon < 0) mon = EN_MONTHS.indexOf(m[2].toLowerCase()); }
  if (mon < 0) {
    m = s.match(/^([A-Za-z]+)\s+(\d{1,2})/);
    if (m) { mon = EN_MONTHS.indexOf(m[1].toLowerCase()); day = +m[2]; }
  }
  if (mon < 0 || !day) return null;
  var year = ctx && ctx.year;
  if (!year) {
    var fd = (ctx && ctx.fileDate) || new Date();
    year = fd.getFullYear();
    if (mon > fd.getMonth()) year -= 1; // e.g. a December row in a file exported in January
  }
  return year + '-' + ttPad(mon + 1) + '-' + ttPad(day);
}

/** yyyy-mm-dd hh:mm from "2026/10/07 05:30:00" or an English "August 30" */
function ttDateTime(s, ctx) {
  s = String(s).trim();
  var m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return m[1] + '-' + ttPad(+m[2]) + '-' + ttPad(+m[3]) + ' ' + ttPad(+(m[4] || 0)) + ':' + (m[5] || '00');
  var d = ttDate(s, { fileDate: ctx && ctx.fileDate });
  return d ? d + ' 00:00' : null;
}

function ttGuessType(t) {
  t = String(t);
  if (/live|ไลฟ์/i.test(t)) return 'โปรโมตไลฟ์';
  if (/ผู้โชคดี|ลุ้น|กิจกรรม|แจกฟรี/.test(t)) return 'กิจกรรม';
  if (/แกะกล่อง|unbox/i.test(t)) return 'แกะกล่อง';
  if (/sale|payday|คูปอง|ลด\s?\d|\d+\.\d+ /i.test(t)) return 'แคมเปญ';
  if (/รีวิว|review|สรุป|ฟีเจอร์/i.test(t)) return 'รีวิว';
  return 'สินค้า';
}

function ttCol(head, names) {
  for (var i = 0; i < head.length; i++) {
    var h = String(head[i]).trim().toLowerCase();
    for (var j = 0; j < names.length; j++) if (h === names[j].toLowerCase()) return i;
  }
  return -1;
}

function ttKind(head) {
  var has = function (n) { return ttCol(head, [n]) >= 0; };
  if ((has('Date') && has('Video Views')) || (has('วันที่') && has('ยอดเข้าชมวิดีโอ'))) return 'overview';
  if (has('ลิงก์วิดีโอ') || has('Video link')) return 'videos';
  if (has('Followers') && head.some(function (h) { return /difference/i.test(h); })) return 'fhistory';
  if (has('Active followers')) return 'factivity';
  if (has('Gender')) return 'fgender';
  if (has('Top territories')) return 'fterr';
  return null;
}

/**
 * Parse one CSV. meta = { name, fileDate (Date), account (optional, from the folder) }.
 * Returns { kind, account, warnings[], daily[], clips[], audience[] }.
 */
function ttParseFile(text, meta) {
  meta = meta || {};
  var rows = ttParseCsv(text);
  var out = { kind: null, account: meta.account || null, warnings: [], daily: [], clips: [], audience: [] };
  if (!rows.length) { out.warnings.push('ไฟล์ว่าง'); return out; }
  var head = rows[0].map(function (h) { return String(h).trim(); });
  var body = rows.slice(1);
  out.kind = ttKind(head);
  if (!out.kind) { out.warnings.push('ไม่รู้จักรูปแบบไฟล์ ตรวจว่า export มาจาก TikTok Studio'); return out; }
  var hints = ttHintsFromName(meta.name || '');
  if (!out.account && hints.account) out.account = hints.account;
  var ctx = { year: hints.year, fileDate: meta.fileDate };
  var c = function (names) { return ttCol(head, names); };

  if (out.kind === 'overview') {
    var iD = c(['Date', 'วันที่']), iV = c(['Video Views', 'ยอดเข้าชมวิดีโอ']), iP = c(['Profile Views', 'ยอดเข้าชมโปรไฟล์']);
    var iL = c(['Likes', 'ถูกใจ']), iC = c(['Comments', 'ความคิดเห็น']), iS = c(['Shares', 'แชร์']), iN = c(['การเติบโตสุทธิ']);
    var zero = 0;
    // The business-account export (ภาพรวม) counts slightly differently from the standard Overview export,
    // so its numbers only fill days that have no standard data.
    if (iN >= 0) out.weak = true;
    body.forEach(function (r) {
      var d = ttDate(r[iD], ctx);
      if (!d) return;
      var rec = { date: d, views: ttNum(r[iV]), pv: iP >= 0 ? ttNum(r[iP]) : null, likes: ttNum(r[iL]), comments: ttNum(r[iC]), shares: ttNum(r[iS]) };
      if (iN >= 0) rec.net_followers = ttNum(r[iN]);
      if (!rec.views && !rec.likes && !rec.pv) { zero++; return; } // TikTok sometimes leaves a whole day empty
      out.daily.push(rec);
    });
    if (zero) out.warnings.push('ข้าม ' + zero + ' วันที่เป็น 0 ทั้งแถว (ใช้ค่าจากไฟล์อื่นที่มีวันนั้นแทน)');
  }

  if (out.kind === 'videos') {
    var iT = c(['ชื่อวิดีโอ', 'Video title']), iU = c(['ลิงก์วิดีโอ', 'Video link']), iPt = c(['เวลาโพสต์', 'Post time']);
    var iVw = c(['ยอดเข้าชมวิดีโอ', 'Total views']), iLk = c(['ถูกใจ', 'Total likes']), iCm = c(['ความคิดเห็น', 'Total comments']);
    var iSh = c(['แชร์', 'Total shares']), iSv = c(['เพิ่มลงในรายการโปรด', 'Total favorites', 'Total saves']);
    var handles = {};
    body.forEach(function (r) {
      var url = String(r[iU] || '').trim();
      var hm = url.match(/@([\w.]+)\/video\/(\d+)/);
      if (hm) handles[hm[1]] = (handles[hm[1]] || 0) + 1;
      var id = hm ? hm[2] : (url.match(/(\d{10,})/) || [])[1];
      var posted = ttDateTime(r[iPt], ctx);
      if (!id || !posted) return;
      var title = String(r[iT] || '').replace(/\s+/g, ' ').trim();
      out.clips.push({ id: id, title: title, url: url, posted: posted, views: ttNum(r[iVw]), likes: ttNum(r[iLk]), comments: ttNum(r[iCm]),
        shares: ttNum(r[iSh]), saves: iSv >= 0 ? ttNum(r[iSv]) : 0, type: ttGuessType(title) });
    });
    var top = Object.keys(handles).sort(function (a, b) { return handles[b] - handles[a]; })[0];
    if (top && TT_HANDLES[top]) {
      if (out.account && out.account !== TT_HANDLES[top]) out.warnings.push('ลิงก์คลิปเป็นของ @' + top + ' แต่ไฟล์อยู่ในโฟลเดอร์ของอีกบัญชี ระบบใช้บัญชีตามลิงก์คลิป');
      out.account = TT_HANDLES[top];
    } else if (top && !TT_HANDLES[top]) out.warnings.push('ไม่รู้จักบัญชี @' + top);
  }

  if (out.kind === 'fhistory') {
    var iDh = c(['Date']), iF = c(['Followers']), iDf = head.findIndex(function (h) { return /difference/i.test(h); });
    body.forEach(function (r) {
      var d = ttDate(r[iDh], ctx);
      if (d) out.daily.push({ date: d, followers: ttNum(r[iF]), net_followers: ttNum(r[iDf]) });
    });
  }

  if (out.kind === 'factivity') {
    var iDa = c(['Date']), iH = c(['Hour']), iA = c(['Active followers']);
    body.forEach(function (r) {
      var d = ttDate(r[iDa], ctx);
      if (d) out.audience.push({ kind: 'activity', label: d + ' ' + ttPad(ttNum(r[iH])), value: ttNum(r[iA]) });
    });
  }
  if (out.kind === 'fgender' || out.kind === 'fterr') {
    body.forEach(function (r) { out.audience.push({ kind: out.kind === 'fgender' ? 'gender' : 'territory', label: String(r[0]).trim(), value: ttNum(r[1]) }); });
  }

  if (!out.account) out.warnings.push('ไม่รู้ว่าเป็นของบัญชีไหน วางไฟล์ในโฟลเดอร์ Eloop หรือ Moov');
  return out;
}

if (typeof module !== 'undefined') module.exports = { ttParseFile: ttParseFile, ttDate: ttDate, ttHintsFromName: ttHintsFromName };
