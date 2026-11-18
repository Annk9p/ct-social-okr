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
  daily: ['date', 'account', 'views', 'likes', 'comments', 'shares', 'pv', 'net_followers', 'followers', 'minutes_watched', 'subs_gained', 'subs_lost', 'source', 'updated_at', 'interactions', 'views_total', 'minutes_total'],
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
    .addSeparator()
    .addItem('ล้างรหัสทีม (ลืมรหัส)', 'resetTeamPass')
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
  try { SpreadsheetApp.getUi().alert('ติดตั้งเสร็จแล้ว',
    'สร้างแท็บข้อมูล โฟลเดอร์ TikTok ใน Google Drive และตั้งเวลาดึงข้อมูลทุกวัน 06:00 แล้ว\n\n' +
    'โฟลเดอร์สำหรับวางไฟล์ TikTok:\n' + root.getUrl() + '\n\n' +
    'ขั้นต่อไป: Deploy เป็นเว็บแอป แล้วตั้งค่าที่เหลือได้ที่หน้า ตั้งค่า บนเว็บแดชบอร์ด', SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* not opened from the sheet */ }
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
  if (p.state && (p.code || p.error)) return CacheService.getScriptCache().get('oauth_' + p.state) === 'fb' ? fbHandleCallback_(p) : ytHandleCallback_(p);
  if (p.api === 'connect') return json_(ytStartConnect_(p.acc));
  var data;
  try { data = buildData_(); } catch (err) { data = { ok: false, error: String(err && err.message || err) }; }
  return json_(data);
}

/* ------------------------------------------------------------------ web API (POST from the dashboard)
 * Body: JSON sent as text/plain (no CORS preflight). Every action that changes something needs the team passcode,
 * which is set once from the dashboard's setup page and stored only as a salted hash.
 */
function doPost(e) {
  var b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'คำขอไม่ถูกต้อง' }); }
  try { return json_(webApi_(b)); } catch (err) { return json_({ ok: false, error: String(err && err.message || err) }); }
}

function webApi_(b) {
  if (b.api === 'setpass') return setPass_(b);
  checkPass_(b.pass);
  switch (b.api) {
    case 'check': return { ok: true };
    case 'oauth': return saveOAuth_(b);
    case 'disconnect': ytDisconnectCore_(b.acc); return { ok: true };
    case 'syncyt': return syncYtWeb_(b.acc);
    case 'upload': return uploadTikTok_(b);
    case 'import': return { ok: true, report: withLock_(importTikTok) };
    case 'target': return saveTarget_(b);
    case 'fbapp': return saveFbApp_(b);
    case 'fbconnect': return fbStartConnect_();
    case 'fbtoken': return fbAdoptUserToken_(String(b.token || '').trim());
    case 'fbpage': return fbPickPage_(b);
    case 'fbdisconnect': return fbDisconnect_(b.acc);
    case 'syncfb': return syncFbWeb_(b.acc);
    default: throw new Error('ไม่รู้จักคำสั่ง ' + b.api);
  }
}

function hash_(salt, pass) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pass, Utilities.Charset.UTF_8));
}

function setPass_(b) {
  var np = String(b.newPass || '');
  if (np.length < 6) throw new Error('รหัสทีมต้องยาวอย่างน้อย 6 ตัวอักษร');
  if (PROPS.getProperty('ADMIN_HASH')) checkPass_(b.pass); // changing an existing passcode needs the old one
  var salt = Utilities.getUuid();
  PROPS.setProperties({ ADMIN_SALT: salt, ADMIN_HASH: hash_(salt, np) });
  log_('passcode', '', 'ok', 'ตั้งรหัสทีมจากหน้าเว็บ');
  return { ok: true };
}

function checkPass_(pass) {
  var h = PROPS.getProperty('ADMIN_HASH');
  if (!h) throw new Error('ยังไม่ได้ตั้งรหัสทีม ตั้งได้ที่หน้า ตั้งค่า');
  var cache = CacheService.getScriptCache(), fails = +(cache.get('pass_fail') || 0);
  if (fails >= 10) throw new Error('ใส่รหัสผิดหลายครั้ง ระบบล็อกไว้ 15 นาที');
  if (!pass || hash_(PROPS.getProperty('ADMIN_SALT'), String(pass)) !== h) {
    cache.put('pass_fail', String(fails + 1), 900);
    var err = new Error('รหัสทีมไม่ถูกต้อง'); err.badPass = true; throw err;
  }
}

/** Sheet menu: forgot the passcode. Only the sheet owner can run this. */
function resetTeamPass() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('ล้างรหัสทีม', 'ล้างแล้วตั้งรหัสใหม่ได้ที่หน้า ตั้งค่า บนเว็บแดชบอร์ด', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  PROPS.deleteProperty('ADMIN_HASH'); PROPS.deleteProperty('ADMIN_SALT');
  log_('passcode', '', 'ok', 'ล้างรหัสทีมจากชีต');
}

