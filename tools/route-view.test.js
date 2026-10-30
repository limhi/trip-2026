// node --test tools/route-view.test.js：公開頁面的路線顯示邏輯（js/route-view.js，純函式）
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/model.js');
const routeView = require('../js/route-view.js');

const P = {
    a: { name: 'A', lat: 24.1, lng: 121.1 },
    b: { name: 'B', lat: 24.2, lng: 121.2 },
    c: { name: 'C', lat: 24.3, lng: 121.3 }
};
const spot = id => ({ type: 'spot', place: id });
const KEY_AB = '121.10000,24.10000>121.20000,24.20000';
const KEY_BC = '121.20000,24.20000>121.30000,24.30000';
const SITE = { routing: { trafficFactor: 1.25, maxLegMinutes: 180 } };
const routes = legs => ({ legs });

// ───────── decodePolyline ─────────

test('decodePolyline：Google 官方範例（精度 5）還原成 [lat, lng]', () => {
    const pts = routeView.decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert.deepEqual(pts, [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

test('decodePolyline：空字串或不是字串回空陣列', () => {
    assert.deepEqual(routeView.decodePolyline(''), []);
    assert.deepEqual(routeView.decodePolyline(undefined), []);
});

// ───────── dayRoutes ─────────

test('dayRoutes：沒有快取（含 routes 為 undefined）時每段 cached 為 null，hasCache 為 false', () => {
    const day = { items: [spot('a'), spot('b')] };
    for (const r of [undefined, null, {}, routes({})]) {
        const info = routeView.dayRoutes(day, P, r, SITE);
        assert.equal(info.hasCache, false);
        assert.equal(info.legs.length, 1);
        assert.equal(info.legs[0].cached, null);
        assert.equal(info.summary, null);
    }
});

test('dayRoutes：有快取的段落算出顯示分鐘、文字、是否超過門檻', () => {
    const day = { items: [spot('a'), spot('b'), spot('c')] };
    const info = routeView.dayRoutes(day, P, routes({
        [KEY_AB]: { distance: 75323, duration: 3900 },      // 65 分 × 1.25 = 81.25 → 81 分
        [KEY_BC]: { distance: 200000, duration: 9000 }      // 150 分 × 1.25 = 187.5 → 188 分 > 180
    }), SITE);
    assert.equal(info.factor, 1.25);
    assert.equal(info.hasCache, true);
    assert.deepEqual(info.legs.map(l => [l.minutes, l.over]), [[81, false], [188, true]]);
    assert.equal(info.legs[0].text, '約 1 小時 21 分・75.3 km');
    assert.equal(info.factorNote, '查詢・含路況緩衝 ×1.25');
});

test('dayRoutes：autoByRow（綁定的交通列）與 autoAfter（沒有交通列時補在前一項後面），只含有快取的路段', () => {
    const day = { items: [spot('a'), { type: 'drive', time: '08:00 - 09:00', text: '開車' }, spot('b'), spot('c')] };
    const info = routeView.dayRoutes(day, P, routes({
        [KEY_AB]: { distance: 75323, duration: 3900 },
        [KEY_BC]: { distance: 20000, duration: 1200 }
    }), SITE);
    const note = '查詢・含路況緩衝 ×1.25';
    assert.deepEqual(info.autoByRow, { 1: { text: '約 1 小時 21 分・75.3 km', note, scheduled: 60, needed: 81, short: true } });
    assert.deepEqual(info.autoAfter, { 2: { text: '約 25 分・20.0 km', note, scheduled: null, needed: 25, short: false } });
    const none = routeView.dayRoutes(day, P, routes({}), SITE);
    assert.deepEqual([none.autoByRow, none.autoAfter], [{}, {}]);
});

test('dayRoutes：剛好等於門檻不算超過', () => {
    const day = { items: [spot('a'), spot('b')] };
    // 144 分 × 1.25 = 180 分
    const info = routeView.dayRoutes(day, P, routes({ [KEY_AB]: { distance: 1000, duration: 8640 } }), SITE);
    assert.equal(info.legs[0].minutes, 180);
    assert.equal(info.legs[0].over, false);
});

test('dayRoutes：day.trafficFactor 覆寫全域係數，site 沒設定時用預設值', () => {
    const day = { items: [spot('a'), spot('b')], trafficFactor: 2 };
    const cache = routes({ [KEY_AB]: { distance: 1000, duration: 6000 } });   // 100 分
    assert.equal(routeView.dayRoutes(day, P, cache, SITE).legs[0].minutes, 200);
    assert.equal(routeView.dayRoutes({ items: day.items }, P, cache, {}).legs[0].minutes, 125);
    assert.equal(routeView.dayRoutes({ items: day.items }, P, cache, {}).max, 180);
});

test('dayRoutes：壞掉的快取項目（缺 duration 或不是數字）視為沒有快取', () => {
    const day = { items: [spot('a'), spot('b')] };
    const info = routeView.dayRoutes(day, P, routes({ [KEY_AB]: { distance: 'x' } }), SITE);
    assert.equal(info.legs[0].cached, null);
    assert.equal(info.hasCache, false);
});

test('dayRoutes：summary 加總有快取路段的顯示分鐘與里程；缺段時 missing > 0', () => {
    const day = { items: [spot('a'), spot('b'), spot('c')] };
    const full = routeView.dayRoutes(day, P, routes({
        [KEY_AB]: { distance: 10000, duration: 3900 },
        [KEY_BC]: { distance: 20000, duration: 3900 }
    }), SITE);
    assert.deepEqual(full.summary, { minutes: 162, meters: 30000, missing: 0 });
    assert.equal(full.summaryText, '總車程 約 2 小時 42 分・總里程 30.0 km');
    const partial = routeView.dayRoutes(day, P, routes({ [KEY_AB]: { distance: 10000, duration: 3900 } }), SITE);
    assert.deepEqual(partial.summary, { minutes: 81, meters: 10000, missing: 1 });
    assert.equal(partial.summaryText, '總車程 約 1 小時 21 分・總里程 10.0 km（部分路段未計算）');
});

test('dayRoutes：leg 帶有 rowIndex／needsRow／closeLoop，供綁定交通列與補連接列', () => {
    const day = { closeLoop: true, items: [spot('a'), { type: 'drive', time: '1', text: 't' }, spot('b'), spot('c')] };
    const info = routeView.dayRoutes(day, P, routes({}), SITE);
    assert.deepEqual(info.legs.map(l => [l.leg.rowIndex, l.leg.needsRow, l.leg.closeLoop]),
        [[1, false, false], [null, true, false], [null, false, true]]);
});

test('dayRoutes：每段帶排定時間與是否不足；紅色 over 只看單段門檻，與排定不足無關', () => {
    const day = { items: [{ type: 'spot', place: 'a', time: '09:00 - 10:00' }, { type: 'spot', place: 'b', time: '10:30 - 11:00' }, spot('c')] };
    const info = routeView.dayRoutes(day, P, routes({
        [KEY_AB]: { distance: 1000, duration: 2400 },       // 40 × 1.25 = 50 分，排定 30 分
        [KEY_BC]: { distance: 1000, duration: 9000 }        // 188 分 > 門檻，沒有排定時間
    }), SITE);
    assert.deepEqual(info.legs.map(l => [l.scheduled, l.short, l.over]), [[30, true, false], [null, false, true]]);
    // 反向：排定足夠就不得標為不足
    day.items[1].time = '11:30 - 12:00';
    assert.equal(routeView.dayRoutes(day, P, routes({ [KEY_AB]: { distance: 1000, duration: 2400 } }), SITE).legs[0].short, false);
});

// ───────── 擇一組：並列路徑、各自判斷、總車程取較長 ─────────
// 行程：a → [b | c]（擇一組 x）→ d
const PA = { ...P, d: { name: 'D', lat: 24.4, lng: 121.4 } };
const key = (from, to) => model.legKey(PA[from], PA[to]);
const model = require('../js/model.js');
const MIN = 60;
// 原始分鐘（×1.25 後）：a→b 40（50）、a→c 20（25）、b→d 8（10）、c→d 48（60）
const ALT_CACHE = routes({
    [key('a', 'b')]: { distance: 40000, duration: 40 * MIN },
    [key('a', 'c')]: { distance: 20000, duration: 20 * MIN },
    [key('b', 'd')]: { distance: 8000, duration: 8 * MIN },
    [key('c', 'd')]: { distance: 48000, duration: 48 * MIN }
});
const altItems = (a, b, c, d) => [a, { ...spot('b'), alt: 'x', ...b }, { ...spot('c'), alt: 'x', ...c }, d];

test('dayRoutes：擇一組前綁定的交通列只有一個 autoByRow，並列每條路徑、各自判斷不足（一足一不足）', () => {
    const day = { items: [spot('a'), { type: 'drive', time: '08:00 - 08:40', text: '開車' }, { ...spot('b'), alt: 'x', time: '09:00 - 10:00' }, { ...spot('c'), alt: 'x' }, spot('d')] };
    const info = routeView.dayRoutes(day, PA, ALT_CACHE, SITE);
    assert.deepEqual(Object.keys(info.autoByRow), ['1']);
    const auto = info.autoByRow[1];
    assert.deepEqual([auto.scheduled, auto.needed, auto.short], [40, 50, true]);
    assert.deepEqual(auto.paths.map(p => [p.label, p.needed, p.short]), [['→ B', 50, true], ['→ C', 25, false]]);
    assert.equal(auto.paths[0].text, '約 50 分・40.0 km');
});

test('dayRoutes：兩條路徑都足夠時沒有任何不足；缺快取的路徑不判斷、不出現', () => {
    const day = { items: [spot('a'), { type: 'drive', time: '08:00 - 09:00', text: '開車' }, { ...spot('b'), alt: 'x', time: '09:00 - 10:00' }, { ...spot('c'), alt: 'x' }, spot('d')] };
    const ok = routeView.dayRoutes(day, PA, ALT_CACHE, SITE).autoByRow[1];
    assert.deepEqual([ok.short, ...ok.paths.map(p => p.short)], [false, false, false]);
    const partial = routeView.dayRoutes(day, PA, routes({ [key('a', 'c')]: ALT_CACHE.legs[key('a', 'c')] }), SITE).autoByRow[1];
    assert.deepEqual(partial.paths.map(p => [p.label, p.short]), [['→ C', false]]);
    assert.equal(partial.short, false);
});

test('dayRoutes：沒有交通列時，組前一條、組後一條連接列（不是每個成員各一條），排定時間用整組共用的 time', () => {
    const day = { items: altItems({ ...spot('a'), time: '09:00 - 10:00' }, { time: '10:30 - 11:30' }, {}, { ...spot('d'), time: '11:50 - 13:00' }) };
    const info = routeView.dayRoutes(day, PA, ALT_CACHE, SITE);
    assert.deepEqual(Object.keys(info.autoAfter).sort(), ['0', '1']);
    const before = info.autoAfter[0], after = info.autoAfter[1];
    assert.deepEqual(before.paths.map(p => [p.label, p.needed, p.short]), [['→ B', 50, true], ['→ C', 25, false]]);
    assert.equal(before.scheduled, 30);
    assert.deepEqual(after.paths.map(p => [p.label, p.needed, p.short]), [['B →', 10, false], ['C →', 60, true]]);
    assert.equal(after.scheduled, 20);
    assert.deepEqual([after.needed, after.short], [60, true]);
});

test('dayRoutes：總車程在有擇一組時取較長的那條路徑，並標註「含擇一組取較長」；沒有擇一組不標', () => {
    const day = { items: altItems(spot('a'), {}, {}, spot('d')) };
    const info = routeView.dayRoutes(day, PA, ALT_CACHE, SITE);
    // 經 b：50 + 10 = 60；經 c：25 + 60 = 85
    assert.deepEqual(info.summary, { minutes: 85, meters: 68000, missing: 0 });
    assert.equal(info.summaryText, '總車程 約 1 小時 25 分・總里程 68.0 km（含擇一組取較長）');
    const plain = routeView.dayRoutes({ items: [spot('a'), spot('b')] }, PA, ALT_CACHE, SITE);
    assert.ok(!plain.summaryText.includes('擇一組'));
});

test('dayRoutes：擇一組缺路段時總車程沿用「（部分路段未計算）」，只加總有快取的路徑', () => {
    const day = { items: altItems(spot('a'), {}, {}, spot('d')) };
    const cache = routes({ ...ALT_CACHE.legs });
    delete cache.legs[key('c', 'd')];
    const info = routeView.dayRoutes(day, PA, cache, SITE);
    assert.deepEqual(info.summary, { minutes: 60, meters: 48000, missing: 1 });
    assert.equal(info.summaryText, '總車程 約 1 小時・總里程 48.0 km（含擇一組取較長）（部分路段未計算）');
});

test('dayRoutes：沒有擇一組、中間一段沒有快取時，總車程仍是有快取路段的全部加總', () => {
    const day = { items: [spot('a'), spot('b'), spot('c'), spot('d')] };
    const info = routeView.dayRoutes(day, PA, routes({
        [key('a', 'b')]: { distance: 1000, duration: 10 * MIN },
        [key('c', 'd')]: { distance: 2000, duration: 20 * MIN }
    }), SITE);
    assert.deepEqual(info.summary, { minutes: 38, meters: 3000, missing: 1 });   // 13 + 25
});

// ───────── midpoint ─────────

test('midpoint：沒有路線座標時取起終點中點；有座標時取沿路線一半長度處', () => {
    assert.deepEqual(routeView.midpoint(null, { lat: 24, lng: 121 }, { lat: 26, lng: 123 }), [25, 122]);
    // L 形：先往東 3 度再往北 1 度，總長 4、一半長度落在東段 2 度處
    const line = [[0, 0], [0, 3], [1, 3]];
    const m = routeView.midpoint(line, { lat: 0, lng: 0 }, { lat: 1, lng: 3 });
    assert.ok(Math.abs(m[0] - 0) < 1e-9 && Math.abs(m[1] - 2) < 1e-9, JSON.stringify(m));
});

// ───────── 快取是否可用：編輯器警告與頁面紅字用同一個判斷 ─────────

test('快取缺 distance（或 duration）時，getLegSchedule、編輯器警告、頁面紅字一致：都不判斷、不顯示', () => {
    const model = require('../js/model.js');
    const day = { day: 1, items: [spot('a'), { type: 'drive', time: '08:00 - 08:10' }, spot('b')] };
    for (const entry of [{ duration: 3000 }, { distance: 1000 }, { distance: 1000, duration: NaN }]) {
        const r = routes({ [KEY_AB]: entry });
        assert.equal(model.getLegSchedule(day, P, r, SITE)[0].needed, null);
        assert.deepEqual(model.getTimeWarnings(day, P, r, SITE), []);
        const info = routeView.dayRoutes(day, P, r, SITE);
        assert.equal(info.legs[0].cached, null);
        assert.equal(info.legs[0].short, false);
        assert.deepEqual(info.autoByRow, {});
    }
    // 兩個欄位都有才判斷（反向：排定 10 分 < 查詢 63 分 → 警告與紅字都出現）
    const ok = routes({ [KEY_AB]: { distance: 1000, duration: 3000 } });
    assert.equal(model.getTimeWarnings(day, P, ok, SITE).length, 1);
    assert.equal(routeView.dayRoutes(day, P, ok, SITE).legs[0].short, true);
});
