// node --test tools/cascade.test.js：移動列長度、連動、整天重排（js/model.js，純資料函式）
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../js/model.js');

const P = {
    a: { name: 'A館', lat: 24.1, lng: 121.1 },
    b: { name: 'B館', lat: 24.2, lng: 121.2 },
    c: { name: 'C館', lat: 24.3, lng: 121.3 },
    d: { name: 'D館', lat: 24.4, lng: 121.4 }
};
const spot = (place, time, extra) => ({ type: 'spot', place, time, ...extra });
const move = (time, extra) => ({ type: 'move', text: '路上', ...(time ? { time } : {}), ...extra });
const times = day => day.items.map(i => i.time);
// 路線快取：秒數 → 路段（key 用 model.legKey）
const routesOf = pairs => ({ legs: Object.fromEntries(pairs.map(([f, t, sec]) => [model.legKey(P[f], P[t]), { distance: 1000, duration: sec }])) });

// ───────── 移動列長度 ─────────

test('長度 = 查詢時間（原始 × 係數，四捨五入）+ buffer', () => {
    assert.equal(model.getMoveMinutes(move(), { distance: 1, duration: 1800 }, 1), 30);
    assert.equal(model.getMoveMinutes(move(), { distance: 1, duration: 1800 }, 1.25), 38);   // 37.5 → 38
    assert.equal(model.getMoveMinutes(move(), { distance: 1, duration: 1500 }, 1.25), 31);   // 31.25 → 31
    assert.equal(model.getMoveMinutes(move(null, { buffer: 10 }), { distance: 1, duration: 1800 }, 1), 40);
    assert.equal(model.getMoveMinutes(move(null, { buffer: -5 }), { distance: 1, duration: 1800 }, 1), 25);
});

test('沒有可用的查詢結果回 null（缺值、壞值）', () => {
    assert.equal(model.getMoveMinutes(move(null, { buffer: 5 }), undefined, 1), null);
    assert.equal(model.getMoveMinutes(move(), { distance: 1 }, 1), null);
    assert.equal(model.getMoveMinutes(move(), { distance: 1, duration: NaN }, 1), null);
});

test('依一天的資料取綁定路段：getMoveMinutesAt', () => {
    const day = { day: 1, trafficFactor: 1, items: [spot('a', '09:00 - 10:00'), move('10:00 - 10:20', { buffer: 5 }), spot('b', '10:20 - 11:00')] };
    const routes = routesOf([['a', 'b', 1800]]);
    assert.equal(model.getMoveMinutesAt(day, 1, P, routes, undefined), 35);
    assert.equal(model.getMoveMinutesAt(day, 1, P, undefined, undefined), null);   // 沒有快取
    assert.equal(model.getMoveMinutesAt(day, 0, P, routes, undefined), null);      // 不是移動列
});

test('沒有綁定路段（兩標記之間有兩個移動列）回 null', () => {
    const day = { day: 1, trafficFactor: 1, items: [spot('a', '09:00 - 10:00'), move('10:00 - 10:10'), move('10:10 - 10:20'), spot('b', '10:20 - 11:00')] };
    assert.equal(model.getMoveMinutesAt(day, 1, P, routesOf([['a', 'b', 1800]]), undefined), null);
});

// ───────── 連動 ─────────

const dayOf = () => ({ day: 1, items: [
    spot('a', '09:00 - 10:00'), move('10:00 - 10:30'),
    spot('b', '10:30 - 11:30 午餐'), move('11:30 - 12:00'),
    spot('c', '12:00 - 13:00')
] });

test('改結束 +15：後面整段平移、停留與移動長度不變、前面不動、說明文字保留', () => {
    const day = dayOf();
    day.items[0].time = '09:00 - 10:15';   // 使用者改了第 0 項的結束
    const r = model.cascadeDay(day, 0, 15);
    assert.deepEqual(times(day), ['09:00 - 10:15', '10:15 - 10:45', '10:45 - 11:45 午餐', '11:45 - 12:15', '12:15 - 13:15']);
    assert.deepEqual(r.changed.map(c => c.index), [1, 2, 3, 4]);
    assert.deepEqual(r.changed[0], { index: 1, from: '10:00 - 10:30', to: '10:15 - 10:45' });
});

test('負變化量：往前平移', () => {
    const day = dayOf();
    day.items[2].time = '10:30 - 11:00 午餐';
    model.cascadeDay(day, 2, -30);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:00 午餐', '11:00 - 11:30', '11:30 - 12:30']);
});

test('只動被改項目之後的項目', () => {
    const day = dayOf();
    model.cascadeDay(day, 3, 10);
    assert.deepEqual(times(day).slice(0, 4), ['09:00 - 10:00', '10:00 - 10:30', '10:30 - 11:30 午餐', '11:30 - 12:00']);
    assert.equal(day.items[4].time, '12:10 - 13:10');
});

test('不完整時間的項目不動，其後的完整時間照樣平移', () => {
    const day = dayOf();
    day.items.splice(3, 0, { type: 'stay', title: '住', time: '15:30 後' }, { type: 'notice', title: '提醒' });
    model.cascadeDay(day, 0, 10);
    assert.equal(day.items[3].time, '15:30 後');
    assert.equal('time' in day.items[4], false);
    assert.deepEqual([day.items[1].time, day.items[5].time, day.items[6].time], ['10:10 - 10:40', '11:40 - 12:10', '12:10 - 13:10']);
});

