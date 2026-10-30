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
    assert.doesNotMatch(r.out, /警告.*路線快取/);
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

// ───── 移動列（ticket 02）：不一致、缺列只警告，不改結束碼 ─────
const { syncTrip } = require('./sync-moves');
const buildData = require('./build-data');
const rewrite = (root, fn) => {
    const f = path.join(root, 'data/trip.json');
    const trip = JSON.parse(fs.readFileSync(f, 'utf8'));
    const places = JSON.parse(fs.readFileSync(path.join(root, 'data/places.json'), 'utf8'));
    fn(trip, places);
    fs.writeFileSync(f, JSON.stringify(trip, null, 2) + '\n');
    buildData.writeAtomic(root, buildData.build(root));
};

test('check：移動列不一致或缺列只警告、結束碼 0；同步後沒有移動列警告', withRepo(root => {
    rewrite(root, (trip, places) => {
        syncTrip(trip, places);
        // 找一個前後都是完整時間區間的移動列：改壞它；另找一個移動列刪掉造成缺列
        const range = x => x && /^\d\d:\d\d - \d\d:\d\d$/.test(x.time || '');
        const found = [];
        trip.days.forEach(d => d.items.forEach((x, k) => { if (x.type === 'move' && range(d.items[k - 1]) && range(d.items[k + 1])) found.push([d, k]); }));
        assert.ok(found.length >= 2, '測試資料至少要有兩個前後都是完整時間的移動列');
        found[0][0].items[found[0][1]].time = '00:01 - 00:02';
        found[1][0].items.splice(found[1][1], 1);
    });
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /警告：.*移動列時間與推導值不同/);
    assert.match(r.out, /警告：.*缺少移動列/);
    rewrite(root, (trip, places) => syncTrip(trip, places));
    const r2 = run(root);
    assert.equal(r2.code, 0, r2.out);
    assert.doesNotMatch(r2.out, /移動列時間與推導值不同|缺少移動列/);
}));

test('check：資料有其他錯誤時結束碼仍非 0', withRepo(root => {
    rewrite(root, trip => { trip.days[0].items.push({ type: 'spot', place: 'no_such_place' }); });
    assert.notEqual(run(root).code, 0);
}));
