// Facebook page followers and YouTube subscribers reach the status sent to the website.
const { makeEnv } = require('./mock.js');
const { ctx, props } = makeEnv();
const ok = o => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(o) });
let fbFail = false;
ctx.UrlFetchApp.fetch = url => {
  const u = new URL(url), p = Object.fromEntries(u.searchParams), path = u.pathname.replace('/v23.0', '');
  if (path === '/111' && /followers_count/.test(p.fields || '')) return fbFail ? { getResponseCode: () => 400, getContentText: () => '{"error":{"message":"nope"}}' } : ok({ followers_count: 52340, fan_count: 50000, id: '111' });
  return ok({ data: [] });
};
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x)); } };
ctx.setup();
Object.assign(props, { 'FB_PT_fb-eloop': 'pt1', 'FB_PAGE_fb-eloop': '111', 'FB_TITLE_fb-eloop': 'Orsen & Eloop Thailand', 'FB_FMT_fb-eloop': '5', 'YT_RT_yt-moov': 'rt', 'YT_SUBS_yt-moov': '1234' });
ctx.syncFacebook_('fb-eloop', false);
let st = JSON.parse(ctx.doGet({ parameter: {} }).text).status;
t('fb followers stored and sent', st['fb-eloop'].followers === 52340, st['fb-eloop']);
t('yt subscribers sent', st['yt-moov'].followers === 1234, st['yt-moov']);
t('unconnected fb has none', st['fb-moov'].followers === null, st['fb-moov']);
fbFail = true; props['FB_FOLLOWERS_fb-eloop'] = '52340';
ctx.syncFacebook_('fb-eloop', false);
st = JSON.parse(ctx.doGet({ parameter: {} }).text).status;
t('failed follower read keeps last value and sync still ok', st['fb-eloop'].followers === 52340 && !st['fb-eloop'].error, st['fb-eloop']);
console.log(`${pass} passed, ${fail} failed`);
