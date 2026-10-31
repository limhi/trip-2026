// node --test tools/public-map.test.js：公開頁面每日地圖（js/map.js）的路線繪製，用假的 Leaflet 與假的 DOM
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

// 標準 polyline 編碼（精度 5），測試用，與被測的解碼器各自獨立
function encodePolyline(points) {
    let prevLat = 0, prevLng = 0, out = '';
    const enc = n => {
        let v = n < 0 ? ~(n << 1) : n << 1, s = '';
        while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
        return s + String.fromCharCode(v + 63);
    };
    for (const [lat, lng] of points) {
        const la = Math.round(lat * 1e5), ln = Math.round(lng * 1e5);
        out += enc(la - prevLat) + enc(ln - prevLng);
        prevLat = la; prevLng = ln;
    }
    return out;
}

// 假的 Leaflet：記錄畫了什麼。直接加在 map 上的放 rec.direct，加在 layerGroup 的放 group.layers
function makeEnv() {
    const rec = { direct: [], groups: [], scripts: [], fit: 0 };
    const addTo = function (target) { (target.layers || rec.direct).push(this); return this; };
    const L = {
        map() { return { fitBounds() { rec.fit++; }, invalidateSize() {} }; },
        tileLayer() { return { addTo() { return this; } }; },
        divIcon: o => o,
        marker(latlng, opts) { return { kind: 'marker', latlng, opts, addTo, bindPopup() { return this; } }; },
        polyline(points, opts) { return { kind: 'polyline', points, opts, addTo }; },
        layerGroup() {
            const g = { layers: [], addTo() { rec.groups.push(g); return g; }, clearLayers() { g.layers.length = 0; } };
            return g;
        },
        control: { scale: () => ({ addTo() {} }) }
    };
    const document = {
        createElement: () => ({}),
        head: { appendChild(el) { rec.scripts.push(el); } }
    };
    const ctx = { window: {}, console, L, document, requestAnimationFrame: fn => fn(), setTimeout: () => 0 };
    vm.createContext(ctx);
    for (const f of ['js/model.js', 'js/route-view.js', 'js/blocks.js', 'js/map.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
    }
    return { ctx, rec, Trip: ctx.window.Trip };
}

// 假的一天卡片：只提供 bindDayMap 會用到的節點
function makeDayEl() {
    const mk = () => ({ hidden: true, attrs: {}, text: '', cls: '', listeners: {}, removed: false,
        setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; }, remove() { this.removed = true; } });
    const span = { textContent: '' }, icon = { className: '' };
    const button = { ...mk(), querySelector: sel => (sel === 'span' ? span : icon), remove() { button.removed = true; } };
    const mapEl = mk();
    const panel = { ...mk(), querySelector: () => mapEl };
    const layout = { classList: { toggle() {} } };
    const dayEl = { querySelector: sel => ({ '.map-toggle-button': button, '.day-map-panel': panel, '.day-body-grid': layout })[sel] };
    return { dayEl, button, panel };
}

const P = {
    a: { name: 'A', lat: 24.1, lng: 121.1 },
    b: { name: 'B', lat: 24.2, lng: 121.2 },
    c: { name: 'C', lat: 24.3, lng: 121.3 }
};
const spot = place => ({ type: 'spot', tag: '景點', place });
const DAY = { day: 1, date: '', title: '', items: [spot('a'), spot('b'), spot('c')] };
const KEY_AB = '121.10000,24.10000>121.20000,24.20000';
const KEY_BC = '121.20000,24.20000>121.30000,24.30000';
const SITE = { routing: { trafficFactor: 1.25, maxLegMinutes: 180 } };
const ROAD_AB = [[24.1, 121.1], [24.12, 121.17], [24.2, 121.2]];
const ROAD_BC = [[24.2, 121.2], [24.25, 121.3], [24.3, 121.3]];
const CACHE = { legs: {
    [KEY_AB]: { distance: 75323, duration: 3900 },          // 81 分
    [KEY_BC]: { distance: 200000, duration: 9000 }          // 188 分，超過 180
} };
const GEO = { [KEY_AB]: encodePolyline(ROAD_AB), [KEY_BC]: encodePolyline(ROAD_BC) };

function expand(env, routes) {
    const el = makeDayEl();
    env.Trip.bindDayMap(el.dayEl, DAY, P, { routes, site: SITE });
    el.button.listeners.click();
    return el;
}
const group = env => env.rec.groups[0];
const polylines = env => group(env).layers.filter(l => l.kind === 'polyline');
const labels = env => group(env).layers.filter(l => l.kind === 'marker');
const near = (pts, want) => pts.length === want.length && pts.every((p, i) => Math.abs(p[0] - want[i][0]) < 1e-9 && Math.abs(p[1] - want[i][1]) < 1e-9);
const tick = () => new Promise(r => setImmediate(r));