function saveOAuth_(b) {
  var url = String(b.redirect || '').trim(), cid = String(b.clientId || '').trim(), sec = String(b.secret || '').trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) throw new Error('ลิงก์เว็บแอปไม่ถูกต้อง');
  if (cid && !/\.apps\.googleusercontent\.com$/.test(cid)) throw new Error('Client ID ต้องลงท้ายด้วย .apps.googleusercontent.com');
  if (!cid && !PROPS.getProperty('OAUTH_CLIENT_ID')) throw new Error('ใส่ Client ID');
  if (!sec && !PROPS.getProperty('OAUTH_CLIENT_SECRET')) throw new Error('ใส่ Client secret');
  PROPS.setProperty('WEBAPP_URL', url);
  if (cid) PROPS.setProperty('OAUTH_CLIENT_ID', cid);
  if (sec) PROPS.setProperty('OAUTH_CLIENT_SECRET', sec);
  log_('settings', '', 'ok', 'บันทึก Google OAuth จากหน้าเว็บ');
  return { ok: true };
}

function syncYtWeb_(acc) {
  var ids = acc ? [acc] : ['yt-eloop', 'yt-moov'], out = [];
  ids.forEach(function (id) {
    if (!YT_NAMES[id]) throw new Error('ไม่รู้จักบัญชี ' + id);
    if (!PROPS.getProperty('YT_RT_' + id)) { out.push(YT_NAMES[id] + ': ยังไม่ได้เชื่อม'); return; }
    try { syncYouTube_(id, !PROPS.getProperty('LAST_OK_' + id)); out.push(YT_NAMES[id] + ': ดึงสำเร็จ'); } catch (e) { out.push(YT_NAMES[id] + ': ' + e.message); }
  });
  return { ok: true, report: out };
}

/** Dashboard upload: save the file into the account's Drive folder, then import right away. */
function uploadTikTok_(b) {
  if (['tt-eloop', 'tt-moov'].indexOf(b.acc) < 0) throw new Error('เลือกบัญชี TikTok');
  var name = String(b.name || 'tiktok.csv').replace(/[\\/]/g, '_').slice(0, 200);
  if (!/\.(csv|zip)$/i.test(name)) throw new Error(name + ': รองรับเฉพาะไฟล์ .csv หรือ .zip');
  var bytes = Utilities.base64Decode(String(b.data || ''));
  if (!bytes.length) throw new Error(name + ': ไฟล์ว่าง');
  if (bytes.length > 20 * 1024 * 1024) throw new Error(name + ': ไฟล์ใหญ่เกิน 20 MB');
  var root = folderProp_('TT_FOLDER_ROOT', 'CT Social OKR · ไฟล์ TikTok', null);
  var folder = folderProp_('TT_FOLDER_' + b.acc, b.acc === 'tt-eloop' ? 'TikTok Eloop' : 'TikTok Moov', root);
  folder.createFile(Utilities.newBlob(bytes, /\.zip$/i.test(name) ? 'application/zip' : 'text/csv', name));
  if (b.last === false) return { ok: true, report: [] }; // more files coming in this batch; import once at the end
  return { ok: true, report: withLock_(importTikTok) };
}

function saveTarget_(b) {
  var field = b.field === 'base' ? 'base' : 'target', year = PROPS.getProperty('YEAR') || String(new Date().getFullYear());
  var v = b.value === '' || b.value == null ? '' : Number(b.value);
  if (v !== '' && !isFinite(v)) throw new Error('ตัวเลขไม่ถูกต้อง');
  var rows = readTable_('targets'), row = rows.filter(function (r) { return String(r.year) === year && r.account === b.account && r.key === b.key; })[0];
  if (!row) { row = { year: year, account: String(b.account), key: String(b.key), label: String(b.label || b.key), target: '', base: '', note: '' }; rows.push(row); }
  row[field] = v;
  writeTable_('targets', rows);
  return { ok: true };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60 * 1000)) throw new Error('ระบบกำลังนำเข้าข้อมูลอยู่ ลองใหม่อีกครั้งใน 1 นาที');
  try { return fn(); } finally { lock.releaseLock(); }
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
  readTable_('yt_channel').forEach(function (r) { ytChannel[r.account] = { asOf: r.as_of, title: r.channel_title, subscribers: +r.subscribers, longHours365: r.long_hours_365 === '' ? null : +r.long_hours_365, shortsViews90: r.shorts_views_90 === '' ? null : +r.shorts_views_90 }; });
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
  status.setup = { pass: !!PROPS.getProperty('ADMIN_HASH'), oauth: !!(PROPS.getProperty('OAUTH_CLIENT_ID') && PROPS.getProperty('OAUTH_CLIENT_SECRET')), redirect: PROPS.getProperty('WEBAPP_URL') || null,
    fbDebug: Object.keys(PROPS.getProperties ? PROPS.getProperties() : {}).filter(function (k) { return k.indexOf('FB_DEBUG_') === 0; }).map(function (k) { return PROPS.getProperty(k); }),
    fb: !!(PROPS.getProperty('FB_APP_ID') && PROPS.getProperty('FB_APP_SECRET')), fbConfig: !!PROPS.getProperty('FB_CONFIG_ID'),
    fbPages: PROPS.getProperty('FB_UT') ? JSON.parse(PROPS.getProperty('FB_PAGELIST') || '[]') : [] };
  ['fb-eloop', 'fb-moov'].forEach(function (id) {
    status[id] = { connected: !!PROPS.getProperty('FB_PT_' + id), page: PROPS.getProperty('FB_TITLE_' + id) || null, pageId: PROPS.getProperty('FB_PAGE_' + id) || null,
      lastSync: PROPS.getProperty('LAST_OK_' + id) || null, error: PROPS.getProperty('LAST_ERR_' + id) || null };
  });
  status.log = readTable_('sync_log').filter(function (r) { return r.status !== 'ok'; }).slice(-8).reverse().map(function (r) {
    return { time: r.time, job: r.job, account: r.account, status: r.status, message: String(r.message).slice(0, 200) };
  });
  status.files = readTable_('files').sort(function (a, b) { return a.imported_at < b.imported_at ? 1 : -1; }).slice(0, 12).map(function (r) {
    return { name: r.name, account: r.account, kind: r.kind, rows: +r.rows || 0, at: r.imported_at, status: r.status, message: r.message };
  });
  return { ok: true, year: +year, generatedAt: now_(), accounts: accounts, clips: clips, ytTop: ytTop, ytChannel: ytChannel, audience: audience, targets: targets, notes: notes, status: status };
}

