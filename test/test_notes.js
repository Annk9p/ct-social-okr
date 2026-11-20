// Report notes typed on the dashboard are saved and come back in the public data.
const { makeEnv } = require('./mock.js');
const { ctx } = makeEnv();
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x)); } };
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
const get = () => JSON.parse(ctx.doGet({ parameter: {} }).text);
ctx.setup(); post({ api: 'setpass', newPass: 'secret12' }); const P = 'secret12';
t('needs passcode', !post({ api: 'note', month: '2026-10', key: 'okr-TikTok-update', text: 'x' }).ok);
t('bad key rejected', !post({ api: 'note', pass: P, month: '2026-10', key: 'bad key<script>', text: 'x' }).ok);
t('save', post({ api: 'note', pass: P, month: '2026-10', key: 'okr-TikTok-update', text: '- ลงคลิปรีวิว\n- เกาะกระแส iPhone' }).ok);
t('update replaces', post({ api: 'note', pass: P, month: '2026-10', key: 'okr-TikTok-update', text: '- แก้แล้ว' }).ok && get().notes['2026-10']['okr-TikTok-update'] === '- แก้แล้ว');
t('one row per key', ctx.readTable_('notes').filter(r => r.key === 'okr-TikTok-update').length === 1);
t('other month separate', post({ api: 'note', pass: P, month: '2026-09', key: 'okr-TikTok-update', text: 'sep' }).ok && get().notes['2026-10']['okr-TikTok-update'] === '- แก้แล้ว');
t('empty text removes', post({ api: 'note', pass: P, month: '2026-09', key: 'okr-TikTok-update', text: '' }).ok && !(get().notes['2026-09'] || {})['okr-TikTok-update']);
console.log(`${pass} passed, ${fail} failed`);
