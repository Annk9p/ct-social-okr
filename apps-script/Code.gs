/**
 * CT Social OKR — backend (Google Sheet + Apps Script)
 *
 * Collects TikTok (CSV files dropped in Drive) and YouTube (API, channel owner logs in once)
 * into this spreadsheet, and serves the numbers as JSON to the dashboard on GitHub Pages.
 *
 * Files in this project: Code.gs, TikTok.gs, YouTube.gs, appsscript.json
 * Setup guide: SETUP-TH.md in the GitHub repo.
 */

var TABS = {
  daily: ['date', 'account', 'views', 'likes', 'comments', 'shares', 'pv', 'net_followers', 'followers', 'minutes_watched', 'subs_gained', 'subs_lost', 'source', 'updated_at'],
  monthly: ['month', 'account', 'key', 'value', 'source', 'updated_at'],
  clips: ['account', 'id', 'title', 'url', 'posted', 'views', 'likes', 'comments', 'shares', 'saves', 'type', 'product', 'boosted', 'source', 'updated_at'],
  yt_top: ['month', 'account', 'rank', 'video_id', 'title', 'format', 'views'],
  yt_channel: ['account', 'as_of', 'channel_title', 'channel_id', 'subscribers', 'long_hours_365', 'shorts_views_90'],
  audience: ['account', 'as_of', 'kind', 'label', 'value'],
  targets: ['year', 'account', 'key', 'label', 'target', 'base', 'note'],
  notes: ['month', 'key', 'text', 'updated_at'],
  files: ['file_id', 'name', 'account', 'kind', 'rows', 'file_updated', 'imported_at', 'status', 'message'],
  sync_log: ['time', 'job', 'account', 'status', 'message'],
};
// Columns kept as plain text so Sheets does not turn them into dates or numbers
var TEXT_COLS = ['date', 'month', 'posted', 'id', 'video_id', 'file_id', 'file_updated', 'imported_at', 'updated_at', 'time', 'as_of', 'label', 'channel_id'];

// 2026 targets and last-year values (from the team's Content OKR deck). Edit them in the "targets" tab.
var TARGETS_2026 = [
  ['tt-eloop', 'views', 'Views', 46000000, 40700000], ['tt-eloop', 'nf', 'Net Follower', 35000, ''], ['tt-eloop', 'er', 'Engagement Rate (%)', 1.8, 1.63],
  ['tt-moov', 'views', 'Views', 5000000, 4600000], ['tt-moov', 'nf', 'Net Follower', 10000, ''], ['tt-moov', 'er', 'Engagement Rate (%)', 2.15, 2.01],
  ['fb-eloop', 'views', 'Views organic', 5900000, 5300000], ['fb-eloop', 'watch', 'Watch time (นาที)', 17000, 15180], ['fb-eloop', 'nf', 'Net Follower', '', ''], ['fb-eloop', 'er', 'Engagement Rate (%)', 1.5, 0.96],
  ['fb-moov', 'views', 'Views organic', 230000, 194000], ['fb-moov', 'watch', 'Watch time (นาที)', 16000, 8940], ['fb-moov', 'nf', 'Net Follower', '', ''], ['fb-moov', 'er', 'Engagement Rate (%)', 2.3, 0.48],
  ['yt-eloop', 'views', 'Views', 160000, ''], ['yt-eloop', 'nf', 'Subscriber ใหม่', 2000, ''], ['yt-eloop', 'awt', 'Avg watch %', 42, 37.4], ['yt-eloop', 'er', 'Engagement Rate (%)', 1.2, ''],
  ['yt-moov', 'views', 'Views', 350000, 239000], ['yt-moov', 'nf', 'Subscriber ใหม่', 2000, ''], ['yt-moov', 'awt', 'Avg watch %', 55, 51.7], ['yt-moov', 'er', 'Engagement Rate (%)', 1.5, 1.01],
];

var PROPS = PropertiesService.getScriptProperties();
var SITE_URL = 'https://annk9p.github.io/ct-social-okr/#setup'; // where the "connected" page links back to
var TZ = 'Asia/Bangkok';