/* ------------------------------------------------------------------ jobs */

function dailySync() {
  var errors = [];
  ['yt-eloop', 'yt-moov'].forEach(function (id) {
    if (!PROPS.getProperty('YT_RT_' + id)) return;
    try { syncYouTube_(id, false); } catch (e) { errors.push(YT_NAMES[id] + ': ' + e.message); }
  });
  ['fb-eloop', 'fb-moov'].forEach(function (id) {
    if (!PROPS.getProperty('FB_PT_' + id)) return;
    try { syncFacebook_(id, false); } catch (e) { errors.push(FB_NAMES[id] + ': ' + e.message); }
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
    h.forEach(function (k, i) { var v = r[i]; o[k] = v instanceof Date ? Utilities.formatDate(v, TZ, k === 'month' ? 'yyyy-MM' : ['time', 'updated_at', 'imported_at', 'posted'].indexOf(k) >= 0 ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') : v; });
    return o;
  });
}

function writeTable_(name, objs) {
  var s = sh_(name), h = TABS[name], last = s.getLastRow();
  s.getRange(1, 1, 1, h.length).setValues([h]);
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
  if (to) MailApp.sendEmail(to, subject, body + '\n\nดูสถานะได้ที่หน้า ตั้งค่า: ' + SITE_URL);
}

function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* ================================================================== Facebook Pages
 * One Facebook login (a person who is admin of both the Meta app and the Pages) gives a long-lived user token;
 * from it the script takes a never-expiring Page token for each Page and pulls Page insights + Reels every morning.
 * Needs (set from the dashboard): Meta App ID + App secret, and the web app /exec URL as a Valid OAuth Redirect URI.
 */
var FB_V = 'v23.0';
var FB_NAMES = { 'fb-eloop': 'Facebook Eloop', 'fb-moov': 'Facebook Moov' };
var FB_GUESS = { 'fb-eloop': /eloop|orsen/i, 'fb-moov': /moov/i };
var FB_SCOPES = 'pages_show_list,pages_read_engagement,read_insights';
// Daily Page metrics, each with fallbacks in case Meta renames or retires one
var FB_METRICS = [
  { key: 'views', names: ['page_media_view', 'page_impressions'], organic: true },   // team KPI = "From organic" in Business Suite
  { key: 'watch_ms', names: ['page_video_view_time'], organic: true },
  { key: 'follows', names: ['page_daily_follows_unique', 'page_fan_adds_unique'] },
  { key: 'unfollows', names: ['page_daily_unfollows_unique', 'page_fan_removes_unique'] },
  { key: 'eng', names: ['page_post_engagements'] }, // includes clicks; kept for reference only
];
var FB_FMT = '3'; // bump when the way numbers are counted changes: next sync re-pulls the whole year
var FB_REEL_VIEW_METRICS = ['blue_reels_play_count', 'fb_reels_total_plays', 'total_video_views'];

function fbGraph_(path, params, token) {
  var p = {};
  Object.keys(params || {}).forEach(function (k) { p[k] = params[k]; });
  if (token) p.access_token = token;
  var res = UrlFetchApp.fetch('https://graph.facebook.com/' + FB_V + '/' + path + '?' + qs_(p), { muteHttpExceptions: true });
  var body = {};
  try { body = JSON.parse(res.getContentText() || '{}'); } catch (e) { /* not JSON */ }
  if (res.getResponseCode() >= 400 || body.error) {
    var err = new Error('Facebook: ' + ((body.error && body.error.message) || ('HTTP ' + res.getResponseCode())));
    err.fbCode = body.error && body.error.code;
    throw err;
  }
  return body;
}

function saveFbApp_(b) {
  var id = String(b.appId || '').trim(), sec = String(b.secret || '').trim(), cfg = String(b.configId || '').trim();
  var url = String(b.redirect || '').trim();
  if (id && !/^\d{5,20}$/.test(id)) throw new Error('App ID ต้องเป็นตัวเลข');
  if (cfg && !/^\d{5,20}$/.test(cfg)) throw new Error('Configuration ID ต้องเป็นตัวเลข');
  if (!id && !PROPS.getProperty('FB_APP_ID')) throw new Error('ใส่ App ID');
  if (!sec && !PROPS.getProperty('FB_APP_SECRET')) throw new Error('ใส่ App secret');
  if (/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) PROPS.setProperty('WEBAPP_URL', url);
  if (id) PROPS.setProperty('FB_APP_ID', id);
  if (sec) PROPS.setProperty('FB_APP_SECRET', sec);
  if (b.configId !== undefined) { if (cfg) PROPS.setProperty('FB_CONFIG_ID', cfg); else PROPS.deleteProperty('FB_CONFIG_ID'); }
  log_('settings', '', 'ok', 'บันทึกกุญแจ Facebook จากหน้าเว็บ');
  return { ok: true };
}

/** Facebook login URL (the dashboard redirects the browser there). */
function fbStartConnect_() {
  var id = PROPS.getProperty('FB_APP_ID'), redirect = PROPS.getProperty('WEBAPP_URL');
  if (!id || !PROPS.getProperty('FB_APP_SECRET')) throw new Error('ยังไม่ได้ใส่กุญแจ Facebook (App ID และ App secret)');
  if (!redirect) throw new Error('ระบบยังไม่รู้ลิงก์เว็บแอป กด บันทึกกุญแจ Facebook อีกครั้ง');
  var state = Utilities.getUuid();
  CacheService.getScriptCache().put('oauth_' + state, 'fb', 3600);
  var q = { client_id: id, redirect_uri: redirect, state: state, response_type: 'code' };
  var cfg = PROPS.getProperty('FB_CONFIG_ID');
  if (cfg) q.config_id = cfg; else q.scope = FB_SCOPES;
  return { ok: true, url: 'https://www.facebook.com/' + FB_V + '/dialog/oauth?' + qs_(q) };
}

/** Facebook redirects back to the web app with ?code=...&state=... */
function fbHandleCallback_(p) {
  var page = function (ok, msg) {
    return HtmlService.createHtmlOutput('<div style="font:16px/1.6 \'IBM Plex Sans Thai\',Arial,sans-serif;max-width:520px;margin:48px auto;padding:0 16px">' +
      '<h2 style="margin:0 0 8px">' + (ok ? 'เชื่อม Facebook สำเร็จ' : 'เชื่อม Facebook ไม่สำเร็จ') + '</h2><p>' + msg + '</p>' +
      '<p><a href="' + SITE_URL + '" target="_top" style="display:inline-block;padding:9px 16px;border-radius:8px;background:#5b5bd6;color:#fff;text-decoration:none;font-weight:600">กลับไปหน้าแดชบอร์ด</a></p></div>').setTitle('เชื่อม Facebook');
  };
  CacheService.getScriptCache().remove('oauth_' + p.state);
  if (p.error) return page(false, 'Facebook แจ้งว่า: ' + esc_(p.error_description || p.error) + ' (ถ้ากดยกเลิกไป ให้เริ่มใหม่แล้วกดดำเนินการต่อ)');
  try {
    var tok = fbGraph_('oauth/access_token', { client_id: PROPS.getProperty('FB_APP_ID'), client_secret: PROPS.getProperty('FB_APP_SECRET'),
      redirect_uri: PROPS.getProperty('WEBAPP_URL'), code: p.code });
    var r = fbAdoptUserToken_(tok.access_token);
    return page(true, r.message);
  } catch (e) {
    log_('facebook-connect', '', 'error', e.message);
    return page(false, esc_(e.message));
  }
}

/** From a user token (any lifetime): store a long-lived one, list the Pages, auto-pick Eloop and Moov. */
function fbAdoptUserToken_(token) {
  if (!token) throw new Error('ไม่ได้รับ token จาก Facebook');
  var id = PROPS.getProperty('FB_APP_ID'), sec = PROPS.getProperty('FB_APP_SECRET');
  if (!id || !sec) throw new Error('ยังไม่ได้ใส่กุญแจ Facebook (App ID และ App secret)');
  var ut = token;
  try { ut = fbGraph_('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: id, client_secret: sec, fb_exchange_token: token }).access_token || token; }
  catch (e) { throw new Error('แลก token แบบใช้ได้นานไม่สำเร็จ (' + e.message + ') ตรวจว่า token มาจากแอปเดียวกับ App ID ที่ใส่ไว้'); }
  var pages = [], r = fbGraph_('me/accounts', { fields: 'id,name,access_token', limit: 100 }, ut);
  for (var guard = 0; guard < 10; guard++) {
    pages = pages.concat(r.data || []);
    if (!(r.paging && r.paging.next)) break;
    r = JSON.parse(UrlFetchApp.fetch(r.paging.next, { muteHttpExceptions: true }).getContentText() || '{}');
  }
  if (!pages.length) throw new Error('บัญชี Facebook นี้ไม่เห็นเพจไหนเลย ตรวจว่าเป็นแอดมินเพจ และตอนกดอนุญาตได้ติ๊กเลือกเพจ Eloop กับ Moov');
  PROPS.setProperty('FB_UT', ut);
  var list = JSON.parse(PROPS.getProperty('FB_PAGELIST') || '[]'), seen = {};
  list.concat(pages.map(function (pg) { return { id: pg.id, name: pg.name }; })).forEach(function (pg) { seen[pg.id] = pg; });
  PROPS.setProperty('FB_PAGELIST', JSON.stringify(Object.keys(seen).map(function (k) { return seen[k]; })));
  var done = [], todo = [];
  Object.keys(FB_NAMES).forEach(function (acc) {
    var locked = PROPS.getProperty('FB_PAGE_' + acc), pick = null;
    if (locked) {
      pick = pages.filter(function (pg) { return pg.id === locked; })[0];
      if (!pick) { done.push(FB_NAMES[acc] + ' = เพจ "' + esc_(PROPS.getProperty('FB_TITLE_' + acc) || '') + '" (เชื่อมไว้แล้วจากบัญชีก่อนหน้า)'); return; }
    } else { var m = pages.filter(function (pg) { return FB_GUESS[acc].test(pg.name); }); if (m.length === 1) pick = m[0]; }
    if (pick) { fbSetPage_(acc, pick); done.push(FB_NAMES[acc] + ' = เพจ "' + esc_(pick.name) + '"'); } else todo.push(FB_NAMES[acc]);
  });
  log_('facebook-connect', '', 'ok', 'เห็น ' + pages.length + ' เพจ · ' + done.join(', '));
  return { ok: true, pages: pages.length, message: (done.length ? done.join('<br>') + '<br>ระบบกำลังดึงข้อมูลย้อนหลังตั้งแต่ต้นปี ใช้เวลาไม่กี่นาที' : '') +
    (todo.length ? (done.length ? '<br><br>' : '') + 'ยังต้องเลือกเพจให้ ' + todo.join(' และ ') + ' ที่หน้าตั้งค่าในแดชบอร์ด' : '') };
}

function fbSetPage_(acc, pg) {
  if (!FB_NAMES[acc]) throw new Error('ไม่รู้จักบัญชี ' + acc);
  var other = acc === 'fb-eloop' ? 'fb-moov' : 'fb-eloop';
  if (PROPS.getProperty('FB_PAGE_' + other) === pg.id) throw new Error('เพจ "' + pg.name + '" เลือกไว้เป็น ' + FB_NAMES[other] + ' แล้ว');
  var o = {}; o['FB_PAGE_' + acc] = pg.id; o['FB_PT_' + acc] = pg.access_token; o['FB_TITLE_' + acc] = pg.name;
  PROPS.setProperties(o);
  PROPS.deleteProperty('LAST_ERR_' + acc);
  var pending = JSON.parse(PROPS.getProperty('FB_BACKFILL') || '[]');
  if (pending.indexOf(acc) < 0) pending.push(acc);
  PROPS.setProperty('FB_BACKFILL', JSON.stringify(pending));
  ScriptApp.newTrigger('fbBackfillPending').timeBased().after(10 * 1000).create();
}

/** Dashboard: choose which Page is Eloop / Moov (from the Pages the login could see). */
function fbPickPage_(b) {
  var ut = PROPS.getProperty('FB_UT');
  if (!ut) throw new Error('ยังไม่ได้เชื่อม Facebook');
  if (!FB_NAMES[b.acc]) throw new Error('ไม่รู้จักบัญชี ' + b.acc);
  var other = b.acc === 'fb-eloop' ? 'fb-moov' : 'fb-eloop';
  if (PROPS.getProperty('FB_PAGE_' + other) === String(b.pageId)) throw new Error('เพจนี้เลือกไว้เป็น ' + FB_NAMES[other] + ' แล้ว');
  var pg = fbGraph_(String(b.pageId), { fields: 'id,name,access_token' }, ut);
  if (!pg.access_token) throw new Error('ไม่ได้รับสิทธิ์ของเพจนี้ ตรวจว่าเป็นแอดมินเพจ');
  fbSetPage_(b.acc, pg);
  log_('facebook-connect', b.acc, 'ok', 'เลือกเพจ ' + pg.name);
  return { ok: true };
}

function fbDisconnect_(acc) {
  if (!FB_NAMES[acc]) throw new Error('ไม่รู้จักบัญชี ' + acc);
  var title = PROPS.getProperty('FB_TITLE_' + acc) || '';
  ['FB_PAGE_', 'FB_PT_', 'FB_TITLE_', 'LAST_OK_', 'LAST_ERR_'].forEach(function (k) { PROPS.deleteProperty(k + acc); });
  if (!PROPS.getProperty('FB_PAGE_fb-eloop') && !PROPS.getProperty('FB_PAGE_fb-moov')) { PROPS.deleteProperty('FB_UT'); PROPS.deleteProperty('FB_PAGELIST'); }
  log_('facebook-connect', acc, 'ok', 'ยกเลิกการเชื่อม (เดิม: ' + title + ')');
  return { ok: true };
}

function fbBackfillPending() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'fbBackfillPending') ScriptApp.deleteTrigger(t); });
  var pending = JSON.parse(PROPS.getProperty('FB_BACKFILL') || '[]');
  PROPS.deleteProperty('FB_BACKFILL');
  pending.forEach(function (acc) {
    try { syncFacebook_(acc, true); } catch (e) { notify_('CT Social OKR: ดึงข้อมูลย้อนหลัง ' + FB_NAMES[acc] + ' ไม่สำเร็จ', e.message); }
  });
}

function syncFbWeb_(acc) {
  var ids = acc ? [acc] : Object.keys(FB_NAMES), out = [];
  ids.forEach(function (id) {
    if (!FB_NAMES[id]) throw new Error('ไม่รู้จักบัญชี ' + id);
    if (!PROPS.getProperty('FB_PT_' + id)) { out.push(FB_NAMES[id] + ': ยังไม่ได้เชื่อม'); return; }
    try { syncFacebook_(id, !PROPS.getProperty('LAST_OK_' + id)); out.push(FB_NAMES[id] + ': ดึงสำเร็จ'); } catch (e) { out.push(FB_NAMES[id] + ': ' + e.message); }
  });
  return { ok: true, report: out };
}

/** Day-by-day values of one Page metric. Insights allow at most ~90 days per call.
 * With `organic`, asks Meta to split by is_from_ads and returns { total, organic } (organic is null if Meta gave no split). */
function fbInsights_(pid, pt, metric, start, end, organic) {
  var total = {}, org = organic ? {} : null, gotSplit = false, s = new Date(start.getTime());
  var extra = organic ? { breakdown: 'is_from_ads' } : {};
  while (s <= end) {
    var e = new Date(Math.min(end.getTime(), s.getTime() + 89 * 86400000));
    var q = { metric: metric, period: 'day', since: ymd_(s), until: ymd_(new Date(e.getTime() + 86400000)) };
    Object.keys(extra).forEach(function (k) { q[k] = extra[k]; });
    var r;
    try { r = fbGraph_(pid + '/insights', q, pt); }
    catch (err) {
      if (!organic || err.fbCode === 190 || !extra.breakdown) throw err;
      extra = {}; continue; // this metric does not take a breakdown: plain totals, no organic split
    }
    if (organic && s.getTime() === start.getTime()) fbDebug_(metric, q, r);
    (r.data || []).forEach(function (d) {
      (d.values || []).forEach(function (v) {
        if (!v.end_time) return;
        var day = Utilities.formatDate(new Date(new Date(v.end_time).getTime() - 86400000), 'UTC', 'yyyy-MM-dd');
        total[day] = fbNum_(v.value);
        if (organic) { var o = fbOrganic_(v.value); if (o != null) { org[day] = o; gotSplit = true; } }
      });
    });
    s = new Date(e.getTime() + 86400000);
  }
  return organic ? { total: total, organic: gotSplit ? org : null } : total;
}

/** Organic part of a value split by is_from_ads, e.g. {"false": 120, "true": 900} or {"is_from_ads": {"false": 120}}. */
function fbOrganic_(v) {
  if (!v || typeof v !== 'object') return null;
  var found = null;
  (function walk(o) {
    Object.keys(o).forEach(function (k) {
      if (found != null) return;
      var x = o[k];
      if (x && typeof x === 'object') walk(x);
      else if (/^(false|0|no|organic|non_ads?|is_from_ads_false)$/i.test(k)) found = Number(x) || 0;
    });
  })(v);
  return found;
}

/** Keep one raw sample of the split response (numbers only, no tokens) so the format can be checked from the dashboard. */
function fbDebug_(metric, q, r) {
  try {
    var d = (r.data || [])[0] || {};
    PROPS.setProperty('FB_DEBUG_' + metric, JSON.stringify({ metric: metric, breakdown: q.breakdown || null, keys: Object.keys(d), values: (d.values || []).slice(0, 2), total_value: d.total_value || null }).slice(0, 1500));
  } catch (e) { /* debug only */ }
}

function fbNum_(v) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') return Object.keys(v).reduce(function (t, k) { return t + fbNum_(v[k]); }, 0);
  return Number(v) || 0;
}

