// 編輯器伺服器的路線 API（假 provider，不呼叫真實 OSRM）：node --test tools/editor/server-routes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createServer } = require('./server');
const cache = require('../routing/cache');
const model = require('../../js/model');
const { makeRepoCopy, cleanup } = require('./test-helpers');

function fakeProvider({ fail = false } = {}) {
    const calls = [];
    return {
        calls, name: 'fake',
        route: async (from, to) => {
            calls.push(model.legKey(from, to));
            if (fail) throw new Error('路線服務連線失敗：測試');
            return { distance: 12345, duration: 3000, geometry: 'geo' + calls.length };
        }
    };
}

async function withServer(t, providerOpts) {
    const root = makeRepoCopy();
    const provider = fakeProvider(providerOpts);
    const server = createServer({ root, provider });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => { server.close(); cleanup(root); });
    return { root, provider, base: `http://127.0.0.1:${server.address().port}` };
}
const json = (base, p, method, body) => fetch(base + p, {
    method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body)
}).then(async r => ({ status: r.status, body: await r.json() }));
const text = async (base, p) => (await fetch(base + p)).text();
const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');

// 行程裡前兩段不同的路
async function twoLegs(base) {
    const { body: d } = await json(base, '/api/data', 'GET');
    const legs = model.getLegs(d.trip.days.find(day => model.getLegs(day, d.places).length >= 2), d.places);
    return { d, legs: legs.slice(0, 2).map(l => ({ key: l.key, from: l.from, to: l.to })) };
}

test('POST /api/routes/compute：回每段狀態；第二次命中快取不再呼叫 provider', async t => {
    const { base, provider } = await withServer(t);
    const { legs } = await twoLegs(base);
    const first = await json(base, '/api/routes/compute', 'POST', { legs });
    assert.equal(first.status, 200);
    assert.equal(first.body.results[legs[0].key].status, 'ok');
    assert.equal(provider.calls.length, 2);

    const second = await json(base, '/api/routes/compute', 'POST', { legs });
    assert.equal(second.body.results[legs[0].key].status, 'cached');
    assert.equal(provider.calls.length, 2);

    const all = await json(base, '/api/routes/recompute-all', 'POST', { legs });
    assert.equal(all.body.results[legs[1].key].status, 'ok');
    assert.equal(provider.calls.length, 4);
});

test('POST /api/routes/compute：壞請求回 400', async t => {
    const { base } = await withServer(t);
    assert.equal((await json(base, '/api/routes/compute', 'POST', { legs: [{ key: 'x' }] })).status, 400);
    assert.equal((await json(base, '/api/routes/compute', 'POST', {})).status, 400);
});

test('GET /api/routes：回草稿的 distance 與 duration（不含 geometry）', async t => {
    const { base } = await withServer(t);
    assert.deepEqual((await json(base, '/api/routes', 'GET')).body, { legs: {}, unsaved: false });
    const { legs } = await twoLegs(base);
    await json(base, '/api/routes/compute', 'POST', { legs });
    const r = (await json(base, '/api/routes', 'GET')).body;
    assert.deepEqual(r.legs[legs[0].key], { distance: 12345, duration: 3000 });
    assert.equal(r.unsaved, true);
});

test('預覽：算完後 /preview/data/routes.js 與 routes-geo.js 是草稿，真檔不受影響', async t => {
    const { base, root } = await withServer(t);
    const { d, legs } = await twoLegs(base);
    const diskRoutes = read(root, 'data/routes.js'), diskGeo = read(root, 'data/routes-geo.js'), diskJson = read(root, 'data/routes.json');
    await json(base, '/api/draft', 'POST', { trip: d.trip, places: d.places });
    assert.equal(await text(base, '/preview/data/routes.js'), diskRoutes, '還沒算時與磁碟相同');

    await json(base, '/api/routes/compute', 'POST', { legs });
    const routesJs = await text(base, '/preview/data/routes.js');
    assert.ok(routesJs.includes(legs[0].key) && routesJs.includes('12345'));
    assert.ok((await text(base, '/preview/data/routes-geo.js')).includes('geo1'));

    assert.equal(read(root, 'data/routes.js'), diskRoutes);
    assert.equal(read(root, 'data/routes-geo.js'), diskGeo);
    assert.equal(read(root, 'data/routes.json'), diskJson);
});