/* ------------------------------------------------------------------ menu */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('CT OKR')
    .addItem('1) ติดตั้งครั้งแรก', 'setup')
    .addItem('2) ตั้งค่า OAuth และลิงก์เว็บแอป', 'showSettingsDialog')
    .addSeparator()
    .addItem('เชื่อม YouTube Eloop', 'connectYtEloop')
    .addItem('เชื่อม YouTube Moov', 'connectYtMoov')
    .addItem('ยกเลิกการเชื่อม YouTube Eloop', 'disconnectYtEloop')
    .addItem('ยกเลิกการเชื่อม YouTube Moov', 'disconnectYtMoov')
    .addSeparator()
    .addItem('ดึงข้อมูล YouTube ตอนนี้', 'syncYouTubeNow')
    .addItem('นำเข้าไฟล์ TikTok ตอนนี้', 'importTikTokNow')
    .addItem('ดูสถานะ', 'showStatus')
    .addToUi();
}

/* ------------------------------------------------------------------ setup */

function setup() {
  var ss = SpreadsheetApp.getActive();
  PROPS.setProperty('SHEET_ID', ss.getId());
  if (!PROPS.getProperty('YEAR')) PROPS.setProperty('YEAR', String(new Date().getFullYear()));
  Object.keys(TABS).forEach(function (t) { sh_(t); });
  var first = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);

  if (!readTable_('targets').length) {
    var y = PROPS.getProperty('YEAR');
    writeTable_('targets', TARGETS_2026.map(function (r) { return { year: y, account: r[0], key: r[1], label: r[2], target: r[3], base: r[4], note: '' }; }));
  }

  // Drive folders the team drops TikTok exports into
  var root = folderProp_('TT_FOLDER_ROOT', 'CT Social OKR · ไฟล์ TikTok', null);
  folderProp_('TT_FOLDER_tt-eloop', 'TikTok Eloop', root);
  folderProp_('TT_FOLDER_tt-moov', 'TikTok Moov', root);

  // Triggers: YouTube + TikTok every morning, TikTok folder check every hour
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['dailySync', 'importTikTok'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailySync').timeBased().atHour(6).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('importTikTok').timeBased().everyHours(1).create();

  log_('setup', '', 'ok', 'ติดตั้งแล้ว');
  SpreadsheetApp.getUi().alert('ติดตั้งเสร็จแล้ว',
    'สร้างแท็บข้อมูล โฟลเดอร์ TikTok ใน Google Drive และตั้งเวลาดึงข้อมูลทุกวัน 06:00 แล้ว\n\n' +
    'โฟลเดอร์สำหรับวางไฟล์ TikTok:\n' + root.getUrl() + '\n\n' +
    'ขั้นต่อไป: Deploy เป็นเว็บแอป แล้วเปิดเมนู CT OKR → 2) ตั้งค่า OAuth และลิงก์เว็บแอป', SpreadsheetApp.getUi().ButtonSet.OK);
}

function folderProp_(prop, name, parent) {
  var id = PROPS.getProperty(prop);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ } }
  var f = parent ? parent.createFolder(name) : DriveApp.createFolder(name);
  PROPS.setProperty(prop, f.getId());
  return f;
}

/* ------------------------------------------------------------------ settings dialog */

function showSettingsDialog() {
  var html = HtmlService.createHtmlOutput(
    '<style>body{font:14px/1.5 "IBM Plex Sans Thai",Arial,sans-serif;margin:0;padding:4px 8px}label{display:block;margin:10px 0 4px;font-weight:600}' +
    'input{width:100%;box-sizing:border-box;height:34px;padding:0 8px;border:1px solid #dfe3e9;border-radius:8px}small{color:#5b6472}' +
    'button{margin-top:14px;height:36px;padding:0 16px;border:0;border-radius:8px;background:#5b5bd6;color:#fff;font:inherit;cursor:pointer}</style>' +
    '<label>ลิงก์เว็บแอป (Web app URL ที่ลงท้ายด้วย /exec)</label><input id="u" value="' + esc_(PROPS.getProperty('WEBAPP_URL') || '') + '">' +
    '<small>ลิงก์นี้ต้องใส่ใน Google Cloud ช่อง Authorized redirect URIs ด้วย</small>' +
    '<label>OAuth Client ID</label><input id="i" value="' + esc_(PROPS.getProperty('OAUTH_CLIENT_ID') || '') + '">' +
    '<label>OAuth Client secret</label><input id="s" type="password" placeholder="' + (PROPS.getProperty('OAUTH_CLIENT_SECRET') ? 'บันทึกไว้แล้ว เว้นว่างถ้าไม่เปลี่ยน' : '') + '">' +
    '<button onclick="this.disabled=true;google.script.run.withSuccessHandler(function(){google.script.host.close()}).withFailureHandler(function(e){alert(e.message);}).saveSettings(' +
    'document.getElementById(\'u\').value,document.getElementById(\'i\').value,document.getElementById(\'s\').value)">บันทึกการตั้งค่า</button>'
  ).setWidth(460).setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, 'ตั้งค่า OAuth และลิงก์เว็บแอป');
}