/** Reels posted from `start`, with play counts. */
function fbReels_(pid, pt, start) {
  var reels = [], r = fbGraph_(pid + '/video_reels', { fields: 'id,description,created_time,permalink_url', limit: 100 }, pt);
  for (var guard = 0; guard < 30; guard++) {
    var older = false;
    (r.data || []).forEach(function (v) { if (new Date(v.created_time) >= start) reels.push(v); else older = true; });
    if (older || !(r.paging && r.paging.next)) break;
    r = JSON.parse(UrlFetchApp.fetch(r.paging.next, { muteHttpExceptions: true }).getContentText() || '{}');
  }
  var metric = PROPS.getProperty('FB_REEL_METRIC');
  for (var i = 0; i < reels.length; i += 50) {
    var batch = reels.slice(i, i + 50), got = null, tries = metric ? [metric] : FB_REEL_VIEW_METRICS, lastErr = '';
    for (var t = 0; t < tries.length && !got; t++) {
      try {
        got = fbGraph_('', { ids: batch.map(function (v) { return v.id; }).join(','), fields: 'video_insights.metric(' + tries[t] + '){values}' }, pt);
        metric = tries[t];
      } catch (e) { lastErr = e.message; if (e.fbCode === 190) throw e; }
    }
    if (!got) { log_('facebook', '', 'warn', 'ดึงยอดวิว Reels ไม่ได้: ' + lastErr); break; }
    batch.forEach(function (v) {
      var ins = got[v.id] && got[v.id].video_insights && got[v.id].video_insights.data;
      v.views = ins && ins[0] && ins[0].values && ins[0].values[0] ? fbNum_(ins[0].values[0].value) : '';
    });
  }
  if (metric) PROPS.setProperty('FB_REEL_METRIC', metric);
  return reels;
}

