// TikTok Display API: login, handle check, hourly sync, merge with file data.
const { makeEnv } = require('./mock.js');
const { ctx, props, cache } = makeEnv();
let rtSeen = [], userName = 'moovthailand', failUser = false;
const ok = o => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(o) });
ctx.UrlFetchApp.fetch = (url, opt = {}) => {
  const u = new URL(url), path = u.pathname.replace('/v2/', '');
  if (path === 'oauth/token/') {
    const p = opt.payload;
    if (p.grant_type === 'authorization_code') return ok({ access_token: 'at1', refresh_token: 'rt1', open_id: 'oid-' + userName, expires_in: 86400 });
    rtSeen.push(p.refresh_token); return ok({ access_token: 'at2', refresh_token: 'rt2', open_id: 'oid-' + userName, expires_in: 86400 });
  }
  if (path === 'user/info/') {
    if (failUser) return { getResponseCode: () => 401, getContentText: () => JSON.stringify({ error: { code: 'access_token_invalid', message: 'The access token is invalid' } }) };
    return ok({ data: { user: { open_id: 'oid', display_name: 'Moov Thailand', username: userName, follower_count: 14800, likes_count: 150100, video_count: 500 } }, error: { code: 'ok' } });
  }
  if (path === 'video/list/') {
    const body = JSON.parse(opt.payload);
    if (!body.cursor) return ok({ data: { videos: [
      { id: '7001', title: 'เดิมจากไฟล์', create_time: Date.parse('2026-11-03T05:00:00Z') / 1000, view_count: 900, like_count: 30, comment_count: 2, share_count: 1 },
      { id: '7002', title: 'คลิปใหม่ รีวิวฟิล์ม\nบรรทัดสอง', create_time: Date.parse('2026-11-19T05:00:00Z') / 1000, view_count: 120, like_count: 5, comment_count: 0, share_count: 0, cover_image_url: 'https://p16.tiktokcdn.com/c7002.jpg', duration: 37 },
    ], cursor: 111, has_more: true }, error: { code: 'ok' } });
    return ok({ data: { videos: [{ id: '6001', title: 'old', create_time: Date.parse('2025-12-20T05:00:00Z') / 1000, view_count: 1 }], cursor: 222, has_more: true }, error: { code: 'ok' } });
  }
  return { getResponseCode: () => 404, getContentText: () => '{}' };
};
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x)); } };
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
ctx.setup(); post({ api: 'setpass', newPass: 'secret12' }); const P = 'secret12';
// file data already there: a day in November and clip 7001 with more saves but fewer views
ctx.writeTable_('daily', [{ date: '2026-11-01', account: 'tt-moov', views: 100, likes: 5, comments: 0, shares: 0, source: 'tiktok-file' }]);
ctx.writeTable_('clips', [{ account: 'tt-moov', id: '7001', title: 'เดิมจากไฟล์', url: 'https://www.tiktok.com/@moovthailand/video/7001', posted: '2026-11-03 12:00', views: 50, likes: 40, comments: 1, shares: 0, saves: 7, type: 'แกะกล่อง', source: 'tiktok-file' }]);
t('connect needs key', /กุญแจ TikTok/.test(post({ api: 'ttconnect', pass: P, acc: 'tt-moov' }).error));
t('bad key rejected', !post({ api: 'ttapp', pass: P, clientKey: 'bad key!', secret: 's', redirect: 'https://script.google.com/macros/s/X/exec' }).ok);
t('save key', post({ api: 'ttapp', pass: P, clientKey: 'awabc123def456', secret: 'shh', redirect: 'https://script.google.com/macros/s/X/exec' }).ok);
const c = post({ api: 'ttconnect', pass: P, acc: 'tt-moov' }), cu = new URL(c.url);
t('authorize url', cu.host === 'www.tiktok.com' && cu.searchParams.get('client_key') === 'awabc123def456' && cu.searchParams.get('scope') === 'user.info.basic,user.info.profile,user.info.stats,video.list' && cu.searchParams.get('redirect_uri') === 'https://script.google.com/macros/s/X/exec', c.url);
// wrong account for the slot
const ce = new URL(post({ api: 'ttconnect', pass: P, acc: 'tt-eloop' }).url);
t('moov account on eloop slot rejected', /เป็นของ TikTok Moov/.test(ctx.doGet({ parameter: { state: ce.searchParams.get('state'), code: 'x' } }).html) && !props['TTAPI_RT_tt-eloop']);
const html = ctx.doGet({ parameter: { state: cu.searchParams.get('state'), code: 'abc', scopes: 'user.info.basic' } }).html;
t('callback success', /เชื่อม TikTok สำเร็จ/.test(html) && /@moovthailand/.test(html), html.slice(0, 300));
t('stored token and user', props['TTAPI_RT_tt-moov'] === 'rt1' && props['TTAPI_USER_tt-moov'] === 'moovthailand');
let d = JSON.parse(ctx.doGet({ parameter: {} }).text);
const st = d.status['tt-moov'];
t('live numbers public, token not', st.api && st.live.followers === 14800 && st.live.likes === 150100 && !/rt1|at1|shh/.test(JSON.stringify(d)), st);
const c7001 = d.clips.find(x => x.id === '7001'), c7002 = d.clips.find(x => x.id === '7002');
t('existing clip: larger counts kept, saves and team type kept', c7001.views === 900 && c7001.likes === 40 && c7001.saves === 7 && c7001.type === 'แกะกล่อง', c7001);
t('new clip added with handle url', c7002 && c7002.title === 'คลิปใหม่ รีวิวฟิล์ม' && c7002.url === 'https://www.tiktok.com/@moovthailand/video/7002' && c7002.saves === null, c7002);
t('cover image and duration stored', c7002.thumb === 'https://p16.tiktokcdn.com/c7002.jpg' && c7002.duration === 37 && c7001.thumb === '' && c7001.duration === null, [c7001, c7002]);
t('no 2025 clip', !d.clips.some(x => x.id === '6001'));
const m = d.accounts['tt-moov'].monthly;
t('november views from the file stay (not zeroed by follower snapshot)', m.views[10] === 100, m.views);
t('november clip count includes new clip', m.output[10] === 2, m.output);
t('follower snapshot for today', ctx.readTable_('daily').some(r => r.account === 'tt-moov' && r.followers === 14800));
t('hourly trigger created', ctx.ScriptApp.getProjectTriggers().some(x => x.getHandlerFunction() === 'syncTikTokApiAll'));
// a later file import with older numbers must not lower the API counts
// (simulated by the merge rule: max of the two)
// refresh path
delete cache['ttat_tt-moov'];
t('sync with refresh', post({ api: 'synctt', pass: P, acc: 'tt-moov' }).report[0].includes('ดึงสำเร็จ') && rtSeen[0] === 'rt1' && props['TTAPI_RT_tt-moov'] === 'rt2');
failUser = true; delete cache['ttat_tt-moov'];
const r = post({ api: 'synctt', pass: P, acc: 'tt-moov' });
t('expired access shows reconnect message', /กดเชื่อม TikTok ใหม่/.test(r.report[0]) && /สิทธิ์ TikTok/.test(JSON.parse(ctx.doGet({ parameter: {} }).text).status['tt-moov'].error), r);
failUser = false;
t('disconnect keeps file data', post({ api: 'ttdisconnect', pass: P, acc: 'tt-moov' }).ok && !props['TTAPI_RT_tt-moov'] && JSON.parse(ctx.doGet({ parameter: {} }).text).clips.some(x => x.id === '7001'));
console.log(`${pass} passed, ${fail} failed`);
