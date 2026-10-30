// node --test tools/model-routes.test.js：路段與顯示時間（js/model.js 的路線相關純函式）
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/model.js');
const TRIP = require('../data/trip.json');
const PLACES = require('../data/places.json');

const P = {
    a: { lat: 24.1, lng: 121.1 },
    b: { lat: 24.2, lng: 121.2 },
    c: { lat: 24.3, lng: 121.3 },
    nocoord: { name: '沒座標' }
};
const place = id => ({ type: 'spot', place: id });
const summary = legs => legs.map(l => [l.fromItemIndex, l.toItemIndex, l.fromId, l.toId, l.rowIndex, l.needsRow]);

// ───────── getLegs ─────────

test('getLegs：相鄰標記兩兩一段，key 為經緯度 5 位小數', () => {
    const legs = model.getLegs({ items: [place('a'), place('b'), place('c')] }, P);
    assert.deepEqual(legs.map(l => l.key), [
        '121.10000,24.10000>121.20000,24.20000',
        '121.20000,24.20000>121.30000,24.30000'
    ]);
    assert.deepEqual(summary(legs), [[0, 1, 'a', 'b', null, true], [1, 2, 'b', 'c', null, true]]);
    assert.deepEqual(legs[0].from, { lat: 24.1, lng: 121.1 });
    assert.deepEqual(legs[0].to, { lat: 24.2, lng: 121.2 });
});

test('getLegs：backup、map:false、沒有座標的項目都不算', () => {
    const items = [place('a'), { ...place('b'), backup: true }, { ...place('c'), map: false }, place('nocoord'), place('c')];
    const legs = model.getLegs({ items }, P);
    assert.deepEqual(summary(legs), [[0, 4, 'a', 'c', null, true]]);
});

test('getLegs：只有一個標記或沒有標記時沒有路段', () => {
    assert.deepEqual(model.getLegs({ items: [place('a')] }, P), []);
    assert.deepEqual(model.getLegs({ items: [{ type: 'notice', title: 'x' }] }, P), []);
    assert.deepEqual(model.getLegs({ items: [place('a')], closeLoop: true }, P), []);
});

test('getLegs：closeLoop 的回程段（最後 → 第一個）要算，且不綁定交通列', () => {
    const items = [place('a'), { type: 'drive' }, place('b'), { type: 'move' }];
    const legs = model.getLegs({ items, closeLoop: true }, P);
    assert.deepEqual(summary(legs), [[0, 2, 'a', 'b', 1, false], [2, 0, 'b', 'a', null, false]]);
    assert.equal(legs[1].closeLoop, true);
    assert.equal(legs[0].closeLoop, false);
});

test('getLegs：closeLoop 的回程不包含 backup 標記', () => {
    const items = [place('a'), place('b'), { ...place('c'), backup: true }];
    const legs = model.getLegs({ items, closeLoop: true }, P);
    assert.deepEqual(legs.map(l => [l.fromId, l.toId]), [['a', 'b'], ['b', 'a']]);
});

test('getLegs：交通列綁定規則（0 個、1 個、多個）', () => {
    const none = model.getLegs({ items: [place('a'), { type: 'notice', title: 'n' }, place('b')] }, P);
    assert.deepEqual([none[0].rowIndex, none[0].needsRow], [null, true]);

    const one = model.getLegs({ items: [place('a'), { type: 'notice', title: 'n' }, { type: 'move' }, place('b')] }, P);
    assert.deepEqual([one[0].rowIndex, one[0].needsRow], [2, false]);

    const many = model.getLegs({ items: [place('a'), { type: 'drive' }, { type: 'drive' }, place('b')] }, P);
    assert.deepEqual([many.length, many[0].rowIndex, many[0].needsRow], [1, null, false]);
});

test('getLegs：不跨天（每天各自計算）', () => {
    const legsA = model.getLegs({ items: [place('a'), place('b')] }, P);
    const legsB = model.getLegs({ items: [place('c')] }, P);
    assert.equal(legsA.length, 1);
    assert.equal(legsB.length, 0);
});

test('legKey：相同座標得到相同 key，只取 5 位小數', () => {
    const a = model.legKey({ lat: 24.9722, lng: 121.4433 }, { lat: 24.6718, lng: 121.804 });
    assert.equal(a, '121.44330,24.97220>121.80400,24.67180');
    assert.equal(model.legKey({ lat: 24.972200004, lng: 121.443299996 }, { lat: 24.6718, lng: 121.804 }), a);
    assert.notEqual(model.legKey({ lat: 24.6718, lng: 121.804 }, { lat: 24.9722, lng: 121.4433 }), a);
});