/** Content interactions (reactions + comments + shares) of the posts published in each month, like "Content interactions" in Business Suite. */
function fbPostInter_(pid, pt, start, end) {
  var out = {}, r = fbGraph_(pid + '/posts', { fields: 'created_time,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares',
    since: Math.floor(start.getTime() / 1000), until: Math.floor(end.getTime() / 1000) + 86400, limit: 100 }, pt);
  for (var guard = 0; guard < 60; guard++) {
    (r.data || []).forEach(function (p) {
      var ym = Utilities.formatDate(new Date(p.created_time), TZ, 'yyyy-MM');
      var n = ((p.reactions && p.reactions.summary && p.reactions.summary.total_count) || 0) + ((p.comments && p.comments.summary && p.comments.summary.total_count) || 0) + ((p.shares && p.shares.count) || 0);
      out[ym] = (out[ym] || 0) + n;
    });
    if (!(r.paging && r.paging.next)) break;
    r = JSON.parse(UrlFetchApp.fetch(r.paging.next, { muteHttpExceptions: true }).getContentText() || '{}');
    if (r.error) throw new Error('Facebook: ' + r.error.message);
  }
  return out;
}

function syncFacebook_(acc, full) {
  var pt = PROPS.getProperty('FB_PT_' + acc), pid = PROPS.getProperty('FB_PAGE_' + acc);
  if (!pt || !pid) throw new Error(FB_NAMES[acc] + ' ยังไม่ได้เชื่อม');
  if (PROPS.getProperty('FB_FMT_' + acc) !== FB_FMT) full = true;
  try {
    var year = +PROPS.getProperty('YEAR');
    var end = new Date(Date.now() - 86400000);
    if (end.getFullYear() > year) end = new Date(year, 11, 31);
    var start = full ? new Date(year, 0, 1) : new Date(Math.max(new Date(year, 0, 1).getTime(), new Date(end.getFullYear(), end.getMonth() - 1, 1).getTime()));
    if (end < start) return;

    // 1) daily Page metrics
    var series = {}, used = [];
    FB_METRICS.forEach(function (m) {
      var lastErr = '';
      for (var i = 0; i < m.names.length && !series[m.key]; i++) {
        try {
          var got = fbInsights_(pid, pt, m.names[i], start, end, m.organic);
          if (m.organic) {
            series[m.key + '_total'] = got.total;
            if (got.organic) series[m.key] = got.organic;
            else { series[m.key] = {}; log_('facebook', acc, 'warn', m.names[i] + ': Meta ไม่ได้แยก organic/ads มาให้ ยังไม่ใส่ตัวเลข ' + m.key); }
          } else series[m.key] = got;
          used.push(m.key + '=' + m.names[i] + (m.organic ? (got.organic ? ' (organic)' : ' (ไม่มี organic)') : ''));
        }
        catch (e) { if (e.fbCode === 190) throw e; lastErr = e.message; }
      }
      if (!series[m.key]) log_('facebook', acc, 'warn', 'ดึง ' + m.key + ' ไม่ได้: ' + lastErr);
    });
    var daily = readTable_('daily'), dIdx = index_(daily, ['date', 'account']), ts = now_(), days = {};
    Object.keys(series).forEach(function (k) { Object.keys(series[k]).forEach(function (d) { days[d] = true; }); });
    Object.keys(days).forEach(function (d) {
      if (d < ymd_(start) || d > ymd_(end)) return;
      var key = d + '|' + acc, row = dIdx[key], v = function (k) { return series[k] && series[k][d] != null ? series[k][d] : ''; };
      if (!row) { row = { date: d, account: acc }; daily.push(row); dIdx[key] = row; }
      var mins = function (k) { return v(k) === '' ? '' : Math.round(v(k) / 60000 * 10) / 10; };
      row.views = v('views'); row.views_total = v('views_total');
      row.minutes_watched = mins('watch_ms'); row.minutes_total = mins('watch_ms_total');
      row.subs_gained = v('follows'); row.subs_lost = v('unfollows');
      row.net_followers = v('follows') === '' ? '' : v('follows') - (v('unfollows') || 0);
      row.interactions = v('eng');
      row.source = 'facebook-api'; row.updated_at = ts;
    });
    writeTable_('daily', daily);

    // 2) Reels (count per month, Top 5, views of the month's Reels)
    var clips = readTable_('clips'), cIdx = index_(clips, ['account', 'id']), reelsOk = clips.some(function (c) { return c.account === acc; });
    try {
      fbReels_(pid, pt, start).forEach(function (v) {
        var key = acc + '|' + v.id, row = cIdx[key], title = String(v.description || '').split('\n')[0].slice(0, 150) || 'Reel';
        if (!row) { row = { account: acc, id: v.id, type: ttGuessType(title), product: '', boosted: false }; clips.push(row); cIdx[key] = row; }
        row.title = title;
        row.url = v.permalink_url ? (/^https?:/.test(v.permalink_url) ? v.permalink_url : 'https://www.facebook.com' + v.permalink_url) : '';
        row.posted = Utilities.formatDate(new Date(v.created_time), TZ, 'yyyy-MM-dd HH:mm');
        if (v.views !== '' && v.views != null) row.views = v.views;
        row.source = 'facebook-api'; row.updated_at = ts;
      });
      writeTable_('clips', clips);
      reelsOk = true;
    } catch (e) { if (e.fbCode === 190) throw e; log_('facebook', acc, 'warn', 'ดึง Reels ไม่ได้: ' + e.message); }

    // 3) content interactions per month, from the posts published that month
    var inter = JSON.parse(PROPS.getProperty('FB_INTER_' + acc) || '{}');
    if (full) inter = {};
    try {
      var got = fbPostInter_(pid, pt, start, end);
      for (var mi = start.getMonth(); mi <= end.getMonth(); mi++) { var k = year + '-' + (mi < 9 ? '0' : '') + (mi + 1); inter[k] = got[k] || 0; }
      PROPS.setProperty('FB_INTER_' + acc, JSON.stringify(inter));
    } catch (e) { if (e.fbCode === 190) throw e; log_('facebook', acc, 'warn', 'ดึง Content interactions จากโพสต์ไม่ได้: ' + e.message); }

    // 4) monthly totals for the whole year (from the daily table)
    var monthly = [];
    for (var mm = 1; mm <= 12; mm++) {
      var ym = year + '-' + (mm < 10 ? '0' : '') + mm;
      var rows = daily.filter(function (r) { return r.account === acc && String(r.date).slice(0, 7) === ym; });
      var has = function (k) { return rows.some(function (r) { return r[k] !== '' && r[k] != null; }); };
      var s = function (k) { return rows.reduce(function (t, r) { return t + (Number(r[k]) || 0); }, 0); };
      if (rows.length) {
        if (has('views')) monthly.push([ym, 'views', s('views')]);
        if (has('views_total')) monthly.push([ym, 'views_all', s('views_total')]);
        if (has('minutes_watched')) monthly.push([ym, 'watch', Math.round(s('minutes_watched'))]);
        if (has('minutes_total')) monthly.push([ym, 'watch_all', Math.round(s('minutes_total'))]);
        if (has('net_followers')) monthly.push([ym, 'nf', s('net_followers')]);
        if (has('interactions')) monthly.push([ym, 'eng_all', s('interactions')]);
        if (inter[ym] != null && has('views') && s('views')) monthly.push([ym, 'er', Math.round(inter[ym] / s('views') * 10000) / 100]);
      }
      if (inter[ym] != null) monthly.push([ym, 'inter', inter[ym]]);
      // Reels count; months without Reels count as 0 once Reels could be read at all
      var n = clips.filter(function (c) { return c.account === acc && String(c.posted).slice(0, 7) === ym; }).length;
      if (n || (reelsOk && ym <= ymd_(end).slice(0, 7))) monthly.push([ym, 'output', n]);
    }
    replaceMonthly_(acc, 'facebook-api', monthly);
    if (full) PROPS.setProperty('FB_FMT_' + acc, FB_FMT);
    PROPS.setProperty('LAST_OK_' + acc, now_());
    PROPS.deleteProperty('LAST_ERR_' + acc);
    log_('facebook', acc, 'ok', (full ? 'ดึงย้อนหลัง ' : 'ดึงข้อมูล ') + ymd_(start) + ' ถึง ' + ymd_(end) + ' · ' + used.join(', '));
  } catch (e) {
    var msg = e.fbCode === 190 ? 'สิทธิ์ Facebook หมดอายุหรือถูกยกเลิก (เช่น แอดมินเปลี่ยนรหัสผ่าน) กดเชื่อม Facebook ใหม่ที่หน้าตั้งค่า' : e.message;
    PROPS.setProperty('LAST_ERR_' + acc, String(msg).slice(0, 300));
    log_('facebook', acc, 'error', msg);
    throw new Error(msg);
  }
}
