// Instagram: find the account linked to each Page, monthly totals in ≤30-day chunks, Reels into clips.
const { makeEnv } = require('./mock.js');
const { ctx, props } = makeEnv();
const ok = o => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(o) });
const err = (m, c) => ({ getResponseCode: () => 400, getContentText: () => JSON.stringify({ error: { message: m, code: c || 100 } }) });
const days = p => Math.round((+p.until - +p.since) / 86400);
ctx.UrlFetchApp.fetch = url => {
  const u = new URL(url), p = Object.fromEntries(u.searchParams), path = u.pathname.replace('/v23.0', '');
  if (path === '/oauth/access_token') return ok({ access_token: 'long-' + p.fb_exchange_token });
  if (path === '/me/accounts') return ok({ data: [{ id: '111', name: 'Orsen & Eloop Thailand', access_token: 'pt1' }, { id: '222', name: 'Moov Thailand', access_token: 'pt2' }] });
  if (path === '/me/businesses') return err('(#200) needs business_management', 200);
  if ((path === '/111' || path === '/222') && /instagram_business_account/.test(p.fields)) return path === '/111' ? ok({ instagram_business_account: { id: 'ig1', username: 'eloopth', followers_count: 5000 } }) : ok({});
  if (path === '/ig1' && p.fields) return ok({ username: 'eloopth', followers_count: 5100 });
  if (path === '/ig1/insights') {
    const n = days(p);
    if (n > 30) return err('(#100) range over 30 days');
    if (p.metric === 'follows_and_unfollows') return ok({ data: [{ name: 'follows_and_unfollows', total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results: [{ dimension_values: ['FOLLOWER'], value: 2 * n }, { dimension_values: ['NON_FOLLOWER'], value: n }] }] } }] });
    const per = { views: 100, total_interactions: 5, likes: 3, comments: 1, shares: 1, saves: 0 };
    if (p.metric.split(',').includes('saves') && p.metric.includes(',')) return err('(#100) saves not valid with others'); // forces the one-by-one retry
    return ok({ data: p.metric.split(',').map(m => ({ name: m, period: 'day', total_value: { value: per[m] * n } })) });
  }
  if (path === '/ig1/media') return ok({ data: [
    { id: 'm1', caption: 'รีวิว Moov ฟิล์ม\nบรรทัด2', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/m1/', timestamp: '2026-10-05T03:00:00+0000', like_count: 40, comments_count: 4 },
    { id: 'm2', caption: 'รูปสินค้า', media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/m2/', timestamp: '2026-10-06T03:00:00+0000', like_count: 9, comments_count: 0 },
    { id: 'm0', caption: 'old', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2025-12-20T03:00:00+0000' }] });
  if (path === '/' && p.ids) { const o = {}; p.ids.split(',').forEach(id => { o[id] = { insights: { data: [{ name: 'views', values: [{ value: 900 }] }, { name: 'shares', values: [{ value: 6 }] }, { name: 'saved', values: [{ value: 3 }] }] } }; }); return ok(o); }
  if (/\/(111|222)\//.test(path) || /\/(111|222)$/.test(path)) return ok({ data: [] }); // Facebook calls not under test
  return err('unexpected ' + path);
};
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x)); } };
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
ctx.setup(); post({ api: 'setpass', newPass: 'secret12' }); const P = 'secret12';
post({ api: 'fbapp', pass: P, appId: '1234567890', secret: 's', redirect: 'https://script.google.com/macros/s/X/exec' });
t('ig scopes only on the Instagram button', /instagram_manage_insights/.test(new URL(post({ api: 'fbconnect', pass: P, ig: true }).url).searchParams.get('scope')) && !/instagram/.test(new URL(post({ api: 'fbconnect', pass: P }).url).searchParams.get('scope')));
const r = post({ api: 'fbtoken', pass: P, token: 'EAA' });
t('instagram found after Facebook login', props['IG_ID_ig-eloop'] === 'ig1' && props['IG_USER_ig-eloop'] === 'eloopth' && /@eloopth/.test(r.message), r);
t('moov page without instagram reported', !props['IG_ID_ig-moov']);
ctx.igBackfillPending();
let d = JSON.parse(ctx.doGet({ parameter: {} }).text), m = d.accounts['ig-eloop'].monthly;
t('jan views (30+1 day chunks)', m.views[0] === 3100, m.views);
t('feb views', m.views[1] === 2800, m.views);
t('interactions + er', m.inter[0] === 155 && m.er[0] === 5, [m.inter, m.er]);
t('net follower = follows - unfollows', m.nf[0] === 31, m.nf);
t('output counts reels only', m.output[9] === 1 && m.output[0] === 0, m.output);
const c = d.clips.filter(x => x.acc === 'ig-eloop');
t('image kept as a post with its format', c.length === 2 && c.find(x => x.id === 'm2').format === 'รูปภาพ', c);
t('reel in clips with insights', c.find(x => x.id === 'm1').format === 'Reel' && c.find(x => x.id === 'm1').views === 900 && c.find(x => x.id === 'm1').likes === 40 && c.find(x => x.id === 'm1').shares === 6 && c.find(x => x.id === 'm1').saves === 3 && c.find(x => x.id === 'm1').title === 'รีวิว Moov ฟิล์ม', c);
t('posts_all counts every format', m.posts_all[9] === 2, m.posts_all);
t('status connected with followers', d.status['ig-eloop'].connected && d.status['ig-eloop'].username === 'eloopth' && d.status['ig-eloop'].followers === 5100 && d.status['ig-eloop'].lastSync, d.status['ig-eloop']);
t('moov not connected', d.status['ig-moov'].connected === false);
// a normal sync refreshes only recent months and keeps January
const rr = post({ api: 'syncig', pass: P, acc: 'ig-eloop' });
m = JSON.parse(ctx.doGet({ parameter: {} }).text).accounts['ig-eloop'].monthly;
t('partial sync keeps earlier months', rr.ok && m.views[0] === 3100 && m.views[10] > 0, [rr, m.views]);
t('no token in public data', !/pt1|pt2|long-EAA/.test(JSON.stringify(JSON.parse(ctx.doGet({ parameter: {} }).text))));
t('disconnect', post({ api: 'igdisconnect', pass: P, acc: 'ig-eloop' }).ok && !props['IG_ID_ig-eloop']);
console.log(`${pass} passed, ${fail} failed`);
