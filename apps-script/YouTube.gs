/**
 * YouTube: each channel owner logs in with the channel's Gmail once (OAuth, read-only),
 * then the script pulls YouTube Analytics + Data API every morning.
 *
 * Needs (one-time, see SETUP-TH.md):
 *   - an OAuth client (Web application) in Google Cloud, with the web app /exec URL as redirect URI
 *   - YouTube Analytics API and YouTube Data API v3 enabled in that Cloud project
 *   - OAuth consent screen published "In production" (Testing mode expires logins after 7 days)
 */

var YT_NAMES = { 'yt-eloop': 'YouTube Eloop', 'yt-moov': 'YouTube Moov' };
var YT_SCOPES = ['https://www.googleapis.com/auth/yt-analytics.readonly', 'https://www.googleapis.com/auth/youtube.readonly'];
var SHORTS_MAX_SECONDS = 180; // YouTube Shorts can be up to 3 minutes

function connectYtEloop() { ytConnectDialog_('yt-eloop'); }
function connectYtMoov() { ytConnectDialog_('yt-moov'); }

function ytConnectDialog_(acc) {
  var ui = SpreadsheetApp.getUi();
  var cid = PROPS.getProperty('OAUTH_CLIENT_ID'), redirect = PROPS.getProperty('WEBAPP_URL');
  if (!cid || !PROPS.getProperty('OAUTH_CLIENT_SECRET') || !redirect) {
    ui.alert('ยังตั้งค่าไม่ครบ', 'เปิดเมนู CT OKR → 2) ตั้งค่า OAuth และลิงก์เว็บแอป ใส่ลิงก์เว็บแอป, Client ID และ Client secret ก่อน', ui.ButtonSet.OK);
    return;
  }
  var state = Utilities.getUuid();
  CacheService.getScriptCache().put('oauth_' + state, acc, 3600);
  var url = 'https://accounts.google.com/o/oauth2/v2/auth?' + qs_({
    client_id: cid, redirect_uri: redirect, response_type: 'code', scope: YT_SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'false', state: state,
  });
  var html = HtmlService.createHtmlOutput(
    '<style>body{font:14px/1.6 "IBM Plex Sans Thai",Arial,sans-serif;margin:0;padding:4px 8px}ol{padding-left:1.2em}' +
    'a.b{display:inline-block;margin-top:10px;padding:9px 16px;border-radius:8px;background:#5b5bd6;color:#fff;text-decoration:none;font-weight:600}' +
    'small{color:#5b6472}</style>' +
    '<ol><li>กดปุ่มด้านล่าง หน้าล็อกอิน Google จะเปิดในแท็บใหม่</li>' +
    '<li>เลือกหรือล็อกอิน <b>Gmail ที่เป็นเจ้าของช่อง ' + YT_NAMES[acc].replace('YouTube ', '') + '</b></li>' +
    '<li>ถ้าเจอหน้า "Google hasn\'t verified this app" กด Advanced → Go to … (unsafe)</li>' +
    '<li>กด อนุญาต (Allow) แล้วรอจนขึ้นว่าเชื่อมสำเร็จ</li></ol>' +
    '<a class="b" href="' + esc_(url) + '" target="_blank" rel="noopener">ล็อกอินด้วย Gmail ของช่อง</a>' +
    '<p><small>ระบบได้สิทธิ์อ่านสถิติอย่างเดียว แก้ไขหรือลบอะไรในช่องไม่ได้ ลิงก์นี้ใช้ได้ 1 ชั่วโมง</small></p>'
  ).setWidth(440).setHeight(320);
  ui.showModalDialog(html, 'เชื่อม ' + YT_NAMES[acc]);
}