test('沒有快取：維持原本單一灰色虛線，沒有標示，也不載入 routes-geo.js', async () => {
    const env = makeEnv();
    expand(env, undefined);
    await tick();
    assert.equal(polylines(env).length, 1);
    assert.equal(polylines(env)[0].points.length, 3);
    assert.ok(polylines(env)[0].opts.dashArray);
    assert.equal(labels(env).length, 0);
    assert.equal(env.rec.scripts.length, 0);
});

test('有快取：展開前不載入 routes-geo.js；展開後才載入，載入前先用虛線＋中點標示', async () => {
    const env = makeEnv();
    const el = makeDayEl();
    env.Trip.bindDayMap(el.dayEl, DAY, P, { routes: CACHE, site: SITE });
    assert.equal(env.rec.scripts.length, 0);
    el.button.listeners.click();
    assert.equal(env.rec.scripts.length, 1);
    assert.equal(env.rec.scripts[0].src, 'data/routes-geo.js');
    assert.equal(polylines(env).length, 2);
    assert.ok(polylines(env).every(l => l.opts.dashArray && l.points.length === 2));
    assert.equal(labels(env).length, 2);
});

test('geo 載入後：道路路線取代虛線，超過門檻的段落紅色，中點標示在路線一半處', async () => {
    const env = makeEnv();
    expand(env, CACHE);
    env.ctx.window.TRIP_ROUTES_GEO = GEO;
    env.rec.scripts[0].onload();
    await tick();
    const lines = polylines(env);
    assert.equal(lines.length, 2);
    assert.ok(lines.every(l => !l.opts.dashArray));
    assert.ok(near(lines[0].points, ROAD_AB) && near(lines[1].points, ROAD_BC));
    assert.deepEqual(lines.map(l => l.opts.color), ['#334155', '#dc2626']);
    const ls = labels(env);
    assert.equal(ls.length, 2);
    assert.match(ls[0].opts.icon.html, /1小時21分・75\.3 km/);
    assert.ok(!/over/.test(ls[0].opts.icon.html));
    assert.match(ls[1].opts.icon.html, /3小時08分・200\.0 km/);
    assert.match(ls[1].opts.icon.html, /map-leg-label-over/);
    assert.equal(ls[0].opts.interactive, false);
    // 第一段路線點 [24.1,121.1]→[24.12,121.17]→[24.2,121.2]：一半長度落在第二小段上，不是起終點中點 [24.15,121.15]
    assert.ok(ls[0].latlng[0] > 24.12 && ls[0].latlng[1] > 121.17, JSON.stringify(ls[0].latlng));
});

test('部分路段有 geo：有的畫道路，沒有的仍畫虛線直線', async () => {
    const env = makeEnv();
    expand(env, CACHE);
    env.ctx.window.TRIP_ROUTES_GEO = { [KEY_AB]: GEO[KEY_AB] };
    env.rec.scripts[0].onload();
    await tick();
    const lines = polylines(env);
    assert.ok(!lines[0].opts.dashArray && near(lines[0].points, ROAD_AB));
    assert.ok(lines[1].opts.dashArray && lines[1].points.length === 2);
    assert.equal(lines[1].opts.color, '#dc2626');
});

test('只有部分路段有快取：沒快取的段落仍是虛線、沒有標示', async () => {
    const env = makeEnv();
    expand(env, { legs: { [KEY_AB]: CACHE.legs[KEY_AB] } });
    assert.equal(polylines(env).length, 2);
    assert.equal(labels(env).length, 1);
    assert.equal(polylines(env)[1].opts.color, '#475569');
});

test('geo 載入失敗：靜默維持虛線與標示，沒有未處理的錯誤', async () => {
    const env = makeEnv();
    expand(env, CACHE);
    env.rec.scripts[0].onerror();
    await tick();
    assert.equal(polylines(env).length, 2);
    assert.ok(polylines(env).every(l => l.opts.dashArray));
    assert.equal(labels(env).length, 2);
});

test('geo 已載入過：再展開別的地圖不重複載入，直接畫道路', async () => {
    const env = makeEnv();
    env.ctx.window.TRIP_ROUTES_GEO = GEO;
    expand(env, CACHE);
    assert.equal(env.rec.scripts.length, 0);
    assert.ok(polylines(env).every(l => !l.opts.dashArray));
});

test('道路路線座標損壞（空字串或只有一個點）時退回虛線', async () => {
    for (const bad of ['', encodePolyline([[24.1, 121.1]])]) {
        const env = makeEnv();
        env.ctx.window.TRIP_ROUTES_GEO = { [KEY_AB]: bad, [KEY_BC]: GEO[KEY_BC] };
        expand(env, CACHE);
        const lines = polylines(env);
        assert.ok(lines[0].opts.dashArray && lines[0].points.length === 2);
        assert.ok(!lines[1].opts.dashArray);
    }
});

