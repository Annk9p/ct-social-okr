// Monthly slides: the .pptx from the dashboard is saved to Drive as Google Slides; if Drive refuses, the .pptx is kept.
const { makeEnv } = require('./mock.js');
const { ctx, props } = makeEnv();
let calls = [], answer = 200;
ctx.UrlFetchApp.fetch = (url, o) => {
  calls.push({ url, o });
  return answer === 200
    ? { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: 'PRES1', name: 'Content OKR ต.ค. 2026', webViewLink: 'https://docs.google.com/presentation/d/PRES1/edit' }) }
    : { getResponseCode: () => 403, getContentText: () => '{"error":{"message":"Drive API has not been used"}}' };
};
let pass = 0, fail = 0; const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, JSON.stringify(x)); } };
ctx.setup();
const pptx = Buffer.from('PK\u0003\u0004 fake pptx bytes').toString('base64');
let r = ctx.saveSlides_({ name: 'Content OKR ต.ค. 2026', data: pptx });
const c = calls[0], body = Buffer.from(c.o.payload).toString('utf8');
t('uploads to Drive with conversion', /upload\/drive\/v3\/files\?uploadType=multipart/.test(c.url) && c.o.headers.Authorization === 'Bearer TOKEN', c.url);
t('asks for a Google Slides file in the team folder', body.includes('"mimeType":"application/vnd.google-apps.presentation"') && body.includes('"parents":["' + props.SLIDES_FOLDER + '"]'), body.slice(0, 300));
t('sends the pptx bytes', body.includes('fake pptx bytes') && /multipart\/related; boundary=/.test(c.o.contentType), c.o.contentType);
t('returns the Slides link', r.ok && r.converted && r.url === 'https://docs.google.com/presentation/d/PRES1/edit', r);
answer = 403;
r = ctx.saveSlides_({ name: 'Content OKR ต.ค. 2026', data: pptx });
t('falls back to keeping the pptx', r.ok && r.converted === false && /^https:\/\/drive\//.test(r.url) && /\.pptx$/.test(r.name), r);
t('same folder reused', calls.length === 2 && Object.keys(props).filter(k => k === 'SLIDES_FOLDER').length === 1);
let err = ''; try { ctx.saveSlides_({ name: 'x', data: '' }); } catch (e) { err = e.message; }
t('empty file rejected', /ว่าง/.test(err), err);
console.log(`${pass} passed, ${fail} failed`);