// 固定的測試行程：形狀仿照真實行程（起點加交通列、沒有交通列的相鄰景點、closeLoop 加 map:false 的返程住宿、
// 備案、多個交通列），但不讀 data/，所以改行程不會讓它壞掉
test('固定行程：各種形狀的路段與交通列綁定', () => {
    const places = { ...P, d: { lat: 24.4, lng: 121.4 }, e: { lat: 24.5, lng: 121.5 }, h: { lat: 24.6, lng: 121.6 }, k: { lat: 24.7, lng: 121.7 } };
    const wp = (id, extra) => ({ type: 'waypoint', place: id, ...extra });
    const days = {
        // 起點的交通列綁定第一段；之後相鄰景點之間沒有交通列
        A: { items: [wp('a'), { type: 'drive' }, place('b'), { type: 'meal', place: 'c' }, place('d'), { type: 'stay', place: 'h' }] },
        // closeLoop：返程住宿 map:false 不算標記，回程段不綁定任何列
        B: { closeLoop: true, items: [wp('h'), { type: 'drive' }, place('b'), { type: 'move' }, { type: 'stay', place: 'h', map: false }] },
        // 提醒卡片不算交通列；備案不算標記；兩個交通列之間不綁定
        C: { items: [wp('h'), { type: 'notice', title: 'n' }, place('b'), wp('k', { backup: true }), { type: 'drive' }, { type: 'drive' }, { type: 'brief', place: 'e' }] },
        // 只有一個有座標的標記
        D: { items: [place('a'), place('nocoord')] }
    };
    const expected = {
        A: [[0, 2, 'a', 'b', 1, false], [2, 3, 'b', 'c', null, true], [3, 4, 'c', 'd', null, true], [4, 5, 'd', 'h', null, true]],
        B: [[0, 2, 'h', 'b', 1, false], [2, 0, 'b', 'h', null, false]],
        C: [[0, 2, 'h', 'b', null, true], [2, 6, 'b', 'e', null, false]],
        D: []
    };
    for (const [name, day] of Object.entries(days)) assert.deepEqual(summary(model.getLegs(day, places)), expected[name], `行程 ${name}`);
});

// ───────── 顯示時間與格式 ─────────

test('displayMinutes：原始秒數 ÷ 60 × 係數，四捨五入', () => {
    assert.equal(model.displayMinutes(4334, 1.25), 90);   // 72.23 × 1.25 = 90.29
    assert.equal(model.displayMinutes(3600, 1), 60);
    assert.equal(model.displayMinutes(3600, 2), 120);     // 係數覆寫
    assert.equal(model.displayMinutes(29, 1), 0);         // 0.48 分
    assert.equal(model.displayMinutes(30, 1), 1);         // 0.5 分進位
});

test('getTrafficFactor：day 覆寫 > site.routing > 預設 1.25', () => {
    assert.equal(model.getTrafficFactor({ trafficFactor: 1.5 }, { routing: { trafficFactor: 1.1 } }), 1.5);
    assert.equal(model.getTrafficFactor({}, { routing: { trafficFactor: 1.1 } }), 1.1);
    assert.equal(model.getTrafficFactor({}, {}), 1.25);
    assert.equal(model.getTrafficFactor({}, undefined), 1.25);
});

test('formatDuration：不滿 1 小時、整點、含分鐘', () => {
    assert.equal(model.formatDuration(45), '約 45 分');
    assert.equal(model.formatDuration(59), '約 59 分');
    assert.equal(model.formatDuration(60), '約 1 小時');
    assert.equal(model.formatDuration(120), '約 2 小時');
    assert.equal(model.formatDuration(65), '約 1 小時 5 分');
    assert.equal(model.formatDuration(0), '約 0 分');
});

test('formatDistance：公里取一位小數', () => {
    assert.equal(model.formatDistance(75323), '75.3 km');
    assert.equal(model.formatDistance(960), '1.0 km');
    assert.equal(model.formatDistance(0), '0.0 km');
});

test('formatLeg：「約 1 小時 5 分・75.3 km」，係數覆寫會反映在時間上', () => {
    assert.equal(model.formatLeg({ distance: 75323, duration: 3120 }, 1.25), '約 1 小時 5 分・75.3 km');
    assert.equal(model.formatLeg({ distance: 75323, duration: 3120 }, 1), '約 52 分・75.3 km');
});

test('formatFactorNote：標示實際係數', () => {
    assert.equal(model.formatFactorNote(1.25), '預估・含路況緩衝 ×1.25');
    assert.equal(model.formatFactorNote(1.5), '預估・含路況緩衝 ×1.5');
});

