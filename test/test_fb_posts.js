// Facebook: Reels plus every other post format; a Reel's own post is not stored twice.
const { makeEnv } = require('./mock.js');
const { ctx, props } = makeEnv();
const ok = o => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(o) });
const err = m => ({ getResponseCode: () => 400, getContentText: () => JSON.stringify({ error: { message: m, code: 100 } }) });
ctx.UrlFetchApp.fetch = url => {
  const u = new URL(url), p = Object.fromEntries(u.searchParams), path = u.pathname.replace('/v23.0', '');
  if (/\/insights$/.test(path)) return ok({ data: [{ name: p.metric, values: [] }] });
  if (path === '/111/video_reels') return ok({ data: [{ id: 'r1', post_id: '111_900', description: 'Reel รีวิว', created_time: '2026-10-05T03:00:00+0000', permalink_url: '/reel/r1', picture: 'https://scontent.example/r1.jpg', length: 41.6, likes: { summary: { total_count: 4 } }, comments: { summary: { total_count: 1 } } }] });
  if (path === '/111/posts') {
    if (/attachments/.test(p.fields)) return ok({ data: [
      { id: '111_900', message: 'Reel รีวิว', created_time: '2026-10-05T03:00:00+0000', attachments: { data: [{ media_type: 'video' }] } },
      { id: '111_901', message: 'รูปสินค้าใหม่\nบรรทัด2', created_time: '2026-10-06T03:00:00+0000', permalink_url: 'https://www.facebook.com/111/posts/901', full_picture: 'https://scontent.example/901.jpg', attachments: { data: [{ media_type: 'photo' }] }, reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 2 } }, shares: { count: 3 } },
      { id: '111_902', message: 'อัลบั้มงานอีเวนต์', created_time: '2026-10-07T03:00:00+0000', attachments: { data: [{ media_type: 'album' }] } },
      { id: '111_903', message: 'อ่านบทความ', created_time: '2026-10-08T03:00:00+0000', attachments: { data: [{ media_type: 'link' }] } },
      { id: '111_904', message: 'สวัสดีวันจันทร์', created_time: '2026-10-09T03:00:00+0000' }] });
    return ok({ data: [] });
  }
  if (path === '/' && p.ids) {
    const m = (p.fields.match(/metric\(([^)]+)\)/) || [])[1];
    if (m === 'post_media_view') return err('(#100) invalid metric');
    const o = {}; p.ids.split(',').forEach((id, i) => { o[id] = { [/^r/.test(id) ? 'video_insights' : 'insights']: { data: [{ name: m, values: [{ value: 100 * (i + 1) }] }] } }; }); return ok(o);
  }
  return ok({ data: [] });
};
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x)); } };
ctx.setup();
Object.assign(props, { 'FB_PT_fb-eloop': 'pt1', 'FB_PAGE_fb-eloop': '111', 'FB_TITLE_fb-eloop': 'Orsen & Eloop Thailand', 'FB_FMT_fb-eloop': '4', 'LAST_OK_fb-eloop': '2026-11-19 06:00' });
ctx.syncFacebook_('fb-eloop', false); // format version bump forces a full year
const d = JSON.parse(ctx.doGet({ parameter: {} }).text), c = d.clips.filter(x => x.acc === 'fb-eloop');
const f = id => c.find(x => x.id === id) || {};
t('reel stored once as Reel', f('r1').format === 'Reel' && !c.some(x => x.id === '111_900'), c.map(x => [x.id, x.format]));
t('photo post with counts and views', f('111_901').format === 'รูปภาพ' && f('111_901').likes === 12 && f('111_901').shares === 3 && f('111_901').title === 'รูปสินค้าใหม่' && f('111_901').views > 0, f('111_901'));
t('album, link, text formats', f('111_902').format === 'อัลบั้ม' && f('111_903').format === 'ลิงก์' && f('111_904').format === 'ข้อความ', c.map(x => [x.id, x.format]));
t('thumbnails and reel length stored', f('r1').thumb === 'https://scontent.example/r1.jpg' && f('r1').duration === 42 && f('111_901').thumb === 'https://scontent.example/901.jpg' && f('111_902').thumb === '', [f('r1'), f('111_901')]);
t('view metric fallback remembered', props.FB_POST_METRIC === 'post_impressions');
const m = d.accounts['fb-eloop'].monthly;
t('output still counts Reels only', m.output[9] === 1, m.output);
t('posts_all counts every post', m.posts_all[9] === 5, m.posts_all);
t('format version saved', props['FB_FMT_fb-eloop'] === '5');
console.log(`${pass} passed, ${fail} failed`);