test('預覽：先算、後送草稿，也會用到已算的路線', async t => {
    const { base } = await withServer(t);
    const { d, legs } = await twoLegs(base);
    await json(base, '/api/routes/compute', 'POST', { legs });
    await json(base, '/api/draft', 'POST', { trip: d.trip, places: d.places });
    assert.ok((await text(base, '/preview/data/routes.js')).includes(legs[0].key));
});

test('PUT /api/data：存檔寫入 routes.json（移除沒用的舊筆）並同步 routes*.js', async t => {
    const { base, root } = await withServer(t);
    const { d, legs } = await twoLegs(base);
    await json(base, '/api/routes/compute', 'POST', { legs: [...legs, { key: model.legKey({ lat: 1, lng: 2 }, { lat: 3, lng: 4 }), from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 } }] });
    assert.equal(Object.keys((await json(base, '/api/routes', 'GET')).body.legs).length, 3);

    const res = await json(base, '/api/data', 'PUT', d);
    assert.equal(res.status, 200);
    assert.equal(res.body.routes, undefined, '回應不帶路線資料');
    const onDisk = cache.read(root);
    assert.deepEqual(Object.keys(onDisk.legs).sort(), legs.map(l => l.key).sort());
    assert.ok(read(root, 'data/routes.js').includes(legs[1].key));
    assert.ok(read(root, 'data/routes-geo.js').includes('geo1'));
    // 草稿也同步修剪
    assert.equal(Object.keys((await json(base, '/api/routes', 'GET')).body.legs).length, 2);
    assert.equal((await json(base, '/api/routes', 'GET')).body.unsaved, false, '存檔後路線草稿與磁碟一致');
});

test('provider 失敗：回 failed 與錯誤，草稿不變，存檔仍成功', async t => {
    const { base, root } = await withServer(t, { fail: true });
    const { d, legs } = await twoLegs(base);
    const r = await json(base, '/api/routes/compute', 'POST', { legs });
    assert.equal(r.status, 200);
    assert.equal(r.body.results[legs[0].key].status, 'failed');
    assert.match(r.body.results[legs[0].key].error, /連線失敗/);
    assert.deepEqual((await json(base, '/api/routes', 'GET')).body, { legs: {}, unsaved: false });

    d.trip.site.documentTitle = '失敗後仍可存檔';
    const res = await json(base, '/api/data', 'PUT', d);
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(read(root, 'data/trip.json')).site.documentTitle, '失敗後仍可存檔');
    assert.deepEqual(cache.read(root).legs, {});
});

test('POST /api/routes/reset：丟掉記憶體裡算好但沒存檔的路線，回到磁碟版；沒有 X-Requested-With 標頭回 403', async t => {
    const { base } = await withServer(t);
    const { legs } = await twoLegs(base);
    const post = headers => fetch(base + '/api/routes/reset', { method: 'POST', headers: { 'content-type': 'application/json', ...headers } })
        .then(async r => ({ status: r.status, body: await r.json() }));
    await json(base, '/api/routes/compute', 'POST', { legs });
    assert.equal((await json(base, '/api/routes', 'GET')).body.unsaved, true);

    assert.equal((await post({})).status, 403);
    assert.equal((await json(base, '/api/routes', 'GET')).body.unsaved, true);   // 沒標頭＝沒動

    const res = await post({ 'x-requested-with': 'trip-editor' });
    assert.equal(res.status, 200);
    const after = (await json(base, '/api/routes', 'GET')).body;
    assert.equal(after.unsaved, false);
    assert.deepEqual(after.legs, {});   // 測試用複本的磁碟快取是空殼
});
