// 前端要用同一份 js/model.js（不複製驗證與編號邏輯），伺服器以 /lib/model.js 提供
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createServer } = require('./server');
const { repoRoot } = require('./test-helpers');

test('GET /lib/model.js 回 repo 的 js/model.js', async t => {
    const server = createServer({ root: repoRoot });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => server.close());
    const res = await fetch(`http://127.0.0.1:${server.address().port}/lib/model.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.equal(await res.text(), fs.readFileSync(path.join(repoRoot, 'js', 'model.js'), 'utf8'));
});