// ───────── getTimeWarnings ─────────

const MIN = 60;
// 每段原始 40 分，係數 1.25 → 顯示 50 分
const routesFor = (day, seconds) => ({ legs: Object.fromEntries(model.getLegs(day, P).map(l => [l.key, { distance: 1000, duration: seconds }])) });
const SITE = { routing: { trafficFactor: 1.25, maxLegMinutes: 180 } };
const warn = (day, site = SITE) => model.getTimeWarnings(day, P, routesFor(day, 40 * MIN), site);
const dayOf = (items, extra) => ({ day: 3, items, ...extra });

test('getTimeWarnings：交通列的時間區間比顯示時間短 → 警告，並寫明天數、段落、排定與需要', () => {
    const day = dayOf([place('a'), { type: 'drive', time: '08:00 - 08:30' }, place('b')]);
    const w = warn(day);
    assert.equal(w.length, 1);
    assert.match(w[0].message, /DAY 3/);
    assert.match(w[0].message, /排定 30 分/);
    assert.match(w[0].message, /至少需要約 50 分/);
    assert.equal(w[0].legKey, model.getLegs(day, P)[0].key);
    assert.equal(w[0].scheduled, 30);
    assert.equal(w[0].needed, 50);
});

test('getTimeWarnings：區間足夠（含剛好相等）不警告', () => {
    assert.deepEqual(warn(dayOf([place('a'), { type: 'drive', time: '08:00 - 08:50' }, place('b')])), []);
    assert.deepEqual(warn(dayOf([place('a'), { type: 'move', time: '08:00 - 09:30' }, place('b')])), []);
});

test('getTimeWarnings：交通列時間不是區間（單一時間、「17:10 後」、空）不比對', () => {
    for (const time of ['12:15', '17:10 後', '約 30 分', undefined, '08:00 -']) {
        assert.deepEqual(warn(dayOf([place('a'), { type: 'drive', time }, place('b')])), [], String(time));
    }
});

test('getTimeWarnings：沒有交通列時用前一項結束時間與後一項開始時間', () => {
    const tight = dayOf([{ ...place('a'), time: '09:00 - 10:00' }, { ...place('b'), time: '10:30 - 11:00' }]);
    const w = warn(tight);
    assert.equal(w.length, 1);
    assert.match(w[0].message, /排定 30 分/);
    assert.match(w[0].message, /至少需要約 50 分/);
    const loose = dayOf([{ ...place('a'), time: '09:00 - 10:00' }, { ...place('b'), time: '10:50 - 11:00' }]);
    assert.deepEqual(warn(loose), []);
});

test('getTimeWarnings：沒有交通列且任一端時間無法解析就不比對', () => {
    const cases = [
        [{ ...place('a'), time: '17:10 後' }, { ...place('b'), time: '17:20 - 18:00' }],
        [{ ...place('a'), time: '09:00 - 10:00' }, { ...place('b'), time: '10:05' }],
        [{ ...place('a'), time: '09:00 - 10:00' }, place('b')],
        [place('a'), { ...place('b'), time: '10:00 - 11:00' }]
    ];
    for (const items of cases) assert.deepEqual(warn(dayOf(items)), []);
});

test('getTimeWarnings：沒有快取的路段、有多個交通列（未綁定）、closeLoop 回程都不比對', () => {
    const day = dayOf([place('a'), { type: 'drive', time: '08:00 - 08:10' }, place('b')]);
    assert.deepEqual(model.getTimeWarnings(day, P, { legs: {} }, SITE), []);
    assert.deepEqual(model.getTimeWarnings(day, P, undefined, SITE), []);
    const multi = dayOf([place('a'), { type: 'drive', time: '08:00 - 08:10' }, { type: 'drive', time: '08:10 - 08:20' }, place('b')]);
    assert.deepEqual(warn(multi), []);
    const loop = dayOf([{ ...place('a'), time: '09:00 - 10:00' }, { type: 'drive', time: '10:00 - 11:00' }, { ...place('b'), time: '11:00 - 12:00' }], { closeLoop: true });
    assert.deepEqual(warn(loop), []);
});

test('getTimeWarnings：day.trafficFactor 覆寫係數；site.routing 缺少時用預設 1.25', () => {
    const items = [place('a'), { type: 'drive', time: '08:00 - 08:45' }, place('b')];
    assert.equal(warn(dayOf(items)).length, 1);                           // 需要 50 分，排定 45 分
    assert.equal(warn(dayOf(items, { trafficFactor: 1 })).length, 0);     // 需要 40 分
    assert.equal(warn(dayOf(items), {}).length, 1);
});