/** Google redirects the browser back to the web app with ?code=...&state=... */
function ytHandleCallback_(p) {
  var page = function (ok, msg) {
    return HtmlService.createHtmlOutput('<div style="font:16px/1.6 \'IBM Plex Sans Thai\',Arial,sans-serif;max-width:520px;margin:48px auto;padding:0 16px">' +
      '<h2 style="margin:0 0 8px">' + (ok ? 'เชื่อมสำเร็จ' : 'เชื่อมไม่สำเร็จ') + '</h2><p>' + msg + '</p></div>').setTitle('เชื่อม YouTube');
  };
  var cache = CacheService.getScriptCache(), acc = cache.get('oauth_' + p.state);
  if (!acc) return page(false, 'ลิงก์หมดอายุหรือใช้ไปแล้ว กลับไปที่ชีต แล้วกดเมนูเชื่อม YouTube ใหม่อีกครั้ง');
  cache.remove('oauth_' + p.state);
  if (p.error) return page(false, 'Google แจ้งว่า: ' + esc_(p.error) + ' (ถ้ากดปฏิเสธไป ให้เริ่มใหม่แล้วกดอนุญาต)');

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { code: p.code, client_id: PROPS.getProperty('OAUTH_CLIENT_ID'), client_secret: PROPS.getProperty('OAUTH_CLIENT_SECRET'),
      redirect_uri: PROPS.getProperty('WEBAPP_URL'), grant_type: 'authorization_code' },
  });
  var tok = JSON.parse(res.getContentText() || '{}');
  if (!tok.refresh_token) return page(false, 'ไม่ได้รับสิทธิ์แบบถาวรจาก Google (' + esc_(tok.error_description || tok.error || res.getResponseCode()) + ') ลองเชื่อมใหม่อีกครั้ง');

  // Which channel did they log in with?
  var ch = JSON.parse(UrlFetchApp.fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: 'Bearer ' + tok.access_token }, muteHttpExceptions: true }).getContentText() || '{}');
  var item = ch.items && ch.items[0];
  if (!item) return page(false, 'บัญชี Gmail นี้ไม่มีช่อง YouTube ลองเชื่อมใหม่แล้วเลือก Gmail ที่เป็นเจ้าของช่อง');
  var other = acc === 'yt-eloop' ? 'yt-moov' : 'yt-eloop';
  if (PROPS.getProperty('YT_CHANNEL_' + other) === item.id) return page(false, 'ช่อง "' + esc_(item.snippet.title) + '" เชื่อมไว้เป็น ' + YT_NAMES[other] + ' แล้ว ลองใหม่แล้วเลือก Gmail ของ ' + YT_NAMES[acc]);

  PROPS.setProperties({ ['YT_RT_' + acc]: tok.refresh_token, ['YT_CHANNEL_' + acc]: item.id, ['YT_TITLE_' + acc]: item.snippet.title });
  PROPS.deleteProperty('LAST_ERR_' + acc);
  CacheService.getScriptCache().put('yt_at_' + acc, tok.access_token, Math.min(3000, (tok.expires_in || 3600) - 300));
  log_('youtube-connect', acc, 'ok', 'เชื่อมกับช่อง ' + item.snippet.title);

  // Pull this year's history in the background
  var pending = JSON.parse(PROPS.getProperty('YT_BACKFILL') || '[]');
  if (pending.indexOf(acc) < 0) pending.push(acc);
  PROPS.setProperty('YT_BACKFILL', JSON.stringify(pending));
  ScriptApp.newTrigger('ytBackfillPending').timeBased().after(10 * 1000).create();
  return page(true, YT_NAMES[acc] + ' เชื่อมกับช่อง <b>' + esc_(item.snippet.title) + '</b> แล้ว ระบบกำลังดึงข้อมูลย้อนหลังตั้งแต่ต้นปี ใช้เวลาไม่กี่นาที ปิดหน้านี้ได้เลย');
}

function ytBackfillPending() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'ytBackfillPending') ScriptApp.deleteTrigger(t); });
  var pending = JSON.parse(PROPS.getProperty('YT_BACKFILL') || '[]');
  PROPS.deleteProperty('YT_BACKFILL');
  pending.forEach(function (acc) {
    try { syncYouTube_(acc, true); } catch (e) { notify_('CT Social OKR: ดึงข้อมูลย้อนหลัง ' + YT_NAMES[acc] + ' ไม่สำเร็จ', e.message); }
  });
}

/* ------------------------------------------------------------------ API helpers */

function ytToken_(acc) {
  var cache = CacheService.getScriptCache(), at = cache.get('yt_at_' + acc);
  if (at) return at;
  var rt = PROPS.getProperty('YT_RT_' + acc);
  if (!rt) throw new Error('ยังไม่ได้เชื่อมช่อง');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { client_id: PROPS.getProperty('OAUTH_CLIENT_ID'), client_secret: PROPS.getProperty('OAUTH_CLIENT_SECRET'), refresh_token: rt, grant_type: 'refresh_token' },
  });
  var tok = JSON.parse(res.getContentText() || '{}');
  if (!tok.access_token) {
    if (tok.error === 'invalid_grant') {
      PROPS.deleteProperty('YT_RT_' + acc);
      throw new Error('สิทธิ์หลุด (เช่น เปลี่ยนรหัสผ่าน Gmail หรือยกเลิกสิทธิ์) ต้องกดเมนู "เชื่อม ' + YT_NAMES[acc] + '" ใหม่');
    }
    throw new Error('ขอสิทธิ์จาก Google ไม่สำเร็จ: ' + (tok.error_description || tok.error || res.getResponseCode()));
  }
  cache.put('yt_at_' + acc, tok.access_token, Math.min(3000, (tok.expires_in || 3600) - 300));
  return tok.access_token;
}