function saveSettings(url, clientId, secret) {
  url = String(url || '').trim();
  if (url && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) throw new Error('ลิงก์เว็บแอปต้องขึ้นต้นด้วย https://script.google.com/ และลงท้ายด้วย /exec');
  if (url) PROPS.setProperty('WEBAPP_URL', url);
  if (clientId) PROPS.setProperty('OAUTH_CLIENT_ID', String(clientId).trim());
  if (secret) PROPS.setProperty('OAUTH_CLIENT_SECRET', String(secret).trim());
}

/* ------------------------------------------------------------------ web app */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.state && (p.code || p.error)) return ytHandleCallback_(p);
  if (p.api === 'connect') return json_(ytStartConnect_(p.acc));
  var data;
  try { data = buildData_(); } catch (err) { data = { ok: false, error: String(err && err.message || err) }; }
  return json_(data);
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Everything the dashboard needs, in one JSON object. */
function buildData_() {
  var year = PROPS.getProperty('YEAR') || String(new Date().getFullYear());
  var accounts = {};
  var acc = function (id) { return accounts[id] = accounts[id] || { monthly: {}, lastDate: null, source: null }; };
  readTable_('monthly').forEach(function (r) {
    if (String(r.month).slice(0, 4) !== year) return;
    var a = acc(r.account), mi = +String(r.month).slice(5, 7) - 1;
    (a.monthly[r.key] = a.monthly[r.key] || [null, null, null, null, null, null, null, null, null, null, null, null])[mi] = r.value === '' ? null : Number(r.value);
    a.source = r.source;
  });
  readTable_('daily').forEach(function (r) {
    if (!accounts[r.account]) return;
    if (!accounts[r.account].lastDate || r.date > accounts[r.account].lastDate) accounts[r.account].lastDate = r.date;
  });
  var clips = readTable_('clips').filter(function (r) { return String(r.posted).slice(0, 4) === year; }).map(function (r) {
    return { acc: r.account, id: String(r.id), title: r.title, url: r.url, posted: r.posted, views: +r.views, likes: +r.likes, comments: +r.comments,
      shares: +r.shares, saves: +r.saves, type: r.type, product: r.product, boosted: r.boosted === true || r.boosted === 'TRUE' };
  });
  var ytTop = {};
  readTable_('yt_top').forEach(function (r) {
    var t = ytTop[r.account] = ytTop[r.account] || {};
    (t[r.month] = t[r.month] || []).push({ rank: +r.rank, title: r.title, format: r.format, views: +r.views, id: r.video_id });
  });
  var ytChannel = {};
  readTable_('yt_channel').forEach(function (r) { ytChannel[r.account] = { asOf: r.as_of, title: r.channel_title, subscribers: +r.subscribers, longHours365: +r.long_hours_365, shortsViews90: +r.shorts_views_90 }; });
  var audience = {};
  readTable_('audience').forEach(function (r) {
    var a = audience[r.account] = audience[r.account] || { asOf: r.as_of, gender: [], territory: [], activity: [] };
    if (a[r.kind]) a[r.kind].push([r.label, +r.value]);
  });
  var targets = readTable_('targets').filter(function (r) { return String(r.year) === year; }).map(function (r) {
    return { account: r.account, key: r.key, target: r.target === '' ? null : +r.target, base: r.base === '' ? null : +r.base };
  });
  var notes = {};
  readTable_('notes').forEach(function (r) { (notes[r.month] = notes[r.month] || {})[r.key] = r.text; });
  var status = {};
  ['yt-eloop', 'yt-moov'].forEach(function (id) {
    status[id] = { connected: !!PROPS.getProperty('YT_RT_' + id), channel: PROPS.getProperty('YT_TITLE_' + id) || null, lastSync: PROPS.getProperty('LAST_OK_' + id) || null, error: PROPS.getProperty('LAST_ERR_' + id) || null };
  });
  ['tt-eloop', 'tt-moov'].forEach(function (id) { status[id] = { lastImport: PROPS.getProperty('LAST_OK_' + id) || null }; });
  return { ok: true, year: +year, generatedAt: now_(), accounts: accounts, clips: clips, ytTop: ytTop, ytChannel: ytChannel, audience: audience, targets: targets, notes: notes, status: status };
}

