// 存檔時一併寫路線快取：node --test tools/editor/store-routes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const store = require('./store');
const cache = require('../routing/cache');
const model = require('../../js/model');
const { makeRepoCopy, cleanup } = require('./test-helpers');

const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8');
const check = root => execFileSync('node', ['tools/check.js'], { cwd: root, stdio: 'pipe' });
const entry = { distance: 1000, duration: 600, geometry: 'abc', provider: 'fake', computedAt: '2026-10-26' };

function withRepo(fn) {
    return async t => {
        const root = makeRepoCopy();
        t.after(() => cleanup(root));
        await fn(root, t);
    };
}

// 目前行程中的第一段路
function firstLegKey(d) {
    for (const day of d.trip.days) {
        const legs = model.getLegs(day, d.places);
        if (legs.length) return legs[0].key;
    }
    throw new Error('行程裡沒有任何路段');
}

test('save（帶 routes）：routes.json 不含已不用的舊筆，routes.js／routes-geo.js 同步，check.js 通過', withRepo(root => {
    const d = store.load(root);
    const used = firstLegKey(d);
    const stale = model.legKey({ lat: 1, lng: 2 }, { lat: 3, lng: 4 });
    const res = store.save(root, d, { routes: { profile: 'driving', legs: { [used]: entry, [stale]: entry } } });

    assert.deepEqual(Object.keys(cache.read(root).legs), [used]);
    assert.equal(read(root, 'data/routes.json'), cache.serialize({ profile: 'driving', legs: { [used]: entry } }));
    assert.ok(read(root, 'data/routes.js').includes(used));
    assert.ok(!read(root, 'data/routes.js').includes(stale));
    assert.ok(read(root, 'data/routes-geo.js').includes('abc'));
    assert.deepEqual(Object.keys(res.routes.legs), [used], '回傳修剪後的快取，讓伺服器更新草稿');
    check(root);
}));

test('save：磁碟上的 routes.json 比載入時新（被外部改過）回 409 且不寫入任何檔案', withRepo(root => {
    const d = store.load(root);
    assert.equal(typeof d.mtimes.routes, 'number');
    const file = path.join(root, 'data/routes.json');
    const later = new Date(Date.now() + 5000); fs.utimesSync(file, later, later);
    const files = ['data/trip.json', 'data/places.json', 'data/routes.json', 'data/routes.js'];
    const before = files.map(f => read(root, f));
    d.trip.site.documentTitle = '不該被寫入';
    assert.throws(() => store.save(root, d, { routes: { profile: 'driving', legs: {} } }), e => e.status === 409 && /routes\.json/.test(e.message));
    assert.deepEqual(files.map(f => read(root, f)), before);
}));

test('save：回傳的 mtimes 含 routes，拿來再存一次不會誤報衝突；缺 routes 的 mtimes 回 400', withRepo(root => {
    const d = store.load(root);
    const res = store.save(root, d, { routes: { profile: 'driving', legs: { [firstLegKey(d)]: entry } } });
    assert.equal(typeof res.mtimes.routes, 'number');
    store.save(root, { ...d, mtimes: res.mtimes }, { routes: res.routes });
    assert.throws(() => store.save(root, { ...d, mtimes: { trip: res.mtimes.trip, places: res.mtimes.places } }), e => e.status === 400);
}));

test('save（沒帶 routes）：不動 routes 相關檔案', withRepo(root => {
    const files = ['data/routes.json', 'data/routes.js', 'data/routes-geo.js'];
    const before = files.map(f => read(root, f));
    store.save(root, store.load(root));
    assert.deepEqual(files.map(f => read(root, f)), before);
}));

test('save（帶 routes）：寫入途中失敗，routes 檔案也不留下半套', withRepo(root => {
    const d = store.load(root);
    const files = ['data/trip.json', 'data/routes.json', 'data/routes.js', 'data/routes-geo.js'];
    const before = files.map(f => read(root, f));
    fs.mkdirSync(path.join(root, 'data/routes-geo.js.tmp'));
    assert.throws(() => store.save(root, d, { routes: { profile: 'driving', legs: { [firstLegKey(d)]: entry } } }));
    fs.rmdirSync(path.join(root, 'data/routes-geo.js.tmp'));
    assert.deepEqual(files.map(f => read(root, f)), before);
    assert.deepEqual(fs.readdirSync(path.join(root, 'data')).filter(f => f.endsWith('.tmp')), []);
}));
