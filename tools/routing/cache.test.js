// node --test tools/routing/cache.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cache = require('./cache');
const buildData = require('../build-data');
const { makeRepoCopy, cleanup } = require('../editor/test-helpers');

const K1 = '121.44330,24.97220>121.80400,24.67180';
const K2 = '121.10000,24.10000>121.20000,24.20000';
const K3 = '120.00000,23.00000>120.50000,23.50000';
const leg = (extra = {}) => ({ distance: 75323, duration: 4334, geometry: 'abc', provider: 'osrm', computedAt: '2026-10-26', ...extra });
const load = src => { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(src, ctx); return JSON.parse(JSON.stringify(ctx.window)); };

test('serialize：legs 依 key 排序、欄位順序固定，與輸入順序無關，且逐位元組相同', () => {
    const a = { profile: 'driving', legs: { [K1]: leg(), [K2]: leg() } };
    const b = { legs: { [K2]: { computedAt: '2026-10-26', provider: 'osrm', geometry: 'abc', duration: 4334, distance: 75323 }, [K1]: leg() }, profile: 'driving' };
    const sa = cache.serialize(a);
    assert.equal(sa, cache.serialize(b));
    assert.equal(sa, cache.serialize(JSON.parse(sa)));
    assert.ok(sa.indexOf(K2) < sa.indexOf(K1), '121.1… 排在 121.4… 前面');
    assert.ok(sa.endsWith('}\n'));
    assert.ok(!sa.includes('\r'));
    assert.ok(sa.includes('\n  "legs": {\n    "121.1'));
    assert.ok(sa.indexOf('"distance"') < sa.indexOf('"duration"') && sa.indexOf('"duration"') < sa.indexOf('"geometry"'));
});

test('serialize：空快取', () => {
    assert.equal(cache.serialize(cache.empty()), '{\n  "profile": "driving",\n  "legs": {}\n}\n');
});

test('prune：只留下目前行程使用的 key，不修改輸入', () => {
    const routes = { profile: 'driving', legs: { [K1]: leg(), [K2]: leg(), [K3]: leg() } };
    const pruned = cache.prune(routes, new Set([K1, K3]));
    assert.deepEqual(Object.keys(pruned.legs).sort(), [K3, K1]);
    assert.equal(Object.keys(routes.legs).length, 3);
});

test('usedKeys／missingKeys／unusedKeys：由目前行程算出', () => {
    const trip = { days: [{ day: 1, items: [{ type: 'spot', place: 'a' }, { type: 'spot', place: 'b' }] }] };
    const places = { a: { lat: 24.1, lng: 121.1 }, b: { lat: 24.2, lng: 121.2 } };
    assert.deepEqual([...cache.usedKeys(trip, places)], [K2]);
    assert.deepEqual(cache.missingKeys(trip, places, cache.empty()), [K2]);
    const full = { profile: 'driving', legs: { [K2]: leg(), [K3]: leg() } };
    assert.deepEqual(cache.missingKeys(trip, places, full), []);
    assert.deepEqual(cache.unusedKeys(trip, places, full), [K3]);
});

test('checkStructure：distance、duration 為數字，geometry 為字串', () => {
    assert.deepEqual(cache.checkStructure({ profile: 'driving', legs: { [K1]: leg() } }), []);
    assert.deepEqual(cache.checkStructure(cache.empty()), []);
    const bad = routes => cache.checkStructure(routes).join('\n');
    assert.match(bad({ profile: 'driving', legs: { [K1]: leg({ distance: '1' }) } }), /distance/);
    assert.match(bad({ profile: 'driving', legs: { [K1]: leg({ duration: null }) } }), /duration/);
    assert.match(bad({ profile: 'driving', legs: { [K1]: leg({ geometry: 5 }) } }), /geometry/);
    assert.match(bad({ profile: 'driving', legs: { 'bad-key': leg() } }), /key/);
    assert.match(bad({ profile: 'driving' }), /legs/);
    assert.match(bad(null), /routes\.json/);
});

test('真實 data/routes.json 序列化後逐位元組不變（檔案已是固定格式）', () => {
    const file = path.join(__dirname, '..', '..', 'data', 'routes.json');
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(cache.serialize(JSON.parse(text)), text);
});

test('write／read：寫入 routes.json 並同步產生 routes.js、routes-geo.js（內容符合 spec 7.2）', t => {
    const root = makeRepoCopy();
    t.after(() => cleanup(root));
    cache.write(root, { profile: 'driving', legs: { [K1]: leg(), [K2]: leg({ geometry: 'zzz' }) } });
    const r = cache.read(root);
    assert.deepEqual(Object.keys(r.legs), [K2, K1]);
    const routesJs = load(fs.readFileSync(path.join(root, 'data/routes.js'), 'utf8'));
    assert.deepEqual(routesJs.TRIP_ROUTES, { legs: { [K1]: { distance: 75323, duration: 4334 }, [K2]: { distance: 75323, duration: 4334 } } });
    const geoJs = load(fs.readFileSync(path.join(root, 'data/routes-geo.js'), 'utf8'));
    assert.deepEqual(geoJs.TRIP_ROUTES_GEO, { [K1]: 'abc', [K2]: 'zzz' });
    assert.deepEqual(buildData.build(root)['data/routes.js'], fs.readFileSync(path.join(root, 'data/routes.js'), 'utf8'));
});

test('write：連續寫兩次檔案逐位元組相同', t => {
    const root = makeRepoCopy();
    t.after(() => cleanup(root));
    const routes = { profile: 'driving', legs: { [K1]: leg(), [K2]: leg() } };
    const files = ['data/routes.json', 'data/routes.js', 'data/routes-geo.js'];
    cache.write(root, routes);
    const first = files.map(f => fs.readFileSync(path.join(root, f), 'utf8'));
    cache.write(root, JSON.parse(JSON.stringify(routes)));
    assert.deepEqual(files.map(f => fs.readFileSync(path.join(root, f), 'utf8')), first);
});
