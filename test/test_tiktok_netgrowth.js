// Net Follower for TikTok = "การเติบโตสุทธิ" from the business overview; FollowerHistory only fills days without it.
// Uses the team's real export files from ~/Downloads when they are there (skips otherwise).
const { makeEnv } = require('./mock.js'); const fs = require('fs');
const dl = process.env.HOME + '/Downloads/';
const files = ['ภาพรวม(2026_01_01-2026_10_31).csv', 'Overview 6.csv', 'Followers_eloopth 1-10-26.zip'];
if (!files.every(f => fs.existsSync(dl + f))) { console.log('0 passed, 0 failed (export files not on this machine)'); process.exit(0); }
const { ctx } = makeEnv(); ctx.setup();
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
post({ api: 'setpass', newPass: 'secret12' });
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x)); } };
const up = f => post({ api: 'upload', pass: 'secret12', acc: 'tt-eloop', name: f, data: fs.readFileSync(dl + f).toString('base64') });
// read the business file's own monthly sums of การเติบโตสุทธิ
const rows = fs.readFileSync(dl + files[0], 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
const want = Array(12).fill(0), seen = Array(12).fill(false);
rows.forEach(r => { const m = +r[0].slice(5, 7) - 1; if (r.slice(1).some(v => +v)) { want[m] += +r[11]; seen[m] = true; } });
files.forEach(up);
const nf = JSON.parse(ctx.doGet({ parameter: {} }).text).accounts['tt-eloop'].monthly.nf;
console.log('business net growth by month:', JSON.stringify(want.slice(0, 10)));
console.log('dashboard nf:               ', JSON.stringify(nf.slice(0, 10)));
t('months fully covered by the business file use its net growth (Oct)', nf[9] === want[9], [nf[9], want[9]]);
t('January uses business net growth', nf[0] === want[0], [nf[0], want[0]]);
t('June (not in the business file) comes from FollowerHistory', nf[5] != null && nf[5] !== 0, nf[5]);
console.log(`${pass} passed, ${fail} failed`);