test('getTimeWarnings：時間文字後面接說明（如「10:00 - 11:00 午餐」）仍可解析', () => {
    const items = [{ ...place('a'), time: '10:00 - 11:00 午餐' }, { ...place('b'), time: '11:20 - 12:00' }];
    assert.equal(warn(dayOf(items)).length, 1);
});

// ───────── forEachPlaceRef ─────────

test('forEachPlaceRef：走過住宿、項目、住宿區的每個地點引用，owner 可用來改 id', () => {
    const trip = {
        days: [{ day: 1, stay: { place: 'a' }, items: [{ type: 'spot', place: 'b' }, { type: 'drive' }, { type: 'spot', place: 'c' }] }],
        hotels: [{ place: 'a' }]
    };
    const seen = [];
    model.forEachPlaceRef(trip, (id, label, owner) => seen.push([id, label, owner]));
    assert.deepEqual(seen.map(s => s.slice(0, 2)), [['a', 'DAY 1 住宿'], ['b', 'DAY 1 第 1 項'], ['c', 'DAY 1 第 3 項'], ['a', '住宿區第 1 間']]);
    seen[0][2].place = 'z';
    assert.equal(trip.days[0].stay.place, 'z');
});

test('forEachPlaceRef：沒有 hotels 也不出錯', () => {
    const seen = [];
    model.forEachPlaceRef({ days: [{ day: 1, items: [{ type: 'spot', place: 'a' }] }] }, id => seen.push(id));
    assert.deepEqual(seen, ['a']);
});

// ───────── validate：路線設定 ─────────

test('validate：真實資料（含 site.routing）沒有問題', () => {
    const { trafficFactor, maxLegMinutes } = TRIP.site.routing;   // 只檢查型別，不寫死目前的設定值
    assert.ok(trafficFactor > 0 && maxLegMinutes > 0);
    assert.deepEqual(model.validate(TRIP, PLACES), []);
});

test('validate：site.routing 與 day.trafficFactor 必須是正數', () => {
    const clone = () => JSON.parse(JSON.stringify(TRIP));
    const errs = mutate => { const t = clone(); mutate(t); return model.validate(t, PLACES); };
    assert.deepEqual(errs(t => { t.site.routing.trafficFactor = 1.5; t.days[0].trafficFactor = 1.1; }), []);
    assert.match(errs(t => { t.site.routing.trafficFactor = 0; }).join('\n'), /trafficFactor/);
    assert.match(errs(t => { t.site.routing.trafficFactor = '1.25'; }).join('\n'), /trafficFactor/);
    assert.match(errs(t => { t.site.routing.maxLegMinutes = -1; }).join('\n'), /maxLegMinutes/);
    assert.match(errs(t => { t.days[1].trafficFactor = 0; }).join('\n'), /DAY 2.*trafficFactor/);
    assert.deepEqual(errs(t => { delete t.site.routing; }), []);   // 沒設定就用預設值
});

// ───────── 擇一組（alt）：推導與驗證 ─────────

test('getAltGroups：相鄰、同名 alt 的項目組成一組；沒有 alt 的行程沒有擇一組', () => {
    const items = [place('a'), { ...place('b'), alt: 'x', time: '12:00 - 13:00' }, { ...place('c'), alt: 'x' }, place('a')];
    assert.deepEqual(model.getAltGroups({ items }), [{ alt: 'x', start: 1, end: 2 }]);
    assert.deepEqual(model.getAltGroups({ items: [place('a'), place('b')] }), []);
});

test('validate：擇一組合法時沒有問題；成員不是 spot、不相鄰、少於 2 項、非第一項寫 time 都會被擋下', () => {
    const trip = items => ({ days: [{ day: 1, items }], hotels: [] });
    const errs = items => model.validate(trip(items), P).join('\n');
    const m = (id, extra) => ({ type: 'spot', place: id, ...extra });
    assert.equal(errs([m('a'), m('b', { alt: 'x', time: '12:00 - 13:00' }), m('c', { alt: 'x' })]), '');
    assert.match(errs([m('a', { alt: 'x' }), { type: 'meal', title: '午餐', alt: 'x' }]), /第 2 項.*alt.*spot/);
    assert.match(errs([m('a', { alt: 'x' }), m('b'), m('c', { alt: 'x' })]), /alt「x」.*相鄰/);
    assert.match(errs([m('a'), m('b', { alt: 'x' })]), /alt「x」.*至少 2 項/);
    assert.match(errs([m('a', { alt: 'x' }), m('b', { alt: 'x', time: '12:00 - 13:00' })]), /第 2 項.*time/);
});