function ytGet_(acc, url) {
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ytToken_(acc) }, muteHttpExceptions: true });
  var body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() >= 400) throw new Error('YouTube API ' + res.getResponseCode() + ': ' + ((body.error && body.error.message) || res.getContentText().slice(0, 200)));
  return body;
}

function ytReport_(acc, params) {
  params.ids = 'channel==MINE';
  var r = ytGet_(acc, 'https://youtubeanalytics.googleapis.com/v2/reports?' + qs_(params));
  var cols = (r.columnHeaders || []).map(function (h) { return h.name; });
  return (r.rows || []).map(function (row) { var o = {}; cols.forEach(function (c, i) { o[c] = row[i]; }); return o; });
}

function isoSeconds_(d) {
  var m = String(d).match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0)) : 0;
}

function ymd_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }

/* ------------------------------------------------------------------ sync */

/**
 * full = true pulls the whole year (first connect); otherwise the last ~2 months
 * (YouTube revises recent numbers for a few days).
 */
function syncYouTube_(acc, full) {
  try {
    var year = +PROPS.getProperty('YEAR');
    var today = new Date(), end = new Date(today.getTime() - 86400000);
    if (end.getFullYear() > year) end = new Date(year, 11, 31);
    var start = full ? new Date(year, 0, 1) : new Date(Math.max(new Date(year, 0, 1).getTime(), new Date(end.getFullYear(), end.getMonth() - 1, 1).getTime()));
    if (end < start) return;

    // 1) daily numbers
    var days = ytReport_(acc, { startDate: ymd_(start), endDate: ymd_(end), dimensions: 'day', sort: 'day',
      metrics: 'views,likes,comments,shares,subscribersGained,subscribersLost,estimatedMinutesWatched' });
    var daily = readTable_('daily'), dIdx = index_(daily, ['date', 'account']), ts = now_();
    days.forEach(function (d) {
      var key = d.day + '|' + acc, row = dIdx[key];
      if (!row) { row = { date: d.day, account: acc }; daily.push(row); dIdx[key] = row; }
      row.views = d.views; row.likes = d.likes; row.comments = d.comments; row.shares = d.shares;
      row.subs_gained = d.subscribersGained; row.subs_lost = d.subscribersLost; row.net_followers = d.subscribersGained - d.subscribersLost;
      row.minutes_watched = d.estimatedMinutesWatched; row.source = 'youtube-api'; row.updated_at = ts;
    });
    writeTable_('daily', daily);

    // 2) channel info + uploads this year (for long/Shorts counts)
    var ch = ytGet_(acc, 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true').items[0];
    var uploads = ytUploads_(acc, ch.contentDetails.relatedPlaylists.uploads, year);

    // 3) per month: avg view %, top 3 videos, upload counts
    var months = [], extra = [], top = readTable_('yt_top').filter(function (r) { return r.account !== acc || String(r.month) < ymd_(start).slice(0, 7); });
    for (var m = start.getMonth(); m <= end.getMonth(); m++) {
      var ms = new Date(year, m, 1), me = new Date(Math.min(new Date(year, m + 1, 0).getTime(), end.getTime()));
      var ym = ymd_(ms).slice(0, 7);
      months.push(ym);
      var awt = ytReport_(acc, { startDate: ymd_(ms), endDate: ymd_(me), metrics: 'averageViewPercentage' });
      if (awt.length && awt[0].averageViewPercentage != null) extra.push([ym, 'awt', Math.round(awt[0].averageViewPercentage * 100) / 100]);
      var vids = ytReport_(acc, { startDate: ymd_(ms), endDate: ymd_(me), metrics: 'views', dimensions: 'video', sort: '-views', maxResults: 3 });
      var info = ytVideoInfo_(acc, vids.map(function (v) { return v.video; }));
      vids.forEach(function (v, i) {
        var vi = info[v.video] || {};
        top.push({ month: ym, account: acc, rank: i + 1, video_id: v.video, title: vi.title || v.video, format: vi.seconds && vi.seconds <= SHORTS_MAX_SECONDS ? 'Shorts' : 'วิดีโอยาว', views: v.views });
      });
    }
    writeTable_('yt_top', top);

    // 4) YPP progress (approximation: long-form watch hours over 365 days, Shorts views over 90 days)
    var hours365 = '', shorts90 = '';
    try {
      var y1 = ytReport_(acc, { startDate: ymd_(new Date(today.getTime() - 365 * 86400000)), endDate: ymd_(end), metrics: 'estimatedMinutesWatched,views', dimensions: 'creatorContentType' });
      y1.forEach(function (r) { if (r.creatorContentType === 'VIDEO_ON_DEMAND') hours365 = Math.round(r.estimatedMinutesWatched / 60 * 10) / 10; });
      var d90 = ytReport_(acc, { startDate: ymd_(new Date(today.getTime() - 90 * 86400000)), endDate: ymd_(end), metrics: 'views', dimensions: 'creatorContentType' });
      d90.forEach(function (r) { if (r.creatorContentType === 'SHORTS') shorts90 = r.views; });
    } catch (e) { log_('youtube', acc, 'warn', 'คำนวณ YPP ไม่ได้: ' + e.message); }
    var chRows = readTable_('yt_channel').filter(function (r) { return r.account !== acc; });
    chRows.push({ account: acc, as_of: ymd_(end), channel_title: ch.snippet.title, channel_id: ch.id, subscribers: +ch.statistics.subscriberCount || 0, long_hours_365: hours365, shorts_views_90: shorts90 });
    writeTable_('yt_channel', chRows);

    // 5) monthly totals
    var monthly = [];
    for (var mm = 1; mm <= 12; mm++) {
      var ymm = year + '-' + (mm < 10 ? '0' : '') + mm;
      var rows = daily.filter(function (r) { return r.account === acc && String(r.date).slice(0, 7) === ymm; });
      if (!rows.length) continue;
      var s = function (k) { return rows.reduce(function (t, r) { return t + (Number(r[k]) || 0); }, 0); };
      var v = s('views');
      monthly.push([ymm, 'views', v], [ymm, 'likes', s('likes')], [ymm, 'comments', s('comments')], [ymm, 'shares', s('shares')],
        [ymm, 'nf', s('subs_gained') - s('subs_lost')], [ymm, 'watch_hours', Math.round(s('minutes_watched') / 60 * 10) / 10]);
      if (v) monthly.push([ymm, 'er', Math.round((s('likes') + s('comments') + s('shares')) / v * 10000) / 100]);
      var up = uploads.filter(function (u) { return u.published.slice(0, 7) === ymm; });
      monthly.push([ymm, 'output_long', up.filter(function (u) { return u.seconds > SHORTS_MAX_SECONDS; }).length],
        [ymm, 'output_shorts', up.filter(function (u) { return u.seconds <= SHORTS_MAX_SECONDS; }).length], [ymm, 'output', up.length]);
    }
    // keep avg view % for months not refreshed this run
    var keepAwt = readTable_('monthly').filter(function (r) { return r.account === acc && r.key === 'awt' && months.indexOf(r.month) < 0; })
      .map(function (r) { return [r.month, 'awt', r.value]; });
    replaceMonthly_(acc, 'youtube-api', monthly.concat(extra, keepAwt));

    PROPS.setProperty('LAST_OK_' + acc, now_());
    PROPS.deleteProperty('LAST_ERR_' + acc);
    log_('youtube', acc, 'ok', (full ? 'ดึงย้อนหลัง ' : 'ดึงข้อมูล ') + ymd_(start) + ' ถึง ' + ymd_(end));
  } catch (e) {
    PROPS.setProperty('LAST_ERR_' + acc, String(e.message).slice(0, 300));
    log_('youtube', acc, 'error', e.message);
    throw e;
  }
}

/** Videos published this year: id, published (yyyy-mm-dd), seconds. */
function ytUploads_(acc, playlistId, year) {
  var ids = [], token = '', stop = false;
  do {
    var r = ytGet_(acc, 'https://www.googleapis.com/youtube/v3/playlistItems?' + qs_({ part: 'contentDetails', playlistId: playlistId, maxResults: 50, pageToken: token }));
    (r.items || []).forEach(function (it) {
      var pub = it.contentDetails.videoPublishedAt;
      if (!pub) return;
      if (+pub.slice(0, 4) < year) { stop = true; return; }
      if (+pub.slice(0, 4) === year) ids.push(it.contentDetails.videoId);
    });
    token = r.nextPageToken || '';
  } while (token && !stop);
  var info = ytVideoInfo_(acc, ids);
  return ids.filter(function (id) { return info[id]; }).map(function (id) { return { id: id, published: info[id].published, seconds: info[id].seconds }; });
}

function ytVideoInfo_(acc, ids) {
  var out = {};
  for (var i = 0; i < ids.length; i += 50) {
    var r = ytGet_(acc, 'https://www.googleapis.com/youtube/v3/videos?' + qs_({ part: 'snippet,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 }));
    (r.items || []).forEach(function (v) {
      out[v.id] = { title: v.snippet.title, published: Utilities.formatDate(new Date(v.snippet.publishedAt), TZ, 'yyyy-MM-dd'), seconds: isoSeconds_(v.contentDetails.duration) };
    });
  }
  return out;
}

function qs_(o) {
  return Object.keys(o).filter(function (k) { return o[k] !== '' && o[k] != null; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&');
}
