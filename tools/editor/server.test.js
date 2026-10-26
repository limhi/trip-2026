const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createServer } = require('./server');
const { makeRepoCopy, cleanup } = require('./test-helpers');

async function withServer(t) {
    const root = makeRepoCopy();
    const server = createServer({ root });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => { server.close(); cleanup(root); });
    const base = `http://127.0.0.1:${server.address().port}`;
    return { root, server, base };
}
const json = (base, p, method, body) => fetch(base + p, {
    method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body)
}).then(async r => ({ status: r.status, body: await r.json() }));

test('只綁 127.0.0.1', async t => {
    const { server } = await withServer(t);
    assert.equal(server.address().address, '127.0.0.1');
});

test('預設啟動參數：port 8780、綁 127.0.0.1', () => {
    const { parseArgs } = require('./server');
    assert.equal(parseArgs([]).port, 8780);
    assert.equal(parseArgs(['--port', '9000']).port, 9000);
});

test('GET /api/data 回 trip、places、mtimes', async t => {
    const { base } = await withServer(t);
    const r = await json(base, '/api/data', 'GET');
    assert.equal(r.status, 200);
    assert.ok(r.body.trip.site && r.body.places && r.body.mtimes.trip);
});

test('PUT /api/data：存檔成功寫入磁碟並回新 mtimes；外部改過後再存回 409', async t => {
    const { base, root } = await withServer(t);
    const { body: d } = await json(base, '/api/data', 'GET');
    d.trip.site.documentTitle = '透過 API 存檔';
    const ok = await json(base, '/api/data', 'PUT', d);
    assert.equal(ok.status, 200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data/trip.json'), 'utf8')).site.documentTitle, '透過 API 存檔');

    const file = path.join(root, 'data/trip.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('透過 API 存檔', '外部'));
    const later = new Date(Date.now() + 5000); fs.utimesSync(file, later, later);
    const external = fs.readFileSync(file, 'utf8');
    d.mtimes = ok.body.mtimes;
    d.trip.site.documentTitle = '又一次';
    const conflict = await json(base, '/api/data', 'PUT', d);
    assert.equal(conflict.status, 409);
    assert.ok(conflict.body.error);
    assert.equal(fs.readFileSync(file, 'utf8'), external);
});

test('PUT /api/data：壞掉的 JSON 回 400', async t => {
    const { base } = await withServer(t);
    const r = await fetch(base + '/api/data', { method: 'PUT', body: '{壞掉' });
    assert.equal(r.status, 400);
});

test('靜態檔：/ 提供編輯器前端；不能用 .. 讀到 public 以外', async t => {
    const { base } = await withServer(t);
    const r = await fetch(base + '/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    // fetch 會正規化 ..，改用原始請求
    const status = await new Promise(res => {
        const u = new URL(base);
        http.get({ host: u.hostname, port: u.port, path: '/..%2fserver.js' }, x => { x.resume(); res(x.statusCode); });
    });
    assert.equal(status, 404);
});

test('Host 標頭不是本機位址時拒絕（防 DNS rebinding）', async t => {
    const { server } = await withServer(t);
    const status = await new Promise(res => {
        http.get({ host: '127.0.0.1', port: server.address().port, path: '/api/data', headers: { host: 'evil.example' } }, x => { x.resume(); res(x.statusCode); });
    });
    assert.equal(status, 403);
});
