// node --test tools/check-routes.test.js：check.js 的路線檢查（在暫存 repo 複本內改壞檔案再執行）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const cache = require('./routing/cache');
const model = require('../js/model');
const { makeRepoCopy, cleanup } = require('./editor/test-helpers');

const run = root => {
    const r = spawnSync('node', ['tools/check.js'], { cwd: root, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
};
const withRepo = fn => async t => {
    const root = makeRepoCopy();
    t.after(() => cleanup(root));
    await fn(root);
};
const leg = (extra = {}) => ({ distance: 1000, duration: 600, geometry: 'abc', provider: 'osrm', computedAt: '2026-10-26', ...extra });
const firstKey = root => {
    const trip = JSON.parse(fs.readFileSync(path.join(root, 'data/trip.json'), 'utf8'));
    const places = JSON.parse(fs.readFileSync(path.join(root, 'data/places.json'), 'utf8'));
    return model.getLegs(trip.days[0], places)[0].key;
};

test('check：空殼快取通過，缺少路段只警告不失敗', withRepo(root => {
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /警告.*沒有路線快取/);
}));

test('check：快取完整時沒有缺段警告', withRepo(root => {
    const trip = JSON.parse(fs.readFileSync(path.join(root, 'data/trip.json'), 'utf8'));
    const places = JSON.parse(fs.readFileSync(path.join(root, 'data/places.json'), 'utf8'));
    const routes = cache.empty();
    for (const k of cache.usedKeys(trip, places)) routes.legs[k] = leg();
    cache.write(root, routes);
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    assert.doesNotMatch(r.out, /警告/);
}));

test('check：有沒被使用的舊筆只警告不失敗', withRepo(root => {
    const routes = cache.empty();
    routes.legs['120.00000,23.00000>120.50000,23.50000'] = leg();
    cache.write(root, routes);
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /警告.*舊筆/);
}));

test('check：手改 routes.js 會被抓到', withRepo(root => {
    fs.appendFileSync(path.join(root, 'data/routes.js'), '// 手改\n');
    const r = run(root);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /data\/routes\.js.*不同步/);
}));

test('check：手改 routes-geo.js 會被抓到', withRepo(root => {
    fs.appendFileSync(path.join(root, 'data/routes-geo.js'), '// 手改\n');
    const r = run(root);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /data\/routes-geo\.js.*不同步/);
}));

test('check：只改 routes.json（沒重新產生）會被抓到', withRepo(root => {
    const routes = cache.empty();
    routes.legs[firstKey(root)] = leg();
    fs.writeFileSync(path.join(root, 'data/routes.json'), cache.serialize(routes));
    const r = run(root);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /data\/routes\.js.*不同步/);
    assert.match(r.out, /data\/routes-geo\.js.*不同步/);
}));

test('check：routes.json 結構不對（distance 不是數字）會失敗', withRepo(root => {
    const routes = cache.empty();
    routes.legs[firstKey(root)] = leg({ distance: '1000' });
    cache.write(root, routes);   // 兩邊同步，只有結構有問題
    const r = run(root);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /distance 必須是數字/);
}));

test('check：routes.json 讀不到或不是合法 JSON 會失敗', withRepo(root => {
    fs.writeFileSync(path.join(root, 'data/routes.json'), '{ 壞掉');
    const r = run(root);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /routes\.json/);
}));

test('check：site.routing 不是正數會失敗', withRepo(root => {
    const store = require('./editor/store');
    const d = store.load(root);
    d.trip.site.routing.maxLegMinutes = 0;
    store.save(root, d);
    const r = run(root);
    assert.notEqual(r.code, 0);
    assert.match(r.out, /maxLegMinutes/);
}));
