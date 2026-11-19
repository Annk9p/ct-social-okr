// Pages of the person who logs in that are not the team's must not be stored or shown.
const { makeEnv } = require('./mock.js');
const { ctx, props } = makeEnv();
const ok = o => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(o) });
ctx.UrlFetchApp.fetch = url => {
  const u = new URL(url), p = Object.fromEntries(u.searchParams);
  if (u.pathname.endsWith('/oauth/access_token')) return ok({ access_token: 'long-' + p.fb_exchange_token });
  if (u.pathname.endsWith('/me/accounts')) return ok({ data: [{ id: '1', name: 'ป้าเก๋ ดอกบัว', access_token: 'a' }, { id: '111', name: 'Orsen & Eloop Thailand', access_token: 'pt1' }, { id: '3', name: 'ATMMobile', access_token: 'c' }] });
  return ok({ data: [] });
};
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x)); } };
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).text);
ctx.setup(); post({ api: 'setpass', newPass: 'secret12' });
post({ api: 'fbapp', pass: 'secret12', appId: '1234567890', secret: 's', redirect: 'https://script.google.com/macros/s/X/exec' });
// a list stored by an older version (all Pages) must be hidden too
props.FB_PAGELIST = JSON.stringify([{ id: '9', name: 'Sangkazee Photography' }]);
post({ api: 'fbtoken', pass: 'secret12', token: 'EAA' });
const d = JSON.parse(ctx.doGet({ parameter: {} }).text), names = d.status.setup.fbPages.map(p => p.name);
t('only team pages shown', JSON.stringify(names) === JSON.stringify(['Orsen & Eloop Thailand']), names);
t('other pages not stored', !/ป้าเก๋|ATMMobile|Sangkazee/.test(props.FB_PAGELIST), props.FB_PAGELIST);
t('nothing private anywhere in public json', !/ป้าเก๋|ATMMobile|Sangkazee/.test(JSON.stringify(d)));
t('eloop still connected', props['FB_PAGE_fb-eloop'] === '111');
console.log(`${pass} passed, ${fail} failed`);
