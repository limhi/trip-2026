// node --test tools/build-routes.test.js：build-data 的路線產生檔
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildRoutes, buildFrom, build, HEADER } = require('./build-data');

const load = src => { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(src, ctx); return JSON.parse(JSON.stringify(ctx.window)); };
const K1 = '121.44330,24.97220>121.80400,24.67180';
const routes = { profile: 'driving', legs: { [K1]: { distance: 1, duration: 2, geometry: 'g', provider: 'osrm', computedAt: '2026-10-26' } } };

test('buildRoutes：routes.js 只含 distance／duration，routes-geo.js 只含 geometry，檔頭標示請勿手改', () => {
    const out = buildRoutes(routes);
    assert.deepEqual(Object.keys(out), ['data/routes.js', 'data/routes-geo.js']);
    assert.deepEqual(load(out['data/routes.js']).TRIP_ROUTES, { legs: { [K1]: { distance: 1, duration: 2 } } });
    assert.deepEqual(load(out['data/routes-geo.js']).TRIP_ROUTES_GEO, { [K1]: 'g' });
    for (const text of Object.values(out)) { assert.ok(text.startsWith(HEADER)); assert.ok(!text.includes('\r')); }
});

test('buildRoutes：空快取產生空殼', () => {
    const out = buildRoutes({ profile: 'driving', legs: {} });
    assert.deepEqual(load(out['data/routes.js']).TRIP_ROUTES, { legs: {} });
    assert.deepEqual(load(out['data/routes-geo.js']).TRIP_ROUTES_GEO, {});
});

test('buildFrom：沒有給 routes 時維持原本輸出（只有 trip／places），給了才多兩個路線檔', () => {
    const data = { trip: { a: 1 }, places: { b: 2 } };
    assert.deepEqual(Object.keys(buildFrom(data)), ['data/trip.js', 'data/places.js']);
    assert.deepEqual(Object.keys(buildFrom({ ...data, routes })), ['data/trip.js', 'data/places.js', 'data/routes.js', 'data/routes-geo.js']);
});

test('build：真實 repo 會一併產生路線檔，且與目前 data/routes*.js 相同', () => {
    const root = path.resolve(__dirname, '..');
    const out = build(root);
    for (const f of ['data/routes.js', 'data/routes-geo.js']) assert.equal(out[f], fs.readFileSync(path.join(root, f), 'utf8'), f);
});