/* ------------------------------------------------------------------ jobs */

function dailySync() {
  var errors = [];
  ['yt-eloop', 'yt-moov'].forEach(function (id) {
    if (!PROPS.getProperty('YT_RT_' + id)) return;
    try { syncYouTube_(id, false); } catch (e) { errors.push(YT_NAMES[id] + ': ' + e.message); }
  });
  try { importTikTok(); } catch (e) { errors.push('TikTok: ' + e.message); }
  if (errors.length) notify_('CT Social OKR: ดึงข้อมูลไม่สำเร็จ', errors.join('\n'));
}

function syncYouTubeNow() {
  var done = [];
  ['yt-eloop', 'yt-moov'].forEach(function (id) {
    if (!PROPS.getProperty('YT_RT_' + id)) { done.push(YT_NAMES[id] + ': ยังไม่ได้เชื่อม'); return; }
    try { syncYouTube_(id, !PROPS.getProperty('LAST_OK_' + id)); done.push(YT_NAMES[id] + ': สำเร็จ'); } catch (e) { done.push(YT_NAMES[id] + ': ' + e.message); }
  });
  SpreadsheetApp.getUi().alert(done.join('\n'));
}

function importTikTokNow() {
  var r = importTikTok();
  SpreadsheetApp.getUi().alert(r.length ? r.join('\n') : 'ไม่มีไฟล์ใหม่ในโฟลเดอร์ TikTok');
}