test('擇一組視為同一站：共用時間框只平移一次，成員沒有 time', () => {
    const day = { day: 1, items: [
        spot('a', '09:00 - 10:00'), move('10:00 - 10:20'),
        spot('b', '10:20 - 11:20', { alt: 'g' }), spot('c', undefined, { alt: 'g' }),
        move('11:20 - 11:40'), spot('d', '11:40 - 12:30')
    ] };
    const r = model.cascadeDay(day, 0, 20);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:20 - 10:40', '10:40 - 11:40', undefined, '11:40 - 12:00', '12:00 - 12:50']);
    assert.equal(day.items[3].time, undefined);
    assert.deepEqual(r.changed.map(c => c.index), [1, 2, 4, 5]);
});

test('被改項目在擇一組內：從組之後開始平移，組的共用時間框不動', () => {
    const day = { day: 1, items: [
        spot('a', '09:00 - 10:00'), move('10:00 - 10:20'),
        spot('b', '10:20 - 11:20', { alt: 'g' }), spot('c', undefined, { alt: 'g' }),
        move('11:20 - 11:40'), spot('d', '11:40 - 12:30')
    ] };
    model.cascadeDay(day, 3, 10);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:20', '10:20 - 11:20', undefined, '11:30 - 11:50', '11:50 - 12:40']);
});

test('變化量 0 不改任何東西；跨午夜或結束 ≤ 開始的時間不動', () => {
    const day = dayOf();
    day.items[3].time = '23:30 - 00:10';
    day.items[4].time = '13:00 - 12:00';
    const before = JSON.stringify(day);
    assert.deepEqual(model.cascadeDay(day, 0, 0).changed, []);
    assert.equal(JSON.stringify(day), before);
    model.cascadeDay(day, 0, 5);
    assert.equal(day.items[3].time, '23:30 - 00:10');
    assert.equal(day.items[4].time, '13:00 - 12:00');
    assert.equal(day.items[1].time, '10:05 - 10:35');
});

test('平移後超出當天（00:00–23:59）的項目不動並警告', () => {
    const day = { day: 1, items: [spot('a', '08:00 - 09:00'), move('09:00 - 09:30'), spot('b', '23:00 - 23:50')] };
    const r = model.cascadeDay(day, 0, 20);
    assert.equal(day.items[1].time, '09:20 - 09:50');
    assert.equal(day.items[2].time, '23:00 - 23:50');
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0].index, 2);
});

// ───────── 整天重排 ─────────

test('整天重排：起點是第一個完整時間的開始，停留不變，移動列用查詢 + buffer', () => {
    const day = { day: 1, trafficFactor: 1, items: [
        { type: 'brief', title: '開場' },
        spot('a', '09:00 - 10:00'), move('10:00 - 10:10', { buffer: 5 }),
        spot('b', '10:45 - 11:45 午餐'), move('11:45 - 12:00'),
        spot('c', '12:30 - 13:00')
    ] };
    const routes = routesOf([['a', 'b', 1800], ['b', 'c', 1200]]);
    const r = model.rescheduleDay(day, P, routes, undefined);
    assert.deepEqual(times(day), [undefined, '09:00 - 10:00', '10:00 - 10:35', '10:35 - 11:35 午餐', '11:35 - 11:55', '11:55 - 12:25']);
    assert.deepEqual(r.changed.map(c => c.index), [2, 3, 4, 5]);
    assert.deepEqual(r.warnings, []);
});

test('整天重排：沒有查詢結果的移動列沿用現有長度並警告', () => {
    const day = { day: 1, trafficFactor: 1, items: [spot('a', '09:00 - 10:00'), move('10:00 - 10:20'), spot('b', '11:00 - 12:00')] };
    const r = model.rescheduleDay(day, P, undefined, undefined);
    assert.deepEqual(times(day), ['09:00 - 10:00', '10:00 - 10:20', '10:20 - 11:20']);
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0].type, 'no-route');
    assert.equal(r.warnings[0].index, 1);
});

test('整天重排：不完整時間的項目不動、不佔時間；擇一組共用時間框', () => {
    const day = { day: 1, trafficFactor: 1, items: [
        spot('a', '09:00 - 10:00'), move('10:00 - 10:20'),
        spot('b', '10:30 - 11:30', { alt: 'g' }), spot('c', undefined, { alt: 'g' }),
        move('11:40 - 12:00'), { type: 'stay', title: '住', time: '15:30 後' }
    ] };
    const routes = routesOf([['a', 'b', 600], ['a', 'c', 600], ['c', 'd', 600]]);
    day.items.splice(5, 0, spot('d', undefined, { map: false }));   // 不在地圖上，不影響站
    model.rescheduleDay(day, P, routes, undefined);
    assert.equal(day.items[1].time, '10:00 - 10:10');
    assert.equal(day.items[2].time, '10:10 - 11:10');
    assert.equal(day.items[3].time, undefined);
    assert.equal(day.items[4].time, '11:10 - 11:30');   // 沒有綁定查詢（後面沒有標記）→ 沿用 20 分長度
    assert.equal(day.items[6].time, '15:30 後');
});

test('整天重排可重複執行：再跑一次不變', () => {
    const day = { day: 1, trafficFactor: 1, items: [spot('a', '9:00-10:00'), move('10:00 - 10:10'), spot('b', '10:45 - 11:45 午餐')] };
    const routes = routesOf([['a', 'b', 1800]]);
    const first = model.rescheduleDay(day, P, routes, undefined);
    assert.ok(first.changed.length > 0);
    const snapshot = JSON.stringify(day);
    assert.deepEqual(model.rescheduleDay(day, P, routes, undefined).changed, []);
    assert.equal(JSON.stringify(day), snapshot);
});

test('整天重排：沒有完整時間的一天不動', () => {
    const day = { day: 1, items: [spot('a'), move(), spot('b', '15:30 後')] };
    assert.deepEqual(model.rescheduleDay(day, P, undefined, undefined), { changed: [], warnings: [] });
});
