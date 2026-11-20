// Jobs take turns: when another job holds the lock, a write is refused with a clear message; nested calls still run.
const { makeEnv } = require('./mock.js');
const { ctx } = makeEnv();
let busy = false, held = 0;
ctx.LockService.getScriptLock = () => ({ tryLock: () => { if (busy) return false; held++; return true; }, releaseLock: () => { held--; } });
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x)); } };
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
ctx.setup(); post({ api: 'setpass', newPass: 'secret12' });
busy = true;
const r = post({ api: 'target', pass: 'secret12', account: 'tt-eloop', key: 'views', field: 'target', value: '1' });
t('busy: refused with message', !r.ok && /กำลังดึงหรือนำเข้าข้อมูลอยู่/.test(r.error), r);
t('busy: nothing written', ctx.readTable_('targets').find(x => x.account === 'tt-eloop' && x.key === 'views').target !== 1);
busy = false;
t('free: saved', post({ api: 'target', pass: 'secret12', account: 'tt-eloop', key: 'views', field: 'target', value: '1' }).ok);
// nested: withLock_ around importTikTok (which locks itself) must not deadlock
t('nested lock runs once', Array.isArray(ctx.withLock_(function () { return ctx.importTikTok([]); })) && held === 0);
console.log(`${pass} passed, ${fail} failed`);