/** Read new or changed files in the TikTok folders, upsert rows, recompute monthly totals. */
function importTikTok() {
  var known = {};
  readTable_('files').forEach(function (r) { known[r.file_id] = r; });
  var queue = [];
  ['tt-eloop', 'tt-moov'].forEach(function (acc) {
    var id = PROPS.getProperty('TT_FOLDER_' + acc);
    if (!id) return;
    var it = DriveApp.getFolderById(id).getFiles();
    while (it.hasNext()) {
      var f = it.next(), upd = f.getLastUpdated().toISOString();
      if (known[f.getId()] && known[f.getId()].file_updated === upd) continue;
      queue.push({ f: f, acc: acc, upd: upd });
    }
  });
  if (!queue.length) return [];
  queue.sort(function (a, b) { return a.upd < b.upd ? -1 : 1; }); // newest file wins

  var daily = readTable_('daily'), clips = readTable_('clips'), audience = readTable_('audience');
  var dIdx = index_(daily, ['date', 'account']), cIdx = index_(clips, ['account', 'id']);
  var touched = {}, report = [], fileRows = readTable_('files');

  queue.forEach(function (q) {
    var parts = [], name = q.f.getName();
    try {
      var blob = q.f.getBlob();
      if (/\.zip$/i.test(name) || blob.getContentType() === 'application/zip') {
        Utilities.unzip(blob).forEach(function (b) { if (/\.csv$/i.test(b.getName())) parts.push({ name: name + '/' + b.getName(), text: b.getDataAsString('UTF-8') }); });
      } else if (/\.csv$/i.test(name)) parts.push({ name: name, text: blob.getDataAsString('UTF-8') });
      else throw new Error('รองรับเฉพาะไฟล์ .csv หรือ .zip');
    } catch (e) { fileRows = upsertFile_(fileRows, q, '', '', 0, 'error', e.message); report.push(name + ': ' + e.message); return; }

    parts.forEach(function (p) {
      var r = ttParseFile(p.text, { name: p.name, fileDate: q.f.getDateCreated(), account: q.acc });
      var acc = r.account || q.acc, n = 0, ts = now_();
      r.daily.forEach(function (d) {
        var key = d.date + '|' + acc, row = dIdx[key];
        if (!row) { row = { date: d.date, account: acc }; daily.push(row); dIdx[key] = row; }
        Object.keys(d).forEach(function (k) {
          if (k === 'date' || d[k] == null) return;
          if (r.weak && row[k] !== '' && row[k] != null) return; // never overwrite standard-export numbers
          row[k] = d[k];
        });
        row.source = 'tiktok-file'; row.updated_at = ts; n++;
      });
      r.clips.forEach(function (c) {
        var key = acc + '|' + c.id, row = cIdx[key];
        if (!row) { row = { account: acc, id: c.id, type: c.type, product: '', boosted: false }; clips.push(row); cIdx[key] = row; }
        ['title', 'url', 'posted', 'views', 'likes', 'comments', 'shares', 'saves'].forEach(function (k) { row[k] = c[k]; });
        if (!row.type) row.type = c.type; // keep the team's own label
        row.source = 'tiktok-file'; row.updated_at = ts; n++;
      });
      if (r.audience.length) {
        var kind = r.audience[0].kind, asOf = Utilities.formatDate(q.f.getDateCreated(), TZ, 'yyyy-MM-dd');
        audience = audience.filter(function (a) { return !(a.account === acc && a.kind === kind); })
          .concat(r.audience.map(function (a) { return { account: acc, as_of: asOf, kind: a.kind, label: a.label, value: a.value }; }));
        n += r.audience.length;
      }
      if (r.kind && acc) touched[acc] = true;
      fileRows = upsertFile_(fileRows, q, acc, r.kind || '', n, r.kind ? 'ok' : 'skip', r.warnings.join(' / '));
      report.push(p.name + ': ' + (r.kind ? (n + ' แถว') : 'ข้าม') + (r.warnings.length ? ' (' + r.warnings.join(' / ') + ')' : ''));
    });
  });

  writeTable_('daily', daily);
  writeTable_('clips', clips);
  writeTable_('audience', audience);
  writeTable_('files', fileRows);
  Object.keys(touched).forEach(function (acc) {
    replaceMonthly_(acc, 'tiktok-file', tiktokMonthly_(acc, daily, clips));
    PROPS.setProperty('LAST_OK_' + acc, now_());
    log_('tiktok', acc, 'ok', 'นำเข้าไฟล์แล้ว');
  });
  return report;
}

function upsertFile_(rows, q, acc, kind, n, status, msg) {
  rows = rows.filter(function (r) { return !(r.file_id === q.f.getId() && r.kind === kind); });
  rows.push({ file_id: q.f.getId(), name: q.f.getName(), account: acc, kind: kind, rows: n, file_updated: q.upd, imported_at: now_(), status: status, message: msg });
  return rows;
}

/** Monthly totals for one TikTok account: sums of daily rows, ER, and clip count. */
function tiktokMonthly_(acc, daily, clips) {
  var year = PROPS.getProperty('YEAR'), out = [];
  for (var m = 1; m <= 12; m++) {
    var ym = year + '-' + (m < 10 ? '0' : '') + m;
    var rows = daily.filter(function (r) { return r.account === acc && String(r.date).slice(0, 7) === ym; });
    var cl = clips.filter(function (c) { return c.account === acc && String(c.posted).slice(0, 7) === ym; });
    if (rows.length) {
      var s = function (k) { return rows.reduce(function (t, r) { return t + (Number(r[k]) || 0); }, 0); };
      var hasNet = rows.some(function (r) { return r.net_followers !== '' && r.net_followers != null; });
      var hasPv = rows.some(function (r) { return r.pv !== '' && r.pv != null; });
      var v = s('views');
      out.push([ym, 'views', v], [ym, 'likes', s('likes')], [ym, 'comments', s('comments')], [ym, 'shares', s('shares')]);
      if (hasPv) out.push([ym, 'pv', s('pv')]);
      if (hasNet) out.push([ym, 'nf', s('net_followers')]);
      if (v) out.push([ym, 'er', Math.round((s('likes') + s('comments') + s('shares')) / v * 10000) / 100]);
    }
    if (cl.length) out.push([ym, 'output', cl.length]);
  }
  return out;
}

