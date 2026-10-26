// 存檔時一併寫路線快取（ticket 10）：node --test tools/editor/store-routes.test.js
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