test('兩天的地圖在 geo 載入完成前都展開：只載入一次，載入後兩邊都重畫成道路', async () => {
    const env = makeEnv();
    expand(env, CACHE);
    const el2 = makeDayEl();
    env.Trip.bindDayMap(el2.dayEl, DAY, P, { routes: CACHE, site: SITE });
    el2.button.listeners.click();
    assert.equal(env.rec.scripts.length, 1);
    env.ctx.window.TRIP_ROUTES_GEO = GEO;
    env.rec.scripts[0].onload();
    await tick();
    assert.equal(env.rec.groups.length, 2);
    for (const g of env.rec.groups) assert.ok(g.layers.filter(l => l.kind === 'polyline').every(l => !l.opts.dashArray));
});

test('中點標示一律帶「預估」與係數（可見文字，title 為完整說明）', async () => {
    const env = makeEnv();
    expand(env, CACHE);
    env.ctx.window.TRIP_ROUTES_GEO = GEO;
    env.rec.scripts[0].onload();
    await tick();
    const ls = labels(env);
    assert.equal(ls.length, 2);
    for (const l of ls) {
        assert.match(l.opts.icon.html, /預估\s*×1\.25/);
        assert.match(l.opts.icon.html, /title="預估・含路況係數 ×1\.25"/);
    }
});

test('排定不足不影響地圖紅色：只有單段超過門檻才紅（A→B 排定不足但未超過門檻，仍是一般顏色）', async () => {
    const env = makeEnv();
    const tight = { ...DAY, items: [{ ...spot('a'), time: '09:00 - 10:00' }, { ...spot('b'), time: '10:10 - 11:00' }, spot('c')] };   // A→B 排定 10 分 < 查詢 81 分
    const el = makeDayEl();
    env.Trip.bindDayMap(el.dayEl, tight, P, { routes: CACHE, site: SITE });
    el.button.listeners.click();
    env.ctx.window.TRIP_ROUTES_GEO = GEO;
    env.rec.scripts[0].onload();
    await tick();
    assert.deepEqual(polylines(env).map(l => l.opts.color), ['#334155', '#dc2626']);
    assert.ok(!/map-leg-label-over/.test(labels(env)[0].opts.icon.html));
    assert.ok(!/排定/.test(labels(env)[0].opts.icon.html));
});

// ───────── 擇一組：編號與分岔再合流 ─────────
// a → [b | c]（擇一組）→ d；a>b 與 b>d 有快取，a>c 與 c>d 沒有
const P4 = { ...P, d: { name: 'D', lat: 24.4, lng: 121.4 } };
const ALT_DAY = { day: 2, date: '', title: '', items: [spot('a'), { ...spot('b'), alt: 'x', time: '12:00 - 13:00' }, { ...spot('c'), alt: 'x' }, spot('d')] };
const KEY_BD = '121.20000,24.20000>121.40000,24.40000';
const ALT_CACHE = { legs: { [KEY_AB]: CACHE.legs[KEY_AB], [KEY_BD]: { distance: 50000, duration: 3000 } } };
function expandAlt(env, routes) {
    const el = makeDayEl();
    env.Trip.bindDayMap(el.dayEl, ALT_DAY, P4, { routes, site: SITE });
    el.button.listeners.click();
}

test('擇一組：標記編號為 1、2a、2b、3（下一站接 3）', () => {
    const env = makeEnv();
    expandAlt(env, undefined);
    const nums = env.rec.direct.filter(l => l.kind === 'marker').map(m => m.opts.icon.html.replace(/<[^>]+>/g, ''));
    assert.deepEqual(nums, ['1', '2a', '2b', '3']);
});

test('擇一組沒有快取：畫四段虛線（前一站→每個成員、每個成員→下一站），沒有成員之間的線', () => {
    const env = makeEnv();
    expandAlt(env, undefined);
    const lines = polylines(env);
    assert.deepEqual(JSON.parse(JSON.stringify(lines.map(l => l.points))), [
        [[24.1, 121.1], [24.2, 121.2]], [[24.1, 121.1], [24.3, 121.3]],
        [[24.2, 121.2], [24.4, 121.4]], [[24.3, 121.3], [24.4, 121.4]]
    ]);
    assert.ok(lines.every(l => l.opts.dashArray));
});

test('擇一組有快取：有快取的段落標示時間，沒有快取的段落是虛線且沒有標示', () => {
    const env = makeEnv();
    expandAlt(env, ALT_CACHE);
    assert.equal(polylines(env).length, 4);
    assert.equal(labels(env).length, 2);
});