function replaceMonthly_(acc, source, rows) {
  var ts = now_();
  var all = readTable_('monthly').filter(function (r) { return !(r.account === acc && r.source === source); });
  rows.forEach(function (r) { all.push({ month: r[0], account: acc, key: r[1], value: r[2], source: source, updated_at: ts }); });
  all.sort(function (a, b) { return (a.account + a.month + a.key) < (b.account + b.month + b.key) ? -1 : 1; });
  writeTable_('monthly', all);
}

/* ------------------------------------------------------------------ status */

function showStatus() {
  var lines = [];
  lines.push('ลิงก์เว็บแอป: ' + (PROPS.getProperty('WEBAPP_URL') || 'ยังไม่ได้ตั้ง'));
  ['yt-eloop', 'yt-moov'].forEach(function (id) {
    lines.push(YT_NAMES[id] + ': ' + (PROPS.getProperty('YT_RT_' + id) ? 'เชื่อมแล้ว (' + (PROPS.getProperty('YT_TITLE_' + id) || '') + ')' : 'ยังไม่ได้เชื่อม') +
      (PROPS.getProperty('LAST_OK_' + id) ? ' · ดึงล่าสุด ' + PROPS.getProperty('LAST_OK_' + id) : '') +
      (PROPS.getProperty('LAST_ERR_' + id) ? ' · ผิดพลาด: ' + PROPS.getProperty('LAST_ERR_' + id) : ''));
  });
  ['tt-eloop', 'tt-moov'].forEach(function (id) {
    var f = PROPS.getProperty('TT_FOLDER_' + id);
    lines.push((id === 'tt-eloop' ? 'TikTok Eloop' : 'TikTok Moov') + ': นำเข้าล่าสุด ' + (PROPS.getProperty('LAST_OK_' + id) || '–') + (f ? '\n  โฟลเดอร์ ' + DriveApp.getFolderById(f).getUrl() : ''));
  });
  SpreadsheetApp.getUi().alert('สถานะ CT Social OKR', lines.join('\n\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

/* ------------------------------------------------------------------ sheet helpers */

function ss_() {
  var id = PROPS.getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

function sh_(name) {
  var ss = ss_(), s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    var h = TABS[name];
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    s.setFrozenRows(1);
    h.forEach(function (k, i) { if (TEXT_COLS.indexOf(k) >= 0) s.getRange(1, i + 1, s.getMaxRows(), 1).setNumberFormat('@'); });
  }
  return s;
}

function readTable_(name) {
  var s = sh_(name), last = s.getLastRow(), h = TABS[name];
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, h.length).getValues().filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var o = {};
    h.forEach(function (k, i) { var v = r[i]; o[k] = v instanceof Date ? Utilities.formatDate(v, TZ, k === 'month' ? 'yyyy-MM' : 'yyyy-MM-dd') : v; });
    return o;
  });
}

function writeTable_(name, objs) {
  var s = sh_(name), h = TABS[name], last = s.getLastRow();
  if (last > 1) s.getRange(2, 1, last - 1, h.length).clearContent();
  if (!objs.length) return;
  if (s.getMaxRows() < objs.length + 1) s.insertRowsAfter(s.getMaxRows(), objs.length + 1 - s.getMaxRows());
  s.getRange(2, 1, objs.length, h.length).setValues(objs.map(function (o) {
    return h.map(function (k) { var v = o[k]; return v == null ? '' : (TEXT_COLS.indexOf(k) >= 0 ? String(v) : v); });
  }));
}

function index_(rows, keys) {
  var m = {};
  rows.forEach(function (r) { m[keys.map(function (k) { return String(r[k]); }).join('|')] = r; });
  return m;
}

function log_(job, acc, status, msg) {
  var s = sh_('sync_log');
  s.appendRow([now_(), job, acc, status, String(msg).slice(0, 500)]);
  if (s.getLastRow() > 2000) s.deleteRows(2, s.getLastRow() - 2000);
}

function notify_(subject, body) {
  var to = PROPS.getProperty('ALERT_EMAILS') || Session.getEffectiveUser().getEmail();
  if (to) MailApp.sendEmail(to, subject, body + '\n\nเปิดชีตแล้วดูเมนู CT OKR → ดูสถานะ');
}

function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
