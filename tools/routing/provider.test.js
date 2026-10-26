// node --test tools/routing/provider.test.js：只用假 HTTP 伺服器，不呼叫真實 OSRM
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const provider = require('./provider');

const FROM = { lat: 24.9722, lng: 121.4433 };
const TO = { lat: 24.6718, lng: 121.804 };

// handler(req, res, n) 決定回應；回傳 { base, requests, close }
async function fakeServer(t, handler) {
    const requests = [];
    const server = http.createServer((req, res) => {
        requests.push({ url: req.url, headers: req.headers, at: Date.now() });
        handler(req, res, requests.length);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => { server.closeAllConnections(); server.close(); });
    return { base: `http://127.0.0.1:${server.address().port}`, requests };
}
const ok = body => (req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
const OSRM_OK = { code: 'Ok', routes: [{ distance: 75323.4, duration: 4334.1, geometry: '_p~iF~ps|U_ulLnnqC', legs: [{ steps: [] }] }] };

test('route：回傳 { distance, duration, geometry }，請求網址符合 OSRM 規格', async t => {
    const s = await fakeServer(t, ok(OSRM_OK));
    const { route } = provider.createProvider({ baseUrl: s.base });
    const r = await route(FROM, TO);
    assert.deepEqual(r, { distance: 75323.4, duration: 4334.1, geometry: '_p~iF~ps|U_ulLnnqC' });
    assert.equal(s.requests[0].url, '/route/v1/driving/121.44330,24.97220;121.80400,24.67180?overview=simplified&geometries=polyline');
});

test('route：帶識別專案的 User-Agent', async t => {
    const s = await fakeServer(t, ok(OSRM_OK));
    await provider.createProvider({ baseUrl: s.base }).route(FROM, TO);
    assert.match(s.requests[0].headers['user-agent'], /trip-2026/);
});

test('route：預設設定符合 DESIGN 15.4（逾時 15 秒、間隔 1 秒、OSRM 公開 demo）', () => {
    assert.equal(provider.DEFAULTS.timeoutMs, 15000);
    assert.equal(provider.DEFAULTS.minIntervalMs, 1000);
    assert.equal(provider.DEFAULTS.baseUrl, 'https://router.project-osrm.org');
    assert.equal(typeof provider.route, 'function');
});

test('route：同時呼叫也會逐一送出，兩次請求間隔至少 1 秒', async t => {
    const s = await fakeServer(t, ok(OSRM_OK));
    const { route } = provider.createProvider({ baseUrl: s.base });
    await Promise.all([route(FROM, TO), route(TO, FROM), route(FROM, TO)]);
    assert.equal(s.requests.length, 3);
    for (let i = 1; i < 3; i++) assert.ok(s.requests[i].at - s.requests[i - 1].at >= 990,`第 ${i + 1} 次與前一次相隔 ${s.requests[i].at - s.requests[i - 1].at} ms`);
});

test('route：逾時就失敗，不重試', async t => {
    const s = await fakeServer(t, () => { /* 不回應 */ });
    const { route } = provider.createProvider({ baseUrl: s.base, timeoutMs: 150 });
    await assert.rejects(route(FROM, TO), /逾時/);
    await new Promise(r => setTimeout(r, 400));
    assert.equal(s.requests.length, 1);
});

test('route：標頭回了但 body 一直不結束，也算逾時（不是「格式不是 JSON」）', async t => {
    const s = await fakeServer(t, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"code":'); });
    const { route } = provider.createProvider({ baseUrl: s.base, timeoutMs: 150 });
    await assert.rejects(route(FROM, TO), e => /路線服務逾時/.test(e.message) && !/JSON/.test(e.message));
});

test('route：HTTP 錯誤、OSRM 錯誤碼、格式不對都失敗且不重試', async t => {
    const cases = [
        [(req, res) => { res.statusCode = 429; res.end('slow down'); }, /429/],
        [(req, res) => { res.statusCode = 500; res.end('boom'); }, /500/],
        [ok({ code: 'NoRoute', message: 'Impossible route' }), /NoRoute/],
        [ok({ code: 'Ok', routes: [] }), /沒有路線/],
        [(req, res) => res.end('<html>not json</html>'), /格式/]
    ];
    for (const [handler, pattern] of cases) {
        const s = await fakeServer(t, handler);
        const { route } = provider.createProvider({ baseUrl: s.base, minIntervalMs: 0 });
        await assert.rejects(route(FROM, TO), pattern);
        await new Promise(r => setTimeout(r, 100));
        assert.equal(s.requests.length, 1, String(pattern));
    }
});

test('route：連不上伺服器時失敗（錯誤訊息可顯示）', async t => {
    const { route } = provider.createProvider({ baseUrl: 'http://127.0.0.1:1', minIntervalMs: 0 });
    await assert.rejects(route(FROM, TO), /連線|ECONNREFUSED|fetch/);
});

test('route：一次失敗不影響後面的請求', async t => {
    const s = await fakeServer(t, (req, res, n) => n === 1 ? (res.statusCode = 500, res.end('x')) : ok(OSRM_OK)(req, res));
    const { route } = provider.createProvider({ baseUrl: s.base, minIntervalMs: 0 });
    await assert.rejects(route(FROM, TO));
    assert.equal((await route(FROM, TO)).distance, 75323.4);
});
